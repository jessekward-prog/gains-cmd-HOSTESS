import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

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

  // Mirrors of the two dismissable layers, so dismissTop can decide from the
  // current value (a state updater can't report back synchronously).
  const toastsRef = useRef([]);
  const centerRef = useRef(null);
  useEffect(() => { toastsRef.current = toasts; }, [toasts]);
  useEffect(() => { centerRef.current = centerModal; }, [centerModal]);

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

  // Back / swipe-back clears the topmost layer — the centre modal first, then
  // the newest notification. Navigation calls this before it pops a page.
  const dismissTop = useCallback(() => {
    if (centerRef.current) {
      centerRef.current = null;
      setCenterModal(null);
      return true;
    }
    const open = toastsRef.current;
    if (open.length) {
      const { id } = open[open.length - 1];
      toastsRef.current = open.slice(0, -1);
      setToasts((prev) => prev.filter((t) => t.id !== id));
      return true;
    }
    return false;
  }, []);

  const triggerConfetti = useCallback(() => {
    setConfettiKey((k) => k + 1);
    setConfettiActive(true);
  }, []);

  // Notifications drop down from the top of the screen, like Quest's encounter
  // name: opaque, over the page, never moving anything underneath.
  const edge = {
    success: 'var(--color-success)',
    error: 'var(--color-error)',
    info: 'var(--color-accent)',
    warning: 'var(--color-warning)',
  };
  const drop = {
    initial: { y: '-100%' },
    animate: { y: 0, transition: { type: 'spring', damping: 24, stiffness: 320 } },
    exit: { y: '-100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } },
  };

  return (
    <ToastContext.Provider value={{ showToast, showCenterModal, triggerConfetti, dismissTop }}>
      {children}
      <div className="fixed top-0 left-0 right-0 z-[9999] flex flex-col pointer-events-none overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              variants={drop}
              initial="initial"
              animate="animate"
              exit="exit"
              className="pointer-events-auto flex items-start gap-2 px-4 py-3 font-mono text-[13px] leading-snug"
              style={{ background: 'var(--color-bg-2)', color: 'var(--color-text-primary)', borderBottom: `2px solid ${edge[t.type] || edge.info}` }}
            >
              <span className="flex-shrink-0" style={{ color: edge[t.type] || edge.info }}>&gt;</span>
              <span className="flex-1">{t.message}</span>
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
