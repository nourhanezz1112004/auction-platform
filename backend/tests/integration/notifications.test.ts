import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index';
import { prisma } from '../setup';
import { createTestUser, loginAs, createTestAuction } from '../helpers';

describe('Notifications Integration Tests', () => {
  describe('GET /notifications', () => {
    it('GET /notifications -> returns current user\'s notifications only', async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      await prisma.notification.create({
        data: { userId: user1.id, title: 'Test 1', message: 'Msg 1' },
      });
      await prisma.notification.create({
        data: { userId: user2.id, title: 'Test 2', message: 'Msg 2' },
      });

      const res = await request(app)
        .get('/notifications')
        .set('Authorization', `Bearer ${loginAs(user1).accessToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.notifications.length).toBe(1);
      expect(res.body.notifications[0].title).toBe('Test 1');
    });

    it('Notifications from other users not returned', async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      await prisma.notification.create({
        data: { userId: user2.id, title: 'Test 2', message: 'Msg 2' },
      });

      const res = await request(app)
        .get('/notifications')
        .set('Authorization', `Bearer ${loginAs(user1).accessToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.notifications.length).toBe(0);
    });
  });

  describe('GET /notifications/unread-count', () => {
    it('GET /notifications/unread-count -> correct count', async () => {
      const user = await createTestUser();

      await prisma.notification.create({
        data: { userId: user.id, title: 'Unread', message: 'Msg 1', read: false },
      });
      await prisma.notification.create({
        data: { userId: user.id, title: 'Read', message: 'Msg 2', read: true },
      });

      const res = await request(app)
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${loginAs(user).accessToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
    });
  });

  describe('PATCH /notifications/read-all', () => {
    it('PATCH /notifications/read-all -> all marked read, unread count = 0', async () => {
      const user = await createTestUser();

      await prisma.notification.create({
        data: { userId: user.id, title: 'Unread 1', message: 'Msg 1', read: false },
      });
      await prisma.notification.create({
        data: { userId: user.id, title: 'Unread 2', message: 'Msg 2', read: false },
      });

      const res = await request(app)
        .patch('/notifications/read-all')
        .set('Authorization', `Bearer ${loginAs(user).accessToken}`);
      
      expect(res.status).toBe(200);

      const countRes = await request(app)
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${loginAs(user).accessToken}`);
      
      expect(countRes.body.count).toBe(0);
    });
  });

  describe('PATCH /notifications/:id/read', () => {
    it('PATCH /notifications/:id/read -> single notification marked read', async () => {
      const user = await createTestUser();

      const notif = await prisma.notification.create({
        data: { userId: user.id, title: 'Unread', message: 'Msg 1', read: false },
      });

      const res = await request(app)
        .patch(`/notifications/${notif.id}/read`)
        .set('Authorization', `Bearer ${loginAs(user).accessToken}`);
      
      expect(res.status).toBe(200);

      const countRes = await request(app)
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${loginAs(user).accessToken}`);
      
      expect(countRes.body.count).toBe(0);
    });
  });
});
