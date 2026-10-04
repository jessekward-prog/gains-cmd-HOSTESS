import { useState, useRef, useCallback, useEffect } from 'react';

function playTimerSound() {
  try {
    const audio = window.cachedTimerSound || new Audio('/timer-sound.mp3');
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {}
}

function vibrate() {
  try { navigator.vibrate?.([200, 150, 200, 150, 200, 150, 200, 150]); } catch {}
}

export function useTimer(onComplete) {
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef(null);
  const endsAtRef = useRef(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // Deadline-based: iOS suspends JS when the app is backgrounded, so a
  // decrementing counter drifts/freezes. Remaining is derived from the clock.
  const tick = useCallback(() => {
    const left = Math.ceil((endsAtRef.current - Date.now()) / 1000);
    if (left > 0) {
      setRemaining(left);
      return;
    }
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    endsAtRef.current = 0;
    setRemaining(0);
    setIsRunning(false);
    playTimerSound();
    vibrate();
    onCompleteRef.current?.();
  }, []);

  const start = useCallback((seconds) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    endsAtRef.current = Date.now() + seconds * 1000;
    setTotal(seconds);
    setRemaining(seconds);
    setIsRunning(true);
    intervalRef.current = setInterval(tick, 250);
  }, [tick]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    endsAtRef.current = 0;
    setIsRunning(false);
    setRemaining(0);
  }, []);

  // Resync the instant the app is foregrounded, without waiting for a tick
  // that iOS may still be throttling.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden && endsAtRef.current) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [tick]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const progress = total > 0 ? (total - remaining) / total : 0;

  return { remaining, total, isRunning, progress, start, stop };
}
