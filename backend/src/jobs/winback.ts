// backend/src/jobs/winback.ts
// Runs nightly — scores all users via propensity API, sends personalised winback
// notifications to cold/churned users with high potential to return.
// Uses your existing Bull queue, Prisma notifications table, and callWithFallback().

import Queue from "bull";
import { logger } from "@auction/shared-utils";
import { prisma } from "../lib/prisma";
import { callWithFallback } from "../lib/aiService";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const winbackQueue = new Queue("winback", REDIS_URL, {
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 2,
  },
});

// ── Schedule: run every night at 9 PM ────────────────────────────────────────
// Add this to your app startup:
//   winbackQueue.add("nightly-winback", {}, { repeat: { cron: "0 21 * * *" } });

winbackQueue.process("nightly-winback", async () => {
  logger.info({} as any, "[winback] Starting nightly propensity scoring...");

  // Fetch cold/churned users above score threshold from AI service
  const result = await callWithFallback<{
    users: Array<{
      user_id: string;
      score: number;
      segment: string;
      favourite_category: string;
      recommended_auction_ids: string[];
      winback_message: string | null;
    }>;
    total: number;
  }>("/propensity/bulk", {
    min_score: 0.3,
    segment: null,
    limit: 500,
  });

  if (!result) {
    logger.error({} as any, "[winback] Propensity service unavailable");
    return;
  }

  const coldUsers = result.users.filter(u =>
    u.segment === "cold" || u.segment === "churned"
  );

  logger.info({} as any, `[winback] Found ${coldUsers.length} users to re-engage`);

  // Batch notifications — don't spam, max 1 per user per 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);

  for (const user of coldUsers) {
    // Check if we already sent a winback recently
    const recent = await prisma.notification.findFirst({
      where: {
        userId: user.user_id,
        type: "WINBACK",
        createdAt: { gte: sevenDaysAgo },
      },
    });
    if (recent) continue;

    // Build personalised message
    const message = user.winback_message ??
      `There are new ${user.favourite_category} auctions ending this week — come back and bid!`;

    await prisma.notification.create({
      data: {
        userId: user.user_id,
        type: "WINBACK",
        title: "Auctions you might like",
        message,
        metadata: {
          recommendedAuctionIds: user.recommended_auction_ids,
          propensityScore: user.score,
          segment: user.segment,
        },
      },
    });
  }

  logger.info({} as any, `[winback] Sent ${coldUsers.length} winback notifications`);
});

// ── Watchlist demand surge job (runs every hour) ──────────────────────────────
export const demandAlertQueue = new Queue("demand-alerts", REDIS_URL, {
  defaultJobOptions: { removeOnComplete: 50, attempts: 2 },
});

// Add to startup: demandAlertQueue.add("check-demand", {}, { repeat: { cron: "0 * * * *" } });

demandAlertQueue.process("check-demand", async () => {
  const since = new Date(Date.now() - 24 * 3600_000);

  // Find auctions where 3+ new watchers joined in last 24h
  const hotItems = await prisma.$queryRaw<Array<{
    auction_id: string;
    title: string;
    watcher_count: number;
    new_watchers: number;
    category: string;
  }>>`
    SELECT
      w."auctionId"  AS auction_id,
      a.title,
      COUNT(*)::int  AS watcher_count,
      COUNT(*) FILTER (WHERE w."createdAt" >= ${since})::int AS new_watchers,
      a.category
    FROM "Watchlist" w
    JOIN "Auction" a ON a.id = w."auctionId"
    WHERE a.status = 'ACTIVE'
    GROUP BY w."auctionId", a.title, a.category
    HAVING COUNT(*) FILTER (WHERE w."createdAt" >= ${since}) >= 3
  `;

  for (const item of hotItems) {
    const watchers = await prisma.watchlist.findMany({
      where: { auctionId: item.auction_id },
      select: { userId: true },
    });

    for (const { userId } of watchers) {
      const recent = await prisma.notification.findFirst({
        where: {
          userId,
          type: "DEMAND_SURGE",
          metadata: { path: ["auctionId"], equals: item.auction_id },
          createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
        },
      });
      if (recent) continue;

      await prisma.notification.create({
        data: {
          userId,
          type: "DEMAND_SURGE",
          title: "Demand rising on your watchlist",
          message: `${item.new_watchers} people started watching "${item.title}" in the last 24h — ${item.watcher_count} total watching.`,
          metadata: { auctionId: item.auction_id, newWatchers: item.new_watchers },
        },
      });
    }
  }
});
