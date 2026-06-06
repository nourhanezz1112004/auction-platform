-- Migration: add_enhanced_features
-- Adds all new tables and columns from the enhanced platform

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Add columns to existing tables ────────────────────────────────────────────

-- Auction: add extensionCount and searchEmbedding
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "extensionCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "searchEmbedding" vector(384);

-- Bid: add autobid and fraud fields
ALTER TABLE "Bid" ADD COLUMN IF NOT EXISTS "isAutobid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Bid" ADD COLUMN IF NOT EXISTS "isFraud" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Bid" ADD COLUMN IF NOT EXISTS "fraudScore" DOUBLE PRECISION;

-- User: add role field
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'USER';

-- Notification: add readAt and metadata
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMPTZ;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT '{}';

-- ── Create AuditAction enum ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "AuditAction" AS ENUM (
    'BID_PLACED', 'BID_REJECTED_FRAUD', 'BID_REJECTED_TOO_LOW',
    'BID_REJECTED_AUCTION_CLOSED', 'BID_REJECTED_SELF_BID',
    'BID_RETRACTED', 'BID_WINNING', 'BID_OUTBID',
    'AUCTION_CREATED', 'AUCTION_EXTENDED', 'AUCTION_CLOSED',
    'AUCTION_CANCELLED', 'AUCTION_RESERVE_NOT_MET',
    'PAYMENT_INITIATED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED',
    'PAYMENT_REFUNDED', 'PAYMENT_DISPUTED', 'ESCROW_RELEASED', 'ESCROW_HELD',
    'ADMIN_BID_OVERRIDE', 'ADMIN_USER_SUSPENDED', 'ADMIN_FRAUD_FLAG'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AuditEntity" AS ENUM ('BID', 'AUCTION', 'PAYMENT', 'USER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── AutobidRegistration ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AutobidRegistration" (
  "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "userId"          TEXT        NOT NULL,
  "auctionId"       TEXT        NOT NULL,
  "maxBudget"       DOUBLE PRECISION NOT NULL,
  "strategy"        TEXT        NOT NULL,
  "isActive"        BOOLEAN     NOT NULL DEFAULT true,
  "totalBidsPlaced" INTEGER     NOT NULL DEFAULT 0,
  CONSTRAINT "AutobidRegistration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutobidRegistration_userId_auctionId_key" UNIQUE ("userId", "auctionId"),
  CONSTRAINT "AutobidRegistration_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "AutobidRegistration_auctionId_fkey"
    FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "AutobidRegistration_auctionId_isActive_idx" ON "AutobidRegistration"("auctionId","isActive");
CREATE INDEX IF NOT EXISTS "AutobidRegistration_userId_idx" ON "AutobidRegistration"("userId");

-- ── ShillAlert ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ShillAlert" (
  "id"                  TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "auctionId"           TEXT        NOT NULL,
  "riskScore"           DOUBLE PRECISION NOT NULL,
  "suspiciousBidderIds" TEXT[]      NOT NULL DEFAULT '{}',
  "evidence"            TEXT[]      NOT NULL DEFAULT '{}',
  "status"              TEXT        NOT NULL DEFAULT 'pending',
  "reviewedById"        TEXT,
  "reviewedAt"          TIMESTAMPTZ,
  CONSTRAINT "ShillAlert_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShillAlert_auctionId_fkey"
    FOREIGN KEY ("auctionId") REFERENCES "Auction"("id")
);
CREATE INDEX IF NOT EXISTS "ShillAlert_auctionId_idx" ON "ShillAlert"("auctionId");
CREATE INDEX IF NOT EXISTS "ShillAlert_status_createdAt_idx" ON "ShillAlert"("status","createdAt");

-- ── AiModelVersion ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AiModelVersion" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "modelType" TEXT        NOT NULL,
  "version"   TEXT        NOT NULL,
  "mae"       DOUBLE PRECISION,
  "rocAuc"    DOUBLE PRECISION,
  "nSamples"  INTEGER,
  "isActive"  BOOLEAN     NOT NULL DEFAULT true,
  CONSTRAINT "AiModelVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiModelVersion_modelType_isActive_idx" ON "AiModelVersion"("modelType","isActive");

-- ── FcmToken ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FcmToken" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "userId"    TEXT        NOT NULL,
  "token"     TEXT        NOT NULL,
  "platform"  TEXT        NOT NULL,
  "isActive"  BOOLEAN     NOT NULL DEFAULT true,
  CONSTRAINT "FcmToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FcmToken_token_key" UNIQUE ("token"),
  CONSTRAINT "FcmToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "FcmToken_userId_isActive_idx" ON "FcmToken"("userId","isActive");
CREATE INDEX IF NOT EXISTS "FcmToken_token_idx" ON "FcmToken"("token");

-- ── SupportTicket ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id"               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "userId"           TEXT        NOT NULL,
  "auctionId"        TEXT,
  "status"           TEXT        NOT NULL DEFAULT 'open',
  "escalationReason" TEXT,
  "conversationJson" JSONB       NOT NULL DEFAULT '[]',
  "resolvedAt"       TIMESTAMPTZ,
  "resolvedById"     TEXT,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportTicket_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "SupportTicket_userId_status_idx" ON "SupportTicket"("userId","status");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status","createdAt");
CREATE INDEX IF NOT EXISTS "SupportTicket_auctionId_idx" ON "SupportTicket"("auctionId");

-- ── AuditLog ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"         TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "createdAt"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "action"     "AuditAction" NOT NULL,
  "entity"     "AuditEntity" NOT NULL,
  "entityId"   TEXT         NOT NULL,
  "actorId"    TEXT,
  "actorIp"    TEXT,
  "actorAgent" TEXT,
  "snapshot"   JSONB        NOT NULL DEFAULT '{}',
  "auctionId"  TEXT,
  "userId"     TEXT,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON "AuditLog"("entity","entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId","createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_auctionId_createdAt_idx" ON "AuditLog"("auctionId","createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action","createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- ── Vector index for semantic search ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "auction_search_embedding_idx"
  ON "Auction" USING ivfflat ("searchEmbedding" vector_cosine_ops) WITH (lists = 10);
