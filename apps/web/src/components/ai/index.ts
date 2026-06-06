// apps/web/src/components/ai/index.ts
// Exports all AI components — base + enhanced + v2.1

// ── Base AI components ────────────────────────────────────────────────────────
export { default as PricePredictionCard }  from './PricePredictionCard';
export { default as ReserveSuggester }     from './ReserveSuggester';
export { default as AutoBidder }           from './AutoBidder';
export { default as AuctionMomentumBar }   from './AuctionMomentumBar';
export { default as ConnectivityBanner }   from './ConnectivityBanner';
export { default as BidPaceSparkline }     from './BidPaceSparkline';
export { default as SellerInsightsCard }   from './SellerInsightsCard';
export { default as AntiSnipeBanner }      from './AntiSnipeBanner';
export { default as ListingGuard }         from './ListingGuard';

// ── Enhanced AI components (v2.0) ─────────────────────────────────────────────
export { default as RelistOptimiser }      from './RelistOptimiser';
export { default as DemandHeatmap }        from './DemandHeatmap';
export { default as CreateListing }        from './CreateListing';
export { default as BuyerInsights }        from './BuyerInsights';
export { default as AuctionRoom }          from './AuctionRoom';
export { default as AdminDisputePanel }    from './AdminDisputePanel';
export { default as SellerDashboard }      from './SellerDashboard';
export { default as AdminDashboard }       from './AdminDashboard';
export { default as DemandForecast }       from './DemandForecast';
export { default as SemanticSearch }       from './SemanticSearch';
export { default as NotificationBell }     from './NotificationBell';
export { default as HomePage }             from './HomePage';
export { default as AutobidPanel }         from './AutobidPanel';
export { default as LiveAuctionAI }        from './LiveAuctionAI';
export { default as ReservePriceSuggester } from './ReservePriceSuggester';

// ── New AI components (v2.1) ──────────────────────────────────────────────────
export { default as SmartPriceSuggester }  from './SmartPriceSuggester';
export { default as AutoCategorizer }      from './AutoCategorizer';
