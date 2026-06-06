/**
 * PricePredictionCard — shows predicted final price with confidence range.
 * Fetches once and caches for 5 minutes (price model is not real-time).
 */

import { useQuery } from '@tanstack/react-query'
import { TrendingUp, HelpCircle } from 'lucide-react'
import { getPricePrediction } from '@/api/ai'
import type { Auction } from '@/api/auctions'

interface Props {
  auction:  Auction
  bidCount: number
}

export function PricePredictionCard({ auction, bidCount }: Props) {
  const { data, isLoading } = useQuery({
    queryKey:  ['price-prediction', auction.id, bidCount],
    queryFn:   () => getPricePrediction({
      auctionId:     auction.id,
      category:      auction.category,
      startingPrice: auction.startingPrice,
      currentPrice:  auction.currentPrice,
      bidCount,
      endsAt:        auction.endsAt,
    }),
    staleTime: 5 * 60_000,
    enabled:   auction.status === 'ACTIVE' && bidCount > 0,
  })

  if (isLoading) {
    return (
      <div className="bg-bg-surface border border-border-base p-4 rounded-none animate-pulse">
        <div className="h-3 w-32 bg-bg-tertiary rounded-none mb-2" />
        <div className="h-6 w-24 bg-bg-tertiary rounded-none" />
      </div>
    )
  }

  if (!data || data.predicted_final === 0) return null

  return (
    <div className="bg-bg-surface border border-border-base rounded-none p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-primary" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary font-mono">
          AI Price Forecast
        </span>
        <div className="group relative ml-auto cursor-help">
          <HelpCircle className="w-3 h-3 text-text-tertiary" />
          <div className="absolute right-0 bottom-full mb-1.5 w-52 p-2 bg-bg-surface border border-border-base text-[9px] text-text-secondary font-mono rounded-none shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            Statistical estimate based on category trends and bid activity. Not financial advice.
          </div>
        </div>
      </div>

      <div>
        <p className="font-mono text-2xl font-bold text-primary tracking-tight">
          ${data.predicted_final.toLocaleString()}
        </p>
        <p className="text-[9px] font-mono text-text-tertiary uppercase tracking-widest mt-0.5">
          Range: ${data.confidence_low.toLocaleString()} – ${data.confidence_high.toLocaleString()}
        </p>
      </div>

      <div className="pt-2 border-t border-border-base">
        <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-widest text-text-tertiary">
          <span>Confidence band</span>
          <span className="text-text-secondary">
            {Math.round(((data.predicted_final - data.confidence_low) / data.predicted_final) * 100 * 2)}%
          </span>
        </div>
        <div className="mt-1.5 h-1 bg-bg-tertiary rounded-none overflow-hidden">
          <div
            className="h-full bg-primary/40 rounded-none"
            style={{
              marginLeft: `${Math.round((data.confidence_low / data.confidence_high) * 30)}%`,
              width: '40%',
            }}
          />
        </div>
      </div>
    </div>
  )
}
export default PricePredictionCard;
