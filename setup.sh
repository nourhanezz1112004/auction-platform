#!/usr/bin/env bash
# setup.sh — First-time project setup
# Run once before `docker compose up` or `pnpm dev`
# Usage: bash setup.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║      Auction Platform — First-time Setup      ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# ── 1. Copy .env files ────────────────────────────────────────────────────────

copy_env() {
  local src="$1"
  local dst="$2"
  local label="$3"
  if [ -f "$dst" ]; then
    echo -e "${YELLOW}⚠  $label .env already exists — skipping copy${NC}"
  else
    cp "$src" "$dst"
    echo -e "${GREEN}✓  Created $dst from $src${NC}"
  fi
}

copy_env "backend/.env.example"   "backend/.env"   "Backend"
copy_env "ai-service/.env.example" "ai-service/.env" "AI Service"

# ── 2. Remind user of required secrets ────────────────────────────────────────

echo ""
echo "──────────────────────────────────────────────────"
echo "  Required secrets — edit backend/.env:"
echo "──────────────────────────────────────────────────"
echo "  POSTGRES_PASSWORD   — any strong password"
echo "  JWT_ACCESS_SECRET   — min 32 random chars"
echo "  JWT_REFRESH_SECRET  — min 32 random chars"
echo "  STRIPE_SECRET_KEY   — sk_test_... from Stripe"
echo "  STRIPE_WEBHOOK_SECRET — whsec_... from Stripe"
echo "  CLOUDINARY_*        — from cloudinary.com"
echo "  SENDGRID_API_KEY    — from sendgrid.com"
echo ""
echo "  Optional (ai-service/.env):"
echo "  ANTHROPIC_API_KEY   — for deep Listing Guard analysis"
echo "──────────────────────────────────────────────────"
echo ""

# ── 3. Check for required tools ───────────────────────────────────────────────

check_tool() {
  if command -v "$1" &>/dev/null; then
    echo -e "${GREEN}✓  $1 found${NC}"
  else
    echo -e "${RED}✗  $1 not found — please install it${NC}"
  fi
}

echo "Checking prerequisites:"
check_tool docker
check_tool "docker compose" 2>/dev/null || check_tool docker-compose
check_tool node
check_tool pnpm
check_tool python3
echo ""

# ── 4. Next steps ─────────────────────────────────────────────────────────────

echo "Next steps:"
echo "  1. Edit backend/.env and fill in your secrets"
echo "  2. docker compose up --build"
echo "  3. pnpm install (in a separate terminal)"
echo "  4. cd apps/web && pnpm dev"
echo ""
echo -e "${GREEN}Setup complete!${NC}"
