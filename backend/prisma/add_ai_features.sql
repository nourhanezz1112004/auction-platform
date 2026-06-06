-- Migration: add_ai_features
-- Run: pnpm prisma migrate dev --name add_ai_features
-- OR apply manually: psql $DATABASE_URL -f this_file.sql

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Auction"
  ADD COLUMN IF NOT EXISTS embedding vector(384),
  ADD COLUMN IF NOT EXISTS "extensionCount" integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS auction_embedding_cosine_idx
  ON "Auction" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

CREATE TYPE IF NOT EXISTS "AuditAction" AS ENUM (
  'BID_PLACED','BID_REJECTED_FRAUD','BID_REJECTED_TOO_LOW',
  'BID_REJECTED_AUCTION_CLOSED','BID_REJECTED_SELF_BID',
  'BID_RETRACTED','BID_WINNING','BID_OUTBID',
  'AUCTION_CREATED','AUCTION_EXTENDED','AUCTION_CLOSED',
  'AUCTION_CANCELLED','AUCTION_RESERVE_NOT_MET',
  'PAYMENT_INITIATED','PAYMENT_SUCCEEDED','PAYMENT_FAILED',
  'PAYMENT_REFUNDED','PAYMENT_DISPUTED','ESCROW_RELEASED','ESCROW_HELD',
  'ADMIN_BID_OVERRIDE','ADMIN_USER_SUSPENDED','ADMIN_FRAUD_FLAG'
);

CREATE TYPE IF NOT EXISTS "AuditEntity" AS ENUM ('BID','AUCTION','PAYMENT','USER');

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"         TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "createdAt"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "action"     "AuditAction" NOT NULL,
  "entity"     "AuditEntity" NOT NULL,
  "entityId"   TEXT          NOT NULL,
  "actorId"    TEXT,
  "actorIp"    TEXT,
  "actorAgent" TEXT,
  "snapshot"   JSONB         NOT NULL DEFAULT '{}',
  "auctionId"  TEXT,
  "userId"     TEXT,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx"    ON "AuditLog"("entity","entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx"  ON "AuditLog"("actorId","createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_auctionId_createdAt_idx" ON "AuditLog"("auctionId","createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx"   ON "AuditLog"("action","createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx"          ON "AuditLog"("createdAt");
