import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.middleware';
import { prisma } from '../../lib/prisma';

export const watchlistRouter = Router();

const UUIDParam = z.object({ id: z.string().uuid() });

// ─── GET /watchlist ───────────────────────────────────────────────────────────

watchlistRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.watchlistItem.findMany({
      where: { userId: req.user!.sub },
      include: {
        auction: {
          select: {
            id: true, title: true, status: true, currentPrice: true,
            startingPrice: true, endsAt: true, category: true, imageUrls: true,
            deletedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Remove entries whose auction was soft-deleted
    const filtered = items.filter((item) => item.auction !== null && item.auction.deletedAt === null);

    res.json({ watchlist: filtered });
  } catch (err) { next(err); }
});

// ─── POST /watchlist/:id ──────────────────────────────────────────────────────

watchlistRouter.post('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: auctionId } = UUIDParam.parse(req.params);

    // Verify auction exists and is not deleted
    const auction = await prisma.auction.findFirst({
      where: { id: auctionId, deletedAt: null },
    });
    if (!auction) {
      return res.status(404).json({ error: 'not_found', message: 'Auction not found' });
    }

    const item = await prisma.watchlistItem.upsert({
      where:  { userId_auctionId: { userId: req.user!.sub, auctionId } },
      create: { userId: req.user!.sub, auctionId },
      update: {},
    });

    res.status(201).json({ success: true });
  } catch (err) { next(err); }
});

// ─── DELETE /watchlist/:id ────────────────────────────────────────────────────

watchlistRouter.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: auctionId } = UUIDParam.parse(req.params);

    await prisma.watchlistItem.deleteMany({
      where: { userId: req.user!.sub, auctionId },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});
