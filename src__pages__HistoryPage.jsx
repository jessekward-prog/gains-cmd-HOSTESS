import { useState, useMemo, useCallback } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import Calendar from '../components/Calendar';
import ConfirmDialog from '../components/ConfirmDialog';
import EditWorkoutModal from '../components/EditWorkoutModal';
import Button from '../components/Button';
import * as api from '../lib/api';
import { isMarker } from '../lib/history';

const MONO = 'var(--font-mono)';

export default function HistoryPage() {
  const { workoutHistory, reloadHistory } = useWorkout();
  const { showToast } = useToast();
  const [selectedDate, setSelectedDate] = useState(() => {
    const last = (workoutHistory || []).find((w) => !isMarker(w));
    return last?.date ? String(last.date).split('T')[0] : null;
  });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editWorkout, setEditWorkout] = useState(null);
  const [expandedAnalysis, setExpandedAnalysis] = useState({});

  // Build date set — exclude milestones
  const workoutDates = useMemo(() => {
    const dates = new Set();
    (workoutHistory || []).forEach((w) => {
      if (isMarker(w)) return;
      const d = w.date ? String(w.date).split('T')[0] : '';
      if (d) dates.add(d);
    });
    return dates;
  }, [workoutHistory]);

  const selectedWorkouts = useMemo(() => {
    if (!selectedDate || !workoutHistory) return [];
    return workoutHistory.filter((w) => {
      if (w.program_name === 'SNOOZE_MILESTONE') return false; // internal; Level Ups still show as their own card
      const d = w.date ? String(w.date).split('T')[0] : '';
      return d === selectedDate;
    });
  }, [selectedDate, workoutHistory]);

  const parseExercises = (exercises) => {
    if (!exercises) return [];
    try {
      const parsed = typeof exercises === 'string' ? JSON.parse(exercises) : exercises;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    try {
      await api.deleteWorkoutHistory(deleteConfirm);
      await reloadHistory();
      showToast('Workout deleted', 'success');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, reloadHistory, showToast]);

  const handleEditSaved = useCallback(async () => {
    await reloadHistory();
    setEditWorkout(null);
    showToast('Workout updated', 'success');
  }, [reloadHistory, showToast]);

  const toggleAnalysis = useCallback((id) => {
    setExpandedAnalysis((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const totalWorkouts = useMemo(() =>
    (workoutHistory || []).filter(w => !isMarker(w)).length,
  [workoutHistory]);

  const dayLabel = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })
    : '';
  const sessionCount = selectedWorkouts.filter((w) => !isMarker(w)).length;

  return (
    <div className="g-root px-4 pt-2.5 pb-7 fx-rise">
      <h1 className="mx-1 mt-3 mb-0.5 g-h1">History</h1>
      <p className="mx-1 text-text-tertiary" style={{ font: `400 12px ${MONO}` }}>{totalWorkouts} workout{totalWorkouts !== 1 ? 's' : ''} logged</p>

      <div className="mt-4 bg-bg-1 rounded-[26px] p-4">
        <Calendar workoutDates={workoutDates} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      </div>

      {selectedDate && (
        <div key={selectedDate}>
          <div className="mx-1 mt-[22px] mb-2.5 flex justify-between items-baseline">
            <span className="text-lg font-extrabold">{dayLabel}</span>
            <span className="text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{sessionCount ? `${sessionCount} session${sessionCount > 1 ? 's' : ''}` : ''}</span>
          </div>
          <div className="flex flex-col gap-2">
            {selectedWorkouts.length === 0 && (
              <div className="p-6 text-center text-text-tertiary" style={{ font: `400 12px ${MONO}` }}>Rest day.</div>
            )}
            {selectedWorkouts.map((workout) => {
              if (workout.program_name === 'LEVEL_UP_MILESTONE' && workout.notes?.startsWith('LEVEL_UP:')) {
                const parts = workout.notes.split(':');
                return (
                  <div key={workout.id} className="flex items-center gap-3 p-4 rounded-[22px] fx-in" style={{ background: 'var(--color-pr-soft)' }}>
                    <span className="w-9 h-9 rounded-[12px] flex items-center justify-center font-extrabold" style={{ background: 'var(--color-pr)', color: '#1f1400' }}>↑</span>
                    <div>
                      <div className="text-[15px] font-extrabold">Level up</div>
                      <div className="mt-0.5 text-text-secondary" style={{ font: `400 12px ${MONO}` }}>{parts[1]} — {parts[2]}kg → {parts[3]}kg</div>
                    </div>
                  </div>
                );
              }
              if (isMarker(workout)) return null;

              const exs = parseExercises(workout.exercises);
              const isPending = workout.notes?.includes('AI_ANALYSIS_PENDING') || workout.notes?.startsWith('⏳');
              const cleanNotes = workout.notes
                ? workout.notes.replace('⏳ AI_ANALYSIS_PENDING', '').replace('AI_ANALYSIS_PENDING', '').trim()
                : '';
              const cardioIdx = cleanNotes.indexOf('📱 Cardio Data');
              const aiNotes = cardioIdx >= 0 ? cleanNotes.substring(0, cardioIdx).trim() : cleanNotes;
              const cardioNotes = cardioIdx >= 0 ? cleanNotes.substring(cardioIdx) : '';
              const open = expandedAnalysis[workout.id];
              const cardioOpen = expandedAnalysis[workout.id + '-cardio'];

              return (
                <div key={workout.id} className="bg-bg-1 rounded-[22px] p-4 fx-in">
                  <div className="flex justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="text-[17px] font-extrabold truncate" style={{ letterSpacing: '-0.02em' }}>{workout.workout_name || 'Workout'}</div>
                      <div className="mt-0.5 text-text-tertiary truncate" style={{ font: `400 11px ${MONO}` }}>{workout.program_name || 'Unknown program'} · {workout.duration || 0} min</div>
                    </div>
                    <button onClick={() => setEditWorkout(workout)} className="h-[30px] px-2.5 rounded-[10px] bg-bg-2 text-text-secondary flex-shrink-0" style={{ font: `500 10px ${MONO}` }}>Edit</button>
                  </div>

                  <div className="flex flex-col gap-1.5 mt-3">
                    {exs.length === 0 && <div className="text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>No exercise data</div>}
                    {exs.map((ex, i) => {
                      const all = ex.sets || [];
                      const main = all.filter((x) => x.type !== 'drop');
                      const drops = all.filter((x) => x.type === 'drop');
                      const done = all.filter((x) => x.completed).length;
                      const base = main[0]?.weight || all[0]?.weight || '';
                      const tail = drops.length
                        ? ` · drop ${[base, ...drops.map((x) => x.weight)].filter(Boolean).join('→')}kg`
                        : base ? ` @ ${base}kg` : '';
                      return (
                        <div key={i} className="flex justify-between gap-2.5 text-[13px]">
                          <span className="font-semibold min-w-0 truncate">
                            {ex.substituted && <span className="line-through text-text-tertiary mr-1">{ex.substituted.original}</span>}
                            {ex.name}
                          </span>
                          {all.length > 0 && <span className="text-text-secondary whitespace-nowrap" style={{ font: `400 11px ${MONO}` }}>{done}/{all.length}{tail}</span>}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center gap-4">
                    {isPending && <span className="text-accent animate-pulse" style={{ font: `500 11px ${MONO}` }}>AI analysis in progress…</span>}
                    {!isPending && aiNotes && (
                      <button onClick={() => toggleAnalysis(workout.id)} className="flex items-center gap-1.5 text-accent" style={{ font: `500 11px ${MONO}` }}>
                        <span className="inline-block transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>›</span>AI analysis
                      </button>
                    )}
                    {cardioNotes && (
                      <button onClick={() => toggleAnalysis(workout.id + '-cardio')} className="flex items-center gap-1.5 text-text-secondary" style={{ font: `500 11px ${MONO}` }}>
                        <span className="inline-block transition-transform" style={{ transform: cardioOpen ? 'rotate(90deg)' : 'none' }}>›</span>Cardio data
                      </button>
                    )}
                    <button onClick={() => setDeleteConfirm(workout.id)} className="ml-auto text-error/70" style={{ font: `500 10px ${MONO}` }}>Delete</button>
                  </div>
                  {open && aiNotes && (
                    <div className="mt-2.5 p-3.5 rounded-2xl bg-bg-2 text-[13px] text-text-secondary whitespace-pre-line fx-in" style={{ lineHeight: 1.55 }}>{aiNotes}</div>
                  )}
                  {cardioOpen && cardioNotes && (
                    <div className="mt-2.5 p-3.5 rounded-2xl bg-bg-2 text-[13px] text-text-secondary whitespace-pre-line fx-in" style={{ lineHeight: 1.55 }}>{cardioNotes}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Workout?"
        message="This will permanently delete this workout. This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      <EditWorkoutModal
        open={!!editWorkout}
        workout={editWorkout}
        onClose={() => setEditWorkout(null)}
        onSaved={handleEditSaved}
      />
    </div>
  );
}

function exerciseToMuscleGroup(name) {
  const n = (name || '').toLowerCase();
  if (/bench|chest fly|pec deck|push.?up|dip|incline press|decline press|cable cross/.test(n)) return 'Chest';
  if (/row|pull.?up|pullup|chin.?up|lat pull|deadlift|rdl|rack pull|seal row|back extension/.test(n)) return 'Back';
  if (/shoulder press|ohp|overhead press|military press|lateral raise|front raise|rear delt|arnold press|upright row/.test(n)) return 'Shoulders';
  if (/curl|tricep|pushdown|skull|forearm|shrug/.test(n)) return 'Arms';
  if (/squat|lunge|leg press|leg curl|leg extension|hip thrust|glute|calf|step.?up|hamstring|quad|clean|snatch|sled/.test(n)) return 'Legs';
  if (/crunch|plank|ab |abs|sit.?up|russian twist|cable crunch|oblique|toes.?to.?bar|hollow/.test(n)) return 'Core';
  return 'Back';
}
