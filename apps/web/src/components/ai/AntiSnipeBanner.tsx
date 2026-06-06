/**
 * AntiSnipeBanner — appears when socket emits auction:extended.
 * Reads timeExtended from useAuctionSocket's bid:new events via a callback.
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Timer } from 'lucide-react'
import { useSocketStore } from '@/store/socketStore'

interface Props {
  auctionId: string
}

export function AntiSnipeBanner({ auctionId }: Props) {
  const { socket } = useSocketStore()
  const [visible, setVisible] = useState(false)
  const [newEndsAt, setNewEndsAt] = useState<string | null>(null)

  useEffect(() => {
    if (!socket) return

    function onBidNew(payload: { timeExtended: boolean }) {
      if (payload.timeExtended) {
        setVisible(true)
        // Auto-dismiss after 8 seconds
        setTimeout(() => setVisible(false), 8000)
      }
    }

    function onExtended(payload: { auctionId: string; newEndsAt: string }) {
      if (payload.auctionId === auctionId) {
        setNewEndsAt(payload.newEndsAt)
        setVisible(true)
        setTimeout(() => setVisible(false), 8000)
      }
    }

    socket.on('bid:new',          onBidNew)
    socket.on('auction:extended', onExtended)

    return () => {
      socket.off('bid:new',          onBidNew)
      socket.off('auction:extended', onExtended)
    }
  }, [socket, auctionId])

  const timeStr = newEndsAt
    ? new Date(newEndsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-purple-600/10 to-indigo-600/10 border border-purple-500/25 rounded-none"
        >
          <Timer className="w-3.5 h-3.5 text-purple-600 shrink-0 animate-pulse" />
          <div className="flex-1">
            <p className="text-[9px] font-bold uppercase tracking-widest font-mono text-purple-700">
              Anti-Snipe Extension — +2 minutes added
            </p>
            {timeStr && (
              <p className="text-[8px] font-mono text-text-tertiary mt-0.5">
                New end time: {timeStr}
              </p>
            )}
          </div>
          <button
            onClick={() => setVisible(false)}
            className="text-text-tertiary hover:text-text-secondary transition-colors text-xs leading-none cursor-pointer"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
export default AntiSnipeBanner;
