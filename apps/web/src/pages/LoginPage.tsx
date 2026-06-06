import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, Loader2, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { login } from '@/api/auth'
import { getErrorMessage } from '@/api/client'
import toast from 'react-hot-toast'

import { fadeUp, springGentle } from '@/lib/animations'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setAuth = useAuthStore((s) => s.setAuth)
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await login({ email, password })
      setAuth(data.user, data.accessToken, data.refreshToken)
      toast.success(`Welcome back, ${data.user.name.split(' ')[0]}!`)
      navigate(from, { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-[80vh] flex items-center justify-center px-4 py-12 bg-bg-base transition-colors">
      <div className="absolute top-6 left-6">
        <Link
          to="/"
          className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Home
        </Link>
      </div>
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={springGentle}
        className="w-full max-w-sm space-y-6"
      >
        {/* Logo */}
        <div className="flex flex-col items-center text-center">
          <Link to="/" className="flex items-baseline gap-1.5 group mb-2 select-none">
            <span className="font-serif italic font-semibold text-text-primary text-3xl tracking-tight transition-colors group-hover:text-primary">BidSpace</span>
            <span className="font-serif italic text-primary text-base font-bold" style={{ fontFamily: 'Amiri, serif' }}>مزاد</span>
          </Link>
          <h1 className="font-serif italic text-xl text-text-primary mb-1">Welcome Back</h1>
          <p className="text-[11px] font-sans text-text-secondary uppercase tracking-widest">Sign in to your archival account</p>
        </div>

        {/* Card */}
        <div className="bg-bg-surface rounded-none border border-border-base p-8 shadow-sm relative overflow-hidden">
          {/* Subtle gold brand border indicator */}
          <div className="absolute top-0 left-0 w-full h-[3px] bg-primary" />
          
          {/* Egyptian heritage corner motifs */}
          <div className="absolute top-3 left-3 w-3 h-3 border-t border-l border-primary/20" />
          <div className="absolute top-3 right-3 w-3 h-3 border-t border-r border-primary/20" />
          <div className="absolute bottom-3 left-3 w-3 h-3 border-b border-l border-primary/20" />
          <div className="absolute bottom-3 right-3 w-3 h-3 border-b border-r border-primary/20" />
          
          <form onSubmit={handleSubmit} className="space-y-5">

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-4 py-3 rounded-none bg-danger-light border border-danger/20 text-xs text-danger font-medium"
              >
                {error}
              </motion.div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@archival.com"
                  required
                  className="w-full pl-10 pr-3 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-wider text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-all font-sans"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">Password</label>
                <Link to="/forgot-password" className="text-[9px] font-mono tracking-widest text-primary uppercase hover:text-primary-dark transition-colors">
                  Forgot?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-3 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-wider text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-all font-sans"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-none bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Accessing Sanctuary…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center font-sans text-xs tracking-wide text-text-secondary">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary hover:text-primary-dark font-medium transition-colors">
            Create One
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
