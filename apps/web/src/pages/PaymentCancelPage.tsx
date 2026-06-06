import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { XCircle, RotateCcw, Home } from 'lucide-react'

export function PaymentCancelPage() {
  const { id } = useParams<{ id?: string }>()

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-bg-surface rounded-none border border-border-base p-8 text-center shadow-sm"
      >
        <div className="w-16 h-16 rounded-none border border-danger/20 bg-danger-light flex items-center justify-center mx-auto mb-5">
          <XCircle className="w-7 h-7 text-danger" />
        </div>

        <h1 className="font-serif italic text-2xl font-medium text-text-primary mb-2">Payment Cancelled</h1>
        <p className="text-xs text-text-secondary leading-relaxed font-light tracking-wide mb-6">
          Your secure transaction was cancelled. No charges were made. You may authorize checkout again when ready.
        </p>

        <div className="flex gap-3">
          <Link
            to="/"
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-widest font-semibold text-text-secondary hover:border-text-secondary transition-all duration-200 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            Directory
          </Link>
          {id && (
            <Link
              to={`/auctions/${id}/pay`}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-none bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark transition-all duration-200 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Try Again
            </Link>
          )}
        </div>
      </motion.div>
    </div>
  )
}