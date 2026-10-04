import { motion, AnimatePresence } from 'framer-motion';
import { useState, useCallback } from 'react';
import { setRowVariants } from '../lib/variants';
import BFRTimerBar from './BFRTimerBar';
import IntervalTimerBar from './IntervalTimerBar';
import { useHaptics } from '../hooks/useHaptics';

export default function SetRow({
  index,
  normalIndex,
  set,
  exerciseIndex,
  onUpdate,
  onDelete,
  onComplete,
  restSeconds,
  onPhaseChange,
}) {
  const [showDelete, setShowDelete] = useState(false);

  const isDropSet = set.type === 'drop';
  const isBFR = set.type === 'bfr';
  const isInterval = set.type === 'interval';
  const isVariable = set.type === 'variable';
  const dropMode = set.dropMode || 'failure';

  const handleRepsChange = useCallback((e) => {
    onUpdate?.(index, { ...set, reps: e.target.value });
  }, [index, set, onUpdate]);

  const handleWeightChange = useCallback((e) => {
    onUpdate?.(index, { ...set, weight: e.target.value });
  }, [index, set, onUpdate]);

  const handleToggleDropMode = useCallback(() => {
    const next = dropMode === 'failure' ? 'fixed' : 'failure';
    onUpdate?.(index, { ...set, dropMode: next, reps: next === 'failure' ? '' : set.reps });
  }, [index, set, dropMode, onUpdate]);

  const isFailure = set.reps === 'failure';

  const haptics = useHaptics();
  const handleCheck = useCallback(() => {
    const next = !set.completed;
    if (next) haptics.tap();
    onUpdate?.(index, { ...set, completed: next });
    if (next && !isDropSet && !isBFR && !isInterval) {
      onComplete?.(exerciseIndex, index, restSeconds);
    }
  }, [index, set, isDropSet, isBFR, isInterval, isVariable, exerciseIndex, restSeconds, onUpdate, onComplete, haptics]);

  const handleBFRComplete = useCallback(() => {
    onUpdate?.(index, { ...set, completed: true });
    onComplete?.(exerciseIndex, index, restSeconds);
  }, [index, set, exerciseIndex, restSeconds, onUpdate, onComplete]);

  const handleIntervalComplete = useCallback(() => {
    onUpdate?.(index, { ...set, completed: true });
    onComplete?.(exerciseIndex, index, restSeconds);
  }, [index, set, exerciseIndex, restSeconds, onUpdate, onComplete]);

  // ── Normal / Variable set row ────────────────────────────────────────
  if (!isDropSet && !isBFR && !isInterval) {
    const label = (normalIndex ?? index) + 1;
    return (
      <motion.div layout variants={setRowVariants} initial="initial" animate="animate" exit="exit" className="relative">
        {isVariable && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-teal-500/40 pointer-events-none" />}
        <div className={`grid grid-cols-[32px_1fr_1fr_44px] gap-2 items-center px-3 py-3 border-b border-bg-2 ${set.completed ? 'bg-success-muted' : isVariable ? 'bg-teal-500/5' : ''}`}>
          <button onClick={() => setShowDelete(p => !p)}
            className="flex flex-col items-center justify-center tap-target gap-0 overflow-hidden">
            <span className={`text-sm font-mono leading-tight ${isVariable ? 'text-teal-400' : 'text-text-tertiary'}`}>
              {showDelete ? '✕' : label}
            </span>
            {!showDelete && isVariable && set.variableRepRange && (
              <span className="text-[8px] font-mono text-teal-400/50 leading-tight truncate w-full text-center">
                {set.variableRepRange}
              </span>
            )}
          </button>
          <input type="number" inputMode="decimal" placeholder="kg" value={set.weight} onChange={handleWeightChange}
            className={`w-full text-center py-2.5 px-2 rounded-lg bg-bg-1 border font-display font-bold text-xl tabular-nums outline-none focus:ring-1 transition-colors ${
              set.completed ? 'text-success border-success/30 focus:border-success focus:ring-success/30'
                : isVariable ? 'text-teal-400 border-teal-500/20 focus:border-teal-500 focus:ring-teal-500/20'
                : 'text-text-primary border-border focus:border-accent focus:ring-accent/30'}`}
            onFocus={e => e.target.select()} />
          {isFailure ? (
            <div className="w-full text-center py-2.5 px-2 rounded-lg bg-warning-muted border border-warning/40 font-display font-bold text-xl text-warning select-none">
              failure
            </div>
          ) : (
            <input type="number" inputMode="numeric" placeholder="reps" value={set.reps} onChange={handleRepsChange}
              className={`w-full text-center py-2.5 px-2 rounded-lg bg-bg-1 border font-display font-bold text-xl tabular-nums outline-none focus:ring-1 transition-colors ${
                set.completed ? 'text-success border-success/30 focus:border-success focus:ring-success/30'
                  : isVariable ? 'text-teal-400 border-teal-500/20 focus:border-teal-500 focus:ring-teal-500/20'
                  : 'text-text-primary border-border focus:border-accent focus:ring-accent/30'}`}
              onFocus={e => e.target.select()} />
          )}
          <motion.button whileTap={{ scale: 0.85 }} onClick={handleCheck}
            className={`tap-target flex items-center justify-center rounded-lg transition-all ${
              set.completed ? 'bg-success text-white' : 'border border-border text-text-muted'}`}
            style={{ width: 36, height: 36, margin: '0 auto' }}>
            {set.completed ? '✓' : ''}
          </motion.button>
        </div>
        <AnimatePresence>
          {showDelete && (
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { onDelete?.(index); setShowDelete(false); }}
              className="absolute inset-0 flex items-center justify-center bg-error/10 border border-error/30 text-error text-sm font-mono">
              Remove set
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // ── BFR row ─────────────────────────────────────────────────────────
  if (isBFR) {
    const label = (normalIndex ?? index) + 1;
    return (
      <motion.div layout variants={setRowVariants} initial="initial" animate="animate" exit="exit" className="relative">
        <div className={`flex items-center gap-2 px-3 py-3 border-b border-bg-2 ${set.completed ? 'bg-success-muted' : ''}`}>
          <button onClick={() => setShowDelete(p => !p)}
            className="flex-shrink-0 w-8 text-center text-sm font-mono text-text-tertiary tap-target">
            {showDelete ? '✕' : label}
          </button>
          <input type="number" inputMode="decimal" placeholder="kg" value={set.weight} onChange={handleWeightChange}
            className={`w-20 flex-shrink-0 text-center py-2.5 px-2 rounded-lg bg-bg-1 border font-display font-bold text-xl tabular-nums outline-none focus:ring-1 transition-colors ${
              set.completed ? 'text-success border-success/30' : 'text-text-primary border-border focus:border-accent focus:ring-accent/30'}`}
            onFocus={e => e.target.select()} />
          <div className="flex-1 min-w-0 h-[46px]">
            <BFRTimerBar
              seconds={set.bfrSeconds || 45}
              onComplete={handleBFRComplete}
              completed={set.completed}
              startMs={set.bfrStartMs}
              onStart={() => onUpdate?.(index, { ...set, bfrStartMs: Date.now() })}
            />
          </div>
        </div>
        <AnimatePresence>
          {showDelete && (
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { onDelete?.(index); setShowDelete(false); }}
              className="absolute inset-0 flex items-center justify-center bg-error/10 border border-error/30 text-error text-sm font-mono">
              Remove set
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // ── Interval row ─────────────────────────────────────────────────────
  if (isInterval) {
    const label = (normalIndex ?? index) + 1;
    return (
      <motion.div layout variants={setRowVariants} initial="initial" animate="animate" exit="exit" className="relative">
        <div className={`flex items-center gap-2 px-3 py-3 border-b border-bg-2 ${set.completed ? 'bg-success-muted' : ''}`}>
          <button onClick={() => setShowDelete(p => !p)}
            className="flex-shrink-0 w-8 text-center text-sm font-mono text-text-tertiary tap-target">
            {showDelete ? '✕' : label}
          </button>
          <input type="number" inputMode="decimal" placeholder="kg" value={set.weight} onChange={handleWeightChange}
            className={`w-20 flex-shrink-0 text-center py-2.5 px-2 rounded-lg bg-bg-1 border font-display font-bold text-xl tabular-nums outline-none focus:ring-1 transition-colors ${
              set.completed ? 'text-success border-success/30' : 'text-text-primary border-border focus:border-accent focus:ring-accent/30'}`}
            onFocus={e => e.target.select()} />
          <div className="flex-1 min-w-0 h-[46px]">
            <IntervalTimerBar
              workSeconds={set.intervalWork || 30}
              restSeconds={set.intervalRest || 30}
              totalSeconds={set.intervalTotal || 180}
              onComplete={handleIntervalComplete}
              completed={set.completed}
              onPhaseChange={onPhaseChange}
              countInStartMs={set.intervalCountInStartMs}
              timerStartMs={set.intervalTimerStartMs}
              onTimerStart={(stamps) => onUpdate?.(index, { ...set, ...stamps })}
              onTimerStop={() => onUpdate?.(index, { ...set, intervalCountInStartMs: null, intervalTimerStartMs: null })}
            />
          </div>
        </div>
        <AnimatePresence>
          {showDelete && (
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { onDelete?.(index); setShowDelete(false); }}
              className="absolute inset-0 flex items-center justify-center bg-error/10 border border-error/30 text-error text-sm font-mono">
              Remove set
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // ── Drop set row ─────────────────────────────────────────────────────
  // Uses the SAME grid as normal rows: [32px_1fr_1fr_44px]
  // Col 1: "Drop N" label (replaces set number)
  // Col 2: kg input (same as normal)
  // Col 3: failure pill or reps input (same slot as reps)
  // Col 4: ∞/# toggle (replaces checkbox — no checkbox needed)
  const dropLabel = `Drop ${(set.dropIndex ?? 0) + 1}`;

  return (
    <motion.div layout variants={setRowVariants} initial="initial" animate="animate" exit="exit" className="relative">
      {/* Left-edge amber accent line */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-500/40 pointer-events-none" />

      <div
        className={`items-center px-3 py-3 border-b border-bg-2 ${set.completed ? 'bg-success-muted' : 'bg-amber-500/5'}`}
        style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 44px', gap: '8px' }}>

        {/* Col 1: Drop label — tap to delete */}
        <button onClick={() => setShowDelete(p => !p)}
          className="flex items-center justify-center tap-target">
          {showDelete
            ? <span className="text-error text-[10px] font-mono">✕</span>
            : <span className="text-[9px] font-mono text-amber-400 leading-tight text-center">{dropLabel.replace('Drop ', 'D')}</span>
          }
        </button>

        {/* Col 2: KG input */}
        <input type="number" inputMode="decimal" placeholder="kg" value={set.weight} onChange={handleWeightChange}
          className={`w-full text-center py-2.5 px-2 rounded-lg bg-bg-1 border font-display font-bold text-xl tabular-nums outline-none focus:ring-1 transition-colors ${
            set.completed
              ? 'text-success border-success/30'
              : 'text-amber-400 border-amber-500/20 focus:border-amber-500 focus:ring-amber-500/20'}`}
          onFocus={e => e.target.select()} />

        {/* Col 3: Failure pill or reps input */}
        {dropMode === 'fixed' ? (
          <input type="number" inputMode="numeric" placeholder="reps" value={set.reps} onChange={handleRepsChange}
            className={`w-full text-center py-2.5 px-2 rounded-lg bg-bg-1 border font-display font-bold text-xl tabular-nums outline-none focus:ring-1 transition-colors ${
              set.completed
                ? 'text-success border-success/30'
                : 'text-amber-400 border-amber-500/20 focus:border-amber-500 focus:ring-amber-500/20'}`}
            onFocus={e => e.target.select()} />
        ) : (
          <div className="w-full text-center py-2.5 px-1 rounded-lg bg-amber-500/10 border border-amber-500/20 font-mono text-sm text-amber-400/80 select-none overflow-hidden">
            failure
          </div>
        )}

        {/* Col 4: ∞/# toggle (no checkbox) */}
        <div className="flex items-center justify-center">
          <button onClick={handleToggleDropMode}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-amber-500/20 text-sm font-mono text-amber-400/60 hover:text-amber-400 hover:border-amber-500/40 transition-colors">
            {dropMode === 'failure' ? '#' : '∞'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showDelete && (
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { onDelete?.(index); setShowDelete(false); }}
            className="absolute inset-0 flex items-center justify-center bg-error/10 border border-error/30 text-error text-sm font-mono z-10">
            Remove drop
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
