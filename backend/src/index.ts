import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import * as Sentry from '@sentry/node';

import { logger } from '@auction/shared-utils';

// ─── Startup env validation ───────────────────────────────────────────────────
function requireEnv(name: string): void {
  if (!process.env[name] && process.env.NODE_ENV === 'production') {
    throw new Error(`Required environment variable ${name} is not set`);
  }
}
requireEnv('JWT_ACCESS_SECRET');
requireEnv('JWT_REFRESH_SECRET');
requireEnv('STRIPE_SECRET_KEY');
requireEnv('STRIPE_WEBHOOK_SECRET');
requireEnv('DATABASE_URL');
requireEnv('REDIS_URL');

// ─── Base Route modules ───────────────────────────────────────────────────────
import { authRouter }           from './modules/auth/auth.routes';
import { usersRouter }          from './modules/users/users.routes';
import { auctionsRouter }       from './modules/auctions/auctions.routes';
import { bidsRouter }           from './modules/bids/bids.routes';
import { paymentsRouter }       from './modules/payments/payments.routes';
import { searchRouter }         from './modules/search/search.routes';
import { mediaRouter }          from './modules/media/media.routes';
import { watchlistRouter }      from './modules/watchlist/watchlist.routes';
import { reviewsRouter }        from './modules/reviews/reviews.routes';
import { adminRouter }          from './modules/admin/admin.routes';
import { notificationsRouter }  from './modules/notifications/notifications.routes';
import { auctionsAiRouter }     from './modules/auctions/auctions.ai.routes';

// ─── Enhanced Route modules ───────────────────────────────────────────────────
import listingsRouter           from './routes/listings';
import notificationsEnhancedRouter from './routes/notifications.enhanced';
import bidsEnhancedRouter from './routes/bids.enhanced';

// ─── Enhanced middleware ──────────────────────────────────────────────────────
import { auditContextMiddleware }                from './middleware/auditContext';
import { globalRateLimiter, authRateLimiter,
         bidRateLimiter }                        from './middleware/rateLimiter';
import { csrfInit, csrfProtect }                 from './middleware/csrf';

// ─── Base middleware + startup ────────────────────────────────────────────────
import { errorMiddleware }           from './middlewares/error.middleware';
import { correlationIdMiddleware }   from './middlewares/correlationId.middleware';
import { requireAuth, requireAdmin } from './middlewares/auth.middleware';
import { startConsumer }             from './events/consumer';
import { startAuctionStatusJob }     from './jobs/auctionStatus.job';
import { registerBidSocketHandlers } from './modules/bids/bids.socket';
import { setIO }                     from './utils/socket';

// ─── Enhanced jobs startup ────────────────────────────────────────────────────
import { initJobs }                  from './jobs/startup';

// ─── Enhanced socket handlers ─────────────────────────────────────────────────
import { registerAuctionRoomHandlers } from './sockets/auctionRoom';

// ─── Enhanced services (fire-and-forget side effects) ────────────────────────
import { prisma }                    from './lib/prisma';

const PORT         = Number(process.env.PORT ?? 3000);
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const REDIS_URL    = process.env.REDIS_URL ?? 'redis://localhost:6379';

const allowedOrigins = FRONTEND_URL.includes(',')
  ? FRONTEND_URL.split(',').map(url => url.trim())
  : FRONTEND_URL;

// ─── Sentry ───────────────────────────────────────────────────────────────────
const sentryEnabled = Boolean(process.env.SENTRY_DSN?.length);
if (sentryEnabled) {
  Sentry.init({ dsn: process.env.SENTRY_DSN });
}

// ─── App ──────────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// ─── Socket.io with Redis adapter ────────────────────────────────────────────
const ioServer = new SocketIOServer(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

const socketPubClient = new Redis(REDIS_URL);
const socketSubClient = socketPubClient.duplicate();

socketPubClient.on('error', (err) => logger.error({ err }, 'Socket.IO adapter pub-client error'));
socketSubClient.on('error', (err) => logger.error({ err }, 'Socket.IO adapter sub-client error'));
socketPubClient.on('connect', () => logger.info('Socket.IO adapter pub-client connected'));
socketSubClient.on('connect', () => logger.info('Socket.IO adapter sub-client connected'));

ioServer.adapter(createAdapter(socketPubClient, socketSubClient));
setIO(ioServer);

// ── Socket.io JWT middleware ───────────────────────────────────────────────────
ioServer.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!);
      (socket as any).userId = (payload as any).userId;
    } catch { /* unauthenticated socket — allowed for read-only room joins */ }
  }
  next();
});

