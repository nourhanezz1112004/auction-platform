import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Star, ShieldCheck, Mail, Calendar, Package, AlertTriangle, ArrowLeft } from 'lucide-react'
import { apiClient } from '@/api/client'
import { getAuctions } from '@/api/auctions'
import type { AuthUser } from '@/store/authStore'
import { AuctionCard } from '@/components/auction/AuctionCard'
import { SellerInsightsCard } from '@/components/ai'
import { fadeUp, smooth, staggerContainer } from '@/lib/animations'

export function SellerProfilePage() {
  const { id } = useParams<{ id: string }>()

  // Fetch public seller details
  const { data: seller, isLoading: sellerLoading, error: sellerError } = useQuery<AuthUser>({
    queryKey: ['seller-profile', id],
    queryFn: async () => {
      const res = await apiClient.get<{ user: AuthUser }>(`/users/${id}`)
      return res.data.user
    },
    enabled: !!id,
  })

  // Fetch active listings for this seller
  const { data: listingsData, isLoading: listingsLoading } = useQuery({
    queryKey: ['seller-listings', id],
    queryFn: () => getAuctions({ sellerId: id, limit: 20 }),
    enabled: !!id,
  })

  if (sellerLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (sellerError || !seller) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center max-w-md mx-auto text-center px-4">
        <AlertTriangle className="w-12 h-12 text-danger mb-4" />
        <h2 className="font-serif italic text-2xl font-bold text-text-primary mb-2">Seller Not Found</h2>
        <p className="text-sm text-text-secondary mb-6">The requested collector profile could not be retrieved.</p>
        <Link to="/" className="px-6 py-2.5 rounded-none bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark">
          Return to Registry
        </Link>
      </div>
    )
  }

  const listings = listingsData?.auctions ?? []
  const joinedDate = seller.createdAt ? new Date(seller.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Unknown'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Back button */}
      <div>
        <Link
          to={-1 as any}
          className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to lot
        </Link>
      </div>

      {/* Seller Header */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="bg-bg-surface border border-border-base p-8 rounded-none shadow-sm flex flex-col md:flex-row items-start justify-between gap-8"
      >
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
          <div className="w-24 h-24 bg-primary-light text-primary flex items-center justify-center rounded-none border border-primary/20 text-4xl font-serif italic shadow-sm shrink-0 overflow-hidden">
            {seller.avatarUrl ? (
              <img src={seller.avatarUrl} alt={seller.name} className="w-full h-full object-cover" />
            ) : (
              seller.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5 justify-center sm:justify-start">
              <h1 className="font-serif italic text-3xl font-semibold text-text-primary">{seller.name}</h1>
              {seller.isAdmin && (
                <span className="px-2 py-0.5 rounded-none bg-primary text-white text-[8px] font-mono uppercase tracking-widest font-bold">
                  Verified Curator
                </span>
              )}
            </div>
            {seller.bio ? (
              <p className="text-sm text-text-secondary max-w-2xl">{seller.bio}</p>
            ) : (
              <p className="text-sm text-text-tertiary italic">No curator bio provided.</p>
            )}

            <div className="flex flex-wrap gap-4 items-center justify-center sm:justify-start text-xs text-text-secondary font-mono">
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-text-tertiary" /> Joined {joinedDate}</span>
              <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-text-tertiary" /> {listings.length} Active Lots</span>
            </div>
          </div>
        </div>

        {/* Reputation Card */}
        <div className="w-full md:w-auto p-5 bg-bg-tertiary border border-border-base rounded-none text-center space-y-2 md:min-w-[200px]">
          <span className="text-[9px] font-mono uppercase tracking-widest text-text-tertiary">Curator Reputation</span>
          <div className="flex items-center justify-center gap-1">
            <span className="font-mono text-3xl font-bold text-text-primary">
              {seller.rating ? seller.rating.toFixed(1) : '5.0'}
            </span>
            <div className="flex flex-col items-start">
              <div className="flex text-warning">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-current" />
                ))}
              </div>
              <span className="text-[9px] font-mono text-text-tertiary">Trusted Seller</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1 text-[9px] font-mono text-primary font-bold uppercase tracking-wider pt-1.5 border-t border-border-base/50">
            <ShieldCheck className="w-3.5 h-3.5" /> 100% Authenticity Guarantees
          </div>
        </div>
      </motion.div>

      {/* Seller Active Listings */}
      <div className="space-y-6">
        <div className="border-b border-border-base pb-3">
          <h2 className="font-serif italic text-2xl text-text-primary">Archival Lots on Offer</h2>
          <p className="font-mono text-[9px] uppercase tracking-widest text-text-secondary mt-1">Active auctions curated by this seller</p>
        </div>

        {/* AI Seller Insights (public view — no GMV) */}
        {id && (
          <SellerInsightsCard
            sellerId={id}
            auctionIds={listings.map(a => a.id)}
            publicView
          />
        )}

        {listingsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-96 bg-bg-surface rounded-none border border-border-base animate-pulse" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 bg-bg-surface border border-border-base border-dashed rounded-none">
            <Package className="w-10 h-10 text-text-tertiary mx-auto mb-4" />
            <p className="text-xs uppercase font-bold tracking-wider text-text-secondary">No Lots Currently Listed</p>
            <p className="text-[9px] font-mono tracking-widest uppercase text-text-tertiary mt-2">Check back later for new curated additions</p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6"
          >
            {listings.map((auction) => (
              <motion.div key={auction.id} variants={fadeUp}>
                <AuctionCard auction={auction} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
