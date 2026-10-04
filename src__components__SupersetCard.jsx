import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import ExerciseCard from './ExerciseCard';
import { staggerItem } from '../lib/variants';
import {
  setIndexForRound, currentRound, supersetRounds, nextMemberForRound,
  supersetRestMode, normalSetCount, SHARED, EACH,
} from '../lib/supersets';

/**
 * The A/B switch. Shared by the list layout (inside SupersetCard) and the block
 * grid, which drives it by moving its own active tile.
 */
export function SupersetHeader({ exercises, indices, activeIndex, onSelect, onSetRestMode }) {
  const round = currentRound(exercises, indices);
  const rounds = supersetRounds(exercises, indices);
  const restMode = supersetRestMode(exercises, indices);
  const allDone = indices.every((i) => exercises[i].sets.every((s) => s.completed));
  const restSeconds = exercises[indices[0]]?.restSeconds || 0;
  const restLabel = `${Math.floor(restSeconds / 60)}m${restSeconds % 60 > 0 ? ` ${restSeconds % 60}s` : ''}`;

  return (
    <>
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/[0.07] border-b border-blue-500/20">
      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
        SUPERSET
      </span>
      <span className="text-[10px] font-mono text-text-tertiary truncate">
        {allDone ? 'complete' : `Round ${round + 1} of ${rounds}`}
      </span>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => onSetRestMode?.(indices, restMode === SHARED ? EACH : SHARED)}
        className="ml-auto flex items-center gap-1.5 text-[10px] font-mono text-blue-400/90 border border-blue-500/25 rounded-lg px-2 py-1"
        title="Switch between one rest after the round and each exercise resting on its own"
      >
        {restMode === SHARED ? `${restLabel} after round` : 'rest after each'}
        <span className="text-blue-400/50">⇄</span>
      </motion.button>
    </div>
    <div className="flex gap-1.5 px-3 py-2.5 bg-bg-1 border-b border-border">
      {indices.map((ei, slot) => {
        const ex = exercises[ei];
        const active = ei === activeIndex;
        const total = normalSetCount(ex);
        const activeSetIdx = setIndexForRound(ex, round);
        return (
          <motion.button
            key={ei}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(ei)}
            aria-pressed={active}
            className={`flex-1 min-w-0 flex items-center justify-center gap-2 rounded-lg border px-2 py-2 tap-target transition-colors ${
              active
                ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                : 'border-border bg-bg-2 text-text-tertiary'
            }`}
          >
            <span className="font-mono text-[11px] truncate">
              {String.fromCharCode(65 + slot)} · {ex.name}
            </span>
            <span className="flex gap-[3px] flex-shrink-0">
              {Array.from({ length: total }, (_, i) => {
                const si = setIndexForRound(ex, i);
                const done = si >= 0 && ex.sets[si]?.completed;
                const now = si >= 0 && si === activeSetIdx && !done;
                return (
                  <i key={i} className={`w-[5px] h-[5px] rounded-full ${
                    done ? 'bg-success'
                      : now ? 'bg-accent shadow-[0_0_4px_var(--color-accent)]'
                      : 'bg-bg-4'
                  }`} />
                );
              })}
            </span>
          </motion.button>
        );
      })}
    </div>
    </>
  );
}

/**
 * One card holding the whole superset. Only the active exercise's sets are on
 * screen; checking a set hands you to the partner for the same round.
 */
export default function SupersetCard({
  exercises,
  indices,
  onSetRestMode,
  onTimerActiveChange,
  ...handlers
}) {
  const [activeIndex, setActiveIndex] = useState(indices[0]);
  const flipRef = useRef(null);
  const manualUntilRef = useRef(0);

  // Exercises can be reordered or removed mid-workout; never point at a member
  // that has left the group.
  useEffect(() => {
    if (!indices.includes(activeIndex)) setActiveIndex(indices[0]);
  }, [indices, activeIndex]);

  useEffect(() => () => clearTimeout(flipRef.current), []);

  const allDone = useMemo(
    () => indices.every((i) => exercises[i].sets.every((s) => s.completed)),
    [exercises, indices],
  );

  const handleSelect = useCallback((ei) => {
    // A deliberate tap owns the card for a moment — don't yank it away mid-entry.
    manualUntilRef.current = Date.now() + 2500;
    clearTimeout(flipRef.current);
    setActiveIndex(ei);
  }, []);

  const handleSetComplete = useCallback((ei, si, restSeconds) => {
    handlers.onSetComplete?.(ei, si, restSeconds);
    if (Date.now() < manualUntilRef.current) return;

    const next = nextMemberForRound(exercises, indices, ei, si);
    if (next < 0) return;
    // Long enough to see the row go green before the card moves on.
    clearTimeout(flipRef.current);
    flipRef.current = setTimeout(() => setActiveIndex(next), 420);
  }, [exercises, indices, handlers]);

  const active = exercises[activeIndex];
  if (!active) return null;

  return (
    <motion.div
      layout="position"
      variants={staggerItem}
      className={`rounded-xl overflow-hidden border transition-colors w-full max-w-full ${
        allDone ? 'border-success/30 bg-success-muted' : 'border-blue-500/30 bg-bg-2'
      }`}
    >
      <SupersetHeader
        exercises={exercises}
        indices={indices}
        activeIndex={activeIndex}
        onSelect={handleSelect}
        onSetRestMode={onSetRestMode}
      />

      <ExerciseCard
        key={activeIndex}
        inSuperset
        exercise={active}
        exerciseIndex={activeIndex}
        allExercises={exercises}
        onTimerActiveChange={onTimerActiveChange}
        {...handlers}
        onSetComplete={handleSetComplete}
      />
    </motion.div>
  );
}
