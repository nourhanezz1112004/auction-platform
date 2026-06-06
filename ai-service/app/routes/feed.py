# ai-service/app/routes/feed.py
# Personalised auction feed ranking.
# Two-tower approach: user embedding (bid history) + item embedding (features)
# → dot product similarity → ranked feed.
# Falls back to recency + category match without ML models.

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional
import os, psycopg2
import numpy as np
from ..services.model_store import model_store

router = APIRouter(prefix="/feed", tags=["feed"])
CATEGORIES = ["watches","cameras","art","jewelry","electronics","other"]
CONDITIONS = ["poor","fair","good","very good","excellent","mint"]

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def cat_idx(c: str) -> float:
    try: return CATEGORIES.index(c.lower()) / len(CATEGORIES)
    except ValueError: return 0.5

def cond_idx(c: str) -> float:
    try: return CONDITIONS.index(c.lower()) / len(CONDITIONS)
    except ValueError: return 0.5


class FeedRequest(BaseModel):
    user_id: str
    limit: int = Field(default=20, ge=1, le=100)
    exclude_ids: list[str] = []   # auction IDs already shown (for pagination)


class FeedItem(BaseModel):
    auction_id: str
    title: str
    category: str
    condition: str
    current_price: float
    reserve_price: float
    end_time: str
    image_urls: list[str]
    bid_count: int
    relevance_score: float
    reason: str    # "Matches your watch interests" | "Ending soon" | "Popular now"


class FeedResponse(BaseModel):
    items: list[FeedItem]
    total: int
    personalised: bool


def _build_user_vector(user_id: str, cur) -> Optional[np.ndarray]:
    """
    Builds a user preference vector from their bid history.
    Weighted average of item feature vectors they bid on, recency-weighted.
    """
    cur.execute("""
        SELECT a.category, a.condition, a."currentPrice", a."reservePrice",
               EXTRACT(EPOCH FROM (NOW() - b."createdAt")) / 86400 AS days_ago
        FROM "Bid" b
        JOIN "Auction" a ON a.id = b."auctionId"
        WHERE b."bidderId" = %s
          AND b."createdAt" > NOW() - INTERVAL '90 days'
        ORDER BY b."createdAt" DESC
        LIMIT 30
    """, [user_id])
    rows = cur.fetchall()
    if not rows:
        return None

    vecs, weights = [], []
    for r in rows:
        category, condition, curr_price, reserve_price, days_ago = r
        vec = np.array([
            cat_idx(category or "other"),
            cond_idx(condition or "good"),
            min(float(curr_price or 0) / 10000, 1.0),
            min(float(reserve_price or 0) / 10000, 1.0),
        ])
        # Recency weight: recent bids matter more
        weight = np.exp(-float(days_ago or 0) / 30)
        vecs.append(vec)
        weights.append(weight)

    weights = np.array(weights)
    weights /= weights.sum()
    user_vec = np.average(vecs, axis=0, weights=weights)
    return user_vec / (np.linalg.norm(user_vec) + 1e-9)


@router.post("/ranked", response_model=FeedResponse)
def ranked_feed(req: FeedRequest):
    """
    Returns personalised ranked auction feed for a user.
    Scores each active auction by similarity to the user's bidding history.
    """
    conn = get_conn()
    try:
        cur = conn.cursor()

        # Build user preference vector from bid history
        user_vec = _build_user_vector(req.user_id, cur)

        # Fetch active auctions
        exclude_clause = f"AND a.id != ALL(ARRAY{req.exclude_ids!r})" if req.exclude_ids else ""
        cur.execute(f"""
            SELECT
                a.id, a.title, a.category, a.condition,
                a."currentPrice", a."reservePrice",
                a."endTime"::text, a."imageUrls",
                COUNT(b.id) AS bid_count,
                EXTRACT(EPOCH FROM (a."endTime" - NOW())) AS secs_remaining
            FROM "Auction" a
            LEFT JOIN "Bid" b ON b."auctionId" = a.id
            WHERE a.status = 'ACTIVE'
              AND a."sellerId" != %s
              AND a.id NOT IN (
                  SELECT "auctionId" FROM "Bid" WHERE "bidderId" = %s
              )
              {exclude_clause}
            GROUP BY a.id
            ORDER BY a."endTime" ASC
            LIMIT 200
        """, [req.user_id, req.user_id])
        auctions = cur.fetchall()

        # Get user's favourite category for reason strings
        cur.execute("""
            SELECT MODE() WITHIN GROUP (ORDER BY a.category)
            FROM "Bid" b JOIN "Auction" a ON a.id = b."auctionId"
            WHERE b."bidderId" = %s
        """, [req.user_id])
        fav_cat_row = cur.fetchone()
        fav_cat = fav_cat_row[0] if fav_cat_row else None

    finally:
        conn.close()

    scored = []
    for row in auctions:
        auction_id, title, category, condition, curr_price, reserve_price, \
            end_time, image_urls, bid_count, secs_remaining = row

        curr_price    = float(curr_price or 0)
        reserve_price = float(reserve_price or 0)
        secs          = float(secs_remaining or 0)
        bid_count     = int(bid_count or 0)

        # Build item vector
        item_vec = np.array([
            cat_idx(category or "other"),
            cond_idx(condition or "good"),
            min(curr_price / 10000, 1.0),
            min(reserve_price / 10000, 1.0),
        ])
        item_vec_norm = item_vec / (np.linalg.norm(item_vec) + 1e-9)

        # Relevance score
        if user_vec is not None:
            similarity = float(np.dot(user_vec, item_vec_norm))
        else:
            similarity = 0.5

        # Urgency boost: endings within 24h score higher
        urgency_boost = max(0, 1 - secs / 86400) * 0.3 if secs < 86400 else 0

        # Popularity boost: active bid auctions
        popularity_boost = min(bid_count / 20, 1) * 0.1

        relevance = min(similarity * 0.6 + urgency_boost + popularity_boost, 1.0)

        # Reason string
        if fav_cat and category == fav_cat:
            reason = f"Matches your {category} interests"
        elif secs < 3600:
            reason = "Ending in under 1 hour"
        elif secs < 86400:
            reason = "Ending today"
        elif bid_count >= 10:
            reason = "Popular — lots of bids"
        else:
            reason = "New listing"

        scored.append(FeedItem(
            auction_id=auction_id,
            title=title,
            category=category or "other",
            condition=condition or "good",
            current_price=curr_price,
            reserve_price=reserve_price,
            end_time=end_time,
            image_urls=image_urls or [],
            bid_count=bid_count,
            relevance_score=round(relevance, 4),
            reason=reason,
        ))

    # Sort by relevance descending
    scored.sort(key=lambda x: x.relevance_score, reverse=True)
    top = scored[:req.limit]

    return FeedResponse(
        items=top,
        total=len(top),
        personalised=user_vec is not None,
    )
