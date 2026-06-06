import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Gavel, Heart, Star, Activity } from 'lucide-react'
import { CountdownTimer } from './CountdownTimer'
import type { Auction } from '@/api/auctions'
import { useState } from 'react'
import { addToWatchlist, removeFromWatchlist } from '@/api/watchlist'
import { useAuthStore } from '@/store/authStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getWatchlist } from '@/api/watchlist'
import toast from 'react-hot-toast'

import { fadeUp, cardHover, spring } from '@/lib/animations'

type Props = {
  auction: Auction
  index?: number
}

export function AuctionCard({ auction, index = 0 }: Props) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const queryClient = useQueryClient()
  
  const { data: watchlist = [] } = useQuery({
    queryKey: ['watchlist'],
    queryFn: getWatchlist,
    enabled: isAuthenticated,
    staleTime: 5000,
  })

  const watchlisted = watchlist.some((a) => a.id === auction.id)
  const [watchloading, setWatchLoading] = useState(false)

  async function toggleWatchlist(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!isAuthenticated) {
      toast.error('Sign in to save auctions')
      return
    }
    setWatchLoading(true)
    try {
      if (watchlisted) {
        await removeFromWatchlist(auction.id)
        toast.success('Removed from watchlist')
      } else {
        await addToWatchlist(auction.id)
        toast.success('Added to watchlist')
      }
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    } catch {
      toast.error('Something went wrong')
    } finally {
      setWatchLoading(false)
    }
  }

  const hasImage = auction.imageUrls?.length > 0

  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ ...spring, delay: index * 0.04 }}
      {...cardHover}
      className="group"
    >
      <Link to={`/auctions/${auction.id}`} className="block h-full">
        <div className="bg-bg-surface border border-border-base rounded-none flex flex-col h-full hover:border-text-secondary hover:-translate-y-[1px] transition-all duration-200">
          
          {/* Image Area */}
          <div className="relative aspect-[4/3] bg-bg-tertiary shrink-0 overflow-hidden border-b border-border-base rounded-none">
            {hasImage ? (
              <img
                src={auction.imageUrls[0]}
                alt={auction.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.01]"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Gavel className="w-6 h-6 text-text-tertiary" />
              </div>
            )}

            {/* Egyptian heritage art-house corner motifs */}
            <div className="absolute top-2.5 left-2.5 w-2 h-2 border-t border-l border-white/30 z-10 pointer-events-none" />
            <div className="absolute top-2.5 right-2.5 w-2 h-2 border-t border-r border-white/30 z-10 pointer-events-none" />
            <div className="absolute bottom-2.5 left-2.5 w-2 h-2 border-b border-l border-white/30 z-10 pointer-events-none" />
            <div className="absolute bottom-2.5 right-2.5 w-2 h-2 border-b border-r border-white/30 z-10 pointer-events-none" />

            <button
              onClick={toggleWatchlist}
              disabled={watchloading}
              aria-label={watchlisted ? "Remove from watchlist" : "Add to watchlist"}
              className="absolute top-2.5 right-2.5 p-1.5 rounded-none bg-bg-surface border border-border-base hover:bg-bg-tertiary transition-colors z-10 shadow-sm cursor-pointer"
            >
              <Heart className={`w-3.5 h-3.5 ${watchlisted ? 'fill-primary text-primary' : 'text-text-tertiary'}`} />
            </button>

            {auction.status === 'ACTIVE' && (
              <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-none bg-bg-surface border border-primary/20 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                <span className="text-[9px] font-bold text-primary uppercase tracking-wider">Live</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="p-4 flex flex-col flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-text-tertiary uppercase font-bold tracking-widest">
                {auction.category}
              </span>
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 text-text-tertiary" />
                <span className="text-[10px] text-text-secondary font-semibold">
                  {auction.seller?.rating ? auction.seller.rating.toFixed(1) : 'New'}
                </span>
              </div>
            </div>

            <h3 className="font-serif italic text-base md:text-lg text-text-primary leading-snug mb-4 line-clamp-2 font-medium">
              {auction.title}
            </h3>

            <div className="mt-auto pt-3 border-t border-border-base/60 flex flex-col gap-2">
              <div className="flex items-end justify-between w-full">
                <div className="flex flex-col">
                  <span className="block text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-0.5">Current Bid</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg md:text-xl font-bold text-text-primary leading-none">
                      ${auction.currentPrice.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">
                      ({auction._count?.bids || 0} bids)
                    </span>
                  </div>
                </div>
              </div>
              <div className="w-full">
                <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-sm w-full justify-center">
                  <Activity className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500 animate-pulse" />
                  <span className="text-[11px] font-mono font-semibold tracking-wider text-amber-700 dark:text-amber-400 uppercase tabular-nums">
                    <CountdownTimer endsAt={auction.endsAt} status={auction.status} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
