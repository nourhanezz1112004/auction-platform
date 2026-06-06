# ai-service/app/routes/timing.py
# Two features:
#   1. Optimal end-time predictor — tells sellers when to schedule auction close for max price
#   2. Smart outbid notification copy generator — contextual, not just "You were outbid"

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional
import os, psycopg2, httpx, json
import numpy as np
from ..services.model_store import model_store

router = APIRouter(prefix="/timing", tags=["timing"])
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CATEGORIES = ["watches","cameras","art","jewelry","electronics","other"]
DOW_NAMES  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


# ── 1. Optimal end-time predictor ────────────────────────────────────────────

class OptimalTimeRequest(BaseModel):
    category: str
    condition: str
    starting_price: float
    reserve_price: float
    seller_id: Optional[str] = None


class OptimalTimeResponse(BaseModel):
    best_day_of_week: str           # e.g. "Sunday"
    best_hour: int                  # 0-23
    best_hour_label: str            # e.g. "8 PM"
    estimated_premium_pct: float    # % above reserve if timed correctly
    second_best_day: str
    reasoning: str
    data_points: int                # how many auctions this is based on


@router.post("/optimal-end-time", response_model=OptimalTimeResponse)
def optimal_end_time(req: OptimalTimeRequest):
    """
    Analyses your real closed auction data to find the best day/hour
    to close an auction for maximum final price in this category.
    """
    conn = get_conn()
    try:
        cur = conn.cursor()

        # Query real data: avg final price by day+hour for this category
        cur.execute("""
            SELECT
                EXTRACT(DOW FROM a."endTime")::int   AS dow,
                EXTRACT(HOUR FROM a."endTime")::int  AS hour,
                AVG(b.max_bid)                        AS avg_final,
                AVG(b.max_bid / NULLIF(a."reservePrice", 0)) AS vs_reserve,
                COUNT(*)::int                         AS auction_count
            FROM "Auction" a
            LEFT JOIN LATERAL (
                SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId" = a.id
            ) b ON true
            WHERE a.category = %s
              AND a.status = 'CLOSED'
              AND b.max_bid IS NOT NULL
              AND a."endTime" >= NOW() - INTERVAL '180 days'
            GROUP BY EXTRACT(DOW FROM a."endTime"), EXTRACT(HOUR FROM a."endTime")
            HAVING COUNT(*) >= 2
            ORDER BY avg_final DESC
        """, [req.category])

        rows = cur.fetchall()

        if not rows:
            # Not enough category data — use global best times
            cur.execute("""
                SELECT
                    EXTRACT(DOW FROM a."endTime")::int  AS dow,
                    EXTRACT(HOUR FROM a."endTime")::int AS hour,
                    AVG(b.max_bid / NULLIF(a."reservePrice", 0)) AS vs_reserve,
                    COUNT(*)::int AS cnt
                FROM "Auction" a
                LEFT JOIN LATERAL (
                    SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId" = a.id
                ) b ON true
                WHERE a.status = 'CLOSED' AND b.max_bid IS NOT NULL
                GROUP BY 1, 2 HAVING COUNT(*) >= 5
                ORDER BY vs_reserve DESC LIMIT 20
            """)
            rows = [(r[0], r[1], None, r[2], r[3]) for r in cur.fetchall()]

    finally:
        conn.close()

    if not rows:
        return OptimalTimeResponse(
            best_day_of_week="Sunday", best_hour=20,
            best_hour_label="8 PM", estimated_premium_pct=0,
            second_best_day="Thursday",
            reasoning="Not enough auction data yet — Sunday 8 PM is the general industry best practice.",
            data_points=0,
        )

    best = rows[0]
    second = rows[1] if len(rows) > 1 else rows[0]

    best_dow   = int(best[0])
    best_hour  = int(best[1])
    vs_reserve = float(best[3] or 1) - 1
    data_pts   = sum(r[4] for r in rows)

    hour_label = f"{best_hour % 12 or 12} {'AM' if best_hour < 12 else 'PM'}"

    reasoning = (
        f"Based on {data_pts} closed {req.category} auctions, "
        f"{DOW_NAMES[best_dow]} at {hour_label} yields {vs_reserve*100:.1f}% above reserve on average. "
        f"Bidders in this category are most active then."
    )

    return OptimalTimeResponse(
        best_day_of_week=DOW_NAMES[best_dow],
        best_hour=best_hour,
        best_hour_label=hour_label,
        estimated_premium_pct=round(vs_reserve * 100, 1),
        second_best_day=DOW_NAMES[int(second[0])],
        reasoning=reasoning,
        data_points=data_pts,
    )


