import { useState, useRef, useCallback, useEffect } from 'react';
import { bloom } from '../lib/bloom';
import { motion, AnimatePresence } from 'framer-motion';
import { staggerItem } from '../lib/variants';
import * as api from '../lib/api';
import { useToast } from '../context/ToastContext';
import { PickerWheel } from './RestPickerModal';
import Modal from './Modal';
import SubstituteModal from './SubstituteModal';
import TypewriterName from './TypewriterName';
import { moodState } from '../lib/mood';

const MONO = 'var(--font-mono)';

function compressImage(file, maxWidth = 1200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
    };
    img.src = URL.createObjectURL(file);
  });
}

const STAT_FIELDS = [
  { key: 'activityType', label: 'Activity' },
  { key: 'duration', label: 'Duration' },
  { key: 'activeCalories', label: 'Active Cal' },
  { key: 'totalCalories', label: 'Total Cal' },
  { key: 'avgHeartRate', label: 'Avg HR', suffix: ' bpm' },
  { key: 'maxHeartRate', label: 'Max HR', suffix: ' bpm' },
  { key: 'distance', label: 'Distance' },
  { key: 'avgPace', label: 'Avg Pace' },
  { key: 'source', label: 'Source' },
];

function formatMMSS(totalSec) {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

// `focus` (Focus layout only): { label } — renders the Focus-style card; Classic
// keeps the original look. All timer/photo logic below is shared.
export default function CardioCard({ exercise, exerciseIndex, onUpdateSet, onUpdateExercise, onSubstitute, onTimerActiveChange, focus }) {
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [running, setRunning] = useState(false);
  const [countingIn, setCountingIn] = useState(false);
  const [countInRemaining, setCountInRemaining] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSubstitute, setShowSubstitute] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(exercise.name);

  const intervalRef = useRef(null);
  const countInRef = useRef(null);
  const wakeLockRef = useRef(null);
  const startTimestampRef = useRef(null);
  const baseElapsedRef = useRef(0);
  const setRef = useRef(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const prevPhaseRef = useRef('normal');
  const exerciseInitRef = useRef(exercise);
  const onUpdateExerciseRef = useRef(onUpdateExercise);
  onUpdateExerciseRef.current = onUpdateExercise;

  useEffect(() => { setNameValue(exercise.name); }, [exercise.name]);

  // Resume timer if it was running before navigation / refresh
  useEffect(() => {
    const ex = exerciseInitRef.current;
    if (ex.timerRunning && ex.timerStartMs) {
      baseElapsedRef.current = ex.timerBaseElapsed || 0;
      startTimestampRef.current = ex.timerStartMs;
      setRunning(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = exercise.sets?.[0] || { type: 'cardio', completed: false, elapsedSec: 0, cardioStats: null };
  // Keep setRef current every render so interval callbacks always see latest set
  setRef.current = set;

  const elapsedSec = set.elapsedSec || 0;
  const targetSec = exercise.targetDurationSec || 0;
  const hasTarget = targetSec > 0;
  const progress = hasTarget ? Math.min(1, elapsedSec / targetSec) : 0;
  const remainingSec = Math.max(0, targetSec - elapsedSec);
  const completed = !!set.completed;
  const hasStats = !!set.cardioStats;
  const countInSec = exercise.countInSec || 0;
  const isActive = running || countingIn;
  const intervals = exercise.intervals || null;
  // Focus/Quest only: the timer hitting its target no longer marks the block done —
  // it waits on this card for a machine-display photo (or an explicit Mark done).
  const requirePhoto = !!focus;
  const reachedTarget = hasTarget && elapsedSec >= targetSec && !completed;

  const isPushPhase = (() => {
    if (!running || !intervals || !hasTarget) return false;
    const { workSec, restSec, finalPushSec } = intervals;
    const timeLeft = targetSec - elapsedSec;
    if (finalPushSec > 0 && timeLeft > 0 && timeLeft <= finalPushSec) return true;
    const cycleLen = restSec + workSec;
    return cycleLen > 0 && (elapsedSec % cycleLen) >= restSec;
  })();

  // Also says whether an interval session is in its push or its rest (Quest's gauntlet follows it).
  const phase = isActive && intervals && hasTarget ? (isPushPhase ? 'push' : 'rest') : null;
  // …and how far through the target it is (0–1, null with no target), for the quest chase.
  const prog = hasTarget ? Math.round(progress * 100) / 100 : null;
  useEffect(() => { onTimerActiveChange?.(exerciseIndex, isActive, phase, prog); }, [isActive, phase, prog, exerciseIndex, onTimerActiveChange]);

  // ── Wake lock ──────────────────────────────────────────────────────────────
  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch {}
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  useEffect(() => {
    if (isActive) { acquireWakeLock(); } else { releaseWakeLock(); }
    return releaseWakeLock;
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-acquire after phone unlock (wake lock is released when screen goes off)
  useEffect(() => {
    if (!isActive) return;
    const handle = () => { if (document.visibilityState === 'visible') acquireWakeLock(); };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [isActive, acquireWakeLock]);

  // ── Wall-clock timer (immune to phone sleep / tab suspension) ─────────────
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    // refs are seeded before setRunning(true) is called (start button / count-in / mount resume)
    intervalRef.current = setInterval(() => {
      const wallElapsed = Math.floor((Date.now() - startTimestampRef.current) / 1000);
      const newElapsed = baseElapsedRef.current + wallElapsed;
      onUpdateSet(exerciseIndex, 0, { ...setRef.current, elapsedSec: newElapsed });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); intervalRef.current = null; };
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live background: fill the screen from the bottom while the timer counts up.
  useEffect(() => {
    if (!running || !hasTarget) return;
    moodState.cardio = { startMs: startTimestampRef.current, baseSec: baseElapsedRef.current, targetSec };
    return () => { moodState.cardio = null; };
  }, [running, hasTarget, targetSec]);

  // Interval phase transition — vibrate on push/ease transitions
  useEffect(() => {
    if (!running || !intervals) { prevPhaseRef.current = 'normal'; return; }
    const phase = isPushPhase ? 'push' : 'normal';
    if (phase !== prevPhaseRef.current) {
      if (phase === 'push') {
        try { navigator.vibrate?.([100, 30, 100]); } catch {}
      } else {
        try { navigator.vibrate?.([50]); } catch {}
      }
      prevPhaseRef.current = phase;
    }
  }, [isPushPhase, running, intervals]);

  // Completion check. In Focus/Quest the target only stops the clock — the block
  // stays put until a photo lands (or Mark done), so it can't auto-advance mid-shot.
  useEffect(() => {
    if (running && hasTarget && elapsedSec >= targetSec) {
      setRunning(false);
      onUpdateSet(exerciseIndex, 0, { ...set, elapsedSec: targetSec, ...(requirePhoto ? {} : { completed: true }) });
      onUpdateExercise?.(exerciseIndex, { timerRunning: false, timerStartMs: null });
      try { navigator.vibrate?.([200, 100, 200]); } catch {}
      showToast(requirePhoto ? `${exercise.name} target reached — capture the image to finish` : `${exercise.name} target reached!`, 'success');
    }
  }, [elapsedSec, targetSec, running]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Count-in timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!countingIn) {
      if (countInRef.current) { clearInterval(countInRef.current); countInRef.current = null; }
      return;
    }
    countInRef.current = setInterval(() => {
      setCountInRemaining(prev => {
        if (prev <= 1) {
          clearInterval(countInRef.current);
          countInRef.current = null;
          setCountingIn(false);
          const nowMs = Date.now();
          baseElapsedRef.current = setRef.current.elapsedSec || 0;
          startTimestampRef.current = nowMs;
          setRunning(true);
          onUpdateExerciseRef.current?.(exerciseIndex, { timerRunning: true, timerStartMs: nowMs, timerBaseElapsed: baseElapsedRef.current });
          try { navigator.vibrate?.([100, 50, 200]); } catch {}
          return 0;
        }
        try { navigator.vibrate?.([40]); } catch {}
        return prev - 1;
      });
    }, 1000);
    return () => { if (countInRef.current) { clearInterval(countInRef.current); countInRef.current = null; } };
  }, [countingIn]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const handleStartButton = useCallback(() => {
    if (countingIn) { setCountingIn(false); return; }
    if (running) {
      setRunning(false);
      onUpdateExerciseRef.current?.(exerciseIndex, { timerRunning: false });
      return;
    }
    if (countInSec > 0) {
      setCountInRemaining(countInSec);
      setCountingIn(true);
    } else {
      const nowMs = Date.now();
      baseElapsedRef.current = setRef.current.elapsedSec || 0;
      startTimestampRef.current = nowMs;
      setRunning(true);
      onUpdateExerciseRef.current?.(exerciseIndex, { timerRunning: true, timerStartMs: nowMs, timerBaseElapsed: baseElapsedRef.current });
    }
  }, [countingIn, running, countInSec, exerciseIndex]);

  const resetTimer = useCallback(() => {
    setRunning(false);
    setCountingIn(false);
    onUpdateSet(exerciseIndex, 0, { ...set, elapsedSec: 0, completed: false });
    onUpdateExercise?.(exerciseIndex, { timerRunning: false, timerStartMs: null, timerBaseElapsed: 0 });
  }, [set, exerciseIndex, onUpdateSet, onUpdateExercise]);

  const toggleComplete = useCallback(() => {
    setRunning(false);
    setCountingIn(false);
    // Ticking it off by hand (timer never started) counts as the full target time
    const filled = !completed && hasTarget ? { elapsedSec: Math.max(elapsedSec, targetSec) } : {};
    if (!completed) bloom();
    onUpdateSet(exerciseIndex, 0, { ...set, ...filled, completed: !completed });
  }, [set, completed, hasTarget, elapsedSec, targetSec, exerciseIndex, onUpdateSet]);

  const handleSaveName = useCallback(() => {
    if (nameValue.trim() && nameValue.trim() !== exercise.name) onUpdateExercise?.(exerciseIndex, { name: nameValue.trim() });
    setEditingName(false);
  }, [nameValue, exercise.name, exerciseIndex, onUpdateExercise]);

  const handleSetDuration = useCallback((minutes) => {
    onUpdateExercise?.(exerciseIndex, { targetDurationSec: minutes * 60 });
  }, [exerciseIndex, onUpdateExercise]);

  const handleSetCountIn = useCallback((sec) => {
    onUpdateExercise?.(exerciseIndex, { countInSec: sec });
  }, [exerciseIndex, onUpdateExercise]);

  const handleSetIntervals = useCallback((newIntervals) => {
    onUpdateExercise?.(exerciseIndex, { intervals: newIntervals });
  }, [exerciseIndex, onUpdateExercise]);

  const processImage = useCallback(async (fileOrBlob) => {
    if (!fileOrBlob) return;
    setExtracting(true);
    try {
      const { base64, mediaType } = await compressImage(fileOrBlob);
      const data = await api.extractCardioStats(base64, mediaType);
      if (data.success && data.stats) {
        onUpdateSet(exerciseIndex, 0, { ...set, cardioStats: data.stats, completed: true });
        showToast('Stats extracted!', 'success');
      } else {
        showToast('Could not extract stats from this image', 'error');
      }
    } catch (err) { console.error('Cardio stat extraction failed:', err); showToast('Failed to process image', 'error'); }
    finally { setExtracting(false); if (cameraInputRef.current) cameraInputRef.current.value = ''; if (galleryInputRef.current) galleryInputRef.current.value = ''; }
  }, [set, exerciseIndex, onUpdateSet, showToast]);

  const handleImageCapture = useCallback((e) => { processImage(e.target.files?.[0]); }, [processImage]);

  // ── Inline viewfinder (Focus/Quest) — keeps capture inside the card ─────────
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const imageCaptureRef = useRef(null);

  const closeCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    imageCaptureRef.current = null;
    setCameraOpen(false);
  }, []);

  // The widest view the device will give us. A machine display is wide and the
  // card's frame is small, so a tight lens means framing retakes: zoom out to
  // the track's minimum (the real wide-angle control on Android), and move to an
  // ultra-wide back camera when the phone exposes one as its own device.
  const widen = useCallback(async (stream) => {
    const track = stream.getVideoTracks()[0];
    try {
      const zoom = track.getCapabilities?.().zoom;
      if (zoom?.min != null) await track.applyConstraints({ advanced: [{ zoom: zoom.min }] });
    } catch { /* no zoom control on this camera */ }
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const wide = devs.find((d) => d.kind === 'videoinput' && /ultra|wide/i.test(d.label) && !/front|user/i.test(d.label));
      if (wide && wide.deviceId && wide.deviceId !== track.getSettings().deviceId) {
        const wider = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: wide.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        stream.getTracks().forEach((t) => t.stop());
        return wider;
      }
    } catch { /* keep the stream we already have */ }
    return stream;
  }, []);

  const openCamera = useCallback(async () => {
    try {
      const stream = await widen(await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      }));
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      try { if ('ImageCapture' in window) imageCaptureRef.current = new ImageCapture(track); } catch { imageCaptureRef.current = null; }
      setCameraOpen(true);
    } catch (err) {
      console.error('Camera open failed:', err);
      // No camera/permission — fall back to the OS camera picker so the shot still happens.
      cameraInputRef.current?.click();
    }
  }, [widen]);

  // Bind the live stream once the <video> is mounted; stop tracks on unmount.
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play?.().catch(() => {});
    }
  }, [cameraOpen]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const shoot = useCallback(async () => {
    let blob = null;
    const ic = imageCaptureRef.current;
    if (ic?.takePhoto) { try { blob = await ic.takePhoto(); } catch { blob = null; } }
    if (!blob) {
      const v = videoRef.current;
      if (!v || !v.videoWidth) { showToast('Camera not ready yet', 'error'); return; }
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth; canvas.height = v.videoHeight;
      canvas.getContext('2d').drawImage(v, 0, 0);
      blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));
    }
    closeCamera();
    processImage(blob);
  }, [closeCamera, processImage, showToast]);

  const clearStats = useCallback(() => { onUpdateSet(exerciseIndex, 0, { ...set, cardioStats: null }); }, [set, exerciseIndex, onUpdateSet]);

  const chipOn = focus ? 'bg-accent text-white' : 'bg-orange-400 text-white';
  const settingsBody = (
                  <div className="p-3 flex flex-col gap-3">
                    {/* Name edit */}
                    <div>
                      <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1.5">Exercise Name</div>
                      {editingName ? (
                        <div className="flex gap-2">
                          <input autoFocus type="text" value={nameValue} onChange={e => setNameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setNameValue(exercise.name); setEditingName(false); } }}
                            className="flex-1 bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm font-display font-semibold text-text-primary outline-none focus:border-orange-400/50" />
                          <motion.button whileTap={{ scale: 0.9 }} onClick={handleSaveName} className={`px-3 py-2 ${chipOn} text-xs font-mono rounded-lg`}>Save</motion.button>
                          <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setNameValue(exercise.name); setEditingName(false); }} className="px-2 py-2 text-text-muted text-xs font-mono">✕</motion.button>
                        </div>
                      ) : (
                        <motion.button whileTap={{ scale: 0.98 }} onClick={() => setEditingName(true)}
                          className="w-full text-left bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm font-display font-semibold text-text-primary hover:border-orange-400/30 transition-colors">
                          {exercise.name} <span className="text-[10px] text-text-muted ml-2">tap to edit</span>
                        </motion.button>
                      )}
                    </div>

                    {/* Swap exercise / change set type */}
                    {onSubstitute && (
                      <motion.button whileTap={{ scale: 0.98 }} onClick={() => { setShowSettings(false); setShowSubstitute(true); }}
                        className="w-full text-left bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm font-display font-semibold text-text-primary hover:border-orange-400/30 transition-colors">
                        Swap exercise / set type <span className="text-[10px] text-text-muted ml-2">cardio ⇄ strength</span>
                      </motion.button>
                    )}

                    {/* Timer duration */}
                    <div>
                      <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1.5">Timer Duration</div>
                      <PickerWheel
                        items={Array.from({ length: 120 }, (_, i) => i + 1)}
                        value={Math.max(1, Math.round((exercise.targetDurationSec || 60) / 60))}
                        onChange={(m) => handleSetDuration(m)}
                      />
                      <div className="text-center text-xs font-mono text-text-tertiary mt-1.5">
                        {Math.round(targetSec / 60)} min target
                      </div>
                    </div>

                    {/* Count-in */}
                    <div>
                      <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1.5">Count-In</div>
                      <div className="flex gap-1.5">
                        {[0, 5, 10].map(sec => (
                          <motion.button key={sec} whileTap={{ scale: 0.9 }} onClick={() => handleSetCountIn(sec)}
                            className={`px-3 py-2 rounded-lg text-xs font-mono transition-all ${countInSec === sec ? chipOn : 'bg-bg-3 border border-border text-text-secondary'}`}>
                            {sec === 0 ? 'Off' : `${sec}s`}
                          </motion.button>
                        ))}
                      </div>
                      <div className="text-[9px] text-text-muted mt-1.5 font-mono leading-relaxed">Countdown before timer starts — gives the treadmill time to reach speed</div>
                    </div>

                    {/* Intervals */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">Intervals</div>
                        <motion.button whileTap={{ scale: 0.9 }}
                          onClick={() => handleSetIntervals(intervals ? null : { restSec: 45, workSec: 15, finalPushSec: 60 })}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${intervals ? 'bg-red-500 text-white' : 'bg-bg-3 border border-border text-text-secondary'}`}>
                          {intervals ? 'On' : 'Off'}
                        </motion.button>
                      </div>
                      {intervals && (
                        <div className="flex flex-col gap-2.5 mt-2">
                          <div>
                            <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">Easy phase</div>
                            <div className="flex gap-1.5 flex-wrap">
                              {[15, 20, 30, 45, 60, 90].map(s => (
                                <motion.button key={s} whileTap={{ scale: 0.9 }} onClick={() => handleSetIntervals({ ...intervals, restSec: s })}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${intervals.restSec === s ? chipOn : 'bg-bg-3 border border-border text-text-secondary'}`}>
                                  {s}s
                                </motion.button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">Push phase</div>
                            <div className="flex gap-1.5 flex-wrap">
                              {[5, 10, 15, 20, 30].map(s => (
                                <motion.button key={s} whileTap={{ scale: 0.9 }} onClick={() => handleSetIntervals({ ...intervals, workSec: s })}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${intervals.workSec === s ? 'bg-red-500 text-white' : 'bg-bg-3 border border-border text-text-secondary'}`}>
                                  {s}s
                                </motion.button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">Final sprint</div>
                            <div className="flex gap-1.5 flex-wrap">
                              {[0, 30, 45, 60, 90, 120].map(s => (
                                <motion.button key={s} whileTap={{ scale: 0.9 }} onClick={() => handleSetIntervals({ ...intervals, finalPushSec: s })}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${intervals.finalPushSec === s ? 'bg-red-500 text-white' : 'bg-bg-3 border border-border text-text-secondary'}`}>
                                  {s === 0 ? 'Off' : `${s}s`}
                                </motion.button>
                              ))}
                            </div>
                          </div>
                          <div className="text-[9px] text-text-muted font-mono leading-relaxed">
                            Push {intervals.workSec}s / ease {intervals.restSec}s{intervals.finalPushSec > 0 ? ` · final ${intervals.finalPushSec}s sprint` : ''}
                          </div>
                        </div>
                      )}
                      {!intervals && (
                        <div className="text-[9px] text-text-muted font-mono leading-relaxed">Alternate easy and push phases — the timer changes colour when it's time to work harder</div>
                      )}
                    </div>
                  </div>
  );

  const borderClass = completed ? 'border-success/40 bg-success-muted' : isPushPhase ? 'border-red-500/70 bg-red-500/5' : isActive ? 'border-orange-400/50 bg-orange-400/5' : 'border-orange-400/20 bg-bg-2';

  const swapModal = onSubstitute && (
    <SubstituteModal open={showSubstitute} onClose={() => setShowSubstitute(false)} exerciseName={exercise.name} isCardio
      onSelect={(name, type) => onSubstitute(exerciseIndex, name, type)} />
  );

  const fileInputs = (
    <>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageCapture} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageCapture} />
    </>
  );

  if (focus) {
    // Same ring as the rest timer (60 ticks cut by a mask). Orange in a push phase.
    const ringColor = completed ? 'var(--color-success)' : isPushPhase ? 'var(--g-int)' : 'var(--color-accent)';
    const shown = countingIn ? 1 - countInRemaining / Math.max(1, countInSec) : completed ? 1 : progress;
    const status = countingIn ? 'GET READY' : isPushPhase ? 'PUSH' : running ? 'RUNNING' : completed ? 'DONE' : reachedTarget ? 'TIME UP' : hasTarget ? 'PAUSED' : 'NO TIMER';
    const partial = hasStats && set.cardioStats.totalCalories == null && set.cardioStats.duration == null;
    const tile = 'flex-1 h-[62px] rounded-[20px] bg-bg-2 text-text-primary font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[.98] transition-transform';
    // The viewfinder IS the card: full bleed, no header, controls over the
    // picture. Nothing to aim through a letterboxed window a third of the size.
    if (cameraOpen) return (
      <div className="relative bg-black rounded-[28px] overflow-hidden select-none"
        style={{ height: focus.h || undefined, aspectRatio: focus.h ? undefined : '4 / 5' }}>
        {fileInputs}
        <button onClick={shoot} aria-label="Capture photo" className="absolute inset-0 w-full h-full">
          <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
        </button>
        <div aria-hidden className="absolute inset-x-0 top-0 h-24 pointer-events-none"
          style={{ background: 'linear-gradient(rgba(0,0,0,.6), transparent)' }} />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
          style={{ background: 'linear-gradient(transparent, rgba(0,0,0,.72))' }} />
        <div className="absolute inset-x-5 top-4 pointer-events-none flex justify-between items-center gap-3">
          <span className="truncate" style={{ font: `500 10px ${MONO}`, letterSpacing: '.16em', color: 'rgba(255,255,255,.72)' }}>
            {exercise.name.toUpperCase()}
          </span>
          <span className="flex-shrink-0" style={{ font: `400 10px ${MONO}`, color: 'rgba(255,255,255,.55)' }}>TAP TO CAPTURE</span>
        </div>
        {/* The display sits in here — a guide only; the shot keeps the whole frame. */}
        <div aria-hidden className="absolute rounded-[16px] pointer-events-none"
          style={{ left: 20, right: 20, top: '26%', bottom: '34%', border: '1.5px solid rgba(255,255,255,.45)' }} />
        <div className="absolute inset-x-5 flex items-center gap-3" style={{ bottom: 'calc(18px + env(safe-area-inset-bottom, 0px))' }}>
          <button onClick={closeCamera} aria-label="Cancel"
            className="w-[52px] h-[52px] rounded-[18px] text-white text-xl active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>✕</button>
          <button onClick={shoot} aria-label="Capture photo"
            className="mx-auto w-[72px] h-[72px] rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,.22)', border: '3px solid rgba(255,255,255,.9)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
            <span className="rounded-full" style={{ width: 54, height: 54, background: 'var(--color-accent)' }} />
          </button>
          <button onClick={() => { closeCamera(); galleryInputRef.current?.click(); }} aria-label="Upload from gallery"
            className="w-[52px] h-[52px] rounded-[18px] text-white flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
            </svg>
          </button>
        </div>
      </div>
    );

    return (
      <div className="bg-bg-1 rounded-[28px] p-5 flex flex-col overflow-hidden" style={{ height: focus.h || undefined }}>
        <div className="flex justify-between items-center gap-2">
          <span className="g-label truncate">{focus.label} · {hasTarget ? `${Math.round(targetSec / 60)} MIN` : 'NO TIMER'}{intervals ? ' · INTERVALS' : ''}</span>
          <span className="flex items-center gap-2 flex-shrink-0">
            <span className="g-tag" style={{ '--tag': 'var(--g-int)' }}>CARDIO</span>
            <button onClick={() => setShowSettings(true)} aria-label="Cardio settings" className="w-8 h-8 -my-2 -mr-1 rounded-[8px] text-text-tertiary active:bg-bg-2" style={{ font: `700 16px ${MONO}` }}>⋯</button>
          </span>
        </div>
        <div style={{ marginTop: 10, fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.02 }}>
          <TypewriterName text={exercise.name} />
        </div>
        <div className="mt-1.5 g-meta">
          {reachedTarget ? 'Time up — capture the image to finish'
            : hasTarget ? (completed ? `Target ${formatMMSS(targetSec)} reached` : `${formatMMSS(remainingSec)} to go`)
            : 'Mark it done when you finish'}
          {countInSec > 0 && !completed && !reachedTarget ? ` · ${countInSec}s count-in` : ''}
        </div>

        {fileInputs}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ containerType: 'size' }}>
        <div className="flex justify-center mt-4">
          <div className="relative" style={{ width: 'clamp(88px, 50cqh, 176px)', aspectRatio: '1' }}>
            <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full -rotate-90">
              <mask id="cardio-ticks">
                <circle cx="100" cy="100" r="90" fill="none" stroke="#fff" strokeWidth="12" strokeDasharray="6.42 3" />
              </mask>
              <g mask="url(#cardio-ticks)">
                <circle cx="100" cy="100" r="90" fill="none" stroke="var(--color-bg-3)" strokeWidth="10" />
                <circle cx="100" cy="100" r="90" fill="none" stroke={ringColor} strokeWidth="10"
                  strokeDasharray="565.5" strokeDashoffset={565.5 * (1 - shown)} style={{ transition: 'stroke-dashoffset 1s linear, stroke .3s' }} />
              </g>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`g-label ${isPushPhase ? 'animate-pulse' : ''}`} style={{ letterSpacing: '.16em', color: isPushPhase ? 'var(--g-int)' : undefined }}>{status}</span>
              <span key={countingIn ? `c${countInRemaining}` : 't'} className="g-tab"
                style={{ fontSize: countingIn ? 'clamp(40px, 22cqh, 80px)' : 'clamp(26px, 14cqh, 52px)', fontWeight: 800, letterSpacing: '-0.04em', paddingRight: '0.04em', lineHeight: 1.05,
                  color: completed ? 'var(--color-success)' : isPushPhase ? 'var(--g-int)' : 'var(--color-text-primary)',
                  animation: countingIn ? 'fx-pop .45s cubic-bezier(.2,1.6,.4,1) both' : 'none' }}>
                {countingIn ? countInRemaining : hasTarget ? formatMMSS(elapsedSec) : completed ? '✓' : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 w-full" style={{ marginTop: 'clamp(10px, 7cqh, 20px)' }}>
          {hasTarget && (
            <button onClick={resetTimer} aria-label="Reset timer" className="w-[62px] h-[62px] rounded-[20px] bg-bg-2 text-text-secondary text-xl active:scale-95 transition-transform">↻</button>
          )}
          {reachedTarget ? (
            <button onClick={openCamera} className="flex-1 h-[62px] rounded-[20px] font-extrabold text-[17px] active:scale-[.98] transition-transform"
              style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
              Capture image
            </button>
          ) : hasTarget && !completed ? (
            <button onClick={handleStartButton} className="flex-1 h-[62px] rounded-[20px] font-extrabold text-[17px] active:scale-[.98] transition-transform"
              style={running || countingIn ? { background: 'var(--color-bg-2)', color: 'var(--color-text-primary)' } : { background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
              {countingIn ? 'Cancel' : running ? 'Pause' : elapsedSec > 0 ? 'Resume' : 'Start'}
            </button>
          ) : (
            <button onClick={toggleComplete} className="flex-1 h-[62px] rounded-[20px] font-extrabold text-[17px] active:scale-[.98] transition-transform"
              style={completed ? { background: 'var(--g-ok-soft)', color: 'var(--color-success)' } : { background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>
              {completed ? '✓ Done' : 'Mark done'}
            </button>
          )}
          {hasTarget && !completed && (
            <button onClick={toggleComplete} aria-label={reachedTarget ? 'Finish without photo' : 'Mark done'} className="w-[62px] h-[62px] rounded-[20px] bg-bg-2 text-text-secondary text-xl active:scale-95 transition-transform">✓</button>
          )}
        </div>

        <div className="g-label" style={{ marginTop: 'clamp(10px, 7cqh, 20px)' }}>MACHINE / WATCH STATS</div>
        {extracting ? (
          <div className="mt-2.5 h-[62px] rounded-[20px] bg-bg-2 flex items-center justify-center gap-2.5 text-text-secondary" style={{ font: `400 12px ${MONO}` }}>
            <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />Reading the display…
          </div>
        ) : hasStats ? (
          <div className="mt-2.5 rounded-[20px] bg-bg-2 p-4">
            <div style={{ font: `500 10px ${MONO}`, letterSpacing: '.14em', color: partial ? 'var(--color-warning)' : 'var(--color-success)' }}>
              {partial ? 'PARTIAL — RETAKE WITH THE WHOLE DISPLAY' : 'STATS SAVED'}
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
              {STAT_FIELDS.map((f) => {
                const val = set.cardioStats[f.key];
                if (val == null || val === '') return null;
                return (
                  <div key={f.key} className="min-w-0">
                    <div className="g-label" style={{ fontSize: 9 }}>{f.label}</div>
                    <div className="mt-0.5 text-[15px] font-bold truncate">{val}{f.suffix || ''}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={openCamera} className="flex-1 h-10 rounded-[12px] bg-bg-3 text-[13px] font-semibold">Retake</button>
              <button onClick={() => galleryInputRef.current?.click()} className="flex-1 h-10 rounded-[12px] bg-bg-3 text-[13px] font-semibold">Upload</button>
              <button onClick={clearStats} className="flex-1 h-10 rounded-[12px] bg-bg-3 text-[13px] font-semibold text-error">Clear</button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-2.5 flex gap-2">
              <button onClick={openCamera} className={tile}>Take photo</button>
              <button onClick={() => galleryInputRef.current?.click()} className={tile}>Upload</button>
            </div>
            <p className="mt-2 text-text-tertiary" style={{ font: `400 10px ${MONO}`, lineHeight: 1.5 }}>The AI reads the display. Only the numbers are kept.</p>
          </>
        )}
        </div>

        <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Cardio settings">{settingsBody}</Modal>
        {swapModal}
      </div>
    );
  }

  return (
    <motion.div layout variants={staggerItem} className={`rounded-xl overflow-hidden border transition-colors w-full max-w-full ${borderClass}`}>
      {swapModal}
      {/* Header */}
      <motion.button whileTap={{ scale: 0.98 }} onClick={() => setExpanded(p => !p)} className="w-full flex items-center justify-between gap-3 p-3 text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="font-display font-semibold text-lg text-text-primary truncate">{exercise.name}</div>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-orange-400/10 text-orange-400 border border-orange-400/20">CARDIO</span>
            {hasStats && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20">STATS</span>}
          </div>
          <div className="text-xs text-text-tertiary font-mono mt-0.5">{hasTarget ? `Target: ${formatMMSS(targetSec)}` : 'No timer set'}</div>
        </div>
        <div className="flex items-center gap-3">
          <motion.div layout className={`px-2.5 py-1 rounded-lg font-mono text-sm font-bold ${completed ? 'bg-success text-white' : countingIn ? 'bg-orange-400/20 text-orange-400' : 'bg-bg-3 text-text-secondary'}`}>
            {completed ? '✓' : countingIn ? countInRemaining : hasTarget ? formatMMSS(elapsedSec) : '—'}
          </motion.div>
          <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }} className="text-text-tertiary text-lg">▶</motion.span>
        </div>
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="overflow-hidden border-t border-border">

            {/* Settings bar */}
            <div className="flex items-center gap-2 px-3 py-2 bg-bg-1 border-b border-border text-xs">
              <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                <span className="text-text-tertiary font-mono">TIMER</span>
                <span className="text-text-primary font-mono">{hasTarget ? `${Math.round(targetSec / 60)}m` : 'Off'}</span>
                {countInSec > 0 && <span className="text-text-tertiary font-mono">· {countInSec}s count-in</span>}
                {intervals && <span className="text-red-400/80 font-mono">· intervals on</span>}
              </div>
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowSettings(p => !p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${showSettings ? 'bg-orange-400 text-white' : 'bg-bg-3 text-text-secondary border border-border'}`}>
                ⚙ Settings
              </motion.button>
            </div>

            {/* Inline settings panel */}
            <AnimatePresence>
              {showSettings && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }} className="overflow-hidden border-b border-border bg-bg-1">
                  {settingsBody}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Count-in display */}
            {countingIn && (
              <div className="p-4 flex flex-col items-center gap-3 bg-bg-1">
                <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">Get Ready...</div>
                <div className="font-mono font-bold tabular-nums" style={{ fontSize: '5rem', lineHeight: 1, color: 'rgb(251 146 60)', animation: 'countdown-pulse 1s infinite' }}>
                  {countInRemaining}
                </div>
                <div className="text-xs font-mono text-text-secondary">Starting {exercise.name}</div>
                <motion.button whileTap={{ scale: 0.95 }} onClick={handleStartButton}
                  className="w-full py-2.5 text-sm font-mono rounded-lg border bg-error/15 text-error border-error/30">
                  ✕ Cancel
                </motion.button>
              </div>
            )}

            {/* Timer display */}
            {hasTarget && !countingIn && (
              <div className={`p-4 flex flex-col items-center gap-3 transition-colors ${isPushPhase ? 'bg-red-500/5' : 'bg-bg-1'}`}>
                <AnimatePresence mode="wait">
                  {isPushPhase ? (
                    <motion.div key="push" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                      className="text-[11px] font-mono font-bold text-red-400 uppercase tracking-widest animate-pulse">
                      PUSH HARDER!
                    </motion.div>
                  ) : (
                    <motion.div key="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">
                      {running ? 'Running' : completed ? 'Complete' : 'Paused'}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className={`font-mono font-bold text-4xl tabular-nums transition-colors ${isPushPhase ? 'text-red-400' : 'text-text-primary'}`}>{formatMMSS(elapsedSec)}</div>
                <div className="text-[11px] font-mono text-text-tertiary">{remainingSec > 0 && !completed ? `${formatMMSS(remainingSec)} remaining` : `Target: ${formatMMSS(targetSec)}`}</div>
                <div className="w-full h-2 bg-bg-3 rounded-full overflow-hidden">
                  <motion.div className={`h-full transition-colors ${completed ? 'bg-success' : isPushPhase ? 'bg-red-500' : 'bg-orange-400'}`} initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.3 }} />
                </div>
                <div className="flex gap-2 w-full mt-1">
                  <motion.button whileTap={{ scale: 0.95 }} onClick={handleStartButton}
                    className={`flex-1 py-2.5 text-sm font-mono rounded-lg border transition-colors ${running ? 'bg-error/15 text-error border-error/30' : 'bg-orange-400/15 text-orange-400 border-orange-400/30'}`}>
                    {running ? '■ Pause' : countInSec > 0 ? `▶ Start (${countInSec}s)` : '▶ Start'}
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={resetTimer} className="px-4 py-2.5 text-sm font-mono rounded-lg border border-border text-text-secondary bg-bg-3">↻</motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={toggleComplete}
                    className={`px-4 py-2.5 text-sm font-mono rounded-lg border ${completed ? 'bg-success/15 text-success border-success/30' : 'border-border text-text-secondary bg-bg-3'}`}>{completed ? '✓' : '○'}</motion.button>
                </div>
              </div>
            )}

            {/* No timer */}
            {!hasTarget && !countingIn && (
              <div className="p-4 flex items-center justify-between bg-bg-1">
                <div className="text-xs font-mono text-text-tertiary">No timer — mark when done</div>
                <motion.button whileTap={{ scale: 0.95 }} onClick={toggleComplete}
                  className={`px-4 py-2.5 text-sm font-mono rounded-lg border ${completed ? 'bg-success/15 text-success border-success/30' : 'border-border text-text-secondary bg-bg-3'}`}>
                  {completed ? '✓ Complete' : '○ Mark Complete'}
                </motion.button>
              </div>
            )}

            {/* Photo / Stats */}
            <div className="p-3 border-t border-border">
              <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-2">Machine / Watch Stats</div>
              {fileInputs}

              {!hasStats && !extracting && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => cameraInputRef.current?.click()}
                      className="flex-1 border-2 border-dashed border-border rounded-xl p-3 text-center hover:border-orange-400/40 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 mx-auto text-text-tertiary mb-1">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.174-1.26.207-2.152 1.304-2.152 2.582V16.5a2.25 2.25 0 0 0 2.25 2.25h15.75A2.25 2.25 0 0 0 22 16.5V9.986c0-1.278-.892-2.375-2.152-2.582a45.32 45.32 0 0 0-1.134-.174 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.823 1.316Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                      </svg>
                      <div className="text-[11px] font-mono text-text-secondary">Take Photo</div>
                      <div className="text-[9px] text-text-muted mt-0.5">Full resolution</div>
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => galleryInputRef.current?.click()}
                      className="flex-1 border-2 border-dashed border-border rounded-xl p-3 text-center hover:border-orange-400/40 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 mx-auto text-text-tertiary mb-1">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 0 3Z" />
                      </svg>
                      <div className="text-[11px] font-mono text-text-secondary">Upload Image</div>
                      <div className="text-[9px] text-text-muted mt-0.5">From gallery</div>
                    </motion.button>
                  </div>
                  <div className="text-[9px] text-text-muted text-center font-mono leading-relaxed">AI reads the display and extracts stats. Image is discarded — only data is saved.</div>
                </div>
              )}

              {extracting && (
                <div className="w-full border-2 border-dashed border-orange-400/40 rounded-xl p-5 text-center">
                  <div className="w-7 h-7 border-2 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <div className="text-xs font-mono text-text-secondary animate-pulse">Reading stats from photo...</div>
                  <div className="text-[9px] text-text-muted mt-1">Full-res image sent for best accuracy</div>
                </div>
              )}

              {hasStats && !extracting && (
                <div className={`border rounded-xl overflow-hidden bg-bg-0 ${
                  set.cardioStats.totalCalories == null && set.cardioStats.duration == null
                    ? 'border-warning/40' : 'border-success/30'
                }`}>
                  <div className="p-3">
                    <div className={`text-[10px] font-mono uppercase tracking-wider mb-2 ${
                      set.cardioStats.totalCalories == null && set.cardioStats.duration == null
                        ? 'text-warning' : 'text-success'
                    }`}>
                      {set.cardioStats.totalCalories == null && set.cardioStats.duration == null
                        ? '⚠ Partial data — retake photo'
                        : '✓ Stats Extracted'}
                    </div>
                    <div className="flex flex-col gap-1">
                      {STAT_FIELDS.map((f) => {
                        const val = set.cardioStats[f.key];
                        if (val == null || val === '') return null;
                        return (<div key={f.key} className="flex justify-between text-xs"><span className="text-text-tertiary font-mono">{f.label}</span><span className="text-text-primary font-mono">{val}{f.suffix || ''}</span></div>);
                      })}
                    </div>
                    {(set.cardioStats.totalCalories == null || set.cardioStats.duration == null) && (
                      <div className="mt-2 text-[9px] font-mono text-text-muted leading-relaxed">
                        {set.cardioStats.totalCalories == null && 'Calories not found. '}
                        {set.cardioStats.duration == null && 'Duration not found. '}
                        Try retaking with the full machine display in frame.
                      </div>
                    )}
                  </div>
                  <div className="flex border-t border-border">
                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => cameraInputRef.current?.click()} className="flex-1 py-2.5 text-[11px] font-mono text-text-secondary hover:bg-bg-3">📷 Retake</motion.button>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => galleryInputRef.current?.click()} className="flex-1 py-2.5 text-[11px] font-mono text-text-secondary hover:bg-bg-3 border-l border-border">🖼 Re-upload</motion.button>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={clearStats} className="flex-1 py-2.5 text-[11px] font-mono text-error/70 hover:bg-error/5 border-l border-border">✕ Clear</motion.button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
