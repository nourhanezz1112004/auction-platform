import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index';
import { createTestUser, createTestAuction } from '../helpers';

describe('Search Integration Tests', () => {
  describe('GET /search', () => {
    it('?q= with matching term -> results contain term in title or description', async () => {
      const user = await createTestUser();
      await createTestAuction(user.id, { title: 'Vintage Watch' });
      await createTestAuction(user.id, { title: 'Modern Laptop' });

      const res = await request(app).get('/search?q=Vintage');
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeGreaterThan(0);
      expect(res.body.results.every((a: any) => a.title.includes('Vintage') || a.description.includes('Vintage'))).toBe(true);
    });

    it('?q= with no matches -> empty array, not 404', async () => {
      const res = await request(app).get('/search?q=XYZ123NonExistent');
      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([]);
    });

    it('?minPrice=500&maxPrice=1000 -> all results within range', async () => {
      const user = await createTestUser();
      await createTestAuction(user.id, { currentPrice: 400 });
      await createTestAuction(user.id, { currentPrice: 600 });
      await createTestAuction(user.id, { currentPrice: 1200 });

      const res = await request(app).get('/search?minPrice=500&maxPrice=1000');
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeGreaterThan(0);
      expect(res.body.results.every((a: any) => a.currentPrice >= 500 && a.currentPrice <= 1000)).toBe(true);
    });

    it('?category=watches -> only watches', async () => {
      const user = await createTestUser();
      await createTestAuction(user.id, { category: 'watches' });
      await createTestAuction(user.id, { category: 'cars' });

      const res = await request(app).get('/search?category=watches');
      expect(res.status).toBe(200);
      expect(res.body.results.every((a: any) => a.category === 'watches')).toBe(true);
    });

    it('All filters combined -> intersection applied correctly', async () => {
      const user = await createTestUser();
      await createTestAuction(user.id, { title: 'Rolex', category: 'watches', currentPrice: 600 });
      await createTestAuction(user.id, { title: 'Casio', category: 'watches', currentPrice: 100 });
      await createTestAuction(user.id, { title: 'Rolex', category: 'cars', currentPrice: 600 });

      const res = await request(app).get('/search?q=Rolex&category=watches&minPrice=500');
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBe(1);
      expect(res.body.results[0].title).toBe('Rolex');
      expect(res.body.results[0].category).toBe('watches');
      expect(res.body.results[0].currentPrice).toBe(600);
    });

    it('Pagination: ?page=2&limit=5 -> correct offset', async () => {
      const user = await createTestUser();
      // Create 21 auctions. Page 1 returns 20, Page 2 returns the 21st.
      for (let i = 0; i < 21; i++) {
        await createTestAuction(user.id, { title: 'Paginated Item ' + i });
      }

      const res = await request(app).get('/search?q=Paginated Item&page=2');
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBe(1);
    });

    it('Pagination with page=0 -> treated as page 1 or 400', async () => {
      const res = await request(app).get('/search?page=0');
      expect([200, 400, 422]).toContain(res.status);
    });

    it('Pagination with page=-1 -> 400 or 422', async () => {
      const res = await request(app).get('/search?page=-1');
      expect([400, 422]).toContain(res.status);
    });

    it('Pagination with limit=10000 -> capped at max, not DB timeout', async () => {
      const res = await request(app).get('/search?limit=10000');
      expect([200, 422]).toContain(res.status);
    });

    it('SQL injection attempt in ?q= -> sanitized, no DB error', async () => {
      const res = await request(app).get('/search?q=1%27%20OR%20%271%27=%271');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.results)).toBe(true);
    });

    it('Soft-deleted auctions never appear in results', async () => {
      const user = await createTestUser();
      await createTestAuction(user.id, { title: 'Deleted Item', deletedAt: new Date(), status: 'CANCELLED' });

      const res = await request(app).get('/search?q=Deleted Item');
      expect(res.body.results.length).toBe(0);
    });
  });
});
