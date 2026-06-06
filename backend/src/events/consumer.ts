import sgMail from '@sendgrid/mail';
import { logger } from '@auction/shared-utils';
import {
  EVENTS, SOCKET_EVENTS, SOCKET_ROOMS,
  BidPlacedPayload, BidFlaggedPayload, AuctionEndedPayload,
  AuctionCreatedPayload, PaymentSucceededPayload, UserRegisteredPayload,
  AuctionExtendedSocketPayload,
} from '@auction/shared-events';
import { getIO } from '../utils/socket';
import { prisma } from '../lib/prisma';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
// Subscriber needs its own connection — a subscribed client cannot issue other commands
const subscriber = new Redis(REDIS_URL);

subscriber.on('error',       (err) => logger.error({ err }, 'Redis subscriber error'));
subscriber.on('reconnecting', ()   => logger.warn('Redis subscriber reconnecting...'));
subscriber.on('connect',      ()   => logger.info('Redis subscriber connected'));

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? 'noreply@auction-platform.com';

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  logger.warn({} as any, 'SENDGRID_API_KEY not set — all emails will be skipped');
}

function canEmail(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function onBidPlaced(payload: BidPlacedPayload): Promise<void> {
  try {
    const io   = getIO();
    const room = SOCKET_ROOMS.auction(payload.auctionId);

    // Broadcast to everyone in the auction room
    io.to(room).emit(SOCKET_EVENTS.BID_NEW, {
      bid: { id: payload.bidId, amount: payload.amount, bidderId: payload.userId, timestamp: new Date().toISOString() },
      newHighestBid: payload.amount,
      timeExtended:  payload.timeExtended,
    });

    if (payload.timeExtended) {
      const auction = await prisma.auction.findUnique({
        where: { id: payload.auctionId },
        select: { endsAt: true }
      });
      if (auction) {
        const extendedPayload: AuctionExtendedSocketPayload = {
          auctionId: payload.auctionId,
          newEndsAt: auction.endsAt.toISOString(),
        };
        io.to(room).emit(SOCKET_EVENTS.AUCTION_EXTENDED, extendedPayload);
      }
    }

    // Find the previous top bidder so we can notify them they've been outbid
    const previousTop = await prisma.bid.findFirst({
      where:   { auctionId: payload.auctionId, userId: { not: payload.userId } },
      orderBy: { amount: 'desc' },
      select:  { userId: true, user: { select: { email: true, name: true } } },
    });

    if (previousTop?.user) {
      // In-app notification
      try {
        await prisma.notification.create({
          data: {
            userId:    previousTop.userId,
            auctionId: payload.auctionId,
            title:     'You have been outbid',
            message:   `Someone placed a higher bid of $${payload.amount.toLocaleString()}`,
            type:      'outbid',
          },
        });
      } catch (err) {
        logger.error({ err, payload }, 'Failed to create outbid notification');
      }

      // Email
      if (canEmail()) {
        sgMail.send({
          to:      previousTop.user.email,
          from:    FROM_EMAIL,
          subject: 'You have been outbid!',
          text: `Hi ${previousTop.user.name},\n\nYou have been outbid. The current price is $${payload.amount.toLocaleString()}.\n\nBid now to win!`,
        }).catch((err) => logger.error({ err }, 'Failed to send outbid email'));
      }
    }
  } catch (err) {
    logger.error({ err, payload }, 'onBidPlaced failed');
  }
}

async function onAuctionEnded(payload: AuctionEndedPayload): Promise<void> {
  try {
    const io   = getIO();
    const room = SOCKET_ROOMS.auction(payload.auctionId);

    io.to(room).emit(SOCKET_EVENTS.AUCTION_ENDED, {
      auctionId:  payload.auctionId,
      winnerId:   payload.winnerId,
      finalPrice: payload.finalPrice,
    });

    // Notify winner
    if (payload.winnerId) {
      const winner = await prisma.user.findUnique({
        where:  { id: payload.winnerId },
        select: { email: true, name: true },
      });

      if (winner) {
        try {
          await prisma.notification.create({
            data: {
              userId:    payload.winnerId,
              auctionId: payload.auctionId,
              title:     'You won the auction!',
              message:   `Congratulations! You won the auction for $${payload.finalPrice.toLocaleString()}.`,
              type:      'won',
            },
          });
        } catch (err) {
          logger.error({ err, winnerId: payload.winnerId }, 'Failed to create winner notification');
        }

        if (canEmail()) {
          sgMail.send({
            to:      winner.email,
            from:    FROM_EMAIL,
            subject: 'You won the auction!',
            text: `Hi ${winner.name},\n\nCongratulations! You won the auction for $${payload.finalPrice.toLocaleString()}. Click here to complete your purchase.`,
          }).catch((err) => logger.error({ err }, 'Failed to send winner email'));
        }
      }
    }

    // Notify seller — sellerId is now in the payload (no extra DB query needed)
    const seller = await prisma.user.findUnique({
      where:  { id: payload.sellerId },
      select: { email: true, name: true },
    });

    if (seller) {
      try {
        await prisma.notification.create({
          data: {
            userId:    payload.sellerId,
            auctionId: payload.auctionId,
            title:     payload.winnerId ? 'Your auction sold!' : 'Your auction ended without a winner',
            message:   payload.winnerId
              ? `Your auction sold for $${payload.finalPrice.toLocaleString()}.`
              : 'Your auction ended but did not meet the reserve price.',
            type:      'sold',
          },
        });
      } catch (err) {
        logger.error({ err, sellerId: payload.sellerId }, 'Failed to create seller notification');
      }

      if (canEmail()) {
        sgMail.send({
          to:      seller.email,
          from:    FROM_EMAIL,
          subject: payload.winnerId ? 'Your auction sold!' : 'Your auction ended',
          text: payload.winnerId
            ? `Hi ${seller.name},\n\nYour auction sold for $${payload.finalPrice.toLocaleString()}.`
            : `Hi ${seller.name},\n\nYour auction ended but did not meet the reserve price.`,
        }).catch((err) => logger.error({ err }, 'Failed to send seller email'));
      }
    }
  } catch (err) {
    logger.error({ err, payload }, 'onAuctionEnded failed');
  }
}

async function onBidFlagged(payload: BidFlaggedPayload): Promise<void> {
  // Admin is notified via the fraud-flags table. We log here for observability.
  logger.warn({ payload }, 'Bid flagged for fraud — visible in /admin/fraud-flags');
}

async function onAuctionCreated(payload: AuctionCreatedPayload): Promise<void> {
  // Phase 2: trigger AI embedding pipeline here
  logger.info({ auctionId: payload.auctionId }, 'Auction created — embedding skipped (Phase 2)');
}

async function onUserRegistered(payload: UserRegisteredPayload): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: payload.userId },
      select: { name: true, email: true },
    });
    if (!user || !canEmail()) return;

    await sgMail.send({
      to:      user.email,
      from:    FROM_EMAIL,
      subject: 'Welcome to Auction Platform!',
      text:    `Hi ${user.name},\n\nWelcome to Auction Platform! Your account has been created. Start bidding today!`,
      html:    `<p>Hi <strong>${user.name}</strong>,</p><p>Welcome to <strong>Auction Platform</strong>! Your account has been created. Start bidding today!</p>`,
    });
  } catch (err) {
    logger.error({ err, payload }, 'Failed to send welcome email');
  }
}

