// backend/src/services/pushNotifications.ts
// Firebase Cloud Messaging integration for mobile push notifications.
// All notification jobs (winback, outbid, demand surge, autobid) call this.
// Stores FCM tokens in the User table — register on app launch.

import { prisma } from "../lib/prisma";

// Firebase Admin SDK — lazy-loaded so the app starts even without credentials
let messaging: any = null;

function getMessaging() {
  if (messaging) return messaging;
  try {
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });
    }
    messaging = admin.messaging();
    return messaging;
  } catch {
    console.warn("[push] Firebase not configured — push notifications disabled");
    return null;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;   // must be string values for FCM
  imageUrl?: string;
  badge?: number;                  // iOS badge count
}

// ── Send to a single user ─────────────────────────────────────────
export async function sendPush(userId: string, payload: PushPayload): Promise<boolean> {
  const msg = getMessaging();
  if (!msg) return false;

  // Fetch user's FCM tokens (they can have multiple devices)
  const tokens = await prisma.fcmToken.findMany({
    where: { userId, isActive: true },
    select: { token: true, id: true },
  });

  if (!tokens.length) return false;

  const tokenStrings = tokens.map(t => t.token);

  try {
    const response = await msg.sendEachForMulticast({
      tokens: tokenStrings,
      notification: {
        title: payload.title,
        body: payload.body,
        imageUrl: payload.imageUrl,
      },
      data: {
        ...payload.data,
        ...(payload.badge !== undefined ? { badge: String(payload.badge) } : {}),
      },
      android: {
        priority: "high",
        notification: {
          channelId: "bidspace_alerts",
          priority: "high",
          defaultSound: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: payload.badge,
            contentAvailable: true,
          },
        },
      },
    });

    // Deactivate stale tokens
    const failedIndices = response.responses
      .map((r: any, i: number) => (!r.success ? i : -1))
      .filter((i: number) => i >= 0);

    if (failedIndices.length) {
      const staleTokenIds = failedIndices.map((i: number) => tokens[i].id);
      await prisma.fcmToken.updateMany({
        where: { id: { in: staleTokenIds } },
        data: { isActive: false },
      });
    }

    return response.successCount > 0;
  } catch (err) {
    console.error("[push] Send failed", err);
    return false;
  }
}

// ── Send to multiple users (batch) ───────────────────────────────
export async function sendPushBatch(
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  const results = await Promise.allSettled(
    userIds.map(uid => sendPush(uid, payload))
  );
  const sent   = results.filter(r => r.status === "fulfilled" && r.value).length;
  const failed = results.length - sent;
  return { sent, failed };
}

// ── Save FCM token on login/app launch ───────────────────────────
export async function registerFcmToken(userId: string, token: string, platform: "ios" | "android" | "web"): Promise<void> {
  await prisma.fcmToken.upsert({
    where: { token },
    create: { userId, token, platform, isActive: true },
    update: { userId, isActive: true, updatedAt: new Date() },
  });
}

// ── Unregister on logout ─────────────────────────────────────────
export async function unregisterFcmToken(token: string): Promise<void> {
  await prisma.fcmToken.updateMany({
    where: { token },
    data: { isActive: false },
  });
}
