import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import SetRow from './SetRow';
import { useHaptics } from '../hooks/useHaptics';
import { useGlobalTimer } from '../context/TimerContext';

// One set at a time, Focus-style (from the beta): big KG / REPS steppers, set
// pills on top, swipe left/right to move between sets. Drop, BFR and interval
// sets keep their own SetRow inside the card — their timers live there.

const num = (v) => parseFloat(v) || 0;
const roundW = (x) => String(Math.round(Math.max(0, x) * 100) / 100);
const lowRep = (range) => parseInt(String(range || '').split('-')[0]) || 8;

const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
const RING_C = 2 * Math.PI * 70;

// The rest countdown, laid over the set's KG / REPS / Complete area (which stays
// in place underneath, hidden) so the card never changes size. A solid ring that
// starts full and drains. While it's on screen the floating timer tucks away.
function RestDock({ timer }) {
  const ref = useRef(null);
  const { setDocked } = timer;
  useEffect(() => {
    // Margins keep the fixed header and bottom nav from counting as "on screen".
    const io = new IntersectionObserver(([e]) => setDocked(e.isIntersecting),
      { rootMargin: '-120px 0px -90px 0px', threshold: 0.6 });
    io.observe(ref.current);
    return () => { io.disconnect(); setDocked(false); };
  }, [setDocked]);
  const left = timer.total > 0 ? timer.remaining / timer.total : 0;
  return (
    // Leaves instantly: the timer has already reset to 0, and the set underneath is already
    // visible, so fading out showed 0:00 and a double image for a few frames.
    <motion.div ref={ref} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0 } }} transition={{ duration: 0.2 }}
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 py-3 rounded-2xl bg-bg-1 border border-border">
      <div className="relative w-36 h-36 shrink min-h-0">
        <svg viewBox="0 0 160 160" className="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="80" cy="80" r="70" fill="none" stroke="var(--color-bg-3)" strokeWidth="10" />
          <circle cx="80" cy="80" r="70" fill="none" stroke="var(--g-timer, var(--color-accent))" strokeWidth="10"
            strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - left)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">Rest</span>
          <span className="font-display font-extrabold text-4xl text-text-primary tabular-nums tracking-tight">{mmss(timer.remaining)}</span>
        </div>
      </div>
      <button onClick={timer.stop} className="h-11 px-8 rounded-xl bg-bg-3 text-text-primary font-display font-semibold text-sm active:scale-95 transition-transform">Skip rest</button>
    </motion.div>
  );
}

function Stepper({ label, ps, value, placeholder, inputMode, onType, onDec, onInc, chip, done }) {
  const isText = isNaN(Number(value)) && value !== '';
  return (
    <div className="bg-bg-1 border border-border rounded-2xl px-2.5 pt-2.5 pb-2.5 flex flex-col items-center gap-1.5 min-w-0">
      <div className="flex items-center gap-2 text-[10px] font-mono text-text-tertiary uppercase tracking-wider">
        <span className={ps}>{label}</span>
        {chip && (
          <button onClick={chip.onClick} className="px-2 py-0.5 rounded-full bg-bg-3 text-text-secondary text-[9px] tracking-wider active:scale-95 transition-transform">{chip.label}</button>
        )}
      </div>
      {isText ? (
        <div className="h-14 flex items-center font-display font-extrabold text-3xl text-warning">{value}</div>
      ) : (
        <input type="number" inputMode={inputMode} value={value} placeholder={placeholder} onChange={(e) => onType(e.target.value)}
          onFocus={(e) => e.target.select()}
          className={`w-full h-14 text-center bg-transparent outline-none font-display font-extrabold text-5xl tabular-nums tracking-tight placeholder:text-text-muted ${done ? 'text-success' : 'text-text-primary'}`} />
      )}
      <div className="flex gap-1.5 w-full">
        <button onClick={onDec} className="flex-1 h-11 rounded-xl bg-bg-3 text-text-primary font-mono text-xl active:scale-95 transition-transform">−</button>
        <button onClick={onInc} className="flex-1 h-11 rounded-xl bg-bg-3 text-text-primary font-mono text-xl active:scale-95 transition-transform">+</button>
      </div>
    </div>
  );
}

