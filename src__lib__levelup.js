// Level Up: accepting a weight increase the progression engine has earned, or
// snoozing it. Shared by the Progress page and the in-workout prompt, so both
// write exactly the same records.
import * as api from './api';
import { isMarker, localDate } from './history';

// Parse a program's workouts whether it arrived as a JSON string or array.
function parseWorkouts(workouts) {
  if (!workouts) return [];
  if (typeof workouts === 'string') {
    try { return JSON.parse(workouts) || []; } catch { return []; }
  }
  return Array.isArray(workouts) ? workouts : [];
}

// The user's most recent real (non-milestone, non-boss) entry for an exercise.
export function findLatestRealExercise(history, exerciseName) {
  if (!history) return null;
  for (const h of history) {
    if (isMarker(h)) continue;
    let exs = [];
    try { exs = typeof h.exercises === 'string' ? JSON.parse(h.exercises) : h.exercises; } catch { continue; }
    const found = (exs || []).find((e) => e && e.name === exerciseName && !e.boss);
    if (found) return found;
  }
  return null;
}

// The milestone's sets copy the structure of the most recent real session (same
// main sets and reps, new weight) so the next workout's prefill looks natural.
// Drops aren't kept — a milestone is a weight checkpoint, not a replay.
export function buildMilestoneSets(latestRealEx, newWeight) {
  const weightStr = String(parseFloat(newWeight));
  if (!latestRealEx || !Array.isArray(latestRealEx.sets) || latestRealEx.sets.length === 0) {
    return [{ reps: '', weight: weightStr, completed: true }];
  }
  const mainSets = latestRealEx.sets.filter((s) => s && s.type !== 'drop');
  const source = mainSets.length > 0 ? mainSets : latestRealEx.sets;
  return source.map((s) => ({ reps: String(s?.reps ?? ''), weight: weightStr, completed: true }));
}

// Every program instance of the exercise shifts by (new − old), floored at 0, so
// intentional variation (Mon 80 / Fri 70) keeps its spread; uninitialised ones
// jump straight to the new weight. Returns { id, name, workouts } to save.
export function computeProgramUpdates(programs, exerciseName, oldWeight, newWeight) {
  const updates = [];
  const newWeightNum = parseFloat(newWeight);
  const oldWeightNum = parseFloat(oldWeight);
  if (!programs || isNaN(newWeightNum) || isNaN(oldWeightNum)) return updates;
  const delta = newWeightNum - oldWeightNum;
  for (const prog of programs) {
    const workouts = parseWorkouts(prog.workouts);
    let changed = false;
    const nextWorkouts = workouts.map((w) => {
      if (!w || !Array.isArray(w.exercises)) return w;
      const nextExercises = w.exercises.map((ex) => {
        if (!ex || ex.name !== exerciseName) return ex;
        const exWeight = parseFloat(ex.weight);
        const uninitialized = !ex.weight || isNaN(exWeight) || exWeight === 0;
        if (uninitialized) { changed = true; return { ...ex, weight: newWeightNum }; }
        const shifted = Math.max(0, exWeight + delta);
        if (Math.abs(shifted - exWeight) < 0.01) return ex;
        changed = true;
        return { ...ex, weight: shifted };
      });
      return { ...w, exercises: nextExercises };
    });
    if (changed) updates.push({ id: prog.id, name: prog.name, workouts: nextWorkouts });
  }
  return updates;
}

/** The progression settings the engine needs, from the account's settings. */
export function aggressionOf(settings) {
  const raw = settings?.aggressionSettings;
  if (!raw) {
    return { progressionSpeed: 12, upperCompoundIncrement: 5, upperIsolatedIncrement: 2.5, lowerCompoundIncrement: 5, lowerIsolatedIncrement: 5, coachingTone: 'encouraging' };
  }
  const a = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return {
    progressionSpeed: a.progressionSpeed ?? 12,
    upperCompoundIncrement: a.upperCompoundIncrement ?? a.upperIncrement ?? 5,
    upperIsolatedIncrement: a.upperIsolatedIncrement ?? a.upperIncrement ?? 2.5,
    lowerCompoundIncrement: a.lowerCompoundIncrement ?? a.lowerIncrement ?? 5,
    lowerIsolatedIncrement: a.lowerIsolatedIncrement ?? a.lowerIncrement ?? 5,
    coachingTone: a.coachingTone ?? 'encouraging',
    autoFailure: !!a.autoFailure,
    autoRules: a.autoRules || {},
  };
}

/** Accept a level up at `newWeight`: milestone record + every program updated. Returns how many programs changed. */
export async function acceptLevelUp({ exercise, currentWeight, newWeight, history, programs }) {
  const latestRealEx = findLatestRealExercise(history, exercise);
  await api.saveWorkout({
    programName: 'LEVEL_UP_MILESTONE',
    workoutName: 'Level Up',
    date: localDate(),
    duration: 0,
    notes: `LEVEL_UP:${exercise}:${currentWeight}:${newWeight}`,
    exercises: [{
      name: exercise,
      sets: buildMilestoneSets(latestRealEx, newWeight),
      // Keep rep range + rest so a later workout's prefill doesn't lose them.
      ...(latestRealEx?.repRange ? { repRange: latestRealEx.repRange } : {}),
      ...(latestRealEx?.targetReps ? { targetReps: latestRealEx.targetReps } : {}),
      ...(latestRealEx?.restSeconds ? { restSeconds: latestRealEx.restSeconds } : {}),
    }],
  });
  const updates = computeProgramUpdates(programs, exercise, currentWeight, newWeight);
  await Promise.all(updates.map((u) => api.updateProgram(u.id, u.name, u.workouts).catch((err) => console.error(`Failed to update program ${u.name}:`, err))));
  return updates.length;
}

/** Not yet: check again after 3 more sessions at this weight. */
export function snoozeLevelUp({ exercise, currentWeight }) {
  return api.saveWorkout({
    programName: 'SNOOZE_MILESTONE',
    workoutName: 'Snooze',
    date: localDate(),
    duration: 0,
    notes: `SNOOZE:${exercise}:${currentWeight}:3`,
    exercises: [{ name: exercise, sets: [{ weight: String(currentWeight), reps: '', completed: true }] }],
  });
}
