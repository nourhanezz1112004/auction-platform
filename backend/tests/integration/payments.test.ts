import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index';
import { prisma, redis } from '../setup';
import { createTestUser, createTestAuction, loginAs } from '../helpers';

const mockStripe = (globalThis as any).mockStripe;

describe('Payments Integration Tests', () => {
  describe('POST /payments/checkout', () => {
    it('Non-winner calls POST /payments/checkout -> 403', async () => {
      const seller = await createTestUser();
      const nonWinner = await createTestUser();
      const { accessToken } = loginAs(nonWinner);
      
      const auction = await createTestAuction(seller.id, {
        status: 'ENDED',
        winnerId: seller.id, // Winner is someone else
      });

      const res = await request(app)
        .post('/payments/checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ auctionId: auction.id });

      expect(res.status).toBe(403);
    });

    it('Winner calls POST /payments/checkout -> returns { stripeSessionUrl }', async () => {
      const seller = await createTestUser();
      const winner = await createTestUser();
      const { accessToken } = loginAs(winner);
      
      const auction = await createTestAuction(seller.id, {
        status: 'ENDED',
        winnerId: winner.id,
        currentPrice: 150,
      });

      // Reset Stripe mock and configure success response
      mockStripe.checkout.sessions.create.mockResolvedValueOnce({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test-session-url',
      });

      const res = await request(app)
        .post('/payments/checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ auctionId: auction.id });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('stripeSessionUrl', 'https://checkout.stripe.com/test-session-url');
    });

    it('Calling checkout twice for same auction -> idempotent (same session or 409)', async () => {
      const seller = await createTestUser();
      const winner = await createTestUser();
      const { accessToken } = loginAs(winner);
      
      const auction = await createTestAuction(seller.id, {
        status: 'ENDED',
        winnerId: winner.id,
        currentPrice: 150,
      });

      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test-session-url',
      });

      const res1 = await request(app)
        .post('/payments/checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ auctionId: auction.id });

      const res2 = await request(app)
        .post('/payments/checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ auctionId: auction.id });

      expect([200, 409]).toContain(res2.status);
    });
  });

  describe('POST /payments/webhook', () => {
    it('Stripe webhook with valid signature -> payment status updated to SUCCEEDED', async () => {
      const seller = await createTestUser();
      const winner = await createTestUser();
      const auction = await createTestAuction(seller.id);

      const payment = await prisma.payment.create({
        data: {
          auctionId: auction.id,
          buyerId: winner.id,
          amount: 150,
          status: 'PENDING',
          stripeSessionId: 'cs_test_valid',
        },
      });

      // Configure valid webhook signature mock
      mockStripe.webhooks.constructEvent.mockReturnValueOnce({
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_valid', metadata: { auctionId: auction.id, buyerId: winner.id }, amount_total: 15000 } },
      });

      const res = await request(app)
        .post('/payments/webhook')
        .set('stripe-signature', 'valid-signature')
        .send({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_valid' } } });

      expect(res.status).toBe(200);

      const updatedPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(updatedPayment?.status).toBe('SUCCEEDED');
    });

    it('Stripe webhook with invalid signature -> 400', async () => {
      mockStripe.webhooks.constructEvent.mockImplementationOnce(() => {
        throw new Error('Invalid signature');
      });

      const res = await request(app)
        .post('/payments/webhook')
        .set('stripe-signature', 'invalid-signature')
        .send({ type: 'some-event' });

      expect(res.status).toBe(400);
    });

    it('Stripe webhook for unknown session -> handled gracefully, no 500', async () => {
      mockStripe.webhooks.constructEvent.mockReturnValueOnce({
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_unknown', metadata: { auctionId: 'some-id' } } },
      });

      const res = await request(app)
        .post('/payments/webhook')
        .set('stripe-signature', 'valid-signature')
        .send({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_unknown' } } });

      expect(res.status).toBe(200);
    });
  });
});
