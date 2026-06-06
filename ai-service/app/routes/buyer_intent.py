# ai-service/app/routes/buyer_intent.py
# ══════════════════════════════════════════════════════════════════════════════
# Buyer Intent & Smart Notifications — 2 features:
#   1. /intent/score      — per-auction buyer intent score (likelihood to bid)
#   2. /intent/ending-soon — finds auctions the user cares about ending soon
#                            for targeted push notifications
# ══════════════════════════════════════════════════════════════════════════════

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional
import os, psycopg2
import numpy as np
from datetime import datetime, timezone

router = APIRouter(prefix="/intent", tags=["buyer-intent"])

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


# ── 1. BUYER INTENT SCORE PER AUCTION ────────────────────────────────────────

class IntentScoreRequest(BaseModel):
    user_id:    str
    auction_id: str

class IntentScoreResponse(BaseModel):
    user_id:          str
    auction_id:       str
    intent_score:     float        # 0–1
    intent_label:     str          # "very_likely" | "likely" | "possible" | "unlikely"
    signals:          list[str]    # positive signals detected
    recommended_max:  Optional[float]  # suggested max bid based on their history
    explanation:      str

@router.post("/score", response_model=IntentScoreResponse)
def intent_score(req: IntentScoreRequest):
    """
    Scores how likely a user is to bid on a specific auction.
    Used to rank listings in the home feed for each user.

    Signals:
    - Watched the auction
    - Bid in same category before
    - Previously bid in this auction
    - Bid in comparable price range
    - Active in last 7 days
    - Win rate in this category
    """
    conn = get_conn()
    try:
        cur = conn.cursor()

        # Get auction info
        cur.execute("""
            SELECT a.category, a."currentPrice", a."reservePrice",
                   a."endTime", a."sellerId"
            FROM "Auction" a WHERE a.id = %s
        """, [req.auction_id])
        row = cur.fetchone()
        if not row:
            return IntentScoreResponse(
                user_id=req.user_id, auction_id=req.auction_id,
                intent_score=0.0, intent_label="unlikely",
                signals=[], recommended_max=None,
                explanation="Auction not found.",
            )

        category, current_price, reserve, end_time, seller_id = row
        current_price = float(current_price or 0)
        reserve = float(reserve or 0)

        signals: list[str] = []
        score = 0.0

        # ── Signal: on watchlist ─────────────────────────────────────────────
        cur.execute("""
            SELECT 1 FROM "Watchlist"
            WHERE "userId" = %s AND "auctionId" = %s
        """, [req.user_id, req.auction_id])
        if cur.fetchone():
            signals.append("on_watchlist")
            score += 0.40

        # ── Signal: already bid in this auction ──────────────────────────────
        cur.execute("""
            SELECT COUNT(*), MAX(amount) FROM "Bid"
            WHERE "bidderId" = %s AND "auctionId" = %s
        """, [req.user_id, req.auction_id])
        row2 = cur.fetchone()
        if row2 and int(row2[0]) > 0:
            signals.append("already_bidding")
            score += 0.35

        # ── Signal: bid in same category ────────────────────────────────────
        cur.execute("""
            SELECT COUNT(DISTINCT b."auctionId"), AVG(b.amount)
            FROM "Bid" b
            JOIN "Auction" a ON a.id = b."auctionId"
            WHERE b."bidderId" = %s AND a.category = %s
              AND b."createdAt" >= NOW() - INTERVAL '60 days'
        """, [req.user_id, category])
        row3 = cur.fetchone()
        cat_bids = int(row3[0] or 0)
        avg_cat_bid = float(row3[1] or 0)
        if cat_bids >= 3:
            signals.append("active_in_category")
            score += 0.20
        elif cat_bids >= 1:
            signals.append("some_category_history")
            score += 0.10

        # ── Signal: price in their typical range ────────────────────────────
        if avg_cat_bid > 0:
            ratio = current_price / avg_cat_bid
            if 0.5 <= ratio <= 2.0:
                signals.append("price_in_range")
                score += 0.15

        # ── Signal: recently active ──────────────────────────────────────────
        cur.execute("""
            SELECT COUNT(*) FROM "Bid"
            WHERE "bidderId" = %s AND "createdAt" >= NOW() - INTERVAL '7 days'
        """, [req.user_id])
        recent_activity = int(cur.fetchone()[0])
        if recent_activity >= 2:
            signals.append("recently_active")
            score += 0.10

        # ── Signal: ending soon (urgency) ────────────────────────────────────
        now = datetime.now(timezone.utc)
        if end_time:
            hours_left = (end_time.replace(tzinfo=timezone.utc) - now).total_seconds() / 3600
            if 0 < hours_left <= 2:
                signals.append("ending_within_2h")
                score += 0.15
            elif 0 < hours_left <= 24:
                signals.append("ending_today")
                score += 0.05

        score = round(min(score, 1.0), 3)

        if score >= 0.70:   intent_label = "very_likely"
        elif score >= 0.45: intent_label = "likely"
        elif score >= 0.20: intent_label = "possible"
        else:               intent_label = "unlikely"

        # Recommend a max bid based on their history in category
        recommended_max = None
        if avg_cat_bid > 0 and score >= 0.30:
            recommended_max = round(avg_cat_bid * 1.15, 2)

        explanation = (
            f"Intent score {score:.0%} for this {category} auction. "
            + (f"Key signals: {', '.join(s.replace('_', ' ') for s in signals[:3])}."
               if signals else "No strong intent signals found.")
        )

        return IntentScoreResponse(
            user_id=req.user_id, auction_id=req.auction_id,
            intent_score=score, intent_label=intent_label,
            signals=signals, recommended_max=recommended_max,
            explanation=explanation,
        )
    finally:
        conn.close()


