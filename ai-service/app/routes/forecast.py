# ai-service/app/routes/forecast.py
# Three remaining features:
#   1. /forecast/demand — 30-day GMV forecast per category
#   2. /forecast/reputation — bidder trust score lookup
#   3. /retrain/check — auto-retrains when 500+ new bids arrive

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import os, psycopg2, joblib
from pathlib import Path
from datetime import datetime, timezone
import numpy as np

router = APIRouter(tags=["forecast-reputation"])
MODELS_DIR = Path(__file__).parent.parent.parent / "models"
CATEGORIES  = ["watches","cameras","art","jewelry","electronics","other"]

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def load_model(name: str):
    path = MODELS_DIR / name
    return joblib.load(path) if path.exists() else None


# ── 1. Demand forecast ────────────────────────────────────────────

class DemandForecastRequest(BaseModel):
    category: str
    weeks_ahead: int = 4


class DemandForecastResponse(BaseModel):
    category: str
    weeks_ahead: int
    forecasted_gmv: list[float]
    week_labels: list[str]
    trend: str               # up | stable | down
    confidence: str          # high | medium | low
    recommendation: str      # great time to list / market saturating / etc.


@router.post("/forecast/demand", response_model=DemandForecastResponse)
def forecast_demand(req: DemandForecastRequest):
    bundle = load_model("demand_forecast.joblib")

    # Fallback: use recent DB trend if model not trained
    if not bundle or req.category not in bundle.get("models", {}):
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT
                    TO_CHAR(DATE_TRUNC('week', b."createdAt"),'YYYY-MM-DD') AS wk,
                    SUM(b.amount) AS gmv
                FROM "Bid" b
                JOIN "Auction" a ON a.id = b."auctionId"
                WHERE a.category = %s
                  AND b."createdAt" > NOW() - INTERVAL '12 weeks'
                GROUP BY DATE_TRUNC('week', b."createdAt")
                ORDER BY wk DESC LIMIT 4
            """, [req.category])
            rows = cur.fetchall()
        finally:
            conn.close()

        if not rows:
            return DemandForecastResponse(
                category=req.category, weeks_ahead=req.weeks_ahead,
                forecasted_gmv=[0.0] * req.weeks_ahead,
                week_labels=[f"Week +{i+1}" for i in range(req.weeks_ahead)],
                trend="stable", confidence="low",
                recommendation="Not enough data to forecast — relist and see",
            )

        avg_gmv = float(np.mean([float(r[1]) for r in rows]))
        forecasted = [round(avg_gmv * (1 + i * 0.02), 2) for i in range(req.weeks_ahead)]
        trend = "up" if len(rows) >= 2 and float(rows[0][1]) > float(rows[-1][1]) else "stable"
        return DemandForecastResponse(
            category=req.category, weeks_ahead=req.weeks_ahead,
            forecasted_gmv=forecasted,
            week_labels=[f"Week +{i+1}" for i in range(req.weeks_ahead)],
            trend=trend, confidence="low",
            recommendation="Based on recent 4-week average (train model for better accuracy)",
        )

    # Use trained model
    model   = bundle["models"][req.category]
    scaler, feature_cols = bundle["scalers"][req.category]

    # Build a seed feature vector from the most recent week's data
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT SUM(b.amount), COUNT(DISTINCT b."bidderId"), COUNT(DISTINCT b."auctionId")
            FROM "Bid" b JOIN "Auction" a ON a.id=b."auctionId"
            WHERE a.category=%s AND b."createdAt">NOW()-INTERVAL '1 week'
        """, [req.category])
        seed = cur.fetchone()
    finally:
        conn.close()

    seed_gmv     = float(seed[0] or 0)
    seed_bidders = float(seed[1] or 0)

    forecasted   = []
    labels       = []
    current_gmv  = seed_gmv

    for i in range(req.weeks_ahead):
        features = np.zeros(len(feature_cols))
        for j, col in enumerate(feature_cols):
            if "gmv_lag_1" in col:   features[j] = current_gmv
            if "bidders_lag_1" in col: features[j] = seed_bidders
            if "gmv_roll4_mean" in col: features[j] = current_gmv
            if "week_of_year" in col:
                features[j] = (datetime.now(timezone.utc).isocalendar()[1] + i) % 52

        X = scaler.transform([features])
        pred = float(model.predict(X)[0])
        forecasted.append(round(max(pred, 0), 2))
        labels.append(f"Week +{i+1}")
        current_gmv = pred

    trend = (
        "up"   if forecasted[-1] > forecasted[0] * 1.05
        else "down" if forecasted[-1] < forecasted[0] * 0.95
        else "stable"
    )

    rec = (
        "Demand forecast is growing — great time to list"      if trend == "up"
        else "Market may be cooling — consider waiting 2 weeks" if trend == "down"
        else "Stable demand — good conditions to list now"
    )

    return DemandForecastResponse(
        category=req.category, weeks_ahead=req.weeks_ahead,
        forecasted_gmv=forecasted, week_labels=labels,
        trend=trend, confidence="high", recommendation=rec,
    )


