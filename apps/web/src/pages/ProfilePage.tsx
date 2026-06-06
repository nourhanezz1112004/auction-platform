// apps/web/src/pages/ProfilePage.tsx
// Updated: added "Buyer Insights" tab that renders BuyerInsights component

import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Edit2, Check, X, Star, Gavel, Package, Loader2, CreditCard, BarChart2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { updateMe } from '@/api/auth'
import { getErrorMessage, apiClient } from '@/api/client'
import { useQuery } from '@tanstack/react-query'
import { getMyBids } from '@/api/bids'
import { getAuctions } from '@/api/auctions'
import { SellerInsightsCard } from '@/components/ai'
import { BuyerInsights } from '@/components/ai/BuyerInsights'
import { formatDistanceToNow } from 'date-fns'
import { fadeUp, smooth, scaleIn, springGentle } from '@/lib/animations'
import toast from 'react-hot-toast'
import axios from 'axios'

type Tab = 'bids' | 'listings' | 'buyer-insights'

export function ProfilePage() {
  const { user, updateUser } = useAuthStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('bids')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [bidFilter, setBidFilter] = useState<'all' | 'active' | 'ended'>('all')

  const { data: bidsData, isLoading: bidsLoading } = useQuery({
    queryKey: ['my-bids'],
    queryFn: () => getMyBids(1, 50),
    enabled: tab === 'bids',
    staleTime: 0,
  })

  const { data: listingsData, isLoading: listingsLoading } = useQuery({
    queryKey: ['my-listings', user?.id],
    queryFn: () => getAuctions({ sellerId: user?.id, limit: 50 }),
    enabled: tab === 'listings' && !!user?.id,
  })

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await updateMe({ name, phone: phone || undefined, bio: bio || undefined })
      updateUser(updated)
      setEditing(false)
      toast.success('Profile updated')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setName(user?.name ?? '')
    setPhone(user?.phone ?? '')
    setBio(user?.bio ?? '')
    setEditing(false)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Avatar must be under 5 MB'); return }
    setAvatarUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiClient.post<{ url: string }>('/media/upload-avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      })
      const updated = await updateMe({ avatarUrl: res.data.url })
      updateUser(updated)
      toast.success('Avatar updated')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setAvatarUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  const bids = bidsData?.bids ?? []
  const uniqueBids = Array.from(
    bids.reduce((acc, bid) => {
      const existing = acc.get(bid.auctionId)
      if (!existing || bid.amount > existing.amount) acc.set(bid.auctionId, bid)
      return acc
    }, new Map<string, typeof bids[0]>()).values()
  )
  const filteredBids = uniqueBids.filter((bid) => {
    if (bidFilter === 'all') return true
    if (bidFilter === 'active') return bid.auction?.status === 'ACTIVE'
    if (bidFilter === 'ended') return bid.auction?.status === 'ENDED'
    return true
  })
  const listings = listingsData?.auctions ?? []

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-6 px-4">

      {/* Profile card */}
      <div className="bg-bg-surface rounded-none border border-border-base p-8 shadow-sm">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
          <div className="relative shrink-0">
            <div className="w-28 h-28 rounded-none overflow-hidden bg-bg-tertiary flex items-center justify-center border border-border-base">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <span className="font-serif italic text-4xl font-bold text-primary">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={avatarUploading}
              className="absolute -bottom-2 -right-2 w-9 h-9 rounded-none bg-primary border-2 border-bg-surface flex items-center justify-center hover:bg-primary-dark transition-all duration-200 cursor-pointer shadow-sm"
            >
              {avatarUploading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Camera className="w-4 h-4 text-white" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </div>

          <div className="flex-1 min-w-0 text-center md:text-left">
            <AnimatePresence mode="wait">
              {editing ? (
                <motion.div key="editing" variants={scaleIn} initial="initial" animate="animate" exit="exit" transition={springGentle} className="space-y-4">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full px-4 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-wider text-text-primary focus:outline-none focus:border-primary transition-all font-sans" />
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="w-full px-4 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-wider text-text-primary focus:outline-none focus:border-primary transition-all font-sans" />
                  <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell us about yourself…" rows={3} className="w-full px-4 py-3 rounded-none border border-border-base bg-bg-surface text-xs text-text-primary focus:outline-none focus:border-primary transition-all resize-none font-sans" />
                  <div className="flex justify-center md:justify-start gap-3">
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-none bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark disabled:opacity-60 transition-all cursor-pointer">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                    </button>
                    <button onClick={handleCancel} className="flex items-center gap-1.5 px-5 py-2.5 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-widest font-semibold text-text-secondary hover:border-text-secondary transition-all cursor-pointer">
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="viewing" variants={scaleIn} initial="initial" animate="animate" exit="exit" transition={springGentle} className="space-y-3">
                  <div className="flex items-center justify-center md:justify-start gap-3">
                    <h1 className="font-serif italic text-3xl font-medium text-text-primary tracking-tight">{user?.name}</h1>
                    <button onClick={() => setEditing(true)} className="p-1.5 rounded-none text-text-tertiary hover:text-primary hover:bg-primary/5 transition-all cursor-pointer">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="font-mono text-[10px] tracking-widest text-text-secondary uppercase">{user?.email}</p>
                  {user?.phone && <p className="font-mono text-[9px] tracking-widest text-text-tertiary uppercase">{user.phone}</p>}
                  {user?.bio && <p className="text-xs text-text-secondary leading-relaxed max-w-md mx-auto md:mx-0 font-light tracking-wide">{user.bio}</p>}
                  <div className="flex items-center justify-center md:justify-start gap-3 pt-2">
                    <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-none bg-warning/5 border border-warning/20">
                      <Star className="w-3 h-3 text-warning fill-warning" />
                      <span className="text-[10px] font-bold font-mono text-warning">{user?.rating.toFixed(1)}</span>
                    </div>
                    <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-[0.15em] font-sans">Verified Collector Rating</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-bg-surface border border-border-base rounded-none p-1.5 shadow-sm overflow-x-auto">
        {[
          { key: 'bids',           label: 'My Activity',      icon: Gavel },
          { key: 'listings',       label: 'My Listings',      icon: Package },
          { key: 'buyer-insights', label: 'Buyer Insights',   icon: BarChart2 },
          { key: 'watchlist',      label: 'My Watchlist',     icon: Star },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              if (key === 'watchlist') navigate('/watchlist')
              else setTab(key as Tab)
            }}
            className={`flex-1 shrink-0 flex items-center justify-center gap-2 py-3 px-4 rounded-none text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              tab === key ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/20'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">

        {/* Bids Tab */}
        {tab === 'bids' && (
          <motion.div key="bids" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={smooth} className="space-y-6">
            {!bidsLoading && bids.length > 0 && (
              <div className="flex gap-2 p-1 bg-bg-surface border border-border-base rounded-none w-fit shadow-sm">
                {(['all', 'active', 'ended'] as const).map((f) => {
                  const count = f === 'all' ? bids.length : bids.filter(b => b.auction?.status === (f === 'active' ? 'ACTIVE' : 'ENDED')).length
                  return (
                    <button key={f} onClick={() => setBidFilter(f)} className={`flex items-center gap-2 px-3 py-1.5 rounded-none text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${bidFilter === f ? 'bg-bg-tertiary/50 text-text-primary border border-border-base' : 'text-text-tertiary hover:text-text-secondary border border-transparent'}`}>
                      {f}
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-none font-bold font-mono ${bidFilter === f ? 'bg-primary text-white' : 'bg-bg-tertiary text-text-tertiary border border-border-base'}`}>{count}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {bidsLoading ? (
              <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-bg-surface rounded-none border border-border-base animate-pulse" />)}</div>
            ) : bids.length === 0 ? (
              <div className="text-center py-20 bg-bg-surface rounded-none border border-border-base border-dashed">
                <Gavel className="w-8 h-8 text-text-tertiary mx-auto mb-4 opacity-30" />
                <p className="text-xs uppercase font-bold tracking-wider text-text-secondary">No bids placed yet</p>
                <Link to="/search" className="text-[10px] uppercase font-bold tracking-widest text-primary hover:underline mt-2 inline-block">Explore active auctions</Link>
              </div>
            ) : (
              <motion.div layout className="grid grid-cols-1 gap-4">
                <AnimatePresence mode="popLayout">
                  {filteredBids.length === 0 ? (
                    <motion.div layout key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-16 bg-bg-surface rounded-none border border-border-base border-dashed">
                      <p className="text-text-tertiary text-[10px] uppercase font-mono tracking-widest">No {bidFilter} activity found</p>
                    </motion.div>
                  ) : filteredBids.map((bid) => {
                    const auction = bid.auction
                    const currentUserId = user?.id || bid.userId
                    const isWinner = auction?.status === 'ENDED' && auction?.winnerId === currentUserId
                    const isEnded = auction?.status === 'ENDED'
                    const isOutbid = auction?.status === 'ACTIVE' && auction?.currentPrice > bid.amount
                    const isLost = isEnded && !isWinner
                    return (
                      <motion.div layout key={bid.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}>
                        <div className={`group bg-bg-surface rounded-none border transition-all ${isEnded && !isWinner ? 'opacity-70' : 'hover:border-primary/40'} ${isWinner ? 'border-primary/50' : 'border-border-base'} overflow-hidden`}>
                          <div onClick={() => navigate(`/auctions/${bid.auctionId}`)} className="block p-5 cursor-pointer">
                            <div className="flex items-center justify-between gap-6">
                              <div className="min-w-0 flex-1">
                                <h3 className="font-serif italic text-lg font-medium text-text-primary truncate group-hover:text-primary transition-colors tracking-wide">{auction?.title || 'Unknown Auction'}</h3>
                                <div className="flex flex-wrap items-center gap-2.5 mt-2.5">
                                  <span className={`text-[8px] font-bold px-2 py-0.5 rounded-none uppercase tracking-widest ${auction?.status === 'ACTIVE' ? 'bg-primary/5 text-primary border border-primary/20' : 'bg-bg-tertiary text-text-tertiary border border-border-base'}`}>{auction?.status}</span>
                                  {isWinner && <span className="text-[8px] font-bold px-2 py-0.5 rounded-none uppercase tracking-widest bg-primary text-white border border-primary flex items-center gap-1"><Star className="w-2.5 h-2.5 fill-current" /> Winner</span>}
                                  {isOutbid && <span className="text-[8px] font-bold px-2 py-0.5 rounded-none uppercase tracking-widest bg-orange-500/10 text-orange-500 border border-orange-500/20">Outbid</span>}
                                  {isLost && <span className="text-[8px] font-bold px-2 py-0.5 rounded-none uppercase tracking-widest bg-danger/10 text-danger border border-danger/20">Lost</span>}
                                  <span className="text-[10px] font-mono tracking-wider text-text-tertiary">{formatDistanceToNow(new Date(bid.createdAt), { addSuffix: true })}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`font-mono text-lg font-bold tracking-tight ${isEnded ? 'text-text-secondary' : 'text-text-primary'}`}>${bid.amount.toLocaleString()}</p>
                                <p className="text-[9px] font-mono tracking-widest text-text-tertiary uppercase">Your Bid</p>
                              </div>
                            </div>
                          </div>
                          {isWinner && auction.payment?.status !== 'SUCCEEDED' && (
                            <Link to={`/auctions/${bid.auctionId}/pay`} onClick={(e) => e.stopPropagation()} className="flex items-center justify-center gap-2 w-full py-3.5 bg-primary hover:bg-primary-dark text-white text-xs uppercase tracking-widest font-semibold transition-all duration-200">
                              <CreditCard className="w-4 h-4" /> You won! Pay ${auction?.currentPrice?.toLocaleString()} now
                            </Link>
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Listings Tab */}
        {tab === 'listings' && (
          <motion.div key="listings" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={smooth} className="space-y-6">
            {user && <SellerInsightsCard sellerId={user.id} auctionIds={listings.map(a => a.id)} />}
            {listingsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-72 bg-bg-surface border border-border-base rounded-none animate-pulse" />)}</div>
            ) : listings.length === 0 ? (
              <div className="text-center py-20 bg-bg-surface rounded-none border border-border-base border-dashed">
                <Package className="w-8 h-8 text-text-tertiary mx-auto mb-4 opacity-30" />
                <p className="text-xs uppercase font-bold tracking-wider text-text-secondary">No listings yet</p>
                <Link to="/sell" className="text-[10px] uppercase font-bold tracking-widest text-primary hover:underline mt-2 inline-block">Start selling now</Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {listings.map((auction, i) => (
                  <div key={auction.id} onClick={() => navigate(`/auctions/${auction.id}`)} className="cursor-pointer border border-border-base bg-bg-surface p-4 hover:border-primary/40 transition-all">
                    <p className="font-serif italic text-sm font-medium truncate">{auction.title}</p>
                    <p className="font-mono text-xs text-text-tertiary mt-1">${auction.currentPrice?.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Buyer Insights Tab — NEW */}
        {tab === 'buyer-insights' && user && (
          <motion.div key="buyer-insights" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={smooth}>
            <BuyerInsights userId={user.id} />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
