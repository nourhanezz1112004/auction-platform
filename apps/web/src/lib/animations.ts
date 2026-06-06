import type { Transition, Variants } from 'framer-motion'

// ── Transitions ────────────────────────────────────────────
export const snappy: Transition = {
  duration: 0.15,
  ease: [0.25, 0.1, 0.25, 1],
}

export const smooth: Transition = {
  duration: 0.22,
  ease: [0.25, 0.1, 0.25, 1],
}

export const spring: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 28,
}

export const springGentle: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 24,
}

// ── Reusable variants ──────────────────────────────────────
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
}

export const fadeDown: Variants = {
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
}

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
}

export const slideRight: Variants = {
  initial: { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 8 },
}

export const slideLeft: Variants = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -8 },
}

// ── Stagger container ──────────────────────────────────────
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
}

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
}

// ── Card hover ─────────────────────────────────────────────
export const cardHover = {
  whileHover: { y: -2, transition: { duration: 0.15 } },
  whileTap: { scale: 0.99, transition: { duration: 0.1 } },
}

// ── Button press ───────────────────────────────────────────
export const buttonPress = {
  whileTap: { scale: 0.97, transition: { duration: 0.08 } },
}

// ── Modal ──────────────────────────────────────────────────
export const modalBackdrop: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.94, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 6 },
}

// ── Dropdown ───────────────────────────────────────────────
export const dropdown: Variants = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: -4 },
}

// ── List item stagger ──────────────────────────────────────
export function listItemVariants(index: number): Variants {
  return {
    initial: { opacity: 0, y: 10 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { delay: index * 0.04, duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
    },
  }
}
