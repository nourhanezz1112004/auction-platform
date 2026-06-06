import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Heart, Trash2 } from 'lucide-react'
import { getWatchlist, removeFromWatchlist } from '@/api/watchlist'
import { AuctionCard } from '@/components/auction/AuctionCard'
import toast from 'react-hot-toast'

export function WatchlistPage() {
  const queryClient = useQueryClient()

  const { data: auctions = [], isLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: getWatchlist,
  })

  const removeMutation = useMutation({
    mutationFn: removeFromWatchlist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
      toast.success('Removed from watchlist')
    },
    onError: () => toast.error('Something went wrong'),
  })

  return (
    <div className="space-y-8 py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between border-b border-border-base pb-4">
        <div>
          <h1 className="font-serif italic text-3xl md:text-5xl text-text-primary font-medium">Your Saved Watchlist</h1>
          <p className="font-mono text-[10px] tracking-widest text-text-secondary uppercase mt-2">
            {auctions.length} archival {auctions.length === 1 ? 'lot' : 'lots'} curated
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-72 bg-bg-surface rounded-none border border-border-base animate-pulse" />
          ))}
        </div>
      ) : auctions.length === 0 ? (
        <div className="text-center py-24 bg-bg-surface rounded-none border border-border-base border-dashed flex flex-col items-center">
          <Heart className="w-8 h-8 text-text-tertiary mx-auto mb-4" />
          <p className="text-text-secondary text-xs uppercase tracking-wider font-semibold">Your watchlist is currently empty</p>
          <p className="text-text-tertiary text-[10px] uppercase font-mono tracking-widest mt-2 mb-6">
            Save auctions by toggling the heart indicator on any collection page
          </p>
          <Link
            to="/search"
            className="px-6 py-3 rounded-none bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark transition-all duration-200"
          >
            Explore Live Auctions
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {auctions.map((auction, i) => (
            <motion.div
              key={auction.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="relative group"
            >
              <AuctionCard auction={auction} index={i} />
              <button
                onClick={() => removeMutation.mutate(auction.id)}
                className="absolute top-12 right-2 w-7 h-7 rounded-none bg-bg-surface/90 border border-border-base flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-danger-light hover:border-danger/30 text-text-secondary hover:text-danger z-10 cursor-pointer shadow-sm"
                title="Remove from watchlist"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