async function onPaymentSucceeded(payload: PaymentSucceededPayload): Promise<void> {
  try {
    const buyer = await prisma.user.findUnique({
      where:  { id: payload.buyerId },
      select: { email: true, name: true },
    });
    if (!buyer) return;

    try {
      await prisma.notification.create({
        data: {
          userId:    payload.buyerId,
          auctionId: payload.auctionId,
          title:     'Payment successful',
          message:   `Your payment of $${payload.amount.toLocaleString()} was successful. The item will be delivered shortly.`,
          type:      'info',
        },
      });
    } catch (err) {
      logger.error({ err, payload }, 'Failed to create payment notification');
    }

    if (canEmail()) {
      await sgMail.send({
        to:      buyer.email,
        from:    FROM_EMAIL,
        subject: 'Payment confirmation',
        text: `Hi ${buyer.name},\n\nYour payment of $${payload.amount.toLocaleString()} was successful. Thank you for your purchase!`,
      });
    }
  } catch (err) {
    logger.error({ err, payload }, 'Failed to process payment succeeded event');
  }
}

// ─── Consumer ─────────────────────────────────────────────────────────────────

export function startConsumer(): void {
  const channels = [
    EVENTS.BID_PLACED,
    EVENTS.AUCTION_ENDED,
    EVENTS.BID_FLAGGED,
    EVENTS.AUCTION_CREATED,
    EVENTS.USER_REGISTERED,     // was missing
    EVENTS.PAYMENT_SUCCEEDED,   // was missing
  ];

  subscriber.subscribe(...channels).then(() => {
    logger.info({ channels }, 'Redis subscriber started');
  }).catch((err: Error) => {
    logger.error({ err }, 'Failed to subscribe to Redis channels');
  });

  subscriber.on('message', async (channel: string, message: string) => {
    let payload: any;
    try {
      payload = JSON.parse(message);
    } catch {
      logger.warn({ channel, message }, 'Failed to parse Redis message');
      return;
    }

    try {
      switch (channel) {
        case EVENTS.BID_PLACED:        await onBidPlaced(payload);        break;
        case EVENTS.AUCTION_ENDED:     await onAuctionEnded(payload);     break;
        case EVENTS.BID_FLAGGED:       await onBidFlagged(payload);       break;
        case EVENTS.AUCTION_CREATED:   await onAuctionCreated(payload);   break;
        case EVENTS.USER_REGISTERED:   await onUserRegistered(payload);   break;
        case EVENTS.PAYMENT_SUCCEEDED: await onPaymentSucceeded(payload); break;
      }
    } catch (err) {
      logger.error({ err, channel, payload }, 'Failed to process event on channel');
    }
  });
}
