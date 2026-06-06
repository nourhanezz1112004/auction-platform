/**
 * AI Intelligence API — price prediction, momentum, autobidder, reserve suggester.
 * All calls route through the backend proxy (/auctions/ai/...) which in turn
 * calls the FastAPI ai-service with callWithFallback — so the UI always gets
 * a valid response even when the AI service is temporarily unavailable.
 */

import { apiClient } from './client';
import type {
  PricePredictionResponse,
  MomentumResponse,
  AutobidResponse,
  ReserveSuggestionResponse,
} from '@auction/shared-types';

// ─── Price Prediction ─────────────────────────────────────────────────────────

export interface PricePredictionParams {
  auctionId:      string;
  category:       string;
  startingPrice:  number;
  currentPrice:   number;
  bidCount:       number;
  endsAt:         string;  // ISO string
}

export async function getPricePrediction(
  params: PricePredictionParams,
): Promise<PricePredictionResponse> {
  const endsDate       = new Date(params.endsAt);
  const hoursRemaining = Math.max(0, (endsDate.getTime() - Date.now()) / 3_600_000);
  const dayOfWeek      = new Date().getDay();

  const { data } = await apiClient.post<PricePredictionResponse>(
    '/auctions/ai/price-prediction',
    {
      auction_id:      params.auctionId,
      category:        params.category,
      starting_price:  params.startingPrice,
      current_price:   params.currentPrice,
      bid_count:       params.bidCount,
      hours_remaining: hoursRemaining,
      day_of_week:     dayOfWeek,
    },
  );
  return data;
}

// ─── Momentum ─────────────────────────────────────────────────────────────────

export interface MomentumParams {
  auctionId:     string;
  bidCount:      number;
  recentBids:    number;   // bids in last 10 min (best effort from socket events)
  bidsLastHour:  number;
  endsAt:        string;
  watchers?:     number;
}

export async function getAuctionMomentum(
  params: MomentumParams,
): Promise<MomentumResponse> {
  const hoursRemaining = Math.max(
    0,
    (new Date(params.endsAt).getTime() - Date.now()) / 3_600_000,
  );

  const { data } = await apiClient.post<MomentumResponse>('/auctions/ai/momentum', {
    auction_id:      params.auctionId,
    bid_count:       params.bidCount,
    bids_last_10min: params.recentBids,
    bids_last_1h:    params.bidsLastHour,
    hours_remaining: hoursRemaining,
    watchers:        params.watchers ?? 0,
  });
  return data;
}

// ─── Autobidder ───────────────────────────────────────────────────────────────

export type AutobidStrategy = 'conservative' | 'aggressive' | 'sniper' | 'value';

export interface AutobidParams {
  auctionId:    string;
  currentPrice: number;
  maxBudget:    number;
  strategy:     AutobidStrategy;
  endsAt:       string;
  bidCount:     number;
}

export async function getAutobidDecision(
  params: AutobidParams,
): Promise<AutobidResponse> {
  const hoursRemaining = Math.max(
    0,
    (new Date(params.endsAt).getTime() - Date.now()) / 3_600_000,
  );

  const { data } = await apiClient.post<AutobidResponse>('/auctions/ai/autobid', {
    auction_id:      params.auctionId,
    current_price:   params.currentPrice,
    max_budget:      params.maxBudget,
    strategy:        params.strategy,
    hours_remaining: hoursRemaining,
    bid_count:       params.bidCount,
  });
  return data;
}

// ─── Reserve Price Suggester ──────────────────────────────────────────────────

export type ItemCondition = 'poor' | 'fair' | 'good' | 'excellent' | 'mint';

export interface ReserveSuggestionParams {
  category:      string;
  startingPrice: number;
  title:         string;
  condition?:    ItemCondition;
}

export async function getReserveSuggestion(
  params: ReserveSuggestionParams,
): Promise<ReserveSuggestionResponse> {
  const { data } = await apiClient.post<ReserveSuggestionResponse>(
    '/auctions/ai/reserve-suggestion',
    {
      category:       params.category,
      starting_price: params.startingPrice,
      title:          params.title,
      condition:      params.condition ?? 'good',
    },
  );
  return data;
}

// ─── Seller Insights ──────────────────────────────────────────────────────────

export interface SellerInsightsResponse {
  weekly_summary:        string;
  avg_above_reserve_pct: number;
  best_closing_day:      string;
  best_closing_hour:     string;
  projected_gmv:         number;
  recommendations:       string[];
  category_performance:  Record<string, number>;
}

export async function getSellerInsights(
  sellerId: string,
  auctionIds: string[] = [],
): Promise<SellerInsightsResponse> {
  const { data } = await apiClient.post<SellerInsightsResponse>(
    '/auctions/ai/seller-insights',
    { seller_id: sellerId, auction_ids: auctionIds, lookback_days: 30 },
  );
  return data;
}

// ─── Listing Guard ────────────────────────────────────────────────────────────

export interface ListingGuardResponse {
  is_suspicious:  boolean;
  is_duplicate:   boolean;
  risk_level:     'low' | 'medium' | 'high';
  flags:          string[];
  recommendation: string;
}

export async function checkListing(params: {
  title:       string;
  description: string;
  category:    string;
  sellerId:    string;
}): Promise<ListingGuardResponse> {
  const { data } = await apiClient.post<ListingGuardResponse>(
    '/auctions/ai/listing-guard',
    {
      title:       params.title,
      description: params.description,
      category:    params.category,
      seller_id:   params.sellerId,
    },
  );
  return data;
}

// ─── Smart Outbid Notification ────────────────────────────────────────────────

export interface OutbidNotificationResponse {
  message:    string;
  urgency:    'low' | 'medium' | 'high' | 'critical';
  action_cta: string;
}

export async function getOutbidNotification(params: {
  auctionId:        string;
  outbidBy:         number;
  watcherCount:     number;
  secondsRemaining: number;
  bidCount:         number;
}): Promise<OutbidNotificationResponse> {
  const { data } = await apiClient.post<OutbidNotificationResponse>(
    '/auctions/ai/outbid-notification',
    {
      auction_id:        params.auctionId,
      outbid_by:         params.outbidBy,
      watcher_count:     params.watcherCount,
      seconds_remaining: params.secondsRemaining,
      bid_count:         params.bidCount,
    },
  );
  return data;
}
