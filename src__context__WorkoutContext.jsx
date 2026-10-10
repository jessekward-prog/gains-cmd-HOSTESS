import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../lib/api';
import { localDate as toLocalDate, cleanWeight } from '../lib/history';

const WorkoutContext = createContext(null);
const LS_KEY = 'gains_active_workout';
const LS_SNAPSHOT = 'gains_snapshot'; // last programs/history/settings, for opening offline

export function WorkoutProvider({ children }) {
  const [programs, setPrograms] = useState([]);
  const [workoutHistory, setWorkoutHistory] = useState([]);
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [settings, setSettings] = useState(null);
  const [recoveryNotes, setRecoveryNotes] = useState({}); // exerciseName -> note
  const [loading, setLoading] = useState(true);
  const saveTimeoutRef = useRef(null);

  const loadAll = useCallback(async () => {
    try {
      const [progData, histData, activeData, settData] = await Promise.all([
        api.getPrograms(),
        api.getWorkoutHistory(),
        api.getActiveWorkout(),
        api.getSettings(),
      ]);
      if (progData.success) setPrograms(progData.programs || []);
      if (histData.success) setWorkoutHistory(histData.workouts || []);
      if (activeData.success && activeData.workout) {
        setActiveWorkout(activeData.workout);
      } else {
        // Fall back to localStorage — catches refreshes within the debounce window
        try {
          const cached = localStorage.getItem(LS_KEY);
          if (cached) setActiveWorkout(JSON.parse(cached));
        } catch {}
      }
      if (settData.success) setSettings(settData);
      try {
        localStorage.setItem(LS_SNAPSHOT, JSON.stringify({ programs: progData.programs, workouts: histData.workouts, settings: settData }));
      } catch {}
      api.getRecoveryNotes()
        .then((d) => d.success && setRecoveryNotes(Object.fromEntries(d.notes.map((n) => [n.exercise_name, n.note]))))
        .catch(() => {});
    } catch (e) {
      console.error('Failed to load data:', e);
      if (e instanceof TypeError) {
        // Offline: last snapshot + the in-progress workout from localStorage.
        try {
          const snap = JSON.parse(localStorage.getItem(LS_SNAPSHOT));
          if (snap) {
            setPrograms(snap.programs || []);
            setWorkoutHistory(snap.workouts || []);
            if (snap.settings?.success) setSettings(snap.settings);
          }
          const cached = localStorage.getItem(LS_KEY);
          if (cached) setActiveWorkout(JSON.parse(cached));
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  }, []);


  const saveActiveToBackend = useCallback((workout) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      api.saveActiveWorkout(workout).catch(console.error);
    }, 500);
  }, []);

  const updateActiveWorkout = useCallback((updater) => {
    setActiveWorkout((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next) {
        saveActiveToBackend(next);
        try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      } else {
        try { localStorage.removeItem(LS_KEY); } catch {}
      }
      return next;
    });
  }, [saveActiveToBackend]);

  const startWorkout = useCallback(async (program, workoutIndex, { quest = false } = {}) => {
    const w = typeof program.workouts === 'string'
      ? JSON.parse(program.workouts)[workoutIndex]
      : program.workouts[workoutIndex];

    let lastWorkout = null;
    if (workoutHistory.length > 0) {
      lastWorkout = workoutHistory.find(
        (h) => h.workout_name === w.name && h.program_name === program.name
      );
    }

    const workout = {
      programId: program.id,
      programName: program.name,
      workoutName: w.name,
      startTime: new Date().toISOString(),
      quest, // played as Quest Mode — chosen per visit on the home screen
      originalExercises: w.exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets || 4,
        type: ex.type,
        hasDrops: ex.hasDrops || false,
        isBFR: ex.isBFR || false,
        isInterval: ex.isInterval || false,
        isVariable: ex.isVariable || false,
        supersetWith: ex.supersetWith || null,
        failureIndices: ex.failureIndices || [],
      })),
      exercises: w.exercises.map((ex) => {

        // ── CARDIO exercises ──────────────────────────────────────────
        // Cardio exercises get a single cardio-type set with timer state.
        // CardioCard reads exercise.targetDurationSec and sets[0].type === 'cardio'.
        if (ex.type === 'cardio') {
          return {
            name: ex.name,
            type: 'cardio',
            targetDurationSec: ex.targetDurationSec || 0,
            targetSets: 1,
            targetReps: 'cardio',
            repRange: 'cardio',
            restSeconds: 0,
            sets: [{
              type: 'cardio',
              completed: false,
              elapsedSec: 0,
              cardioStats: null,
            }],
            notes: [],
          };
        }

        // ── STRENGTH exercises (original logic) ───────────────────────
        const sets = [];
        const numSets = ex.sets || 4;

        let lastExercise = null;
        if (lastWorkout?.exercises) {
          const exs = typeof lastWorkout.exercises === 'string'
            ? JSON.parse(lastWorkout.exercises) : lastWorkout.exercises;
          const found = (exs || []).find((e) => e.name === ex.name);
          if (found) lastExercise = found;
        }
        if (!lastExercise) {
          for (const hw of workoutHistory) {
            if (hw.program_name === 'SNOOZE_MILESTONE') continue; // a snooze has no reps to copy
            // LEVEL_UP_MILESTONE entries are now valid prefill sources — they
            // carry the newest accepted working weight for this exercise.
            // The milestone's sets are copied from the user's most recent
            // real session at Level-Up-accept time (see RecommendationsPage),
            // so structure (number of sets, reps) is preserved.
            const exs = typeof hw.exercises === 'string'
              ? JSON.parse(hw.exercises) : hw.exercises;
            const found = (exs || []).find((e) => e.name === ex.name);
            if (found) { lastExercise = found; break; }
          }
        }

        // If a LEVEL_UP_MILESTONE for this exercise is newer than the
        // structural source session, use its weight for prefill. The
        // milestone is the ghost "last set" written when the user accepts
        // a recommendation — it should win over any older real session
        // weight. We still use lastExercise for set count / reps / special
        // types; only the weight number gets overridden.
        let milestoneWeight = null;
        const structuralDate = lastWorkout?.date;
        for (const hw of workoutHistory) {
          if (hw.program_name !== 'LEVEL_UP_MILESTONE') continue;
          if (structuralDate && hw.date <= structuralDate) break; // history is DESC by date
          const exs = typeof hw.exercises === 'string'
            ? JSON.parse(hw.exercises) : hw.exercises;
          const found = (exs || []).find((e) => e.name === ex.name);
          if (found) {
            const w = found.sets?.[0]?.weight;
            if (w !== undefined && w !== null && w !== '') {
              milestoneWeight = String(w);
              break;
            }
          }
        }

        for (let i = 0; i < numSets; i++) {
          let prefillWeight = '';
          // Only prefill from non-drop sets in history
          const lastNormalSets = lastExercise?.sets?.filter(s => s.type !== 'drop') || lastExercise?.sets || [];
          if (milestoneWeight !== null) {
            prefillWeight = milestoneWeight;
          } else if (lastNormalSets[i]?.weight) {
            prefillWeight = lastNormalSets[i].weight;
          } else if (ex.isVariable && ex.variableSets?.[i]?.weight) {
            prefillWeight = String(ex.variableSets[i].weight);
          } else if (ex.weight && parseFloat(ex.weight) > 0) {
            prefillWeight = ex.weight;
          }
          sets.push({ reps: '', weight: cleanWeight(prefillWeight), completed: false });
        }

        // ── Reconstruct special set types ──────────────────────────────
        // Primary source: last exercise from history (most reliable)
        // Fallback: variation flags on ex (isBFR, isInterval, hasDrops)

        const lastSets = lastExercise?.sets || [];
        const lastSetType = lastSets.find(s => s.type)?.type || null; // dominant type in history

        // Detect from history
        const histHasDrops = lastSets.some(s => s.type === 'drop');
        const histHasBFR = lastSets.some(s => s.type === 'bfr');
        const histHasInterval = lastSets.some(s => s.type === 'interval');
        const histHasVariable = lastSets.some(s => s.type === 'variable');

        // Merge with flags (flags win for new variations with no history yet)
        const useBFR = histHasBFR || !!ex.isBFR;
        const useInterval = histHasInterval || !!ex.isInterval;
        const useDrops = (histHasDrops || !!ex.hasDrops) && !useBFR && !useInterval;
        const useVariable = (histHasVariable || !!ex.isVariable) && !useBFR && !useInterval && !useDrops;

        if (useBFR) {
          // Get bfrSeconds from history first, then flag, then default
          const bfrSeconds = lastSets.find(s => s.type === 'bfr')?.bfrSeconds || ex.bfrSeconds || 45;
          for (let s = 0; s < sets.length; s++) {
            sets[s] = { ...sets[s], type: 'bfr', bfrSeconds, reps: '' };
          }
        } else if (useInterval) {
          const ref = lastSets.find(s => s.type === 'interval');
          const work = ref?.intervalWork || ex.intervalWork || 30;
          const rest = ref?.intervalRest || ex.intervalRest || 30;
          const total = ref?.intervalTotal || ex.intervalTotal || 180;
          for (let s = 0; s < sets.length; s++) {
            sets[s] = { ...sets[s], type: 'interval', intervalWork: work, intervalRest: rest, intervalTotal: total, reps: '' };
          }
        } else if (useVariable) {
          const varSets = ex.variableSets || [];
          const histVarSets = lastSets.filter(s => s.type === 'variable');
          for (let s = 0; s < sets.length; s++) {
            const varConfig = varSets[s] || {};
            const repRange = histVarSets[s]?.variableRepRange || varConfig.repRange || '8-12';
            sets[s] = { ...sets[s], type: 'variable', variableRepRange: repRange };
          }
        } else if (useDrops) {
          // Infer numDrops from history or flag
          let numDrops = ex.numDrops || 0;
          if (numDrops === 0 && histHasDrops) {
            const lastNormal = lastSets.filter(s => s.type !== 'drop').length;
            const lastDropCount = lastSets.filter(s => s.type === 'drop').length;
            if (lastNormal > 0) numDrops = Math.round(lastDropCount / lastNormal);
          }
          if (numDrops === 0) numDrops = 1;

          const lastDropSets = lastSets.filter(s => s.type === 'drop');
          const expanded = [];
          sets.forEach((s, normalIdx) => {
            expanded.push(s);
            for (let d = 0; d < numDrops; d++) {
              const historyDrop = lastDropSets[normalIdx * numDrops + d];
              expanded.push({
                reps: '',
                weight: cleanWeight(historyDrop?.weight),
                completed: false,
                type: 'drop',
                dropIndex: d,
              });
            }
          });
          sets.length = 0;
          expanded.forEach(s => sets.push(s));
        }

        let restSeconds = ex.restSeconds || 90;
        if (lastExercise?.restSeconds) restSeconds = lastExercise.restSeconds;

        // Restore failure sets from variation/program definition
        const failureIndices = ex.failureIndices || [];
        if (failureIndices.length > 0 && !useBFR && !useInterval && !useVariable) {
          failureIndices.forEach(idx => {
            if (sets[idx]) sets[idx] = { ...sets[idx], reps: 'failure' };
          });
        }

        return {
          name: ex.name,
          targetSets: numSets,
          targetReps: ex.repRange || '8-12',
          repRange: ex.repRange || '8-12',
          restSeconds,
          sets,
          notes: [],
          // Carry special set metadata so WorkoutPage handlers can use it
          ...(useDrops ? { hasDrops: true, numDrops: sets.filter(s => s.type === 'drop').length / Math.max(sets.filter(s => s.type !== 'drop').length, 1) } : {}),
          ...(useBFR ? { isBFR: true, bfrSeconds: sets.find(s => s.type === 'bfr')?.bfrSeconds || ex.bfrSeconds || 45 } : {}),
          ...(useInterval ? { isInterval: true, intervalWork: sets.find(s => s.type === 'interval')?.intervalWork || ex.intervalWork || 30, intervalRest: sets.find(s => s.type === 'interval')?.intervalRest || ex.intervalRest || 30, intervalTotal: sets.find(s => s.type === 'interval')?.intervalTotal || ex.intervalTotal || 180 } : {}),
          ...(useVariable ? { isVariable: true, variableSets: sets.filter(s => s.type === 'variable').map(s => ({ weight: s.weight, repRange: s.variableRepRange })) } : {}),
          ...(ex.supersetWith ? { supersetWith: ex.supersetWith } : {}),
          ...(failureIndices.length > 0 ? { failureIndices } : {}),
        };
      }),
    };

    setActiveWorkout(workout);
    await api.saveActiveWorkout(workout);
    return workout;
  }, [workoutHistory]);

  const finishWorkout = useCallback(async (cardioStats = null) => {
    if (!activeWorkout) return null;
    const endTime = new Date().toISOString();
    const start = new Date(activeWorkout.startTime);
    const end = new Date(endTime);
    const duration = Math.round((end - start) / 60000);
    const localDate = toLocalDate();

    // ── Collect per-exercise cardio stats ─────────────────────────────
    // Each cardio exercise may have stats in sets[0].cardioStats.
    // Accumulate them so the server gets a combined view (backward compat
    // with the global cardioStats param), plus each exercise retains its
    // own stats in the exercises array for history.
    const perExerciseCardio = (activeWorkout.exercises || [])
      .filter(ex => ex.type === 'cardio' || ex.sets?.[0]?.type === 'cardio')
      .map(ex => ({ name: ex.name, stats: ex.sets?.[0]?.cardioStats }))
      .filter(c => c.stats);

    // Build a merged cardioStats object if we have per-exercise data
    // Merge per-exercise inline scans + any global upload from finish modal.
    // Global upload (cardioStats param) adds to the pool rather than overriding.
    const allCardioSources = [...perExerciseCardio];
    if (cardioStats) allCardioSources.push({ name: 'Session', stats: cardioStats });

    let mergedCardioStats = null;
    if (allCardioSources.length === 1) {
      mergedCardioStats = { ...allCardioSources[0].stats };
      if (!mergedCardioStats.activityType) mergedCardioStats.activityType = allCardioSources[0].name;
    } else if (allCardioSources.length > 1) {
      const accumulated = {};
      let totalActiveCal = 0, totalTotalCal = 0;
      const activities = [];
      const durations = [];
      const sources = [];
      allCardioSources.forEach(c => {
        const s = c.stats;
        activities.push(s.activityType || c.name);
        if (s.duration) durations.push(`${c.name}: ${s.duration}`);
        if (s.activeCalories) totalActiveCal += parseInt(s.activeCalories) || 0;
        if (s.totalCalories) totalTotalCal += parseInt(s.totalCalories) || 0;
        if (s.source && !sources.includes(s.source)) sources.push(s.source);
      });
      accumulated.activityType = activities.join(', ');
      if (durations.length > 0) accumulated.duration = durations.join(' | ');
      if (totalActiveCal > 0) accumulated.activeCalories = totalActiveCal;
      if (totalTotalCal > 0) accumulated.totalCalories = totalTotalCal;
      if (sources.length > 0) accumulated.source = sources.join(', ');
      const hrs = allCardioSources.filter(c => c.stats.avgHeartRate).map(c => parseInt(c.stats.avgHeartRate));
      if (hrs.length > 0) accumulated.avgHeartRate = Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length);
      const maxHrs = allCardioSources.filter(c => c.stats.maxHeartRate).map(c => parseInt(c.stats.maxHeartRate));
      if (maxHrs.length > 0) accumulated.maxHeartRate = Math.max(...maxHrs);
      mergedCardioStats = accumulated;
    }

    const result = await api.analyzeWorkout({
      programName: activeWorkout.programName,
      workoutName: activeWorkout.workoutName,
      startTime: activeWorkout.startTime,
      endTime,
      localDate,
      exercises: activeWorkout.exercises,
      cardioStats: mergedCardioStats,
    });

    await api.clearActiveWorkout();
    try { localStorage.removeItem(LS_KEY); } catch {}
    setActiveWorkout(null);

    const histData = await api.getWorkoutHistory();
    if (histData.success) setWorkoutHistory(histData.workouts || []);

    return { ...result, duration };
  }, [activeWorkout]);

  const cancelWorkout = useCallback(async () => {
    await api.clearActiveWorkout();
    try { localStorage.removeItem(LS_KEY); } catch {}
    setActiveWorkout(null);
  }, []);

  const reloadPrograms = useCallback(async () => {
    const data = await api.getPrograms();
    if (data.success) setPrograms(data.programs || []);
  }, []);

  const reloadHistory = useCallback(async () => {
    const data = await api.getWorkoutHistory();
    if (data.success) setWorkoutHistory(data.workouts || []);
  }, []);

  // NEW: reload settings (called after SettingsPage saves)
  const reloadSettings = useCallback(async () => {
    try {
      const data = await api.getSettings();
      if (data.success) setSettings(data);
    } catch (e) {
      console.error('Failed to reload settings:', e);
    }
  }, []);

  // Merge { name: libraryId | '' } into the saved exercise links. Kept in a ref
  // so back-to-back saves (AI batches) build on each other, not on a stale render.
  const linksRef = useRef({});
  linksRef.current = settings?.exerciseLinks || {};
  const saveExerciseLinks = useCallback(async (patch) => {
    const links = { ...linksRef.current, ...patch };
    linksRef.current = links;
    setSettings((s) => ({ ...s, exerciseLinks: links }));
    await api.saveExerciseLinks(links);
  }, []);

  // Quest Mode state { profile, vault }, saved whole. `fn` gets the current
  // value (ref, so chained saves build on each other) and returns the next.
  const questRef = useRef(null);
  questRef.current = settings?.quest || null;
  const saveQuest = useCallback(async (fn) => {
    const next = fn(questRef.current || {});
    questRef.current = next;
    setSettings((s) => ({ ...s, quest: next }));
    await api.saveQuest(next);
    return next;
  }, []);

  const setRecoveryNote = useCallback((name, note) => {
    setRecoveryNotes((prev) => {
      const next = { ...prev };
      if (note == null) delete next[name]; else next[name] = note;
      return next;
    });
  }, []);

  return (
    <WorkoutContext.Provider
      value={{
        programs,
        workoutHistory,
        activeWorkout,
        settings,
        recoveryNotes,
        setRecoveryNote,
        loading,
        setPrograms,
        startWorkout,
        updateActiveWorkout,
        finishWorkout,
        cancelWorkout,
        reloadPrograms,
        reloadHistory,
        reloadSettings,
        saveExerciseLinks,
        saveQuest,
        loadAll,
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
}

export const useWorkout = () => useContext(WorkoutContext);
