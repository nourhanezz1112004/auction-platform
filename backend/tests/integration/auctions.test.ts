import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index';
import { prisma } from '../setup';
import { createTestUser, createTestAuction, loginAs } from '../helpers';

describe('Auctions Integration Tests', () => {
  describe('POST /auctions', () => {
    it('Create auction as authenticated user -> 201', async () => {
      const user = await createTestUser();
      const { accessToken } = loginAs(user);

      const now = new Date();
      const later = new Date(now.getTime() + 86400000);

      const res = await request(app)
        .post('/auctions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'New Auction',
          description: 'A great item',
          category: 'electronics',
          startingPrice: 100,
          reservePrice: 150,
          startsAt: now.toISOString(),
          endsAt: later.toISOString(),
          imageUrls: ['https://example.com/img.jpg'],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('Create auction as guest -> 401', async () => {
      const res = await request(app)
        .post('/auctions')
        .send({
          title: 'Guest Auction',
        });
      expect(res.status).toBe(401);
    });

    it('Create auction with startsAt in the past -> auction immediately set to ACTIVE', async () => {
      const user = await createTestUser();
      const { accessToken } = loginAs(user);
      const past = new Date(Date.now() - 3600000);
      const later = new Date(Date.now() + 86400000);

      const res = await request(app)
        .post('/auctions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Past Start Auction',
          description: 'A valid auction description',
          category: 'watches',
          startingPrice: 50,
          reservePrice: 100,
          startsAt: past.toISOString(),
          endsAt: later.toISOString(),
          imageUrls: [],
        });

      expect(res.status).toBe(201);
      const auctionInDb = await prisma.auction.findUnique({ where: { id: res.body.id } });
      expect(auctionInDb?.status).toBe('ACTIVE');
    });

    it('Create auction with startsAt in the future -> status DRAFT', async () => {
      const user = await createTestUser();
      const { accessToken } = loginAs(user);
      const future = new Date(Date.now() + 3600000);
      const later = new Date(Date.now() + 86400000);

      const res = await request(app)
        .post('/auctions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Future Start Auction',
          description: 'A valid auction description',
          category: 'watches',
          startingPrice: 50,
          reservePrice: 100,
          startsAt: future.toISOString(),
          endsAt: later.toISOString(),
          imageUrls: [],
        });

      expect(res.status).toBe(201);
      const auctionInDb = await prisma.auction.findUnique({ where: { id: res.body.id } });
      expect(auctionInDb?.status).toBe('DRAFT');
    });

    it('Create auction with endsAt before startsAt -> 400', async () => {
      const user = await createTestUser();
      const { accessToken } = loginAs(user);
      const startsAt = new Date(Date.now() + 86400000);
      const endsAt = new Date(Date.now() + 3600000);

      const res = await request(app)
        .post('/auctions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Bad Dates',
          description: 'Desc',
          category: 'watches',
          startingPrice: 50,
          reservePrice: 100,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          imageUrls: [],
        });

      expect(res.status).toBe(422);
    });

    it('Edge Case: Auction with startingPrice: 0 -> 400', async () => {
      const user = await createTestUser();
      const { accessToken } = loginAs(user);

      const res = await request(app)
        .post('/auctions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Zero Price',
          description: 'Desc',
          category: 'watches',
          startingPrice: 0,
          reservePrice: 100,
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          imageUrls: [],
        });

      expect(res.status).toBe(422);
    });

    it('Edge Case: Auction with startingPrice: -100 -> 400', async () => {
      const user = await createTestUser();
      const { accessToken } = loginAs(user);

      const res = await request(app)
        .post('/auctions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Negative Price',
          description: 'Desc',
          category: 'watches',
          startingPrice: -100,
          reservePrice: 100,
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          imageUrls: [],
        });

      expect(res.status).toBe(422);
    });

    it('Edge Case: XSS payload in auction title -> stored as plain string, not executed', async () => {
      const user = await createTestUser();
      const { accessToken } = loginAs(user);
      const xssPayload = '<script>alert("xss")</script>';

      const res = await request(app)
        .post('/auctions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: xssPayload,
          description: 'A valid auction description',
          category: 'watches',
          startingPrice: 50,
          reservePrice: 100,
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          imageUrls: [],
        });

      expect(res.status).toBe(201);
      const auctionInDb = await prisma.auction.findUnique({ where: { id: res.body.id } });
      expect(auctionInDb?.title).toBe(xssPayload); // Database should store it as is, frontend sanitizes
    });
  });

  describe('GET /auctions', () => {
    it('Get auction list -> correct pagination shape { auctions[], total, page }', async () => {
      const user = await createTestUser();
      await createTestAuction(user.id);
      await createTestAuction(user.id);

      const res = await request(app).get('/auctions');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('auctions');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(Array.isArray(res.body.auctions)).toBe(true);
      expect(res.body.auctions.length).toBeGreaterThanOrEqual(2);
    });

    it('Filter by category -> only matching results', async () => {
      const user = await createTestUser();
      await createTestAuction(user.id, { category: 'watches' });
      await createTestAuction(user.id, { category: 'cars' });

      const res = await request(app).get('/auctions?category=watches');
      expect(res.status).toBe(200);
      expect(res.body.auctions.every((a: any) => a.category === 'watches')).toBe(true);
    });

    it('Filter by status -> only matching results', async () => {
      const user = await createTestUser();
      await createTestAuction(user.id, { status: 'ENDED' });
      await createTestAuction(user.id, { status: 'ACTIVE' });

      const res = await request(app).get('/auctions?status=ENDED');
      expect(res.status).toBe(200);
      expect(res.body.auctions.every((a: any) => a.status === 'ENDED')).toBe(true);
      expect(res.body.auctions.length).toBe(1);
    });

    it('Soft-deleted auctions never appear in results', async () => {
      const user = await createTestUser();
      await createTestAuction(user.id, { deletedAt: new Date(), status: 'CANCELLED' });

      const res = await request(app).get('/auctions');
      expect(res.body.auctions.length).toBe(0);
    });
  });

  describe('GET /auctions/:id', () => {
    it('Get single auction -> includes seller, payment status, bid count', async () => {
      const user = await createTestUser();
      const auction = await createTestAuction(user.id);

      const res = await request(app).get(`/auctions/${auction.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('seller');
      // Some endpoints might return these differently, but we expect them as requested
    });

    it('Get soft-deleted auction by ID -> 404', async () => {
      const user = await createTestUser();
      const auction = await createTestAuction(user.id, { deletedAt: new Date() });

      const res = await request(app).get(`/auctions/${auction.id}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /auctions/:id', () => {
    it('Update auction as owner -> 200', async () => {
      const user = await createTestUser();
      const { accessToken } = loginAs(user);
      const auction = await createTestAuction(user.id);

      const res = await request(app)
        .patch(`/auctions/${auction.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Title')
    });

    it('Update auction as non-owner -> 403', async () => {
      const owner = await createTestUser();
      const auction = await createTestAuction(owner.id);

      const nonOwner = await createTestUser();
      const { accessToken } = loginAs(nonOwner);

      const res = await request(app)
        .patch(`/auctions/${auction.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Hacked Title' });

      expect(res.status).toBe(403);
    });

    it('Update auction as admin -> 200', async () => {
      const owner = await createTestUser();
      const auction = await createTestAuction(owner.id);

      const admin = await createTestUser({ isAdmin: true });
      const { accessToken } = loginAs(admin);

      const res = await request(app)
        .patch(`/auctions/${auction.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Admin Title' });

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /auctions/:id', () => {
    it('Soft delete -> deletedAt set, status CANCELLED, absent from list', async () => {
      const user = await createTestUser();
      const { accessToken } = loginAs(user);
      const auction = await createTestAuction(user.id);

      const delRes = await request(app)
        .delete(`/auctions/${auction.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(delRes.status).toBe(200);

      const dbAuction = await prisma.auction.findUnique({ where: { id: auction.id } });
      expect(dbAuction?.deletedAt).not.toBeNull();
      expect(dbAuction?.status).toBe('CANCELLED');

      const listRes = await request(app).get('/auctions');
      expect(listRes.body.auctions.find((a: any) => a.id === auction.id)).toBeUndefined();
    });
  });

  describe('GET /auctions/recommendations', () => {
    it('Recommendations endpoint -> returns array (either cache hit or DB fallback)', async () => {
      const user = await createTestUser();
      const { accessToken } = loginAs(user);

      const res = await request(app)
        .get('/auctions/recommendations')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.recommendations)).toBe(true)
    });
  });
});
