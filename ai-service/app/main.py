# ai-service/app/main.py
# ══════════════════════════════════════════════════════════════════════════════
# Auction Platform — AI Service (v2.1 — Smart Listing + Buyer Intent added)
# ══════════════════════════════════════════════════════════════════════════════

import os
import time
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

# ── Base ML models ─────────────────────────────────────────────────────────────
from app.ml import anti_bot_model, fraud_model, recommender_model
from app.ml.price_model import price_model

# ── Base routers ───────────────────────────────────────────────────────────────
from app.routers import anti_bot, recommender, auction_intelligence

# ── Enhanced model store ───────────────────────────────────────────────────────
from app.services.model_store import model_store

# ── Enhanced routers ───────────────────────────────────────────────────────────
from app.routes import (
    predict, describe, search, fraud, autobidder,
    insights, photo_quality, demand, propensity,
    listing_guard, timing, support, live_auction,
    admin, dispute, relist, emails, feed, ab_test, forecast,
)

# ── NEW v2.1 routers ───────────────────────────────────────────────────────────
from app.routes import smart_listing, buyer_intent

# ── Sentry ────────────────────────────────────────────────────────────────────
if os.getenv("SENTRY_DSN"):
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.05,
        profiles_sample_rate=0.01,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    anti_bot_model.load()
    fraud_model.load()
    price_model.load()
    asyncio.create_task(recommender_model.load_in_background())
    await model_store.load_all()
    yield


app = FastAPI(
    title="Auction Platform — AI Service (v2.1)",
    version="2.1.0",
    description=(
        "Complete auction AI platform — 40+ features.\n\n"
        "**v2.1 additions**: Smart Listing (auto-categorize, price suggest, bid anomaly), "
        "Buyer Intent (per-auction scoring, ending-soon smart notifications)."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3001,http://localhost:5173,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    start = time.perf_counter()
    response: Response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000
    response.headers["X-Response-Time"] = f"{ms:.1f}ms"
    return response


# ── Base routers ───────────────────────────────────────────────────────────────
app.include_router(anti_bot.router,             prefix="/ai", tags=["Anti-Bot (Base)"])
app.include_router(recommender.router,          prefix="/ai", tags=["Recommender (Base)"])
app.include_router(auction_intelligence.router, prefix="/ai", tags=["Auction Intelligence (Base)"])

# ── Enhanced routers (v2.0) ────────────────────────────────────────────────────
ENHANCED_ROUTERS = [
    predict, describe, search, fraud, autobidder,
    insights, photo_quality, demand, propensity,
    listing_guard, timing, support, live_auction,
    admin, dispute, relist, emails, feed, ab_test, forecast,
]
for module in ENHANCED_ROUTERS:
    app.include_router(module.router)

# ── New routers (v2.1) ─────────────────────────────────────────────────────────
app.include_router(smart_listing.router)
app.include_router(buyer_intent.router)


@app.get("/health", tags=["Health"])
def health():
    model_health = model_store.health() if hasattr(model_store, 'health') else {}
    return {
        "status": "ready",
        "version": "2.1.0",
        "base_models": {
            "antiBot":             anti_bot_model.ready,
            "fraud":               fraud_model.ready,
            "recommender":         recommender_model.recommender_ready,
            "priceModel":          price_model.ready,
            "auctionIntelligence": price_model.ready,
        },
        "enhanced_models": model_health,
        "new_endpoints_v2_1": [
            "/listing/auto-categorize",
            "/listing/price-suggest",
            "/listing/bid-anomaly",
            "/intent/score",
            "/intent/ending-soon",
        ],
    }
