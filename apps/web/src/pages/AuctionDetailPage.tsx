import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Gavel, User, Shield, FlaskConical, CheckCircle, Trash2, Edit3 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuction, useAuctionBids } from '@/hooks/useAuctions'
import { useAuctionSocket } from '@/hooks/useSocket'
import { CountdownTimer } from '@/components/auction/CountdownTimer'
import { FraudAlert } from '@/components/bid/FraudAlert'
import { BidForm } from '@/components/bid/BidForm'
import { BidHistory } from '@/components/bid/BidHistory'
import { getErrorMessage } from '@/api/client'
import axios from 'axios'
import toast from 'react-hot-toast'
import { fadeIn, smooth, snappy } from '@/lib/animations'
import { ReviewSection } from '@/components/auction/ReviewSection'
import { useAuthStore } from '@/store/authStore'
import type { BidError } from '@/api/bids'
import { AuctionMomentumBar, PricePredictionCard, AutoBidder, AntiSnipeBanner, BidPaceSparkline } from '@/components/ai'

export function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.isAuthenticated)
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const { data: auction, isLoading } = useAuction(id!)
  const { data: bidsData } = useAuctionBids(id!)

  useAuctionSocket(id!)

  const [demoMode, setDemoMode] = useState(false)
  const [selectedImage, setSelectedImage] = useState(0)
  const [bidError, setBidError] = useState<BidError | null>(null)
  const [recentBidCount, setRecentBidCount] = useState(0)

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 px-4 py-6">
        <div className="h-6 w-24 bg-bg-surface rounded-none border border-border-base animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="aspect-square bg-bg-surface rounded-none border border-border-base animate-pulse" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-bg-surface rounded-none border border-border-base animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!auction) {
    return (
      <div className="text-center py-20 px-4">
        <p className="text-text-secondary text-xs uppercase tracking-wider font-semibold">Archival listing not found</p>
        <Link to="/" className="mt-3 text-primary text-[10px] uppercase font-mono tracking-widest hover:text-primary-dark inline-block">
          Return to directory
        </Link>
      </div>
    )
  }

  const bids = bidsData?.bids ?? []
  const isActive = auction.status === 'ACTIVE'
  const isOwner = currentUser?.id === auction.sellerId

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <FraudAlert error={bidError} onClose={() => setBidError(null)} />

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-text-secondary hover:text-text-primary mb-6 transition-all duration-200 cursor-pointer"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back to directory
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

        {/* Left — images */}
        <div className="space-y-4">
          <div className="relative bg-bg-surface border border-border-base rounded-none overflow-hidden aspect-square">
            {auction.imageUrls?.length > 0 ? (
              <AnimatePresence mode="wait">
                <motion.img
                  key={selectedImage}
                  variants={fadeIn}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={snappy}
                  src={auction.imageUrls[selectedImage]}
                  alt={auction.title}
                  className="w-full h-full object-cover"
                />
              </AnimatePresence>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Gavel className="w-12 h-12 text-text-tertiary opacity-30" />
              </div>
            )}
          </div>
          {auction.imageUrls?.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {auction.imageUrls.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`shrink-0 w-16 h-16 rounded-none overflow-hidden border-2 transition-all cursor-pointer ${
                    selectedImage === i ? 'border-primary' : 'border-border-base'
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right — details */}
        <div className="space-y-6">
          <div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-text-tertiary font-bold">{auction.category}</span>
            <h1 className="font-serif italic text-3xl md:text-4xl text-text-primary mt-1 font-medium leading-tight">{auction.title}</h1>
          </div>

          {/* Price and timer */}
          <div className="bg-bg-surface border border-border-base rounded-none p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] text-text-tertiary uppercase font-bold tracking-widest mb-1.5">Current Bid Status</p>
                <motion.p
                  key={auction.currentPrice}
                  initial={{ scale: 1.05, color: 'var(--color-primary)' }}
                  animate={{ scale: 1, color: 'var(--text-primary)' }}
                  className="font-mono text-4xl font-bold tracking-tight text-text-primary"
                >
                  ${auction.currentPrice.toLocaleString()}
                </motion.p>
              </div>
              <CountdownTimer endsAt={auction.endsAt} status={auction.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-border-base text-[9px] text-text-tertiary uppercase font-bold tracking-[0.15em] font-sans">
              <span className="flex items-center gap-1"><Gavel className="w-3.5 h-3.5 text-text-secondary"/> {bidsData?.total ?? 0} Bids Logged</span>
              <span>Opening Price: ${auction.startingPrice.toLocaleString()}</span>
              {auction.reservePrice && (
                <span className="ml-0 sm:ml-auto">
                  {auction.currentPrice >= auction.reservePrice ? (
                    <span className="text-primary flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Reserve Met</span>
                  ) : (
                    <span className="text-warning font-mono">Reserve Not Met</span>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* AI — Momentum Bar */}
          {isActive && (
            <AuctionMomentumBar
              auction={auction}
              bidCount={bidsData?.total ?? 0}
              recentBidCount={recentBidCount}
            />
          )}

          {/* AI — Anti-Snipe Extension Banner */}
          <AntiSnipeBanner auctionId={id!} />

          {/* Bid form / Ended State */}
          {isActive ? (
            <>
              <BidForm
                auctionId={id!}
                currentPrice={auction.currentPrice}
                isActive={isActive}
                isOwner={isOwner}
                user={user}
                setBidError={setBidError}
              />
              {/* AI — AutoBidder (only for authenticated non-owner) */}
              {user && !isOwner && (
                <AutoBidder auction={auction} bidCount={bidsData?.total ?? 0} />
              )}
              {/* AI — Price Prediction */}
              <PricePredictionCard auction={auction} bidCount={bidsData?.total ?? 0} />
            </>
          ) : (            /* ENDED STATE PANELS */
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              {auction.winnerId === currentUser?.id ? (
                <div className="p-6 bg-primary-light border border-primary/30 rounded-none text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center mx-auto mb-2 shadow-sm animate-bounce">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <h3 className="font-serif italic text-2xl font-bold text-primary">Lot Won!</h3>
                  <p className="text-xs uppercase tracking-widest text-primary/80 font-semibold font-mono">
                    Final Price: ${auction.currentPrice.toLocaleString()}
                  </p>
                </div>
              ) : isOwner ? (
                <div className="p-6 bg-bg-surface border border-border-base rounded-none text-center space-y-4 shadow-inner">
                  <div className="w-12 h-12 rounded-full bg-text-secondary/10 text-text-secondary flex items-center justify-center mx-auto mb-2">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <h3 className="font-serif italic text-2xl font-bold text-text-primary">Lot Closed</h3>
                  {auction.winnerId ? (
                    <p className="text-xs uppercase tracking-widest text-text-secondary font-semibold font-mono">
                      Sold for: ${auction.currentPrice.toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-xs uppercase tracking-widest text-text-secondary font-semibold font-mono">
                      Unsold - Reserve Not Met
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-6 bg-bg-surface border border-border-base border-dashed rounded-none text-center opacity-70">
                  <h3 className="font-serif italic text-xl text-text-secondary">Auction Ended</h3>
                  <p className="text-[10px] uppercase tracking-widest text-text-tertiary mt-2">Bidding is closed for this lot</p>
                </div>
              )}
            </div>
          )}

          {isOwner && isActive && (
            <div className="px-4 py-3.5 rounded-none bg-bg-surface border border-border-base text-[10px] font-mono uppercase tracking-wider text-text-secondary text-center space-y-3">
              <p>You are the seller of this archival lot</p>
              <div className="flex items-center justify-center gap-4 pt-2 border-t border-border-base/50">
                <button onClick={() => toast.error('Edit listing flow to be implemented')} className="flex items-center gap-1.5 hover:text-text-primary transition-colors">
                  <Edit3 className="w-3.5 h-3.5" /> Edit Listing
                </button>
                <button onClick={() => toast.error('Delete listing flow to be implemented')} className="flex items-center gap-1.5 text-danger/80 hover:text-danger transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Delete Lot
                </button>
              </div>
            </div>
          )}

          {/* Winner pay button */}
          {auction.status === 'ENDED' && auction.winnerId === currentUser?.id && auction.payment?.status !== 'SUCCEEDED' && (
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative group"
            >
              <Link
                to={`/auctions/${id}/pay`}
                className="relative flex flex-col items-center justify-center gap-1 w-full py-4.5 rounded-none text-white font-bold transition-all bg-primary hover:bg-primary-dark border border-primary/20 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest font-sans">You won this archival lot!</span>
                </div>
                <span className="text-[9px] font-mono tracking-widest uppercase opacity-90">Complete Checkout Now — ${auction.currentPrice.toLocaleString()}</span>
              </Link>
              <p className="text-[9px] text-text-tertiary text-center mt-3 flex items-center justify-center gap-1.5 uppercase font-bold tracking-widest font-mono">
                <Shield className="w-3 h-3 text-primary" /> Secure payment integration via Stripe
              </p>
            </motion.div>
          )}

          {/* Paid status */}
          {auction.status === 'ENDED' && auction.winnerId === currentUser?.id && auction.payment?.status === 'SUCCEEDED' && (
            <div className="px-4 py-8 rounded-none bg-primary-light border border-primary/20 text-center space-y-3">
              <div className="w-10 h-10 rounded-none bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                <CheckCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-widest font-bold text-primary mb-1">Archival Lot Paid</h3>
                <p className="text-[10px] font-mono uppercase tracking-widest text-text-secondary">
                  Payment of ${auction.currentPrice.toLocaleString()} confirmed.
                </p>
              </div>
            </div>
          )}

          {/* Seller / Curator Card */}
          <div className="pt-5 border-t border-border-base">
            <Link
              to={`/seller/${auction.sellerId}`}
              className="group block p-4 bg-bg-surface hover:bg-bg-tertiary/20 border border-border-base hover:border-primary/45 transition-all duration-300 shadow-sm"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {auction.seller?.avatarUrl ? (
                    <img
                      src={auction.seller.avatarUrl}
                      alt={auction.seller.name}
                      className="w-10 h-10 rounded-none object-cover border border-border-base group-hover:border-primary/45 transition-all shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-none bg-primary/5 text-primary border border-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <span className="block text-[8px] font-bold uppercase tracking-widest text-text-tertiary font-sans">Listed By Curator</span>
                    <span className="font-serif italic text-sm text-text-primary group-hover:text-primary font-semibold transition-colors flex items-center gap-1">
                      {auction.seller?.name || "Premium Curator"}
                      <span className="inline-block transform group-hover:translate-x-1 transition-transform">&rarr;</span>
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[8px] font-mono text-text-tertiary uppercase block">Curator Rating</span>
                  <span className="font-mono text-xs font-bold text-primary">{(auction.seller?.rating || 5.0).toFixed(1)} ★</span>
                </div>
              </div>
            </Link>
          </div>

          {/* Description */}
          <div className="pt-4 border-t border-border-base space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">Lot Description & Specifications</h3>
            <p className="text-xs text-text-secondary leading-relaxed font-light tracking-wide">{auction.description}</p>
          </div>
        </div>
      </div>

      {/* AI — Bid Pace Sparkline */}
      {bids.length > 1 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <BidPaceSparkline bids={bids} />
        </div>
      )}

      <BidHistory
        bids={bids}
        total={bidsData?.total}
        currentUserId={currentUser?.id}
      />

      <ReviewSection
        auctionId={id!}
        winnerId={auction.winnerId}
        status={auction.status}
      />
    </div>
  )
}