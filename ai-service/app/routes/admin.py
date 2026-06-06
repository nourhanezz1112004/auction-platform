# ai-service/app/routes/admin.py
# Admin anomaly detection dashboard data endpoint.
# Reads real platform signals: bid velocity spikes, account clusters,
# payment failures, fraud model confidence, shill alerts — all from your live DB.

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
import os, psycopg2
from datetime import datetime, timezone

router = APIRouter(prefix="/admin", tags=["admin"])

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def require_admin(x_admin_key: str = Header(default="")):
    if x_admin_key != os.getenv("ADMIN_API_KEY", ""):
        raise HTTPException(403, "Admin key required")


class PlatformHealthResponse(BaseModel):
    generated_at: str
    # Bid signals
    bids_last_hour: int
    bids_last_24h: int
    bid_velocity_trend: str       # up | stable | down
    avg_fraud_score_24h: float
    high_fraud_bids_24h: int      # fraud_score > 0.7
    # Auction signals
    active_auctions: int
    auctions_ending_1h: int
    reserve_met_rate_7d: float
    # Payment signals
    payments_pending: int
    payments_failed_24h: int
    payment_failure_rate_7d: float
    # User signals
    new_users_24h: int
    new_users_7d: int
    suspended_users: int
    # Shill alerts
    open_shill_alerts: int
    high_risk_auctions: list[dict]
    # Model health
    model_version: str
    avg_price_prediction_error: Optional[float]


@router.get("/platform-health", response_model=PlatformHealthResponse)
def platform_health(x_admin_key: str = Header(default="")):
    require_admin(x_admin_key)
    from ..services.model_store import model_store

    conn = get_conn()
    try:
        cur = conn.cursor()

        # Bids last hour + 24h
        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE "createdAt" > NOW()-INTERVAL '1 hour')  AS last_hour,
                COUNT(*) FILTER (WHERE "createdAt" > NOW()-INTERVAL '24 hours') AS last_24h,
                COUNT(*) FILTER (WHERE "createdAt" BETWEEN NOW()-INTERVAL '48 hours' AND NOW()-INTERVAL '24 hours') AS prev_24h,
                COALESCE(AVG("fraudScore") FILTER (WHERE "createdAt" > NOW()-INTERVAL '24 hours'), 0) AS avg_fraud,
                COUNT(*) FILTER (WHERE "fraudScore" > 0.7 AND "createdAt" > NOW()-INTERVAL '24 hours') AS high_fraud
            FROM "Bid"
        """)
        b = cur.fetchone()
        bids_1h, bids_24h, bids_prev_24h = int(b[0]), int(b[1]), int(b[2])
        avg_fraud = round(float(b[3]), 4)
        high_fraud = int(b[4])
        velocity_trend = "up" if bids_24h > bids_prev_24h * 1.1 else "down" if bids_24h < bids_prev_24h * 0.9 else "stable"

        # Auction signals
        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE status='ACTIVE') AS active,
                COUNT(*) FILTER (WHERE status='ACTIVE' AND "endTime" < NOW()+INTERVAL '1 hour') AS ending_1h,
                COALESCE(AVG(CASE WHEN status='CLOSED' AND b.max_bid >= "reservePrice" THEN 1.0 ELSE 0.0 END), 0) AS reserve_rate
            FROM "Auction"
            LEFT JOIN LATERAL (SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId"="Auction".id) b ON true
            WHERE "createdAt" > NOW()-INTERVAL '7 days' OR status='ACTIVE'
        """)
        a = cur.fetchone()

        # Payments
        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE status='PENDING') AS pending,
                COUNT(*) FILTER (WHERE status='FAILED' AND "createdAt" > NOW()-INTERVAL '24 hours') AS failed_24h,
                COALESCE(
                    COUNT(*) FILTER (WHERE status='FAILED' AND "createdAt" > NOW()-INTERVAL '7 days')::float /
                    NULLIF(COUNT(*) FILTER (WHERE "createdAt" > NOW()-INTERVAL '7 days'), 0),
                    0
                ) AS failure_rate
            FROM "Payment"
        """)
        p = cur.fetchone()

        # Users
        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE "createdAt" > NOW()-INTERVAL '24 hours') AS new_24h,
                COUNT(*) FILTER (WHERE "createdAt" > NOW()-INTERVAL '7 days')   AS new_7d,
                COUNT(*) FILTER (WHERE "isSuspended" = true)                     AS suspended
            FROM "User"
        """)
        u = cur.fetchone()

        # Shill alerts
        cur.execute("""
            SELECT COUNT(*) FROM "ShillAlert" WHERE status='pending'
        """)
        shill_row = cur.fetchone()
        open_shill = int(shill_row[0]) if shill_row else 0

        # High risk auctions (many high-fraud bids)
        cur.execute("""
            SELECT a.id, a.title, COUNT(*) AS fraud_bids, MAX(b."fraudScore") AS max_fraud
            FROM "Bid" b
            JOIN "Auction" a ON a.id = b."auctionId"
            WHERE b."fraudScore" > 0.7
              AND a.status = 'ACTIVE'
              AND b."createdAt" > NOW()-INTERVAL '24 hours'
            GROUP BY a.id, a.title
            HAVING COUNT(*) >= 2
            ORDER BY fraud_bids DESC
            LIMIT 5
        """)
        high_risk = [
            {"id": r[0], "title": r[1], "fraud_bids": int(r[2]), "max_fraud_score": round(float(r[3]),3)}
            for r in cur.fetchall()
        ]

        # Model accuracy: compare predicted vs actual on recently closed auctions
        avg_error = None
        if model_store.price_model:
            cur.execute("""
                SELECT AVG(ABS(b.max_bid - a."reservePrice" * 1.15) / NULLIF(b.max_bid, 0)) * 100
                FROM "Auction" a
                LEFT JOIN LATERAL (SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId"=a.id) b ON true
                WHERE a.status='CLOSED'
                  AND a."endTime" > NOW()-INTERVAL '7 days'
                  AND b.max_bid IS NOT NULL
            """)
            err_row = cur.fetchone()
            avg_error = round(float(err_row[0]), 1) if err_row and err_row[0] else None

    finally:
        conn.close()

    return PlatformHealthResponse(
        generated_at=datetime.now(timezone.utc).isoformat(),
        bids_last_hour=bids_1h,
        bids_last_24h=bids_24h,
        bid_velocity_trend=velocity_trend,
        avg_fraud_score_24h=avg_fraud,
        high_fraud_bids_24h=high_fraud,
        active_auctions=int(a[0] or 0),
        auctions_ending_1h=int(a[1] or 0),
        reserve_met_rate_7d=round(float(a[2] or 0) * 100, 1),
        payments_pending=int(p[0] or 0),
        payments_failed_24h=int(p[1] or 0),
        payment_failure_rate_7d=round(float(p[2] or 0) * 100, 1),
        new_users_24h=int(u[0] or 0),
        new_users_7d=int(u[1] or 0),
        suspended_users=int(u[2] or 0),
        open_shill_alerts=open_shill,
        high_risk_auctions=high_risk,
        model_version=model_store.version,
        avg_price_prediction_error=avg_error,
    )
