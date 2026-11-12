import { motion } from 'framer-motion';
import { useCallback, useEffect } from 'react';
import { useTimer } from '../hooks/useTimer';

// Keep the screen on while a countdown runs: a locked phone suspends the page,
// so a 5-minute timer would otherwise go silent until you unlock it.
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock = null, gone = false;
    const get = () => navigator.wakeLock.request('screen').then((l) => { if (gone) l.release().catch(() => {}); else lock = l; }).catch(() => {});
    const onVis = () => { if (document.visibilityState === 'visible') get(); };
    get();
    document.addEventListener('visibilitychange', onVis);
    return () => { gone = true; document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}); };
  }, [active]);
}

// Shared by BFR and plain timed sets: a countdown that logs the set when it runs out.
export default function BFRTimerBar({ seconds, onComplete, completed, startMs, onStart, onStop }) {
  const handleComplete = useCallback(() => { onComplete?.(); }, [onComplete]);
  const { remaining, isRunning, progress, start, stop } = useTimer(handleComplete);
  useWakeLock(isRunning);

  // Resume if startMs is set and timer not yet running (navigation / refresh)
  useEffect(() => {
    if (!startMs || completed || isRunning) return;
    const elapsed = (Date.now() - startMs) / 1000;
    const remaining = seconds - elapsed;
    if (remaining > 0) {
      start(remaining);
    } else {
      onComplete?.();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Under a minute reads as "45s"; longer as "5:00" so a run isn't "300s".
  const formatTime = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${s}s`);

  if (!isRunning && !completed) {
    return (
      <motion.button whileTap={{ scale: 0.98 }}
        onClick={() => { onStart?.(); start(seconds); }}
        className="w-full h-full flex items-center justify-center gap-2 rounded-lg bg-bg-1 border border-accent/30 hover:border-accent/60 transition-colors relative overflow-hidden">
        <span className="text-xs font-mono text-accent/70 z-10">▶ {formatTime(seconds)}</span>
      </motion.button>
    );
  }

  if (completed && !isRunning) {
    return (
      <div className="w-full h-full flex items-center justify-center rounded-lg bg-success/20 border border-success/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-success/20" />
        <span className="text-xs font-mono text-success z-10 font-bold">✓ done</span>
      </div>
    );
  }

  return (
    <motion.button whileTap={{ scale: 0.98 }} onClick={() => { stop(); onStop?.(); }}
      className="w-full h-full flex items-center justify-center rounded-lg bg-bg-1 border border-accent/40 relative overflow-hidden">
      <motion.div className="absolute inset-0 origin-left bg-accent/25" style={{ scaleX: progress }} transition={{ duration: 0.1 }} />
      <motion.span key={remaining} initial={{ scale: 1.1 }} animate={{ scale: 1 }}
        className="text-sm font-mono font-bold text-accent z-10"
        style={remaining <= 5 ? { animation: 'countdown-pulse 1s infinite' } : undefined}>
        {formatTime(remaining)}
      </motion.span>
    </motion.button>
  );
}
