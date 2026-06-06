import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { prisma } from '../../lib/prisma';
import { redis } from '../../utils/redis';
import { CACHE_KEYS } from '@auction/shared-events';

export const adminRouter = Router();

const UUIDParam = z.object({ id: z.string().uuid() });
const FlagActionSchema = z.object({ action: z.enum(['allow', 'review', 'escalate']) });

const SearchQuerySchema = z.object({
  page:   z.string().regex(/^\d+$/).optional().default('1'),
  limit:  z.string().regex(/^\d+$/).optional().default('20'),
  search: z.string().optional().default(''),
});

const FraudFlagsQuerySchema = z.object({
  page:  z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('50'),
});

// ─── GET /admin/health ────────────────────────────────────────────────────────

adminRouter.get('/health', requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const AI_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';
    
    let postgresStatus = 'down';
    try {
      await prisma.$queryRaw`SELECT 1`;
      postgresStatus = 'up';
    } catch (e) {}

    let redisStatus = 'down';
    try {
      await redis.ping();
      redisStatus = 'up';
    } catch (e) {}

    let aiStatus = 'down';
    try {
      const resp = await fetch(`${AI_URL}/health`);
      if (resp.ok) aiStatus = 'up';
    } catch (e) {}

    res.json({
      postgres: postgresStatus,
      redis: redisStatus,
      aiService: aiStatus
    });
  } catch (err) { next(err); }
});

// ─── GET /admin/stats ─────────────────────────────────────────────────────────

adminRouter.get('/stats', requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      bidsToday, activeAuctions, fraudFlagged, botsBlocked,
      bidsGroupA, bidsGroupB, usersGroupA, usersGroupB,
    ] = await Promise.all([
      prisma.bid.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.auction.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.fraudFlag.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.botBlock.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.bid.count({ where: { createdAt: { gte: todayStart }, user: { abGroup: 'a' } } }),
      prisma.bid.count({ where: { createdAt: { gte: todayStart }, user: { abGroup: 'b' } } }),
      prisma.bid.findMany({ where: { createdAt: { gte: todayStart }, user: { abGroup: 'a' } }, select: { userId: true }, distinct: ['userId'] }),
      prisma.bid.findMany({ where: { createdAt: { gte: todayStart }, user: { abGroup: 'b' } }, select: { userId: true }, distinct: ['userId'] }),
    ]);

    const totalAttempts = bidsToday + botsBlocked + fraudFlagged;
    const pct = (n: number) => totalAttempts > 0 ? Number(((n / totalAttempts) * 100).toFixed(1)) : 0;

    const cleanBids  = Math.max(0, bidsToday - fraudFlagged);
    const activeUsersA = usersGroupA.length;
    const activeUsersB = usersGroupB.length;

    res.json({
      bidsToday, activeAuctions, fraudFlagged, botsBlocked,
      cleanPct:    pct(cleanBids),
      // Note: captchaPct tracks challenge-flagged bids, blockedPct tracks bot blocks
      captchaPct:  pct(fraudFlagged),
      blockedPct:  pct(botsBlocked),
      abGroupA: { bidsPerSession: activeUsersA > 0 ? Number((bidsGroupA / activeUsersA).toFixed(2)) : 0 },
      abGroupB: { bidsPerSession: activeUsersB > 0 ? Number((bidsGroupB / activeUsersB).toFixed(2)) : 0 },
    });
  } catch (err) { next(err); }
});

// ─── GET /admin/fraud-flags ───────────────────────────────────────────────────

adminRouter.get('/fraud-flags', requireAdmin, validate({ query: FraudFlagsQuerySchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pageNum = Number(req.query.page);
    const limitNum = Number(req.query.limit);
    const skip = (pageNum - 1) * limitNum;
    const [flags, total] = await Promise.all([
      prisma.fraudFlag.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        include: { bid: { select: { userId: true, amount: true, auctionId: true } } },
      }),
      prisma.fraudFlag.count(),
    ]);
    res.json({ flags, total, page: pageNum, limit: limitNum });
  } catch (err) { next(err); }
});

