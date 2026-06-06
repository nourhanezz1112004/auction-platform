"""
Price Prediction Model — XGBoost Regressor.

Target: final_price / starting_price  (the "multiplier")

Features:
  category_encoded    : label-encoded category
  hours_remaining     : time left at prediction moment
  bid_count           : number of bids so far
  bid_velocity        : bids_last_hour / max(hours_elapsed, 1)
  day_of_week         : 0=Mon … 6=Sun (weekend auctions close higher)
  price_ratio         : current_price / starting_price (momentum indicator)

Training data: 8,000 synthetic auctions calibrated to realistic auction
dynamics (watches close at 1.4–1.6x, cameras 1.2–1.4x, art 1.3–1.8x).

The model is trained on startup if no artifact exists (~0.5s).
"""

from __future__ import annotations

import logging
import os
import pickle
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

ARTIFACT_PATH = Path(
    os.getenv("MODEL_ARTIFACTS_PATH", "app/ml/artifacts")
) / "price_model.pkl"

# Category encoding — must match schemas.py category names
CATEGORY_MAP = {
    "watches":     0,
    "cameras":     1,
    "art":         2,
    "jewellery":   3,
    "electronics": 4,
    "other":       5,
}

# Realistic final-price multipliers per category (mean, std)
CATEGORY_STATS = {
    0: (1.48, 0.22),   # watches
    1: (1.31, 0.18),   # cameras
    2: (1.62, 0.30),   # art
    3: (1.52, 0.25),   # jewellery
    4: (1.19, 0.15),   # electronics
    5: (1.25, 0.20),   # other
}


def _make_training_data() -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(7)
    n   = 8_000

    categories     = rng.integers(0, 6, n)
    hours_rem      = rng.uniform(0, 168, n)     # up to 7 days
    bid_count      = rng.poisson(14, n).clip(0, 200)
    bid_velocity   = (bid_count / np.maximum(168 - hours_rem, 1)).clip(0, 10)
    day_of_week    = rng.integers(0, 7, n)
    price_ratio    = 1.0 + rng.exponential(0.08, n)   # current/start

    # Ground-truth multiplier with realistic noise
    multipliers = np.array([
        rng.normal(*CATEGORY_STATS[int(c)]) for c in categories
    ])

    # Time pressure bonus: last 6 hours adds ~10%
    time_bonus = np.where(hours_rem < 6, 0.10, 0.0)

    # Bid activity bonus: highly contested auctions close higher
    bid_bonus  = np.clip(bid_count * 0.003, 0, 0.25)

    # Weekend bonus
    weekend_bonus = np.where(day_of_week >= 5, 0.05, 0.0)

    y = (multipliers + time_bonus + bid_bonus + weekend_bonus).clip(0.8, 4.0)

    X = np.column_stack([
        categories,
        hours_rem,
        bid_count,
        bid_velocity,
        day_of_week,
        price_ratio,
    ])

    return X, y


class PriceModel:
    """Singleton — loaded by auction_intelligence.py on import."""

    def __init__(self) -> None:
        self._model = None
        self.ready  = False

    def load(self) -> None:
        try:
            if ARTIFACT_PATH.exists():
                with open(ARTIFACT_PATH, "rb") as f:
                    self._model = pickle.load(f)
                logger.info("Price model loaded from artifact.")
            else:
                self._train_and_save()
            self.ready = True
        except Exception as e:
            logger.error(f"Price model load failed: {e}")
            self.ready = False

    def _train_and_save(self) -> None:
        from xgboost import XGBRegressor

        logger.info("Training price prediction XGBoost model…")
        X, y = _make_training_data()

        split     = int(len(X) * 0.85)
        X_tr, X_val = X[:split], X[split:]
        y_tr, y_val = y[:split], y[split:]

        model = XGBRegressor(
            n_estimators=400,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            early_stopping_rounds=20,
            eval_metric="rmse",
            random_state=42,
        )
        model.fit(
            X_tr, y_tr,
            eval_set=[(X_val, y_val)],
            verbose=False,
        )

        ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(ARTIFACT_PATH, "wb") as f:
            pickle.dump(model, f)

        self._model = model
        logger.info("Price model trained and saved.")

    def predict_multiplier(self, features: np.ndarray) -> float:
        if not self.ready or self._model is None:
            return 1.25   # neutral fallback
        return float(self._model.predict(features)[0])


# Singleton
price_model = PriceModel()
