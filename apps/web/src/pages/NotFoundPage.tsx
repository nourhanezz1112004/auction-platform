import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Gavel, Home, Search } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div className="max-w-md mx-auto pt-16 text-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="w-16 h-16 rounded-none border border-primary/20 bg-primary/10 flex items-center justify-center mx-auto mb-5">
          <Gavel className="w-7 h-7 text-primary" />
        </div>
        <h1 className="font-serif italic text-6xl md:text-7xl font-light text-text-primary mb-2">404</h1>
        <p className="text-xs uppercase font-bold tracking-wider text-text-secondary mb-1">Archival record not found</p>
        <p className="text-xs text-text-tertiary font-light tracking-wide mb-8">
          The listing or page index you requested does not exist in our system registry.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            to="/"
            className="flex items-center gap-1.5 px-5 py-3 rounded-none bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark transition-all duration-200 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            Home
          </Link>
          <Link
            to="/search"
            className="flex items-center gap-1.5 px-5 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-widest font-semibold text-text-secondary hover:border-text-secondary transition-all duration-200 cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            Directory
          </Link>
        </div>
      </motion.div>
    </div>
  )
}