import Bull from 'bull';
import { logger }   from '@auction/shared-utils';
import { QUEUES, EVENTS, AuctionEndedPayload } from '@auction/shared-events';
import { redis }    from '../utils/redis';
import { prisma }   from '../lib/prisma';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export function startAuctionStatusJob(): void {
  const auctionStatusQueue = new Bull(QUEUES.AUCTION_STATUS, REDIS_URL);

  // Register the processor FIRST, then schedule the repeatable job
  auctionStatusQueue.process('flip-ended', async () => {
    const now = new Date();

    await Promise.all([
      flipEndedAuctions(now),
      activateDraftAuctions(now),   // NEW — was missing
    ]);
  });

  // Remove any stale repeatable job from a previous run, then add the new one
  auctionStatusQueue
    .removeRepeatable('flip-ended', { every: 60_000 })
    .then(() =>
      auctionStatusQueue.add(
        'flip-ended',
        {},
        { repeat: { every: 60_000 }, jobId: 'flip-ended' },
      ),
    )
    .catch((err: Error) => logger.error({ err }, 'Failed to schedule auction status job'));

  auctionStatusQueue.on('failed', (job, err) => {
    logger.error({ jobId: job.id, err }, 'Auction status job failed');
  });

  logger.info({} as any, 'Auction status job started (every 60s)');
}

// ─── Flip ACTIVE → ENDED ──────────────────────────────────────────────────────

async function flipEndedAuctions(now: Date): Promise<void> {
  const ended = await prisma.auction.findMany({
    where:  { status: 'ACTIVE', endsAt: { lte: now }, deletedAt: null },
    select: { id: true, currentPrice: true, reservePrice: true, sellerId: true },
  });

  await Promise.all(ended.map(async (auction) => {
    try {
      // Wrap winner determination + update in a transaction to prevent race with last-second bids
      const { winnerId, finalPrice } = await prisma.$transaction(async (tx) => {
        const topBid = await tx.bid.findFirst({
          where:   { auctionId: auction.id },
          orderBy: { amount: 'desc' },
        });

        const winnerId = (topBid && topBid.amount >= auction.reservePrice)
          ? topBid.userId
          : null;

        const finalPrice = topBid ? topBid.amount : auction.currentPrice;

        await tx.auction.update({
          where: { id: auction.id },
          data:  { status: 'ENDED', winnerId, currentPrice: finalPrice },
        });

        return { winnerId, finalPrice };
      });

      const payload: AuctionEndedPayload = {
        auctionId:  auction.id,
        sellerId:   auction.sellerId,    // now included in payload
        winnerId,
        finalPrice,
      };

      await redis.publish(EVENTS.AUCTION_ENDED, JSON.stringify(payload));
      logger.info({ auctionId: auction.id, winnerId }, 'Auction flipped to ENDED');
    } catch (err) {
      logger.error({ err, auctionId: auction.id }, 'Failed to end auction');
    }
  }));
}

// ─── Flip DRAFT → ACTIVE ──────────────────────────────────────────────────────
// Handles auctions created with a future startsAt that has now passed.

async function activateDraftAuctions(now: Date): Promise<void> {
  const toActivate = await prisma.auction.findMany({
    where:  { status: 'DRAFT', startsAt: { lte: now }, deletedAt: null },
    select: { id: true },
  });

  if (toActivate.length === 0) return;

  await prisma.auction.updateMany({
    where: { id: { in: toActivate.map((a) => a.id) } },
    data:  { status: 'ACTIVE' },
  });

  logger.info({ count: toActivate.length }, 'Auctions activated (DRAFT → ACTIVE)');
}
