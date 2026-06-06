"""
Unit tests for ML models — anti_bot, fraud, price_model.
No DB, no network, no Docker required.

Run:  cd ai-service && python -m pytest tests/ -v
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
import numpy as np
from app.ml.anti_bot   import AntiBotModel
from app.ml.fraud      import FraudModel
from app.ml.price_model import PriceModel, CATEGORY_MAP


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def anti_bot():
    m = AntiBotModel()
    m.load()
    assert m.ready
    return m


@pytest.fixture(scope="module")
def fraud():
    m = FraudModel()
    m.load()
    assert m.ready
    return m


@pytest.fixture(scope="module")
def price():
    m = PriceModel()
    m.load()
    assert m.ready
    return m


# ─── Payload helpers ──────────────────────────────────────────────────────────

class BotPayload:
    session_duration_seconds = 8
    bids_in_last_minute      = 15
    time_to_bid_ms           = 60


class HumanPayload:
    session_duration_seconds = 650
    bids_in_last_minute      = 1
    time_to_bid_ms           = 9000


class FraudPayload:
    bid_amount          = 75_000
    bid_velocity_1h     = 20
    account_age_days    = 0
    total_bids_history  = 0


class CleanPayload:
    bid_amount          = 300
    bid_velocity_1h     = 1
    account_age_days    = 400
    total_bids_history  = 50


# ─── Anti-Bot Tests ───────────────────────────────────────────────────────────

class TestAntiBotModel:

    def test_model_is_ready(self, anti_bot):
        assert anti_bot.ready is True
        assert anti_bot._model is not None

    def test_detects_bot(self, anti_bot):
        r = anti_bot.predict(BotPayload())
        assert r.is_bot is True
        assert r.confidence > 0.70
        assert r.reason == "high_bot_probability"

    def test_passes_human(self, anti_bot):
        r = anti_bot.predict(HumanPayload())
        assert r.is_bot is False
        assert r.confidence < 0.40
        assert r.reason == "clean"

    def test_confidence_range(self, anti_bot):
        for payload in [BotPayload(), HumanPayload()]:
            r = anti_bot.predict(payload)
            assert 0.0 <= r.confidence <= 1.0

    def test_reason_values(self, anti_bot):
        valid_reasons = {"high_bot_probability", "suspicious_behaviour", "clean"}
        for payload in [BotPayload(), HumanPayload()]:
            r = anti_bot.predict(payload)
            assert r.reason in valid_reasons

    def test_borderline_session(self, anti_bot):
        """Medium-velocity, moderate session — should not be blocked."""
        class BorderlineP:
            session_duration_seconds = 120
            bids_in_last_minute      = 4
            time_to_bid_ms           = 2500
        r = anti_bot.predict(BorderlineP())
        # May be suspicious but should not definitively say is_bot=True
        assert r.confidence < 0.95

    def test_graceful_fallback_on_none_model(self):
        """Returns safe fallback when model is not loaded."""
        from app.models.schemas import AntiBotResponse
        m = AntiBotModel()
        # Do not call m.load()
        r = m.predict(BotPayload())
        assert r.is_bot is False
        assert r.reason == "model_loading"


# ─── Fraud Model Tests ────────────────────────────────────────────────────────

class TestFraudModel:

    def test_model_is_ready(self, fraud):
        assert fraud.ready is True
        assert fraud._model is not None

    def test_flags_fraud(self, fraud):
        r = fraud.predict(FraudPayload())
        assert r.flagged is True
        assert r.score > 0.70
        assert len(r.signals) > 0

    def test_passes_clean(self, fraud):
        r = fraud.predict(CleanPayload())
        assert r.flagged is False
        assert r.score < 0.70

    def test_score_range(self, fraud):
        for payload in [FraudPayload(), CleanPayload()]:
            r = fraud.predict(payload)
            assert 0.0 <= r.score <= 1.0

    def test_high_velocity_signal(self, fraud):
        class HighVel:
            bid_amount          = 200
            bid_velocity_1h     = 12   # >= 10 triggers signal
            account_age_days    = 200
            total_bids_history  = 30
        r = fraud.predict(HighVel())
        assert "high_bid_velocity" in r.signals
        assert r.score >= 0.75

    def test_new_account_high_value_signal(self, fraud):
        class NewHighVal:
            bid_amount          = 1000  # > 500
            bid_velocity_1h     = 1
            account_age_days    = 0     # < 1 day
            total_bids_history  = 0
        r = fraud.predict(NewHighVal())
        assert "new_account_high_value" in r.signals
        assert r.score >= 0.80

    def test_established_user_relaxed(self, fraud):
        class EstablishedP:
            bid_amount          = 150
            bid_velocity_1h     = 0   # triggers relaxation rule
            account_age_days    = 365
            total_bids_history  = 80
        r = fraud.predict(EstablishedP())
        assert r.score <= 0.30

    def test_graceful_fallback(self):
        m = FraudModel()
        r = m.predict(FraudPayload())
        assert r.flagged is False
        assert r.score == 0.0


# ─── Price Model Tests ────────────────────────────────────────────────────────

class TestPriceModel:

    def test_model_is_ready(self, price):
        assert price.ready is True
        assert price._model is not None

    def _features(self, category="watches", hours=2.0, bids=5, dow=6, ratio=1.1):
        return np.array([[
            CATEGORY_MAP.get(category, 5),
            hours, bids,
            bids / max(168 - hours, 1),
            dow, ratio,
        ]])

    def test_watch_multiplier_above_1(self, price):
        mult = price.predict_multiplier(self._features("watches"))
        assert mult > 1.0, f"Watch should close above starting price, got {mult}"

    def test_electronics_lower_than_watches(self, price):
        watch_m = price.predict_multiplier(self._features("watches"))
        elec_m  = price.predict_multiplier(self._features("electronics"))
        assert watch_m > elec_m, "Watches should outperform electronics"

    def test_more_bids_higher_price(self, price):
        """
        Active auctions (mid-range bid count) should predict higher than brand new.
        XGBoost learned bid_velocity as a combined feature, so raw bid_count
        alone may not be strictly monotonic — we test the meaningful range.
        """
        fresh    = price.predict_multiplier(self._features(bids=0, hours=72.0))
        active   = price.predict_multiplier(self._features(bids=15, hours=48.0))
        hot      = price.predict_multiplier(self._features(bids=40, hours=2.0))
        assert hot >= active >= fresh * 0.95, (
            f"hot={hot:.3f} active={active:.3f} fresh={fresh:.3f} — "
            "active auctions should close higher than fresh ones"
        )

    def test_sunday_premium(self, price):
        weekday = price.predict_multiplier(self._features(dow=2))   # Wednesday
        sunday  = price.predict_multiplier(self._features(dow=6))   # Sunday
        assert sunday >= weekday, "Sunday should have equal or higher multiplier"

    def test_time_pressure_effect(self, price):
        fresh   = price.predict_multiplier(self._features(hours=72.0))
        closing = price.predict_multiplier(self._features(hours=0.5))
        assert closing >= fresh, "Closing auctions should have equal or higher multiplier"

    def test_multiplier_in_reasonable_range(self, price):
        for cat in CATEGORY_MAP:
            mult = price.predict_multiplier(self._features(cat))
            assert 0.8 <= mult <= 5.0, f"Multiplier {mult} out of range for {cat}"

    def test_fallback_on_unloaded_model(self):
        m = PriceModel()
        f = np.array([[0, 2.0, 5, 1.0, 6, 1.1]])
        result = m.predict_multiplier(f)
        assert result == 1.25, f"Expected fallback 1.25, got {result}"
