import { Server } from 'socket.io';

// ─── Socket.io singleton ──────────────────────────────────────────────────────
// Extracted from index.ts to break the circular dependency:
//   index.ts → bidsRouter → bids.controller → index.ts (circular)
//
// Call setIO(server) once in index.ts after creating the SocketIOServer.
// All other modules import getIO() from here.

let _io: Server;

export function setIO(server: Server): void {
  _io = server;
}

export function getIO(): Server {
  if (!_io) throw new Error('Socket.io server not initialised — call setIO() first');
  return _io;
}
