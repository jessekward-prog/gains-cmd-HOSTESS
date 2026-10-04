// Shared Framer Motion variants for gym-feel animations

// Page transition variants
export const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

// Set row "rack the weight" spring
export const setRowVariants = {
  initial: { opacity: 0, x: -30, scale: 0.95 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring', damping: 18, stiffness: 300 },
  },
  exit: {
    opacity: 0,
    x: 80,
    scale: 0.9,
    transition: { duration: 0.25, ease: 'easeIn' },
  },
};

// Staggered list for exercise loading
export const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.06 },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', damping: 20, stiffness: 200 },
  },
};

// Button tap feedback
export const tapScale = { scale: 0.95 };
export const tapScaleSmall = { scale: 0.97 };

// PR celebration burst
export const prBurst = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.2, 1],
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

// Number counter (for weight/rep changes)
export const numberPop = {
  initial: { scale: 1, y: 0 },
  animate: {
    scale: [1, 1.15, 1],
    y: [0, -4, 0],
    transition: { duration: 0.3, ease: 'easeOut' },
  },
};

// Completion checkmark
export const checkVariants = {
  initial: { scale: 0, rotate: -45 },
  animate: {
    scale: 1,
    rotate: 0,
    transition: { type: 'spring', damping: 12, stiffness: 400 },
  },
};

// Swipe to delete
export const swipeVariants = {
  drag: {
    x: 0,
    transition: { type: 'spring', damping: 20, stiffness: 200 },
  },
};

// Toast notification
export const toastVariants = {
  initial: { opacity: 0, y: 50, scale: 0.9 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', damping: 20, stiffness: 300 },
  },
  exit: {
    opacity: 0,
    y: 20,
    scale: 0.9,
    transition: { duration: 0.2 },
  },
};

// Modal overlay
export const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalVariants = {
  initial: { opacity: 0, scale: 0.95, y: 20 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', damping: 22, stiffness: 300 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: { duration: 0.2 },
  },
};
