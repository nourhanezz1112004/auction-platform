import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'

type Props = {
  endsAt: string
  status?: string
}

export function CountdownTimer({ endsAt, status }: Props) {
  const calculateTimeLeft = () => {
    const difference = new Date(endsAt).getTime() - new Date().getTime()

    if (difference <= 0 || status === 'ENDED') {
      return 'Ended'
    }

    const days = Math.floor(difference / (1000 * 60 * 60 * 24))
    const hours = Math.floor((difference / (1000 * 60 * 60)) % 24)
    const minutes = Math.floor((difference / (1000 * 60)) % 60)
    const seconds = Math.floor((difference / 1000) % 60)

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`
    }

    return `${hours}h ${minutes}m ${seconds}s`
  }

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft())
  const [isExtended, setIsExtended] = useState(false)
  const prevEndsAt = useRef(endsAt)

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft())
    }, 1000)

    return () => clearInterval(timer)
  }, [endsAt, status])

  useEffect(() => {
    if (prevEndsAt.current !== endsAt && new Date(endsAt) > new Date(prevEndsAt.current)) {
      setIsExtended(true)
      const t = setTimeout(() => setIsExtended(false), 3000)
      prevEndsAt.current = endsAt
      return () => clearTimeout(t)
    }
  }, [endsAt])

  return (
    <motion.span
      animate={{ 
        color: isExtended ? 'var(--color-warning)' : 'inherit',
      }}
      className="flex items-center gap-2"
    >
      <span>{timeLeft}</span>
      {isExtended && (
        <motion.span 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="text-[8px] bg-warning-light text-warning px-1.5 py-0.5 uppercase tracking-widest font-bold border border-warning/20 font-sans"
        >
          + Extended
        </motion.span>
      )}
    </motion.span>
  )
}
