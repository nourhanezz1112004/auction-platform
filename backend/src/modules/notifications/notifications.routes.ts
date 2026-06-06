import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.middleware';
import { prisma } from '../../lib/prisma';

export const notificationsRouter = Router();

const PageSchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ─── GET /notifications ───────────────────────────────────────────────────────

notificationsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = PageSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where:   { userId: req.user!.sub },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId: req.user!.sub } }),
    ]);

    res.json({ notifications, total, page, limit });
  } catch (err) { next(err); }
});

// ─── GET /notifications/unread-count ─────────────────────────────────────────
// Declared BEFORE /:id/read so Express matches this first

notificationsRouter.get('/unread-count', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user!.sub, read: false },
    });
    res.json({ count });
  } catch (err) { next(err); }
});

// ─── PATCH /notifications/read-all ───────────────────────────────────────────

notificationsRouter.patch('/read-all', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.sub, read: false },
      data:  { read: true },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── PATCH /notifications/:id/read ───────────────────────────────────────────

notificationsRouter.patch('/:id/read', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Use updateMany so a missing/wrong-user notification returns count=0 instead of P2025 → 500
    const result = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.sub },
      data:  { read: true },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});
