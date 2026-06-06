"""
Pydantic schemas for the AI service.

CRITICAL: These must stay in sync with packages/shared-types/src/ai.types.ts.
Any change here requires a matching change in the TypeScript file and vice versa.
Follow the Contract Change Rule in the blueprint (Section 12).
"""

from pydantic import BaseModel, Field


# ─── Anti-Bot ─────────────────────────────────────────────────────────────────

class AntiBotRequest(BaseModel):
    user_id:                  str
    auction_id:               str
    bid_amount:               float
    ip_address:               str
    session_duration_seconds: int
    bids_in_last_minute:      int
    time_to_bid_ms:           int


class AntiBotResponse(BaseModel):
    is_bot:     bool
    confidence: float = Field(ge=0.0, le=1.0)
    reason:     str


# ─── Fraud Detection ──────────────────────────────────────────────────────────

class FraudRequest(BaseModel):
    user_id:            str
    auction_id:         str
    bid_amount:         float
    account_age_days:   int
    total_bids_history: int
    ip_country:         str
    bid_velocity_1h:    int


class FraudResponse(BaseModel):
    flagged: bool
    score:   float = Field(ge=0.0, le=1.0)
    signals: list[str]


# ─── Recommender ──────────────────────────────────────────────────────────────

class RecommendRequest(BaseModel):
    user_id:         str
    recently_viewed: list[str]   # auction IDs
    bid_history:     list[str]   # auction IDs
    limit:           int = 10


class RecommendItem(BaseModel):
    auction_id: str
    score:      float
    reason:     str   # 'similar_to_your_interests' | 'trending'


class RecommendResponse(BaseModel):
    recommendations: list[RecommendItem]


# ─── Embed (Phase 2) ──────────────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    auction_id:  str
    description: str


class EmbedResponse(BaseModel):
    auction_id: str
    dimensions: int   # always 384 for all-MiniLM-L6-v2


# ─── Price Prediction ─────────────────────────────────────────────────────────

class PricePredictionRequest(BaseModel):
    auction_id:     str
    category:       str
    starting_price: float
    current_price:  float
    bid_count:      int
    hours_remaining: float
    day_of_week:    int   # 0=Mon … 6=Sun


class PricePredictionResponse(BaseModel):
    predicted_final: float
    confidence_low:  float
    confidence_high: float
    model_version:   str
    reserve_vs_pred: str   # 'above_reserve' | 'below_reserve' | 'no_reserve'


# ─── Auction Momentum ─────────────────────────────────────────────────────────

class MomentumRequest(BaseModel):
    auction_id:      str
    bid_count:       int
    bids_last_10min: int
    bids_last_1h:    int
    hours_remaining: float
    watchers:        int  = 0


class MomentumResponse(BaseModel):
    score:  float = Field(ge=0.0, le=1.0)
    label:  str   # 'cool' | 'warming' | 'hot' | 'frenzy'
    color:  str   # hex colour for UI


# ─── Autobidder ───────────────────────────────────────────────────────────────

class AutobidRequest(BaseModel):
    auction_id:      str
    current_price:   float
    max_budget:      float
    strategy:        str   # 'conservative' | 'aggressive' | 'sniper' | 'value'
    hours_remaining: float
    bid_count:       int


class AutobidResponse(BaseModel):
    should_bid:   bool
    bid_amount:   float
    reasoning:    str
    next_check_s: int   # seconds until next autobid evaluation


# ─── Reserve Price Suggester ──────────────────────────────────────────────────

class ReserveSuggestionRequest(BaseModel):
    category:       str
    starting_price: float
    title:          str
    condition:      str = 'good'   # 'poor' | 'fair' | 'good' | 'excellent' | 'mint'


class ReserveSuggestionResponse(BaseModel):
    suggested_low:  float
    suggested_high: float
    reasoning:      str
    confidence:     str   # 'low' | 'medium' | 'high'


# ─── Seller Insights ──────────────────────────────────────────────────────────

class SellerInsightsRequest(BaseModel):
    seller_id:       str
    auction_ids:     list[str] = []
    lookback_days:   int = 30


class SellerInsightsResponse(BaseModel):
    weekly_summary:       str
    avg_above_reserve_pct: float
    best_closing_day:     str
    best_closing_hour:    str
    projected_gmv:        float
    recommendations:      list[str]
    category_performance: dict[str, float]


# ─── Listing Guard ────────────────────────────────────────────────────────────

class ListingGuardRequest(BaseModel):
    title:       str
    description: str
    category:    str
    seller_id:   str


class ListingGuardResponse(BaseModel):
    is_suspicious:    bool
    is_duplicate:     bool
    risk_level:       str    # 'low' | 'medium' | 'high'
    flags:            list[str]
    recommendation:   str


# ─── Smart Outbid Notification ────────────────────────────────────────────────

class OutbidNotificationRequest(BaseModel):
    auction_id:        str
    outbid_by:         float
    watcher_count:     int
    seconds_remaining: float
    bid_count:         int


class OutbidNotificationResponse(BaseModel):
    message:    str
    urgency:    str     # 'low' | 'medium' | 'high' | 'critical'
    action_cta: str
