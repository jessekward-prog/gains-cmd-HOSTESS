import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import ThinkingDots from '../components/ThinkingDots';
import * as api from '../lib/api';
import { isMarker, localDate as toLocalDate } from '../lib/history';

const MONO = 'var(--font-mono)';
import { useHaptics } from '../hooks/useHaptics';

// Parse a program's workouts whether it arrived as a JSON string or array.
function parseWorkouts(workouts) {
  if (!workouts) return [];
  if (typeof workouts === 'string') {
    try { return JSON.parse(workouts) || []; } catch { return []; }
  }
  return Array.isArray(workouts) ? workouts : [];
}

// Compare two weight values (which may be strings, numbers, or floats with
// trailing zeros) with a small tolerance. Returns true if they match.
function weightsMatch(a, b) {
  const fa = parseFloat(a);
  const fb = parseFloat(b);
  if (isNaN(fa) || isNaN(fb)) return false;
  return Math.abs(fa - fb) < 0.01;
}

// Find the user's most recent real (non-milestone) entry for an exercise
// in workoutHistory. Returns the exercise object with its sets, or null.
function findLatestRealExercise(history, exerciseName) {
  if (!history) return null;
  for (const h of history) {
    if (isMarker(h)) continue;
    let exs = [];
    try {
      exs = typeof h.exercises === 'string' ? JSON.parse(h.exercises) : h.exercises;
    } catch {
      continue;
    }
    const found = (exs || []).find(e => e && e.name === exerciseName);
    if (found) return found;
  }
  return null;
}

// Build the milestone sets array. We copy the structure of the user's most
// recent real session so the next workout's prefill looks natural:
//   - same number of main (non-drop) sets
//   - same reps per set (so prefill populates both reps and weight)
//   - new weight
//   - completed: true (so the prefill considers it a valid session)
// Drop sets from history are intentionally NOT preserved here — the
// milestone is only a weight checkpoint, not a full workout replay.
function buildMilestoneSets(latestRealEx, newWeight) {
  const weightStr = String(parseFloat(newWeight));
  if (!latestRealEx || !Array.isArray(latestRealEx.sets) || latestRealEx.sets.length === 0) {
    // Fallback: single set, no reps known.
    return [{ reps: '', weight: weightStr, completed: true }];
  }
  const mainSets = latestRealEx.sets.filter(s => s && s.type !== 'drop');
  const source = mainSets.length > 0 ? mainSets : latestRealEx.sets;
  return source.map(s => ({
    reps: String(s?.reps ?? ''),
    weight: weightStr,
    completed: true,
  }));
}

// Walk every program and apply the Level Up delta to every instance of the
// target exercise:
//   - delta = newWeight - oldWeight (negative for assisted exercises).
//   - Every matching instance shifts by delta, floored at 0. This preserves
//     intentional variation (Monday=80, Friday=70 both shift by the same
//     step) while guaranteeing the update is applied somewhere.
//   - Uninitialized instances (weight == 0 or missing) jump straight to
//     newWeight so fresh templates pick up the Level Up.
// Returns a list of { id, name, workouts } to PUT back to the server.
function computeProgramUpdates(programs, exerciseName, oldWeight, newWeight) {
  const updates = [];
  const newWeightNum = parseFloat(newWeight);
  const oldWeightNum = parseFloat(oldWeight);
  if (!programs || isNaN(newWeightNum) || isNaN(oldWeightNum)) return updates;
  const delta = newWeightNum - oldWeightNum;

  for (const prog of programs) {
    const workouts = parseWorkouts(prog.workouts);
    let changed = false;

    const nextWorkouts = workouts.map(w => {
      if (!w || !Array.isArray(w.exercises)) return w;
      const nextExercises = w.exercises.map(ex => {
        if (!ex || ex.name !== exerciseName) return ex;
        const exWeight = parseFloat(ex.weight);
        const uninitialized = !ex.weight || isNaN(exWeight) || exWeight === 0;
        if (uninitialized) {
          changed = true;
          return { ...ex, weight: newWeightNum };
        }
        const shifted = Math.max(0, exWeight + delta);
        if (Math.abs(shifted - exWeight) < 0.01) return ex;
        changed = true;
        return { ...ex, weight: shifted };
      });
      return { ...w, exercises: nextExercises };
    });

    if (changed) {
      updates.push({ id: prog.id, name: prog.name, workouts: nextWorkouts });
    }
  }

  return updates;
}

