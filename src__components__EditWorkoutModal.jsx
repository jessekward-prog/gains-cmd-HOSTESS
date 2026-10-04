import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from './Modal';
import Button from './Button';
import { cleanWeight } from '../lib/history';
import { EXERCISE_LIST_ID } from './ExerciseNameOptions';

export default function EditWorkoutModal({ open, workout, onClose, onSaved }) {
  const [workoutName, setWorkoutName] = useState('');
  const [duration, setDuration] = useState(0);
  const [exercises, setExercises] = useState([]);
  const [saving, setSaving] = useState(false);

  // Initialise state when workout changes
  useEffect(() => {
    if (!workout) return;
    const exs = workout.exercises
      ? (typeof workout.exercises === 'string' ? JSON.parse(workout.exercises) : workout.exercises)
      : [];
    setWorkoutName(workout.workout_name || '');
    setDuration(workout.duration || 0);
    setExercises(exs.map((ex) => ({
      name: ex.name || '',
      repRange: ex.repRange || ex.targetReps || '8-12',
      restSeconds: ex.restSeconds || 60,
      isCardio: !!ex.isCardio,
      cardioTimerMode: ex.cardioTimerMode || 'countdown',
      targetDurationSec: ex.targetDurationSec || 1200,
      sets: ex.isCardio
        ? (ex.sets || []).map((s) => ({ ...s }))
        : (ex.sets || []).map((s) => ({ reps: s.reps || '', weight: cleanWeight(s.weight), completed: !!s.completed })),
    })));
  }, [workout]);

  const updateExName = useCallback((ei, val) => {
    setExercises((prev) => prev.map((ex, i) => i === ei ? { ...ex, name: val } : ex));
  }, []);

  const updateSet = useCallback((ei, si, field, val) => {
    setExercises((prev) => prev.map((ex, i) => {
      if (i !== ei) return ex;
      const sets = ex.sets.map((s, j) => j === si ? { ...s, [field]: field === 'completed' ? val : val } : s);
      return { ...ex, sets };
    }));
  }, []);

  const addSet = useCallback((ei) => {
    setExercises((prev) => prev.map((ex, i) => {
      if (i !== ei) return ex;
      const last = ex.sets[ex.sets.length - 1];
      return { ...ex, sets: [...ex.sets, { reps: last?.reps || '', weight: last?.weight || '', completed: false }] };
    }));
  }, []);

  const removeSet = useCallback((ei, si) => {
    setExercises((prev) => prev.map((ex, i) => {
      if (i !== ei || ex.sets.length <= 1) return ex;
      return { ...ex, sets: ex.sets.filter((_, j) => j !== si) };
    }));
  }, []);

  const addExercise = useCallback((type = 'strength') => {
    if (type === 'cardio') {
      setExercises((prev) => [...prev, {
        name: '',
        repRange: 'cardio',
        restSeconds: 0,
        isCardio: true,
        cardioTimerMode: 'countdown',
        targetDurationSec: 1200,
        sets: [{ type: 'cardio', completed: false, elapsedSec: 0 }],
      }]);
    } else {
      setExercises((prev) => [...prev, {
        name: '',
        repRange: '8-12',
        restSeconds: 60,
        isCardio: false,
        sets: [{ reps: '', weight: '', completed: false }],
      }]);
    }
  }, []);

  const removeExercise = useCallback((ei) => {
    setExercises((prev) => prev.filter((_, i) => i !== ei));
  }, []);

  const toggleExType = useCallback((ei, newType) => {
    setExercises((prev) => prev.map((ex, i) => {
      if (i !== ei) return ex;
      if (newType === 'cardio' && !ex.isCardio) {
        return {
          ...ex,
          isCardio: true,
          repRange: 'cardio',
          restSeconds: 0,
          cardioTimerMode: 'countdown',
          targetDurationSec: 1200,
          sets: [{ type: 'cardio', completed: false, elapsedSec: 0 }],
        };
      } else if (newType === 'strength' && ex.isCardio) {
        return {
          ...ex,
          isCardio: false,
          repRange: '8-12',
          restSeconds: 60,
          cardioTimerMode: undefined,
          targetDurationSec: undefined,
          sets: [{ reps: '', weight: '', completed: false }],
        };
      }
      return ex;
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!workoutName.trim()) return;
    const valid = exercises.filter((ex) => ex.name.trim());
    if (valid.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workout-history/${workout.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          programName: workout.program_name,
          workoutName: workoutName.trim(),
          date: workout.date ? workout.date.split('T')[0] : '',
          exercises: valid,
          duration,
          notes: workout.notes || '',
        }),
      });
      const data = await res.json();
      if (data.success) {
        onSaved();
      }
    } catch {
      // handled by caller
    }
    setSaving(false);
  }, [workout, workoutName, exercises, duration, onSaved]);

  if (!workout) return null;

  return (
    <Modal open={open} onClose={onClose} title="Edit Workout" maxWidth="max-w-2xl">
      <div className="p-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
        {/* Name + Duration */}
        <div className="flex gap-3">
          <div className="flex-[2]">
            <label className="text-[10px] font-mono text-text-tertiary mb-0.5 block">Workout Name</label>
            <input type="text" value={workoutName} onChange={(e) => setWorkoutName(e.target.value)}
              className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-mono text-text-tertiary mb-0.5 block">Duration (min)</label>
            <input type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
              className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50" />
          </div>
        </div>

        {/* Exercises */}
        {exercises.map((ex, ei) => (
          <div key={ei} className={`border rounded-xl p-3 ${ex.isCardio ? 'bg-orange-400/5 border-orange-400/20' : 'bg-bg-1 border-border'}`}>
            <div className="flex items-center gap-2 mb-2">
              {/* Type toggle */}
              <div className="flex rounded-md overflow-hidden border border-border">
                <button
                  onClick={() => toggleExType(ei, 'strength')}
                  className={`px-2 py-1 text-[9px] font-mono ${!ex.isCardio ? 'bg-accent text-white' : 'bg-bg-0 text-text-muted'}`}
                >
                  STR
                </button>
                <button
                  onClick={() => toggleExType(ei, 'cardio')}
                  className={`px-2 py-1 text-[9px] font-mono ${ex.isCardio ? 'bg-orange-500 text-white' : 'bg-bg-0 text-text-muted'}`}
                >
                  CARDIO
                </button>
              </div>
              <input type="text" value={ex.name} onChange={(e) => updateExName(ei, e.target.value)}
                placeholder={ex.isCardio ? 'e.g. Treadmill, Cycling' : 'Exercise name'}
                list={ex.isCardio ? undefined : EXERCISE_LIST_ID}
                className="flex-1 bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50" />
              <button onClick={() => removeExercise(ei)} className="text-error text-xs px-2 py-1 border border-error/30 rounded-lg hover:bg-error/10">Remove</button>
            </div>

            {ex.isCardio ? (
              /* Cardio exercise config */
              <div className="flex flex-col gap-2">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <span className="text-[9px] font-mono text-text-muted">TIMER MODE</span>
                    <div className="flex gap-1 mt-0.5">
                      {['countdown', 'stopwatch', 'intervals', 'none'].map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setExercises(prev => prev.map((e, i) => i === ei ? { ...e, cardioTimerMode: mode } : e))}
                          className={`flex-1 py-1 text-[8px] font-mono rounded border transition-colors ${
                            ex.cardioTimerMode === mode
                              ? 'border-orange-400/50 bg-orange-400/10 text-orange-400'
                              : 'border-border bg-bg-0 text-text-muted'
                          }`}
                        >
                          {mode === 'countdown' ? '⏱↓' : mode === 'stopwatch' ? '⏱↑' : mode === 'intervals' ? '⟳' : '—'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="w-20">
                    <span className="text-[9px] font-mono text-text-muted">DURATION (min)</span>
                    <input
                      type="number"
                      value={Math.round((ex.targetDurationSec || 1200) / 60)}
                      onChange={(e) => setExercises(prev => prev.map((ex2, i) => i === ei ? { ...ex2, targetDurationSec: (parseInt(e.target.value) || 1) * 60 } : ex2))}
                      className="w-full bg-bg-0 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none"
                    />
                  </div>
                </div>
                <div className="text-[9px] text-text-muted font-mono">Photo upload available during workout</div>
              </div>
            ) : (
              /* Strength exercise sets */
              <>
                {/* Set headers */}
                <div className="flex gap-2 mb-1 px-1 text-[9px] font-mono text-text-muted uppercase">
                  <span className="w-6 text-center">#</span>
                  <span className="flex-1">Reps</span>
                  <span className="flex-1">Weight</span>
                  <span className="w-6 text-center">✓</span>
                  <span className="w-6"></span>
                </div>
                {ex.sets.map((set, si) => (
                  <div key={si} className="flex gap-2 mb-1 items-center">
                    <span className="w-6 text-center text-[10px] text-text-muted">{si + 1}</span>
                    <input type="number" value={set.reps} onChange={(e) => updateSet(ei, si, 'reps', e.target.value)}
                      className="flex-1 bg-bg-0 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none" />
                    <input type="number" step="0.5" value={set.weight} onChange={(e) => updateSet(ei, si, 'weight', e.target.value)}
                      className="flex-1 bg-bg-0 border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary outline-none" />
                    <input type="checkbox" checked={set.completed} onChange={(e) => updateSet(ei, si, 'completed', e.target.checked)}
                      className="w-4 h-4 accent-success" />
                    <button onClick={() => removeSet(ei, si)} className="w-6 text-center text-error text-[10px]">✕</button>
                  </div>
                ))}
                <button onClick={() => addSet(ei)} className="w-full mt-1 py-1.5 text-[10px] font-mono text-text-tertiary border border-dashed border-border rounded-lg hover:border-accent/30">
                  + Add Set
                </button>
              </>
            )}
          </div>
        ))}

        {/* Add exercise buttons */}
        <div className="flex gap-2">
          <button onClick={() => addExercise('strength')} className="flex-1 py-2.5 text-xs font-mono text-text-secondary border-2 border-dashed border-border rounded-xl hover:border-accent/30">
            + Strength
          </button>
          <button onClick={() => addExercise('cardio')} className="flex-1 py-2.5 text-xs font-mono text-orange-400/70 border-2 border-dashed border-orange-400/20 rounded-xl hover:border-orange-400/40">
            + Cardio
          </button>
        </div>
      </div>

      <div className="flex gap-2 p-4 border-t border-border">
        <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving} className="flex-[2]">
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </Modal>
  );
}
