import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search, TrendingUp, Shield, Zap, ChevronRight, ChevronLeft, Star, Gavel, Package,
  UserPlus, MousePointer2, Trophy, Clock, Globe, ArrowRight, ShieldCheck, Loader2
} from 'lucide-react'
import { useAuctions, useRecommendations } from '@/hooks/useAuctions'
import { AuctionCard } from '@/components/auction/AuctionCard'
import { RecommendedList } from '@/components/auction/RecommendedList'
import { useAuthStore } from '@/store/authStore'

const CATEGORIES = ['All', 'Watches', 'Cameras', 'Art', 'Jewellery', 'Electronics']

// Custom ticking countdown component for the Featured Card
function FeaturedCountdown({ endsAt }: { endsAt: string }) {
  const calculate = () => {
    const diff = new Date(endsAt).getTime() - new Date().getTime()
    if (diff <= 0) return '00:00:00'
    const hrs = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff / (1000 * 60)) % 60)
    const secs = Math.floor((diff / 1000) % 60)
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const [time, setTime] = useState(calculate())

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(calculate())
    }, 1000)
    return () => clearInterval(timer)
  }, [endsAt])

  return (
    <span className="font-mono tabular-nums text-2xl md:text-3xl font-semibold tracking-widest text-primary flex items-center gap-3">
      <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
      {time}
    </span>
  )
}