# ── 2. ENDING SOON SMART NOTIFICATIONS ──────────────────────────────────────

class EndingSoonRequest(BaseModel):
    user_id:          str
    hours_threshold:  float = Field(default=24.0, gt=0, le=72)
    max_auctions:     int   = Field(default=5, ge=1, le=20)

class EndingSoonAuction(BaseModel):
    auction_id:    str
    title:         str
    category:      str
    current_price: float
    hours_left:    float
    intent_score:  float
    is_winning:    bool
    is_watching:   bool
    notification_title:   str
    notification_body:    str
    urgency:       str     # "critical" | "high" | "medium"

class EndingSoonResponse(BaseModel):
    user_id:    str
    auctions:   list[EndingSoonAuction]
    total:      int
    generated_at: str

@router.post("/ending-soon", response_model=EndingSoonResponse)
def ending_soon(req: EndingSoonRequest):
    """
    Finds auctions the user should be notified about before they end.
    Prioritises: currently bidding > watching > category match > high intent.
    Generates personalised notification copy for each.
    """
    conn = get_conn()
    try:
        cur = conn.cursor()

        # Get all active auctions ending within threshold
        cur.execute("""
            SELECT
                a.id,
                a.title,
                a.category,
                a."currentPrice",
                a."endTime",
                a."winnerId",
                -- is user currently highest bidder?
                (a."winnerId" = %s)                                AS is_winning,
                -- is user watching?
                EXISTS(
                    SELECT 1 FROM "Watchlist"
                    WHERE "userId" = %s AND "auctionId" = a.id
                )                                                   AS is_watching,
                -- has user bid?
                EXISTS(
                    SELECT 1 FROM "Bid"
                    WHERE "bidderId" = %s AND "auctionId" = a.id
                )                                                   AS has_bid,
                -- user's category history count
                (
                    SELECT COUNT(*) FROM "Bid" b2
                    JOIN "Auction" a2 ON a2.id = b2."auctionId"
                    WHERE b2."bidderId" = %s AND a2.category = a.category
                )                                                   AS cat_history
            FROM "Auction" a
            WHERE a.status = 'ACTIVE'
              AND a."endTime" BETWEEN NOW() AND NOW() + INTERVAL '%s hours'
            ORDER BY a."endTime" ASC
        """ % req.hours_threshold,
        [req.user_id, req.user_id, req.user_id, req.user_id])

        rows = cur.fetchall()
    finally:
        conn.close()

    now = datetime.now(timezone.utc)
    results: list[EndingSoonAuction] = []

    for row in rows:
        a_id, title, category, current_price, end_time, winner_id, \
            is_winning, is_watching, has_bid, cat_history = row

        current_price = float(current_price or 0)
        hours_left = max(0, (end_time.replace(tzinfo=timezone.utc) - now).total_seconds() / 3600)

        # Calculate quick intent score
        intent = 0.0
        if is_winning:  intent += 0.50
        elif has_bid:   intent += 0.35
        if is_watching: intent += 0.30
        if int(cat_history) >= 3: intent += 0.20
        intent = round(min(intent, 1.0), 3)

        # Only notify if user has some connection to this auction
        if intent < 0.15 and not is_watching and not has_bid:
            continue

        # Urgency
        if hours_left <= 1:    urgency = "critical"
        elif hours_left <= 6:  urgency = "high"
        else:                   urgency = "medium"

        # Personalised notification copy
        time_str = (
            f"{int(hours_left * 60)}m" if hours_left < 1
            else f"{hours_left:.1f}h"
        )

        if is_winning:
            notif_title = f"You're winning — {time_str} left!"
            notif_body  = f"You lead on '{title[:40]}' at ${current_price:,.0f}. Hold your lead."
        elif has_bid:
            notif_title = f"Auction ending — {time_str} left"
            notif_body  = f"You bid on '{title[:40]}'. Current price: ${current_price:,.0f}."
        elif is_watching:
            notif_title = f"Watchlist item ending soon"
            notif_body  = f"'{title[:40]}' closes in {time_str}. ${current_price:,.0f} current price."
        else:
            notif_title = f"New {category} auction ending"
            notif_body  = f"'{title[:40]}' — {time_str} left at ${current_price:,.0f}."

        results.append(EndingSoonAuction(
            auction_id=a_id,
            title=title,
            category=category,
            current_price=current_price,
            hours_left=round(hours_left, 2),
            intent_score=intent,
            is_winning=bool(is_winning),
            is_watching=bool(is_watching),
            notification_title=notif_title,
            notification_body=notif_body,
            urgency=urgency,
        ))

    # Sort: critical first, then by intent score
    urgency_order = {"critical": 0, "high": 1, "medium": 2}
    results.sort(key=lambda r: (urgency_order[r.urgency], -r.intent_score))
    results = results[:req.max_auctions]

    return EndingSoonResponse(
        user_id=req.user_id,
        auctions=results,
        total=len(results),
        generated_at=now.isoformat(),
    )
