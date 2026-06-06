import { motion, AnimatePresence } from 'framer-motion'
import { User } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fadeUp, smooth } from '@/lib/animations'

type Bid = {
  id: string;
  userId: string;
  amount: number;
  createdAt: string;
}

type Props = {
  bids: Bid[];
  total?: number;
  currentUserId?: string;
}

export function BidHistory({ bids, total, currentUserId }: Props) {
  return (
    <div className="mt-12">
      <h2 className="font-serif italic text-2xl text-text-primary mb-4 font-medium">
        Bid History {total ? `(${total})` : ''}
      </h2>
      {bids.length === 0 ? (
        <div className="text-center py-12 bg-bg-surface rounded-none border border-border-base border-dashed">
          <p className="text-xs font-mono tracking-widest uppercase text-text-tertiary">No bids placed yet — open bidding by placing a bid</p>
        </div>
      ) : (
        <div className="bg-bg-surface rounded-none border border-border-base divide-y divide-border-base overflow-hidden shadow-sm">
          <AnimatePresence initial={false}>
            {bids.map((bid, i) => (
              <motion.div
                key={bid.id}
                variants={fadeUp}
                initial="initial"
                animate="animate"
                transition={{ ...smooth, delay: i === 0 ? 0 : 0 }}
                className="flex items-center justify-between px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-none bg-bg-tertiary/50 border border-border-base flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-text-tertiary" />
                  </div>
                  <span className="text-xs text-text-secondary font-mono">
                    {bid.userId === currentUserId ? 'You' : `${bid.userId.slice(0, 8)}…`}
                  </span>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-text-primary">${bid.amount.toLocaleString()}</p>
                  <p className="text-[9px] font-mono tracking-widest uppercase text-text-tertiary">
                    {formatDistanceToNow(new Date(bid.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
