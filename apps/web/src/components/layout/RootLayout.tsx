import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, type Transition } from 'framer-motion'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { ConnectivityBanner } from '@/components/ai'

const pageVariants = {
  initial: { opacity: 0, scale: 0.99, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 1.005, y: -4 },
}

const pageTransition: Transition = {
  duration: 0.18,
  ease: [0.25, 0.1, 0.25, 1],
}

export function RootLayout() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="min-h-screen flex flex-col bg-bg-base text-text-primary transition-colors duration-300">
      <Navbar />
      <ConnectivityBanner />
      <div className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
            className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8"
          >
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </div>
      <Footer />
    </div>
  )
}
