# ai-service/app/routes/live_auction.py
# ══════════════════════════════════════════════════════════════════════
# BidSpace AI — Live Auction AI Overlays v2.0
# IMPROVEMENTS:
#   • Momentum composite score with 5 sub-signals (was 3)
#   • Price acceleration = current rate vs 60-min-ago rate
#   • Forecast: uses price prediction model + real-time bid slope
#   • Endpoint now caches per-auction for 20s (prevents DB hammering)
#   • Added /live/snapshot/:id — all overlays in single call (reduce roundtrips)
# ══════════════════════════════════════════════════════════════════════

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional
import os, psycopg2
import numpy as np
from datetime import datetime, timezone, timedelta
import time
from ..services.model_store import model_store

router = APIRouter(prefix="/live", tags=["live-auction"])
CATEGORIES = ["watches","cameras","art","jewelry","electronics","other"]

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])
def _cat_enc(cat):
    try: return CATEGORIES.index(cat.lower())
    except: return len(CATEGORIES) - 1

# Per-auction cache {auction_id: {data, ts}}
_cache: dict = {}
_CACHE_TTL = 20  # seconds


# ── Schemas ────────────────────────────────────────────────────────────────────

class MomentumResponse(BaseModel):
    auction_id:        str
    momentum_score:    float    # 0–10
    label:             str      # Cool | Warming | Hot | 🔥 Frenzy
    bid_velocity_5m:   float    # bids/min last 5 min
    bid_velocity_60m:  float    # bids/min last 60 min
    watcher_count:     int
    seconds_remaining: float
    price_acceleration: float   # (vel_5m - vel_60m) / max(vel_60m, 0.01)
    signals:           dict     # sub-scores for transparency
    confidence:        str

class PriceForecastResponse(BaseModel):
    auction_id:       str
    current_price:    float
    forecast_price:   float
    confidence_low:   float
    confidence_high:  float
    price_range_label: str      # e.g. "$1,200 – $1,600"
    seconds_until_close: float
    model_version:    str

class AuctionSnapshotResponse(BaseModel):
    """All live AI overlays in one call — use this to reduce frontend roundtrips."""
    auction_id:  str
    momentum:    MomentumResponse
    forecast:    PriceForecastResponse
    model_version: str


# ── DB helpers ─────────────────────────────────────────────────────────────────

def _auction_meta(cur, auction_id: str) -> Optional[dict]:
    cur.execute("""
        SELECT "endTime", "startTime", "currentPrice", "reservePrice",
               status, category, "sellerId"
        FROM "Auction" WHERE id = %s
    """, [auction_id])
    row = cur.fetchone()
    if not row:
        return None
    return {
        "end_time": row[0], "start_time": row[1], "current_price": float(row[2] or 0),
        "reserve_price": float(row[3] or 0), "status": row[4],
        "category": row[5], "seller_id": row[6],
    }

def _bid_velocity(cur, auction_id: str, minutes: int) -> float:
    cur.execute("""
        SELECT COUNT(*) FROM "Bid"
        WHERE "auctionId" = %s AND "createdAt" > NOW() - INTERVAL '%s minutes'
    """, [auction_id, minutes])
    count = cur.fetchone()[0] or 0
    return count / max(minutes, 1)

def _watcher_count(cur, auction_id: str) -> int:
    try:
        cur.execute('SELECT COUNT(*) FROM "WatchlistItem" WHERE "auctionId" = %s', [auction_id])
        return int(cur.fetchone()[0] or 0)
    except Exception:
        return 0

def _price_60m_ago(cur, auction_id: str) -> float:
    cur.execute("""
        SELECT amount FROM "Bid"
        WHERE "auctionId" = %s AND "createdAt" < NOW() - INTERVAL '60 minutes'
        ORDER BY "createdAt" DESC LIMIT 1
    """, [auction_id])
    row = cur.fetchone()
    return float(row[0]) if row else 0.0

def _bid_count(cur, auction_id: str) -> int:
    cur.execute('SELECT COUNT(*) FROM "Bid" WHERE "auctionId" = %s', [auction_id])
    return int(cur.fetchone()[0] or 0)


# ── Momentum computation ───────────────────────────────────────────────────────

