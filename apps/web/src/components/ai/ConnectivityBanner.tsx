/**
 * ConnectivityBanner — shows an offline/reconnecting notice at the top of
 * the page when the browser loses network access.
 * Mirrors the Flutter ConnectivityListener pattern but for the web.
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff, Wifi } from 'lucide-react'

export function ConnectivityBanner() {
  const [status, setStatus] = useState<'online' | 'offline' | 'reconnected'>('online')

  useEffect(() => {
    let reconnectedTimer: ReturnType<typeof setTimeout>

    function onOffline() {
      setStatus('offline')
      if (reconnectedTimer) clearTimeout(reconnectedTimer)
    }

    function onOnline() {
      setStatus('reconnected')
      reconnectedTimer = setTimeout(() => setStatus('online'), 4000)
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online',  onOnline)

    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online',  onOnline)
      if (reconnectedTimer) clearTimeout(reconnectedTimer)
    }
  }, [])

  const show = status !== 'online'

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div
            className={`w-full flex items-center justify-center gap-2 py-2 text-[9px] font-bold uppercase tracking-widest font-mono ${
              status === 'offline'
                ? 'bg-danger text-white'
                : 'bg-primary text-white'
            }`}
          >
            {status === 'offline' ? (
              <>
                <WifiOff className="w-3 h-3" />
                You are offline — bids and AI features paused
              </>
            ) : (
              <>
                <Wifi className="w-3 h-3" />
                Back online — reconnected
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
export default ConnectivityBanner;
