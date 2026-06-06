import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle, Home, Package, Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'

export function PaymentSuccessPage() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const queryClient = useQueryClient()

  const verifyMutation = useMutation({
    mutationFn: async (sid: string) => {
      await apiClient.post('/payments/verify', { sessionId: sid })
    },
    onSuccess: () => {
      // Refresh user bids and specific auctions
      queryClient.invalidateQueries({ queryKey: ['my-bids'] })
      queryClient.invalidateQueries({ queryKey: ['auctions'] })
    }
  })

  useEffect(() => {
    if (sessionId) {
      verifyMutation.mutate(sessionId)
    }
  }, [sessionId])

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-bg-surface rounded-none border border-border-base p-8 text-center shadow-sm"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className={`w-16 h-16 rounded-none border flex items-center justify-center mx-auto mb-5 ${
            verifyMutation.isPending ? 'bg-primary/10 border-primary/20' : 'bg-primary-light border-primary/20'
          }`}
        >
          {verifyMutation.isPending ? (
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
          ) : (
            <CheckCircle className="w-7 h-7 text-primary" />
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-4"
        >
          {verifyMutation.isError ? (
            <>
              <h1 className="font-serif italic text-2xl font-medium text-danger">Verification Failed</h1>
              <p className="text-xs text-text-secondary leading-relaxed font-light tracking-wide">
                We were unable to verify your session with Stripe. Please click below to retry the verification or contact support if the issue persists.
              </p>
              <button
                onClick={() => verifyMutation.mutate(sessionId!)}
                className="mt-4 px-6 py-2.5 bg-danger text-white text-xs uppercase tracking-widest font-semibold hover:bg-danger/90 transition-all rounded-none w-full cursor-pointer"
              >
                Retry Verification
              </button>
            </>
          ) : (
            <>
              <h1 className="font-serif italic text-2xl font-medium text-text-primary">
                {verifyMutation.isPending ? 'Verifying payment...' : 'Payment Successful'}
              </h1>
              <p className="text-xs text-text-secondary leading-relaxed font-light tracking-wide">
                {verifyMutation.isPending 
                  ? 'Please wait while we confirm your secure transaction with Stripe.' 
                  : 'Your payment has been successfully logged. The seller will arrange delivery of your acquired lot.'}
              </p>
            </>
          )}

          <div className="bg-bg-tertiary/20 border border-border-base rounded-none p-4 text-left">
            <div className="flex items-center gap-2.5 text-xs text-text-secondary leading-relaxed">
              <Package className="w-4 h-4 text-primary shrink-0" />
              <span>A confirmation transaction receipt will arrive in your inbox.</span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Link
              to="/"
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-widest font-semibold text-text-secondary hover:border-text-secondary transition-all duration-200 cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              Directory
            </Link>
            <Link
              to="/profile"
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-none bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark transition-all duration-200 cursor-pointer"
            >
              <Package className="w-3.5 h-3.5" />
              Curations
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}