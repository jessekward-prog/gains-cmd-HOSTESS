import { useMemo } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import { isMarker } from '../lib/history';
import { norm, titleCase } from '../lib/catalog';
import useCatalog from '../hooks/useCatalog';

export const EXERCISE_LIST_ID = 'exercise-names';
export const LIBRARY_LIST_ID = 'exercise-library';

// Every exercise name in history and programs, sorted.
export function exerciseNames(workoutHistory, programs) {
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
}

// Native autocomplete for every exercise-name input (list={EXERCISE_LIST_ID}).
// Progression credits exact names, so offering the spelling already in use
// stops "Leg Press" / "leg press" splitting into two progress tracks. The
// library's names follow, so a new exercise picked from them is matched to its
// animation and muscles with no extra step.
export default function ExerciseNameOptions() {
  const { workoutHistory, programs } = useWorkout();
  const cat = useCatalog();
  const names = useMemo(() => exerciseNames(workoutHistory, programs), [workoutHistory, programs]);
  const library = useMemo(() => (cat ? [...new Set(cat.list.map((x) => titleCase(x.n)))] : []), [cat]);
  const extra = useMemo(() => {
    const mine = new Set(names.map(norm));
    return library.filter((n) => !mine.has(norm(n)));
  }, [names, library]);

  return (
    <>
      <datalist id={EXERCISE_LIST_ID}>
        {names.map((n) => <option key={n} value={n} />)}
        {extra.map((n, i) => <option key={'lib' + i} value={n} />)}
      </datalist>
      <datalist id={LIBRARY_LIST_ID}>
        {library.map((n, i) => <option key={i} value={n} />)}
      </datalist>
    </>
  );
}