# ── 2. Smart outbid notification generator ────────────────────────────────────

class OutbidNotifRequest(BaseModel):
    user_id: str
    auction_id: str
    auction_title: str
    their_bid: float
    new_high_bid: float
    seconds_remaining: float
    watcher_count: int = 0
    bid_count: int = 0
    category: str = "other"


class OutbidNotifResponse(BaseModel):
    title: str
    body: str
    cta: str              # call-to-action button label
    urgency: str          # low | medium | high | critical


@router.post("/outbid-notification", response_model=OutbidNotifResponse)
async def outbid_notification(req: OutbidNotifRequest):
    """
    Generates contextual outbid push notification copy.
    "You were outbid by $10 — 4 people watching, 8 minutes left. Bid now?"
    instead of the generic "You have been outbid."
    """
    gap = req.new_high_bid - req.their_bid
    hours_left = req.seconds_remaining / 3600

    # Determine urgency
    if req.seconds_remaining < 120:
        urgency = "critical"
    elif req.seconds_remaining < 600:
        urgency = "high"
    elif req.seconds_remaining < 3600:
        urgency = "medium"
    else:
        urgency = "low"

    # Fallback heuristic copy (used if no API key)
    time_str = (
        f"{int(req.seconds_remaining)}s" if req.seconds_remaining < 120
        else f"{int(req.seconds_remaining // 60)}m" if req.seconds_remaining < 3600
        else f"{hours_left:.1f}h"
    )
    fallback_body = (
        f"Outbid by ${gap:.0f} on '{req.auction_title}'. "
        f"{req.watcher_count} watching · {time_str} left. "
        f"Current: ${req.new_high_bid:,.0f}"
    )
    fallback_cta = "Bid now" if urgency in ("critical", "high") else "See auction"

    if not ANTHROPIC_KEY:
        return OutbidNotifResponse(
            title="You were outbid!", body=fallback_body,
            cta=fallback_cta, urgency=urgency,
        )

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": CLAUDE_MODEL if "CLAUDE_MODEL" in dir() else "claude-sonnet-4-20250514",
                    "max_tokens": 150,
                    "messages": [{"role": "user", "content": f"""Write a short mobile push notification for an outbid event.
Respond ONLY with JSON: {{"title": "...", "body": "...", "cta": "..."}}
Facts: item="{req.auction_title}" | outbid by ${gap:.0f} | {req.watcher_count} watching | {time_str} left | {req.bid_count} bids | current price ${req.new_high_bid:,.0f}
Rules: title max 40 chars, body max 80 chars, cta max 15 chars. Be urgent but not spammy. No emoji in title."""}],
                },
            )
        if resp.status_code == 200:
            raw = resp.json()["content"][0]["text"].strip()
            parsed = json.loads(raw)
            return OutbidNotifResponse(
                title=parsed.get("title", "You were outbid!"),
                body=parsed.get("body", fallback_body),
                cta=parsed.get("cta", fallback_cta),
                urgency=urgency,
            )
    except Exception:
        pass

    return OutbidNotifResponse(
        title="You were outbid!", body=fallback_body,
        cta=fallback_cta, urgency=urgency,
    )
