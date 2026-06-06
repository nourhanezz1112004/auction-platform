# ai-service/app/routes/relist.py
# Re-listing optimiser — when an auction closes without meeting reserve,
# analyses why and gives specific data-backed recommendations:
# lower reserve by X%, relist on a better day, improve photos, etc.

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import os, psycopg2, httpx, json

router = APIRouter(prefix="/relist", tags=["relist"])
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL  = "claude-sonnet-4-20250514"
DOW           = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


class RelistRequest(BaseModel):
    auction_id: str


class RelistRecommendation(BaseModel):
    auction_title: str
    original_reserve: float
    highest_bid: float
    reserve_gap_pct: float           # how far off reserve was the top bid
    suggested_reserve: float         # data-backed new reserve price
    suggested_reserve_reasoning: str
    best_day: str
    best_hour_label: str
    comparable_sold_avg: Optional[float]
    comparable_sold_count: int
    photo_tip: str
    title_tip: str
    overall_tip: str                  # Claude narrative combining all signals
    estimated_success_chance: str     # low | medium | high


@router.post("/optimise", response_model=RelistRecommendation)
async def optimise_relist(req: RelistRequest):
    """
    Reads real closed auction data to give specific, numbers-backed relist advice.
    """
    conn = get_conn()
    try:
        cur = conn.cursor()

        # Original auction details
        cur.execute("""
            SELECT a.title, a."reservePrice", a.category, a.condition,
                   a."endTime", a."imageUrls", a.description,
                   COUNT(b.id) AS bid_count,
                   MAX(b.amount) AS highest_bid,
                   EXTRACT(DOW FROM a."endTime")::int AS dow,
                   EXTRACT(HOUR FROM a."endTime")::int AS end_hour
            FROM "Auction" a
            LEFT JOIN "Bid" b ON b."auctionId" = a.id
            WHERE a.id = %s
            GROUP BY a.id
        """, [req.auction_id])
        row = cur.fetchone()
        if not row:
            from fastapi import HTTPException
            raise HTTPException(404, "Auction not found")

        title, reserve, category, condition, end_time, image_urls, description, \
            bid_count, highest_bid, dow, end_hour = row

        reserve      = float(reserve)
        highest_bid  = float(highest_bid) if highest_bid else 0
        gap_pct      = round((reserve - highest_bid) / reserve * 100, 1) if highest_bid else 100

        # Comparable sold auctions in same category + similar condition
        cur.execute("""
            SELECT AVG(b2.max_bid) AS avg_sold, COUNT(*) AS sold_count,
                   PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY b2.max_bid) AS p25,
                   PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY b2.max_bid) AS p75
            FROM "Auction" a
            LEFT JOIN LATERAL (SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId"=a.id) b2 ON true
            WHERE a.category = %s
              AND a.condition = %s
              AND a.status = 'CLOSED'
              AND b2.max_bid IS NOT NULL
              AND a.id != %s
              AND a."endTime" >= NOW() - INTERVAL '90 days'
        """, [category, condition, req.auction_id])
        comp = cur.fetchone()
        comp_avg    = float(comp[0]) if comp and comp[0] else None
        comp_count  = int(comp[1]) if comp and comp[1] else 0
        comp_p25    = float(comp[2]) if comp and comp[2] else None
        comp_p75    = float(comp[3]) if comp and comp[3] else None

        # Best day/hour for this category from real data
        cur.execute("""
            SELECT EXTRACT(DOW FROM a."endTime")::int AS d,
                   EXTRACT(HOUR FROM a."endTime")::int AS h,
                   AVG(b2.max_bid / NULLIF(a."reservePrice",0)) AS ratio
            FROM "Auction" a
            LEFT JOIN LATERAL (SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId"=a.id) b2 ON true
            WHERE a.category = %s AND a.status='CLOSED'
              AND b2.max_bid IS NOT NULL
              AND a."endTime" >= NOW() - INTERVAL '180 days'
            GROUP BY 1, 2 HAVING COUNT(*) >= 2
            ORDER BY ratio DESC LIMIT 1
        """, [category])
        timing = cur.fetchone()
        best_day   = DOW[int(timing[0])] if timing else "Sunday"
        best_hour  = int(timing[1]) if timing else 20
        hour_label = f"{best_hour % 12 or 12} {'AM' if best_hour < 12 else 'PM'}"

    finally:
        conn.close()

    # Data-backed reserve recommendation
    if comp_avg and comp_p25:
        # Suggest 10th percentile of comparables — maximises chance of meeting reserve
        suggested_reserve = round(comp_p25 * 0.95, -1)  # round to nearest 10
        reserve_reasoning = (
            f"Based on {comp_count} comparable {category} ({condition}) auctions, "
            f"25% sold for under ${comp_p25:,.0f}. "
            f"Setting reserve at ${suggested_reserve:,.0f} gives a strong chance of meeting it."
        )
    elif highest_bid > 0:
        # Use the highest bid as a market signal
        suggested_reserve = round(highest_bid * 1.05, -1)
        reserve_reasoning = (
            f"The highest bid was ${highest_bid:,.0f} — the market validated that price. "
            f"Setting reserve at ${suggested_reserve:,.0f} (5% above) should attract committed bidders."
        )
    else:
        suggested_reserve = round(reserve * 0.80, -1)
        reserve_reasoning = "No bidders reached your reserve — consider reducing it by 20% to attract initial interest."

    # Success chance estimate
    if gap_pct < 10:
        success_chance = "high"
    elif gap_pct < 30:
        success_chance = "medium"
    else:
        success_chance = "low"

    # Photo tip
    image_count = len(image_urls) if image_urls else 0
    photo_tip = (
        "Add more photos showing different angles, close-ups of serial numbers/hallmarks, and any wear."
        if image_count < 4
        else "Consider retaking photos with better lighting — natural light on a neutral background improves final prices by up to 20%."
    )

    # Title tip
    title_tip = (
        "Your title is short — add the brand, model number, year, and condition. "
        "Specific titles get 3x more views."
        if len(title) < 40
        else "Title looks good — make sure key search terms (brand, model, era) appear early."
    )

    # Claude narrative
    overall_tip = (
        f"Lower your reserve to ${suggested_reserve:,.0f}, relist closing on {best_day} at {hour_label}, "
        f"and improve your photos. {comp_count} similar items sold for an average of "
        f"${comp_avg:,.0f}." if comp_avg else
        f"Lower reserve to ${suggested_reserve:,.0f} and relist on {best_day} at {hour_label} for better results."
    )

    if ANTHROPIC_KEY and comp_avg:
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": ANTHROPIC_KEY,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": CLAUDE_MODEL, "max_tokens": 120,
                        "messages": [{"role": "user", "content":
                            f"Write 2 concise sentences of relist advice for an auction seller. "
                            f"Item: {title} | Category: {category} | Reserve was ${reserve:,.0f} but highest bid was ${highest_bid:,.0f} ({gap_pct:.0f}% gap). "
                            f"Comparables avg: ${comp_avg:,.0f} ({comp_count} sold). "
                            f"Suggest reserve ${suggested_reserve:,.0f}, relist {best_day} {hour_label}. "
                            f"Be specific and encouraging. No markdown."
                        }],
                    },
                )
            if resp.status_code == 200:
                overall_tip = resp.json()["content"][0]["text"].strip()
        except Exception:
            pass

    return RelistRecommendation(
        auction_title=title,
        original_reserve=reserve,
        highest_bid=highest_bid,
        reserve_gap_pct=gap_pct,
        suggested_reserve=suggested_reserve,
        suggested_reserve_reasoning=reserve_reasoning,
        best_day=best_day,
        best_hour_label=hour_label,
        comparable_sold_avg=round(comp_avg, 2) if comp_avg else None,
        comparable_sold_count=comp_count,
        photo_tip=photo_tip,
        title_tip=title_tip,
        overall_tip=overall_tip,
        estimated_success_chance=success_chance,
    )
