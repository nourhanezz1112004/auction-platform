# BidSpace (مزاد) 🏺✨
### MENA's AI-Powered Real-Time Auction Sanctuary for Rare Collectibles & Antiquities

> *"Where rare things find their place."*

BidSpace is a production-grade, real-time digital auction house built for high-value items — fine watches, archival cameras, jewelry, and art. Every bid is analyzed in real-time by a custom neural AI stack, protecting buyers and sellers from fraud, shill bidding, and counterfeit listings.

---

## 🤖 AI Engine — 40+ Live Endpoints

> The AI service runs as an independent FastAPI microservice (Python 3.11) on port 8000, with full Swagger documentation at `/docs`. All models operate in real-time during active auctions.

### 🛡️ Fraud & Trust Protection
| Capability | How it works |
|---|---|
| **Shill Bid Detection** `POST /fraud/score` | XGBoost model analyzes bid velocity, timing gaps, and user history to score each bid 0–1 for fraud probability |
| **Shill Network Graph** `GET /fraud/shill-network/{id}` | Maps bidder relationships to detect coordinated fraud rings using graph analysis |
| **Anti-Bot Shield** `POST /ai/anti-bot` | Detects automated bidding scripts via behavioral fingerprinting before each bid attempt |
| **Counterfeit Check** `POST /listing-guard/counterfeit-check` | Image + text analysis flags suspicious listings before they go live |
| **Duplicate Detection** `POST /listing-guard/duplicate-check` | Vector similarity search catches relisted or reposted items |

### 💰 Pricing Intelligence
| Capability | How it works |
|---|---|
| **Price Prediction** `POST /predict/price` | Regression model trained on historical auction data predicts fair market value |
| **Reserve Suggestion** `POST /ai/reserve-suggestion` | Recommends optimal reserve price based on category, condition, and demand signals |
| **Price Suggest (Smart Listing)** `POST /listing/price-suggest` | Auto-fills starting price when seller creates a new listing |
| **Bid Anomaly Detection** `POST /listing/bid-anomaly` | Flags abnormal bid jumps (e.g. $500 → $50,000) in real-time |

### 🔍 Search & Discovery
| Capability | How it works |
|---|---|
| **Semantic Search** `POST /search/semantic` | Sentence Transformers (all-MiniLM-L6-v2) convert queries to 384-dim vectors, matched against pgvector index |
| **Personalised Feed** `POST /feed/ranked` | Ranks active auctions per user based on bidding history and watchlist patterns |
| **Item Recommendations** `POST /predict/recommendations` | Collaborative filtering suggests similar lots the user hasn't seen |
| **Auto-Categorize** `POST /listing/auto-categorize` | NLP classifies new listings into the correct category automatically |

### 📈 Demand & Market Intelligence
| Capability | How it works |
|---|---|
| **Demand Heatmap** `GET /demand/heatmap` | Real-time category demand scoring shown as a visual heatmap on the homepage sidebar |
| **Category Forecast** `GET /demand/category/{category}` | 7-day demand forecast per category using time-series modeling |
| **Optimal Auction Timing** `POST /timing/optimal-end-time` | Predicts best end-time for maximum bidder engagement based on historical patterns |
| **Forecast Demand** `POST /forecast/demand` | Forward-looking demand signal for sellers planning new listings |

### 🧠 Buyer & Seller Intelligence
| Capability | How it works |
|---|---|
| **Buyer Insights** `POST /insights/buyer` | Per-user spend patterns, category affinity, win rate, and budget analysis |
| **Seller Insights** `POST /insights/seller` | Revenue trends, best-performing categories, optimal listing strategy |
| **Reputation Score** `POST /reputation/score` | Composite trust score from bid history, win rate, and payment behavior |
| **Buyer Propensity** `POST /propensity/score` | Likelihood-to-bid score for a specific user on a specific auction |
| **Bulk Propensity** `POST /propensity/bulk` | Scores entire user segments for targeted notifications |

### ⚡ Live Auction AI
| Capability | How it works |
|---|---|
| **Bid Momentum** `GET /live/momentum/{auction_id}` | Real-time bid pace indicator (accelerating / stable / cooling) updated every few seconds |
| **Price Forecast** `GET /live/price-forecast/{auction_id}` | Predicts final hammer price as auction progresses |
| **Auto-Bidder Strategy** `POST /autobidder/strategy` | Recommends max bid ceiling and increment strategy for the user's budget |
| **Should Bid Now** `POST /autobidder/should-bid` | Real-time signal: is this the right moment to place a bid? |
| **Ending Soon Alerts** `POST /intent/ending-soon` | Notifies high-propensity buyers when their target lots are closing |

