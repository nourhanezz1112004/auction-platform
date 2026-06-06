import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index';
import { prisma } from '../setup';
import { createTestUser, createTestAuction, loginAs } from '../helpers';

describe('Reviews Integration Tests', () => {
  describe('POST /reviews', () => {
    it('POST /reviews from user who bid on auction -> 201', async () => {
      const seller = await createTestUser();
      const bidder = await createTestUser();
      const auction = await createTestAuction(seller.id, { status: 'ENDED' });

      await prisma.bid.create({
        data: { userId: bidder.id, auctionId: auction.id, amount: 150 },
      });

      const res = await request(app)
        .post('/reviews')
        .set('Authorization', `Bearer ${loginAs(bidder).accessToken}`)
        .send({ auctionId: auction.id, rating: 5, comment: 'Great!' });

      expect(res.status).toBe(201);
    });

    it('POST /reviews from user who never bid -> 403', async () => {
      const seller = await createTestUser();
      const nonBidder = await createTestUser();
      const auction = await createTestAuction(seller.id, { status: 'ENDED' });

      const res = await request(app)
        .post('/reviews')
        .set('Authorization', `Bearer ${loginAs(nonBidder).accessToken}`)
        .send({ auctionId: auction.id, rating: 5, comment: 'Great!' });

      expect(res.status).toBe(403);
    });

    it('POST /reviews twice on same auction by same user -> 409 (unique constraint)', async () => {
      const seller = await createTestUser();
      const bidder = await createTestUser();
      const auction = await createTestAuction(seller.id, { status: 'ENDED' });

      await prisma.bid.create({
        data: { userId: bidder.id, auctionId: auction.id, amount: 150 },
      });

      await request(app)
        .post('/reviews')
        .set('Authorization', `Bearer ${loginAs(bidder).accessToken}`)
        .send({ auctionId: auction.id, rating: 5, comment: 'Great!' });

      const res2 = await request(app)
        .post('/reviews')
        .set('Authorization', `Bearer ${loginAs(bidder).accessToken}`)
        .send({ auctionId: auction.id, rating: 4, comment: 'Okay' });

      expect(res2.status).toBe(409);
    });

    it('Rating outside 1–5 -> 422', async () => {
      const seller = await createTestUser();
      const bidder = await createTestUser();
      const auction = await createTestAuction(seller.id, { status: 'ENDED' });

      await prisma.bid.create({
        data: { userId: bidder.id, auctionId: auction.id, amount: 150 },
      });

      const res1 = await request(app)
        .post('/reviews')
        .set('Authorization', `Bearer ${loginAs(bidder).accessToken}`)
        .send({ auctionId: auction.id, rating: 6, comment: 'Great!' });

      const res2 = await request(app)
        .post('/reviews')
        .set('Authorization', `Bearer ${loginAs(bidder).accessToken}`)
        .send({ auctionId: auction.id, rating: 0, comment: 'Great!' });

      expect(res1.status).toBe(422);
      expect(res2.status).toBe(422);
    });
  });
});
