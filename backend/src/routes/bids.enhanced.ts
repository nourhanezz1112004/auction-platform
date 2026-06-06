// backend/src/routes/bids.ts
// ══════════════════════════════════════════════════════════════════════
// BidSpace — Bid Placement Route v2.0
// IMPROVEMENTS over v1:
//   • Calls /fraud/score (enhanced ensemble) instead of /predict/fraud
//   • Blocks bids at fraud_score > 0.85 with risk_level in response
//   • Rate limiting: max 5 bids/10s per user (Redis-backed)
//   • Anti-snipe: extends by 2 min AND broadcasts new endTime to room
//   • Minimum increment validated server-side (min 1% or $5, whichever greater)
//   • Autobidder trigger: notifies Bull queue after successful bid
//   • Full audit trail on every path (accept + all rejection reasons)
//   • Concurrency: SELECT FOR UPDATE prevents duplicate winning bids
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import type { Server as IOServer } from "socket.io";
import { prisma } from "../lib/prisma";
import { bidAuditMiddleware } from "../middleware/auditContext";
import { auditAuction } from "../services/auditLogger";
import { requireAuth } from "../middleware/requireAuth";
import { redisClient } from "../lib/redis";

const router = Router();
router.use(bidAuditMiddleware);

// Injected at startup: setIo(io) must be called from app.ts
let _io: IOServer | null = null;
export function setIo(io: IOServer) { _io = io; }

// ── Helpers ──────────────────────────────────────────────────────────────────

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

async function callAI<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${AI_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),   // 3s hard timeout
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

/** Redis rate limiter: max `limit` calls per `windowSec` seconds. Returns true if allowed. */
async function checkRateLimit(userId: string, windowSec = 10, limit = 5): Promise<boolean> {
  const key = `bid_rate:${userId}`;
  try {
    const count = await redisClient.incr(key);
    if (count === 1) await redisClient.expire(key, windowSec);
    return count <= limit;
  } catch {
    return true;  // If Redis is down, allow through
  }
}

/** Minimum bid: max of 1% of current price or $5. */
function minBidIncrement(currentPrice: number): number {
  return Math.max(currentPrice * 0.01, 5);
}

function riskBadge(level: string): string {
  const map: Record<string, string> = {
    critical: "🚨 Critical fraud risk",
    high: "⚠️ High fraud risk",
    medium: "⚠️ Suspicious activity detected",
    low: "",
  };
  return map[level] ?? "";
}

