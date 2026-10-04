import { useWorkout } from '../context/WorkoutContext';
import * as api from '../lib/api';

// A recovery note saved from the exercise's AI Notes last session. `compact`
// is text only, for inside the card's header button (no nested buttons).
export default function RecoveryNote({ exerciseName, compact }) {
  const { recoveryNotes, setRecoveryNote } = useWorkout();
  const note = recoveryNotes[exerciseName];
  if (note == null) return null;

  if (compact) {
    return <div className="text-[10px] font-mono text-warning mt-0.5 truncate">Recovery: {note}</div>;
  }

  const clear = () => {
    setRecoveryNote(exerciseName, null);
    api.setRecoveryStatus(exerciseName, 'recovered', note).catch(() => {});
  };
  return (
    <div className="mx-3 my-2 px-3 py-2 rounded-lg bg-warning-muted border border-warning/30 flex items-center gap-3">
      <div className="flex-1 min-w-0 text-xs text-text-primary">
        <div className="text-[10px] font-mono uppercase tracking-wider text-warning mb-0.5">Recovery note from last time</div>
        {note}
      </div>
      <button onClick={clear} className="shrink-0 text-[11px] font-mono px-2.5 py-1.5 rounded-lg border border-warning/40 text-warning">
        Feeling fine
      </button>
    </div>
  );
}
