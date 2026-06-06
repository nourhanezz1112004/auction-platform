// backend/src/lib/prisma.ts
// Primary + optional read-replica Prisma clients.
// Set DATABASE_URL_READONLY in .env to route analytics to a replica.

import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
  var __prismaRead: PrismaClient | undefined;
}

// Singleton pattern — prevents hot-reload from spawning multiple connections
export const prisma: PrismaClient =
  global.__prisma ??
  (global.__prisma = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  }));

// Read replica — used by analytics routes for heavy aggregation queries
// Falls back to primary if READONLY url not set
export const prismaRead: PrismaClient | null =
  process.env.DATABASE_URL_READONLY
    ? (global.__prismaRead ??
       (global.__prismaRead = new PrismaClient({
         datasources: { db: { url: process.env.DATABASE_URL_READONLY } },
         log: ["error"],
       })))
    : null;

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
  if (prismaRead) global.__prismaRead = prismaRead;
}