### 💬 AI Support & Admin
| Capability | How it works |
|---|---|
| **Support Chat** `POST /support/chat` | Claude-powered stateful customer support — injects real user + auction data from PostgreSQL per session |
| **Dispute Analysis** `POST /dispute/analyse` | AI mediator analyzes buyer/seller dispute evidence and recommends resolution |
| **Platform Health** `GET /admin/platform-health` | Live dashboard of model status, fallback modes, and service uptime |
| **A/B Testing** `POST /ab/assign` | Built-in experimentation framework for testing AI feature variants |
| **Photo Quality Score** `POST /photo/quality-score` | Scores listing image quality and flags blurry/low-res uploads |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    User Browser                      │
│           React 19 + Vite  :5173                    │
└───────────────────┬─────────────────────────────────┘
                    │ REST + WebSocket
┌───────────────────▼─────────────────────────────────┐
│              Node.js Express API  :3000              │
│     Prisma ORM │ Bull Queues │ Socket.io             │
└────────┬────────────────────┬────────────────────────┘
         │                    │
┌────────▼───────┐   ┌────────▼────────────────────────┐
│  PostgreSQL 15 │   │    FastAPI AI Service  :8000     │
│  + pgvector    │   │  PyTorch │ XGBoost │ Transformers│
└────────────────┘   └─────────────────────────────────┘
┌─────────────────┐
│   Redis 7        │  ← Sessions, Pub/Sub, Job Queues
└─────────────────┘
```

---

## 💻 Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS v4, Zustand, TanStack Query, Socket.io, Framer Motion, GSAP |
| **Backend** | Node.js 20, Express, Prisma ORM, PostgreSQL 15 + pgvector, Redis 7, Bull queues, Socket.io |
| **AI Service** | FastAPI, Python 3.11, PyTorch, Scikit-Learn, XGBoost, Sentence Transformers, asyncpg, pgvector |
| **Infrastructure** | Docker Compose, pgvector extension, Redis pub/sub, Cloudinary, Stripe, SendGrid |

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js v20+ • pnpm `npm install -g pnpm` • Python 3.11+ • Docker Desktop

### Quickstart

```bash
# 1. Clone
git clone https://github.com/nourhanezz1112004/auction-platform.git
cd auction-platform

# 2. Install
pnpm install

# 3. Environment
copy backend\.env.example backend\.env
copy ai-service\.env.example ai-service\.env
# Edit backend/.env — set POSTGRES_PASSWORD, JWT secrets

# 4. Start everything
docker compose up --build        # Terminal 1
cd apps/web && pnpm dev          # Terminal 2
```

### Access
| Service | URL |
|---|---|
| 🌐 Frontend | http://localhost:5173 |
| ⚙️ Backend API | http://localhost:3000 |
| 🤖 AI Swagger Docs | http://localhost:8000/docs |

---

## 🔑 Test Accounts (password: `demo1234`)

| Email | Role | Pre-seeded Context |
|---|---|---|
| `admin@bidspace.com` | Admin | Fraud dashboards, AI flag console |
| `khalid@bidspace.com` | Bidder | High watch category engagement |
| `farida@bidspace.com` | Bidder | Rare coins, active bids |
| `yousef@bidspace.com` | Bidder | Fine art interactions |
| `demo-bidder@bidspace.com` | Fraud Demo | Triggers fraud flag on Rolex ($999,999 bid) |

---

## 📁 Project Structure

```
auction-platform/
├── apps/web/              # React 19 Frontend
│   └── src/components/ai/ # 25+ AI-powered UI components
├── backend/               # Node.js Express API
│   └── src/routes/        # REST + WebSocket routes
├── ai-service/            # Python FastAPI AI Microservice
│   └── app/routers/       # 40+ AI endpoint handlers
├── packages/
│   ├── shared-types/      # TypeScript contracts
│   ├── shared-events/     # Redis event signatures
│   └── shared-utils/      # Shared utilities
└── docker-compose.yml
```

---

## ✨ Platform Highlights

- 🛡️ **Real-time fraud protection** — every bid scored by XGBoost before acceptance
- 🔍 **Vector semantic search** — pgvector + Sentence Transformers
- 🤖 **Claude AI support chat** — context-aware with live DB injection
- ⚡ **Zero-latency bidding** — Socket.io WebSockets
- 📊 **Live demand heatmaps** — real-time category intelligence
- 🌍 **Arabic / English** localization toggle
- 💳 **Stripe** secure payment processing
- 📸 **Cloudinary** image management
- 🧪 **Built-in A/B testing** framework

---

*Production-grade graduation project — MENA's next-generation rare auction sanctuary.*