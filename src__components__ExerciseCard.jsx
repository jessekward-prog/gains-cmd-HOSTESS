import { motion, AnimatePresence } from 'framer-motion';
import { useState, useCallback, useEffect, useRef } from 'react';
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
import { staggerItem } from '../lib/variants';
import { targetLabel } from '../lib/format';

export default function ExerciseCard({
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
  onTimerActiveChange,
  inSuperset = false,
}) {
  // Inside a superset the shell owns the chrome and the card is always open —
  // the A/B switch above it is what changes which exercise you're looking at.
  const [selfExpanded, setSelfExpanded] = useState(false);
  const expanded = inSuperset || selfExpanded;
  const [showSubstitute, setShowSubstitute] = useState(false);
  const [showRestPicker, setShowRestPicker] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showSpecial, setShowSpecial] = useState(false);
  const [intervalPhase, setIntervalPhase] = useState('idle'); // 'idle'|'countin'|'work'|'rest'|'done'

  const completedCount = exercise.sets.filter((s) => s.completed).length;
  const totalSets = exercise.sets.length;
  const allComplete = completedCount === totalSets && totalSets > 0;
  const hasDropSets = exercise.sets.some(s => s.type === 'drop');
  const hasBFRSets = exercise.sets.some(s => s.type === 'bfr');
  const hasVariableSets = exercise.sets.some(s => s.type === 'variable');
  const isSuperset = !!exercise.supersetWith;

  const hasAutoCollapsed = useRef(false);
  useEffect(() => {
    if (inSuperset) return;
    if (allComplete && expanded && !hasAutoCollapsed.current) {
      hasAutoCollapsed.current = true;
      const t = setTimeout(() => setSelfExpanded(false), 600);
      return () => clearTimeout(t);
    }
    if (!allComplete) hasAutoCollapsed.current = false;
  }, [allComplete, expanded, inSuperset]);

  const handleToggle = useCallback(() => setSelfExpanded((p) => !p), []);
  const handleUpdateSet = useCallback((si, data) => onUpdateSet(exerciseIndex, si, data), [exerciseIndex, onUpdateSet]);
  const handleDeleteSet = useCallback((si) => onDeleteSet(exerciseIndex, si), [exerciseIndex, onDeleteSet]);
  const handleToggleFailure = useCallback((si) => {
    const s = exercise.sets[si];
    onUpdateSet(exerciseIndex, si, { ...s, reps: s.reps === 'failure' ? '' : 'failure' });
  }, [exercise.sets, exerciseIndex, onUpdateSet]);
  const handleRepRangeChange = useCallback((e) => onUpdateRepRange(exerciseIndex, e.target.value), [exerciseIndex, onUpdateRepRange]);
  const handleRestChange = useCallback((field, value) => {
    const currentMin = Math.floor(exercise.restSeconds / 60);
    const currentSec = exercise.restSeconds % 60;
    const newMin = field === 'min' ? parseInt(value) || 0 : currentMin;
    const newSec = field === 'sec' ? parseInt(value) || 0 : currentSec;
    const total = newMin * 60 + newSec;
    if (total >= 30 && total <= 300) onUpdateRest(exerciseIndex, total);
  }, [exerciseIndex, exercise.restSeconds, onUpdateRest]);

  const hasIntervalSets = exercise.sets.some(s => s.type === 'interval');
  const intervalTimerActive = hasIntervalSets && (intervalPhase === 'work' || intervalPhase === 'countin');
  useEffect(() => {
    if (hasIntervalSets) onTimerActiveChange?.(exerciseIndex, intervalTimerActive);
  }, [intervalTimerActive, exerciseIndex, hasIntervalSets, onTimerActiveChange]);

  // Border and fill are separate because a card inside a superset takes the
  // fill but not the border — the shell around it draws that.
  const [stateBorder, stateBg] = hasIntervalSets && intervalPhase === 'work'
    ? ['border-success/50', 'bg-success/5']
    : hasIntervalSets && intervalPhase === 'countin'
    ? ['border-warning/50', 'bg-warning/5']
    : hasIntervalSets && intervalPhase === 'rest'
    ? ['border-error/50', 'bg-error/5']
    : allComplete ? ['border-success/30', 'bg-success-muted']
    : isSuperset ? ['border-blue-500/30', 'bg-bg-2']
    : expanded ? ['border-border-strong', 'bg-bg-2']
    : ['border-border', 'bg-bg-2'];

    return (
    <motion.div layout="position" variants={staggerItem}
      className={inSuperset
        ? `overflow-hidden w-full max-w-full transition-colors ${stateBg}`
        : `rounded-xl overflow-hidden border transition-colors w-full max-w-full ${stateBorder} ${stateBg}`}
    >
      {/* Superset badge — only when the card is standing on its own */}
      {isSuperset && !inSuperset && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-0">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            SUPERSET
          </span>
          <span className="text-[10px] text-text-tertiary font-mono truncate">with {exercise.supersetWith}</span>
          <button
            onClick={() => onUnlinkSuperset?.(exerciseIndex)}
            className="ml-auto text-[10px] text-text-muted hover:text-error font-mono"
          >
            unlink
          </button>
        </div>
      )}

      {/* Header */}
      <motion.button whileTap={inSuperset ? undefined : { scale: 0.98 }} onClick={handleToggle}
        className={`w-full flex items-center justify-between gap-3 p-3 text-left ${inSuperset ? 'cursor-default' : ''}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className={`font-display truncate ${expanded ? 'font-bold text-lg text-text-primary' : 'font-semibold text-sm text-text-primary'}`}>
              {exercise.substituted ? (
                <>
                  <span className="line-through text-text-tertiary">{exercise.substituted.original}</span>
                  <span className="text-warning mx-1">→</span>
                  {expanded ? <TypewriterName text={exercise.name} active={expanded} /> : <span>{exercise.name}</span>}
                </>
              ) : expanded ? (
                <TypewriterName text={exercise.name} active={expanded} />
              ) : exercise.name}
            </div>
            {hasDropSets && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">DROP</span>
            )}
            {hasBFRSets && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-400/10 text-purple-400 border border-purple-400/20">BFR</span>
            )}
            {exercise.sets.some(s => s.type === 'interval') && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-orange-400/10 text-orange-400 border border-orange-400/20">INTERVAL</span>
            )}
            {hasVariableSets && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">VAR</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ProgressionBar exerciseName={exercise.name} weight={exercise.sets?.[0]?.weight || '0'} />
          </div>
          {!expanded && <RecoveryNote exerciseName={exercise.name} compact />}
          <div className="text-xs text-text-tertiary font-mono mt-0.5">
            {targetLabel(exercise)}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <motion.div layout className={`px-2.5 py-1 rounded-lg font-mono text-sm font-bold ${allComplete ? 'bg-success text-white' : 'bg-bg-3 text-text-secondary'}`}>
            {allComplete ? '✓' : `${completedCount}/${totalSets}`}
          </motion.div>
          {!inSuperset && (
            <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }} className="text-text-tertiary text-lg">▶</motion.span>
          )}
        </div>
      </motion.button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="overflow-hidden"
          >
            <RecoveryNote exerciseName={exercise.name} />
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
