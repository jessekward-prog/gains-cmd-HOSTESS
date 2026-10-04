import { useMemo } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import { isMarker } from '../lib/history';

export const EXERCISE_LIST_ID = 'exercise-names';

// Native autocomplete for every exercise-name input (list={EXERCISE_LIST_ID}).
// Progression credits exact names, so offering the spelling already in use
// stops "Leg Press" / "leg press" splitting into two progress tracks.
export default function ExerciseNameOptions() {
  const { workoutHistory, programs } = useWorkout();
  const names = useMemo(() => {
    const set = new Set();
    const add = (exs) => {
      const list = typeof exs === 'string' ? JSON.parse(exs) : exs;
      (list || []).forEach((e) => e?.name && set.add(e.name));
    };
    (workoutHistory || []).forEach((w) => !isMarker(w) && add(w.exercises));
    (programs || []).forEach((p) => {
      const ws = typeof p.workouts === 'string' ? JSON.parse(p.workouts) : p.workouts;
      (ws || []).forEach((w) => add(w.exercises));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [workoutHistory, programs]);

  return (
    <datalist id={EXERCISE_LIST_ID}>
      {names.map((n) => <option key={n} value={n} />)}
    </datalist>
  );
}
