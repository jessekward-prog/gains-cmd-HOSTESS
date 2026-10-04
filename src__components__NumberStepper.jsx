import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useRef } from 'react';

export default function NumberStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  label,
  unit,
  size = 'md',
  className = '',
}) {
  const inputRef = useRef(null);
  const numValue = parseFloat(value) || 0;

  const increment = useCallback(() => {
    const next = Math.min(numValue + step, max);
    onChange(step % 1 === 0 ? next : parseFloat(next.toFixed(1)));
  }, [numValue, step, max, onChange]);

  const decrement = useCallback(() => {
    const next = Math.max(numValue - step, min);
    onChange(step % 1 === 0 ? next : parseFloat(next.toFixed(1)));
  }, [numValue, step, min, onChange]);

  const handleInput = useCallback((e) => {
    const raw = e.target.value;
    if (raw === '' || raw === '-') {
      onChange(raw);
      return;
    }
    const n = parseFloat(raw);
    if (!isNaN(n)) onChange(n);
  }, [onChange]);

  const isLg = size === 'lg';

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      {label && (
        <span className="text-[10px] uppercase tracking-wider text-text-tertiary font-mono">
          {label}
        </span>
      )}
      <div className="flex items-center gap-1">
        {/* Decrement */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={decrement}
          className={`tap-target flex items-center justify-center rounded-lg bg-bg-3 border border-border text-text-secondary font-bold hover:bg-bg-4 active:bg-surface-active transition-colors ${
            isLg ? 'w-12 h-12 text-xl' : 'w-10 h-10 text-lg'
          }`}
        >
          −
        </motion.button>

        {/* Value display */}
        <div className="relative">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={numValue}
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="flex items-baseline justify-center"
            >
              <input
                ref={inputRef}
                type="number"
                value={value}
                onChange={handleInput}
                className={`bg-transparent text-center font-display font-bold text-text-primary outline-none ${
                  isLg ? 'w-20 text-2xl' : 'w-16 text-xl'
                }`}
                inputMode="decimal"
              />
            </motion.div>
          </AnimatePresence>
          {unit && (
            <span className="absolute -right-1 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary font-mono">
              {unit}
            </span>
          )}
        </div>

        {/* Increment */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={increment}
          className={`tap-target flex items-center justify-center rounded-lg bg-bg-3 border border-border text-text-secondary font-bold hover:bg-bg-4 active:bg-surface-active transition-colors ${
            isLg ? 'w-12 h-12 text-xl' : 'w-10 h-10 text-lg'
          }`}
        >
          +
        </motion.button>
      </div>
    </div>
  );
}
