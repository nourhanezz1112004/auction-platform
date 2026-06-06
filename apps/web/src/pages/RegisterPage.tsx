import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, User, Phone, Loader2, Check, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { register } from '@/api/auth'
import { getErrorMessage } from '@/api/client'
import toast from 'react-hot-toast'

const steps = ['Account', 'Profile']

import { fadeUp, springGentle } from '@/lib/animations'

export function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  function handleNext(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (step === 0) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters')
        return
      }
      setStep(1)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await register({ email, password, name, phone: phone || undefined })
      setAuth(data.user, data.accessToken, data.refreshToken)
      toast.success(`Welcome to BidSpace, ${data.user.name.split(' ')[0]}!`)
      navigate('/', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-[85vh] flex items-center justify-center px-4 py-12 bg-bg-base transition-colors">
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
          <h1 className="font-serif italic text-xl text-text-primary mb-1">Create Account</h1>
          <p className="text-[11px] font-sans text-text-secondary uppercase tracking-widest">Join our rare auction sanctuary</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-4 py-2 border-y border-border-base">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <motion.div
                animate={{
                  background: i < step ? 'var(--color-primary)' : i === step ? 'var(--color-primary)' : 'var(--bg-tertiary)',
                }}
                className="w-5 h-5 rounded-none flex items-center justify-center text-[10px] font-bold font-mono"
                style={{ color: i <= step ? '#fff' : 'var(--text-tertiary)' }}
              >
                {i < step ? <Check className="w-2.5 h-2.5" /> : i + 1}
              </motion.div>
              <span className={`text-[10px] uppercase font-bold tracking-wider font-sans ${i === step ? 'text-text-primary' : 'text-text-tertiary'}`}>
                {s}
              </span>
              {i < steps.length - 1 && (
                <div className="w-6 h-px bg-border-base ml-2" />
              )}
            </div>
          ))}
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

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-4 py-3 rounded-none bg-danger-light border border-danger/20 text-xs text-danger font-medium mb-4"
            >
              {error}
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {step === 0 ? (
              <motion.form
                key="step0"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleNext}
                className="space-y-5"
              >
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
                  <label className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      required
                      className="w-full pl-10 pr-3 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-wider text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-all font-sans"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-none bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark transition-all duration-200 cursor-pointer"
                >
                  Continue
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="step1"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSubmit}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ahmed Hassan"
                      required
                      className="w-full pl-10 pr-3 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-wider text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-all font-sans"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">
                    Phone Number <span className="text-text-tertiary font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+20 100 000 0000"
                      className="w-full pl-10 pr-3 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-wider text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-all font-sans"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="flex-1 py-3 rounded-none border border-border-base text-xs uppercase tracking-widest font-semibold bg-bg-surface text-text-secondary hover:border-text-secondary transition-all cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-none bg-primary text-white text-xs uppercase tracking-widest font-semibold hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Curating…
                      </>
                    ) : (
                      'Register'
                    )}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center font-sans text-xs tracking-wide text-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:text-primary-dark font-medium transition-colors">
            Sign In
          </Link>
        </p>
      </motion.div>
    </div>
  )
}