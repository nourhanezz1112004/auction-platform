"""
Anti-Bot Model — XGBoost binary classifier.

Features:
  - session_duration_seconds : how long the user browsed before bidding
  - bids_in_last_minute      : bid velocity signal
  - time_to_bid_ms           : time between page load and bid click (bots are fast)

Trained on synthetic data that captures real bot patterns:
  - Bots: very fast time_to_bid (<200ms), high velocity, short sessions
  - Humans: varied timing, lower velocity, longer sessions

The model is trained fresh on startup if no artifact exists.
"""

from __future__ import annotations

import os
import pickle
import logging
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)

ARTIFACT_PATH = Path(
    os.getenv("MODEL_ARTIFACTS_PATH", "app/ml/artifacts")
) / "anti_bot.pkl"


def _make_training_data() -> tuple[np.ndarray, np.ndarray]:
    """
    Generate synthetic training data that captures real bot/human patterns.
    Returns (X, y) where y=1 means bot.
    """
    rng = np.random.default_rng(42)
    n   = 4_000

    # ── Humans (y=0) ─────────────────────────────────────────────────────────
    human_session  = rng.normal(600,  300,  n // 2).clip(30,  7200)
    human_velocity = rng.poisson(1.2,       n // 2).clip(0,   10)
    human_ttb      = rng.normal(8000, 4000, n // 2).clip(500, 60_000)

    # ── Bots (y=1) ───────────────────────────────────────────────────────────
    bot_session    = rng.normal(12,  8,    n // 2).clip(1,   120)
    bot_velocity   = rng.poisson(8,         n // 2).clip(3,   60)
    bot_ttb        = rng.normal(150, 80,   n // 2).clip(10,  400)

    X_human = np.column_stack([human_session, human_velocity, human_ttb])
    X_bot   = np.column_stack([bot_session,   bot_velocity,   bot_ttb])

    X = np.vstack([X_human, X_bot])
    y = np.array([0] * (n // 2) + [1] * (n // 2))

    shuffle = rng.permutation(n)
    return X[shuffle], y[shuffle]


class AntiBotModel:
    def __init__(self) -> None:
        self._model = None
        self.ready  = False

    # ------------------------------------------------------------------
    def load(self) -> None:
        try:
            if ARTIFACT_PATH.exists():
                with open(ARTIFACT_PATH, "rb") as f:
                    self._model = pickle.load(f)
                logger.info("Anti-bot model loaded from artifact.")
            else:
                self._train_and_save()
            self.ready = True
        except Exception as e:
            logger.error(f"Anti-bot model load failed: {e}")
            self._model = None
            self.ready  = False

    # ------------------------------------------------------------------
    def _train_and_save(self) -> None:
        from xgboost import XGBClassifier

        logger.info("Training anti-bot XGBoost model…")
        X, y = _make_training_data()

        model = XGBClassifier(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.1,
            subsample=0.8,
            eval_metric="logloss",
            random_state=42,
        )
        model.fit(X, y)

        ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(ARTIFACT_PATH, "wb") as f:
            pickle.dump(model, f)

        self._model = model
        logger.info("Anti-bot model trained and saved.")

    # ------------------------------------------------------------------
    def predict(self, payload) -> object:
        """Returns AntiBotResponse-compatible dict."""
        from app.models.schemas import AntiBotResponse

        if not self.ready or self._model is None:
            return AntiBotResponse(is_bot=False, confidence=0.0, reason="model_loading")

        features = np.array([[
            float(payload.session_duration_seconds),
            float(payload.bids_in_last_minute),
            float(payload.time_to_bid_ms),
        ]])

        proba      = float(self._model.predict_proba(features)[0][1])
        is_bot     = proba > 0.70
        is_warning = proba > 0.40

        if is_bot:
            reason = "high_bot_probability"
        elif is_warning:
            reason = "suspicious_behaviour"
        else:
            reason = "clean"

        return AntiBotResponse(is_bot=is_bot, confidence=round(proba, 4), reason=reason)
