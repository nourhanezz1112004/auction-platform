import { motion, AnimatePresence } from 'framer-motion'
import { ShieldX, AlertTriangle, Bot, X } from 'lucide-react'
import type { BidError } from '@/api/bids'

import { modalBackdrop, modalContent, smooth, springGentle } from '@/lib/animations'

type Props = {
  error: BidError | null
  onClose: () => void
}

const errorConfig = {
  bot_detected: {
    icon: Bot,
    title: 'Bot activity detected',
    color: 'text-danger',
    bg: 'bg-danger-light',
    border: 'border-danger/20',
    iconBg: 'bg-danger/10',
  },
  fraud_flagged: {
    icon: ShieldX,
    title: 'Suspicious activity flagged',
    color: 'text-danger',
    bg: 'bg-danger-light',
    border: 'border-danger/20',
    iconBg: 'bg-danger/10',
  },
  captcha_required: {
    icon: AlertTriangle,
    title: 'Verification required',
    color: 'text-warning',
    bg: 'bg-warning-light',
    border: 'border-warning/20',
    iconBg: 'bg-warning/10',
  },
  outbid: {
    icon: AlertTriangle,
    title: 'You have been outbid',
    color: 'text-warning',
    bg: 'bg-warning-light',
    border: 'border-warning/20',
    iconBg: 'bg-warning/10',
  },
  auction_ended: {
    icon: AlertTriangle,
    title: 'Auction has ended',
    color: 'text-text-secondary',
    bg: 'bg-white-tertiary',
    border: 'border-border',
    iconBg: 'bg-white-tertiary',
  },
  self_bidding: {
    icon: AlertTriangle,
    title: 'Cannot bid on your own auction',
    color: 'text-warning',
    bg: 'bg-warning-light',
    border: 'border-warning/20',
    iconBg: 'bg-warning/10',
  },
  account_banned: {
    icon: ShieldX,
    title: 'Account suspended',
    color: 'text-danger',
    bg: 'bg-danger-light',
    border: 'border-danger/20',
    iconBg: 'bg-danger/10',
  },
}

export function FraudAlert({ error, onClose }: Props) {
  if (!error) return null

  const config = errorConfig[error.error] ?? errorConfig.fraud_flagged
  const Icon = config.icon

  return (
    <AnimatePresence>
      {error && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ minHeight: '100vh' }}
        >
          {/* Backdrop */}
          <motion.div
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={smooth}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springGentle}
            className={`relative w-full max-w-sm bg-surface rounded-2xl border shadow-modal overflow-hidden ${config.border}`}
          >
            {/* Top accent bar */}
            <div className={`h-1 w-full ${config.bg}`} />

            <div className="p-6">
              {/* Close */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-text-tertiary hover:bg-white-tertiary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Icon */}
              <div className={`w-12 h-12 rounded-2xl ${config.iconBg} flex items-center justify-center mb-4`}>
                <Icon className={`w-6 h-6 ${config.color}`} />
              </div>

              {/* Title and message */}
              <h3 className={`text-base font-semibold mb-1 ${config.color}`}>
                {config.title}
              </h3>
              <p className="text-sm text-text-secondary mb-4">
                {error.message}
              </p>

              {/* Extra details for fraud */}
              {error.score !== undefined && (
                <div className={`rounded-lg p-3 ${config.bg} border ${config.border} mb-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-text-secondary">AI fraud score</span>
                    <span className={`text-sm font-semibold ${config.color}`}>
                      {Math.round(error.score * 100)}%
                    </span>
                  </div>
                  {error.signals && error.signals.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {error.signals.filter(s => s !== 'service_unavailable').map((signal) => (
                        <span
                          key={signal}
                          className="px-2 py-0.5 rounded-full bg-white border border-danger/20 text-xs text-danger"
                        >
                          {signal.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Confidence for bot */}
              {error.confidence !== undefined && error.error === 'bot_detected' && (
                <div className={`rounded-lg p-3 ${config.bg} border ${config.border} mb-4`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-secondary">Bot confidence</span>
                    <span className={`text-sm font-semibold ${config.color}`}>
                      {Math.round(error.confidence * 100)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Current price for outbid */}
              {error.currentPrice !== undefined && (
                <div className="rounded-lg p-3 bg-white-tertiary border border-border mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-secondary">Current highest bid</span>
                    <span className="text-sm font-semibold text-text-primary">
                      ${error.currentPrice.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {error.error === 'captcha_required' ? (
                <div className="mb-2 mt-2">
                  <div className="flex items-center gap-3 p-4 bg-white border border-border-base rounded-none shadow-sm cursor-pointer hover:border-primary/50 transition-colors" onClick={() => {
                    const cb = document.getElementById('captcha-checkbox') as HTMLInputElement
                    if (cb) cb.checked = !cb.checked
                  }}>
                    <input type="checkbox" id="captcha-checkbox" className="w-5 h-5 accent-primary cursor-pointer pointer-events-none" />
                    <label className="text-sm font-medium text-text-primary cursor-pointer select-none">
                      I am human
                    </label>
                    <div className="ml-auto">
                      <ShieldX className="w-5 h-5 text-text-tertiary opacity-50" />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const checkbox = document.getElementById('captcha-checkbox') as HTMLInputElement
                      if (checkbox?.checked) {
                        onClose()
                      } else {
                        // Just shake or ignore
                        checkbox.parentElement?.classList.add('animate-shake')
                        setTimeout(() => checkbox.parentElement?.classList.remove('animate-shake'), 500)
                      }
                    }}
                    className="w-full mt-4 py-3 rounded-none bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark transition-colors"
                  >
                    Verify
                  </button>
                </div>
              ) : (
                <button
                  onClick={onClose}
                  className="w-full py-2.5 rounded-none bg-white-tertiary text-text-primary text-sm font-medium hover:bg-white-secondary border border-border-base transition-colors"
                >
                  Dismiss
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