export function HomePage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [isNavigating, setIsNavigating] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const limit = isMobile ? 6 : 12

  // Scroll to hash on mount (in case navigating from other pages)
  useEffect(() => {
    const hash = window.location.hash
    if (hash) {
      setTimeout(() => {
        const element = document.getElementById(hash.replace('#', ''))
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' })
        }
      }, 150)
    }
  }, [])

  const { data, isLoading } = useAuctions({
    status: 'ACTIVE',
    category: activeCategory === 'All' ? undefined : activeCategory.toLowerCase(),
    limit,
    page,
  })

  const { data: endedAuctionsData } = useAuctions({
    status: 'ENDED',
    limit: 8,
  })
  const endedAuctions = endedAuctionsData?.auctions || []

  const { data: recommendations } = useRecommendations(user?.id)

  const auctions = data?.auctions ?? []
  const hasRecommendations = recommendations && recommendations.length > 0

  // Featured Lot logic - Pulls live first active auction or falls back to Leica M3 rangefinder mockup
  const featured = auctions[0]

  const fallbackFeatured = {
    id: "0047",
    title: "Leica M3 \"Double Stroke\"",
    description: "Cairo circa 1954 - Rare Serial Range",
    currentPrice: 4200,
    endsAt: new Date(Date.now() + 8 * 3600000).toISOString(),
    biddersActive: 14,
    highestBidder: "USER_902",
    imageUrl: "/leica_m3_featured.png"
  }

  const featuredId = featured ? `LOT 00${featured.id.slice(-2).toUpperCase()}` : `LOT ${fallbackFeatured.id}`
  const featuredTitle = featured ? featured.title : fallbackFeatured.title
  const featuredSub = featured ? (featured.description || "Fine vintage collectible") : fallbackFeatured.description
  const featuredPrice = featured ? featured.currentPrice : fallbackFeatured.currentPrice
  const featuredEndsAt = featured ? featured.endsAt : fallbackFeatured.endsAt
  const featuredImage = featured ? (featured.imageUrls?.[0] || fallbackFeatured.imageUrl) : fallbackFeatured.imageUrl
  const featuredBidders = featured ? (featured._count?.bids || 0) + 6 : fallbackFeatured.biddersActive
  const featuredHighest = featured ? `USER_${(featured._count?.bids || 902) * 11 + 800}` : fallbackFeatured.highestBidder
  const featuredUrl = featured ? `/auctions/${featured.id}` : "/search"

  return (
    <div className="space-y-20 pb-20">

      {/* Hero Header Section */}
      <section className="text-center pt-8 max-w-5xl mx-auto px-4">
        <div className="font-sans text-[10px] md:text-xs tracking-[0.25em] uppercase text-text-tertiary flex items-center justify-center gap-1.5 mb-4">
          <span>◆</span> Cairo, Egypt <span>•</span> EST. 2026 <span>•</span> MENA'S RARE AUCTION HOUSE
        </div>

        <h1 className="font-serif italic text-4xl sm:text-5xl md:text-7xl text-text-primary leading-[1.1] tracking-normal mb-8 block text-center">
          Where rare things <br className="hidden md:inline" /> find their place.
        </h1>

        <p className="font-sans text-xs md:text-sm text-text-secondary tracking-wide max-w-lg mx-auto mb-10 leading-relaxed font-light">
          A curated digital sanctuary for objects of historical significance and enduring value.
        </p>

        {/* Premium Geometric Search */}
        <div className="max-w-md mx-auto px-4 mb-16">
          <div className="flex items-center gap-2 bg-bg-surface p-1 rounded-none border border-border-base focus-within:border-primary/60 transition-all shadow-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchInput.trim()) {
                    setIsNavigating(true)
                    setTimeout(() => navigate(`/search?q=${encodeURIComponent(searchInput)}`), 150)
                  }
                }}
                placeholder="Search rare collections..."
                className="w-full pl-10 pr-3 py-2 bg-transparent text-text-primary text-xs uppercase tracking-wider focus:outline-none placeholder:text-text-tertiary font-sans"
              />
            </div>
            <button
              onClick={() => {
                setIsNavigating(true)
                setTimeout(() => navigate(searchInput.trim() ? `/search?q=${encodeURIComponent(searchInput)}` : '/search'), 150)
              }}
              disabled={isNavigating}
              className="px-6 py-2 bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark transition-all duration-200 flex items-center justify-center min-w-[100px]"
            >
              {isNavigating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
            </button>
          </div>
        </div>
      </section>

      {/* Featured Lot Split Panel */}
      <section className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden rounded-none border border-border-base bg-bg-surface shadow-sm relative group">
          {/* Subtle gold brand border indicator */}
          <div className="absolute top-0 left-0 w-full h-[4px] bg-primary/95" />

          {/* Left - Image Container */}
          <div className="lg:col-span-7 relative aspect-[4/3] lg:aspect-auto min-h-[320px] lg:h-[500px] bg-bg-tertiary overflow-hidden border-b lg:border-b-0 lg:border-r border-border-base">
            {/* Egyptian Border Motif Accent overlay */}
            <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-white/40 z-10 pointer-events-none" />
            <div className="absolute top-4 right-4 w-4 h-4 border-t border-r border-white/40 z-10 pointer-events-none" />
            <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-white/40 z-10 pointer-events-none" />
            <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-white/40 z-10 pointer-events-none" />

            <img
              src={featuredImage}
              alt={featuredTitle}
              className="w-full h-full object-cover transition-transform duration-700 hover:scale-[1.01]"
            />
          </div>

          {/* Right - Bidding Details Container */}
          <div className="lg:col-span-5 p-8 md:p-12 flex flex-col justify-between bg-bg-tertiary/20 relative">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="font-sans text-[10px] font-semibold tracking-widest text-text-tertiary uppercase">
                  {featuredId}
                </div>
                <div className="text-sm md:text-base text-primary font-bold tracking-wider font-serif" style={{ fontFamily: 'Amiri, serif' }}>
                  اللوحة الفريدة المميزة
                </div>
              </div>
              <h2 className="font-serif italic text-3xl md:text-5xl text-text-primary mb-3 leading-tight font-medium">
                {featuredTitle}
              </h2>
              <p className="font-serif text-sm text-text-secondary italic mb-8 font-light max-w-sm">
                {featuredSub}
              </p>
            </div>

            <div>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-6 border-t border-border-base pt-6 mb-8">
                <div>
                  <span className="block font-sans text-[10px] font-bold tracking-widest text-text-tertiary uppercase mb-2">
                    Current Bid
                  </span>
                  <span className="font-sans text-2xl md:text-3xl font-semibold tracking-tight text-primary">
                    ${featuredPrice.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="block font-sans text-[10px] font-bold tracking-widest text-text-tertiary uppercase mb-2">
                    Time Remaining
                  </span>
                  <FeaturedCountdown endsAt={featuredEndsAt} />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <Link
                  to={featuredUrl}
                  className="flex-1 text-center bg-primary text-white text-xs font-bold uppercase tracking-widest py-3.5 hover:bg-primary-dark transition-all duration-200"
                >
                  Place bid
                </Link>
                <Link
                  to={featuredUrl}
                  className="flex-1 text-center border border-border-strong text-text-primary text-xs font-bold uppercase tracking-widest py-3.5 hover:bg-bg-tertiary transition-all duration-200"
                >
                  View lot
                </Link>
              </div>

              {/* Bottom Bid Info */}
              <div className="flex items-center justify-between border-t border-border-base/50 pt-4 font-mono text-[9px] text-text-tertiary tracking-wider uppercase">
                <div>{featuredBidders} Bidders Active</div>
                <div>Last Bid: Anonymous Bidder</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cairo Heritage Registry & Stats Stats Banner (NEW SECTION) */}
      <section className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="bg-bg-surface border border-border-base p-8 md:p-12 relative overflow-hidden shadow-sm">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(36,91,69,0.06),transparent)] pointer-events-none" />

          {/* Subtle Arabesque Motif corners */}
          <div className="absolute top-3 left-3 w-4 h-4 border-t border-l border-primary/20" />
          <div className="absolute top-3 right-3 w-4 h-4 border-t border-r border-primary/20" />
          <div className="absolute bottom-3 left-3 w-4 h-4 border-b border-l border-primary/20" />
          <div className="absolute bottom-3 right-3 w-4 h-4 border-b border-r border-primary/20" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 relative z-10">
            {[
              { num: "$14.2M+", ar: "إجمالي التداولات", label: "Curated Acquisitions", desc: "Successful historical global transactions verified by secure escrow." },
              { num: "0ms", ar: "زمن استجابة فوري", label: "Synchronization Latency", desc: "State-of-the-art WebSockets powering rapid micro-second real-time bidding." },
              { num: "100%", ar: "حماية عصبية مدعومة بالذكاء الاصطناعي", label: "Neural Shielding", desc: "Anti-shill bidding algorithms continuously scanning active lot histories." },
              { num: " Cairo, EG", ar: "تأسست في القاهرة", label: "Historical Registry", desc: "Connecting heritage MENA collectors with a prestigious global collector network." }
            ].map((stat, i) => (
              <div key={i} className="text-left space-y-2">
                <span className="block font-sans text-2xl md:text-3xl font-semibold tracking-tight text-primary">{stat.num}</span>
                <span className="block text-xs md:text-sm text-primary font-bold tracking-wider" style={{ fontFamily: 'Amiri, serif' }}>{stat.ar}</span>
                <h4 className="font-serif italic text-sm text-text-primary font-medium">{stat.label}</h4>
                <p className="text-text-secondary text-[10px] leading-relaxed font-light">{stat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Curated Heritage Departments Grid (NEW SECTION) */}
      <section className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="font-serif text-base text-primary mb-2 uppercase tracking-widest font-semibold" style={{ fontFamily: 'Amiri, serif' }}>
            أقسام دار المزاد &bull; Specialized Departments
          </div>
          <h2 className="font-serif italic text-3xl md:text-5xl text-text-primary font-medium">Explore by Department</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { name: "Fine Watches", ar: "ساعات فاخرة ورائعة", desc: "Archival horology and vintage chronographs of unparalleled lineage.", link: "/search?category=watches" },
            { name: "Vintage Glass", ar: "كاميرات نادرة وأثرية", desc: "Rare analog camera equipment, classic rangefinders and premium lenses.", link: "/search?category=cameras" },
            { name: "Original Fine Art", ar: "فنون تشكيلية ولوحات", desc: "Curated contemporary paintings, lithographs, and classic Middle Eastern art.", link: "/search?category=art" },
            { name: "Hi-Fi & Archival", ar: "أجهزة صوتية وإلكترونيات", desc: "Archival audio, premium solid-state vintage electronics and systems.", link: "/search?category=electronics" }
          ].map((dept, i) => (
            <Link key={i} to={dept.link} className="group relative block bg-bg-surface border border-border-base p-6 hover:border-primary transition-all duration-300 shadow-sm hover:shadow-md">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-primary scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              <h3 className="font-serif italic text-lg text-text-primary group-hover:text-primary transition-colors font-medium">{dept.name}</h3>
              <span className="block text-sm text-primary font-bold my-1 tracking-wide" style={{ fontFamily: 'Amiri, serif' }}>{dept.ar}</span>
              <p className="text-text-primary text-[11px] leading-relaxed mt-3 font-medium tracking-wide">{dept.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Infinite Recently Sold Marquee */}
      <section className="w-full overflow-hidden border-y border-border-base py-3 bg-bg-surface relative">
        <div className="flex items-center max-w-7xl mx-auto">
          <div className="shrink-0 pl-4 pr-6 border-r border-border-strong text-[9px] font-bold uppercase tracking-widest text-text-primary bg-bg-surface z-10 font-sans">
            Recently Sold
          </div>
          <div className="relative w-full overflow-hidden">
            <div className={`w-max flex shrink-0 gap-16 whitespace-nowrap text-[10px] font-mono tracking-widest text-text-secondary ${endedAuctions.length > 0 ? 'animate-marquee' : ''}`}>
              {endedAuctions.length > 0 ? (
                <>
                  {endedAuctions.map(auction => (
                    <span key={auction.id}>Lot #{auction.id.slice(-4).toUpperCase()}: {auction.title} &mdash; Sold for <strong className="text-text-primary">${auction.currentPrice.toLocaleString()}</strong></span>
                  ))}
                  {/* Duplicate for seamless looping */}
                  {endedAuctions.map(auction => (
                    <span key={`${auction.id}-dup`}>Lot #{auction.id.slice(-4).toUpperCase()}: {auction.title} &mdash; Sold for <strong className="text-text-primary">${auction.currentPrice.toLocaleString()}</strong></span>
                  ))}
                </>
              ) : (
                <span className="italic text-text-tertiary px-8">The archives are currently being curated... Check back soon for recently sold lots.</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="provenance" className="grid grid-cols-1 md:grid-cols-3 gap-8 px-4 max-w-7xl mx-auto scroll-mt-20">
        {[
          {
            icon: ShieldCheck,
            title: "AI-Secured Bidding",
            desc: "Our neural networks detect and block fraudulent bidding patterns in real-time."
          },
          {
            icon: Globe,
            title: "Global Authenticity",
            desc: "Every listing is verified by our network of category experts across the globe."
          },
          {
            icon: Clock,
            title: "Live Synchronization",
            desc: "Experience zero-latency bidding with our real-time synchronization engine."
          }
        ].map((feat, i) => (
          <div key={i} className="group p-8 bg-bg-surface border border-border-base rounded-none hover:border-primary/30 transition-all duration-300">
            <div className="w-10 h-10 rounded-none bg-primary/5 text-primary flex items-center justify-center mb-6 border border-primary/10">
              <feat.icon className="w-4 h-4" />
            </div>
            <h3 className="font-serif italic text-xl text-text-primary mb-3 font-medium">{feat.title}</h3>
            <p className="text-text-secondary leading-relaxed text-[11px] font-light tracking-wide">{feat.desc}</p>
          </div>
        ))}
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="px-4 max-w-7xl mx-auto scroll-mt-20">
        <div className="bg-bg-surface border border-border-base rounded-none p-12 md:p-20 relative">
          <div className="relative z-10">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="font-serif italic text-3xl md:text-5xl text-text-primary mb-4 font-medium">Master the Auction</h2>
              <p className="text-text-secondary text-[10px] uppercase tracking-[0.2em] font-semibold">Join thousands of collectors in three simple steps.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              {[
                {
                  icon: UserPlus,
                  step: "01",
                  title: "Create Account",
                  desc: "Join the community and get verified to start your journey."
                },
                {
                  icon: MousePointer2,
                  step: "02",
                  title: "Place Bids",
                  desc: "Find your treasure and use our real-time engine to stay ahead."
                },
                {
                  icon: Trophy,
                  step: "03",
                  title: "Win & Collect",
                  desc: "Complete your payment securely and receive your item."
                }
              ].map((step, i) => (
                <div key={i} className="relative text-left">
                  <div className="text-6xl font-serif italic text-primary/10 absolute -top-8 -left-2 z-0">{step.step}</div>
                  <div className="relative z-10">
                    <div className="w-12 h-12 rounded-none bg-primary/5 flex items-center justify-center mb-6 border border-primary/10">
                      <step.icon className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="font-serif italic text-xl text-text-primary mb-3 font-medium">{step.title}</h3>
                    <p className="text-text-primary text-xs font-medium tracking-wide leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <RecommendedList recommendations={recommendations || []} />

      {/* Live Auctions Grid Header */}
      <div className="pt-10 border-t border-border-base max-w-7xl mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 border-b border-border-base pb-6">
          <div>
            <h2 className="font-serif italic text-3xl md:text-4xl text-text-primary mb-4 font-medium">Live Auctions</h2>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat)
                    setPage(1)
                  }}
                  className={`shrink-0 px-4 py-1.5 rounded-none text-xs font-bold uppercase tracking-wider transition-all border ${activeCategory === cat
                      ? 'bg-primary border-primary text-white'
                      : 'bg-bg-surface border-border-base text-text-secondary hover:border-text-secondary'
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <Link
            to="/search"
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary hover:text-primary-dark transition-all group"
          >
            Explore all listings <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-bg-surface rounded-none border border-border-base h-72 animate-pulse" />
            ))}
          </div>
        ) : auctions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {auctions.map((auction, i) => (
              <AuctionCard key={auction.id} auction={auction} index={i} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-bg-surface rounded-none border border-border-base border-dashed">
            <Package className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
            <p className="text-text-secondary text-xs uppercase tracking-wider font-semibold">No active auctions in {activeCategory}</p>
            <button
              onClick={() => setActiveCategory('All')}
              className="mt-4 text-xs font-bold text-primary uppercase tracking-wider hover:underline"
            >
              Reset filters
            </button>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1.5 px-4 py-2 rounded-none border border-border-base text-xs font-bold uppercase tracking-wider text-text-secondary hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.ceil(data.total / limit) }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === Math.ceil(data.total / limit) || Math.abs(p - page) <= 1)
              .reduce<(number | string)[]>((acc, p, idx, arr) => {
                if (idx > 0 && (arr[idx - 1] as number) + 1 !== p) acc.push('...')
                acc.push(p)
                return acc
              }, [])
              .map((p, i) =>
                p === '...' ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-text-tertiary text-sm">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`w-9 h-9 rounded-none text-xs font-bold transition-all ${page === p
                        ? 'bg-primary border border-primary text-white'
                        : 'text-text-secondary hover:bg-bg-tertiary border border-border-base'
                      }`}
                  >
                    {p}
                  </button>
                )
              )}
          </div>

          <button
            onClick={() => setPage((p) => Math.min(Math.ceil(data.total / limit), p + 1))}
            disabled={page >= Math.ceil(data.total / limit)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-none border border-border-base text-xs font-bold uppercase tracking-wider text-text-secondary hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {data && data.total > 0 && (
        <p className="text-center font-mono text-[10px] text-text-tertiary tracking-wider uppercase mt-3">
          Showing {(page - 1) * 12 + 1}–{Math.min(page * 12, data.total)} of {data.total} auctions
        </p>
      )}

      {/* Redesigned Premium CTA */}
      <section className="px-4 max-w-7xl mx-auto">
        <div className="relative rounded-none overflow-hidden border-2 border-primary/20 bg-bg-surface p-12 md:p-24 text-center shadow-lg group">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

          {/* Egyptian Geometric Motif Accent Corners */}
          <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-primary/30" />
          <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-primary/30" />
          <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-primary/30" />
          <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-primary/30" />

          <div className="relative z-10 max-w-3xl mx-auto space-y-6">
            <div className="font-sans text-[10px] md:text-xs tracking-[0.3em] uppercase text-primary/80 font-bold">
              ◆ Provenance & Partnership ◆
            </div>

            <h2 className="font-serif italic text-3xl md:text-5xl text-text-primary leading-tight font-medium">
              Possess an Object of Distinction?
            </h2>

            {/* Beautiful Arabic Elegant Accent */}
            <div className="font-serif text-3xl md:text-4xl text-primary font-bold select-none my-5 tracking-wide leading-relaxed" style={{ fontFamily: 'Amiri, serif' }}>
              هل تمتلك قطعة نادرة ذات قيمة تاريخية؟
            </div>

            <p className="text-text-secondary text-xs md:text-sm tracking-wide leading-relaxed max-w-lg mx-auto font-light">
              Entrust your masterpieces to MENA's premier curated digital auction house. Connect directly with verified global collectors, supported by real-time neural fraud protection and zero-latency transaction verification.
            </p>

            <div className="pt-6">
              <Link
                to="/sell"
                className="relative inline-flex items-center justify-center px-10 py-4 bg-primary text-white text-xs uppercase tracking-widest font-bold hover:bg-primary-dark transition-all duration-300 shadow-md group-hover:scale-[1.01]"
              >
                Consign Your Collection
              </Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
