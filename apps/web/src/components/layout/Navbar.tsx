import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Gavel, LogOut, Shield, Search, Plus, Moon, Sun, Heart, 
  ChevronDown, Menu, X, Watch, Camera, Palette, Gem, Laptop 
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { useAuctions } from '@/hooks/useAuctions'
import { logout } from '@/api/auth'
import { NotificationsDropdown } from '@/components/notifications/NotificationsDropdown'
import toast from 'react-hot-toast'

const CATEGORIES_CONFIG = [
  { name: 'Watches', path: '/search?category=watches', icon: Watch, desc: 'Chronographs, luxury & vintage pieces' },
  { name: 'Cameras', path: '/search?category=cameras', icon: Camera, desc: 'Analog rangefinders & vintage glass' },
  { name: 'Art', path: '/search?category=art', icon: Palette, desc: 'Original prints, paintings & sculptures' },
  { name: 'Jewellery', path: '/search?category=jewellery', icon: Gem, desc: 'Art Deco rings & precious stones' },
  { name: 'Electronics', path: '/search?category=electronics', icon: Laptop, desc: 'Hi-Fi audio & archival technology' }
]

import { dropdown, snappy } from '@/lib/animations'

export function Navbar() {
  const { isAuthenticated, user, logout: clearAuth } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const { data: activeAuctionsData } = useAuctions({ status: 'ACTIVE', limit: 1 })
  const activeCount = activeAuctionsData?.total ?? 0

  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [collectionsOpen, setCollectionsOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileCollectionsOpen, setMobileCollectionsOpen] = useState(false)
  const collectionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (collectionsRef.current && !collectionsRef.current.contains(event.target as Node)) {
        setCollectionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Scroll Lock when Mobile Menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileMenuOpen])

  async function handleLogout() {
    try {
      await logout()
    } catch {
      // silent
    } finally {
      clearAuth()
      setMobileMenuOpen(false)
      navigate('/login')
      toast.success('Signed out')
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('')
      setMobileMenuOpen(false)
    } else {
      navigate('/search')
    }
  }

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault()
    setMobileMenuOpen(false)
    if (window.location.pathname !== '/') {
      navigate(`/${targetId}`)
    } else {
      const element = document.getElementById(targetId.replace('#', ''))
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-bg-surface/90 backdrop-blur-md border-b border-border-base transition-colors">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link
            to="/"
            onClick={() => { if (window.location.pathname === '/') window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            className="flex items-baseline gap-2 group shrink-0 select-none"
          >
            <span className="font-serif italic text-2xl font-bold tracking-tight text-text-primary transition-colors group-hover:text-primary">
              BidSpace
            </span>
            <span className="text-xl font-bold text-primary font-serif italic tracking-wide" style={{ fontFamily: 'Amiri, serif' }}>
              مزاد
            </span>
          </Link>

          {/* Nav Links - Center (Desktop) */}
          <div className="hidden lg:flex items-center gap-8 text-[12px] uppercase tracking-widest font-semibold text-text-secondary">
            <Link to="/search" className="hover:text-primary transition-all duration-200">
              Auctions
            </Link>

            {/* Collections Dropdown Anchor */}
            <div 
              ref={collectionsRef}
              className="relative py-4"
              onMouseEnter={() => setCollectionsOpen(true)}
              onMouseLeave={() => setCollectionsOpen(false)}
            >
              <button 
                onClick={() => setCollectionsOpen(!collectionsOpen)}
                className="flex items-center gap-1 hover:text-primary transition-all duration-200 cursor-pointer uppercase text-[12px] font-semibold tracking-widest"
              >
                Collections
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${collectionsOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {collectionsOpen && (
                  <motion.div
                    variants={dropdown}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={snappy}
                    className="absolute left-1/2 -translate-x-1/2 top-full w-80 bg-bg-surface border border-border-base shadow-elevated p-4 grid grid-cols-1 gap-2 rounded-none z-50"
                  >
                    <div className="border-b border-border-base pb-2 mb-1">
                      <span className="text-[9px] font-mono tracking-widest uppercase text-text-tertiary">Curated Archives</span>
                    </div>
                    {CATEGORIES_CONFIG.map((cat) => (
                      <Link
                        key={cat.name}
                        to={cat.path}
                        onClick={() => setCollectionsOpen(false)}
                        className="flex items-start gap-3 p-2 hover:bg-bg-tertiary transition-all duration-150 rounded-none group/item"
                      >
                        <div className="w-8 h-8 bg-primary/5 text-primary border border-primary/10 flex items-center justify-center rounded-none group-hover/item:bg-primary group-hover/item:text-white transition-all shrink-0 mt-0.5">
                          <cat.icon className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold text-text-primary uppercase tracking-wider group-hover/item:text-primary transition-colors">{cat.name}</p>
                          <p className="text-[10px] text-text-tertiary font-light mt-0.5 leading-tight">{cat.desc}</p>
                        </div>
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <a 
              href="#provenance" 
              onClick={(e) => handleNavClick(e, '#provenance')}
              className="hover:text-primary transition-all duration-200"
            >
              Provenance
            </a>
            <a 
              href="#how-it-works" 
              onClick={(e) => handleNavClick(e, '#how-it-works')}
              className="hover:text-primary transition-all duration-200"
            >
              How it works
            </a>
          </div>

          {/* Right side Actions */}
          <div className="flex items-center gap-1">
            
            {/* Live Indicator (Desktop) */}
            {activeCount > 0 && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 text-primary text-[10px] font-bold tracking-wider uppercase border border-primary/10 mr-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                LIVE <span className="text-text-tertiary font-normal">•</span> {activeCount}
              </div>
            )}

            {/* Expandable Search bar (Desktop) */}
            <div className="hidden md:block mr-1">
              <form 
                onSubmit={handleSearchSubmit}
                className="relative flex items-center"
              >
                <Search className="absolute left-3 w-3.5 h-3.5 text-text-tertiary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-24 focus:w-36 pl-8 pr-3 py-1 rounded-full border border-border-base bg-bg-tertiary text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary focus:bg-bg-surface transition-all duration-300"
                />
              </form>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg text-text-secondary hover:bg-bg-tertiary transition-colors"
              aria-label="Toggle theme"
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={theme}
                  initial={{ opacity: 0, rotate: -90, scale: 0.8 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 90, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: 'flex' }}
                >
                  {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </motion.span>
              </AnimatePresence>
            </button>

            {/* Mobile Notification Bell */}
            {isAuthenticated && (
              <div className="lg:hidden flex items-center">
                <NotificationsDropdown />
              </div>
            )}

            <div className="w-px h-5 bg-border-base mx-0.5" />

            {/* Desktop Authed Actions */}
            <div className="hidden lg:flex items-center gap-1">
              {isAuthenticated ? (
                <>
                  {user?.isAdmin && (
                    <Link
                      to="/admin"
                      title="Admin Console"
                      className="p-1.5 rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-primary transition-colors"
                    >
                      <Shield className="w-4 h-4" />
                    </Link>
                  )}
                  <Link
                    to="/sell"
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-primary hover:bg-primary-light transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Sell</span>
                  </Link>
                  <Link
                    to="/watchlist"
                    title="Watchlist"
                    className="p-1.5 rounded-lg text-text-secondary hover:bg-bg-tertiary transition-colors"
                  >
                    <Heart className="w-4 h-4" />
                  </Link>
                  <NotificationsDropdown />
                  <Link
                    to="/profile"
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:bg-bg-tertiary transition-colors"
                  >
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.name}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-primary-light flex items-center justify-center">
                        <span className="text-[9px] font-bold text-primary-dark">
                          {user?.name?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <span className="max-w-[60px] truncate">{user?.name?.split(' ')[0]}</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    title="Sign out"
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-2.5 py-1.5 text-xs font-bold uppercase tracking-widest text-text-secondary hover:text-primary transition-colors"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/register"
                    className="px-3 py-2 rounded-none border border-primary/30 text-xs font-bold uppercase tracking-widest text-primary hover:bg-primary hover:text-white transition-all duration-300"
                  >
                    Start bidding
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 rounded-lg text-text-secondary hover:bg-bg-tertiary transition-colors ml-1"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 top-16 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className="fixed inset-x-0 top-16 z-50 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-border-base bg-bg-surface lg:hidden shadow-elevated"
            >
              <div className="px-4 pt-4 pb-6 space-y-4 font-sans text-xs uppercase tracking-widest font-semibold">
                
                {/* Mobile Search */}
                <form onSubmit={handleSearchSubmit} className="relative flex items-center mb-2">
                  <Search className="absolute left-3 w-4 h-4 text-text-tertiary" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search collections..."
                    className="w-full pl-10 pr-3 py-2.5 rounded-none border border-border-base bg-bg-tertiary text-text-primary text-xs focus:outline-none focus:border-primary transition-all"
                  />
                </form>

                {/* Direct links */}
                <Link
                  to="/search"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2 border-b border-border-base/50 text-text-secondary hover:text-primary"
                >
                  Auctions
                </Link>

                {/* Mobile Collections Sub-Accordion */}
                <div>
                  <button
                    onClick={() => setMobileCollectionsOpen(!mobileCollectionsOpen)}
                    className="w-full flex items-center justify-between py-2 border-b border-border-base/50 text-text-secondary hover:text-primary text-left uppercase text-xs font-semibold tracking-widest"
                  >
                    <span>Collections</span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${mobileCollectionsOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {mobileCollectionsOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden pl-4 py-2 space-y-2.5 bg-bg-tertiary/10 border-l border-border-base mt-1"
                      >
                        {CATEGORIES_CONFIG.map((cat) => (
                          <Link
                            key={cat.name}
                            to={cat.path}
                            onClick={() => {
                              setMobileMenuOpen(false)
                              setMobileCollectionsOpen(false)
                            }}
                            className="flex items-center gap-2.5 py-1 text-[11px] text-text-secondary hover:text-primary uppercase tracking-widest font-medium"
                          >
                            <cat.icon className="w-3.5 h-3.5 text-primary" />
                            {cat.name}
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <a 
                  href="#provenance" 
                  onClick={(e) => handleNavClick(e, '#provenance')}
                  className="block py-2 border-b border-border-base/50 text-text-secondary hover:text-primary"
                >
                  Provenance
                </a>
                <a 
                  href="#how-it-works" 
                  onClick={(e) => handleNavClick(e, '#how-it-works')}
                  className="block py-2 border-b border-border-base/50 text-text-secondary hover:text-primary"
                >
                  How it works
                </a>

                {/* Actions */}
                <div className="pt-4 border-t border-border-base flex flex-col gap-3">
                  {isAuthenticated ? (
                    <>
                      <Link
                        to="/profile"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-2.5 py-1 text-text-primary hover:text-primary transition-colors cursor-pointer"
                      >
                        {user?.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt={user.name}
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-primary-light flex items-center justify-center">
                            <span className="text-[10px] font-bold text-primary-dark">
                              {user?.name?.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <span className="text-xs font-bold tracking-wider">{user?.name}</span>
                      </Link>

                      {user?.isAdmin && (
                        <Link
                          to="/admin"
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center gap-2 py-2 text-text-secondary hover:text-primary"
                        >
                          <Shield className="w-4 h-4" /> Admin Console
                        </Link>
                      )}
                      <Link
                        to="/sell"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-2 py-2 text-primary hover:text-primary-dark"
                      >
                        <Plus className="w-4 h-4" /> Create Listing
                      </Link>
                      <Link
                        to="/watchlist"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-2 py-2 text-text-secondary hover:text-primary"
                      >
                        <Heart className="w-4 h-4" /> Watchlist
                      </Link>
                      <Link
                        to="/profile"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-2 py-2 text-text-secondary hover:text-primary"
                      >
                        Profile Settings
                      </Link>

                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 py-2 text-red-500 hover:text-red-600 text-left font-bold"
                      >
                        <LogOut className="w-4 h-4" /> Log out
                      </button>
                    </>
                  ) : (
                    <div className="flex gap-2 w-full">
                      <Link
                        to="/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex-1 text-center py-2.5 bg-bg-tertiary text-text-secondary hover:text-primary border border-border-base tracking-widest font-bold"
                      >
                        Sign in
                      </Link>
                      <Link
                        to="/register"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex-1 text-center py-2.5 bg-primary text-white hover:bg-primary-dark border border-primary/20 tracking-widest font-bold"
                      >
                        Start Bidding
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  )
}