import { motion, AnimatePresence } from 'framer-motion';
import { useTimer } from '../hooks/useTimer';
import { useCallback } from 'react';
import NavIcon from './NavIcon';

export default function RestTimer({ seconds, onComplete, compact = false }) {
  const handleComplete = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  const { remaining, isRunning, progress, start, stop } = useTimer(handleComplete);

  const radius = compact ? 18 : 36;
  const stroke = compact ? 3 : 4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  const size = (radius + stroke) * 2;

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
  };

  if (!isRunning && remaining === 0 && !compact) {
    return (
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => start(seconds)}
        className="tap-target flex items-center gap-2 px-4 py-2 rounded-xl bg-bg-3 border border-border text-text-secondary text-sm font-mono hover:bg-bg-4 transition-colors"
      >
        <NavIcon id="clock" size={16} />
        <span>{formatTime(seconds)}</span>
      </motion.button>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {isRunning ? (
        <motion.div
          key="running"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          className="relative flex items-center justify-center cursor-pointer"
          onClick={stop}
        >
          <svg width={size} height={size} className="rotate-[-90deg]">
            {/* Background track */}
            <circle
              cx={radius + stroke}
              cy={radius + stroke}
              r={radius}
              fill="none"
              stroke="var(--color-bg-4)"
              strokeWidth={stroke}
            />
            {/* Progress arc */}
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
              style={{ filter: 'drop-shadow(0 0 6px var(--color-accent-glow))' }}
            />
          </svg>
          <motion.span
            key={remaining}
            initial={{ scale: 1.1, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`absolute font-mono font-bold ${compact ? 'text-xs' : 'text-lg'} text-accent`}
            style={remaining <= 5 ? { animation: 'countdown-pulse 1s infinite' } : undefined}
          >
            {remaining}
          </motion.span>
        </motion.div>
      ) : remaining === 0 && compact ? null : (
        <motion.div
          key="ready"
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          className={`font-mono font-bold ${compact ? 'text-xs' : 'text-sm'} text-success`}
        >
          ✓ GO
        </motion.div>
      )}
    </AnimatePresence>
  );
}