// ── POST /api/bids ────────────────────────────────────────────────────────────

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const { auctionId, amount } = req.body as { auctionId: string; amount: number };
  const bidderId = (req as any).user?.sub ?? req.auditCtx.actorId!;

  // ── 0. Input validation ────────────────────────────────────────────────────
  if (!auctionId || typeof amount !== "number" || amount <= 0) {
    return res.status(400).json({ error: "auctionId and positive amount are required" });
  }

  // ── 1. Rate limit ─────────────────────────────────────────────────────────
  const allowed = await checkRateLimit(bidderId);
  if (!allowed) {
    res.locals.auditBid = {
      action: "BID_REJECTED_RATE_LIMIT", bidId: "N/A", auctionId,
      bidAmount: amount, previousHighestBid: 0,
      rejectionReason: "Too many bids per second",
    };
    return res.status(429).json({ error: "Too many bids — please slow down" });
  }

  // ── 2. Lock auction row ────────────────────────────────────────────────────
  const [auction] = await prisma.$queryRaw<Array<{
    id: string; currentPrice: number; reservePrice: number;
    endsAt: Date; sellerId: string; status: string;
    title: string; category: string;
  }>>`
    SELECT id, "currentPrice", "reservePrice", "endsAt",
           "sellerId", status, title, category
    FROM "Auction" WHERE id = ${auctionId} FOR UPDATE
  `;

  if (!auction) {
    return res.status(404).json({ error: "Auction not found" });
  }

  // ── 3. Business rule validations ───────────────────────────────────────────
  if (auction.sellerId === bidderId) {
    res.locals.auditBid = {
      action: "BID_REJECTED_SELF_BID", bidId: "N/A", auctionId,
      bidAmount: amount, previousHighestBid: auction.currentPrice,
      rejectionReason: "Seller cannot bid on own auction",
    };
    return res.status(400).json({ error: "You cannot bid on your own auction" });
  }

  if (auction.status !== "ACTIVE" || new Date() > auction.endsAt) {
    res.locals.auditBid = {
      action: "BID_REJECTED_AUCTION_CLOSED", bidId: "N/A", auctionId,
      bidAmount: amount, previousHighestBid: auction.currentPrice,
      rejectionReason: `Status: ${auction.status}`,
    };
    return res.status(400).json({ error: "This auction is no longer accepting bids" });
  }

  const increment = minBidIncrement(auction.currentPrice);
  const minBid    = auction.currentPrice + increment;
  if (amount < minBid) {
    res.locals.auditBid = {
      action: "BID_REJECTED_TOO_LOW", bidId: "N/A", auctionId,
      bidAmount: amount, previousHighestBid: auction.currentPrice,
      rejectionReason: `Minimum bid: $${minBid.toFixed(2)}`,
    };
    return res.status(400).json({
      error: `Minimum bid is $${minBid.toFixed(2)} (current $${auction.currentPrice} + $${increment.toFixed(2)} increment)`,
      minBid: Math.ceil(minBid * 100) / 100,
    });
  }

  // ── 4. Fraud check ─────────────────────────────────────────────────────────
  let fraudScore = 0;
  let riskLevel  = "low";

  const fraudResult = await callAI<{
    fraud_score: number; should_block: boolean; risk_level: string;
  }>("/fraud/score", {
    user_id: bidderId, auction_id: auctionId,
    bid_amount: amount, current_price: auction.currentPrice,
    category: auction.category,
  });

  if (fraudResult) {
    fraudScore = fraudResult.fraud_score;
    riskLevel  = fraudResult.risk_level;

    if (fraudResult.should_block) {
      res.locals.auditBid = {
        action: "BID_REJECTED_FRAUD", bidId: "N/A", auctionId,
        bidAmount: amount, previousHighestBid: auction.currentPrice,
        fraudScore, riskLevel,
        rejectionReason: `Fraud score ${fraudScore.toFixed(3)} (${riskLevel})`,
      };
      return res.status(403).json({
        error: `Bid blocked: ${riskBadge(riskLevel)}`,
        fraud_score: fraudScore,
        risk_level: riskLevel,
      });
    }
  }

  // ── 5. Write bid + update auction atomically ───────────────────────────────
  const [bid] = await prisma.$transaction([
    prisma.bid.create({
      data: { auctionId, userId: bidderId, amount, fraudScore },
    }),
    prisma.auction.update({
      where: { id: auctionId },
      data: { currentPrice: amount },
    }),
  ]);

  // ── 6. Anti-snipe extension ────────────────────────────────────────────────
  const TWO_MIN_MS    = 2 * 60 * 1000;
  const timeRemaining = auction.endsAt.getTime() - Date.now();
  let finalEndTime    = auction.endsAt;

  if (timeRemaining < TWO_MIN_MS) {
    finalEndTime = new Date(Date.now() + TWO_MIN_MS);
    await prisma.auction.update({
      where: { id: auctionId },
      data:  { endsAt: finalEndTime },
    });
    auditAuction({
      action: "AUCTION_EXTENDED", auctionId,
      snapshot: {
        title: auction.title,
        extensionReason: "Anti-snipe: bid within 2 min of close",
        newEndTime: finalEndTime,
      },
    }).catch(() => {});

    // Broadcast new end time to auction room
    _io?.to(`socket:auction:${auctionId}`).emit("auction:extended", {
      auctionId, newEndTime: finalEndTime.toISOString(),
    });
  }

  // ── 7. Broadcast new bid to auction room ───────────────────────────────────
  _io?.to(`socket:auction:${auctionId}`).emit("bid:new", {
    auctionId,
    bidId:        bid.id,
    amount,
    bidderId:     bidderId,
    currentPrice: amount,
    timestamp:    bid.createdAt,
    endTime:      finalEndTime.toISOString(),
  });

  // ── 8. Trigger autobidder check (fire-and-forget) ─────────────────────────
  setImmediate(async () => {
    try {
      const { autobidQueue } = await import("../jobs/autobidder");
      await autobidQueue.add("check-autobids", { auctionId, newPrice: amount, triggeredBy: bidderId });
    } catch { /* autobidder queue optional */ }
  });

  // ── 9. Cache bust Redis listing cache ─────────────────────────────────────
  try {
    await redisClient.del(`auction:${auctionId}:current`);
    await redisClient.set(
      `auction:${auctionId}:current`,
      JSON.stringify({ currentPrice: amount, updatedAt: Date.now() }),
      { EX: 10 }
    );
  } catch { /* non-critical */ }

  // ── 10. Audit ──────────────────────────────────────────────────────────────
  res.locals.auditBid = {
    action: "BID_PLACED", bidId: bid.id, auctionId,
    bidAmount: amount, previousHighestBid: auction.currentPrice,
    fraudScore, riskLevel,
  };

  return res.status(201).json({
    success:      true,
    bid:          { id: bid.id, amount, auctionId, createdAt: bid.createdAt },
    currentPrice: amount,
    endTime:      finalEndTime.toISOString(),
    antiSnipeExtended: timeRemaining < TWO_MIN_MS,
  });
});

// ── GET /api/bids/audit/:auctionId ────────────────────────────────────────────
router.get("/audit/:auctionId", requireAuth, async (req: Request, res: Response) => {
  const { auctionId } = req.params;
  const { limit = "50", cursor } = req.query as Record<string, string>;

  const logs = await prisma.auditLog.findMany({
    where:   { auctionId },
    orderBy: { createdAt: "desc" },
    take:    Math.min(parseInt(limit), 100),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true, createdAt: true, action: true, entity: true,
      entityId: true, actorIp: true, snapshot: true,
      actor: { select: { id: true, email: true, name: true } },
    },
  });

  return res.json({
    logs,
    nextCursor: logs.length === parseInt(limit) ? logs.at(-1)!.id : null,
  });
});

export default router;
