import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CreditCard, Loader2, Shield, Lock } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useAuction } from '@/hooks/useAuctions'
import { apiClient, getErrorMessage } from '@/api/client'
import toast from 'react-hot-toast'

export function PaymentPage() {
  const { id } = useParams<{ id: string }>()
  const { data: auction, isLoading } = useAuction(id!)

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ stripeSessionUrl: string }>('/payments/checkout', {
        auctionId: id,
      })
      return res.data
    },
    onSuccess: (data) => {
      window.location.href = data.stripeSessionUrl
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
      </div>
    )
  }

  if (!auction) {
    return (
      <div className="max-w-md mx-auto py-16 text-center px-4">
        <p className="text-text-secondary text-xs uppercase tracking-wider font-semibold">Archival lot not found</p>
        <Link to="/" className="mt-3 text-primary text-[10px] uppercase font-mono tracking-widest hover:underline">Return to home</Link>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-bg-surface rounded-none border border-border-base p-8 shadow-sm"
      >
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-10 h-10 rounded-none bg-primary/10 border border-primary/20 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-serif italic text-xl font-medium text-text-primary">Complete Checkout</h1>
            <p className="text-[10px] uppercase font-mono tracking-widest text-text-tertiary">Secure transaction via Stripe</p>
          </div>
        </div>

        {/* Auction summary */}
        <div className="bg-bg-tertiary/20 border border-border-base rounded-none p-4 mb-6 space-y-2">
          <p className="text-[9px] uppercase font-bold tracking-widest text-text-tertiary">Lot Acquired</p>
          <p className="text-xs font-semibold text-text-primary line-clamp-2">{auction.title}</p>
          <div className="flex items-center justify-between pt-2 border-t border-border-base/50">
            <span className="text-[10px] uppercase font-bold tracking-widest text-text-secondary">Final price</span>
            <span className="font-mono text-base font-bold text-text-primary">
              ${auction.currentPrice.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Security note */}
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-none bg-primary-light border border-primary/20 mb-6">
          <Lock className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <p className="text-[10px] font-sans text-text-secondary leading-normal">
            Payment processed securely by Stripe. BidSpace never retains credit card or transaction credentials.
          </p>
        </div>

        <button
          onClick={() => checkoutMutation.mutate()}
          disabled={checkoutMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-none bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark disabled:opacity-60 transition-all duration-200 cursor-pointer"
        >
          {checkoutMutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Accessing Gateway…
            </>
          ) : (
            <>
              <CreditCard className="w-3.5 h-3.5" />
              Authorize Checkout — ${auction.currentPrice.toLocaleString()}
            </>
          )}
        </button>

        <div className="flex items-center justify-center gap-1.5 mt-5 font-mono text-[9px] uppercase tracking-widest text-text-tertiary">
          <Shield className="w-3.5 h-3.5 text-text-tertiary" />
          <span>256-bit ssl encryption</span>
        </div>
      </motion.div>
    </div>
  )
}