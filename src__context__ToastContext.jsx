import { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toastVariants } from '../lib/variants';

const ToastContext = createContext(null);

let toastId = 0;

const centerColors = {
  success: { border: 'border-success/40', icon: 'text-success', title: 'text-success', bg: 'bg-success/10' },
  error:   { border: 'border-error/40',   icon: 'text-error',   title: 'text-error',   bg: 'bg-error/10' },
  info:    { border: 'border-accent/30',  icon: 'text-accent',  title: 'text-accent',  bg: 'bg-accent/10' },
  warning: { border: 'border-warning/40', icon: 'text-warning', title: 'text-warning', bg: 'bg-warning/10' },
};

const centerIcons = {
  success: '↑',
  error: '✕',
  info: '✓',
  warning: '!',
};

// ── Confetti burst ───────────────────────────────────────────────────
// 24 square particles animated from center outward. Colors pulled from
// the active theme's CSS variables so the burst matches the user's
// chosen palette (accent + success + accent-hover).
function readThemeColors() {
  if (typeof window === 'undefined') return ['#22c55e'];
  const s = getComputedStyle(document.documentElement);
  const pick = (v) => s.getPropertyValue(v).trim();
  return [
    pick('--color-success') || '#22c55e',
    pick('--color-accent') || '#ef4444',
    pick('--color-accent-hover') || '#f97316',
  ].filter(Boolean);
}

function ConfettiBurst({ onDone }) {
  const colors = readThemeColors();
  const particles = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.3;
    const distance = 120 + Math.random() * 90;
    const size = 7 + Math.random() * 5;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      rotate: Math.random() * 540 - 270,
      color: colors[i % colors.length],
      size,
      delay: Math.random() * 0.05,
    };
  });
  return (
    <div className="pointer-events-none fixed inset-0 z-[9997] flex items-center justify-center overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
          animate={{
            x: p.x,
            y: p.y + 220, // gravity drift
            opacity: 0,
            rotate: p.rotate,
            scale: 1,
            transition: { duration: 1.1, delay: p.delay, ease: [0.2, 0.7, 0.4, 1] },
          }}
          onAnimationComplete={p.id === 0 ? onDone : undefined}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size, // square
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [centerModal, setCenterModal] = useState(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const [confettiActive, setConfettiActive] = useState(false);

  const showToast = useCallback((message, type = 'info', duration = 3000, persistent = false) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type, persistent }]);
    if (!persistent) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showCenterModal = useCallback((title, body, type = 'success', duration = 3500) => {
    setCenterModal({ title, body, type });
    setTimeout(() => setCenterModal(null), duration);
  }, []);

  const triggerConfetti = useCallback(() => {
    setConfettiKey((k) => k + 1);
    setConfettiActive(true);
  }, []);

  const colors = {
    success: 'bg-success/20 border-success/40 text-success',
    error: 'bg-error/20 border-error/40 text-error',
    info: 'bg-accent-muted border-accent/30 text-accent',
    warning: 'bg-warning-muted border-warning/40 text-warning',
  };

  return (
    <ToastContext.Provider value={{ showToast, showCenterModal, triggerConfetti }}>
      {children}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none w-[calc(100vw-2rem)] max-w-xs">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              variants={toastVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`pointer-events-auto flex items-start gap-2 px-4 py-2.5 rounded-xl border font-mono text-xs leading-snug ${colors[t.type] || colors.info}`}
            >
              <span className="flex-1 text-center">{t.message}</span>
              {t.persistent && (
                <button onClick={() => dismissToast(t.id)} className="flex-shrink-0 opacity-60 hover:opacity-100 leading-none mt-0.5">✕</button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Confetti burst — keyed so re-triggers always remount */}
      <AnimatePresence>
        {confettiActive && (
          <ConfettiBurst key={confettiKey} onDone={() => setConfettiActive(false)} />
        )}
      </AnimatePresence>

      {/* Centered confirmation modal (for weight changes, level-ups, etc.) */}
      <AnimatePresence>
        {centerModal && (
          <motion.div
            key="center-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            className="fixed inset-0 z-[9998] flex items-center justify-center p-6"
            onClick={() => setCenterModal(null)}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 22, stiffness: 320 } }}
              exit={{ opacity: 0, scale: 0.92, y: 8, transition: { duration: 0.18 } }}
              onClick={(e) => e.stopPropagation()}
              className={`relative w-full max-w-xs rounded-2xl border p-6 text-center ${centerColors[centerModal.type]?.bg || 'bg-bg-1'} ${centerColors[centerModal.type]?.border || 'border-border-strong'}`}
            >
              <div className={`text-4xl font-bold mb-3 ${centerColors[centerModal.type]?.icon || 'text-text-primary'}`}>
                {centerIcons[centerModal.type] || '✓'}
              </div>
              <p className={`font-display font-bold text-lg mb-1 ${centerColors[centerModal.type]?.title || 'text-text-primary'}`}>
                {centerModal.title}
              </p>
              {centerModal.body && (
                <p className="text-sm text-text-secondary leading-snug">{centerModal.body}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
