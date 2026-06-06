// backend/src/jobs/auctionTimer.ts
// Bull queue for auction close scheduling.
// Replaces cron-based auctionStatus.job.ts with per-auction precision timers.

import Queue from 'bull';
import { prisma } from '../lib/prisma';
import { getIO } from '../utils/socket';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const auctionQueue = new Queue('auction-timer', REDIS_URL, {
  defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50 },
});

/**
 * Schedule an auction to close at a specific time.
 * Safe to call multiple times — Bull deduplicates by jobId.
 */
export async function scheduleAuctionClose(auctionId: string, endTime: Date): Promise<void> {
  const delay = Math.max(0, endTime.getTime() - Date.now());
  await auctionQueue.add(
    'close-auction',
    { auctionId },
    { delay, jobId: `close-${auctionId}`, removeOnComplete: true },
  );
}

auctionQueue.process('close-auction', async (job) => {
  const { auctionId } = job.data as { auctionId: string };

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
  });

  if (!auction || auction.status !== 'ACTIVE') return;

  const highestBid = auction.bids[0];
  const reserveMet = highestBid && highestBid.amount >= auction.reservePrice;

  await prisma.auction.update({
    where: { id: auctionId },
    data: {
      status: 'ENDED',
      winnerId: reserveMet ? highestBid!.userId : null,
    },
  });

  const io = getIO();
  if (io) {
    io.to(`auction:${auctionId}`).emit('auction:ended', {
      auctionId,
      winnerId: reserveMet ? highestBid!.userId : null,
      finalPrice: highestBid?.amount ?? auction.startingPrice,
      reserveMet,
    });
  }

  console.log(`[auctionTimer] Auction ${auctionId} closed. Winner: ${reserveMet ? highestBid!.userId : 'none'}`);
});
