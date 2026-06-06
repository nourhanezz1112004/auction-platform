/**
 * Auction Intelligence proxy routes.
 *
 * These routes forward requests from the React frontend to the FastAPI
 * ai-service, using the existing callWithFallback wrapper so the feature
 * degrades gracefully when the AI service is unavailable.
 *
 * Prefix: /auctions/ai  (mounted in auctions.routes.ts)
 */

import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { callWithFallback, logger } from '@auction/shared-utils';
import {
  PricePredictionResponse,
  MomentumResponse,
  AutobidResponse,
  ReserveSuggestionResponse,
} from '@auction/shared-types';
import { optionalAuth, requireAuth } from '../../middlewares/auth.middleware';

const router = Router();

const AI_URL     = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';
const AI_TIMEOUT = Number(process.env.AI_TIMEOUT_MS ?? 400);

// ─── Fallbacks (mirror flutter layer's graceful degradation) ─────────────────

const PRICE_FALLBACK: PricePredictionResponse = {
  predicted_final: 0,
  confidence_low:  0,
  confidence_high: 0,
  model_version:   'fallback',
  reserve_vs_pred: 'no_reserve',
};

const MOMENTUM_FALLBACK: MomentumResponse = {
  score: 0,
  label: 'cool',
  color: '#2980B9',
};

const AUTOBID_FALLBACK: AutobidResponse = {
  should_bid:   false,
  bid_amount:   0,
  reasoning:    'AI service unavailable — autobidder paused.',
  next_check_s: 60,
};

const RESERVE_FALLBACK: ReserveSuggestionResponse = {
  suggested_low:  0,
  suggested_high: 0,
  reasoning:      'AI service unavailable.',
  confidence:     'low',
};

// ─── Price Prediction ─────────────────────────────────────────────────────────

router.post('/price-prediction', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await callWithFallback(
      () => axios.post<PricePredictionResponse>(
        `${AI_URL}/ai/price-prediction`,
        req.body,
        { timeout: AI_TIMEOUT },
      ).then(r => r.data),
      PRICE_FALLBACK,
      'price-prediction',
      AI_TIMEOUT,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Momentum ─────────────────────────────────────────────────────────────────

router.post('/momentum', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await callWithFallback(
      () => axios.post<MomentumResponse>(
        `${AI_URL}/ai/momentum`,
        req.body,
        { timeout: AI_TIMEOUT },
      ).then(r => r.data),
      MOMENTUM_FALLBACK,
      'momentum',
      AI_TIMEOUT,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Autobidder ───────────────────────────────────────────────────────────────

router.post('/autobid', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await callWithFallback(
      () => axios.post<AutobidResponse>(
        `${AI_URL}/ai/autobid`,
        req.body,
        { timeout: AI_TIMEOUT },
      ).then(r => r.data),
      AUTOBID_FALLBACK,
      'autobid',
      AI_TIMEOUT,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Reserve Suggestion ───────────────────────────────────────────────────────

router.post('/reserve-suggestion', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await callWithFallback(
      () => axios.post<ReserveSuggestionResponse>(
        `${AI_URL}/ai/reserve-suggestion`,
        req.body,
        { timeout: AI_TIMEOUT },
      ).then(r => r.data),
      RESERVE_FALLBACK,
      'reserve-suggestion',
      AI_TIMEOUT,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export { router as auctionsAiRouter };

// ─── Seller Insights ──────────────────────────────────────────────────────────

router.post('/seller-insights', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await callWithFallback(
      () => axios.post(`${AI_URL}/ai/seller-insights`, req.body, { timeout: AI_TIMEOUT }).then(r => r.data),
      {
        weekly_summary: 'AI insights temporarily unavailable.',
        avg_above_reserve_pct: 0,
        best_closing_day: 'Sunday',
        best_closing_hour: '20:00',
        projected_gmv: 0,
        recommendations: [],
        category_performance: {},
      },
      'seller-insights',
      AI_TIMEOUT,
    );
    res.json(result);
  } catch (err) { next(err); }
});

// ─── Listing Guard ────────────────────────────────────────────────────────────

router.post('/listing-guard', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await callWithFallback(
      () => axios.post(`${AI_URL}/ai/listing-guard`, req.body, { timeout: AI_TIMEOUT }).then(r => r.data),
      { is_suspicious: false, is_duplicate: false, risk_level: 'low', flags: [], recommendation: 'AI service unavailable — listing accepted.' },
      'listing-guard',
      AI_TIMEOUT,
    );
    res.json(result);
  } catch (err) { next(err); }
});

// ─── Smart Outbid Notification ────────────────────────────────────────────────

router.post('/outbid-notification', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await callWithFallback(
      () => axios.post(`${AI_URL}/ai/outbid-notification`, req.body, { timeout: AI_TIMEOUT }).then(r => r.data),
      { message: 'You were outbid.', urgency: 'low', action_cta: 'Place a new bid.' },
      'outbid-notification',
      AI_TIMEOUT,
    );
    res.json(result);
  } catch (err) { next(err); }
});
