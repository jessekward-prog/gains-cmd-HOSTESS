import { motion } from 'framer-motion';
import { useEffect, useRef, useState, useCallback } from 'react';

export const COUNT_IN_SEC = 5;

export function playBeep(type) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = type === 'work' ? 880 : type === 'countdown' ? 660 : 440;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {}
}

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch {}
}

export function computePhase(countInStartMs, timerStartMs, workSeconds, restSeconds, totalSeconds) {
  const now = Date.now();
  if (!countInStartMs && !timerStartMs) return { phase: 'idle', phaseRemaining: workSeconds, totalRemaining: totalSeconds };

  if (timerStartMs && now >= timerStartMs) {
    const totalElapsed = (now - timerStartMs) / 1000;
    if (totalElapsed >= totalSeconds) return { phase: 'done', phaseRemaining: 0, totalRemaining: 0 };
    const totalRemaining = totalSeconds - totalElapsed;
    const cycleLen = workSeconds + restSeconds;
    const posInCycle = totalElapsed % cycleLen;
    if (posInCycle < workSeconds) {
      return { phase: 'work', phaseRemaining: workSeconds - posInCycle, totalRemaining };
    }
    return { phase: 'rest', phaseRemaining: cycleLen - posInCycle, totalRemaining };
  }

  // Count-in: timerStartMs is set but hasn't been reached yet
  if (timerStartMs) {
    const remaining = (timerStartMs - now) / 1000;
    return { phase: 'countin', phaseRemaining: remaining, totalRemaining: totalSeconds };
  }

  return { phase: 'idle', phaseRemaining: workSeconds, totalRemaining: totalSeconds };
}

export default function IntervalTimerBar({
  workSeconds, restSeconds, totalSeconds,
  onComplete, completed, onPhaseChange,
  countInStartMs, timerStartMs,
  onTimerStart, onTimerStop,
}) {
  const [, forceUpdate] = useState(0);
  const intervalRef = useRef(null);
  const prevPhaseRef = useRef('idle');
  const onCompleteRef = useRef(onComplete);
  const onPhaseChangeRef = useRef(onPhaseChange);
  onCompleteRef.current = onComplete;
  onPhaseChangeRef.current = onPhaseChange;

  const isActive = !!(countInStartMs || timerStartMs) && !completed;

  // Tick every 250ms while active for smooth display
  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    intervalRef.current = setInterval(() => forceUpdate(n => n + 1), 250);
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [isActive]);

  // Phase transition effects — beep/vibrate and notify parent
  const { phase, phaseRemaining, totalRemaining } = computePhase(countInStartMs, timerStartMs, workSeconds, restSeconds, totalSeconds);

  useEffect(() => {
    if (phase === prevPhaseRef.current) return;
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (phase === 'work' && prev !== 'idle' && prev !== 'countin') { playBeep('work'); vibrate([200]); }
    if (phase === 'rest') { playBeep('rest'); vibrate([100]); }
    if (phase === 'done') { playBeep('rest'); vibrate([200, 100, 200]); onCompleteRef.current?.(); }
    onPhaseChangeRef.current?.(phase);
  }, [phase]);

  const formatTime = useCallback((s) => {
    if (s <= 0) return '0s';
    const sec = Math.ceil(s);
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
  }, []);

  const handleStart = useCallback(() => {
    const now = Date.now();
    onTimerStart?.({ intervalCountInStartMs: now, intervalTimerStartMs: now + COUNT_IN_SEC * 1000 });
    prevPhaseRef.current = 'countin';
  }, [onTimerStart]);

  const handleStop = useCallback(() => {
    onTimerStop?.();
    prevPhaseRef.current = 'idle';
  }, [onTimerStop]);

  if (phase === 'done' || completed) {
    return (
      <div className="w-full h-full flex items-center justify-center rounded-lg bg-success/20 border border-success/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-success/20" />
        <span className="text-xs font-mono text-success z-10 font-bold">✓ complete</span>
      </div>
    );
  }

  if (phase === 'idle') {
    return (
      <motion.button whileTap={{ scale: 0.98 }} onClick={handleStart}
        className="w-full h-full flex items-center justify-center gap-2 rounded-lg bg-bg-1 border border-border hover:border-accent/40 transition-colors">
        <span className="text-xs font-mono text-text-secondary">▶ {formatTime(workSeconds)} / {formatTime(restSeconds)} · {formatTime(totalSeconds)}</span>
      </motion.button>
    );
  }

  if (phase === 'countin') {
    return (
      <motion.button whileTap={{ scale: 0.98 }} onClick={handleStop}
        className="w-full h-full flex items-center justify-center rounded-lg relative overflow-hidden border border-warning/40 bg-warning/10">
        <span className="text-sm font-mono font-bold text-warning z-10">{Math.ceil(phaseRemaining)}</span>
      </motion.button>
    );
  }

  const isWork = phase === 'work';
  const accentColor = isWork ? 'var(--color-success, #4caf50)' : '#ef4444';
  const bgColor = isWork ? 'rgba(76,175,80,0.12)' : 'rgba(239,68,68,0.12)';
  const borderColor = isWork ? 'rgba(76,175,80,0.35)' : 'rgba(239,68,68,0.35)';
  const phaseDuration = isWork ? workSeconds : restSeconds;
  const phaseProgress = phaseDuration > 0 ? (phaseDuration - phaseRemaining) / phaseDuration : 0;
  const totalProgress = totalSeconds > 0 ? totalRemaining / totalSeconds : 0;

  return (
    <motion.button whileTap={{ scale: 0.98 }} onClick={handleStop}
      className="w-full h-full flex flex-col justify-center rounded-lg relative overflow-hidden border px-2 gap-0.5"
      style={{ background: bgColor, borderColor }}>
      <div className="w-full h-1.5 bg-bg-3 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-none" style={{ width: `${phaseProgress * 100}%`, background: accentColor }} />
      </div>
      <div className="w-full h-0.5 bg-bg-3 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-text-tertiary/40" style={{ width: `${totalProgress * 100}%` }} />
      </div>
      <div className="flex items-center justify-between w-full mt-0.5">
        <span className="text-[10px] font-mono font-bold" style={{ color: accentColor }}>
          {isWork ? 'WORK' : 'REST'} {formatTime(phaseRemaining)}
        </span>
        <span className="text-[10px] font-mono text-text-tertiary">total {formatTime(totalRemaining)}</span>
      </div>
    </motion.button>
  );
}
