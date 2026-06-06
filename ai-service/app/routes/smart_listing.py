# ai-service/app/routes/smart_listing.py
# ══════════════════════════════════════════════════════════════════════════════
# Smart Listing AI — 3 features for sellers:
#   1. /listing/auto-categorize  — infers category from title + description
#   2. /listing/price-suggest    — suggests starting + reserve prices from comps
#   3. /listing/bid-anomaly      — real-time shill bidding detector (called on every bid)
# ══════════════════════════════════════════════════════════════════════════════

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional
import os, psycopg2, json, re
import numpy as np
from datetime import datetime, timezone

router = APIRouter(prefix="/listing", tags=["smart-listing"])

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL   = "claude-sonnet-4-20250514"

CATEGORIES = ["watches", "cameras", "art", "jewelry", "electronics", "other"]

CATEGORY_KEYWORDS = {
    "watches":     ["watch", "timepiece", "chronograph", "rolex", "omega", "seiko", "casio", "wristwatch", "movement", "dial", "bezel"],
    "cameras":     ["camera", "lens", "leica", "nikon", "canon", "fuji", "film", "slr", "dslr", "mirrorless", "viewfinder", "shutter"],
    "art":         ["painting", "artwork", "canvas", "print", "lithograph", "sculpture", "signed", "artist", "gallery", "oil", "watercolour"],
    "jewelry":     ["ring", "necklace", "bracelet", "earring", "diamond", "gold", "silver", "platinum", "gemstone", "pendant", "brooch"],
    "electronics": ["amplifier", "turntable", "speaker", "headphone", "hifi", "receiver", "tube", "transistor", "audio", "stereo", "vinyl"],
}

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


# ── 1. AUTO-CATEGORIZE ───────────────────────────────────────────────────────

class AutoCategorizeRequest(BaseModel):
    title:       str = Field(..., min_length=3, max_length=300)
    description: Optional[str] = Field(default=None, max_length=2000)

class AutoCategorizeResponse(BaseModel):
    category:     str
    confidence:   float          # 0–1
    runner_up:    Optional[str]  # second best guess
    method:       str            # "claude" | "keyword" | "default"
    reasoning:    str

@router.post("/auto-categorize", response_model=AutoCategorizeResponse)
async def auto_categorize(req: AutoCategorizeRequest):
    """
    Infers the auction category from the listing title + description.
    Uses Claude when available for accuracy; falls back to keyword scoring.
    """
    text = f"{req.title} {req.description or ''}".lower()

    # ── Keyword scoring (always runs as fallback) ────────────────────────────
    scores: dict[str, float] = {cat: 0.0 for cat in CATEGORIES}
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                scores[cat] += 1.0 + (0.5 if kw in req.title.lower() else 0)

    sorted_cats = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    kw_best      = sorted_cats[0][0]
    kw_best_score = sorted_cats[0][1]
    kw_runner_up  = sorted_cats[1][0] if sorted_cats[1][1] > 0 else None
    kw_confidence = min(kw_best_score / max(sum(scores.values()), 1), 1.0)

    if not ANTHROPIC_KEY or kw_confidence >= 0.85:
        return AutoCategorizeResponse(
            category=kw_best if kw_best_score > 0 else "other",
            confidence=round(kw_confidence, 2) if kw_best_score > 0 else 0.3,
            runner_up=kw_runner_up,
            method="keyword",
            reasoning=f"Matched keywords suggest '{kw_best}' category.",
        )

    # ── Claude for ambiguous cases ───────────────────────────────────────────
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": CLAUDE_MODEL,
                    "max_tokens": 200,
                    "messages": [{
                        "role": "user",
                        "content": (
                            f"Classify this auction listing into exactly one category.\n"
                            f"Categories: {', '.join(CATEGORIES)}\n"
                            f"Title: {req.title}\n"
                            f"Description: {(req.description or '')[:500]}\n\n"
                            f"Respond ONLY with JSON: "
                            f'{{\"category\": \"...\", \"confidence\": 0.0, \"reasoning\": \"...\"}}'
                        )
                    }],
                },
            )
        if resp.status_code == 200:
            raw = resp.json()["content"][0]["text"].strip()
            raw = re.sub(r"```json|```", "", raw).strip()
            parsed = json.loads(raw)
            cat = parsed.get("category", "other").lower()
            if cat not in CATEGORIES:
                cat = "other"
            return AutoCategorizeResponse(
                category=cat,
                confidence=round(float(parsed.get("confidence", 0.7)), 2),
                runner_up=kw_runner_up,
                method="claude",
                reasoning=parsed.get("reasoning", "Claude classification."),
            )
    except Exception:
        pass

    return AutoCategorizeResponse(
        category=kw_best if kw_best_score > 0 else "other",
        confidence=round(kw_confidence, 2),
        runner_up=kw_runner_up,
        method="keyword",
        reasoning="Keyword-based category inference.",
    )


