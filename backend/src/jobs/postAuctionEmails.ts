// backend/src/jobs/postAuctionEmails.ts
// Bull queue job triggered when an auction closes.
// Calls the AI email generator and sends via your email provider (SES/SendGrid).
// Wires into your existing auctionTimer.ts close-auction processor.

import Queue from "bull";
import { prisma } from "../lib/prisma";
import { callWithFallback } from "../lib/aiService";
import nodemailer from "nodemailer";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const emailQueue = new Queue("post-auction-emails", REDIS_URL, {
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail:     200,
    attempts:         3,
    backoff: { type: "exponential", delay: 10_000 },
  },
});

// Mail transport — swap for SES/SendGrid in production
const transporter = nodemailer.createTransport(
  process.env.SMTP_URL
    ? process.env.SMTP_URL
    : {
        host:   process.env.SMTP_HOST ?? "smtp.gmail.com",
        port:   parseInt(process.env.SMTP_PORT ?? "587"),
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      }
);

// ── Trigger this from your close-auction job ──────────────────────────────────
// In auctionTimer.ts, after updating auction status to CLOSED, add:
//   await emailQueue.add("send-post-auction-emails", { auctionId, winnerId, sellerId });

emailQueue.process("send-post-auction-emails", async (job) => {
  const { auctionId, winnerId, sellerId } = job.data as {
    auctionId: string;
    winnerId: string | null;
    sellerId: string;
  };

  // Send winner email
  if (winnerId) {
    const winner = await prisma.user.findUnique({
      where: { id: winnerId },
      select: { email: true, name: true },
    });

    if (winner?.email) {
      const content = await callWithFallback<{
        subject: string;
        html_body: string;
        plain_text: string;
      }>("/emails/winner", { auction_id: auctionId, winner_id: winnerId });

      if (content) {
        await transporter.sendMail({
          from:    `"BidSpace" <${process.env.EMAIL_FROM ?? "noreply@bidspace.com"}>`,
          to:      winner.email,
          subject: content.subject,
          html:    content.html_body,
          text:    content.plain_text,
        });
        console.log(`[email] Winner email sent to ${winner.email}`);
      }
    }
  }

  // Send seller recap email
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { email: true, name: true },
  });

  if (seller?.email) {
    const content = await callWithFallback<{
      subject: string;
      html_body: string;
      plain_text: string;
    }>("/emails/seller-recap", { auction_id: auctionId, seller_id: sellerId });

    if (content) {
      await transporter.sendMail({
        from:    `"BidSpace" <${process.env.EMAIL_FROM ?? "noreply@bidspace.com"}>`,
        to:      seller.email,
        subject: content.subject,
        html:    content.html_body,
        text:    content.plain_text,
      });
      console.log(`[email] Seller recap email sent to ${seller.email}`);
    }
  }
});

// ── Dispute resolution route ───────────────────────────────────────────────────
export const disputeQueue = new Queue("dispute-analysis", REDIS_URL, {
  defaultJobOptions: { removeOnComplete: 50, attempts: 2 },
});

disputeQueue.process("analyse", async (job) => {
  const { auctionId, disputeReason, filedBy, claimantId, adminEmail } = job.data;

  const analysis = await callWithFallback<{
    case_summary: string;
    recommended_resolution: string;
    confidence: string;
    reasoning: string;
  }>("/dispute/analyse", {
    auction_id: auctionId,
    dispute_reason: disputeReason,
    filed_by: filedBy,
    claimant_id: claimantId,
  });

  if (!analysis || !adminEmail) return;

  // Email the admin team with the AI analysis
  await transporter.sendMail({
    from:    `"BidSpace AI" <${process.env.EMAIL_FROM ?? "noreply@bidspace.com"}>`,
    to:      adminEmail,
    subject: `Dispute: ${analysis.recommended_resolution.toUpperCase()} — Auction ${auctionId}`,
    text: [
      `DISPUTE ANALYSIS`,
      `Auction: ${auctionId}`,
      `Filed by: ${filedBy}`,
      ``,
      `SUMMARY: ${analysis.case_summary}`,
      `RECOMMENDATION: ${analysis.recommended_resolution}`,
      `CONFIDENCE: ${analysis.confidence}`,
      `REASONING: ${analysis.reasoning}`,
    ].join("\n"),
  });
});