export default function SetSwiper({ exercise, exerciseIndex, onUpdate, onDelete, onComplete, onPhaseChange }) {
  const sets = exercise.sets;
  const firstOpen = () => { const i = sets.findIndex((s) => !s.completed); return i < 0 ? 0 : i; };
  const [idx, setIdx] = useState(firstOpen);
  const [dir, setDir] = useState(1);
  const haptics = useHaptics();
  const timer = useGlobalTimer();
  const resting = timer.isRunning && timer.owner === exerciseIndex;
  const advanceRef = useRef(null);
  useEffect(() => () => clearTimeout(advanceRef.current), []);

  const i = Math.min(idx, sets.length - 1);
  const s = sets[i];
  const go = (to) => {
    if (to < 0 || to >= sets.length || to === i) return;
    setDir(to > i ? 1 : -1);
    setIdx(to);
  };

  // Labels match SetRow: normal sets count up, drops hang off the set before them.
  let n = 0;
  const labels = sets.map((x) => (x.type === 'drop' ? 'D' : String(++n)));

  const timed = s.type === 'drop' || s.type === 'bfr' || s.type === 'interval' || s.type === 'timed';
  const isFailure = s.reps === 'failure';
  const patch = (p) => onUpdate(i, { ...s, ...p });
  const stepReps = (d) => {
    const base = isFailure || s.reps === '' ? lowRep(exercise.repRange || exercise.targetReps) : num(s.reps);
    patch({ reps: String(Math.max(0, base + d)) });
  };

  const complete = () => {
    const next = !s.completed;
    patch({ completed: next });
    if (!next) return;
    haptics.tap();
    onComplete?.(exerciseIndex, i, exercise.restSeconds);
    const after = sets.findIndex((x, j) => j > i && !x.completed);
    if (after >= 0) advanceRef.current = setTimeout(() => go(after), 350);
  };

  return (
    <div className="px-3 pt-3 pb-3">
      {/* Set pills */}
      <div className="flex gap-1.5 mb-3">
        {sets.map((x, j) => (
          <button key={j} onClick={() => go(j)} aria-label={`Set ${labels[j]}`}
            className={`flex-1 h-9 rounded-xl font-mono text-sm transition-colors border ${
              x.completed ? 'bg-success text-white border-success'
                : j === i ? 'bg-bg-1 text-text-primary border-border-strong'
                : 'bg-bg-3 text-text-secondary border-transparent'}`}>
            {x.completed ? '✓' : labels[j]}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div key={i} custom={dir}
            variants={{ enter: (d) => ({ x: d * 60, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d) => ({ x: d * -60, opacity: 0 }) }}
            initial="enter" animate="center" exit="exit" transition={{ duration: 0.18 }}
            style={resting ? { visibility: 'hidden' } : undefined}
            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.35} dragSnapToOrigin
            onDragEnd={(e, info) => {
              if (info.offset.x < -70 || info.velocity.x < -500) go(i + 1);
              else if (info.offset.x > 70 || info.velocity.x > 500) go(i - 1);
            }}>
            {timed ? (
              <div className="rounded-2xl border border-border overflow-hidden bg-bg-1">
                <SetRow index={i} normalIndex={Number(labels[i]) - 1 || 0} set={s} exerciseIndex={exerciseIndex}
                  onUpdate={onUpdate} onDelete={onDelete} onComplete={onComplete}
                  restSeconds={exercise.restSeconds} onPhaseChange={onPhaseChange} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <Stepper label="KG" ps="ps-x" value={s.weight} placeholder="0" inputMode="decimal" done={s.completed}
                    onType={(v) => patch({ weight: v })}
                    onDec={() => patch({ weight: roundW(num(s.weight) - 2.5) })}
                    onInc={() => patch({ weight: roundW(num(s.weight) + 2.5) })} />
                  <Stepper label="REPS" ps="ps-o" value={s.reps} placeholder={String(lowRep(exercise.repRange || exercise.targetReps))} inputMode="numeric" done={s.completed}
                    onType={(v) => patch({ reps: v })}
                    onDec={() => stepReps(-1)} onInc={() => stepReps(1)}
                    chip={{ label: isFailure ? 'TO REPS' : 'TO FAIL', onClick: () => patch({ reps: isFailure ? '' : 'failure' }) }} />
                </div>
                <motion.button whileTap={{ scale: 0.98 }} onClick={complete}
                  className={`mt-2.5 w-full h-14 rounded-2xl font-display font-bold text-base transition-colors ${
                    s.completed ? 'bg-success-muted text-success border border-success/30' : 'bg-accent text-white'}`}>
                  {s.completed ? `Set ${labels[i]} done · tap to undo` : `Complete set ${labels[i]}`}
                </motion.button>
              </>
            )}
          </motion.div>
        </AnimatePresence>
        <AnimatePresence>{resting && <RestDock key="rest" timer={timer} />}</AnimatePresence>
      </div>
      <div className="mt-2 text-center text-[10px] font-mono text-text-muted tracking-wider">← swipe for sets →</div>
    </div>
  );
}