export default function RecommendationsPage() {
  const { settings, programs, workoutHistory, reloadHistory, reloadPrograms } = useWorkout();
  const { showToast, showCenterModal } = useToast();
  const [levelUp, setLevelUp] = useState(null); // centre pop after Level Up, ~1.8s
  useEffect(() => {
    if (!levelUp) return;
    const t = setTimeout(() => setLevelUp(null), 1800);
    return () => clearTimeout(t);
  }, [levelUp]);
  const haptics = useHaptics();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [dismissed, setDismissed] = useState(new Set());
  // Per-exercise custom weight overrides for the "Level Up" input
  const [customWeights, setCustomWeights] = useState({});

  const getAggression = useCallback(() => {
    if (!settings?.aggressionSettings) {
      return {
        progressionSpeed: 12,
        upperCompoundIncrement: 5, upperIsolatedIncrement: 2.5,
        lowerCompoundIncrement: 5, lowerIsolatedIncrement: 5,
        coachingTone: 'encouraging',
      };
    }
    const a = typeof settings.aggressionSettings === 'string'
      ? JSON.parse(settings.aggressionSettings) : settings.aggressionSettings;
    return {
      progressionSpeed: a.progressionSpeed ?? 12,
      upperCompoundIncrement: a.upperCompoundIncrement ?? a.upperIncrement ?? 5,
      upperIsolatedIncrement: a.upperIsolatedIncrement ?? a.upperIncrement ?? 2.5,
      lowerCompoundIncrement: a.lowerCompoundIncrement ?? a.lowerIncrement ?? 5,
      lowerIsolatedIncrement: a.lowerIsolatedIncrement ?? a.lowerIncrement ?? 5,
      coachingTone: a.coachingTone ?? 'encouraging',
    };
  }, [settings]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setDismissed(new Set());
    setCustomWeights({});
    try {
      const result = await api.generateRecommendations(getAggression());
      if (result.success) setData(result);
      else showToast(result.error || 'Failed to generate', 'error');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
    setLoading(false);
  }, [getAggression, showToast]);

  // Recommendations are cheap and deterministic — show them on open.
  // Runs once settings have loaded (they hold the progression speed).
  const settingsLoaded = settings !== null;
  useEffect(() => { if (settingsLoaded) handleGenerate(); }, [settingsLoaded]);

  const handleAccept = useCallback(async (rec, index) => {
    try {
      // ── 1. Work out the new weight ───────────────────────────────────
      // The server already computed the suggested next weight using the
      // user's increment settings and assisted-exercise rules. Trust it
      // so the card preview and the applied value can't disagree.
      const oldWeight = rec.currentWeight;
      const customVal = customWeights[rec.exercise];
      const serverSuggested = rec.newWeight ?? rec.nextWeight;
      const newWeight = customVal
        ? String(parseFloat(customVal))
        : String(parseFloat(serverSuggested));

      // ── 2. Write the milestone history entry ─────────────────────────
      // Copy the structure of the user's most recent real session so the
      // next workout's prefill gets proper reps + new weight.
      const latestRealEx = findLatestRealExercise(workoutHistory, rec.exercise);
      const milestoneSets = buildMilestoneSets(latestRealEx, newWeight);

      const localDate = toLocalDate();
      await api.saveWorkout({
        programName: 'LEVEL_UP_MILESTONE',
        workoutName: 'Level Up',
        date: localDate,
        duration: 0,
        notes: `LEVEL_UP:${rec.exercise}:${oldWeight}:${newWeight}`,
        exercises: [{
          name: rec.exercise,
          sets: milestoneSets,
          // Preserve rep range + rest so a subsequent workout's prefill
          // doesn't lose these metadata fields when treating the milestone
          // as history.
          ...(latestRealEx?.repRange ? { repRange: latestRealEx.repRange } : {}),
          ...(latestRealEx?.targetReps ? { targetReps: latestRealEx.targetReps } : {}),
          ...(latestRealEx?.restSeconds ? { restSeconds: latestRealEx.restSeconds } : {}),
        }],
      });

      // ── 3. Update every program that contains this exercise ──────────
      // Every matching instance shifts by (newWeight - oldWeight), so
      // intentional variation (Mon 80 / Fri 70) is preserved as the same
      // relative spread.
      const programUpdates = computeProgramUpdates(
        programs, rec.exercise, oldWeight, newWeight
      );

      await Promise.all(
        programUpdates.map(u =>
          api.updateProgram(u.id, u.name, u.workouts).catch(err => {
            console.error(`Failed to update program ${u.name}:`, err);
          })
        )
      );

      // ── 4. Refresh local state ───────────────────────────────────────
      await Promise.all([reloadHistory(), reloadPrograms()]);

      // Hide this card from the current generation — the user has acted on it.
      setDismissed(prev => new Set([...prev, index]));

      const updatedCount = programUpdates.length;
      const weightBody = updatedCount === 0
        ? `${rec.exercise} → ${newWeight}kg (no programs updated)`
        : updatedCount === 1
          ? `${rec.exercise} → ${newWeight}kg`
          : `${rec.exercise} → ${newWeight}kg · ${updatedCount} programs updated`;
      haptics.success();
      setLevelUp({ text: weightBody, at: Date.now() });
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  }, [customWeights, programs, workoutHistory, reloadHistory, reloadPrograms, showToast, haptics]);

  const handleSnooze = useCallback(async (rec, index) => {
    try {
      const localDate = toLocalDate();
      await api.saveWorkout({
        programName: 'SNOOZE_MILESTONE',
        workoutName: 'Snooze',
        date: localDate,
        duration: 0,
        notes: `SNOOZE:${rec.exercise}:${rec.currentWeight}:3`,
        exercises: [{ name: rec.exercise, sets: [{ weight: String(rec.currentWeight), reps: '', completed: true }] }],
      });
      await reloadHistory();
      setDismissed(prev => new Set([...prev, index]));
      showCenterModal('Got it', "I'll check again after 3 more sessions.", 'info');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  }, [reloadHistory, showToast, showCenterModal]);


  // ── Merge all exercises into one sorted list ──────────────────────────
  // tier: 'ready' | 'near' | 'early'
  const allExercises = (() => {
    if (!data) return [];
    const list = [];
    (data.recommendations || []).forEach((r, i) => list.push({ ...r, tier: 'ready', globalIndex: `rec-${i}`, sortIndex: i }));
    (data.nearProgression || []).forEach((r, i) => list.push({ ...r, count: r.currentPoints, target: r.pointsNeeded, tier: 'near', globalIndex: `near-${i}`, sortIndex: i }));
    (data.earlyProgress || []).forEach((r, i) => list.push({ ...r, count: r.currentPoints, target: r.pointsNeeded, tier: 'early', globalIndex: `early-${i}`, sortIndex: i }));
    // Closest to levelling up first within each tier.
    const pct = (r) => (r.target ? r.count / r.target : 1);
    const tierOrder = { ready: 0, near: 1, early: 2 };
    return list.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || pct(b) - pct(a));
  })();

  const visibleExercises = allExercises.filter(ex => !dismissed.has(ex.globalIndex));


  const tierColour = { ready: 'var(--color-success)', near: 'var(--g-near)', early: 'var(--color-text-tertiary)' };
  const counts = { ready: (data?.recommendations || []).length, near: (data?.nearProgression || []).length, early: (data?.earlyProgress || []).length };

  return (
    <div className="g-root px-4 pt-2.5 pb-7 fx-rise">
      <h1 className="mx-1 mt-3 mb-0.5 g-h1">Progress</h1>
      <p className="mx-1 text-[13px] text-text-secondary" style={{ textWrap: 'pretty' }}>Counts your sessions in rep range at each weight and tells you when to go up.</p>

      <button onClick={handleGenerate} disabled={loading}
        className="mt-4 w-full h-[52px] rounded-[18px] bg-accent font-extrabold text-[15px] flex items-center justify-center gap-2 disabled:opacity-70"
        style={{ color: 'var(--color-on-accent)' }}>
        {loading ? <>Analysing <ThinkingDots /></> : data ? 'Refresh progress' : 'Check my progress'}
      </button>

      {data && (
        <>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[['READY', 'ready'], ['NEAR', 'near'], ['EARLY', 'early']].map(([l, k]) => (
              <div key={k} className="bg-bg-1 rounded-[20px] p-3.5">
                <div style={{ fontSize: 28, fontWeight: 800, color: tierColour[k], lineHeight: 1 }}>{counts[k]}</div>
                <div className="mt-1 g-label" style={{ letterSpacing: '.12em' }}>{l}</div>
              </div>
            ))}
          </div>

          {data.progressSummary && (
            <div className="mt-2 p-4 rounded-[20px] bg-bg-1 text-[13px] text-text-secondary" style={{ lineHeight: 1.55, textWrap: 'pretty' }}>{data.progressSummary}</div>
          )}

          <div className="flex flex-col gap-2 mt-4">
            {visibleExercises.map((rec, i) => {
              const ready = rec.tier === 'ready';
              const pct = ready ? 100 : Math.min(100, Math.round((rec.count / rec.target) * 100));
              const suggested = rec.nextWeight || rec.newWeight || '';
              const customVal = customWeights[rec.exercise] ?? '';
              const target = customVal || suggested;
              const col = tierColour[rec.tier];
              return (
                <div key={rec.globalIndex} className="p-4 rounded-[22px] bg-bg-1"
                  style={{ boxShadow: ready ? 'inset 0 0 0 1.5px var(--color-success)' : 'none', animation: `fx-in .35s ${Math.min(i, 8) * 0.05}s both` }}>
                  <div className="flex justify-between items-start gap-2.5">
                    <div className="min-w-0">
                      <div className="text-base font-extrabold truncate" style={{ letterSpacing: '-0.02em' }}>{rec.exercise}</div>
                      <div className="mt-[3px]" style={{ font: `400 11px ${MONO}`, color: col }}>
                        {rec.currentWeight}kg · {ready
                          ? (rec.assisted ? `ready → ${suggested}kg (less assistance)` : `ready → ${suggested}kg suggested`)
                          : `${rec.count}/${rec.target} sessions · ${rec.tier === 'near' ? 'almost there' : 'building up'}`}
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded-[8px] bg-bg-2 flex-shrink-0" style={{ font: `600 11px ${MONO}`, color: col }}>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-[3px] bg-bg-2 mt-3 overflow-hidden">
                    <div className="h-full rounded-[3px]" style={{ width: `${pct}%`, background: col, transition: 'width .6s' }} />
                  </div>
                  {ready && (
                    <>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="g-label">CUSTOM KG</span>
                        <input type="number" inputMode="decimal" step="0.5" placeholder={String(suggested)} value={customVal}
                          onChange={(e) => setCustomWeights((prev) => ({ ...prev, [rec.exercise]: e.target.value }))}
                          onFocus={(e) => e.target.select()}
                          className="w-24 h-9 rounded-[12px] bg-bg-2 text-center font-bold text-sm text-text-primary outline-none focus:ring-1 focus:ring-success/40" />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => handleAccept(rec, rec.globalIndex)} className="flex-1 h-12 rounded-[15px] bg-success text-white font-extrabold text-sm active:scale-[.98] transition-transform">
                          Level up to {target}kg
                        </button>
                        <button onClick={() => handleSnooze(rec, rec.globalIndex)} className="h-12 px-4 rounded-[15px] bg-bg-2 text-text-secondary font-semibold text-[13px]">Not yet</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {visibleExercises.length === 0 && (
              <div className="p-6 rounded-[22px] bg-bg-1 text-center">
                <div className="text-sm font-bold mb-1">No data yet</div>
                <div className="text-xs text-text-secondary">Complete some workouts first, then check your progress.</div>
              </div>
            )}
          </div>
        </>
      )}

      {levelUp && createPortal(
        <div onClick={() => setLevelUp(null)} className="fixed inset-0 z-[200] flex items-center justify-center p-7 fx-fade g-root" style={{ background: 'rgba(0,0,0,.5)' }}>
          <div className="w-full max-w-sm px-6 py-7 rounded-[30px] bg-bg-1 text-center" style={{ animation: 'fx-pop .45s cubic-bezier(.2,1.4,.4,1) both' }}>
            <div className="w-16 h-16 mx-auto rounded-[22px] bg-success text-white flex items-center justify-center text-[28px] font-extrabold">↑</div>
            <div className="mt-4 text-[28px] font-extrabold" style={{ letterSpacing: '-0.03em' }}>Level up</div>
            <div className="mt-1.5 text-text-secondary" style={{ font: `500 13px ${MONO}` }}>{levelUp.text}</div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
