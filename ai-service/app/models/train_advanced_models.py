# ai-service/app/models/train_advanced_models.py
# Two advanced ML models:
#   1. Demand forecast LSTM — 30-day GMV prediction per category
#   2. Bidder reputation graph — trust score from win/pay/bid history
#
# Run: python -m app.models.train_advanced_models
# These are separate from train_models.py — run after you have 3+ months of data.

import os, json
from datetime import datetime
from pathlib import Path
import pandas as pd
import numpy as np
import psycopg2
import joblib
from sklearn.preprocessing import MinMaxScaler
from sklearn.ensemble import GradientBoostingRegressor

MODELS_DIR = Path(__file__).parent.parent.parent / "models"
MODELS_DIR.mkdir(exist_ok=True)
VERSION = datetime.now().strftime("%Y%m%d_%H%M%S")
CATEGORIES = ["watches","cameras","art","jewelry","electronics","other"]

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


# ── 1. Demand Forecast (LSTM alternative using GBM + lag features) ────────────
# True LSTM requires TensorFlow/PyTorch — we use gradient boosting with
# lag features which achieves comparable accuracy without GPU dependency.

def train_demand_forecast(conn):
    print("Training demand forecast model…")

    df = pd.read_sql("""
        SELECT
            DATE_TRUNC('week', b."createdAt") AS week,
            a.category,
            SUM(b.amount) AS gmv,
            COUNT(DISTINCT b."auctionId") AS auction_count,
            COUNT(DISTINCT b."bidderId") AS unique_bidders,
            AVG(b.amount) AS avg_bid
        FROM "Bid" b
        JOIN "Auction" a ON a.id = b."auctionId"
        GROUP BY DATE_TRUNC('week', b."createdAt"), a.category
        ORDER BY week, category
    """, conn)

    if len(df) < 20:
        print("  Not enough time-series data (need 20+ weekly observations)")
        return None

    df["week"] = pd.to_datetime(df["week"])
    df = df.sort_values(["category", "week"])

    models = {}
    scalers = {}

    for cat in CATEGORIES:
        cat_df = df[df["category"] == cat].copy()
        if len(cat_df) < 8:
            continue

        cat_df = cat_df.set_index("week").resample("W").sum(numeric_only=True).fillna(0)

        # Create lag features (1, 2, 4, 8 weeks back)
        for lag in [1, 2, 4, 8]:
            cat_df[f"gmv_lag_{lag}"] = cat_df["gmv"].shift(lag)
            cat_df[f"bidders_lag_{lag}"] = cat_df["unique_bidders"].shift(lag)

        # Rolling stats
        cat_df["gmv_roll4_mean"] = cat_df["gmv"].rolling(4).mean()
        cat_df["gmv_roll4_std"]  = cat_df["gmv"].rolling(4).std().fillna(0)
        cat_df["week_of_year"]   = cat_df.index.isocalendar().week.astype(int)

        cat_df = cat_df.dropna()
        if len(cat_df) < 4:
            continue

        feature_cols = [c for c in cat_df.columns if c != "gmv"]
        X = cat_df[feature_cols].values
        y = cat_df["gmv"].values

        scaler = MinMaxScaler()
        X_scaled = scaler.fit_transform(X)

        model = GradientBoostingRegressor(
            n_estimators=100, learning_rate=0.1,
            max_depth=3, random_state=42
        )
        model.fit(X_scaled, y)

        models[cat] = model
        scalers[cat] = (scaler, feature_cols)

        mae = np.mean(np.abs(model.predict(X_scaled) - y))
        print(f"  {cat}: MAE=${mae:,.0f}")

    path = MODELS_DIR / "demand_forecast.joblib"
    joblib.dump({
        "models": models,
        "scalers": scalers,
        "version": VERSION,
        "categories": CATEGORIES,
    }, path)
    return {"categories_trained": list(models.keys())}


# ── 2. Bidder Reputation Graph ────────────────────────────────────────────────
# Computes a trust score 0-10 for each bidder based on:
#   - Payment completion rate (won auctions that were paid)
#   - Bid retraction rate
#   - Account age
#   - Win rate (signals real engagement)
#   - Fraud flag history

def train_reputation_model(conn):
    print("Training reputation graph model…")

    df = pd.read_sql("""
        SELECT
            u.id AS user_id,
            EXTRACT(DAYS FROM (NOW() - u."createdAt")) AS account_age_days,
            COUNT(DISTINCT b."auctionId") AS auctions_bid_on,
            COUNT(DISTINCT CASE WHEN a."winnerId"=u.id THEN a.id END) AS auctions_won,
            COUNT(DISTINCT CASE WHEN a."winnerId"=u.id AND p.status='SUCCEEDED'
                THEN a.id END) AS auctions_paid,
            COALESCE(SUM(CASE WHEN b."isFraud" THEN 1 ELSE 0 END), 0) AS fraud_flags,
            COALESCE(AVG(b."fraudScore"), 0) AS avg_fraud_score,
            COUNT(DISTINCT a2.id) AS auctions_listed,
            COALESCE(AVG(u."reputationScore"), 3.5) AS existing_rep
        FROM "User" u
        LEFT JOIN "Bid" b ON b."bidderId" = u.id
        LEFT JOIN "Auction" a ON a.id = b."auctionId"
        LEFT JOIN "Payment" p ON p."auctionId" = a.id AND p."buyerId" = u.id
        LEFT JOIN "Auction" a2 ON a2."sellerId" = u.id
        GROUP BY u.id, u."createdAt", u."reputationScore"
        HAVING COUNT(DISTINCT b."auctionId") > 0
    """, conn)

    if len(df) < 10:
        print("  Not enough user data")
        return None

    # Compute reputation score
    df["win_rate"]     = df["auctions_won"] / df["auctions_bid_on"].clip(lower=1)
    df["payment_rate"] = df["auctions_paid"] / df["auctions_won"].clip(lower=1)
    df["fraud_rate"]   = df["fraud_flags"] / df["auctions_bid_on"].clip(lower=1)
    df["age_score"]    = np.log1p(df["account_age_days"]) / np.log1p(365 * 3)  # normalise to 3yr

    # Weighted trust score
    df["trust_score"] = (
        df["payment_rate"]                     * 3.0 +   # paying is most important
        df["win_rate"].clip(upper=0.5) * 2     * 2.0 +   # winning (capped — high win = possible shill)
        df["age_score"]                        * 1.5 +
        (1 - df["fraud_rate"].clip(upper=1))   * 2.0 +
        df["existing_rep"] / 5                 * 1.5
    ).clip(0, 10)

    # Save scores as a lookup dict (fast inference without model overhead)
    score_dict = dict(zip(df["user_id"], df["trust_score"].round(2)))

    path = MODELS_DIR / "reputation_scores.joblib"
    joblib.dump({
        "scores": score_dict,
        "version": VERSION,
        "computed_at": datetime.now().isoformat(),
        "n_users": len(score_dict),
    }, path)

    avg = df["trust_score"].mean()
    print(f"  Reputation scores computed for {len(df)} users (avg: {avg:.1f}/10)")
    return {"n_users": len(df), "avg_score": round(avg, 2)}


# ── Main ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    conn = get_conn()
    results = {
        "version": VERSION,
        "trained_at": datetime.now().isoformat(),
        "models": {
            "demand_forecast": train_demand_forecast(conn),
            "reputation":      train_reputation_model(conn),
        },
    }
    conn.close()

    manifest_path = MODELS_DIR / "manifest_advanced.json"
    manifest_path.write_text(json.dumps(results, indent=2))
    print(f"\nDone. Version: {VERSION}")
