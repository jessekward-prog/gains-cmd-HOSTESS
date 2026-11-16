import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import useRepSensor from '../hooks/useRepSensor';
import { encodeSamples, magnitude, setStartOffset } from '../lib/witmotion';
import { saveRepTrace } from '../lib/api';
import { repArm, repAnswered } from '../lib/quest';
import { createCounter, heldStill, refPose, restLevel, CALIBRATE_MS } from '../lib/repcount';
import { useWorkout } from './WorkoutContext';

// One BLE link for the whole app. A WT901 accepts a single GATT connection, so
// the probe screen and a running quest cannot each hold their own.
const Ctx = createContext(null);
export const useRepSensorCtx = () => useContext(Ctx);

// Reps happen in the seconds before you log the set, so the buffer only ever
// needs the recent past. Two minutes covers a long set plus its approach.
const WINDOW_MS = 120_000;
const MIN_SAMPLES = 20;
// The quest (by start time) the user said "use the sensor" for, prefixed '!'
// when they said no. A refresh drops the Bluetooth link, but it must not drop
// the answer — otherwise there is no way back to recording without abandoning
// the quest, and a no has to be remembered too or auto-arm would overturn it.
const ALPHA_KEY = 'gc.repAlphaQuest';
const readKey = () => { try { return localStorage.getItem(ALPHA_KEY); } catch { return null; } };
const writeKey = (v) => { try { localStorage.setItem(ALPHA_KEY, v); } catch { /* storage off */ } };
// Guided mode, likewise remembered only for the quest it was chosen for.
const GUIDED_KEY = 'gc.repGuidedQuest';
const readGuided = () => { try { return localStorage.getItem(GUIDED_KEY); } catch { return null; } };
const writeGuided = (v) => { try { localStorage.setItem(GUIDED_KEY, v); } catch { /* storage off */ } };
// Auto accept / auto progress, remembered with the quest they were chosen for.
const AUTO_KEY = 'gc.repAuto';
const readAuto = () => { try { return JSON.parse(localStorage.getItem(AUTO_KEY) || 'null'); } catch { return null; } };
const writeAuto = (v) => { try { localStorage.setItem(AUTO_KEY, JSON.stringify(v)); } catch { /* storage off */ } };

