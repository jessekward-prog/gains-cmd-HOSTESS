import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SetRow from './SetRow';
import RestTimer from './RestTimer';
import ProgressionBar from './ProgressionBar';
import NavIcon from './NavIcon';
import SubstituteModal from './SubstituteModal';
import RestPickerModal from './RestPickerModal';
import ExerciseNotes from './ExerciseNotes';
import RecoveryNote from './RecoveryNote';
import SpecialSetModal from './SpecialSetModal';
import TypewriterName from './TypewriterName';
import { SupersetHeader } from './SupersetCard';
import { supersetMembersOf, nextMemberForRound } from '../lib/supersets';
import { targetLabel } from '../lib/format';

/* ── The shared exercise detail panel (sets + actions) ────────── */
function ExerciseDetail({
  exercise,
  exerciseIndex,
  allExercises,
  onUpdateSet,
  onDeleteSet,
  onAddSet,
  onSetComplete,
  onUpdateRepRange,
  onUpdateRest,
  onSubstitute,
  onAddDropSet,
  onRemoveDropSet,
  onAddBFR,
  onRemoveBFR,
  onAddInterval,
  onRemoveInterval,
  onLinkSuperset,
  onUnlinkSuperset,
  onAddVariable,
  onRemoveVariable,
}) {
  const [showSubstitute, setShowSubstitute] = useState(false);
  const [showRestPicker, setShowRestPicker] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showSpecial, setShowSpecial] = useState(false);
  const [intervalPhase, setIntervalPhase] = useState('idle');

  const hasIntervalSets = exercise.sets.some(s => s.type === 'interval');

  const handleUpdateSet = useCallback((si, data) => onUpdateSet(exerciseIndex, si, data), [exerciseIndex, onUpdateSet]);
  const handleDeleteSet = useCallback((si) => onDeleteSet(exerciseIndex, si), [exerciseIndex, onDeleteSet]);
  const handleToggleFailure = useCallback((si) => {
    const s = exercise.sets[si];
    onUpdateSet(exerciseIndex, si, { ...s, reps: s.reps === 'failure' ? '' : 'failure' });
  }, [exercise.sets, exerciseIndex, onUpdateSet]);
  const handleRepRangeChange = useCallback((e) => onUpdateRepRange(exerciseIndex, e.target.value), [exerciseIndex, onUpdateRepRange]);

  return (
    <div>
      {/* Controls row */}
      <div className="flex items-center gap-3 px-3 py-3 bg-bg-1 border-t border-b border-border text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-text-tertiary font-mono">REPS</span>
          <select value={exercise.repRange || exercise.targetReps} onChange={handleRepRangeChange}
            className="bg-bg-3 text-text-primary border border-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-accent tap-target">
            {['1-5', '5-8', '8-12', '12-15', '15-20', '20+'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowRestPicker(true)}
          className="flex items-center gap-1.5 bg-bg-3 border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary tap-target">
          <span className="text-text-tertiary"><NavIcon id="clock" size={14} /></span>
          <span>{Math.floor(exercise.restSeconds / 60)}m{exercise.restSeconds % 60 > 0 ? ` ${exercise.restSeconds % 60}s` : ''}</span>
        </motion.button>
        <div className="ml-auto">
          <RestTimer seconds={exercise.restSeconds} compact />
        </div>
      </div>

      <RestPickerModal open={showRestPicker} onClose={() => setShowRestPicker(false)}
        minutes={Math.floor(exercise.restSeconds / 60)} seconds={exercise.restSeconds % 60}
        onConfirm={(totalSeconds) => onUpdateRest(exerciseIndex, totalSeconds)} />

      {/* Column headers */}
      <div className="grid grid-cols-[32px_1fr_1fr_44px] gap-2 px-3 py-2 text-[10px] font-mono text-text-tertiary uppercase tracking-wider">
        <span className="text-center">SET</span>
        <span className="text-center">KG</span>
        <span className="text-center">REPS</span>
        <span className="text-center">✓</span>
      </div>

      {/* Set rows */}
      <AnimatePresence>
        {(() => {
          let normalCount = 0;
          return exercise.sets.map((set, si) => {
            const isNormal = set.type !== 'drop';
            const ni = isNormal ? normalCount++ : normalCount - 1;
            return (
              <SetRow key={si} index={si} normalIndex={ni} set={set} exerciseIndex={exerciseIndex}
                onUpdate={handleUpdateSet} onDelete={handleDeleteSet}
                onComplete={onSetComplete} restSeconds={exercise.restSeconds}
                onPhaseChange={hasIntervalSets ? setIntervalPhase : undefined} />
            );
          });
        })()}
      </AnimatePresence>

      {/* Exercise Notes */}
      <AnimatePresence>
        {showNotes && (
          <div className="px-3 pb-2">
            <ExerciseNotes exerciseName={exercise.name}
              exerciseTarget={`${exercise.sets.length} sets × ${exercise.targetReps || exercise.repRange} reps`}
              onClose={() => setShowNotes(false)} />
          </div>
        )}
      </AnimatePresence>

      {/* Action buttons — uniform icon-over-label so labels of any length line up */}
      <div className="flex border-t border-border">
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => onAddSet(exerciseIndex)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-accent hover:bg-accent-muted transition-colors">
          <NavIcon id="plus" size={16} />
          <span className="text-[10px] font-mono leading-none">Set</span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.95 }}
          onClick={() => {
            const normalSets = exercise.sets.filter(s => s.type !== 'drop');
            if (normalSets.length <= 1) return;
            let lastNormalIdx = -1;
            for (let i = exercise.sets.length - 1; i >= 0; i--) {
              if (exercise.sets[i].type !== 'drop') { lastNormalIdx = i; break; }
            }
            if (lastNormalIdx >= 0) onDeleteSet(exerciseIndex, lastNormalIdx);
          }}
          disabled={exercise.sets.filter(s => s.type !== 'drop').length <= 1}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-error/60 hover:bg-error/5 hover:text-error transition-colors border-l border-border disabled:opacity-30 disabled:pointer-events-none">
          <NavIcon id="minus" size={16} />
          <span className="text-[10px] font-mono leading-none">Set</span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowSpecial(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-text-secondary hover:bg-bg-3 transition-colors border-l border-border">
          <NavIcon id="star" size={16} />
          <span className="text-[10px] font-mono leading-none">Special</span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowNotes(p => !p)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors border-l border-border ${showNotes ? 'text-success bg-success-muted' : 'text-text-tertiary hover:bg-bg-3'}`}>
          <NavIcon id="notes" size={16} />
          <span className="text-[10px] font-mono leading-none">Notes</span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowSubstitute(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-warning hover:bg-warning-muted transition-colors border-l border-border">
          <NavIcon id="swap" size={16} />
          <span className="text-[10px] font-mono leading-none">Swap</span>
        </motion.button>
      </div>

      <SubstituteModal open={showSubstitute} onClose={() => setShowSubstitute(false)}
        exerciseName={exercise.name} onSelect={(newName) => onSubstitute?.(exerciseIndex, newName)} />

      <SpecialSetModal
        open={showSpecial}
        onClose={() => setShowSpecial(false)}
        exercise={exercise}
        allExercises={allExercises}
        exerciseIndex={exerciseIndex}
        onAddDropSet={onAddDropSet}
        onRemoveDropSet={onRemoveDropSet}
        onUnlinkSuperset={onUnlinkSuperset}
        onAddBFR={onAddBFR}
        onRemoveBFR={onRemoveBFR}
        onAddInterval={onAddInterval}
        onRemoveInterval={onRemoveInterval}
        onLinkSuperset={onLinkSuperset}
        onAddVariable={onAddVariable}
        onRemoveVariable={onRemoveVariable}
        onToggleFailure={handleToggleFailure}
      />
    </div>
  );
}

/* ── Single block tile ────────────────────────────────────────── */
function BlockTile({ exercise, active, onClick, small }) {
  const completedCount = exercise.sets.filter(s => s.completed).length;
  const totalSets = exercise.sets.length;
  const allComplete = completedCount === totalSets && totalSets > 0;
  const weight = exercise.sets?.[0]?.weight || '';
  const hasDropSets = exercise.sets.some(s => s.type === 'drop');
  const hasBFRSets = exercise.sets.some(s => s.type === 'bfr');

  const bgClass = allComplete
    ? 'bg-success/5 border-success/30'
    : active
      ? 'bg-bg-2 border-accent/50'
      : 'bg-bg-2 border-border';

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`rounded-xl border-2 text-center transition-all overflow-hidden ${bgClass} ${small ? 'p-2' : 'p-3'}`}
    >
      <div className={`font-mono font-bold ${small ? 'text-lg' : 'text-2xl'} ${allComplete ? 'text-success' : active ? 'text-text-primary' : 'text-text-secondary'}`}>
        {weight || '—'}
      </div>
      <div className={`text-text-muted ${small ? 'text-[8px]' : 'text-[9px]'}`}>kg</div>
      <div className={`font-display font-medium truncate mt-1 ${small ? 'text-[9px]' : 'text-[11px]'} ${allComplete ? 'text-success' : active ? 'text-text-primary' : 'text-text-tertiary'}`}>
        {exercise.name}
      </div>
      {!small && (
        <>
          {(hasDropSets || hasBFRSets || exercise.supersetWith) && (
            <div className="flex gap-1 justify-center mt-1">
              {exercise.supersetWith && <span className="text-[7px] font-mono px-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">SS</span>}
              {hasDropSets && <span className="text-[7px] font-mono px-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">DROP</span>}
              {hasBFRSets && <span className="text-[7px] font-mono px-1 rounded bg-purple-400/10 text-purple-400 border border-purple-400/20">BFR</span>}
            </div>
          )}
          <div className="flex gap-[3px] justify-center mt-2">
            {exercise.sets.filter(s => s.type !== 'drop').map((set, i) => (
              <div
                key={i}
                className={`w-[7px] h-[7px] rounded-full ${
                  set.completed ? 'bg-success' : active && i === exercise.sets.filter(s => s.type !== 'drop' && !s.completed).indexOf(set) ? 'bg-accent shadow-[0_0_4px_var(--color-accent)]' : 'bg-bg-4'
                }`}
              />
            ))}
          </div>
        </>
      )}
      {small && (
        <div className={`text-[9px] font-mono mt-1 ${allComplete ? 'text-success' : 'text-text-muted'}`}>
          {allComplete ? '✓' : `${completedCount}/${totalSets}`}
        </div>
      )}
    </motion.button>
  );
}

/* ── Main BlockGridView ───────────────────────────────────────── */
export default function BlockGridView({
  exercises,
  allHandlers,
  onSetSupersetRest,
}) {
  const [activeIndex, setActiveIndex] = useState(null);
  const flipRef = useRef(null);
  const manualUntilRef = useRef(0);
  const expandMode = useMemo(() => {
    try { return localStorage.getItem('gains-cmd-expand-mode') || 'inline'; } catch { return 'inline'; }
  }, []);

  const activeExercise = activeIndex !== null ? exercises[activeIndex] : null;

  // A superset switches by moving the open tile, so the panel header, hero
  // weight and nav dots all follow the member you're on for free.
  const activeMembers = activeIndex !== null ? supersetMembersOf(exercises, activeIndex) : null;

  const handleSelectMember = useCallback((ei) => {
    manualUntilRef.current = Date.now() + 2500;
    clearTimeout(flipRef.current);
    setActiveIndex(ei);
  }, []);

  useEffect(() => () => clearTimeout(flipRef.current), []);

  const handlers = useMemo(() => ({
    ...allHandlers,
    onSetComplete: (ei, si, rest) => {
      allHandlers.onSetComplete?.(ei, si, rest);
      const members = supersetMembersOf(exercises, ei);
      if (!members || Date.now() < manualUntilRef.current) return;
      const next = nextMemberForRound(exercises, members, ei, si);
      if (next < 0) return;
      clearTimeout(flipRef.current);
      flipRef.current = setTimeout(() => setActiveIndex(next), 420);
    },
  }), [allHandlers, exercises]);

  const handleBlockClick = useCallback((index) => {
    setActiveIndex((prev) => prev === index ? null : index);
  }, []);

  const handleClose = useCallback(() => {
    setActiveIndex(null);
  }, []);

  // ── INLINE EXPAND ──────────────────────────────────────────────
  if (expandMode === 'inline') {
    return (
      <div className="p-2 flex flex-col gap-2">
        <AnimatePresence mode="sync">
          {activeIndex !== null && activeExercise && (
            <motion.div
              key={`expanded-${activeIndex}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="rounded-xl border-2 border-accent/50 bg-bg-2 overflow-hidden"
            >
              <motion.button whileTap={{ scale: 0.98 }} onClick={handleClose}
                className="w-full flex items-center justify-between p-3 text-left">
                <div>
                  <div className="font-display font-bold text-lg text-text-primary"><TypewriterName text={activeExercise.name} /></div>
                  <div className="text-xs text-text-tertiary font-mono">
                    {targetLabel(activeExercise)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-2xl font-bold">{activeExercise.sets?.[0]?.weight || '—'}</span>
                  <span className="text-text-muted text-xs">kg</span>
                  <span className="text-text-muted text-sm ml-1">▼</span>
                </div>
              </motion.button>
              {activeMembers && (
                <SupersetHeader exercises={exercises} indices={activeMembers}
                  activeIndex={activeIndex} onSelect={handleSelectMember}
                  onSetRestMode={onSetSupersetRest} />
              )}
              <ExerciseDetail
                exercise={activeExercise}
                exerciseIndex={activeIndex}
                allExercises={exercises}
                {...handlers}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Grid of remaining blocks */}
        <div className={`grid gap-2 ${activeIndex !== null ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {exercises.map((exercise, ei) => {
            if (ei === activeIndex) return null;
            return (
              <BlockTile
                key={ei}
                exercise={exercise}
                active={false}
                small={activeIndex !== null}
                onClick={() => handleBlockClick(ei)}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // ── BOTTOM DRAWER ──────────────────────────────────────────────
  if (expandMode === 'drawer') {
    return (
      <div className="flex flex-col">
        {/* Grid always visible */}
        <div className="grid grid-cols-2 gap-2 p-2">
          {exercises.map((exercise, ei) => (
            <BlockTile
              key={ei}
              exercise={exercise}
              active={ei === activeIndex}
              onClick={() => handleBlockClick(ei)}
            />
          ))}
        </div>

        {/* Drawer */}
        <AnimatePresence>
          {activeIndex !== null && activeExercise && (
            <motion.div
              key="drawer"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-bg-1 border-t-2 border-accent/40 rounded-t-2xl overflow-hidden"
            >
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-8 h-1 bg-bg-4 rounded-full" />
              </div>
              <div className="flex items-center justify-between px-3 pb-2">
                <div>
                  <div className="font-display font-bold text-lg text-text-primary"><TypewriterName text={activeExercise.name} /></div>
                  <div className="text-[10px] text-text-tertiary font-mono">
                    {targetLabel(activeExercise)}
                  </div>
                </div>
                <motion.button whileTap={{ scale: 0.9 }} onClick={handleClose}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-text-muted text-xs">✕</motion.button>
              </div>
              {activeMembers && (
                <SupersetHeader exercises={exercises} indices={activeMembers}
                  activeIndex={activeIndex} onSelect={handleSelectMember}
                  onSetRestMode={onSetSupersetRest} />
              )}
              <ExerciseDetail
                exercise={activeExercise}
                exerciseIndex={activeIndex}
                allExercises={exercises}
                {...handlers}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── FULL TAKEOVER ──────────────────────────────────────────────
  if (expandMode === 'takeover') {
    if (activeIndex !== null && activeExercise) {
      const completedCount = activeExercise.sets.filter(s => s.completed).length;
      const totalSets = activeExercise.sets.length;
      return (
        <motion.div
          key={`takeover-${activeIndex}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="p-2"
        >
          {/* Back bar */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <motion.button whileTap={{ scale: 0.9 }} onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-text-secondary text-sm">
              ←
            </motion.button>
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-lg text-text-primary truncate"><TypewriterName text={activeExercise.name} /></div>
              <div className="text-[10px] text-text-tertiary font-mono">
                Exercise {activeIndex + 1} of {exercises.length}
              </div>
            </div>
            <div className="font-mono text-xs text-text-muted">{completedCount}/{totalSets}</div>
          </div>

          {/* Hero weight */}
          <div className="text-center py-4">
            <div className="font-mono font-bold text-5xl text-text-primary tracking-tight">
              {activeExercise.sets?.[0]?.weight || '—'}
            </div>
            <div className="text-xs text-text-tertiary mt-1">
              kg · {targetLabel(activeExercise)}
            </div>
            <ProgressionBar exerciseName={activeExercise.name} weight={activeExercise.sets?.[0]?.weight || '0'} />
          </div>
          <RecoveryNote exerciseName={activeExercise.name} />

          {/* Detail panel */}
          <div className="rounded-xl border border-border bg-bg-2 overflow-hidden">
            {activeMembers && (
              <SupersetHeader exercises={exercises} indices={activeMembers}
                activeIndex={activeIndex} onSelect={handleSelectMember}
                onSetRestMode={onSetSupersetRest} />
            )}
            <ExerciseDetail
              exercise={activeExercise}
              exerciseIndex={activeIndex}
              allExercises={exercises}
              {...handlers}
            />
          </div>

          {/* Quick nav dots */}
          <div className="flex justify-center gap-2 mt-3">
            {exercises.map((_, i) => (
              <motion.button key={i} whileTap={{ scale: 0.8 }} onClick={() => setActiveIndex(i)}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  i === activeIndex ? 'bg-accent' : exercises[i].sets.every(s => s.completed) ? 'bg-success' : 'bg-bg-4'
                }`} />
            ))}
          </div>
        </motion.div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2 p-2">
        {exercises.map((exercise, ei) => (
          <BlockTile
            key={ei}
            exercise={exercise}
            active={false}
            onClick={() => handleBlockClick(ei)}
          />
        ))}
      </div>
    );
  }

  // ── MODAL OVERLAY ──────────────────────────────────────────────
  // (expandMode === 'modal' or fallback)
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 p-2">
        {exercises.map((exercise, ei) => (
          <BlockTile
            key={ei}
            exercise={exercise}
            active={ei === activeIndex}
            onClick={() => handleBlockClick(ei)}
          />
        ))}
      </div>

      <AnimatePresence>
        {activeIndex !== null && activeExercise && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center px-3"
            onClick={handleClose}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-bg-1 border border-border rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-3 border-b border-border sticky top-0 bg-bg-1 z-10">
                <div>
                  <div className="font-display font-bold text-lg text-text-primary"><TypewriterName text={activeExercise.name} /></div>
                  <div className="text-[10px] text-text-tertiary font-mono">
                    {targetLabel(activeExercise)}
                  </div>
                </div>
                <motion.button whileTap={{ scale: 0.9 }} onClick={handleClose}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-text-muted text-xs">✕</motion.button>
              </div>
              {activeMembers && (
                <SupersetHeader exercises={exercises} indices={activeMembers}
                  activeIndex={activeIndex} onSelect={handleSelectMember}
                  onSetRestMode={onSetSupersetRest} />
              )}
              <ExerciseDetail
                exercise={activeExercise}
                exerciseIndex={activeIndex}
                allExercises={exercises}
                {...handlers}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
