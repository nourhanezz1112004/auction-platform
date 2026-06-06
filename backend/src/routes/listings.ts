// backend/src/routes/listings.ts
// Cursor-based pagination + Redis caching for auction listings.

import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { createClient } from "redis";
import { validateQuery, validateBody, ListingQuerySchema, CreateListingSchema } from "../schemas";
import { requireAuth } from "../middleware/requireAuth";
import { upsertEmbedding } from "../services/vectorRecommendations";
import { scheduleAuctionClose } from "../jobs/auctionTimer";

const router  = Router();
const redis   = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
redis.connect().catch(console.error);

const CACHE_TTL = 10; // seconds — invalidated on new bids/listings

function listingCacheKey(query: Record<string, unknown>): string {
  return `listings:${JSON.stringify(query)}`;
}

// ── GET /api/listings — cursor-paginated, cached ──────────────────────────────
router.get("/", validateQuery(ListingQuerySchema), async (req: Request, res: Response) => {
  const q = (req as any).validatedQuery;
  const cacheKey = listingCacheKey(q);

  // Cache check
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(JSON.parse(cached));
  }

  const where: any = {};
  if (q.category) where.category = q.category;
  if (q.condition) where.condition = q.condition;
  if (q.status)   where.status = q.status;
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    where.currentPrice = {
      ...(q.minPrice !== undefined ? { gte: q.minPrice } : {}),
      ...(q.maxPrice !== undefined ? { lte: q.maxPrice } : {}),
    };
  }

  // Cursor-based pagination (keyset) — never slows down at page 1000+
  if (q.cursor) {
    where[q.sort] = q.order === "asc" ? { gt: await resolveCursor(q.cursor, q.sort) }
                                       : { lt: await resolveCursor(q.cursor, q.sort) };
    where.id = { not: q.cursor }; // exclude the cursor item itself
  }

  const items = await prisma.auction.findMany({
    where,
    take: q.limit + 1, // fetch one extra to detect next page
    orderBy: [{ [q.sort]: q.order }, { id: "asc" }],
    select: {
      id: true, title: true, category: true, condition: true,
      currentPrice: true, reservePrice: true, endTime: true,
      status: true, createdAt: true,
      imageUrls: true,
      _count: { select: { bids: true } },
      seller: { select: { id: true, name: true, reputationScore: true } },
    },
  });

  const hasNextPage = items.length > q.limit;
  const results = hasNextPage ? items.slice(0, -1) : items;
  const nextCursor = hasNextPage ? results[results.length - 1].id : null;

  const response = { data: results, nextCursor, hasNextPage, count: results.length };

  // Cache for 10s
  redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response)).catch(() => {});

  res.setHeader("X-Cache", "MISS");
  return res.json(response);
});

async function resolveCursor(cursor: string, field: string): Promise<any> {
  const item = await prisma.auction.findUnique({ where: { id: cursor }, select: { [field]: true, id: true } });
  return item ? (item as any)[field] : undefined;
}

// ── POST /api/listings — create with embedding + schedule close ───────────────
router.post("/", requireAuth, validateBody(CreateListingSchema), async (req: Request, res: Response) => {
  const sellerId = (req as any).user?.id;
  const data = req.body;

  const auction = await prisma.auction.create({
    data: {
      ...data,
      sellerId,
      currentPrice: data.startingPrice,
      status: new Date(data.startTime) <= new Date() ? "ACTIVE" : "SCHEDULED",
    },
  });

  // Async: generate vector embedding and schedule close job
  upsertEmbedding(auction.id).catch(() => {});
  scheduleAuctionClose(auction.id, new Date(data.endTime)).catch(() => {});

  // Invalidate listing caches (broad invalidation)
  const keys = await redis.keys("listings:*").catch(() => [] as string[]);
  if (keys.length) await redis.del(keys).catch(() => {});

  return res.status(201).json(auction);
});

// ── Invalidate cache for an auction (call after a bid is placed) ──────────────
export async function invalidateListingCache(auctionId: string): Promise<void> {
  const keys = await redis.keys("listings:*").catch(() => [] as string[]);
  const roomKey = `auction:${auctionId}:*`;
  const roomKeys = await redis.keys(roomKey).catch(() => [] as string[]);
  const all = [...keys, ...roomKeys];
  if (all.length) await redis.del(all).catch(() => {});
}

export default router;
