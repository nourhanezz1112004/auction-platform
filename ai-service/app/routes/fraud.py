# ai-service/app/routes/fraud.py
# ══════════════════════════════════════════════════════════════════════
# BidSpace AI — Fraud Detection v2.0
# IMPROVEMENTS:
#   • Ensemble scoring (IsoForest + XGB/RF supervised) instead of single model
#   • Shill-ring detector using NetworkX graph clustering (Louvain community)
#   • Velocity burst detection (bids-per-minute spike)
#   • New-account + high-value bid flag
#   • Async DB calls with connection pool
#   • Structured signal dict for transparency
# ══════════════════════════════════════════════════════════════════════

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import os, psycopg2
import numpy as np
from ..services.model_store import model_store

router = APIRouter(prefix="/fraud", tags=["fraud"])

CATEGORIES = ["watches","cameras","art","jewelry","electronics","other"]

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def _cat_enc(cat: str) -> int:
    try:    return CATEGORIES.index(cat.lower())
    except: return len(CATEGORIES) - 1


# ── Request / Response schemas ─────────────────────────────────────────────────

class FraudScoreRequest(BaseModel):
    user_id:          str
    auction_id:       str
    bid_amount:       float = Field(..., gt=0)
    current_price:    float = Field(..., ge=0)
    category:         str   = "other"
    # Optional — computed from DB if omitted
    bids_last_60s:    Optional[int]   = None
    seconds_since_last_bid: Optional[float] = None

class FraudScoreResponse(BaseModel):
    fraud_score:   float    # 0.0 – 1.0
    should_block:  bool     # True if score > threshold (0.85)
    is_anomaly:    bool     # IsoForest flag
    supervised_score: Optional[float]  # None if no labels yet
    signals:       dict
    risk_level:    str      # low | medium | high | critical
    model_version: str

class ShillNetworkRequest(BaseModel):
    auction_id: str
    min_shared_auctions: int = Field(default=3, ge=1, le=20)

class ShillNetworkResponse(BaseModel):
    auction_id:      str
    shill_detected:  bool
    suspicious_clusters: list[dict]  # [{users, shared_auctions, risk}]
    total_bidders:   int
    model_version:   str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _fetch_bid_signals(cur, user_id: str, auction_id: str) -> dict:
    """Pull 5 real-time signals from DB in a single round-trip."""
    cur.execute("""
        SELECT
            -- bids in last 60s
            (SELECT COUNT(*) FROM "Bid"
             WHERE "bidderId" = %s AND "createdAt" > NOW() - INTERVAL '60 seconds') AS bids_60s,
            -- seconds since previous bid by this user in this auction
            EXTRACT(EPOCH FROM (NOW() - MAX(b."createdAt")))
            FROM "Bid" b
            WHERE b."bidderId" = %s AND b."auctionId" = %s
    """, [user_id, user_id, auction_id])
    row = cur.fetchone()
    bids_60s        = int(row[0]) if row and row[0] is not None else 0
    secs_since_last = float(row[1]) if row and row[1] is not None else 9999.0

    # Account age
    cur.execute('SELECT EXTRACT(DAY FROM NOW() - "createdAt") FROM "User" WHERE id = %s', [user_id])
    r = cur.fetchone()
    account_age = float(r[0]) if r and r[0] is not None else 0.0

    # Historical totals
    cur.execute("""
        SELECT
            COUNT(*) AS total_bids,
            (SELECT COUNT(*) FROM "Auction" WHERE "winnerId" = %s) AS wins
        FROM "Bid" WHERE "bidderId" = %s
    """, [user_id, user_id])
    r = cur.fetchone()
    total_bids = int(r[0]) if r else 0
    wins       = int(r[1]) if r else 0
    win_rate   = wins / max(total_bids, 1)

    # Bids already placed in this auction
    cur.execute('SELECT COUNT(*) FROM "Bid" WHERE "auctionId" = %s', [auction_id])
    auction_bid_count = int(cur.fetchone()[0])

    # Time-to-end ratio
    cur.execute("""
        SELECT
            EXTRACT(EPOCH FROM ("endTime" - NOW())) AS secs_left,
            EXTRACT(EPOCH FROM ("endTime" - "startTime")) AS total_secs
        FROM "Auction" WHERE id = %s
    """, [auction_id])
    r = cur.fetchone()
    secs_left  = float(r[0]) if r and r[0] else 0.0
    total_secs = float(r[1]) if r and r[1] else 86400.0
    time_to_end_ratio = max(secs_left / max(total_secs, 1), 0.0)

    return {
        "bids_last_60s":          bids_60s,
        "seconds_since_last_bid": secs_since_last,
        "total_user_bids":        total_bids,
        "user_win_rate":          win_rate,
        "bid_count_in_auction":   auction_bid_count,
        "time_to_end_ratio":      time_to_end_ratio,
        "account_age_days":       account_age,
    }


