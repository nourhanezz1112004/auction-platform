// backend/src/jobs/shillAlerts.ts
// Nightly job that runs shill bidding detection across all active auctions
// with >= 3 bids. Saves high-risk auctions to the ShillAlert table.
// Sends admin push + email for critical cases.

import Queue from "bull";
import { prisma } from "../lib/prisma";
import { callWithFallback } from "../lib/aiService";
import { sendPush } from "../services/pushNotifications";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const shillQueue = new Queue("shill-alerts", REDIS_URL, {
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail:     100,
    attempts:         2,
  },
});

// Schedule: add to app startup
// shillQueue.add("nightly-scan", {}, { repeat: { cron: "0 3 * * *" } }); // 3 AM nightly

shillQueue.process("nightly-scan", async () => {
  console.log("[shill] Starting nightly shill detection scan…");

  // All active auctions with enough bids to analyse
  const auctions = await prisma.auction.findMany({
    where: {
      status: "ACTIVE",
      bids: { some: {} },
    },
    select: { id: true, title: true, _count: { select: { bids: true } } },
  });

  const significant = auctions.filter(a => a._count.bids >= 3);
  console.log(`[shill] Scanning ${significant.length} auctions…`);

  let flagged = 0;

  for (const auction of significant) {
    const result = await callWithFallback<{
      shill_risk_score: number;
      suspicious_bidder_ids: string[];
      evidence: string[];
      recommendation: string;
    }>("/fraud/shill-network", { auction_id: auction.id });

    if (!result) continue;

    // Only save if risk score exceeds threshold
    if (result.shill_risk_score < 0.4) continue;

    // Check if we already have an open alert for this auction
    const existing = await prisma.shillAlert.findFirst({
      where: { auctionId: auction.id, status: "pending" },
    });

    if (existing) {
      // Update the existing alert with latest score
      await prisma.shillAlert.update({
        where: { id: existing.id },
        data: {
          riskScore:              result.shill_risk_score,
          suspiciousBidderIds:    result.suspicious_bidder_ids,
          evidence:               result.evidence,
        },
      });
    } else {
      // Create new alert
      await prisma.shillAlert.create({
        data: {
          auctionId:           auction.id,
          riskScore:           result.shill_risk_score,
          suspiciousBidderIds: result.suspicious_bidder_ids,
          evidence:            result.evidence,
          status:              "pending",
        },
      });
      flagged++;

      // Notify admins for high-risk auctions (score > 0.7)
      if (result.shill_risk_score > 0.7) {
        const admins = await prisma.user.findMany({
          where: { role: "ADMIN" },
          select: { id: true, email: true },
        });

        for (const admin of admins) {
          // In-app notification
          await prisma.notification.create({
            data: {
              userId:  admin.id,
              type:    "SHILL_ALERT",
              title:   "⚠ High shill risk detected",
              message: `"${auction.title}" — risk score ${(result.shill_risk_score * 100).toFixed(0)}%. ${result.evidence[0] ?? ""}`,
              metadata: {
                auctionId: auction.id,
                riskScore: result.shill_risk_score,
                evidence:  result.evidence,
              },
            },
          });

          // Push notification to admin
          await sendPush(admin.id, {
            title: "⚠ Shill bidding detected",
            body:  `"${auction.title}" — ${(result.shill_risk_score * 100).toFixed(0)}% risk. Review required.`,
            data: {
              type:      "SHILL_ALERT",
              auctionId: auction.id,
              screen:    "AdminAuction",
            },
          });
        }
      }
    }
  }

  console.log(`[shill] Scan complete — ${flagged} new alerts created`);
  return { scanned: significant.length, flagged };
});

// ── Process a single auction on-demand ────────────────────────────
shillQueue.process("scan-auction", async (job) => {
  const { auctionId } = job.data as { auctionId: string };

  const result = await callWithFallback<{
    shill_risk_score: number;
    suspicious_bidder_ids: string[];
    evidence: string[];
    recommendation: string;
  }>("/fraud/shill-network", { auction_id: auctionId });

  if (!result) return { error: "AI service unavailable" };

  await prisma.shillAlert.upsert({
    where: { id: `${auctionId}-latest` },
    create: {
      id:                  `${auctionId}-latest`,
      auctionId,
      riskScore:           result.shill_risk_score,
      suspiciousBidderIds: result.suspicious_bidder_ids,
      evidence:            result.evidence,
      status:              result.shill_risk_score > 0.4 ? "pending" : "dismissed",
    },
    update: {
      riskScore:           result.shill_risk_score,
      suspiciousBidderIds: result.suspicious_bidder_ids,
      evidence:            result.evidence,
    },
  });

  return result;
});
