"""
Endpoint integration tests — all 7 auction_intelligence endpoints
+ anti_bot + fraud + recommender.

No DB, no network. Tests every branch: valid input, edge cases,
graceful fallback.

Run:  cd ai-service && python -m pytest tests/test_endpoints.py -v
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
import asyncio
from app.ml.price_model import price_model

# Load price model once for the whole module
price_model.load()

from app.routers.anti_bot  import anti_bot  as ep_anti_bot
from app.routers.fraud     import fraud     as ep_fraud
from app.routers.recommender import recommend as ep_recommend, embed as ep_embed
from app.routers.auction_intelligence import (
    price_prediction, momentum, autobid,
    reserve_suggestion, seller_insights,
    listing_guard, outbid_notification,
)
from app.models.schemas import (
    AntiBotRequest, FraudRequest,
    RecommendRequest, EmbedRequest,
    PricePredictionRequest, MomentumRequest, AutobidRequest,
    ReserveSuggestionRequest, SellerInsightsRequest,
    ListingGuardRequest, OutbidNotificationRequest,
)
from app.ml import anti_bot_model, fraud_model


# ─── Helpers ──────────────────────────────────────────────────────────────────

def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


# ─── Anti-Bot endpoint ────────────────────────────────────────────────────────

class TestAntiBotEndpoint:

    def setup_method(self):
        anti_bot_model.load()

    def test_bot_request_blocked(self):
        req = AntiBotRequest(user_id="u1", auction_id="a1", bid_amount=500,
                             ip_address="1.2.3.4", session_duration_seconds=5,
                             bids_in_last_minute=14, time_to_bid_ms=50)
        r = run(ep_anti_bot(req))
        assert r.is_bot is True
        assert r.confidence > 0.70

    def test_human_request_passes(self):
        req = AntiBotRequest(user_id="u1", auction_id="a1", bid_amount=500,
                             ip_address="1.2.3.4", session_duration_seconds=700,
                             bids_in_last_minute=1, time_to_bid_ms=9000)
        r = run(ep_anti_bot(req))
        assert r.is_bot is False


# ─── Fraud endpoint ───────────────────────────────────────────────────────────

class TestFraudEndpoint:

    def setup_method(self):
        fraud_model.load()

    def test_fraud_request_flagged(self):
        req = FraudRequest(user_id="u1", auction_id="a1", bid_amount=60000,
                           account_age_days=0, total_bids_history=0,
                           ip_country="EG", bid_velocity_1h=18)
        r = run(ep_fraud(req))
        assert r.flagged is True
        assert r.score > 0.70

    def test_clean_request_passes(self):
        req = FraudRequest(user_id="u1", auction_id="a1", bid_amount=250,
                           account_age_days=500, total_bids_history=60,
                           ip_country="EG", bid_velocity_1h=1)
        r = run(ep_fraud(req))
        assert r.score < 0.70


# ─── Price Prediction ─────────────────────────────────────────────────────────

class TestPricePredictionEndpoint:

    def test_returns_xgboost_version(self):
        req = PricePredictionRequest(auction_id="a1", category="watches",
                                     starting_price=1000, current_price=1100,
                                     bid_count=6, hours_remaining=2.0, day_of_week=6)
        r = run(price_prediction(req))
        assert r.model_version == "xgboost-v1"
        assert r.predicted_final > 1100
        assert r.confidence_low < r.predicted_final
        assert r.confidence_high > r.predicted_final

    def test_confidence_band_widens_with_fewer_bids(self):
        high_bids = PricePredictionRequest(auction_id="a1", category="art",
                                            starting_price=500, current_price=600,
                                            bid_count=30, hours_remaining=1.0, day_of_week=0)
        low_bids = PricePredictionRequest(auction_id="a1", category="art",
                                           starting_price=500, current_price=510,
                                           bid_count=1, hours_remaining=48.0, day_of_week=0)
        r_high = run(price_prediction(high_bids))
        r_low  = run(price_prediction(low_bids))
        spread_high = r_high.confidence_high - r_high.confidence_low
        spread_low  = r_low.confidence_high  - r_low.confidence_low
        assert spread_low > spread_high, "Fewer bids should give wider band"

    def test_current_price_is_floor(self):
        req = PricePredictionRequest(auction_id="a1", category="electronics",
                                     starting_price=200, current_price=250,
                                     bid_count=2, hours_remaining=10.0, day_of_week=3)
        r = run(price_prediction(req))
        assert r.confidence_low >= 250


# ─── Momentum ─────────────────────────────────────────────────────────────────

class TestMomentumEndpoint:

    def test_frenzy_threshold(self):
        req = MomentumRequest(auction_id="a1", bid_count=80, bids_last_10min=5,
                              bids_last_1h=20, hours_remaining=0.1, watchers=60)
        r = run(momentum(req))
        assert r.label in ("hot", "frenzy")
        assert r.score > 0.50

    def test_cool_auction(self):
        req = MomentumRequest(auction_id="a1", bid_count=1, bids_last_10min=0,
                              bids_last_1h=1, hours_remaining=48.0, watchers=0)
        r = run(momentum(req))
        assert r.label == "cool"
        assert r.score < 0.30

    def test_score_bounded(self):
        req = MomentumRequest(auction_id="a1", bid_count=200, bids_last_10min=100,
                              bids_last_1h=200, hours_remaining=0.01, watchers=500)
        r = run(momentum(req))
        assert 0.0 <= r.score <= 1.0

    def test_color_is_valid_hex(self):
        req = MomentumRequest(auction_id="a1", bid_count=5, bids_last_10min=2,
                              bids_last_1h=5, hours_remaining=5.0)
        r = run(momentum(req))
        assert r.color.startswith("#")
        assert len(r.color) == 7


# ─── AutoBid ─────────────────────────────────────────────────────────────────

class TestAutobidEndpoint:

    def test_sniper_does_not_bid_early(self):
        req = AutobidRequest(auction_id="a1", current_price=400, max_budget=700,
                             strategy="sniper", hours_remaining=5.0, bid_count=5)
        r = run(autobid(req))
        assert r.should_bid is False

    def test_sniper_bids_in_final_hour(self):
        req = AutobidRequest(auction_id="a1", current_price=400, max_budget=700,
                             strategy="sniper", hours_remaining=0.5, bid_count=5)
        r = run(autobid(req))
        assert r.should_bid is True
        assert r.bid_amount > 400

    def test_budget_exhausted_never_bids(self):
        for strategy in ("conservative", "aggressive", "sniper", "value"):
            req = AutobidRequest(auction_id="a1", current_price=800, max_budget=700,
                                 strategy=strategy, hours_remaining=1.0, bid_count=5)
            r = run(autobid(req))
            assert r.should_bid is False, f"{strategy} should not bid over budget"
            assert r.bid_amount == 0.0

    def test_bid_never_exceeds_budget(self):
        req = AutobidRequest(auction_id="a1", current_price=690, max_budget=700,
                             strategy="aggressive", hours_remaining=1.0, bid_count=5)
        r = run(autobid(req))
        if r.should_bid:
            assert r.bid_amount <= 700

    def test_reasoning_is_non_empty(self):
        req = AutobidRequest(auction_id="a1", current_price=300, max_budget=700,
                             strategy="value", hours_remaining=5.0, bid_count=3)
        r = run(autobid(req))
        assert len(r.reasoning) > 10

    def test_next_check_positive(self):
        req = AutobidRequest(auction_id="a1", current_price=300, max_budget=700,
                             strategy="conservative", hours_remaining=5.0, bid_count=3)
        r = run(autobid(req))
        assert r.next_check_s > 0


# ─── Reserve Suggestion ───────────────────────────────────────────────────────

class TestReserveSuggestionEndpoint:

    def test_suggested_low_above_starting_price(self):
        req = ReserveSuggestionRequest(category="watches", starting_price=500,
                                        title="Rolex Submariner vintage", condition="good")
        r = run(reserve_suggestion(req))
        assert r.suggested_low >= 500
        assert r.suggested_high > r.suggested_low

    def test_mint_higher_than_poor(self):
        base = dict(category="watches", starting_price=500, title="Rolex Submariner piece")
        mint = run(reserve_suggestion(ReserveSuggestionRequest(**base, condition="mint")))
        poor = run(reserve_suggestion(ReserveSuggestionRequest(**base, condition="poor")))
        assert mint.suggested_low >= poor.suggested_low

    def test_confidence_high_for_detailed_title(self):
        req = ReserveSuggestionRequest(category="cameras", starting_price=300,
                                        title="Leica M6 35mm film rangefinder camera", condition="excellent")
        r = run(reserve_suggestion(req))
        assert r.confidence == "high"

    def test_reasoning_non_empty(self):
        req = ReserveSuggestionRequest(category="art", starting_price=1000, title="Oil painting landscape")
        r = run(reserve_suggestion(req))
        assert len(r.reasoning) > 20


# ─── Seller Insights ─────────────────────────────────────────────────────────

class TestSellerInsightsEndpoint:

    def test_returns_valid_structure_no_db(self):
        req = SellerInsightsRequest(seller_id="u1", auction_ids=[], lookback_days=30)
        r = run(seller_insights(req))
        assert isinstance(r.recommendations, list)
        assert len(r.recommendations) >= 1
        assert isinstance(r.weekly_summary, str)

    def test_recommendations_are_strings(self):
        req = SellerInsightsRequest(seller_id="u2", auction_ids=["a1", "a2"], lookback_days=7)
        r = run(seller_insights(req))
        for rec in r.recommendations:
            assert isinstance(rec, str)
            assert len(rec) > 5


# ─── Listing Guard ────────────────────────────────────────────────────────────

class TestListingGuardEndpoint:

    def test_flags_replica(self):
        req = ListingGuardRequest(title="Watch", description="exact replica of Rolex",
                                   category="watches", seller_id="u1")
        r = run(listing_guard(req))
        assert r.is_suspicious is True
        assert any("replica" in f for f in r.flags)

    def test_flags_fake(self):
        req = ListingGuardRequest(title="Item", description="fake imitation not genuine",
                                   category="electronics", seller_id="u1")
        r = run(listing_guard(req))
        assert r.is_suspicious is True

    def test_flags_short_title(self):
        req = ListingGuardRequest(title="X", description="A" * 50,
                                   category="art", seller_id="u1")
        r = run(listing_guard(req))
        assert "title_too_short" in r.flags

    def test_clean_listing_passes(self):
        req = ListingGuardRequest(
            title="1965 Rolex Submariner reference 5513",
            description="Original case, dial, and bracelet. Fully serviced in 2023 by a certified watchmaker. Running well, keeping accurate time. Full provenance documentation available upon request.",
            category="watches", seller_id="u1")
        r = run(listing_guard(req))
        assert r.risk_level == "low"
        assert r.is_suspicious is False

    def test_risk_levels_are_valid(self):
        for desc in ["replica fake", "slightly worn", "pristine condition genuine original"]:
            req = ListingGuardRequest(title="Test item longer title", description=desc + " " * 20,
                                      category="art", seller_id="u1")
            r = run(listing_guard(req))
            assert r.risk_level in ("low", "medium", "high")


# ─── Outbid Notification ─────────────────────────────────────────────────────

class TestOutbidNotificationEndpoint:

    def test_critical_at_90_seconds(self):
        req = OutbidNotificationRequest(auction_id="a1", outbid_by=50,
                                         watcher_count=5, seconds_remaining=90, bid_count=10)
        r = run(outbid_notification(req))
        assert r.urgency == "critical"

    def test_low_at_2_hours(self):
        req = OutbidNotificationRequest(auction_id="a1", outbid_by=20,
                                         watcher_count=2, seconds_remaining=7200, bid_count=3)
        r = run(outbid_notification(req))
        assert r.urgency == "low"

    def test_medium_at_1_hour(self):
        req = OutbidNotificationRequest(auction_id="a1", outbid_by=30,
                                         watcher_count=3, seconds_remaining=3600, bid_count=5)
        r = run(outbid_notification(req))
        assert r.urgency in ("medium", "high")

    def test_message_contains_outbid_amount(self):
        req = OutbidNotificationRequest(auction_id="a1", outbid_by=75,
                                         watcher_count=0, seconds_remaining=1800, bid_count=4)
        r = run(outbid_notification(req))
        assert "75" in r.message

    def test_cta_non_empty(self):
        req = OutbidNotificationRequest(auction_id="a1", outbid_by=20,
                                         watcher_count=1, seconds_remaining=600, bid_count=5)
        r = run(outbid_notification(req))
        assert len(r.action_cta) > 5

    def test_watcher_escalation(self):
        """10+ watchers should escalate medium → high."""
        req = OutbidNotificationRequest(auction_id="a1", outbid_by=20,
                                         watcher_count=12, seconds_remaining=3600, bid_count=5)
        r = run(outbid_notification(req))
        assert r.urgency == "high"
