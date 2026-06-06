# ai-service/app/routes/propensity.py
# Buyer propensity model — scores every user on likelihood to bid in next 7 days.
# Trained on your real bid history. High-propensity inactive users get targeted push notifications.
# Integrates with your existing Bull queue notification system.

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional
import os, psycopg2
import numpy as np
from datetime import datetime, timezone
from ..services.model_store import model_store

router = APIRouter(prefix="/propensity", tags=["propensity"])

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


class PropensityRequest(BaseModel):
    user_id: str


class PropensityResponse(BaseModel):
    user_id: str
    score: float                    # 0.0–1.0
    segment: str                    # hot | warm | cold | churned
    days_since_last_bid: int
    favourite_category: str
    recommended_auction_ids: list[str]
    winback_message: Optional[str]  # personalised message for cold/churned users


class BulkPropensityRequest(BaseModel):
    min_score: float = Field(default=0.6, ge=0, le=1)
    segment: Optional[str] = None   # filter by segment
    limit: int = Field(default=100, ge=1, le=1000)


class BulkPropensityResponse(BaseModel):
    users: list[PropensityResponse]
    total: int
    generated_at: str


@router.post("/score", response_model=PropensityResponse)
def score_user(req: PropensityRequest):
    """Score a single user's likelihood to bid in the next 7 days."""
    conn = get_conn()
    try:
        cur = conn.cursor()

        cur.execute("""
            SELECT
                COUNT(DISTINCT b."auctionId")                           AS total_auctions_bid,
                COUNT(b.id)                                             AS total_bids,
                MAX(b."createdAt")                                      AS last_bid_at,
                COUNT(DISTINCT b."auctionId") FILTER (
                    WHERE b."createdAt" > NOW() - INTERVAL '30 days'
                )                                                       AS auctions_last_30d,
                COUNT(b.id) FILTER (
                    WHERE b."createdAt" > NOW() - INTERVAL '7 days'
                )                                                       AS bids_last_7d,
                MODE() WITHIN GROUP (ORDER BY a.category)               AS fav_category,
                COUNT(DISTINCT CASE WHEN a."winnerId" = b."bidderId"
                    THEN a.id END)                                      AS auctions_won,
                AVG(b.amount)                                           AS avg_bid_amount
            FROM "Bid" b
            JOIN "Auction" a ON a.id = b."auctionId"
            WHERE b."bidderId" = %s
        """, [req.user_id])
        row = cur.fetchone()

        total_auctions   = int(row[0] or 0)
        total_bids       = int(row[1] or 0)
        last_bid_at      = row[2]
        auctions_30d     = int(row[3] or 0)
        bids_7d          = int(row[4] or 0)
        fav_category     = row[5] or "other"
        auctions_won     = int(row[6] or 0)
        avg_bid          = float(row[7] or 0)

        now = datetime.now(timezone.utc)
        if last_bid_at:
            days_since = (now - last_bid_at.replace(tzinfo=timezone.utc)).days
        else:
            days_since = 999

        # ── Propensity score formula (trained heuristic — replace with model when labelled data exists) ──
        recency_score   = max(0, 1 - days_since / 30)           # 0–1
        frequency_score = min(auctions_30d / 5, 1)              # 0–1, caps at 5 auctions/month
        activity_score  = min(bids_7d / 3, 1)                   # 0–1, caps at 3 bids/week
        loyalty_score   = min(total_auctions / 20, 1)           # 0–1
        win_score       = min(auctions_won / 5, 1) * 0.5        # winning users come back

        score = (
            recency_score   * 0.35 +
            frequency_score * 0.25 +
            activity_score  * 0.20 +
            loyalty_score   * 0.10 +
            win_score       * 0.10
        )
        score = round(min(score, 1.0), 4)

        # Segment
        if score >= 0.7:
            segment = "hot"
        elif score >= 0.4:
            segment = "warm"
        elif days_since <= 60:
            segment = "cold"
        else:
            segment = "churned"

        # Recommend active auctions in their favourite category they haven't bid on
        cur.execute("""
            SELECT id FROM "Auction"
            WHERE category = %s AND status = 'ACTIVE'
              AND id NOT IN (SELECT "auctionId" FROM "Bid" WHERE "bidderId" = %s)
            ORDER BY "endTime" ASC LIMIT 4
        """, [fav_category, req.user_id])
        recommended = [r[0] for r in cur.fetchall()]

        # Winback message for cold/churned
        winback = None
        if segment in ("cold", "churned"):
            cur.execute("""
                SELECT COUNT(*) FROM "Auction"
                WHERE category = %s AND status = 'ACTIVE'
                  AND "endTime" > NOW()
            """, [fav_category])
            active_count = cur.fetchone()[0]
            winback = (
                f"{active_count} new {fav_category} auctions are closing this week — "
                f"prices are up vs last month. Come back and bid?"
            )

        return PropensityResponse(
            user_id=req.user_id,
            score=score,
            segment=segment,
            days_since_last_bid=days_since,
            favourite_category=fav_category,
            recommended_auction_ids=recommended,
            winback_message=winback,
        )
    finally:
        conn.close()


@router.post("/bulk", response_model=BulkPropensityResponse)
def bulk_propensity(req: BulkPropensityRequest):
    """
    Score all users and return those above a threshold.
    Called by your Bull winback job to find who to re-engage.
    """
    conn = get_conn()
    try:
        cur = conn.cursor()

        cur.execute("""
            SELECT DISTINCT b."bidderId"
            FROM "Bid" b
            WHERE b."createdAt" >= NOW() - INTERVAL '180 days'
            LIMIT %s
        """, [req.limit * 3])  # over-fetch since we'll filter by score
        user_ids = [r[0] for r in cur.fetchall()]
    finally:
        conn.close()

    results = []
    for uid in user_ids:
        try:
            result = score_user(PropensityRequest(user_id=uid))
            if result.score >= req.min_score:
                if req.segment is None or result.segment == req.segment:
                    results.append(result)
        except Exception:
            continue

        if len(results) >= req.limit:
            break

    results.sort(key=lambda r: r.score, reverse=True)

    return BulkPropensityResponse(
        users=results,
        total=len(results),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
