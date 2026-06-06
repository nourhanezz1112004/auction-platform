import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Check, Gavel, Trophy, Tag, ShieldAlert, Info, X } from 'lucide-react'
import { useNotifications, useUnreadCount, useMarkAllRead, useMarkOneRead } from '@/hooks/useNotifications'
import { formatDistanceToNow } from 'date-fns'
import type { Notification } from '@/api/notifications'
import { useNavigate } from 'react-router-dom'

const typeConfig = {
  outbid: { icon: Gavel, color: 'text-warning', bg: 'bg-warning-light' },
  won: { icon: Trophy, color: 'text-success', bg: 'bg-success-light' },
  sold: { icon: Tag, color: 'text-primary', bg: 'bg-primary-light' },
  flagged: { icon: ShieldAlert, color: 'text-danger', bg: 'bg-danger-light' },
  info: { icon: Info, color: 'text-text-secondary', bg: 'bg-bg-tertiary' },
}

function NotificationItem({ notification, onRead, onClick }: { notification: Notification; onRead: (id: string) => void; onClick: () => void }) {
  const config = typeConfig[notification.type] ?? typeConfig.info
  const Icon = config.icon

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex gap-3 px-4 py-3 hover:bg-bg-tertiary transition-colors cursor-pointer ${
        !notification.read ? 'bg-primary-light/20' : ''
      }`}
      onClick={() => {
        if (!notification.read) onRead(notification.id)
        onClick()
      }}
    >
      <div className={`w-8 h-8 rounded-full ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon className={`w-4 h-4 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${!notification.read ? 'font-medium text-text-primary' : 'text-text-secondary'}`}>
          {notification.message}
        </p>
        <p className="text-xs text-text-tertiary mt-0.5">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </p>
      </div>
      {!notification.read && (
        <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
      )}
    </motion.div>
  )
}

import { dropdown, snappy } from '@/lib/animations'

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data } = useNotifications()
  const { data: unreadCount = 0 } = useUnreadCount()
  const markAll = useMarkAllRead()
  const markOne = useMarkOneRead()
  const navigate = useNavigate()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const notifications = data?.notifications ?? []

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-text-secondary hover:bg-bg-tertiary transition-colors"
      >
        <Bell className="w-4 h-4" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-danger text-white text-[10px] font-semibold flex items-center justify-center"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={dropdown}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={snappy}
            className="absolute right-0 top-full mt-2 w-80 bg-surface rounded-xl border border-border shadow-elevated overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-base">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-primary-light text-primary text-xs font-medium">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAll.mutate()}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary-dark transition-colors px-2 py-1 rounded-lg hover:bg-primary-light"
                  >
                    <Check className="w-3 h-3" />
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-lg text-text-tertiary hover:bg-bg-tertiary transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-border-base">
              {notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
                  <p className="text-sm text-text-secondary">No notifications yet</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={(id) => markOne.mutate(id)}
                    onClick={() => {
                      setOpen(false)
                      if (n.auctionId) {
                        navigate(`/auctions/${n.auctionId}`)
                      }
                    }}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
