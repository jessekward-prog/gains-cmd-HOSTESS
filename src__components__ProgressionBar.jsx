import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useWorkout } from '../context/WorkoutContext';

export default function ProgressionBar({ exerciseName, weight }) {
  const { workoutHistory, settings } = useWorkout();

  const { count, target, pct } = useMemo(() => {
    const targetWeight = parseFloat(weight) || 0;
    if (targetWeight <= 0) return { count: 0, target: 9, pct: 0 };

    let progressionSpeed = 9;
    if (settings?.aggressionSettings) {
      const a = typeof settings.aggressionSettings === 'string'
        ? JSON.parse(settings.aggressionSettings) : settings.aggressionSettings;
      progressionSpeed = a.progressionSpeed || 9;
    }

    const history = workoutHistory || [];

    // If a Level Up was accepted FROM this weight, the progression cycle is
    // complete — reset to zero regardless of how many sessions exist at it.
    const leveledUpFrom = history.some(w => {
      if (w.program_name !== 'LEVEL_UP_MILESTONE') return false;
      const parts = (w.notes || '').split(':');
      return (
        parts[0] === 'LEVEL_UP' &&
        parts[1] === exerciseName &&
        Math.abs((parseFloat(parts[2]) || 0) - targetWeight) < 0.01
      );
    });
    if (leveledUpFrom) return { count: 0, target: progressionSpeed, pct: 0 };

    // Find the most recent snooze for this exercise at this weight.
    // History is ordered DESC so the first match is the newest.
    let snoozeDate = null;
    let snoozeCount = null;
    for (const w of history) {
      if (w.program_name !== 'SNOOZE_MILESTONE') continue;
      const parts = (w.notes || '').split(':');
      if (
        parts[0] === 'SNOOZE' &&
        parts[1] === exerciseName &&
        Math.abs((parseFloat(parts[2]) || 0) - targetWeight) < 0.01
      ) {
        snoozeDate = w.date;
        snoozeCount = parseInt(parts[3]) || 3;
        break;
      }
    }

    let cnt = 0;
    history.forEach((w) => {
      if (w.program_name === 'LEVEL_UP_MILESTONE' || w.program_name === 'SNOOZE_MILESTONE') return;
      if (snoozeDate && w.date <= snoozeDate) return;

      const exercises = typeof w.exercises === 'string' ? JSON.parse(w.exercises) : w.exercises;
      if (!exercises) return;

      exercises.forEach((ex) => {
        if (!ex || ex.name !== exerciseName) return;
        const exWeight = parseFloat(ex.sets?.[0]?.weight) || 0;
        if (exWeight !== targetWeight) return;

        const mainSets = (ex.sets || []).filter(s => s?.completed && s.type !== 'drop');
        const completedSets = mainSets.length > 0 ? mainSets : (ex.sets || []).filter(s => s?.completed);
        if (completedSets.length === 0) return;

        const repRange = ex.repRange || ex.targetReps || '8-12';
        if (repRange === 'timer') { cnt++; return; }

        let minReps, maxReps;
        if (repRange.includes('-')) {
          [minReps, maxReps] = repRange.split('-').map(Number);
        } else if (repRange.includes('+')) {
          minReps = parseInt(repRange);
          maxReps = 999;
        } else {
          minReps = maxReps = parseInt(repRange);
        }

        const allInRange = completedSets.every((s) => {
          const reps = parseInt(s.reps);
          return reps >= minReps && reps <= maxReps;
        });
        if (allInRange) cnt++;
      });
    });

    const effectiveTarget = snoozeCount || progressionSpeed;
    return {
      count: cnt,
      target: effectiveTarget,
      pct: Math.min(100, Math.round((cnt / effectiveTarget) * 100)),
    };
  }, [exerciseName, weight, workoutHistory, settings]);

  if (count === 0 && parseFloat(weight) <= 0) return null;

  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="w-14 h-1.5 bg-bg-4 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${pct >= 100 ? 'bg-success' : 'bg-accent'}`}
        />
      </div>
      <span className={`text-[10px] font-mono ${count >= target ? 'text-success' : 'text-text-tertiary'}`}>
        {count >= target ? 'Ready' : `${count}/${target}`}
      </span>
    </div>
  );
}
