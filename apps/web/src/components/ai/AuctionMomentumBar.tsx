/**
 * AuctionMomentumBar — live heat indicator for the auction room.
 * Polls the AI service every 30s via React Query.
 */

import { useQuery } from '@tanstack/react-query'
import { Flame, Thermometer, Wind, Zap } from 'lucide-react'
import { getAuctionMomentum } from '@/api/ai'
import type { Auction } from '@/api/auctions'

interface Props {
  auction: Auction
  bidCount: number
  recentBidCount?: number   // from socket events in parent
}

const LABELS = {
  cool:    { Icon: Wind,        text: 'Quiet',   bg: 'bg-blue-50',   border: 'border-blue-200',   textCls: 'text-blue-600' },
  warming: { Icon: Thermometer, text: 'Warming', bg: 'bg-yellow-50', border: 'border-yellow-200', textCls: 'text-yellow-600' },
  hot:     { Icon: Flame,       text: 'Hot',     bg: 'bg-orange-50', border: 'border-orange-200', textCls: 'text-orange-600' },
  frenzy:  { Icon: Zap,         text: 'Frenzy',  bg: 'bg-red-50',    border: 'border-red-200',    textCls: 'text-red-600' },
} as const

export function AuctionMomentumBar({ auction, bidCount, recentBidCount = 0 }: Props) {
  const { data } = useQuery({
    queryKey:      ['momentum', auction.id, bidCount],
    queryFn:       () => getAuctionMomentum({
      auctionId:    auction.id,
      bidCount,
      recentBids:   recentBidCount,
      bidsLastHour: Math.min(bidCount, 20),
      endsAt:       auction.endsAt,
    }),
    staleTime:     30_000,
    refetchInterval: 30_000,
    enabled:       auction.status === 'ACTIVE',
  })

  if (!data || data.score === 0) return null

  const cfg = LABELS[data.label] ?? LABELS.cool
  const { Icon } = cfg
  const barWidth = `${Math.round(data.score * 100)}%`

  return (
    <div className={`rounded-none border ${cfg.border} ${cfg.bg} p-3`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`flex items-center gap-1.5 ${cfg.textCls}`}>
          <Icon className="w-3.5 h-3.5" />
          <span className="text-[9px] font-bold uppercase tracking-widest font-mono">
            Auction Heat — {cfg.text}
          </span>
        </div>
        <span className={`font-mono text-[10px] font-bold ${cfg.textCls}`}>
          {Math.round(data.score * 100)}
        </span>
      </div>
      <div className="h-1.5 bg-white/60 rounded-none overflow-hidden border border-white/40">
        <div
          className="h-full rounded-none transition-all duration-700"
          style={{ width: barWidth, backgroundColor: data.color }}
        />
      </div>
    </div>
  )
}
export default AuctionMomentumBar;
