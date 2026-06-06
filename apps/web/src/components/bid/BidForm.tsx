import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Gavel, Shield, FlaskConical } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { placeBid } from '@/api/bids'
import type { BidError } from '@/api/bids'
import axios from 'axios'
import toast from 'react-hot-toast'
import { getErrorMessage } from '@/api/client'

type Props = {
  auctionId: string;
  currentPrice: number;
  isActive: boolean;
  isOwner: boolean;
  user: boolean;
  setBidError: (error: BidError | null) => void;
}

export function BidForm({ auctionId, currentPrice, isActive, isOwner, user, setBidError }: Props) {
  const [bidAmount, setBidAmount] = useState('')
  const [demoMode, setDemoMode] = useState(false)
  const queryClient = useQueryClient()

  // Track when the page loaded and when the user focused the bid input
  // These are best-effort timing signals for the anti-bot model
  const pageLoadMs  = useRef(Date.now())
  const inputFocusMs = useRef<number | null>(null)

  const minBid = currentPrice + 1
  const bidAmountNum = Number(bidAmount)
  const bidValid = bidAmountNum >= minBid && !isNaN(bidAmountNum)

  const bidMutation = useMutation({
    mutationFn: () => {
      const sessionSecs = Math.floor((Date.now() - pageLoadMs.current) / 1000)
      const timeToBid   = inputFocusMs.current
        ? Math.floor(Date.now() - inputFocusMs.current)
        : 5000
      return placeBid({
        auctionId,
        amount:             demoMode ? 999999 : Number(bidAmount),
        sessionDurationSecs: sessionSecs,
        timeToBidMs:         timeToBid,
      })
    },
    onSuccess: (data) => {
      setBidAmount('')
      queryClient.setQueryData(['auction', auctionId], (old: any) => ({
        ...old,
        currentPrice: data.newHighestBid,
      }))
      toast.success(`Bid of $${data.newHighestBid.toLocaleString()} placed!`)
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response) {
        const data = error.response.data
        setBidError({
          error: data.error,
          message: data.message,
          currentPrice: data.currentPrice,
          score: data.score,
          signals: data.signals,
          confidence: data.confidence,
        })
      } else {
        toast.error(getErrorMessage(error))
      }
    },
  })

  if (!isActive) return null;

  if (isOwner) return null;
  if (!user) {
    return (
      <Link
        to="/login"
        className="block w-full text-center py-3 rounded-none bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark transition-all"
      >
        Sign in to place bid
      </Link>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary text-xs font-mono">$</span>
          <input
            type="number"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            onFocus={() => { if (!inputFocusMs.current) inputFocusMs.current = Date.now() }}
            placeholder={`${minBid} USD or more`}
            min={minBid}
            className="w-full pl-8 pr-3 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-wider text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-all font-sans"
          />
        </div>
        <button
          onClick={() => bidMutation.mutate()}
          disabled={!bidValid || bidMutation.isPending}
          className="w-full sm:w-auto px-6 py-3 rounded-none bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          {bidMutation.isPending ? (
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-none animate-spin" />
          ) : (
            <Gavel className="w-3.5 h-3.5" />
          )}
          Place Bid
        </button>
      </div>
      <p className="text-[9px] font-mono tracking-widest uppercase text-text-tertiary flex items-center gap-1.5">
        <Shield className="w-3 h-3 text-primary" />
        Protected by secure real-time verification guards
      </p>

      {/* Demo mode toggle */}
      <button
        onClick={() => {
          setDemoMode(!demoMode)
          toast(demoMode ? 'Demo mode deactivated' : '🧪 Demo mode activated — next bid will trigger simulated fraud protection', {
            duration: 3000,
            style: demoMode ? {} : { background: '#FAEEDA', color: '#854F0B', border: '1px solid #FAC775' },
          })
        }}
        className={`flex items-center gap-1.5 font-mono text-[8px] tracking-widest uppercase px-3 py-1.5 rounded-none border transition-all cursor-pointer ${
          demoMode
            ? 'bg-warning-light border-warning/30 text-warning font-bold'
            : 'bg-bg-surface border-border-base text-text-tertiary hover:border-text-secondary'
        }`}
      >
        <FlaskConical className="w-3 h-3" />
        {demoMode ? 'Demo active — click Bid to trigger warning' : 'Activate Demo Filter'}
      </button>
    </div>
  )
}