# ── 2. Reputation score ───────────────────────────────────────────

class ReputationRequest(BaseModel):
    user_id: str


class ReputationResponse(BaseModel):
    user_id: str
    trust_score: float          # 0–10
    trust_label: str            # New | Building | Trusted | Verified | Elite
    badge_color: str            # neutral | blue | green | gold | platinum
    computed_at: Optional[str]


@router.post("/reputation/score", response_model=ReputationResponse)
def reputation_score(req: ReputationRequest):
    bundle = load_model("reputation_scores.joblib")
    score = bundle["scores"].get(req.user_id, 5.0) if bundle else 5.0

    label, color = (
        ("Elite",     "platinum") if score >= 9   else
        ("Verified",  "gold")     if score >= 7   else
        ("Trusted",   "green")    if score >= 5   else
        ("Building",  "blue")     if score >= 3   else
        ("New",       "neutral")
    )

    return ReputationResponse(
        user_id=req.user_id,
        trust_score=round(score, 2),
        trust_label=label,
        badge_color=color,
        computed_at=bundle.get("computed_at") if bundle else None,
    )


# ── 3. Auto-retrain trigger ───────────────────────────────────────

_last_bid_count: int = 0
RETRAIN_THRESHOLD = 500   # retrain every 500 new bids


@router.post("/retrain/check")
async def check_retrain(background_tasks: BackgroundTasks):
    """
    Call this endpoint periodically (e.g. from a cron every hour).
    Retrains all models if 500+ new bids have arrived since last retrain.
    """
    global _last_bid_count

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute('SELECT COUNT(*) FROM "Bid"')
        current_count = int(cur.fetchone()[0])
    finally:
        conn.close()

    new_bids = current_count - _last_bid_count

    if new_bids >= RETRAIN_THRESHOLD:
        background_tasks.add_task(_retrain_all)
        _last_bid_count = current_count
        return {
            "retraining": True,
            "new_bids": new_bids,
            "message": "Retraining triggered in background",
        }

    return {
        "retraining": False,
        "new_bids": new_bids,
        "bids_until_retrain": RETRAIN_THRESHOLD - new_bids,
    }


def _retrain_all():
    """Background task — retrains all models and hot-swaps them."""
    import subprocess, sys
    print("[retrain] Starting full model retrain…")
    try:
        subprocess.run(
            [sys.executable, "-m", "app.models.train_models"],
            env={**os.environ},
            timeout=600,
            check=True,
        )
        subprocess.run(
            [sys.executable, "-m", "app.models.train_advanced_models"],
            env={**os.environ},
            timeout=600,
            check=True,
        )
        # Hot-swap via model store
        from ..services.model_store import model_store
        model_store.reload()
        print("[retrain] Complete — models hot-swapped")
    except Exception as e:
        print(f"[retrain] Failed: {e}")