# ── 2. SMART PRICE SUGGESTION ────────────────────────────────────────────────

class PriceSuggestRequest(BaseModel):
    title:         str
    category:      str
    condition:     str = "good"   # poor | fair | good | excellent | mint
    description:   Optional[str] = None

class ComparableSale(BaseModel):
    title:       str
    final_price: float
    condition:   str
    sold_days_ago: int

class PriceSuggestResponse(BaseModel):
    suggested_starting:     float
    suggested_reserve:      float
    suggested_buy_now:      Optional[float]
    comparable_avg:         float
    comparable_count:       int
    comparables:            list[ComparableSale]
    condition_adjustment_pct: float   # % applied for condition vs avg
    confidence:             str       # "high" | "medium" | "low"
    reasoning:              str

CONDITION_MULTIPLIERS = {
    "poor": 0.45, "fair": 0.65, "good": 0.85,
    "very good": 0.95, "excellent": 1.0, "mint": 1.15,
}

@router.post("/price-suggest", response_model=PriceSuggestResponse)
def price_suggest(req: PriceSuggestRequest):
    """
    Suggests starting price, reserve, and buy-now price based on
    comparable sold auctions in the same category + condition.
    """
    conn = get_conn()
    try:
        cur = conn.cursor()

        # Pull comparable closed auctions in category, last 90 days
        cur.execute("""
            SELECT
                i.title,
                MAX(b.amount)                                          AS final_price,
                i.condition,
                EXTRACT(DAY FROM NOW() - a."endTime")::int            AS days_ago
            FROM "Auction" a
            JOIN "Item"    i ON i.id = a."itemId"
            LEFT JOIN "Bid" b ON b."auctionId" = a.id
            WHERE a.category  = %s
              AND a.status     = 'CLOSED'
              AND a."endTime" >= NOW() - INTERVAL '90 days'
              AND b.amount IS NOT NULL
            GROUP BY i.id, i.title, i.condition, a."endTime"
            HAVING MAX(b.amount) > 0
            ORDER BY a."endTime" DESC
            LIMIT 30
        """, [req.category])

        rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        # No comparable data — give sensible defaults
        return PriceSuggestResponse(
            suggested_starting=50.0,
            suggested_reserve=75.0,
            suggested_buy_now=None,
            comparable_avg=0.0,
            comparable_count=0,
            comparables=[],
            condition_adjustment_pct=0.0,
            confidence="low",
            reasoning="No comparable sales found yet. Defaults shown — adjust based on your knowledge of the item.",
        )

    prices = [float(r[1]) for r in rows]
    avg    = float(np.mean(prices))
    median = float(np.median(prices))

    # Condition adjustment
    cond_key  = req.condition.lower()
    cond_mult = CONDITION_MULTIPLIERS.get(cond_key, 0.85)
    avg_cond_mult = 0.85   # assume "good" for comparables (safe default)
    adjustment_pct = round((cond_mult / avg_cond_mult - 1) * 100, 1)

    adjusted_median = median * (cond_mult / avg_cond_mult)

    suggested_starting = round(adjusted_median * 0.60, 2)
    suggested_reserve  = round(adjusted_median * 0.85, 2)
    suggested_buy_now  = round(adjusted_median * 1.30, 2) if len(rows) >= 5 else None

    confidence = "high" if len(rows) >= 10 else "medium" if len(rows) >= 4 else "low"

    comparables = [
        ComparableSale(
            title=r[0][:60], final_price=float(r[1]),
            condition=r[2] or "unknown", sold_days_ago=int(r[3] or 0),
        )
        for r in rows[:5]
    ]

    reasoning = (
        f"Based on {len(rows)} comparable {req.category} sales (median ${median:,.0f}). "
        f"Condition '{req.condition}' applies a {adjustment_pct:+.0f}% adjustment. "
        f"Starting at 60% of adjusted median encourages early bidding; "
        f"reserve at 85% protects your downside."
    )

    return PriceSuggestResponse(
        suggested_starting=suggested_starting,
        suggested_reserve=suggested_reserve,
        suggested_buy_now=suggested_buy_now,
        comparable_avg=round(avg, 2),
        comparable_count=len(rows),
        comparables=comparables,
        condition_adjustment_pct=adjustment_pct,
        confidence=confidence,
        reasoning=reasoning,
    )


# ── 3. BID ANOMALY DETECTION (real-time shill bidding) ───────────────────────

