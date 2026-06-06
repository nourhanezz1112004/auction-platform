import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Loader2, ArrowRight } from 'lucide-react'
import { resetPassword } from '@/api/auth'
import { getErrorMessage } from '@/api/client'
import toast from 'react-hot-toast'
import { scaleIn, springGentle } from '@/lib/animations'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      toast.error('Invalid or missing recovery token')
      return
    }
    setLoading(true)
    try {
      await resetPassword(token, password)
      toast.success('Security credential updated')
      navigate('/login')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base p-4">
        <div className="text-center space-y-4">
          <p className="text-danger font-mono uppercase tracking-widest text-xs">Invalid Access Token</p>
          <Link to="/forgot-password" className="text-primary hover:underline text-xs">Request new recovery link</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base p-4">
      <motion.div
        variants={scaleIn}
        initial="initial"
        animate="animate"
        transition={springGentle}
        className="w-full max-w-md bg-bg-surface p-10 border border-border-base shadow-sm rounded-none"
      >
        <div className="text-center mb-10">
          <h1 className="font-serif italic font-bold text-3xl tracking-tighter text-primary hover:text-primary-dark transition-colors mb-2">
            BidSpace
          </h1>
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-text-tertiary">Set New Credential</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-bg-base border border-border-base rounded-none text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-all font-sans"
                placeholder="New password (min 8 characters)"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Update'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