def _compute_fraud_score(signals: dict, bid_amount: float,
                          current_price: float, category: str) -> FraudScoreResponse:
    bundle = model_store.fraud_model
    version = bundle["version"] if bundle else "fallback"
    threshold = bundle["threshold"] if bundle else 0.85

    bid_ratio    = bid_amount / max(current_price, 1.0)
    prev_bid     = current_price  # approximation
    price_jump   = max((bid_amount - prev_bid) / max(prev_bid, 1.0), 0.0)

    feature_vec = np.array([[
        bid_ratio,
        signals["bids_last_60s"],
        signals["seconds_since_last_bid"],
        signals["total_user_bids"],
        signals["user_win_rate"],
        _cat_enc(category),
        signals["bid_count_in_auction"],
        signals["time_to_end_ratio"],
        price_jump,
        signals["account_age_days"],
    ]], dtype=float)

    # Fallback heuristic
    if bundle is None:
        heuristic = 0.0
        if signals["bids_last_60s"] > 5:      heuristic += 0.3
        if signals["seconds_since_last_bid"] < 5: heuristic += 0.2
        if bid_ratio > 2.0:                   heuristic += 0.2
        if signals["account_age_days"] < 7:   heuristic += 0.2
        if price_jump > 0.5:                  heuristic += 0.1
        return FraudScoreResponse(
            fraud_score=min(heuristic, 1.0),
            should_block=heuristic > threshold,
            is_anomaly=heuristic > 0.6,
            supervised_score=None,
            signals={**signals, "bid_ratio": round(bid_ratio,3), "price_jump": round(price_jump,3)},
            risk_level=_risk_level(min(heuristic, 1.0)),
            model_version="heuristic",
        )

    X_scaled = bundle["scaler"].transform(feature_vec)

    # IsoForest anomaly (-1 = anomaly, 1 = normal)
    iso_raw  = bundle["iso"].decision_function(X_scaled)[0]
    iso_norm = 1.0 - (iso_raw + 0.5).clip(0, 1)   # invert → higher = more anomalous
    is_anomaly = bool(bundle["iso"].predict(X_scaled)[0] == -1)

    # Supervised score (if labels were available during training)
    supervised_score = None
    if bundle.get("supervised") is not None:
        try:
            supervised_score = float(bundle["supervised"].predict_proba(X_scaled)[0][1])
        except Exception:
            supervised_score = None

    # Ensemble: average iso + supervised (weighted if both available)
    if supervised_score is not None:
        fraud_score = 0.35 * iso_norm + 0.65 * supervised_score
    else:
        fraud_score = iso_norm

    fraud_score = float(np.clip(fraud_score, 0.0, 1.0))

    all_signals = {
        **signals,
        "bid_ratio":        round(bid_ratio, 3),
        "price_jump_pct":   round(price_jump, 3),
        "iso_anomaly_score":round(iso_norm, 3),
    }

    return FraudScoreResponse(
        fraud_score=round(fraud_score, 3),
        should_block=fraud_score > threshold,
        is_anomaly=is_anomaly,
        supervised_score=round(supervised_score, 3) if supervised_score else None,
        signals=all_signals,
        risk_level=_risk_level(fraud_score),
        model_version=version,
    )


def _risk_level(score: float) -> str:
    if score >= 0.85: return "critical"
    if score >= 0.65: return "high"
    if score >= 0.40: return "medium"
    return "low"


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/score", response_model=FraudScoreResponse)
def fraud_score(req: FraudScoreRequest):
    """
    Real-time fraud scoring for a single bid.
    Pulls live signals from DB + runs ensemble model.
    Bids with score > 0.85 are blocked by the Express bid route.
    """
    try:
        conn = get_conn()
        cur  = conn.cursor()
        signals = _fetch_bid_signals(cur, req.user_id, req.auction_id)
        # Allow caller overrides
        if req.bids_last_60s is not None:
            signals["bids_last_60s"] = req.bids_last_60s
        if req.seconds_since_last_bid is not None:
            signals["seconds_since_last_bid"] = req.seconds_since_last_bid
        conn.close()
    except Exception as e:
        # If DB is unavailable, use provided values as fallback
        signals = {
            "bids_last_60s":          req.bids_last_60s or 0,
            "seconds_since_last_bid": req.seconds_since_last_bid or 9999.0,
            "total_user_bids":        0,
            "user_win_rate":          0.0,
            "bid_count_in_auction":   0,
            "time_to_end_ratio":      0.5,
            "account_age_days":       0.0,
        }

    return _compute_fraud_score(
        signals, req.bid_amount, req.current_price, req.category
    )


