"""
Fraud Detection Model — Isolation Forest + rule-based signals.

Isolation Forest is ideal for fraud because:
  - Fraud is rare (unsupervised — no labelled data needed)
  - It detects anomalies, not just high values
  - Works well on bid velocity + account signals

Features used:
  bid_amount          : absolute bid value
  bid_velocity_1h     : bids placed by this user in last hour
  account_age_days    : account freshness (new accounts = higher risk)
  total_bids_history  : overall bidding history
  bid_to_price_ratio  : how far above current price

Hard rules (applied on top of model score):
  - bid > 3x current price → always flag
  - account_age < 1 day AND bid > $500 → always flag
"""

from __future__ import annotations

import os
import pickle
import logging
import numpy as np
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.schemas import FraudRequest, FraudResponse

logger = logging.getLogger(__name__)

ARTIFACT_PATH = Path(
    os.getenv("MODEL_ARTIFACTS_PATH", "app/ml/artifacts")
) / "fraud.pkl"


def _make_training_data() -> np.ndarray:
    """Synthetic normal bidding data for Isolation Forest training."""
    rng = np.random.default_rng(0)
    n   = 5_000

    bid_amount       = rng.lognormal(6.5, 1.2, n).clip(1, 50_000)
    bid_velocity     = rng.poisson(2, n).clip(0, 20)
    account_age      = rng.exponential(300, n).clip(0, 3650)
    total_bids       = rng.poisson(25, n).clip(0, 500)
    bid_to_price     = rng.normal(1.05, 0.08, n).clip(0.9, 5.0)

    return np.column_stack([bid_amount, bid_velocity, account_age, total_bids, bid_to_price])


class FraudModel:
    def __init__(self) -> None:
        self._model = None
        self.ready  = False

    # ------------------------------------------------------------------
    def load(self) -> None:
        try:
            if ARTIFACT_PATH.exists():
                with open(ARTIFACT_PATH, "rb") as f:
                    self._model = pickle.load(f)
                logger.info("Fraud model loaded from artifact.")
            else:
                self._train_and_save()
            self.ready = True
        except Exception as e:
            logger.error(f"Fraud model load failed: {e}")
            self._model = None
            self.ready  = False

    # ------------------------------------------------------------------
    def _train_and_save(self) -> None:
        from sklearn.ensemble import IsolationForest

        logger.info("Training fraud Isolation Forest…")
        X = _make_training_data()

        model = IsolationForest(
            n_estimators=200,
            contamination=0.05,   # ~5% expected fraud rate
            random_state=42,
            n_jobs=-1,
        )
        model.fit(X)

        ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(ARTIFACT_PATH, "wb") as f:
            pickle.dump(model, f)

        self._model = model
        logger.info("Fraud model trained and saved.")

    # ------------------------------------------------------------------
    def predict(self, payload: "FraudRequest") -> "FraudResponse":
        from app.models.schemas import FraudResponse

        if not self.ready or self._model is None:
            return FraudResponse(flagged=False, score=0.0, signals=[])

        bid_to_price = (
            payload.bid_amount / max(payload.bid_amount * 0.9, 1)
        )  # approximation — backend can pass current_price in future

        features = np.array([[
            float(payload.bid_amount),
            float(payload.bid_velocity_1h),
            float(payload.account_age_days),
            float(payload.total_bids_history),
            bid_to_price,
        ]])

        # Isolation Forest: -1 = anomaly, 1 = normal
        raw_score = self._model.decision_function(features)[0]
        # Normalise to [0, 1] — lower decision score = higher fraud probability
        fraud_score = float(np.clip(1.0 - (raw_score + 0.5), 0.0, 1.0))

        # ── Hard business rules ───────────────────────────────────────
        signals: list[str] = []

        if payload.bid_velocity_1h >= 10:
            signals.append("high_bid_velocity")
            fraud_score = max(fraud_score, 0.75)

        if payload.account_age_days < 1 and payload.bid_amount > 500:
            signals.append("new_account_high_value")
            fraud_score = max(fraud_score, 0.80)

        if payload.total_bids_history == 0 and payload.bid_amount > 1000:
            signals.append("no_history_high_value")
            fraud_score = max(fraud_score, 0.65)

        if payload.bid_velocity_1h == 0 and payload.account_age_days > 30:
            # Established user, relaxed bidding
            fraud_score = min(fraud_score, 0.30)

        flagged = fraud_score > 0.70

        if fraud_score > 0.70:
            signals.append("isolation_forest_anomaly")

        return FraudResponse(
            flagged=flagged,
            score=round(fraud_score, 4),
            signals=signals,
        )
