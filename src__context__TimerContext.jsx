import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { moodState } from '../lib/mood';
import { native } from '../lib/native';

const TimerContext = createContext(null);

const STORAGE_KEY = 'gains.restTimer';

export function TimerProvider({ children }) {
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [endedAt, setEndedAt] = useState(0); // when the last rest ran out — drives the Focus card's GO flash
  // Which exercise started this rest, and whether that card's own ring is on
  // screen (list layout) — the floating timer tucks away while it is.
  const [owner, setOwner] = useState(null);
  const ownerRef = useRef(null);
  const [docked, setDocked] = useState(false);
  const intervalRef = useRef(null);
  const endsAtRef = useRef(0);
  const onCompleteRef = useRef(null);

  // Deadline-based: iOS suspends JS when the app is backgrounded, so a
  // decrementing counter drifts/freezes. Remaining is derived from the clock.
  // In the Android app the rest also runs natively, so it rings with the screen off.
  // `fresh` = a new rest, not an extended one: only those set the Quick Settings tile's length.
  const tellNative = useCallback((total, fresh = false) => {
    native.send(endsAtRef.current ? { t: 'rest', endsAt: endsAtRef.current, total, fresh } : { t: 'rest-stop' });
  }, []);

  const tick = useCallback(() => {
    const left = Math.ceil((endsAtRef.current - Date.now()) / 1000);
    if (left > 0) {
      setRemaining(left);
      return;
    }
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    // The app rings 1s after the deadline unless told to stop: on time and on screen this page rings
    // instead, otherwise the app has it.
    const appRings = native.rings && (document.hidden || Date.now() - endsAtRef.current > 1000);
    endsAtRef.current = 0;
    moodState.rest = null;
    localStorage.removeItem(STORAGE_KEY);
    setRemaining(0);
    setIsRunning(false);
    setOwner(null); ownerRef.current = null;
    setEndedAt(Date.now());
    if (!appRings) tellNative();
    if (!appRings) try {
      const audio = window.cachedTimerSound || new Audio('/timer-sound.mp3');
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {}
    onCompleteRef.current?.();
  }, [tellNative]);

  const start = useCallback((seconds, onComplete, ownerId = null) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    onCompleteRef.current = onComplete || null;
    endsAtRef.current = Date.now() + seconds * 1000;
    moodState.rest = { end: endsAtRef.current, total: seconds * 1000 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ endsAt: endsAtRef.current, total: seconds, owner: ownerId }));
    setOwner(ownerId); ownerRef.current = ownerId;
    setTotal(seconds);
    setRemaining(seconds);
    setIsRunning(true);
    intervalRef.current = setInterval(tick, 250);
    tellNative(seconds, true);
  }, [tick, tellNative]);

  // A rest started from the app's Quick Settings tile. Owned by 'tile', not by a workout.
  const adopt = useCallback((endsAt, seconds) => {
    if (endsAt === endsAtRef.current || endsAt <= Date.now()) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    onCompleteRef.current = null;
    endsAtRef.current = endsAt;
    moodState.rest = { end: endsAt, total: seconds * 1000 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ endsAt, total: seconds, owner: 'tile' }));
    setOwner('tile'); ownerRef.current = 'tile';
    setTotal(seconds);
    setRemaining(Math.ceil((endsAt - Date.now()) / 1000));
    setIsRunning(true);
    intervalRef.current = setInterval(tick, 250);
  }, [tick]);

  const stop = useCallback(() => {
    const wasRunning = !!endsAtRef.current;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    endsAtRef.current = 0;
    moodState.rest = null;
    localStorage.removeItem(STORAGE_KEY);
    setIsRunning(false);
    setOwner(null); ownerRef.current = null;
    setRemaining(0);
    setTotal(0);
    if (wasRunning) tellNative();
  }, [tellNative]);

  const extend = useCallback((seconds) => {
    if (!endsAtRef.current) return;
    endsAtRef.current += seconds * 1000;
    setTotal((t) => {
      const next = t + seconds;
      moodState.rest = { end: endsAtRef.current, total: next * 1000 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ endsAt: endsAtRef.current, total: next, owner: ownerRef.current }));
      tellNative(next);
      return next;
    });
    tick();
  }, [tick, tellNative]);

  // Restore a timer that outlived the page — iOS can evict the PWA entirely,
  // which drops the in-memory deadline. An already-expired timer is discarded
  // silently rather than beeping for a rest that ended minutes ago.
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved) return;
    if (saved.endsAt <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    endsAtRef.current = saved.endsAt;
    moodState.rest = { end: saved.endsAt, total: saved.total * 1000 };
    setTotal(saved.total);
    setOwner(saved.owner ?? null); ownerRef.current = saved.owner ?? null;
    setRemaining(Math.ceil((saved.endsAt - Date.now()) / 1000));
    setIsRunning(true);
    intervalRef.current = setInterval(tick, 250);
  }, [tick]);

  // Resync the instant the app is foregrounded, without waiting for a tick
  // that iOS may still be throttling.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden && endsAtRef.current) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [tick]);

  // The app connects after the page has loaded, and again after a reload; it may have missed a start.
  // Its notification buttons (+15 s, Skip) come back here.
  useEffect(() => {
    const offReady = native.onReady(() => {
      native.send({ t: 'state', endsAt: endsAtRef.current, total: Math.round((moodState.rest?.total || 0) / 1000) });
    });
    const offMsg = native.subscribe((m) => {
      if (m.t === 'rest-start') { adopt(m.endsAt, m.total); return; }
      // A button press can arrive late: it only counts for the rest it was pressed on.
      if (!endsAtRef.current || Math.abs(m.endsAt - endsAtRef.current) > 1500) return;
      if (m.t === 'rest-skip') stop();
      else if (m.t === 'rest-add') extend(15);
    });
    return () => { offReady(); offMsg(); };
  }, [stop, extend, adopt]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const progress = total > 0 ? (total - remaining) / total : 0;

  return (
    <TimerContext.Provider value={{ remaining, total, isRunning, progress, endedAt, start, stop, extend, owner, docked, setDocked }}>
      {children}
    </TimerContext.Provider>
  );
}

export const useGlobalTimer = () => useContext(TimerContext);