// ── Enhanced socket handlers ──────────────────────────────────────────────────
ioServer.on('connection', (socket) => {
  registerAuctionRoomHandlers(ioServer, socket);
});

// ─── Global Middleware ────────────────────────────────────────────────────────
if (sentryEnabled) Sentry.setupExpressErrorHandler(app);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", `https://${process.env.S3_BUCKET ?? ''}.s3.amazonaws.com`, process.env.CDN_URL ?? ''],
      connectSrc: ["'self'", ...(Array.isArray(allowedOrigins) ? allowedOrigins : [allowedOrigins])],
    },
  },
}));

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(correlationIdMiddleware);
app.use(cookieParser());

// ─── Enhanced: Global rate limiter ───────────────────────────────────────────
app.use(globalRateLimiter);

// ─── Enhanced: CSRF token init ────────────────────────────────────────────────
app.use(csrfInit);

app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// Raw body for Stripe webhooks MUST come before express.json()
app.use('/payments/webhook', express.raw({ type: 'application/json' }));
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Auth Routes (with rate limiting, no CSRF) ────────────────────────────────
app.use('/auth',     authRateLimiter, authRouter);
app.use('/api/auth', authRateLimiter, authRouter);

// ─── Enhanced: Audit context (AFTER auth middleware) ─────────────────────────
app.use(auditContextMiddleware);

// ─── Enhanced: CSRF protection for all state-changing routes ─────────────────
// Disabled in development for ease of testing
if (process.env.NODE_ENV === 'production') {
  app.use('/api', csrfProtect);
}

// ─── Base Routes ──────────────────────────────────────────────────────────────
app.use('/users',          usersRouter);
app.use('/auctions',       auctionsRouter);
app.use('/bids',           bidRateLimiter, bidsRouter);
app.use('/payments',       paymentsRouter);
app.use('/search',         searchRouter);
app.use('/media',          mediaRouter);
app.use('/watchlist',      watchlistRouter);
app.use('/reviews',        reviewsRouter);
app.use('/admin',          adminRouter);
app.use('/notifications',  notificationsRouter);
app.use('/auctions/ai',     auctionsAiRouter);  // AI auction routes (legacy)
app.use('/api/auctions/ai',  auctionsAiRouter);  // AI auction routes (api prefix)

// ─── Enhanced Routes (also under /api prefix for new frontend) ────────────────
app.use('/api/users',          usersRouter);
app.use('/api/auctions',       auctionsRouter);
app.use('/api/bids',           bidRateLimiter, bidsRouter);
app.use('/api/payments',       paymentsRouter);
app.use('/api/search',         searchRouter);
app.use('/api/media',          mediaRouter);
app.use('/api/watchlist',      watchlistRouter);
app.use('/api/reviews',        reviewsRouter);
app.use('/api/admin',          adminRouter);
app.use('/api/listings',       listingsRouter);
app.use('/api/notifications',  notificationsEnhancedRouter);
app.use('/api/bids',           bidRateLimiter, bidsEnhancedRouter);

// ─── Support Ticket Routes (enhanced) ────────────────────────────────────────
app.patch('/api/support/tickets/:id/resolve', requireAuth, requireAdmin, async (req, res) => {
  const { resolution } = req.body;
  await prisma.supportTicket.update({
    where: { id: req.params.id },
    data: {
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedById: (req as any).user?.id,
      escalationReason: resolution,
    },
  });
  res.json({ success: true });
});

app.get('/api/support/tickets', requireAuth, requireAdmin, async (req, res) => {
  const { status = 'open' } = req.query;
  const tickets = await prisma.supportTicket.findMany({
    where: { status: status as string },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(tickets);
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'db_unavailable' });
  }
});

// ─── Error Handling ───────────────────────────────────────────────────────────
// errorMiddleware handles AppError subclasses + logs correlation ID
// The second handler catches anything that slips through (e.g. third-party middleware errors)
app.use(errorMiddleware);

// ─── Last-resort error handler (catches non-AppError throws from middleware) ──
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return; // errorMiddleware already responded
  const status = err.status ?? err.statusCode ?? 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error'
    : err.message ?? 'Unknown error';
  logger.error({ err }, 'Last-resort error handler');
  res.status(status).json({ error: message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, async () => {
    logger.info(`Backend running on port ${PORT}`);
    registerBidSocketHandlers(ioServer);
    startConsumer();
    startAuctionStatusJob();

    // Enhanced: init all Bull queue jobs
    initJobs(ioServer).catch(err => logger.error({ err }, '[startup] Job init failed'));
  }).on('error', (err) => {
    logger.error({ err }, 'Server failed to start');
    process.exit(1);
  });
}

export { app, server };
