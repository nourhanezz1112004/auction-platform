import axios from 'axios';

import { callWithFallback, logger }    from '@auction/shared-utils';
import { AI_FALLBACKS, AI_THRESHOLDS, AntiBotResponse, FraudResponse } from '@auction/shared-types';
import { EVENTS, BidPlacedPayload, BidFlaggedPayload } from '@auction/shared-events';

import { ForbiddenError, PaymentRequiredError, ConflictError, GoneError, NotFoundError } from '../../middlewares/error.middleware';
import { redis } from '../../utils/redis';
import { prisma } from '../../lib/prisma';

const AI_URL      = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';
const AI_TIMEOUT  = Number(process.env.AI_TIMEOUT_MS ?? 400);   // was hardcoded 400

// ─── Place Bid ────────────────────────────────────────────────────────────────

export async function placeBid(params: {
  userId:              string;
  auctionId:           string;
  amount:              number;
  ipAddress:           string;
  ipCountry?:          string;
  sessionDurationSecs: number;
  timeToBidMs:         number;
  correlationId:       string;
}) {
  const { userId, auctionId, amount, correlationId } = params;

  // 1. Load auction (fail fast before AI calls)
  const auction = await prisma.auction.findFirstOrThrow({
    where: { id: auctionId, deletedAt: null },
  });

  if (auction.status !== 'ACTIVE') {
    throw new GoneError('auction_ended', 'This auction has ended');
  }

  if (new Date() > auction.endsAt) {
    throw new GoneError('auction_ended', 'This auction has ended');
  }

  // 2. Load user
  const user = await prisma.user.findFirstOrThrow({
    where: { id: userId, deletedAt: null },
  });

  if (user.banned) {
    throw new ForbiddenError('account_banned', 'Your account has been banned from bidding.');
  }

  const accountAgeDays = Math.floor(
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // 3. Compute bids-in-last-minute SERVER-SIDE (not from forged header)
  const bidsInLastMinute = await prisma.bid.count({
    where: { userId, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });

  // 4. Anti-bot check (wrapped in callWithFallback — never blocks on AI failure)
  const antiBotResult = await callWithFallback(
    () => axios.post<AntiBotResponse>(`${AI_URL}/ai/anti-bot`, {
      user_id:                  userId,
      auction_id:               auctionId,
      bid_amount:               amount,
      ip_address:               params.ipAddress,
      session_duration_seconds: Math.floor(params.sessionDurationSecs),
      bids_in_last_minute:      bidsInLastMinute,
      time_to_bid_ms:           Math.floor(params.timeToBidMs),
    }, { headers: { 'x-correlation-id': correlationId } }).then(r => r.data),
    AI_FALLBACKS.antiBot,
    'anti-bot',
    AI_TIMEOUT,
  );

  logger.info({ correlationId, antiBotResult }, 'Anti-bot result');
  handleAntiBotResult(antiBotResult, userId, auctionId);

  // 5. Fraud check
  const totalBidsHistory = await prisma.bid.count({ where: { userId } });
  const bid1hCount       = await prisma.bid.count({
    where: { userId, createdAt: { gte: new Date(Date.now() - 3600000) } },
  });

  const fraudResult = await callWithFallback(
    () => axios.post<FraudResponse>(`${AI_URL}/ai/fraud`, {
      user_id:            userId,
      auction_id:         auctionId,
      bid_amount:         amount,
      account_age_days:   accountAgeDays,
      total_bids_history: totalBidsHistory,
      ip_country:         params.ipCountry ?? 'EG',
      bid_velocity_1h:    bid1hCount,
    }, { headers: { 'x-correlation-id': correlationId } }).then(r => r.data),
    AI_FALLBACKS.fraud,
    'fraud',
    AI_TIMEOUT,
  );

  logger.info({ correlationId, fraudResult }, 'Fraud result');

  // Early BLOCK-level fraud rejection — before any DB write
  if (fraudResult.score > AI_THRESHOLDS.BLOCK) {
    throw new PaymentRequiredError('fraud_flagged', 'Bid rejected — fraud detected', { 
      score: fraudResult.score, 
      signals: fraudResult.signals 
    });
  }

  // 6. Atomic transaction — update price, create bid record, and apply snipe extension
  const result = await prisma.$transaction(async (tx) => {
    const currentAuction = await tx.auction.findUnique({
      where:  { id: auctionId },
      select: { version: true, currentPrice: true, sellerId: true, endsAt: true, deletedAt: true },
    });

    if (!currentAuction) throw new NotFoundError('Auction not found');
    if (currentAuction.sellerId === userId) {
      throw new ForbiddenError('self_bidding', 'You cannot bid on your own auction');
    }

    // Optimistic concurrency — atomic raw SQL
    const raw = await tx.$executeRaw`
      UPDATE "Auction"
      SET    "currentPrice" = ${amount},
             "version"      = "version" + 1
      WHERE  "id"           = ${auctionId}
      AND    "version"      = ${currentAuction.version}
      AND    (
               ("version" = 0 AND "currentPrice" <= ${amount})
               OR
               ("version" > 0 AND "currentPrice" < ${amount})
             )
    `;

    if (Number(raw) === 0) {
      throw new ConflictError('outbid', 'You have been outbid', { currentPrice: currentAuction.currentPrice });
    }

    const bid = await tx.bid.create({
      data: { userId, auctionId, amount },
    });

    let timeExtended = false;
    const timeLeft = currentAuction.endsAt.getTime() - Date.now();
    if (timeLeft < 60_000 && currentAuction.deletedAt === null) {
      const newEndsAt = new Date(currentAuction.endsAt.getTime() + 2 * 60_000);
      await tx.auction.update({
        where: { id: auctionId },
        data:  { endsAt: newEndsAt }
      });
      timeExtended = true;
    }

    return { bid, timeExtended };
  });

  const { bid, timeExtended } = result;

  // 7. CHALLENGE-level fraud flagging — wrapped, never propagates
  try {
    await flagFraudIfNeeded(fraudResult, bid.id, auctionId, userId, correlationId);
  } catch (flagErr) {
    logger.error({ flagErr, bidId: bid.id }, 'Failed to write FraudFlag — bid is still valid');
  }

  // 9. Publish Redis event
  const bidPayload: BidPlacedPayload = {
    bidId: bid.id, auctionId, userId, amount, abGroup: user.abGroup as 'a' | 'b', timeExtended,
  };
  await redis.publish(EVENTS.BID_PLACED, JSON.stringify(bidPayload));

  return { bid, newHighestBid: amount, timeExtended };
}

// ─── Confidence Handlers ──────────────────────────────────────────────────────

function handleAntiBotResult(
  result:    AntiBotResponse,
  userId:    string,
  auctionId: string,
): void {
  if (result.confidence > AI_THRESHOLDS.BLOCK) {
    // Fire-and-forget DB write for admin stats
    prisma.botBlock.create({
      data: { userId, auctionId, confidence: result.confidence, reason: result.reason ?? 'bot_detected' },
    }).catch((err) => logger.error({ err, userId, auctionId }, 'Failed to write BotBlock record'));

    throw new ForbiddenError('bot_detected', 'Bid rejected — bot activity detected', {
      confidence: result.confidence
    });
  }

  if (result.confidence > AI_THRESHOLDS.CHALLENGE) {
    // CAPTCHA tier (0.4–0.7): tell the frontend to show a CAPTCHA challenge
    throw new ForbiddenError('captcha_required', 'Please complete the CAPTCHA challenge before bidding');
  }
  // < 0.4: clean — proceed
}

async function flagFraudIfNeeded(
  result:        FraudResponse,
  bidId:         string,
  auctionId:     string,
  userId:        string,
  correlationId: string,
): Promise<void> {
  if (result.score > AI_THRESHOLDS.CHALLENGE) {
    await prisma.fraudFlag.create({
      data: {
        bidId,
        score:   result.score,
        signals: result.signals,
        reason:  result.signals.join(', ') || 'anomalous_bid',
      },
    });

    const payload: BidFlaggedPayload = { bidId, auctionId, userId, score: result.score, signals: result.signals };
    await redis.publish(EVENTS.BID_FLAGGED, JSON.stringify(payload));
  }
}
