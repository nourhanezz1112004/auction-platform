/**
 * SellerInsightsCard — weekly AI performance summary for sellers.
 * Shown on ProfilePage (my-listings tab) and SellerProfilePage (public view).
 */

import { useQuery } from '@tanstack/react-query'
import { BarChart2, TrendingUp, Clock, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { getSellerInsights } from '@/api/ai'

interface Props {
  sellerId:   string
  auctionIds?: string[]
  /** Set to true on public seller profile — hides projected GMV */
  publicView?: boolean
}

export function SellerInsightsCard({ sellerId, auctionIds = [], publicView = false }: Props) {
  const [expanded, setExpanded] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey:  ['seller-insights', sellerId],
    queryFn:   () => getSellerInsights(sellerId, auctionIds),
    staleTime: 5 * 60_000,
    enabled:   !!sellerId,
  })

  if (isLoading) {
    return (
      <div className="bg-bg-surface border border-border-base p-5 rounded-none animate-pulse space-y-2">
        <div className="h-3 w-40 bg-bg-tertiary rounded-none" />
        <div className="h-12 bg-bg-tertiary rounded-none" />
      </div>
    )
  }

  if (!data || data.weekly_summary === 'AI insights temporarily unavailable.') return null

  return (
    <div className="bg-bg-surface border border-border-base rounded-none">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer text-left"
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="w-3.5 h-3.5 text-primary" />
          <span className="text-[9px] font-bold uppercase tracking-widest font-mono text-text-secondary">
            AI Performance Insights
          </span>
        </div>
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-text-tertiary" />
          : <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
        }
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-border-base pt-4">
          {/* AI narrative */}
          <div className="flex gap-2.5">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-text-secondary leading-relaxed font-light italic">
              "{data.weekly_summary}"
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg-tertiary/30 border border-border-base p-3 rounded-none">
              <p className="text-[8px] font-mono uppercase tracking-widest text-text-tertiary mb-1">
                Avg Above Reserve
              </p>
              <p className={`font-mono text-lg font-bold ${data.avg_above_reserve_pct > 0 ? 'text-primary' : 'text-text-secondary'}`}>
                {data.avg_above_reserve_pct > 0 ? '+' : ''}{data.avg_above_reserve_pct.toFixed(1)}%
              </p>
            </div>

            {!publicView && (
              <div className="bg-bg-tertiary/30 border border-border-base p-3 rounded-none">
                <p className="text-[8px] font-mono uppercase tracking-widest text-text-tertiary mb-1">
                  Projected GMV
                </p>
                <p className="font-mono text-lg font-bold text-text-primary">
                  ${data.projected_gmv.toLocaleString()}
                </p>
              </div>
            )}

            <div className={`bg-bg-tertiary/30 border border-border-base p-3 rounded-none ${publicView ? 'col-span-1' : ''}`}>
              <p className="text-[8px] font-mono uppercase tracking-widest text-text-tertiary mb-1 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> Best Time to Close
              </p>
              <p className="font-mono text-sm font-bold text-text-primary">
                {data.best_closing_day}
              </p>
              <p className="font-mono text-[9px] text-text-tertiary">{data.best_closing_hour}</p>
            </div>
          </div>

          {/* Category performance */}
          {Object.keys(data.category_performance).length > 0 && (
            <div className="space-y-2">
              <p className="text-[8px] font-bold uppercase tracking-widest text-text-tertiary font-mono">
                Category Performance (sell-through multiplier)
              </p>
              {Object.entries(data.category_performance)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 4)
                .map(([cat, mult]) => (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-text-secondary capitalize w-20 shrink-0">{cat}</span>
                    <div className="flex-1 h-1.5 bg-bg-tertiary rounded-none overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-none transition-all"
                        style={{ width: `${Math.min(mult / 2, 1) * 100}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-mono text-text-tertiary w-8 text-right">{mult.toFixed(2)}×</span>
                  </div>
                ))}
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border-base">
              <p className="text-[8px] font-bold uppercase tracking-widest text-text-tertiary font-mono flex items-center gap-1">
                <TrendingUp className="w-2.5 h-2.5" /> AI Recommendations
              </p>
              {data.recommendations.map((rec, i) => (
                <div key={i} className="flex gap-2 text-[9px] text-text-secondary font-light">
                  <span className="text-primary font-bold shrink-0">→</span>
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
export default SellerInsightsCard;
