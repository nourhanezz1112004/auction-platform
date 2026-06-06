import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.middleware';
import { prisma } from '../../lib/prisma';

// ─── Setup ────────────────────────────────────────────────────────────────────

export const searchRouter = Router();

const LIMIT = 20;

const SearchQuerySchema = z.object({
  q:        z.string().optional().default(''),
  category: z.string().optional().default(''),
  minPrice: z.string().regex(/^\d+(\.\d+)?$/).optional().or(z.literal('')).default(''),
  maxPrice: z.string().regex(/^\d+(\.\d+)?$/).optional().or(z.literal('')).default(''),
  page:     z.string().regex(/^\d+$/).optional().default('1'),
});

// ─── GET /search ──────────────────────────────────────────────────────────────
//  Query params (all optional):
//    q          — full-text search term (tsvector on title + description)
//    category   — exact category match
//    minPrice   — currentPrice >= minPrice
//    maxPrice   — currentPrice <= maxPrice
//    page       — 1-based page number (default 1)
//
//  Returns: { results: Auction[], total: number }

searchRouter.get('/', validate({ query: SearchQuerySchema }), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      q        = '',
      category  = '',
      minPrice  = '',
      maxPrice  = '',
      page      = '1',
    } = req.query as any;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const offset  = (pageNum - 1) * LIMIT;

    const min = minPrice ? parseFloat(minPrice) : null;
    const max = maxPrice ? parseFloat(maxPrice) : null;
    const cat = category.trim() || null;
    const term = q.trim();

    if (term) {
      // ── Full-text search path ───────────────────────────────────────────────
      //
      // We use two raw queries (results + count) because Prisma does not expose
      // tsvector operators. All interpolated values go through Prisma.sql tagged
      // template literals so they are properly parameterised — never concatenated.
      //
      // DB column names (snake_case) are used in raw SQL:
      //   currentPrice  → current_price
      //   startingPrice → starting_price
      //   reservePrice  → reserve_price
      //   sellerId      → seller_id
      //   imageUrls     → image_urls
      //   deletedAt     → deleted_at
      //   startsAt      → starts_at
      //   endsAt        → ends_at
      //   createdAt     → created_at
      //
      // plainto_tsquery is used (not to_tsquery) so raw user input never causes
      // a syntax error — it treats all words as AND-joined terms automatically.

      // Build optional filter fragments
      const categoryFilter = cat
        ? Prisma.sql`AND "category" = ${cat}`
        : Prisma.empty;

      const minFilter = min !== null
        ? Prisma.sql`AND "currentPrice" >= ${min}`
        : Prisma.empty;

      const maxFilter = max !== null
        ? Prisma.sql`AND "currentPrice" <= ${max}`
        : Prisma.empty;

      const [results, countRows] = await Promise.all([
        prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT
            "id",
            "title",
            "description",
            "sellerId",
            "category",
            "startingPrice",
            "currentPrice",
            "reservePrice",
            "imageUrls",
            "status",
            "version",
            "startsAt",
            "endsAt",
            "createdAt",
            "deletedAt"
          FROM "Auction"
          WHERE "status"   = 'ACTIVE'
            AND "deletedAt" IS NULL
            AND (
              to_tsvector('english', "title" || ' ' || "description") @@ plainto_tsquery('english', ${term})
              OR "title" ILIKE ${'%' + term + '%'}
              OR "description" ILIKE ${'%' + term + '%'}
            )
            ${categoryFilter}
            ${minFilter}
            ${maxFilter}
          ORDER BY "currentPrice" DESC
          LIMIT  ${LIMIT}
          OFFSET ${offset}
        `,
        prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS count
          FROM "Auction"
          WHERE "status"   = 'ACTIVE'
            AND "deletedAt" IS NULL
            AND (
              to_tsvector('english', "title" || ' ' || "description") @@ plainto_tsquery('english', ${term})
              OR "title" ILIKE ${'%' + term + '%'}
              OR "description" ILIKE ${'%' + term + '%'}
            )
            ${categoryFilter}
            ${minFilter}
            ${maxFilter}
        `,
      ]);

      const total = countRows[0]?.count !== undefined ? Number(countRows[0].count) : 0;

      // Post-process raw results to attach seller and _count of bids
      const auctionIds = results.map((r: any) => r.id);
      let resultsWithRelations = results;
      if (auctionIds.length > 0) {
        const [sellers, bidCounts] = await Promise.all([
          prisma.user.findMany({
            where: { auctions: { some: { id: { in: auctionIds } } } },
            select: { id: true, name: true, rating: true, avatarUrl: true },
          }),
          prisma.bid.groupBy({
            by: ['auctionId'],
            where: { auctionId: { in: auctionIds } },
            _count: { id: true },
          }),
        ]);

        const sellersMap = new Map(sellers.map(s => [s.id, s]));
        const bidCountsMap = new Map(bidCounts.map(b => [b.auctionId, b._count.id]));

        resultsWithRelations = results.map((r: any) => ({
          ...r,
          seller: sellersMap.get(r.sellerId) || null,
          _count: {
            bids: bidCountsMap.get(r.id) || 0,
          },
        }));
      }

      res.json({ results: resultsWithRelations, total });
    } else {
      // ── No search term — return all ACTIVE auctions via Prisma ORM ──────────
      //
      // Prisma handles all filtering safely here — no raw SQL needed.
      // Results are still ordered by currentPrice DESC as required.

      const where: Prisma.AuctionWhereInput = {
        status:    'ACTIVE',
        deletedAt: null,
        ...(cat               && { category: cat }),
        ...(min !== null || max !== null) && {
          currentPrice: {
            ...(min !== null && { gte: min }),
            ...(max !== null && { lte: max }),
          },
        },
      };

      const [results, total] = await Promise.all([
        prisma.auction.findMany({
          where,
          orderBy: { currentPrice: 'desc' },
          skip:    offset,
          take:    LIMIT,
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

      res.json({ results, total });
    }
  } catch (err) {
    next(err);
  }
});