def _compute_momentum(vel_5m: float, vel_60m: float, watchers: int,
                       secs_remaining: float, total_secs: float,
                       acceleration: float) -> tuple[float, str, dict]:
    # 5 sub-signals (each 0-1, weighted)
    velocity_sig    = min(vel_5m / 2.0, 1.0)           # 2 bids/min = max
    watcher_sig     = min(watchers / 30.0, 1.0)         # 30 watchers = max
    urgency_sig     = 1.0 - min(secs_remaining / max(total_secs * 0.3, 1), 1.0)
    accel_sig       = min(max(acceleration, 0) / 3.0, 1.0)
    sustained_sig   = min(vel_60m / 0.5, 1.0)           # 0.5 bids/min over hour = max

    weights = [0.30, 0.20, 0.20, 0.20, 0.10]
    sigs    = [velocity_sig, watcher_sig, urgency_sig, accel_sig, sustained_sig]
    score   = sum(w * s for w, s in zip(weights, sigs)) * 10

    label = (
        "🔥 Frenzy" if score >= 8 else
        "Hot"       if score >= 6 else
        "Warming"   if score >= 3 else
        "Cool"
    )
    signals = {
        "bid_velocity":  round(velocity_sig, 3),
        "watcher_count": round(watcher_sig, 3),
        "time_urgency":  round(urgency_sig, 3),
        "acceleration":  round(accel_sig, 3),
        "sustained":     round(sustained_sig, 3),
    }
    return round(score, 2), label, signals


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/momentum/{auction_id}", response_model=MomentumResponse)
def bid_momentum(auction_id: str):
    """Live momentum score. Call every 30s via TanStack Query refetchInterval."""
    cached = _cache.get(f"mom:{auction_id}")
    if cached and (time.time() - cached["ts"]) < _CACHE_TTL:
        return cached["data"]

    try:
        conn = get_conn()
        cur  = conn.cursor()
        meta = _auction_meta(cur, auction_id)

        if not meta:
            conn.close()
            return MomentumResponse(
                auction_id=auction_id, momentum_score=0, label="Unknown",
                bid_velocity_5m=0, bid_velocity_60m=0, watcher_count=0,
                seconds_remaining=0, price_acceleration=0,
                signals={}, confidence="none",
            )

        now           = datetime.now(timezone.utc)
        end_time      = meta["end_time"].replace(tzinfo=timezone.utc) if meta["end_time"].tzinfo is None else meta["end_time"]
        start_time    = meta["start_time"].replace(tzinfo=timezone.utc) if meta["start_time"].tzinfo is None else meta["start_time"]
        secs_rem      = max((end_time - now).total_seconds(), 0)
        total_secs    = max((end_time - start_time).total_seconds(), 1)

        vel_5m   = _bid_velocity(cur, auction_id, 5)
        vel_60m  = _bid_velocity(cur, auction_id, 60)
        watchers = _watcher_count(cur, auction_id)
        accel    = (vel_5m - vel_60m) / max(vel_60m, 0.01)
        conn.close()

        score, label, signals = _compute_momentum(vel_5m, vel_60m, watchers, secs_rem, total_secs, accel)
        confidence = "high" if secs_rem < 3600 else "medium" if secs_rem < 86400 else "low"

        result = MomentumResponse(
            auction_id=auction_id, momentum_score=score, label=label,
            bid_velocity_5m=round(vel_5m, 3), bid_velocity_60m=round(vel_60m, 3),
            watcher_count=watchers, seconds_remaining=round(secs_rem, 0),
            price_acceleration=round(accel, 3), signals=signals, confidence=confidence,
        )
        _cache[f"mom:{auction_id}"] = {"data": result, "ts": time.time()}
        return result

    except Exception as e:
        return MomentumResponse(
            auction_id=auction_id, momentum_score=0, label="Error",
            bid_velocity_5m=0, bid_velocity_60m=0, watcher_count=0,
            seconds_remaining=0, price_acceleration=0,
            signals={"error": str(e)}, confidence="none",
        )


@router.get("/price-forecast/{auction_id}", response_model=PriceForecastResponse)
def price_forecast(auction_id: str):
    """
    Real-time price forecast. Uses ML price model + live bid slope.
    Updates every 60s (set refetchInterval=60000 on frontend).
    """
    cached = _cache.get(f"fcast:{auction_id}")
    if cached and (time.time() - cached["ts"]) < _CACHE_TTL:
        return cached["data"]

    try:
        conn = get_conn()
        cur  = conn.cursor()
        meta = _auction_meta(cur, auction_id)
        if not meta:
            conn.close()
            raise ValueError("Auction not found")

        now       = datetime.now(timezone.utc)
        end_time  = meta["end_time"].replace(tzinfo=timezone.utc) if meta["end_time"].tzinfo is None else meta["end_time"]
        secs_rem  = max((end_time - now).total_seconds(), 0)

        bid_count = _bid_count(cur, auction_id)
        vel_5m    = _bid_velocity(cur, auction_id, 5)
        price_60m_ago = _price_60m_ago(cur, auction_id)
        conn.close()

        current = meta["current_price"]
        bundle  = model_store.price_model

        if bundle:
            X = np.array([[
                meta["reserve_price"], meta["reserve_price"] * 0.5,
                _cat_enc(meta["category"]), 2,  # condition=good
                max(secs_rem / 3600, 0.1), end_time.weekday(), end_time.hour,
                bid_count, 3.5,  # seller_reputation default
                0,               # watcher_count — would need separate query
            ]])
            X = X[:, :len(bundle["features"])]
            base_pred = float(bundle["model"].predict(X)[0])
            mae       = bundle.get("mae", base_pred * 0.15)
        else:
            base_pred = current * 1.10
            mae       = base_pred * 0.15

        # Adjust upward if bid velocity is high
        if vel_5m > 0.5:  # > 0.5 bids/min → competitive
            momentum_uplift = min(vel_5m * 0.05, 0.20)  # up to +20%
            base_pred = base_pred * (1 + momentum_uplift)

        low  = max(base_pred - 1.65 * mae, current)
        high = base_pred + 1.65 * mae

        price_range_label = f"${low:,.0f} – ${high:,.0f}"

        result = PriceForecastResponse(
            auction_id=auction_id,
            current_price=current,
            forecast_price=round(base_pred, 2),
            confidence_low=round(low, 2),
            confidence_high=round(high, 2),
            price_range_label=price_range_label,
            seconds_until_close=round(secs_rem, 0),
            model_version=model_store.version,
        )
        _cache[f"fcast:{auction_id}"] = {"data": result, "ts": time.time()}
        return result

    except Exception as e:
        return PriceForecastResponse(
            auction_id=auction_id, current_price=0, forecast_price=0,
            confidence_low=0, confidence_high=0, price_range_label="N/A",
            seconds_until_close=0, model_version="error",
        )


@router.get("/snapshot/{auction_id}", response_model=AuctionSnapshotResponse)
def auction_snapshot(auction_id: str):
    """
    All live AI panels in one HTTP call.
    Use this instead of calling /momentum and /price-forecast separately.
    """
    return AuctionSnapshotResponse(
        auction_id=auction_id,
        momentum=bid_momentum(auction_id),
        forecast=price_forecast(auction_id),
        model_version=model_store.version,
    )
