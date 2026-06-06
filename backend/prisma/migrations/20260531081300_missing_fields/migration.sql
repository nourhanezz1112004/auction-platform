-- Enable pgvector extension (required for vector(384) column on Auction)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('outbid', 'won', 'sold', 'flagged', 'info');

-- CreateEnum
CREATE TYPE "FraudStatus" AS ENUM ('pending', 'allow', 'review', 'escalate');

-- CreateEnum
CREATE TYPE "AbGroup" AS ENUM ('a', 'b');

-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "embedding" vector(384),
ADD COLUMN     "winnerId" TEXT;

-- AlterTable
ALTER TABLE "FraudFlag" DROP COLUMN "reviewed",
DROP COLUMN "status",
ADD COLUMN     "status" "FraudStatus" NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
DROP COLUMN "abGroup",
ADD COLUMN     "abGroup" "AbGroup" NOT NULL DEFAULT 'a';

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "auctionId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'info',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Auction_status_idx" ON "Auction"("status");

-- CreateIndex
CREATE INDEX "Auction_status_endsAt_idx" ON "Auction"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Auction_sellerId_idx" ON "Auction"("sellerId");

-- CreateIndex
CREATE INDEX "Bid_auctionId_idx" ON "Bid"("auctionId");

-- CreateIndex
CREATE INDEX "Bid_userId_idx" ON "Bid"("userId");

-- CreateIndex
CREATE INDEX "Bid_userId_createdAt_idx" ON "Bid"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BotBlock_userId_idx" ON "BotBlock"("userId");

-- CreateIndex
CREATE INDEX "BotBlock_auctionId_idx" ON "BotBlock"("auctionId");

-- CreateIndex
CREATE INDEX "BotBlock_createdAt_idx" ON "BotBlock"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_auctionId_key" ON "Review"("userId", "auctionId");

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotBlock" ADD CONSTRAINT "BotBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotBlock" ADD CONSTRAINT "BotBlock_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
