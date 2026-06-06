import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.middleware';
import { prisma } from '../../lib/prisma';
import { CreateReviewSchema } from '@auction/shared-types';

export const reviewsRouter = Router();

// ─── POST /reviews ────────────────────────────────────────────────────────────

reviewsRouter.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { auctionId, rating, comment } = CreateReviewSchema.parse(req.body);
    const userId = req.user!.sub;

    // 1. Check auction exists and has ended
    const auction = await prisma.auction.findFirst({
      where:  { id: auctionId, deletedAt: null },
      select: { status: true, sellerId: true },
    });

    if (!auction) {
      return res.status(404).json({ error: 'not_found', message: 'Auction not found' });
    }
    if (auction.status !== 'ENDED') {
      return res.status(400).json({ error: 'bad_request', message: 'You can only review ended auctions' });
    }

    // 2. Verify reviewer participated (placed at least one bid)
    const participated = await prisma.bid.findFirst({ where: { auctionId, userId } });
    if (!participated) {
      return res.status(403).json({ error: 'forbidden', message: 'You can only review auctions you participated in' });
    }

    // 3. Create review — @@unique([userId, auctionId]) in schema prevents duplicates
    let review;
    try {
      review = await prisma.review.create({
        data: { auctionId, userId, rating, comment },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'conflict', message: 'You have already reviewed this auction' });
      }
      throw err;
    }

    // 4. Recalculate and persist seller's average rating across all of their auctions
    const sellerAuctions = await prisma.auction.findMany({
      where: { sellerId: auction.sellerId, deletedAt: null },
      select: { id: true }
    });
    const auctionIds = sellerAuctions.map(a => a.id);

    const { _avg } = await prisma.review.aggregate({
      where: { auctionId: { in: auctionIds } },
      _avg:  { rating: true },
    });

    await prisma.user.update({
      where: { id: auction.sellerId },
      data:  { rating: _avg.rating ?? 0 },
    });

    res.status(201).json({ review });
  } catch (err) { next(err); }
});

// ─── GET /reviews/auction/:id ─────────────────────────────────────────────────

reviewsRouter.get('/auction/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reviews = await prisma.review.findMany({
      where:   { auctionId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    });
    res.json({ reviews });
  } catch (err) { next(err); }
});
