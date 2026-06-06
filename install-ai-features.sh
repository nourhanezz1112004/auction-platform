#!/bin/bash
# scripts/install-ai-features.sh
# Run from your repo root: bash scripts/install-ai-features.sh
# Installs all dependencies and runs the DB migration for the AI features.

set -e
echo "🤖 BidSpace AI features — installation script"
echo "=============================================="

# ── 1. Backend packages ───────────────────────────────────────────────────────
echo ""
echo "📦 Installing backend packages..."
cd backend
pnpm add \
  sentence-transformers \
  @anthropic-ai/sdk \
  bull \
  zod \
  express-rate-limit \
  rate-limit-redis \
  socket.io

echo "✅ Backend packages installed"

# ── 2. Frontend packages ──────────────────────────────────────────────────────
echo ""
echo "📦 Installing frontend packages..."
cd ../apps/web
pnpm add \
  @tanstack/react-query \
  @sentry/react \
  framer-motion

echo "✅ Frontend packages installed"

# ── 3. Python AI service packages ────────────────────────────────────────────
echo ""
echo "🐍 Installing Python AI packages..."
cd ../../ai-service
source venv/bin/activate 2>/dev/null || python -m venv venv && source venv/bin/activate

pip install \
  "numpy<2" \
  sentence-transformers \
  scikit-learn \
  xgboost \
  psycopg2-binary \
  joblib \
  httpx \
  python-dateutil

echo "✅ Python packages installed"

# ── 4. DB migration ───────────────────────────────────────────────────────────
echo ""
echo "🗄️  Running database migration..."
cd ../backend
pnpm prisma migrate dev --name add_all_ai_features
echo "✅ Migration complete"

# ── 5. Train models ───────────────────────────────────────────────────────────
echo ""
echo "🧠 Training AI models on your production data (10k+ bids)..."
cd ../ai-service
source venv/bin/activate
DATABASE_URL=$(grep DATABASE_URL ../backend/.env | cut -d '=' -f2-) \
  python -m app.models.train_models
echo "✅ Models trained"

# ── 6. Populate search embeddings (background) ────────────────────────────────
echo ""
echo "🔍 Populating semantic search embeddings (runs in background)..."
echo "This takes ~2 min for 10k auctions. Check progress at GET /search/populate-embeddings"
# Trigger via API once ai-service is running:
# curl -X POST http://localhost:8000/search/populate-embeddings

echo ""
echo "=============================================="
echo "✅ All AI features installed successfully!"
echo ""
echo "Next steps:"
echo "  1. Add ANTHROPIC_API_KEY to ai-service/.env"
echo "  2. Start services: docker compose up -d && pnpm dev"
echo "  3. Populate embeddings: curl -X POST http://localhost:8000/search/populate-embeddings"
echo "  4. View AI health:      curl http://localhost:8000/health"
echo ""
echo "New features available:"
echo "  • Semantic search:     /search/semantic"
echo "  • Fraud scoring:       /fraud/score"
echo "  • Shill detection:     /fraud/shill-network"
echo "  • Autobidder:          /autobidder/strategy"
echo "  • Seller insights:     /insights/seller"
echo "  • Buyer insights:      /insights/buyer"
echo "  • Photo quality:       /photo/quality-score"
echo "  • Demand heatmap:      /demand/heatmap"
echo "  • Item description:    /describe/item"
echo "  • Price prediction:    /predict/price"
