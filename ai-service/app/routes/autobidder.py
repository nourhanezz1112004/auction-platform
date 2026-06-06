# ai-service/app/routes/autobidder.py
# AI autobidder — buyers set max budget + strategy, AI places optimal bids.
# Strategies: conservative (wait + bid low), aggressive (bid fast to deter),
#             sniper (wait until last 30s), value (only bid under predicted fair value).
# Works with your existing Bull queue + Socket.io infrastructure.

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional, Literal
import os, psycopg2
from datetime import datetime, timezone
import numpy as np
from ..services.model_store import model_store

router = APIRouter(prefix="/autobidder", tags=["autobidder"])

CATEGORIES = ["watches","cameras","art","jewelry","electronics","other"]

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


class AutobidStrategyRequest(BaseModel):
    user_id: str
    auction_id: str
    max_budget: float = Field(..., gt=0)
    strategy: Literal["conservative", "aggressive", "sniper", "value"] = "conservative"


class AutobidStrategyResponse(BaseModel):
    should_bid_now: bool
    suggested_amount: Optional[float]
    reasoning: str
    confidence: float
    predicted_final_price: float
    budget_utilisation_pct: float
    next_check_seconds: int   # when to re-evaluate


class ShouldBidRequest(BaseModel):
    user_id: str
    auction_id: str
    max_budget: float
    strategy: Literal["conservative", "aggressive", "sniper", "value"]
    current_price: float
    seconds_remaining: float
    bid_count: int
    watcher_count: int = 0


class ShouldBidResponse(BaseModel):
    should_bid: bool
    amount: Optional[float]
    reasoning: str


