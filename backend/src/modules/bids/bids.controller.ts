import { Request, Response, NextFunction } from 'express';
import { placeBid } from './bids.service';
import { prisma } from '../../lib/prisma';

export async function place(req: Request, res: Response, next: NextFunction) {
  try {
    const { auctionId, amount } = req.body;
    const userId = req.user!.sub;

    const result = await placeBid({
      userId,
      auctionId,
      amount,
      ipAddress:           req.ip ?? '0.0.0.0',
      ipCountry:           (req.headers['cf-ipcountry'] as string) ?? 'EG',
      // sessionDurationSecs and timeToBidMs are client-supplied hints only —
      // bidsInLastMinute is now computed server-side inside bids.service.ts
      sessionDurationSecs: Number(req.headers['x-session-duration'] ?? 60),
      timeToBidMs:         Number(req.headers['x-time-to-bid'] ?? 5000),
      correlationId:       req.correlationId ?? '',
    });

    res.status(201).json({ bid: result.bid, newHighestBid: result.newHighestBid });
  } catch (err) { next(err); }
}

export async function myBids(req: Request, res: Response, next: NextFunction) {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip  = (page - 1) * limit;
    const auctionId = req.query.auctionId as string | undefined;

    const whereClause = {
      userId: req.user!.sub,
      auction: { deletedAt: null },
      ...(auctionId ? { auctionId } : {})
    };

    const [bids, total] = await Promise.all([
      prisma.bid.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take:    limit,
        include: { auction: { select: { title: true, status: true, currentPrice: true, winnerId: true, payment: { select: { status: true } } } } },
      }),
      prisma.bid.count({
        where: whereClause,
      }),
    ]);

    res.json({ bids, total, page, limit });
  } catch (err) { next(err); }
}
