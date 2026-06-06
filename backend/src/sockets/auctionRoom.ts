// backend/src/sockets/auctionRoom.ts
// WebSocket auction room with Redis state persistence.
// On reconnect, the client immediately gets the current auction state from Redis
// without waiting for the next bid event.

import { Server, Socket } from "socket.io";
import { createClient } from "redis";
import { prisma } from "../lib/prisma";
import { auditAuction } from "../services/auditLogger";

const redis = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
redis.connect().catch(console.error);

const ROOM_TTL = 60 * 60 * 24; // 24h — keep state for a day after auction ends

// ── Redis key helpers ─────────────────────────────────────────────────────────
const roomKey   = (id: string) => `auction:${id}:room`;
const watchKey  = (id: string) => `auction:${id}:watchers`;

interface RoomState {
  auctionId:       string;
  title:           string;
  currentPrice:    number;
  highestBidderId: string | null;
  endsAt:          string;
  status:          string;
  bidCount:        number;
  lastBidAt:       string | null;
}

// ── Persist room state to Redis ───────────────────────────────────────────────
export async function setRoomState(auctionId: string, state: RoomState): Promise<void> {
  await redis.setEx(roomKey(auctionId), ROOM_TTL, JSON.stringify(state));
}

// ── Read room state (from Redis first, DB fallback) ───────────────────────────
export async function getRoomState(auctionId: string): Promise<RoomState | null> {
  const cached = await redis.get(roomKey(auctionId));
  if (cached) return JSON.parse(cached) as RoomState;

  // Cache miss — hydrate from DB and cache
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      _count: { select: { bids: true } },
      bids: { orderBy: { createdAt: "desc" }, take: 1, select: { userId: true, createdAt: true } },
    },
  });
  if (!auction) return null;

  const state: RoomState = {
    auctionId,
    title:           auction.title,
    currentPrice:    auction.currentPrice,
    highestBidderId: auction.bids[0]?.userId ?? null,
    endsAt:          auction.endsAt.toISOString(),
    status:          auction.status,
    bidCount:        auction._count.bids,
    lastBidAt:       auction.bids[0]?.createdAt.toISOString() ?? null,
  };

  await setRoomState(auctionId, state);
  return state;
}

// ── Socket.io room handler ────────────────────────────────────────────────────
export function registerAuctionRoomHandlers(io: Server, socket: Socket): void {
  const userId: string = (socket as any).userId; // set by your auth middleware

  // ── join ──────────────────────────────────────────────────────────────────
  socket.on("auction:join", async ({ auctionId }: { auctionId: string }) => {
    await socket.join(auctionId);

    // Track watcher count
    await redis.sAdd(watchKey(auctionId), socket.id);
    const watcherCount = await redis.sCard(watchKey(auctionId));
    io.to(auctionId).emit("auction:watchers", { count: watcherCount });

    // Send full state immediately on join/rejoin — no waiting for next bid
    const state = await getRoomState(auctionId);
    if (state) {
      socket.emit("auction:state", state);
    } else {
      socket.emit("auction:error", { message: "Auction not found" });
    }
  });

  // ── leave / disconnect ────────────────────────────────────────────────────
  const handleLeave = async (auctionId?: string) => {
    const rooms = auctionId ? [auctionId] : [...socket.rooms].filter((r) => r !== socket.id);
    for (const room of rooms) {
      await socket.leave(room);
      await redis.sRem(watchKey(room), socket.id);
      const count = await redis.sCard(watchKey(room));
      io.to(room).emit("auction:watchers", { count });
    }
  };

  socket.on("auction:leave", ({ auctionId }: { auctionId: string }) => handleLeave(auctionId));
  socket.on("disconnect", () => handleLeave());

  // ── bid placed (broadcast from bid route after DB write) ──────────────────
  // Call this from your bid service after a successful bid:
  //   io.to(auctionId).emit("auction:bid", bidEvent)
  // The bid route should also call setRoomState() to keep Redis fresh.

  // ── ping/pong for connection health ──────────────────────────────────────
  socket.on("auction:ping", ({ auctionId }: { auctionId: string }) => {
    socket.emit("auction:pong", { auctionId, ts: Date.now() });
  });
}

// ── Call this from your bid service after every accepted bid ──────────────────
// Keeps Redis state fresh so reconnecting clients get accurate data instantly.
export async function broadcastBid(
  io: Server,
  auctionId: string,
  event: {
    bidId:        string;
    bidderId:     string;
    amount:       number;
    bidCount:     number;
    newEndTime?:  string; // set when anti-snipe extension triggered
  }
): Promise<void> {
  // Update Redis room state
  const existing = await getRoomState(auctionId);
  if (existing) {
    const updated: RoomState = {
      ...existing,
      currentPrice:    event.amount,
      highestBidderId: event.bidderId,
      bidCount:        event.bidCount,
      lastBidAt:       new Date().toISOString(),
      ...(event.newEndTime ? { endsAt: event.newEndTime } : {}),
    };
    await setRoomState(auctionId, updated);
  }

  // Broadcast to everyone in the room
  io.to(auctionId).emit("auction:bid", {
    auctionId,
    bidId:        event.bidId,
    amount:       event.amount,
    bidCount:     event.bidCount,
    ts:           Date.now(),
    ...(event.newEndTime ? { newEndTime: event.newEndTime, extended: true } : {}),
  });
}