@router.post("/strategy", response_model=AutobidStrategyResponse)
def get_autobid_strategy(req: AutobidStrategyRequest):
    """
    Full strategy evaluation: should the autobidder act now?
    Reads live auction state from DB, predicts final price, applies strategy logic.
    Called by your Bull queue job every N seconds per active autobid registration.
    """
    conn = get_conn()
    try:
        cur = conn.cursor()

        # Fetch live auction state
        cur.execute("""
            SELECT
                a."currentPrice",
                a."reservePrice",
                a."endTime",
                a.category,
                a.condition,
                a."startingPrice",
                COUNT(b.id) AS bid_count,
                a."sellerId"
            FROM "Auction" a
            LEFT JOIN "Bid" b ON b."auctionId" = a.id
            WHERE a.id = %s AND a.status = 'ACTIVE'
            GROUP BY a.id
        """, [req.auction_id])
        row = cur.fetchone()

        if not row:
            return AutobidStrategyResponse(
                should_bid_now=False, suggested_amount=None,
                reasoning="Auction not found or not active",
                confidence=0, predicted_final_price=0,
                budget_utilisation_pct=0, next_check_seconds=60,
            )

        current_price, reserve_price, end_time, category, condition, starting_price, bid_count, seller_id = row

        # Block self-bidding
        if seller_id == req.user_id:
            return AutobidStrategyResponse(
                should_bid_now=False, suggested_amount=None,
                reasoning="Cannot bid on own auction",
                confidence=1.0, predicted_final_price=float(current_price),
                budget_utilisation_pct=0, next_check_seconds=300,
            )

        now = datetime.now(timezone.utc)
        seconds_remaining = max((end_time.replace(tzinfo=timezone.utc) - now).total_seconds(), 0)

        # Check if user already has highest bid (no need to overbid self)
        cur.execute("""
            SELECT "bidderId" FROM "Bid"
            WHERE "auctionId" = %s ORDER BY amount DESC LIMIT 1
        """, [req.auction_id])
        top_bid_row = cur.fetchone()
        is_current_winner = top_bid_row and top_bid_row[0] == req.user_id

        if is_current_winner:
            return AutobidStrategyResponse(
                should_bid_now=False, suggested_amount=None,
                reasoning="You currently hold the highest bid — no action needed",
                confidence=0.95, predicted_final_price=float(current_price),
                budget_utilisation_pct=float(current_price) / req.max_budget * 100,
                next_check_seconds=30 if seconds_remaining < 120 else 60,
            )

    finally:
        conn.close()

    # Predict final price using trained model
    bundle = model_store.price_model
    predicted_final = float(current_price) * 1.15  # heuristic default

    if bundle:
        try:
            cat_idx = CATEGORIES.index(category.lower()) if category else 5
        except ValueError:
            cat_idx = 5

        cond_map = {"poor":0,"fair":1,"good":2,"very good":3,"excellent":4,"mint":5}
        cond_idx = cond_map.get(str(condition).lower(), 2)

        X = np.array([[
            float(reserve_price), float(starting_price), cat_idx, cond_idx,
            seconds_remaining / 3600, now.weekday(), now.hour,
            int(bid_count), 3.5,
        ]])
        predicted_final = max(float(bundle["model"].predict(X)[0]), float(current_price))

    current_price = float(current_price)
    min_next_bid = current_price + 10  # your minimum increment

    # Budget check
    if min_next_bid > req.max_budget:
        return AutobidStrategyResponse(
            should_bid_now=False, suggested_amount=None,
            reasoning=f"Next minimum bid (${min_next_bid:.0f}) exceeds your budget (${req.max_budget:.0f})",
            confidence=1.0, predicted_final_price=round(predicted_final, 2),
            budget_utilisation_pct=100.0, next_check_seconds=60,
        )

    # ── Strategy logic ─────────────────────────────────────────────────────────
    should_bid = False
    suggested_amount = None
    reasoning = ""
    confidence = 0.7
    next_check = 60

    if req.strategy == "conservative":
        # Bid only when outbid and predicted final is within budget
        if predicted_final <= req.max_budget * 0.85:
            should_bid = True
            suggested_amount = min(min_next_bid + 5, req.max_budget * 0.7)
            reasoning = f"Conservative bid — predicted final ${predicted_final:.0f} is comfortably within budget"
        else:
            reasoning = f"Predicted final ${predicted_final:.0f} is too close to budget — holding"
        next_check = 45

    elif req.strategy == "aggressive":
        # Bid immediately to deter other bidders
        should_bid = True
        # Bid 15% above current to signal strength
        suggested_amount = min(current_price * 1.15, req.max_budget)
        if suggested_amount < min_next_bid:
            suggested_amount = min_next_bid
        reasoning = "Aggressive strategy — bidding high to deter competitors"
        confidence = 0.85
        next_check = 20

    elif req.strategy == "sniper":
        # Only bid in the final 30 seconds
        if seconds_remaining <= 30:
            should_bid = True
            suggested_amount = min(req.max_budget, current_price * 1.05)
            if suggested_amount < min_next_bid:
                suggested_amount = min_next_bid
            reasoning = f"Sniper: {seconds_remaining:.0f}s remaining — executing bid"
            confidence = 0.9
            next_check = 5
        else:
            reasoning = f"Sniper: waiting — {seconds_remaining:.0f}s remaining (activates at 30s)"
            next_check = max(int(seconds_remaining - 35), 5)

    elif req.strategy == "value":
        # Only bid if current price is below predicted fair value
        fair_value = predicted_final * 0.9
        if current_price < fair_value and min_next_bid <= req.max_budget:
            should_bid = True
            suggested_amount = min(min_next_bid, fair_value * 0.95)
            reasoning = f"Value bid — current ${current_price:.0f} below predicted fair value ${fair_value:.0f}"
            confidence = 0.75
        else:
            reasoning = f"Current price ${current_price:.0f} already at or above fair value ${fair_value:.0f}"
        next_check = 60

    return AutobidStrategyResponse(
        should_bid_now=should_bid,
        suggested_amount=round(suggested_amount, 2) if suggested_amount else None,
        reasoning=reasoning,
        confidence=confidence,
        predicted_final_price=round(predicted_final, 2),
        budget_utilisation_pct=round((current_price / req.max_budget) * 100, 1),
        next_check_seconds=next_check,
    )


@router.post("/should-bid", response_model=ShouldBidResponse)
def should_bid_now(req: ShouldBidRequest):
    """
    Lightweight real-time check — called from your WebSocket bid event handler.
    Returns immediately without DB queries using supplied context.
    """
    min_next = req.current_price + 10

    if min_next > req.max_budget:
        return ShouldBidResponse(should_bid=False, amount=None, reasoning="Budget exhausted")

    if req.strategy == "sniper" and req.seconds_remaining > 30:
        return ShouldBidResponse(
            should_bid=False, amount=None,
            reasoning=f"Sniper waiting — {req.seconds_remaining:.0f}s remaining"
        )

    if req.strategy == "aggressive":
        amount = min(req.current_price * 1.12, req.max_budget)
        return ShouldBidResponse(
            should_bid=True, amount=round(max(amount, min_next), 2),
            reasoning="Aggressive — bid immediately"
        )

    # Conservative / value — bid if not already winning implied by context
    amount = min(min_next + 5, req.max_budget)
    return ShouldBidResponse(
        should_bid=True, amount=round(amount, 2),
        reasoning=f"{req.strategy.capitalize()} bid placed"
    )