export function RepSensorProvider({ children }) {
  const buf = useRef([]);
  const listeners = useRef(new Set());
  // Opt-in is per quest: alpha recording should never be a thing that quietly
  // stays on. It is remembered only for the quest it was given for, so it
  // survives a reload of that quest and nothing else.
  const [alpha, setAlphaState] = useState(false);
  const [saved, setSaved] = useState(0);
  // Guided mode: the user taps START SET, holds still while the start position
  // is captured, and the counter then runs live for that set.
  //
  // It exists because of what the 2026-11-09 corpus review found: commitSet was
  // storing the trailing 120 s at the moment the set was logged, but sets are
  // logged a long time after they finish — median 69 s, up to 98 s — so 7 of 15
  // stored sets contained no rep motion at all, the set having been trimmed out
  // of the rolling buffer before the tap. An explicit start anchors capture to
  // the set instead of to the tap, which is the actual defect.
  const [guided, setGuidedState] = useState(false);
  // Auto accept: 5 s after a counted set ends it is logged with the count.
  // Auto progress: from set 2 on, when rest ends, the next 5 s count-in starts.
  const [auto, setAutoState] = useState({ accept: false, progress: false });
  const [phase, setPhaseState] = useState('idle'); // idle | hold | counting | done
  const [holdLeft, setHoldLeft] = useState(0);
  const [holdFailed, setHoldFailed] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const counter = useRef(null);
  const hold = useRef(null);
  const liveRef = useRef(0);
  const guidedRef = useRef(false);
  const phaseRef = useRef('idle');
  const setStartAt = useRef(0);
  guidedRef.current = guided;
  const setPhase = useCallback((p) => { phaseRef.current = p; setPhaseState(p); }, []);
  const { activeWorkout } = useWorkout();
  const questKey = activeWorkout?.startTime ? String(activeWorkout.startTime) : null;
  // An answer given in this page life: at the prompt, which runs before the
  // quest exists, or on the REC dot mid-quest. It is written down as soon as
  // there is a quest to key it to.
  const answered = useRef(false);
  // When the previous set was logged. A rest that ended before it is stale.
  const lastCommitAt = useRef(0);
  const setAlpha = useCallback((on) => { answered.current = true; setAlphaState(on); }, []);
  // In play for this quest even with recording off and the link gone — without
  // this a paused quest loses its control on the next reload, which looks like
  // the app forgetting the sensor entirely.
  const inPlay = repAnswered(questKey ? readKey() : null, questKey);

  const onSample = useCallback((samples, bytes) => {
    for (const s of samples) {
      s.amag = magnitude(s);
      buf.current.push(s);
    }
    const cutoff = Date.now() - WINDOW_MS;
    while (buf.current.length && buf.current[0].t < cutoff) buf.current.shift();
    if (guidedRef.current) {
      if (phaseRef.current === 'hold' && hold.current) {
        for (const s of samples) hold.current.samples.push(s);
      } else if (phaseRef.current === 'counting' && counter.current) {
        let n = liveRef.current;
        for (const s of samples) n = counter.current.push(s);
        if (n !== liveRef.current) { liveRef.current = n; setLiveCount(n); }
        // The set is over when the sensor goes quiet, not when the user
        // eventually taps the set complete — that tap is what this fixes.
        if (counter.current.setEnded(Date.now())) setPhase('done');
      }
    }
    listeners.current.forEach((fn) => fn(samples, bytes));
  }, [setPhase]);

  const sensor = useRepSensor(onSample);

  // Arming, and remembering what was armed. A sensor already linked when the
  // quest starts records without being asked again — the alternative is the
  // trace scrolling live while nothing is saved.
  useEffect(() => {
    if (!questKey) return;
    const act = repArm({ stored: readKey(), questKey, alpha, answered: answered.current, linked: sensor.status === 'linked' });
    if (act.arm) setAlphaState(true);
    else if (act.store) { answered.current = false; writeKey(act.store); }
  }, [alpha, questKey, sensor.status]);

  useEffect(() => {
    if (!questKey) return;
    const r = readAuto();
    if (r?.k === questKey) setAutoState({ accept: !!r.accept, progress: !!r.progress });
  }, [questKey]);
  useEffect(() => {
    if (questKey) writeAuto({ k: questKey, ...auto });
  }, [auto, questKey]);

  // Guided mode is remembered for its own quest, so a reload mid-quest comes
  // back still guided rather than silently dropping to plain recording.
  useEffect(() => {
    if (!questKey) return;
    if (guided) { if (readGuided() !== questKey) writeGuided(questKey); }
    else if (readGuided() === questKey) setGuidedState(true);
  }, [guided, questKey]);

  /** Begin a set: hold still, then the counter runs. */
  const startSet = useCallback(() => {
    if (sensor.status !== 'linked') return;
    // Capture starts HERE. This one line is the fix for the empty traces.
    buf.current = [];
    hold.current = { samples: [] };
    counter.current = null;
    liveRef.current = 0;
    setLiveCount(0);
    setHoldFailed(false);
    setHoldLeft(Math.ceil(CALIBRATE_MS / 1000));
    setPhase('hold');
  }, [sensor.status, setPhase]);

  /**
   * Chain straight into the next set of a superset or drop set after 5 s of
   * stillness, using those 5 quiet seconds as the resting baseline so the
   * lifter doesn't have to sit through another HOLD STILL countdown.
   */
  const nextSet = useCallback(() => {
    if (sensor.status !== 'linked') return;
    const now = Date.now();
    const src = buf.current.length ? buf.current : (hold.current?.samples || []);
    const hs = src.filter((s) => s.t >= now - CALIBRATE_MS);
    const g0 = hs.length && heldStill(hs) ? restLevel(hs) : null;
    if (g0 == null) { setHoldFailed(true); setPhase('idle'); return; }
    buf.current = [...hs];
    hold.current = { samples: hs };
    counter.current = createCounter({ g0, ref: refPose(hs) });
    liveRef.current = 0;
    setLiveCount(0);
    setHoldFailed(false);
    setStartAt.current = now;
    setPhase('counting');
  }, [sensor.status, setPhase]);

  // Read the counter's live internals without re-rendering at 50 Hz — the trace
  // paints from a rAF loop and pulls, rather than being pushed state.
  const peek = useCallback(() => (counter.current
    ? { count: counter.current.count, marks: counter.current.marks, trace: counter.current.trace }
    : null), []);

  const cancelSet = useCallback(() => {
    counter.current = null;
    hold.current = null;
    setPhase('idle');
  }, [setPhase]);

  // The calibration hold. A resting level taken while the load is still moving
  // is worse than none: every rep in the set is then measured from a wrong
  // zero, so a hold that was not still is rejected rather than used.
  useEffect(() => {
    if (phase !== 'hold') return undefined;
    const t0 = Date.now();
    const id = setInterval(() => {
      const left = CALIBRATE_MS - (Date.now() - t0);
      setHoldLeft(Math.max(0, Math.ceil(left / 1000)));
      if (left > 0) return;
      clearInterval(id);
      const hs = hold.current?.samples || [];
      const g0 = heldStill(hs) ? restLevel(hs) : null;
      if (g0 == null) { setHoldFailed(true); setPhase('idle'); return; }
      // The resting level and which way is up at the start: the counter
      // measures the load's acceleration along up, from rest.
      counter.current = createCounter({ g0, ref: refPose(hs) });
      liveRef.current = 0;
      setLiveCount(0);
      setStartAt.current = Date.now();
      setPhase('counting');
    }, 150);
    return () => clearInterval(id);
  }, [phase, setPhase]);

  // The probe draws its own chart from the same stream rather than opening a
  // second connection.
  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  /**
   * A set was logged. Everything buffered since the last commit is that set's
   * motion, labelled with the reps the user typed — which is the whole reason
   * this is worth recording: the ground truth comes free.
   */
  const commitSet = useCallback(async (meta) => {
    // Whatever happens to the trace, a guided set is over once it is logged —
    // reset first, or a set too short to store leaves the tag stuck on its
    // finished count with no way back to START SET.
    const endGuided = () => { if (guided) { counter.current = null; setPhase('idle'); } };
    if (!alpha || sensor.status !== 'linked') { endGuided(); return; }
    const samples = buf.current;
    // Keep the trailing 5 s so a superset/drop chain calling nextSet() right
    // after commitSet can use those 5 quiet seconds as its zero baseline.
    const quietFrom = Date.now() - CALIBRATE_MS;
    hold.current = { samples: samples.filter((s) => s.t >= quietFrom) };
    buf.current = [];
    if (samples.length < MIN_SAMPLES) { endGuided(); return; }
    const span = (samples.at(-1).t - samples[0].t) / 1000;
    // restEndedAt is the app's clock; the trace only knows time from its own
    // first sample, so it is stored as an offset into the window.
    const { restEndedAt, ...label } = meta || {};
    // In guided mode the start is known exactly — the moment the hold ended —
    // rather than inferred from when rest finished.
    const startMs = guided && setStartAt.current
      ? Math.round(setStartAt.current - samples[0].t)
      : setStartOffset(restEndedAt, samples[0].t, lastCommitAt.current);
    const predicted = guided && counter.current ? counter.current.count : null;
    lastCommitAt.current = Date.now();
    endGuided();
    try {
      await saveRepTrace({
        ...label,
        setStartMs: startMs,
        guided: !!guided,
        predicted,
        hz: span > 0 ? Math.round(samples.length / span) : 0,
        n: samples.length,
        samples: encodeSamples(samples),
      });
      setSaved((n) => n + 1);
    } catch {
      // A failed upload must never interrupt a workout. The trace is lost; the
      // set is not.
    }
  }, [alpha, sensor.status, guided, setPhase]);

  return (
    <Ctx.Provider value={{
      sensor, subscribe, alpha, setAlpha, commitSet, saved, inPlay,
      guided, setGuided: setGuidedState, auto, setAuto: setAutoState, phase, holdLeft, holdFailed,
      liveCount, startSet, nextSet, cancelSet, peek,
    }}>
      {children}
    </Ctx.Provider>
  );
}