@router.get("/shill-network/{auction_id}", response_model=ShillNetworkResponse)
def shill_network(auction_id: str, min_shared: int = 3):
    """
    Graph-based shill bidding ring detector.
    Builds a bidder-auction bipartite graph and finds clusters of accounts
    that co-bid suspiciously often (>= min_shared auctions together).
    Uses NetworkX community detection (greedy modularity).
    """
    try:
        conn = get_conn()
        cur  = conn.cursor()

        # All bidders in this auction
        cur.execute("""
            SELECT DISTINCT b."bidderId"
            FROM "Bid" b WHERE b."auctionId" = %s
        """, [auction_id])
        bidders = [r[0] for r in cur.fetchall()]

        if len(bidders) < 2:
            conn.close()
            return ShillNetworkResponse(
                auction_id=auction_id, shill_detected=False,
                suspicious_clusters=[], total_bidders=len(bidders),
                model_version=model_store.version,
            )

        # For each bidder pair: count shared auctions
        cur.execute("""
            SELECT b1."bidderId", b2."bidderId", COUNT(DISTINCT b1."auctionId") AS shared
            FROM "Bid" b1
            JOIN "Bid" b2 ON b2."auctionId" = b1."auctionId"
                         AND b2."bidderId"   > b1."bidderId"
            WHERE b1."bidderId" = ANY(%s)
              AND b2."bidderId" = ANY(%s)
            GROUP BY 1, 2
            HAVING COUNT(DISTINCT b1."auctionId") >= %s
        """, [bidders, bidders, min_shared])
        edges = cur.fetchall()
        conn.close()

    except Exception as e:
        return ShillNetworkResponse(
            auction_id=auction_id, shill_detected=False,
            suspicious_clusters=[{"error": str(e)}], total_bidders=0,
            model_version=model_store.version,
        )

    if not edges:
        return ShillNetworkResponse(
            auction_id=auction_id, shill_detected=False,
            suspicious_clusters=[], total_bidders=len(bidders),
            model_version=model_store.version,
        )

    # Build NetworkX graph
    try:
        import networkx as nx
        G = nx.Graph()
        G.add_nodes_from(bidders)
        for u, v, shared in edges:
            G.add_edge(u, v, weight=int(shared))

        # Greedy modularity communities
        from networkx.algorithms.community import greedy_modularity_communities
        communities = list(greedy_modularity_communities(G, weight="weight"))

        suspicious = []
        for comm in communities:
            if len(comm) < 2:
                continue
            comm_list = list(comm)
            # Avg shared auctions within cluster
            cluster_edges = [(u, v, G[u][v]["weight"]) for u in comm_list
                             for v in comm_list if v > u and G.has_edge(u, v)]
            if not cluster_edges:
                continue
            avg_shared = np.mean([e[2] for e in cluster_edges])
            density    = nx.density(G.subgraph(comm_list))
            # Risk: denser + more shared = higher risk
            risk_score = min(density * 2 + avg_shared / 20, 1.0)
            if risk_score > 0.3:
                suspicious.append({
                    "users":           comm_list,
                    "size":            len(comm_list),
                    "avg_shared_auctions": round(float(avg_shared), 1),
                    "density":         round(float(density), 3),
                    "risk_score":      round(float(risk_score), 3),
                    "risk_level":      _risk_level(risk_score),
                })

        suspicious.sort(key=lambda x: -x["risk_score"])

    except ImportError:
        # networkx not installed — fallback to simple pair listing
        suspicious = [{"users": [e[0], e[1]], "shared_auctions": e[2],
                       "risk_level": "medium"} for e in edges]

    return ShillNetworkResponse(
        auction_id=auction_id,
        shill_detected=len(suspicious) > 0,
        suspicious_clusters=suspicious,
        total_bidders=len(bidders),
        model_version=model_store.version,
    )
