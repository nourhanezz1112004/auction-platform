# Auction Platform — Merged Project (v2.0 Enhanced)

This project merges the original **Auction Platform with AI** and **newww_enhanced_v2** into a single, complete, production-ready codebase.

## Architecture

```
auction-platform/
├── apps/web/                    # React frontend (Vite + TailwindCSS)
│   └── src/components/ai/       # 25+ AI components (base + enhanced)
├── backend/                     # Node.js + Express backend
│   ├── src/
│   │   ├── modules/             # Original modular routes (auth, auctions, bids...)
│   │   ├── routes/              # Enhanced routes (listings, bids.enhanced)
│   │   ├── middleware/          # Enhanced middleware (CSRF, rate limit, audit)
│   │   ├── services/            # Enhanced services (audit, push, analytics)
│   │   ├── jobs/                # Bull queues (auction timer, autobidder, winback...)
│   │   ├── sockets/             # Enhanced socket handlers (auctionRoom)
│   │   └── lib/                 # Shared lib (prisma, redis, jwt, aiService)
│   └── prisma/
│       ├── schema.prisma        # Merged schema (all models + AI models)
│       └── migrations/          # All migrations including enhanced additions
├── ai-service/                  # Python FastAPI AI service
│   └── app/
│       ├── routers/             # Original routers (anti_bot, recommender, auction_intelligence)
│       ├── routes/              # 20 enhanced AI routes
│       ├── models/              # ML model training
│       ├── ml/                  # ML model files (price, fraud, anti_bot, recommender)
│       └── services/            # model_store
└── packages/                    # Shared TypeScript packages
    ├── shared-types/
    ├── shared-utils/
    └── shared-events/
```

## Quick Start

### 1. Prerequisites
- Node.js 18+
- pnpm 8+
- Python 3.11+
- PostgreSQL 15+ with pgvector extension
- Redis 7+

### 2. Install dependencies
```bash
# Root (monorepo)
pnpm install

# AI Service
cd ai-service && pip install -r requirements.txt
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with your values
```

### 4. Database setup
```bash
cd backend
pnpm prisma migrate dev
# OR apply manually:
psql $DATABASE_URL < prisma/migrations/20260603000000_add_enhanced_features/migration.sql
pnpm prisma generate
pnpm seed
```

### 5. Run development servers
```bash
# All services via turbo
pnpm dev

# Or individually:
cd backend && pnpm dev          # :3000
cd apps/web && pnpm dev         # :5173
cd ai-service && uvicorn app.main:app --reload --port 8000
```

## What's New (Enhanced Features)

### Backend
- **Audit Log**: Immutable event trail for every bid, payment, and auction action
- **CSRF Protection**: Double-submit cookie pattern for all state-changing routes
- **Redis Rate Limiting**: Per-user bid rate limiting (5 bids/2s), auth limiter (10/15min)
- **Autobidder**: Strategy-based automatic bidding (conservative/aggressive/sniper/value)
- **Shill Alert Detection**: Nightly graph analysis to catch shill bidding rings
- **Winback Campaigns**: Nightly propensity scoring + personalized re-engagement
- **Push Notifications**: FCM-based iOS/Android/Web push via Firebase Admin
- **Post-Auction Emails**: Winner notifications, seller recaps, dispute alerts
- **Enhanced Socket Room**: Redis-backed auction room with reconnect state recovery
- **Support Tickets**: AI-powered customer support chat with escalation

### AI Service (35+ endpoints)
- `/predict/price` — XGBoost price prediction
- `/fraud/score` — Ensemble fraud detection  
- `/fraud/shill-network/:id` — Graph-based shill ring detection
- `/autobidder/strategy` — Optimal bidding strategy
- `/insights/seller/:id` — Seller performance analytics
- `/insights/buyer/:id` — Buyer behaviour insights
- `/search/semantic` — pgvector semantic search
- `/demand/heatmap` — Category demand heatmap
- `/timing/optimal-end-time` — Best time to end auction
- `/support/chat` — AI customer support (Claude)
- `/dispute/analyse` — Dispute analysis and resolution
- `/relist/optimise` — Relist optimization suggestions
- `/emails/winner` — Personalized winner emails
- `/forecast/demand` — 7-day demand forecast
- And 20+ more...

### Frontend AI Components
All original components plus:
- `AuctionRoom` — Full live auction experience with AI overlays
- `SellerDashboard` — Complete seller analytics dashboard
- `AdminDashboard` — Platform-wide admin insights
- `AdminDisputePanel` — Dispute management UI
- `BuyerInsights` — Buyer behavior analytics
- `CreateListing` — AI-assisted listing creation
- `SemanticSearch` — Natural language search
- `DemandForecast` — 7-day demand visualization
- `LiveAuctionAI` — Real-time AI auction assistant
- `AutobidPanel` — Autobidder configuration UI
- `NotificationBell` — Real-time notification center
- `RelistOptimiser` — Relist suggestions UI

## API Endpoints

| Service    | Port | Base Path | Description |
|-----------|------|-----------|-------------|
| Backend   | 3000 | `/`       | Main REST API + WebSocket |
| Frontend  | 5173 | `/`       | React SPA |
| AI Service| 8000 | `/docs`   | FastAPI with Swagger UI |

## Environment Variables

See `.env.example` for complete list. Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string  
- `ANTHROPIC_API_KEY` — For Claude-powered AI features
- `STRIPE_SECRET_KEY` — Payments
- `AI_SERVICE_URL` — AI service URL (default: http://localhost:8000)
