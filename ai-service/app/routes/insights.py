# ai-service/app/routes/insights.py
# Seller + buyer AI insights from real production data.
# Uses Claude claude-sonnet-4-20250514 to narrate the statistics in Arabic/English.
# Reads directly from your PostgreSQL with 10k+ bids.

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional
import os, psycopg2, httpx

router = APIRouter(prefix="/insights", tags=["insights"])
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-20250514"


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

DOW = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]


# ── Seller insights ───────────────────────────────────────────────────────────

class SellerInsightsRequest(BaseModel):
    seller_id: str
    period_days: int = Field(default=30, ge=7, le=365)
    language: str = "en"   # "en" or "ar"


class SellerInsightsResponse(BaseModel):
    total_gmv: float
    closed_auctions: int
    avg_vs_reserve_pct: float
    reserve_met_rate_pct: float
    best_day: str
    best_hour: str
    top_category: str
    top_category_premium_pct: float
    weekly_trend: list[dict]
    narrative: str
    tips: list[str]


@router.post("/seller", response_model=SellerInsightsResponse)
async def seller_insights(req: SellerInsightsRequest):
    conn = get_conn()
    try:
        cur = conn.cursor()
        since = f"NOW() - INTERVAL '{req.period_days} days'"

        # Core stats
        cur.execute(f"""
            SELECT
                COALESCE(SUM(b.max_bid), 0) AS gmv,
                COUNT(*) FILTER (WHERE a.status = 'CLOSED') AS closed,
                COALESCE(AVG(b.max_bid / NULLIF(a."reservePrice",0)), 1) AS vs_reserve,
                COALESCE(
                  COUNT(*) FILTER (WHERE b.max_bid >= a."reservePrice" AND a.status='CLOSED')::float /
                  NULLIF(COUNT(*) FILTER (WHERE a.status='CLOSED'),0), 0
                ) AS reserve_rate
            FROM "Auction" a
            LEFT JOIN LATERAL (
                SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId" = a.id
            ) b ON true
            WHERE a."sellerId" = %s AND a."createdAt" >= {since}
        """, [req.seller_id])
        stats = cur.fetchone()
        gmv = round(float(stats[0]), 2)
        closed = int(stats[1])
        vs_reserve_pct = round((float(stats[2]) - 1) * 100, 1)
        reserve_rate_pct = round(float(stats[3]) * 100, 1)

        # Best day
        cur.execute(f"""
            SELECT EXTRACT(DOW FROM a."endTime")::int, AVG(b.max_bid)
            FROM "Auction" a
            LEFT JOIN LATERAL (SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId"=a.id) b ON true
            WHERE a."sellerId"=%s AND a.status='CLOSED' AND a."createdAt">={since}
            GROUP BY 1 ORDER BY 2 DESC LIMIT 1
        """, [req.seller_id])
        day_row = cur.fetchone()
        best_day = DOW[day_row[0]] if day_row else "N/A"

        # Best hour
        cur.execute(f"""
            SELECT EXTRACT(HOUR FROM a."endTime")::int, AVG(b.max_bid)
            FROM "Auction" a
            LEFT JOIN LATERAL (SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId"=a.id) b ON true
            WHERE a."sellerId"=%s AND a.status='CLOSED' AND a."createdAt">={since}
            GROUP BY 1 ORDER BY 2 DESC LIMIT 1
        """, [req.seller_id])
        hour_row = cur.fetchone()
        best_hour = f"{hour_row[0]}:00" if hour_row else "N/A"

        # Top category
        cur.execute(f"""
            SELECT a.category,
                   AVG(b.max_bid / NULLIF(a."reservePrice",0)) AS cat_vs_reserve
            FROM "Auction" a
            LEFT JOIN LATERAL (SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId"=a.id) b ON true
            WHERE a."sellerId"=%s AND a."createdAt">={since}
            GROUP BY a.category ORDER BY cat_vs_reserve DESC LIMIT 1
        """, [req.seller_id])
        cat_row = cur.fetchone()
        top_category = cat_row[0] if cat_row else "N/A"
        top_cat_premium_pct = round((float(cat_row[1]) - 1) * 100, 1) if cat_row else 0

        # Weekly GMV trend (last 8 weeks)
        cur.execute("""
            SELECT TO_CHAR(DATE_TRUNC('week', a."endTime"),'YYYY-MM-DD') AS wk,
                   COALESCE(SUM(b.max_bid),0) AS gmv, COUNT(*)::int AS cnt
            FROM "Auction" a
            LEFT JOIN LATERAL (SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId"=a.id) b ON true
            WHERE a."sellerId"=%s AND a.status='CLOSED' AND a."endTime" >= NOW()-INTERVAL '8 weeks'
            GROUP BY DATE_TRUNC('week', a."endTime") ORDER BY wk
        """, [req.seller_id])
        weekly = [{"week": r[0], "gmv": round(float(r[1]),2), "count": r[2]} for r in cur.fetchall()]

    finally:
        conn.close()

    # Generate tips based on data
    tips = []
    if vs_reserve_pct < 0:
        tips.append("Your auctions close below reserve — consider lowering your reserve price by 10-15%")
    if best_day != "N/A":
        tips.append(f"Schedule auction closes on {best_day} at {best_hour} for best results")
    if top_category != "N/A":
        tips.append(f"Your {top_category} listings outperform others — consider listing more")
    if reserve_rate_pct < 60:
        tips.append("Less than 60% of your auctions meet reserve — your reserves may be set too high")

    # AI narrative
    narrative = _fallback_narrative(gmv, vs_reserve_pct, reserve_rate_pct, best_day, best_hour, top_category, req.language)
    if ANTHROPIC_KEY:
        try:
            lang_instruction = "Respond in Arabic (formal Egyptian Arabic, اللغة العربية الفصحى)" if req.language == "ar" else "Respond in English"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={
                        "model": CLAUDE_MODEL, "max_tokens": 250,
                        "messages": [{"role": "user", "content": f"""Write a 2-sentence seller performance summary for a premium auction house. {lang_instruction}.
Stats: GMV ${gmv:,.0f} | Avg vs reserve: {vs_reserve_pct:+.1f}% | Reserve met: {reserve_rate_pct:.0f}% | Best day: {best_day} {best_hour} | Top category: {top_category}. Be specific and encouraging. No markdown."""}],
                    },
                )
                if resp.status_code == 200:
                    narrative = resp.json()["content"][0]["text"]
        except Exception:
            pass

    return SellerInsightsResponse(
        total_gmv=gmv, closed_auctions=closed,
        avg_vs_reserve_pct=vs_reserve_pct, reserve_met_rate_pct=reserve_rate_pct,
        best_day=best_day, best_hour=best_hour,
        top_category=top_category, top_category_premium_pct=top_cat_premium_pct,
        weekly_trend=weekly, narrative=narrative, tips=tips,
    )


