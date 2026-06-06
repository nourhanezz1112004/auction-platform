// backend/src/routes/notifications.ts
// FCM token registration endpoint + notification list for the bell icon.
// Pairs with pushNotifications.ts service.

import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { registerFcmToken, unregisterFcmToken } from "../services/pushNotifications";
import { z } from "zod";
import { validateBody } from "../schemas";

const router = Router();

const RegisterTokenSchema = z.object({
  token:    z.string().min(10),
  platform: z.enum(["ios", "android", "web"]),
});

// POST /api/notifications/register-token
// Call this on app launch / after login
router.post("/register-token", requireAuth, validateBody(RegisterTokenSchema), async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  await registerFcmToken(userId, req.body.token, req.body.platform);
  return res.json({ success: true });
});

// DELETE /api/notifications/unregister-token
// Call on logout
router.delete("/unregister-token", requireAuth, async (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  if (token) await unregisterFcmToken(token);
  return res.json({ success: true });
});

// GET /api/notifications — in-app notification bell
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { cursor, limit = "20" } = req.query as { cursor?: string; limit?: string };

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(parseInt(limit), 50) + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true, type: true, title: true, message: true,
      createdAt: true, readAt: true, metadata: true,
    },
  });

  const hasMore = notifications.length > parseInt(limit);
  const items   = hasMore ? notifications.slice(0, -1) : notifications;
  const unread  = await prisma.notification.count({ where: { userId, readAt: null } });

  return res.json({
    notifications: items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
    unreadCount: unread,
  });
});

// PATCH /api/notifications/read-all
router.patch("/read-all", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return res.json({ success: true });
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId },
    data: { readAt: new Date() },
  });
  return res.json({ success: true });
});

export default router;
