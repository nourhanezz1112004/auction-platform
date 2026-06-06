import { CreateAuctionRequest, UpdateAuctionRequest, AuctionQuery, BidQuery } from '@auction/shared-types';
import { EVENTS, CACHE_KEYS, AuctionCreatedPayload } from '@auction/shared-events';
import { NotFoundError } from '../../middlewares/error.middleware';
import { redis } from '../../utils/redis';
import { prisma } from '../../lib/prisma';

// ─── List ─────────────────────────────────────────────────────────────────────

export async function list(query: AuctionQuery) {
  const { page, limit, category, status, q, sellerId } = query;
  const skip = (page - 1) * limit;

  const where: any = { deletedAt: null };
  if (category) where.category = category;
  if (status)   where.status   = status;
  if (sellerId) where.sellerId = sellerId;
  if (q) {
    // Phase 1: simple ILIKE. Phase 2: replace with tsvector full-text search.
    where.OR = [
      { title:       { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [auctions, total] = await Promise.all([
    prisma.auction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            rating: true,
            avatarUrl: true,
          }
        },
        _count: {
          select: { bids: true }
        }
      }
    }),
    prisma.auction.count({ where }),
  ]);

  return { auctions, total, page };
}

// ─── Get One ──────────────────────────────────────────────────────────────────

export async function getOne(id: string) {
  const auction = await prisma.auction.findFirst({
    where: { id, deletedAt: null },
    include: {
      payment: { select: { status: true } },
      seller: {
        select: {
          id: true,
          name: true,
          rating: true,
          avatarUrl: true,
        }
      },
      _count: {
        select: { bids: true }
      }
    },
  });
  if (!auction) throw new NotFoundError('Auction not found');
  return auction;
}

// ─── Get Bids for Auction ─────────────────────────────────────────────────────

export async function getBids(auctionId: string, query: BidQuery) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;
  const [bids, total] = await Promise.all([
    prisma.bid.findMany({ where: { auctionId }, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.bid.count({ where: { auctionId } }),
  ]);
  return { bids, total };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function create(data: CreateAuctionRequest & { sellerId: string }) {
  const auction = await prisma.auction.create({
    data: {
      ...data,
      currentPrice: data.startingPrice,
      status: new Date(data.startsAt) <= new Date() ? 'ACTIVE' : 'DRAFT',
    },
  });

  // Publish event
  const payload: AuctionCreatedPayload = {
    auctionId: auction.id,
    sellerId:  auction.sellerId,
    title:     auction.title,
    category:  auction.category,
  };
  await redis.publish(EVENTS.AUCTION_CREATED, JSON.stringify(payload));

  // Embed auction description into recommender index (fire-and-forget)
  const aiUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';
  const embedText = `${auction.category}|${auction.title}|${auction.description}`;
  fetch(`${aiUrl}/ai/embed`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ auction_id: auction.id, description: embedText }),
  }).catch(() => {/* non-critical — recommender still works via fallback */});

  return auction;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function update(id: string, data: UpdateAuctionRequest) {
  const existing = await prisma.auction.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Auction not found');
  return prisma.auction.update({ where: { id }, data });
}

// ─── Soft Delete ──────────────────────────────────────────────────────────────

export async function remove(id: string) {
  const existing = await prisma.auction.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new NotFoundError('Auction not found');
  await prisma.auction.update({ where: { id }, data: { deletedAt: new Date(), status: 'CANCELLED' } });
}

// ─── Recommendations ──────────────────────────────────────────────────────────
//
// The AI service writes personalised recommendation arrays to Redis under
// CACHE_KEYS.recommendations(userId). Each element is { auction_id, score, reason }.
//
// Cache hit  → return parsed array directly.
// Cache miss → fall back to 10 most-recently-created ACTIVE auctions from DB
//              (safe default — never errors on empty results).
//
// DB fallback: most recent ACTIVE auctions
export async function getRecommendations(userId?: string): Promise<unknown[]> {
  try {
    if (userId) {
      const cached = await redis.get(CACHE_KEYS.recommendations(userId));
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch {
    // Redis error or bad JSON — fall through to DB fallback
  }

  // DB fallback: most recent ACTIVE auctions
  const fallback = await prisma.auction.findMany({
    where:   { status: 'ACTIVE', deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take:    10,
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          rating: true,
          avatarUrl: true,
        }
      },
      _count: {
        select: { bids: true }
      }
    }
  });

  return fallback;
}

