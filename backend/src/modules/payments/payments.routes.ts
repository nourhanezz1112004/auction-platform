import { Router, Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.middleware';
import { NotFoundError } from '../../middlewares/error.middleware';
import { redis } from '../../utils/redis';
import { EVENTS } from '@auction/shared-events';
import { prisma } from '../../lib/prisma';

// ─── Initialisation ───────────────────────────────────────────────────────────

if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== 'test') {
  throw new Error('STRIPE_SECRET_KEY is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
  apiVersion: '2024-04-10',
});

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

const CheckoutBodySchema = z.object({ auctionId: z.string().uuid() });

export const paymentsRouter = Router();

// ─── POST /payments/checkout ──────────────────────────────────────────────────

paymentsRouter.post(
  '/checkout',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { auctionId } = CheckoutBodySchema.parse(req.body);

      const auction = await prisma.auction.findUnique({ where: { id: auctionId } });

      if (!auction || auction.deletedAt !== null) {
        next(new NotFoundError('Auction not found')); return;
      }

      if (auction.status !== 'ENDED') {
        res.status(400).json({ error: 'bad_request', message: 'Auction has not ended yet' }); return;
      }

      if (auction.winnerId !== req.user!.sub) {
        res.status(403).json({ error: 'forbidden', message: 'You are not the winner of this auction' }); return;
      }

      // Guard: do not overwrite a SUCCEEDED payment
      const existing = await prisma.payment.findUnique({ where: { auctionId } });
      if (existing?.status === 'SUCCEEDED') {
        res.status(409).json({ error: 'already_paid', message: 'This auction has already been paid for' }); return;
      }

      await prisma.payment.upsert({
        where:  { auctionId },
        create: { auctionId, buyerId: req.user!.sub, amount: auction.currentPrice, status: 'PENDING' },
        update: { buyerId: req.user!.sub, amount: auction.currentPrice },
      });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          quantity:   1,
          price_data: {
            currency:     'usd',
            unit_amount:  Math.round(auction.currentPrice * 100),
            product_data: { name: auction.title, description: auction.description },
          },
        }],
        metadata:    { auctionId, buyerId: req.user!.sub },
        success_url: `${FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${FRONTEND_URL}/payment/cancel/${auctionId}`,
      });

      await prisma.payment.update({ where: { auctionId }, data: { stripeSessionId: session.id } });

      res.status(200).json({ stripeSessionUrl: session.url });
    } catch (err) { next(err); }
  },
);

// ─── POST /payments/verify ────────────────────────────────────────────────────
// Verification fallback for when webhooks are delayed or not configured (local dev)

const VerifyBodySchema = z.object({ sessionId: z.string() });

paymentsRouter.post(
  '/verify',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = VerifyBodySchema.parse(req.body);

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (session.payment_status === 'paid') {
        const updated = await prisma.payment.updateMany({
          where: { stripeSessionId: sessionId, status: { not: 'SUCCEEDED' } },
          data:  { status: 'SUCCEEDED' },
        });

        // Publish event if not already done
        if (updated.count > 0) {
          await redis.publish(
            EVENTS.PAYMENT_SUCCEEDED,
            JSON.stringify({
              stripeSessionId: session.id,
              auctionId:       session.metadata?.auctionId,
              buyerId:         session.metadata?.buyerId,
              amount:          (session.amount_total ?? 0) / 100,
            }),
          );
        }

        res.json({ success: true, status: 'SUCCEEDED' });
      } else {
        res.json({ success: false, status: session.payment_status });
      }
    } catch (err) { next(err); }
  }
);

// ─── POST /payments/webhook ───────────────────────────────────────────────────

paymentsRouter.post(
  '/webhook',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sig = req.headers['stripe-signature'] as string;

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body as Buffer,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET!,
        );
      } catch {
        res.status(400).json({ error: 'Webhook signature verification failed' }); return;
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;

        // Idempotency guard — only update PENDING records; skip already-SUCCEEDED ones
        const updated = await prisma.payment.updateMany({
          where: { stripeSessionId: session.id, status: { not: 'SUCCEEDED' } },
          data:  { status: 'SUCCEEDED' },
        });

        // Only publish if we actually changed something (prevents duplicate notifications)
        if (updated.count > 0) {
          await redis.publish(
            EVENTS.PAYMENT_SUCCEEDED,
            JSON.stringify({
              stripeSessionId: session.id,
              auctionId:       session.metadata?.auctionId,
              buyerId:         session.metadata?.buyerId,
              // Divide by 100: Stripe amount_total is in cents; our amounts are in dollars
              amount:          (session.amount_total ?? 0) / 100,
            }),
          );
        }
      }

      if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session;
        await prisma.payment.updateMany({
          where: { stripeSessionId: session.id, status: 'PENDING' },
          data:  { status: 'FAILED' },
        });
      }

      res.status(200).json({ received: true });
    } catch (err) { next(err); }
  },
);
