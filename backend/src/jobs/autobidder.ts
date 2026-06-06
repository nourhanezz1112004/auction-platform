// backend/src/jobs/autobidder.ts
// Autobidder Bull queue — processes automatic bid placements.

import Queue from 'bull';
import type { Server as IOServer } from 'socket.io';
import { prisma } from '../lib/prisma';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const autobidQueue = new Queue('autobidder', REDIS_URL, {
  defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50, attempts: 2 },
});

let _io: IOServer | null = null;

export function setIo(io: IOServer): void {
  _io = io;
}

/**
 * Restore active autobids after server restart.
 * Called from startup.ts initJobs().
 */
export async function restoreAutobids(io: IOServer): Promise<void> {
  setIo(io);
  const active = await prisma.autobidRegistration.findMany({
    where: { isActive: true },
    include: { auction: { select: { status: true } } },
  });

  const validAutobids = active.filter(a => a.auction.status === 'ACTIVE');
  console.log(`[autobidder] Restored ${validAutobids.length} active autobids`);
}

autobidQueue.process('trigger-autobid', async (job) => {
  const { auctionId, triggeredByUserId, currentPrice } = job.data as {
    auctionId: string;
    triggeredByUserId: string;
    currentPrice: number;
  };

  const registrations = await prisma.autobidRegistration.findMany({
    where: {
      auctionId,
      isActive: true,
      userId: { not: triggeredByUserId },
      maxBudget: { gt: currentPrice },
    },
  });

  for (const reg of registrations) {
    const minIncrement = Math.max(currentPrice * 0.01, 5);
    const autobidAmount = Math.min(currentPrice + minIncrement, reg.maxBudget);

    if (autobidAmount >= reg.maxBudget) continue;

    await prisma.bid.create({
      data: {
        userId: reg.userId,
        auctionId,
        amount: autobidAmount,
        isAutobid: true,
      },
    });

    await prisma.auction.update({
      where: { id: auctionId },
      data: { currentPrice: autobidAmount },
    });

    await prisma.autobidRegistration.update({
      where: { id: reg.id },
      data: { totalBidsPlaced: { increment: 1 } },
    });

    if (_io) {
      _io.to(`auction:${auctionId}`).emit('bid:new', {
        auctionId,
        amount: autobidAmount,
        userId: reg.userId,
        isAutobid: true,
      });
    }
  }
});
