import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo, useId } from 'react';
import { animate, motion, AnimatePresence, useAnimationControls, useMotionValue, useReducedMotion } from 'framer-motion';
import ExerciseCard from './ExerciseCard';
import { staggerItem } from '../lib/variants';
import { useHaptics } from '../hooks/useHaptics';
import {
  setIndexForRound, currentRound, supersetRounds, nextMemberForRound,
  supersetRestMode, normalSetCount, SHARED, EACH,
} from '../lib/supersets';

const FOLD = { type: 'spring', damping: 25, stiffness: 300 };

/**
 * The A/B switch. Shared by the list layout (inside SupersetCard) and the block
 * grid, which drives it by moving its own active tile.
 *
 * The lit pill behind the active member is one element that slides between the
 * two buttons — on a hand-off it's the only thing on screen that moves, so it's
 * what tells you the card has changed over.
 */
export function SupersetHeader({
  exercises, indices, activeIndex, onSelect, onSetRestMode, collapsed, onToggleCollapse,
}) {
  const round = currentRound(exercises, indices);
  const rounds = supersetRounds(exercises, indices);
  const restMode = supersetRestMode(exercises, indices);
  const allDone = indices.every((i) => exercises[i].sets.every((s) => s.completed));
  const restSeconds = exercises[indices[0]]?.restSeconds || 0;
  const restLabel = `${Math.floor(restSeconds / 60)}m${restSeconds % 60 > 0 ? ` ${restSeconds % 60}s` : ''}`;
  const reduce = useReducedMotion();
  // The block grid mounts its own copy of this header, so the pill needs an id
  // per instance or the two would animate into each other.
  const pillId = useId();

  const label = (
    <>
      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
        SUPERSET
      </span>
      <span className="text-[10px] font-mono text-text-tertiary truncate">
        {allDone ? 'complete' : `Round ${round + 1} of ${rounds}`}
      </span>
    </>
  );

  return (
    <>
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/[0.07] border-b border-blue-500/20">
      {onToggleCollapse ? (
        <button type="button" onClick={onToggleCollapse} aria-expanded={!collapsed}
          className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {label}
        </button>
      ) : (
        <div className="flex items-center gap-2 min-w-0 flex-1">{label}</div>
      )}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => onSetRestMode?.(indices, restMode === SHARED ? EACH : SHARED)}
        className="ml-auto flex items-center gap-1.5 text-[10px] font-mono text-blue-400/90 border border-blue-500/25 rounded-lg px-2 py-1"
        title="Switch between one rest after the round and each exercise resting on its own"
      >
        {restMode === SHARED ? `${restLabel} after round` : 'rest after each'}
        <span className="text-blue-400/50">⇄</span>
      </motion.button>
      {onToggleCollapse && (
        <button type="button" onClick={onToggleCollapse} aria-hidden tabIndex={-1}
          className="text-text-tertiary text-sm leading-none px-1 py-1">
          <motion.span animate={{ rotate: collapsed ? 0 : 90 }} transition={{ duration: 0.2 }}
            className="inline-block">▶</motion.span>
        </button>
      )}
    </div>

    <AnimatePresence initial={false}>
      {!collapsed && (
        <motion.div key="tabs" className="overflow-hidden"
          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }} transition={FOLD}
        >
          <div className="flex gap-1.5 px-3 py-2.5 bg-bg-1 border-b border-border">
            {indices.map((ei, slot) => {
              const ex = exercises[ei];
              const active = ei === activeIndex;
              const total = normalSetCount(ex);
              const activeSetIdx = setIndexForRound(ex, round);
              return (
                <button
                  key={ei}
                  type="button"
                  onClick={() => onSelect(ei)}
                  aria-pressed={active}
                  className={`relative flex-1 min-w-0 flex items-center justify-center gap-2 rounded-lg border px-2 py-2 tap-target transition-colors ${
                    active
                      ? 'border-transparent text-blue-300'
                      : 'border-border bg-bg-2 text-text-tertiary'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId={`ss-pill-${pillId}`}
                      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 440, damping: 36 }}
                      className="absolute inset-0 rounded-lg border border-blue-500/50 bg-blue-500/10"
                    />
                  )}
                  <span className="relative font-mono text-[11px] truncate">
                    {String.fromCharCode(65 + slot)} · {ex.name}
                  </span>
                  <span className="relative flex gap-[3px] flex-shrink-0">
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
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}

/**
 * One member's sets, stacked on its partner and faded in or out.
 *
 * Sequenced rather than cross-faded: the one leaving reaches zero before the one
 * arriving starts, so the two are never legible at once. Opacity rides a motion
 * value instead of the `animate` prop because the card re-renders mid-fade (the
 * height observer, the set that was just ticked) and a render pass rewrites the
 * style attribute — with opacity only in `animate`, the outgoing pane flashes
 * back to full for exactly one frame as it's wiped.
 */
function SupersetPane({ on, reduce, paneRef, children }) {
  const opacity = useMotionValue(on ? 1 : 0);

  useEffect(() => {
    const controls = animate(opacity, on ? 1 : 0,
      reduce ? { duration: 0 } : { duration: 0.11, delay: on ? 0.13 : 0, ease: 'linear' });
    return () => controls.stop();
  }, [on, reduce, opacity]);

  return (
    <motion.div
      ref={paneRef}
      className="absolute inset-x-0 top-0 flex flex-col"
      style={{ opacity, pointerEvents: on ? 'auto' : 'none', zIndex: on ? 1 : 0 }}
      inert={!on}
      aria-hidden={!on}
    >
      {children}
    </motion.div>
  );
}

/**
 * One card holding the whole superset. Only the active exercise's sets are on
 * screen; checking a set hands you to the partner for the same round.
 *
 * Both members stay mounted, stacked absolutely in a box pinned to the taller
 * of the two, so the hand-off can't change the card's footprint and can't shove
 * the cards below it around. They never cross-fade through each other either —
 * the outgoing one is gone before the incoming one starts.
 */
export default function SupersetCard({
  exercises,
  indices,
  onSetRestMode,
  onTimerActiveChange,
  ...handlers
}) {
  const [activeIndex, setActiveIndex] = useState(indices[0]);
  const [collapsed, setCollapsed] = useState(false);
  const boxRef = useRef(null);
  const lockedRef = useRef(0);
  const flipRef = useRef(null);
  const manualUntilRef = useRef(0);
  const paneRefs = useRef(new Map());
  const hasAutoCollapsed = useRef(false);
  const glow = useAnimationControls();
  const reduce = useReducedMotion();
  const haptics = useHaptics();

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

  // Pin the body to the taller member, so a hand-off can't change the card's
  // footprint. Done imperatively, in one layout pass: drop the lock, read what
  // each side wants naturally, re-lock both to the tallest. Measuring through
  // React state instead would read back the locked height and the box could
  // never shrink again when a set is deleted.
  const relock = useCallback(() => {
    const panes = [...paneRefs.current.values()].filter(Boolean);
    if (!panes.length || !boxRef.current) return;
    panes.forEach((el) => { el.style.minHeight = '0px'; });
    const tallest = Math.max(...panes.map((el) => Math.ceil(el.getBoundingClientRect().height)));
    panes.forEach((el) => { el.style.minHeight = `${tallest}px`; });
    if (tallest !== lockedRef.current) {
      lockedRef.current = tallest;
      boxRef.current.style.height = `${tallest}px`;
    }
  }, []);

  useLayoutEffect(() => {
    relock();
    const ro = new ResizeObserver(relock);
    paneRefs.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [relock, indices, collapsed]);

  // Same deal as a plain card: once every round is in, fold it away.
  useEffect(() => {
    if (allDone && !collapsed && !hasAutoCollapsed.current) {
      hasAutoCollapsed.current = true;
      const t = setTimeout(() => setCollapsed(true), 600);
      return () => clearTimeout(t);
    }
    if (!allDone) hasAutoCollapsed.current = false;
  }, [allDone, collapsed]);

  const announce = useCallback(() => {
    if (reduce) return;
    glow.start({
      opacity: [0, 1, 0],
      transition: { duration: 0.66, times: [0, 0.18, 1], ease: 'easeOut' },
    });
  }, [glow, reduce]);

  const handleSelect = useCallback((ei) => {
    // A deliberate tap owns the card for a moment — don't yank it away mid-entry.
    manualUntilRef.current = Date.now() + 2500;
    clearTimeout(flipRef.current);
    setActiveIndex((prev) => {
      if (prev !== ei) { haptics.tap(); announce(); }
      return ei;
    });
  }, [announce, haptics]);

  const handleSetComplete = useCallback((ei, si, restSeconds) => {
    handlers.onSetComplete?.(ei, si, restSeconds);
    if (Date.now() < manualUntilRef.current) return;

    const next = nextMemberForRound(exercises, indices, ei, si);
    if (next < 0) return;
    // Long enough to see the row go green before the card moves on.
    clearTimeout(flipRef.current);
    flipRef.current = setTimeout(() => { setActiveIndex(next); announce(); }, 420);
  }, [exercises, indices, handlers, announce]);

  if (!exercises[activeIndex]) return null;

  return (
    <motion.div
      layout="position"
      variants={staggerItem}
      className={`relative rounded-xl overflow-hidden border transition-colors w-full max-w-full ${
        allDone ? 'border-success/30 bg-success-muted' : 'border-blue-500/30 bg-bg-2'
      }`}
    >
      {/* The hand-off pulse. Its own layer so it can't fight the card's entrance
          variants or the completed-state border colour. */}
      <motion.span
        aria-hidden
        initial={{ opacity: 0 }}
        animate={glow}
        className="pointer-events-none absolute inset-0 z-10 rounded-xl"
        style={{ boxShadow: 'inset 0 0 0 1.5px rgba(96,165,250,0.75), inset 0 0 22px rgba(59,130,246,0.35)' }}
      />

      <SupersetHeader
        exercises={exercises}
        indices={indices}
        activeIndex={activeIndex}
        onSelect={handleSelect}
        onSetRestMode={onSetRestMode}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div key="body" className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={FOLD}
          >
            <div ref={boxRef} className="relative">
              {indices.map((ei) => (
                <SupersetPane
                  key={ei}
                  on={ei === activeIndex}
                  reduce={reduce}
                  paneRef={(el) => {
                    if (el) paneRefs.current.set(ei, el);
                    else paneRefs.current.delete(ei);
                  }}
                >
                  <ExerciseCard
                    inSuperset
                    supersetActive={ei === activeIndex}
                    exercise={exercises[ei]}
                    exerciseIndex={ei}
                    allExercises={exercises}
                    onTimerActiveChange={onTimerActiveChange}
                    {...handlers}
                    onSetComplete={handleSetComplete}
                  />
                </SupersetPane>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {collapsed && (
          <motion.div key="summary" className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={FOLD}
          >
            <div className="flex flex-col gap-1 px-3 py-2.5">
              {indices.map((ei, slot) => {
                const ex = exercises[ei];
                const done = ex.sets.filter((s) => s.completed).length;
                return (
                  <div key={ei} className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[11px] text-text-secondary truncate">
                      {String.fromCharCode(65 + slot)} · {ex.name}
                    </span>
                    <span className={`ml-auto font-mono text-[11px] flex-shrink-0 ${
                      done === ex.sets.length ? 'text-success' : 'text-text-tertiary'
                    }`}>
                      {done === ex.sets.length ? '✓' : `${done}/${ex.sets.length}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
