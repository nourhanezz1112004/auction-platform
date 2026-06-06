// backend/src/jobs/startup.ts
// Single file that registers ALL Bull queue jobs and schedules recurring ones.
// Import and call initJobs(io) in your app.ts on startup.
// Replaces having job registrations scattered across files.

import type { Server } from "socket.io";
import { auctionQueue, scheduleAuctionClose }  from "./auctionTimer";
import { winbackQueue, demandAlertQueue }       from "./winback";
import { emailQueue, disputeQueue }             from "./postAuctionEmails";
import { outbidQueue }                          from "./outbidNotifications";
import { shillQueue }                           from "./shillAlerts";
import { autobidQueue, restoreAutobids, setIo } from "./autobidder";
import { prisma }                               from "../lib/prisma";
import axios                                    from "axios";

const AI_SERVICE = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

export async function initJobs(io: Server): Promise<void> {
  console.log("[jobs] Initialising all Bull queues…");

  // ── 1. Wire Socket.io into autobidder ──────────────────────────
  setIo(io);

  // ── 2. Restore active autobids after restart ───────────────────
  await restoreAutobids(io);

  // ── 3. Schedule recurring jobs (idempotent — Bull deduplicates) ─
  await winbackQueue.add(
    "nightly-winback", {},
    { repeat: { cron: "0 21 * * *" }, jobId: "winback-nightly" }
  );

  await demandAlertQueue.add(
    "check-demand", {},
    { repeat: { cron: "0 * * * *" }, jobId: "demand-hourly" }
  );

  await shillQueue.add(
    "nightly-scan", {},
    { repeat: { cron: "0 3 * * *" }, jobId: "shill-nightly" }
  );

  // ── 4. Retrain check — runs every 4 hours ─────────────────────
  const retrainQueue = (await import("bull")).default;
  const retrain = new retrainQueue("model-retrain", process.env.REDIS_URL ?? "redis://localhost:6379");

  retrain.add(
    "check-retrain", {},
    { repeat: { cron: "0 */4 * * *" }, jobId: "retrain-check" }
  );

  retrain.process("check-retrain", async () => {
    try {
      const res = await axios.post(`${AI_SERVICE}/retrain/check`);
      if (res.data.retraining) {
        console.log(`[retrain] Triggered — ${res.data.new_bids} new bids since last train`);
      }
    } catch {
      // AI service may be down — silent fail, try again in 4h
    }
  });

  // ── 5. Reschedule any active auctions that survived a restart ──
  const activeAuctions = await prisma.auction.findMany({
    where: { status: "ACTIVE", endsAt: { gt: new Date() } },
    select: { id: true, endsAt: true },
  });

  for (const auction of activeAuctions) {
    await scheduleAuctionClose(auction.id, auction.endsAt);
  }
  console.log(`[jobs] Rescheduled ${activeAuctions.length} active auction timers`);

  console.log("[jobs] All queues initialised ✓");
}

// ── Add to backend/src/app.ts ─────────────────────────────────────────────────
//
// import { initJobs } from "./jobs/startup";
//
// // After creating the Socket.io server:
// initJobs(io).catch(err => console.error("[startup] Job init failed:", err));
//
// // Add notification route:
// import notifRouter from "./routes/notifications";
// app.use("/api/notifications", requireAuth, notifRouter);
//
// // Add support ticket resolve endpoint:
// app.patch("/api/support/tickets/:id/resolve", requireAuth, async (req, res) => {
//   const { resolution } = req.body;
//   await prisma.supportTicket.update({
//     where: { id: req.params.id },
//     data: { status: "resolved", resolvedAt: new Date(), resolvedById: req.user.id,
//             escalationReason: resolution },
//   });
//   res.json({ success: true });
// });
//
// app.get("/api/support/tickets", requireAuth, async (req, res) => {
//   const { status = "open" } = req.query;
//   const tickets = await prisma.supportTicket.findMany({
//     where: { status: status as string },
//     include: { user: { select: { name: true, email: true } } },
//     orderBy: { createdAt: "desc" },
//     take: 50,
//   });
//   res.json(tickets);
// });