class BidAnomalyRequest(BaseModel):
    auction_id:  str
    bidder_id:   str
    seller_id:   str
    bid_amount:  float
    bid_number:  int   # sequential bid number in this auction

class BidAnomalyResponse(BaseModel):
    is_anomalous:      bool
    risk_score:        float   # 0–1
    signals:           list[str]
    action:            str     # "allow" | "flag" | "block"
    explanation:       str

@router.post("/bid-anomaly", response_model=BidAnomalyResponse)
def bid_anomaly(req: BidAnomalyRequest):
    """
    Real-time shill bidding + anomaly detector called on every bid placement.
    Checks: self-bidding, bid velocity, price escalation pattern, bidder history.
    """
    signals: list[str] = []
    risk = 0.0

    # ── Self-bid check ───────────────────────────────────────────────────────
    if req.bidder_id == req.seller_id:
        return BidAnomalyResponse(
            is_anomalous=True, risk_score=1.0,
            signals=["self_bid"],
            action="block",
            explanation="Seller cannot bid on their own auction.",
        )

    conn = get_conn()
    try:
        cur = conn.cursor()

        # ── Bidder history in this auction ───────────────────────────────────
        cur.execute("""
            SELECT
                COUNT(*)              AS bid_count,
                MAX(amount)           AS max_bid,
                MIN(amount)           AS min_bid,
                AVG(amount)           AS avg_bid,
                MIN("createdAt")      AS first_bid,
                MAX("createdAt")      AS last_bid
            FROM "Bid"
            WHERE "auctionId" = %s AND "bidderId" = %s
        """, [req.auction_id, req.bidder_id])
        row = cur.fetchone()
        bid_count = int(row[0] or 0)
        max_bid   = float(row[1] or 0)

        # Excessive bidding by same user
        if bid_count >= 8:
            signals.append("excessive_bids_same_user")
            risk += 0.25

        # ── Bid velocity in last 2 minutes ──────────────────────────────────
        cur.execute("""
            SELECT COUNT(*) FROM "Bid"
            WHERE "auctionId" = %s
              AND "createdAt" >= NOW() - INTERVAL '2 minutes'
        """, [req.auction_id])
        recent_count = int(cur.fetchone()[0])
        if recent_count >= 5:
            signals.append("bid_velocity_spike")
            risk += 0.20

        # ── Tiny increment bids (inflation pattern) ──────────────────────────
        cur.execute("""
            SELECT amount FROM "Bid"
            WHERE "auctionId" = %s
            ORDER BY "createdAt" DESC LIMIT 5
        """, [req.auction_id])
        recent_bids = [float(r[0]) for r in cur.fetchall()]
        if len(recent_bids) >= 3:
            increments = [recent_bids[i] - recent_bids[i+1] for i in range(len(recent_bids)-1)]
            avg_increment = sum(increments) / len(increments)
            if avg_increment < 0.5 and req.bid_amount > 0:
                signals.append("micro_increment_pattern")
                risk += 0.15

        # ── New account bidding high amounts ────────────────────────────────
        cur.execute("""
            SELECT EXTRACT(DAY FROM NOW() - "createdAt")::int AS age_days
            FROM "User" WHERE id = %s
        """, [req.bidder_id])
        res = cur.fetchone()
        account_age = int(res[0]) if res else 999
        if account_age < 3 and req.bid_amount > 500:
            signals.append("new_account_high_bid")
            risk += 0.20

        # ── Bidder associated with seller's past auctions ────────────────────
        cur.execute("""
            SELECT COUNT(DISTINCT a.id)
            FROM "Bid"    b
            JOIN "Auction" a ON a.id = b."auctionId"
            WHERE b."bidderId" = %s AND a."sellerId" = %s
              AND a."endTime" >= NOW() - INTERVAL '60 days'
        """, [req.bidder_id, req.seller_id])
        shared_auctions = int(cur.fetchone()[0])
        if shared_auctions >= 4:
            signals.append("repeated_bidder_same_seller")
            risk += 0.30

    finally:
        conn.close()

    risk = round(min(risk, 1.0), 3)

    if risk >= 0.65:
        action = "flag"
    elif risk >= 0.90:
        action = "block"
    else:
        action = "allow"

    explanation = (
        f"Risk score {risk:.0%}. "
        + (f"Signals detected: {', '.join(s.replace('_', ' ') for s in signals)}." if signals
           else "No anomalous signals detected.")
    )

    return BidAnomalyResponse(
        is_anomalous=len(signals) > 0,
        risk_score=risk,
        signals=signals,
        action=action,
        explanation=explanation,
    )
