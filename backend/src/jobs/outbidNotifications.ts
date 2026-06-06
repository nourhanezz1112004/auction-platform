// backend/src/jobs/outbidNotifications.ts
// Bull queue for outbid notifications.

import Queue from 'bull';
import { prisma } from '../lib/prisma';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const outbidQueue = new Queue('outbid-notifications', REDIS_URL, {
  defaultJobOptions: { removeOnComplete: 50, removeOnFail: 100, attempts: 3 },
});

outbidQueue.process('send-outbid', async (job) => {
  const { userId, auctionId, newAmount, auctionTitle } = job.data as {
    userId: string;
    auctionId: string;
    newAmount: number;
    auctionTitle: string;
  };

  await prisma.notification.create({
    data: {
      userId,
      auctionId,
      title: 'You have been outbid!',
      message: `Someone bid $${newAmount.toFixed(2)} on "${auctionTitle}". Bid higher to stay in the lead.`,
      type: 'outbid',
    },
  });
});
