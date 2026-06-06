import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react'
import { forgotPassword } from '@/api/auth'
import { getErrorMessage } from '@/api/client'
import toast from 'react-hot-toast'
import { scaleIn, springGentle } from '@/lib/animations'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await forgotPassword(email)
      setSent(true)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
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
        {/* Header */}
        <div className="text-center mb-10">
          <Link to="/" className="inline-block font-serif italic font-bold text-3xl tracking-tighter text-primary hover:text-primary-dark transition-colors mb-2">
            BidSpace
          </Link>
          <h1 className="font-mono text-[10px] uppercase tracking-widest text-text-tertiary">Recovery Request</h1>
        </div>

        {sent ? (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-none border border-primary/20 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-sm text-text-primary font-bold">Check your inbox</p>
              <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                We've sent recovery instructions to <span className="font-mono font-bold text-text-primary">{email}</span>.
              </p>
            </div>
            <Link
              to="/login"
              className="inline-block w-full py-3 bg-bg-tertiary hover:bg-border-base text-text-primary text-xs uppercase tracking-widest font-bold transition-all border border-border-base"
            >
              Return to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-bg-base border border-border-base rounded-none text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-all font-sans"
                  placeholder="Registered email address"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center justify-center"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Recovery Link'}
            </button>

            <div className="text-center pt-4 border-t border-border-base">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-widest text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Back to login
              </Link>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  )
}
