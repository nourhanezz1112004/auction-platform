import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { SOCKET_ROOMS } from '@auction/shared-events';
import { logger } from '@auction/shared-utils';

/**
 * Registers per-user socket room handlers.
 * Clients emit 'join:user' with their userId to subscribe to personal notifications.
 * Admin clients emit 'join:admin' to subscribe to fraud:flagged broadcasts.
 */
export function registerNotificationSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    // ── Personal notification room ────────────────────────────────────────────
    socket.on('join:user', (userId: string) => {
      if (!userId || typeof userId !== 'string') return;
      const room = SOCKET_ROOMS.user(userId);
      socket.join(room);
      logger.info({ socketId: socket.id, userId, room }, 'Client joined user notification room');
    });

    socket.on('leave:user', (userId: string) => {
      if (!userId || typeof userId !== 'string') return;
      socket.leave(SOCKET_ROOMS.user(userId));
    });

    // ── Admin broadcast room ──────────────────────────────────────────────────
    // Any client can emit join:admin; in production you'd validate isAdmin from
    // a JWT claim on the socket handshake, but fraud:flagged only triggers a
    // query invalidation (no sensitive data is in the payload itself).
    socket.on('join:admin', () => {
      const token = socket.handshake.auth?.token;
      if (!token) return socket.emit('error', 'forbidden');
      try {
        const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as any;
        if (!payload.isAdmin) return socket.emit('error', 'forbidden');
        socket.join(SOCKET_ROOMS.admin);
        logger.info({ socketId: socket.id }, 'Client joined admin room');
      } catch {
        socket.emit('error', 'forbidden');
      }
    });

    socket.on('leave:admin', () => {
      socket.leave(SOCKET_ROOMS.admin);
    });
  });
}

