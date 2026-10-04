import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect, useCallback } from 'react';
import { overlayVariants, modalVariants } from '../lib/variants';
import useBackHandler from '../hooks/useBackHandler';
import NavIcon from './NavIcon';

const ITEM_HEIGHT = 44;

export function PickerWheel({ items, value, onChange, visibleItems = 3 }) {
  const wheelHeight = ITEM_HEIGHT * visibleItems;
  const padding = ITEM_HEIGHT * Math.floor(visibleItems / 2);
  const scrollRef = useRef(null);
  const isScrolling = useRef(false);

  const selectedIndex = items.indexOf(value);

  useEffect(() => {
    if (scrollRef.current && !isScrolling.current) {
      const idx = items.indexOf(value);
      if (idx >= 0) {
        scrollRef.current.scrollTop = idx * ITEM_HEIGHT;
      }
    }
  }, [value, items]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    isScrolling.current = true;
    clearTimeout(scrollRef.current._scrollTimer);
    scrollRef.current._scrollTimer = setTimeout(() => {
      if (!scrollRef.current) return;
      const idx = Math.round(scrollRef.current.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      scrollRef.current.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: 'smooth' });
      onChange(items[clamped]);
      isScrolling.current = false;
    }, 80);
  }, [items, onChange]);

  return (
    <div className="relative" style={{ height: wheelHeight }}>
      {/* Selection highlight */}
      <div
        className="absolute left-0 right-0 border-t border-b border-border pointer-events-none z-10"
        style={{ top: padding, height: ITEM_HEIGHT }}
      />
      {/* Fade gradients */}
      <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-bg-1 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-bg-1 to-transparent pointer-events-none z-10" />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll overscroll-contain"
        style={{
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          paddingTop: padding,
          paddingBottom: padding,
        }}
      >
        <style>{`.picker-scroll::-webkit-scrollbar { display: none; }`}</style>
        {items.map((item, i) => {
          const isSelected = item === value;
          return (
            <div
              key={i}
              className={`flex items-center justify-center font-display transition-all ${
                isSelected ? 'text-text-primary text-2xl font-semibold' : 'text-text-tertiary text-lg'
              }`}
              style={{
                height: ITEM_HEIGHT,
                scrollSnapAlign: 'center',
              }}
            >
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RestPickerModal({ open, onClose, minutes, seconds, onConfirm }) {
  const [min, setMin] = useState(minutes);
  const [sec, setSec] = useState(seconds);

  // Android back gesture dismisses (same as tapping outside).
  useBackHandler(open, onClose);

  useEffect(() => {
    if (open) {
      setMin(minutes);
      setSec(seconds);
    }
  }, [open, minutes, seconds]);

  const minuteOptions = [0, 1, 2, 3, 4, 5];
  const secondOptions = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const handleConfirm = useCallback(() => {
    const total = min * 60 + sec;
    if (total >= 15) {
      onConfirm(total);
    }
    onClose();
  }, [min, sec, onConfirm, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          <motion.div
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-bg-1 border border-border-strong rounded-t-2xl sm:rounded-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="font-display font-semibold text-lg text-text-primary inline-flex items-center gap-1.5"><NavIcon id="clock" size={18} />Rest Time</span>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleConfirm}
                className="px-5 py-2 bg-accent text-white rounded-lg font-display font-medium text-sm"
              >
                Confirm
              </motion.button>
            </div>

            {/* Wheels */}
            <div className="flex gap-4 px-6 py-4">
              <div className="flex-1">
                <PickerWheel items={minuteOptions} value={min} onChange={setMin} visibleItems={5} />
                <div className="text-center text-xs font-mono text-text-tertiary mt-2">min</div>
              </div>
              <div className="flex-1">
                <PickerWheel items={secondOptions} value={sec} onChange={setSec} visibleItems={5} />
                <div className="text-center text-xs font-mono text-text-tertiary mt-2">sec</div>
              </div>
            </div>

            {/* Preview */}
            <div className="text-center pb-5 text-sm font-mono text-text-secondary">
              {min}m {sec}s ({min * 60 + sec}s total)
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