# ── Buyer insights ────────────────────────────────────────────────────────────

class BuyerInsightsRequest(BaseModel):
    buyer_id: str
    period_days: int = Field(default=30, ge=7, le=365)


class BuyerInsightsResponse(BaseModel):
    total_bids: int
    auctions_won: int
    win_rate_pct: float
    total_spend: float
    avg_overpaid_pct: float    # vs reserve price (how much above reserve they paid)
    favourite_category: str
    recommended_auctions: list[str]   # auction IDs
    propensity_score: float            # 0-1: likelihood to bid in next 7 days
    narrative: str


@router.post("/buyer", response_model=BuyerInsightsResponse)
async def buyer_insights(req: BuyerInsightsRequest):
    conn = get_conn()
    try:
        cur = conn.cursor()

        cur.execute("""
            SELECT
                COUNT(DISTINCT b."auctionId") AS auctions_bid_on,
                COUNT(DISTINCT CASE WHEN a.status='CLOSED' AND a."winnerId"=%s THEN a.id END) AS won,
                COALESCE(SUM(CASE WHEN a."winnerId"=%s THEN b.amount END), 0) AS spend,
                COALESCE(AVG(CASE WHEN a."winnerId"=%s THEN b.amount/NULLIF(a."reservePrice",0) END), 1) AS overpaid,
                MODE() WITHIN GROUP (ORDER BY a.category) AS fav_category,
                MAX(b."createdAt") AS last_bid
            FROM "Bid" b
            JOIN "Auction" a ON a.id = b."auctionId"
            WHERE b."bidderId" = %s
              AND b."createdAt" >= NOW() - INTERVAL '90 days'
        """, [req.buyer_id, req.buyer_id, req.buyer_id, req.buyer_id])
        row = cur.fetchone()
        auctions_bid = int(row[0]) if row[0] else 0
        auctions_won = int(row[1]) if row[1] else 0
        spend = round(float(row[2]), 2)
        overpaid_pct = round((float(row[3]) - 1) * 100, 1)
        fav_category = row[4] or "N/A"

        win_rate = round(auctions_won / max(auctions_bid, 1) * 100, 1)

        # Propensity score: did they bid recently? frequently?
        last_bid = row[5]
        from datetime import datetime, timezone
        days_since_last = (datetime.now(timezone.utc) - last_bid.replace(tzinfo=timezone.utc)).days if last_bid else 999
        propensity = max(0, min(1, 1 - days_since_last / 30)) * 0.6 + (auctions_bid / 10) * 0.4
        propensity = round(min(propensity, 1.0), 3)

        # Recommend similar active auctions in their favourite category
        cur.execute("""
            SELECT id FROM "Auction"
            WHERE category = %s AND status = 'ACTIVE'
              AND id NOT IN (SELECT "auctionId" FROM "Bid" WHERE "bidderId" = %s)
            ORDER BY "endTime" ASC LIMIT 6
        """, [fav_category, req.buyer_id])
        recommended = [r[0] for r in cur.fetchall()]

    finally:
        conn.close()

    narrative = f"You've won {auctions_won} of {auctions_bid} auctions ({win_rate}% win rate) spending ${spend:,.0f} total. Your strongest category is {fav_category}."

    return BuyerInsightsResponse(
        total_bids=auctions_bid, auctions_won=auctions_won,
        win_rate_pct=win_rate, total_spend=spend,
        avg_overpaid_pct=overpaid_pct, favourite_category=fav_category,
        recommended_auctions=recommended,
        propensity_score=propensity, narrative=narrative,
    )


def _fallback_narrative(gmv, vs_reserve, reserve_rate, best_day, best_hour, top_cat, lang):
    if lang == "ar":
        return f"أداء مزاداتك: إجمالي المبيعات ${gmv:,.0f}، {vs_reserve:+.1f}% فوق سعر الاحتياط. أفضل أيام الإغلاق: {best_day}."
    return f"Your auctions generated ${gmv:,.0f} GMV, closing {vs_reserve:+.1f}% vs reserve with {reserve_rate:.0f}% meeting target. Best performance on {best_day} at {best_hour}."
