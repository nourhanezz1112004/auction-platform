import { Server, Socket } from 'socket.io';
import { SOCKET_ROOMS, SOCKET_EVENTS } from '@auction/shared-events';
import { logger } from '@auction/shared-utils';

/**
 * Called once in index.ts after Socket.io server is created.
 * Handles room join/leave for the live bidding feature.
 */
export function registerBidSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'Client connected');

    // Client joins an auction room when they open the detail page
    socket.on('join:auction', (input: any) => {
      const id = typeof input === 'string' ? input : input?.auctionId;
      if (!id) return;
      const room = SOCKET_ROOMS.auction(id);
      socket.join(room);
      logger.info({ socketId: socket.id, auctionId: id, room }, 'Client joined auction room');
    });

    socket.on('leave:auction', (input: any) => {
      const id = typeof input === 'string' ? input : input?.auctionId;
      if (!id) return;
      socket.leave(SOCKET_ROOMS.auction(id));
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Client disconnected');
    });
  });
}
