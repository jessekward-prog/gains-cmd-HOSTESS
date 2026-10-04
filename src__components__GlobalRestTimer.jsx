import { motion, AnimatePresence } from 'framer-motion';
import { useGlobalTimer } from '../context/TimerContext';

export default function GlobalRestTimer({ hidden }) {
  const { remaining, total, isRunning, progress, stop } = useGlobalTimer();

  const radius = 28;
  const stroke = 3;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  const size = (radius + stroke) * 2;

  return (
    <AnimatePresence>
      {isRunning && !hidden && (
        <motion.div
          initial={{ scale: 0, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 18, stiffness: 300 }}
          className="fixed bottom-24 right-4 z-50"
        >
          <motion.div
            onClick={stop}
            whileTap={{ scale: 0.9 }}
            className="relative flex items-center justify-center w-16 h-16 rounded-full bg-bg-2 border-2 border-accent/50 cursor-pointer"
            style={{ boxShadow: '0 0 20px var(--color-accent-glow), 0 4px 20px rgba(0,0,0,0.5)' }}
          >
            <svg width={size} height={size} className="absolute rotate-[-90deg]">
              <circle
                cx={radius + stroke}
                cy={radius + stroke}
                r={radius}
                fill="none"
                stroke="var(--color-bg-4)"
                strokeWidth={stroke}
              />
              <motion.circle
                cx={radius + stroke}
                cy={radius + stroke}
                r={radius}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />
            </svg>
            <motion.span
              key={remaining}
              initial={{ scale: 1.15 }}
              animate={{ scale: 1 }}
              className="font-mono font-bold text-lg text-accent"
              style={remaining <= 5 ? { animation: 'countdown-pulse 1s infinite' } : undefined}
            >
              {remaining}
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