// ─── GET /admin/users ─────────────────────────────────────────────────────────

adminRouter.get('/users', requireAdmin, validate({ query: SearchQuerySchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, search } = req.query as any;
    const pageNum   = Number(page);
    const limitNum  = Number(limit);
    const skip      = (pageNum - 1) * limitNum;

    const where = search
      ? { OR: [{ email: { contains: search, mode: 'insensitive' as const } }, { name: { contains: search, mode: 'insensitive' as const } }], deletedAt: null }
      : { deletedAt: null };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, skip, take: limitNum, orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, name: true, phone: true, isAdmin: true, abGroup: true, createdAt: true, banned: true },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page: pageNum, limit: limitNum });
  } catch (err) { next(err); }
});

// ─── GET /admin/users/:id ─────────────────────────────────────────────────────

adminRouter.get('/users/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = UUIDParam.parse(req.params);
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, phone: true, isAdmin: true, abGroup: true, createdAt: true, banned: true, deletedAt: true },
    });
    if (!user) return res.status(404).json({ error: 'not_found', message: 'User not found' });

    const [bids, auctions] = await Promise.all([
      prisma.bid.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20, include: { auction: { select: { id: true, title: true } } } }),
      prisma.auction.findMany({ where: { sellerId: id, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

    res.json({ user, bids, auctions });
  } catch (err) { next(err); }
});

// ─── PATCH /admin/users/:id/ban ───────────────────────────────────────────────

adminRouter.patch('/users/:id/ban', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = UUIDParam.parse(req.params);
    const user = await prisma.user.update({
      where: { id },
      data:  { banned: true },
      select: { id: true, email: true, name: true, banned: true },
    });
    // Invalidate the banned user's session so the ban takes effect immediately
    await redis.del(CACHE_KEYS.session(id)).catch(() => {/* Redis unavailable — non-fatal */});
    res.json({ user });
  } catch (err) { next(err); }
});

// ─── PATCH /admin/users/:id/unban ─────────────────────────────────────────────

adminRouter.patch('/users/:id/unban', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = UUIDParam.parse(req.params);
    const user = await prisma.user.update({
      where: { id },
      data:  { banned: false },
      select: { id: true, email: true, name: true, banned: true },
    });
    res.json({ user });
  } catch (err) { next(err); }
});

// ─── PATCH /admin/fraud-flags/:id ────────────────────────────────────────────

adminRouter.patch('/fraud-flags/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id }     = UUIDParam.parse(req.params);
    const { action } = FlagActionSchema.parse(req.body);     // enforces enum values
    const flag = await prisma.fraudFlag.update({
      where: { id },
      data:  { status: action },
    });
    res.json({ flag });
  } catch (err) { next(err); }
});

// ─── GET /admin/activity ──────────────────────────────────────────────────────

adminRouter.get('/activity', requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [recentBids, recentFlags, recentAuctions] = await Promise.all([
      prisma.bid.findMany({
        orderBy: { createdAt: 'desc' }, take: 10,
        include: { user: { select: { id: true, name: true } }, auction: { select: { id: true, title: true } } },
      }),
      prisma.fraudFlag.findMany({
        orderBy: { createdAt: 'desc' }, take: 5,
        include: { bid: { select: { userId: true } } },
      }),
      prisma.auction.findMany({
        where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 5,
        select: { id: true, title: true, status: true, createdAt: true },
      }),
    ]);

    const activity = [
      ...recentBids.map((b: any) => ({ type: 'bid',     id: b.id, message: `${b.user?.name ?? 'Unknown'} bid $${b.amount} on "${b.auction?.title}"`, createdAt: b.createdAt })),
      ...recentFlags.map((f: any) => ({ type: 'fraud',  id: f.id, message: `Fraud flag: score ${(f.score * 100).toFixed(0)}% — ${f.reason}`, createdAt: f.createdAt })),
      ...recentAuctions.map((a: any) => ({ type: 'auction', id: a.id, message: `Auction "${a.title}" is ${a.status}`, createdAt: a.createdAt })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);

    res.json({ activity });
  } catch (err) { next(err); }
});
