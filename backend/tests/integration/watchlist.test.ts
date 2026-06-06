import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index';
import { prisma } from '../setup';
import { createTestUser, createTestAuction, loginAs } from '../helpers';

describe('Watchlist Integration Tests', () => {
  describe('POST /watchlist/:id', () => {
    it('POST /watchlist/:id -> item added', async () => {
      const seller = await createTestUser();
      const user = await createTestUser();
      const auction = await createTestAuction(seller.id);

      const res = await request(app)
        .post(`/watchlist/${auction.id}`)
        .set('Authorization', `Bearer ${loginAs(user).accessToken}`);
      
      expect(res.status).toBe(201); // Or 200 depending on the impl
      
      const inDb = await prisma.watchlistItem.findUnique({
        where: { userId_auctionId: { userId: user.id, auctionId: auction.id } },
      });
      expect(inDb).not.toBeNull();
    });

    it('POST /watchlist/:id again (duplicate) -> upsert, no 500', async () => {
      const seller = await createTestUser();
      const user = await createTestUser();
      const auction = await createTestAuction(seller.id);

      await request(app)
        .post(`/watchlist/${auction.id}`)
        .set('Authorization', `Bearer ${loginAs(user).accessToken}`);
      
      const res2 = await request(app)
        .post(`/watchlist/${auction.id}`)
        .set('Authorization', `Bearer ${loginAs(user).accessToken}`);
      
      expect([200, 201]).toContain(res2.status);
    });
  });

  describe('GET /watchlist', () => {
    it('GET /watchlist -> includes added auction', async () => {
      const seller = await createTestUser();
      const user = await createTestUser();
      const auction = await createTestAuction(seller.id);

      await prisma.watchlistItem.create({
        data: { userId: user.id, auctionId: auction.id },
      });

      const res = await request(app)
        .get('/watchlist')
        .set('Authorization', `Bearer ${loginAs(user).accessToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.watchlist.length).toBe(1);
      expect(res.body.watchlist[0].auction.id).toBe(auction.id);
    });

    it('Soft-deleted auction not in watchlist results', async () => {
      const seller = await createTestUser();
      const user = await createTestUser();
      const auction = await createTestAuction(seller.id, { deletedAt: new Date(), status: 'CANCELLED' });

      await prisma.watchlistItem.create({
        data: { userId: user.id, auctionId: auction.id },
      });

      const res = await request(app)
        .get('/watchlist')
        .set('Authorization', `Bearer ${loginAs(user).accessToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.watchlist.length).toBe(0);
    });
  });

  describe('DELETE /watchlist/:id', () => {
    it('DELETE /watchlist/:id -> removed', async () => {
      const seller = await createTestUser();
      const user = await createTestUser();
      const auction = await createTestAuction(seller.id);

      await prisma.watchlistItem.create({
        data: { userId: user.id, auctionId: auction.id },
      });

      const delRes = await request(app)
        .delete(`/watchlist/${auction.id}`)
        .set('Authorization', `Bearer ${loginAs(user).accessToken}`);
      
      expect(delRes.status).toBe(200);

      const res = await request(app)
        .get('/watchlist')
        .set('Authorization', `Bearer ${loginAs(user).accessToken}`);
      
      expect(res.body.watchlist.length).toBe(0);
    });
  });
});
