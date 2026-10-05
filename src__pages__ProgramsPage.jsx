import { useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkout } from '../context/WorkoutContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useHeaderMessage } from '../context/HeaderMessageContext';
import { pageVariants } from '../lib/variants';
import Button from '../components/Button';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ThinkingDots from '../components/ThinkingDots';
import NavIcon from '../components/NavIcon';
import * as api from '../lib/api';
import WizardModal from '../components/WizardModal';
import { EXERCISE_LIST_ID } from '../components/ExerciseNameOptions';
import { isMarker } from '../lib/history';
import { supersetRows } from '../lib/supersets';
import { estimateMinutes, daysAgo } from '../lib/focus';

const MONO = 'var(--font-mono)';
const parseWorkouts = (p) => (typeof p?.workouts === 'string' ? JSON.parse(p.workouts) : p?.workouts || []);
const initials = (name) => name.split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
function specials(exs = []) {
  const out = [];
  if (exs.some((e) => e.supersetWith)) out.push('superset');
  if (exs.some((e) => e.hasDrops || e.numDrops > 0)) out.push('drops');
  if (exs.some((e) => e.isBFR)) out.push('BFR');
  if (exs.some((e) => e.isInterval)) out.push('intervals');
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
   Default exercise template — mirrors the shape that WorkoutContext expects
   when starting a workout from a saved program.
   ────────────────────────────────────────────────────────────────────────── */
function newExercise() {
  return {
    name: '',
    type: 'strength',      // 'strength' | 'cardio'
    sets: 3,
    repRange: '8-12',
    restSeconds: 120,
    weight: 0,
    // Special set flags (match WorkoutContext reconstruction fields)
    hasDrops: false,
    numDrops: 1,
    isBFR: false,
    bfrSeconds: 45,
    isInterval: false,
    intervalWork: 30,
    intervalRest: 30,
    intervalTotal: 180,
    supersetWith: '',
    isVariable: false,
    variableSets: [],
    // Cardio-specific
    targetDurationSec: 0,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   CreateExerciseCard — a single exercise inside the create-workout builder.
   Visually mirrors ExerciseCard from the live workout UI.
   ────────────────────────────────────────────────────────────────────────── */
function CreateExerciseCard({ exercise, index, allExercises, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [expanded, setExpanded] = useState(true);
  const [showSpecial, setShowSpecial] = useState(false);

  const update = (field, value) => onChange(index, field, value);

  const isCardio = exercise.type === 'cardio';
  const hasAnySpecial = exercise.hasDrops || exercise.isBFR || exercise.isInterval || !!exercise.supersetWith || exercise.isVariable;

  const borderColor = isCardio
    ? 'border-orange-400/30 bg-orange-400/5'
    : hasAnySpecial
      ? 'border-accent/30 bg-accent-muted'
      : expanded
        ? 'border-border-strong bg-bg-2'
        : 'border-border bg-bg-2';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20, height: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={`rounded-xl overflow-hidden border transition-colors ${borderColor}`}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 p-3">
        {/* Reorder + index */}
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
          <motion.button whileTap={{ scale: 0.8 }} disabled={isFirst} onClick={() => onMoveUp(index)}
            className="text-[10px] text-text-muted disabled:opacity-20">▲</motion.button>
          <span className="text-[10px] font-mono text-text-tertiary w-4 text-center">{index + 1}</span>
          <motion.button whileTap={{ scale: 0.8 }} disabled={isLast} onClick={() => onMoveDown(index)}
            className="text-[10px] text-text-muted disabled:opacity-20">▼</motion.button>
        </div>

        {/* Exercise name input */}
        <input
          type="text"
          placeholder="Exercise name"
          list={EXERCISE_LIST_ID}
          value={exercise.name}
          onChange={e => update('name', e.target.value)}
          className="flex-1 min-w-0 bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm font-display font-semibold text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50"
        />

        {/* Badges */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isCardio && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-orange-400/10 text-orange-400 border border-orange-400/20">CARDIO</span>
          )}
          {exercise.hasDrops && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">DROP</span>
          )}
          {exercise.isBFR && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-400/10 text-purple-400 border border-purple-400/20">BFR</span>
          )}
          {exercise.isInterval && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-orange-400/10 text-orange-400 border border-orange-400/20">INTERVAL</span>
          )}
          {exercise.supersetWith && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">SS</span>
          )}
          {exercise.isVariable && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">VAR</span>
          )}
        </div>

        {/* Expand / collapse */}
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setExpanded(p => !p)}
          className="w-7 h-7 flex items-center justify-center text-text-tertiary">
          <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }} className="text-lg">▶</motion.span>
        </motion.button>
      </div>

      {/* ── Expanded settings ──────────────────────────────────────────── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="overflow-hidden"
          >
            {/* Type toggle */}
            <div className="flex items-center gap-2 px-3 py-2 bg-bg-1 border-t border-border">
              <span className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">Type</span>
              <div className="flex gap-1 ml-auto">
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={() => update('type', 'strength')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                    !isCardio ? 'bg-accent text-white' : 'bg-bg-3 text-text-secondary border border-border'}`}>
                  Strength
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={() => update('type', 'cardio')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                    isCardio ? 'bg-orange-400 text-white' : 'bg-bg-3 text-text-secondary border border-border'}`}>
                  Cardio
                </motion.button>
              </div>
            </div>

            {isCardio ? (
              /* ── Cardio settings ──────────────────────────────────────── */
              <div className="px-3 py-3 border-t border-border">
                <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-2">Target Duration (minutes)</div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 20"
                    value={exercise.targetDurationSec > 0 ? Math.round(exercise.targetDurationSec / 60) : ''}
                    onChange={e => {
                      const mins = parseInt(e.target.value) || 0;
                      update('targetDurationSec', mins * 60);
                    }}
                    className="w-24 text-center py-2.5 px-3 rounded-lg bg-bg-1 border border-border font-display font-bold text-lg text-text-primary outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400/30"
                    onFocus={e => e.target.select()}
                  />
                  <span className="text-xs font-mono text-text-tertiary">min</span>
                  {exercise.targetDurationSec > 0 && (
                    <span className="text-[10px] font-mono text-orange-400 ml-auto">
                      Timer: {Math.floor(exercise.targetDurationSec / 60)}m{exercise.targetDurationSec % 60 > 0 ? ` ${exercise.targetDurationSec % 60}s` : ''}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-text-muted font-mono mt-2">
                  Leave empty for no timer — you can still manually mark complete.
                </div>
              </div>
            ) : (
              /* ── Strength settings ────────────────────────────────────── */
              <>
                {/* Controls row — mirrors the live ExerciseCard */}
                <div className="flex items-center gap-3 px-3 py-3 bg-bg-1 border-t border-b border-border text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-tertiary font-mono">REPS</span>
                    <select
                      value={exercise.repRange}
                      onChange={e => update('repRange', e.target.value)}
                      className="bg-bg-3 text-text-primary border border-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-accent tap-target"
                    >
                      {['1-5', '5-8', '8-12', '12-15', '15-20', '20+'].map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-text-tertiary font-mono">REST</span>
                    <select
                      value={exercise.restSeconds}
                      onChange={e => update('restSeconds', parseInt(e.target.value))}
                      className="bg-bg-3 text-text-primary border border-border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-accent tap-target"
                    >
                      {[30, 45, 60, 90, 120, 150, 180, 210, 240, 300].map(s => (
                        <option key={s} value={s}>
                          {s >= 60 ? `${Math.floor(s / 60)}m${s % 60 > 0 ? ` ${s % 60}s` : ''}` : `${s}s`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Sets & Weight preview — header row */}
                <div className="grid grid-cols-[40px_1fr_1fr_40px] gap-2 px-3 py-2 text-[10px] font-mono text-text-tertiary uppercase tracking-wider border-b border-border">
                  <span className="text-center">SETS</span>
                  <span className="text-center">KG</span>
                  <span className="text-center">REPS</span>
                  <span className="text-center"></span>
                </div>

                {/* Simulated set rows */}
                {exercise.isVariable ? (
                  (exercise.variableSets || []).map((vs, si) => (
                    <div key={si} className="grid grid-cols-[40px_1fr_1fr_40px] gap-2 items-center px-3 py-2.5 border-b border-bg-2 bg-teal-500/5">
                      <span className="text-center text-sm font-mono text-teal-400">{si + 1}</span>
                      <div className="w-full text-center py-2 px-2 rounded-lg bg-bg-1 border border-teal-500/20 font-display font-bold text-base text-teal-400">
                        {vs.weight || '—'}
                      </div>
                      <div className="w-full text-center py-2 px-2 rounded-lg bg-bg-1 border border-teal-500/20 font-mono text-sm text-teal-400">
                        {vs.repRange || '—'}
                      </div>
                      <div className="flex items-center justify-center">
                        <div className="w-7 h-7 rounded-lg border border-teal-500/20 flex items-center justify-center text-teal-400/40 text-xs">○</div>
                      </div>
                    </div>
                  ))
                ) : (
                  Array.from({ length: exercise.sets }, (_, si) => (
                    <div key={si}>
                      <div className="grid grid-cols-[40px_1fr_1fr_40px] gap-2 items-center px-3 py-2.5 border-b border-bg-2">
                        <span className="text-center text-sm font-mono text-text-tertiary">{si + 1}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          placeholder="kg"
                          value={exercise.weight || ''}
                          onChange={e => update('weight', e.target.value)}
                          className="w-full text-center py-2 px-2 rounded-lg bg-bg-1 border border-border font-display font-bold text-base text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
                          onFocus={e => e.target.select()}
                        />
                        <div className="w-full text-center py-2 px-2 rounded-lg bg-bg-1 border border-border font-mono text-sm text-text-secondary">
                          {exercise.repRange}
                        </div>
                        <div className="flex items-center justify-center">
                          <div className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-text-muted text-xs">
                            ○
                          </div>
                        </div>
                      </div>
                      {/* Drop set rows if enabled */}
                      {exercise.hasDrops && Array.from({ length: exercise.numDrops }, (_, di) => (
                        <div key={`drop-${si}-${di}`} className="relative">
                          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-500/40 pointer-events-none" />
                          <div className="grid grid-cols-[40px_1fr_1fr_40px] gap-2 items-center px-3 py-2.5 border-b border-bg-2 bg-amber-500/5">
                            <span className="text-center text-[9px] font-mono text-amber-400">D{di + 1}</span>
                            <div className="w-full text-center py-2 px-2 rounded-lg bg-bg-1 border border-amber-500/20 font-display text-base text-amber-400/40">
                              —
                            </div>
                            <div className="w-full text-center py-2 px-1 rounded-lg bg-amber-500/10 border border-amber-500/20 font-mono text-sm text-amber-400/80">
                              failure
                            </div>
                            <div className="flex items-center justify-center">
                              <span className="text-[10px] font-mono text-amber-400/60">∞</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}

                {/* BFR preview */}
                {exercise.isBFR && (
                  <div className="px-3 py-2 bg-purple-400/5 border-b border-border">
                    <span className="text-[10px] font-mono text-purple-400">BFR: {exercise.bfrSeconds}s per set</span>
                  </div>
                )}

                {/* Interval preview */}
                {exercise.isInterval && (
                  <div className="px-3 py-2 bg-orange-400/5 border-b border-border">
                    <span className="text-[10px] font-mono text-orange-400">
                      Interval: {exercise.intervalWork}s work / {exercise.intervalRest}s rest · {exercise.intervalTotal}s total
                    </span>
                  </div>
                )}

                {/* Superset preview */}
                {exercise.supersetWith && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/5 border-b border-border">
                    <span className="text-[10px] font-mono text-blue-400">SUPERSET with {exercise.supersetWith}</span>
                    <button onClick={() => update('supersetWith', '')}
                      className="ml-auto text-[10px] text-text-muted hover:text-error font-mono">unlink</button>
                  </div>
                )}

                {/* Action buttons — mirrors ExerciseCard bottom row */}
                <div className="flex border-t border-border">
                  <motion.button whileTap={{ scale: 0.95 }}
                    onClick={() => update('sets', Math.min(exercise.sets + 1, 10))}
                    className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-accent hover:bg-accent-muted transition-colors">
                    <NavIcon id="plus" size={16} />
                    <span className="text-[10px] font-mono leading-none">Set</span>
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.95 }}
                    onClick={() => update('sets', Math.max(exercise.sets - 1, 1))}
                    disabled={exercise.sets <= 1}
                    className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-error/60 hover:bg-error/5 hover:text-error transition-colors border-l border-border disabled:opacity-30 disabled:pointer-events-none">
                    <NavIcon id="minus" size={16} />
                    <span className="text-[10px] font-mono leading-none">Set</span>
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.95 }}
                    onClick={() => setShowSpecial(p => !p)}
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors border-l border-border ${
                      hasAnySpecial ? 'text-accent bg-accent-muted' : 'text-text-secondary hover:bg-bg-3'}`}>
                    <NavIcon id="star" size={16} />
                    <span className="text-[10px] font-mono leading-none">Special</span>
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.95 }}
                    onClick={() => onRemove(index)}
                    className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-error/60 hover:bg-error/5 hover:text-error transition-colors border-l border-border">
                    <NavIcon id="remove" size={16} />
                    <span className="text-[10px] font-mono leading-none">Remove</span>
                  </motion.button>
                </div>

                {/* ── Inline Special Set Options (no separate modal) ────── */}
                <AnimatePresence>
                  {showSpecial && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-border bg-bg-1"
                    >
                      <div className="p-3 flex flex-col gap-3">
                        <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">Special Set Options</div>

                        {/* Drop Set */}
                        <div className={`p-3 rounded-xl border transition-colors ${exercise.hasDrops ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-bg-2'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="font-display font-semibold text-xs text-text-primary">Drop Set</div>
                              <div className="text-[10px] text-text-secondary">Weight drops between sets, no rest between drops.</div>
                            </div>
                            <motion.button whileTap={{ scale: 0.9 }}
                              onClick={() => {
                                if (exercise.hasDrops) {
                                  update('hasDrops', false);
                                } else {
                                  onChange(index, 'hasDrops', true);
                                  onChange(index, 'isBFR', false);
                                  onChange(index, 'isInterval', false);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all ${
                                exercise.hasDrops ? 'bg-amber-500 text-white' : 'bg-bg-3 border border-border text-text-secondary'}`}>
                              {exercise.hasDrops ? 'ON' : 'OFF'}
                            </motion.button>
                          </div>
                          {exercise.hasDrops && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] font-mono text-text-tertiary">Drops per set:</span>
                              <div className="flex gap-1">
                                {[1, 2, 3].map(n => (
                                  <motion.button key={n} whileTap={{ scale: 0.9 }}
                                    onClick={() => update('numDrops', n)}
                                    className={`w-8 h-8 rounded-lg text-xs font-mono transition-all ${
                                      exercise.numDrops === n ? 'bg-amber-500 text-white' : 'bg-bg-3 border border-border text-text-secondary'}`}>
                                    {n}
                                  </motion.button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* BFR */}
                        <div className={`p-3 rounded-xl border transition-colors ${exercise.isBFR ? 'border-purple-400/40 bg-purple-400/5' : 'border-border bg-bg-2'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="font-display font-semibold text-xs text-text-primary">BFR (Blood Flow Restriction)</div>
                              <div className="text-[10px] text-text-secondary">Timed sets with restricted blood flow.</div>
                            </div>
                            <motion.button whileTap={{ scale: 0.9 }}
                              onClick={() => {
                                if (exercise.isBFR) {
                                  update('isBFR', false);
                                } else {
                                  onChange(index, 'isBFR', true);
                                  onChange(index, 'hasDrops', false);
                                  onChange(index, 'isInterval', false);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all ${
                                exercise.isBFR ? 'bg-purple-500 text-white' : 'bg-bg-3 border border-border text-text-secondary'}`}>
                              {exercise.isBFR ? 'ON' : 'OFF'}
                            </motion.button>
                          </div>
                          {exercise.isBFR && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] font-mono text-text-tertiary">Seconds per set:</span>
                              <div className="flex gap-1">
                                {[20, 30, 45, 60].map(s => (
                                  <motion.button key={s} whileTap={{ scale: 0.9 }}
                                    onClick={() => update('bfrSeconds', s)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${
                                      exercise.bfrSeconds === s ? 'bg-purple-500 text-white' : 'bg-bg-3 border border-border text-text-secondary'}`}>
                                    {s}s
                                  </motion.button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Interval */}
                        <div className={`p-3 rounded-xl border transition-colors ${exercise.isInterval ? 'border-orange-400/40 bg-orange-400/5' : 'border-border bg-bg-2'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="font-display font-semibold text-xs text-text-primary">Interval Timer</div>
                              <div className="text-[10px] text-text-secondary">Work/rest cycles within each set.</div>
                            </div>
                            <motion.button whileTap={{ scale: 0.9 }}
                              onClick={() => {
                                if (exercise.isInterval) {
                                  update('isInterval', false);
                                } else {
                                  onChange(index, 'isInterval', true);
                                  onChange(index, 'hasDrops', false);
                                  onChange(index, 'isBFR', false);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all ${
                                exercise.isInterval ? 'text-white' : 'bg-bg-3 border border-border text-text-secondary'}`}
                              style={exercise.isInterval ? { background: 'rgb(251 146 60)' } : {}}>
                              {exercise.isInterval ? 'ON' : 'OFF'}
                            </motion.button>
                          </div>
                          {exercise.isInterval && (
                            <div className="flex flex-col gap-2 mt-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-success w-12">Work:</span>
                                <div className="flex gap-1">
                                  {[15, 20, 30, 45].map(s => (
                                    <motion.button key={s} whileTap={{ scale: 0.9 }}
                                      onClick={() => update('intervalWork', s)}
                                      className={`px-2 py-1.5 rounded-lg text-xs font-mono transition-all ${
                                        exercise.intervalWork === s ? 'bg-success/20 text-success border border-success/30' : 'bg-bg-3 border border-border text-text-secondary'}`}>
                                      {s}s
                                    </motion.button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-error w-12">Rest:</span>
                                <div className="flex gap-1">
                                  {[10, 20, 30, 45].map(s => (
                                    <motion.button key={s} whileTap={{ scale: 0.9 }}
                                      onClick={() => update('intervalRest', s)}
                                      className={`px-2 py-1.5 rounded-lg text-xs font-mono transition-all ${
                                        exercise.intervalRest === s ? 'bg-error/20 text-error border border-error/30' : 'bg-bg-3 border border-border text-text-secondary'}`}>
                                      {s}s
                                    </motion.button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-text-secondary w-12">Total:</span>
                                <div className="flex gap-1">
                                  {[60, 120, 180, 300].map(s => (
                                    <motion.button key={s} whileTap={{ scale: 0.9 }}
                                      onClick={() => update('intervalTotal', s)}
                                      className={`px-2 py-1.5 rounded-lg text-xs font-mono transition-all ${
                                        exercise.intervalTotal === s ? 'bg-accent-muted text-accent border border-accent/30' : 'bg-bg-3 border border-border text-text-secondary'}`}>
                                      {s >= 60 ? `${s / 60}m` : `${s}s`}
                                    </motion.button>
                                  ))}
                                </div>
                              </div>
                              {/* Preview */}
                              {(() => {
                                const w = exercise.intervalWork;
                                const r = exercise.intervalRest;
                                const t = exercise.intervalTotal;
                                const cycles = Math.floor(t / (w + r));
                                return (
                                  <div className="text-[10px] text-text-tertiary font-mono bg-bg-3 rounded-lg px-3 py-1.5">
                                    ≈ {cycles} cycle{cycles !== 1 ? 's' : ''} · {w}s work / {r}s rest · {t}s total
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>

                        {/* Variable — Pat Sgro */}
                        <div className={`p-3 rounded-xl border transition-colors ${exercise.isVariable ? 'border-teal-400/40 bg-teal-400/5' : 'border-border bg-bg-2'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="font-display font-semibold text-xs text-text-primary">
                                Variable <span className="text-[10px] font-mono text-text-tertiary">— Pat Sgro</span>
                              </div>
                              <div className="text-[10px] text-text-secondary">Individual weight &amp; rep range per set.</div>
                            </div>
                            <motion.button whileTap={{ scale: 0.9 }}
                              onClick={() => {
                                if (exercise.isVariable) {
                                  onChange(index, 'isVariable', false);
                                } else {
                                  const varSets = Array.from({ length: exercise.sets }, () => ({ weight: '', repRange: '8-12' }));
                                  onChange(index, 'isVariable', true);
                                  onChange(index, 'variableSets', varSets);
                                  onChange(index, 'hasDrops', false);
                                  onChange(index, 'isBFR', false);
                                  onChange(index, 'isInterval', false);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all flex-shrink-0 ${
                                exercise.isVariable ? 'bg-teal-500 text-white' : 'bg-bg-3 border border-border text-text-secondary'}`}>
                              {exercise.isVariable ? 'ON' : 'OFF'}
                            </motion.button>
                          </div>
                          {exercise.isVariable && (
                            <div className="flex flex-col gap-1.5 mt-2">
                              <div className="grid grid-cols-[20px_1fr_1fr_20px] gap-1.5 text-[9px] font-mono text-text-tertiary uppercase tracking-wider">
                                <span></span><span className="text-center">KG</span><span className="text-center">REPS</span><span></span>
                              </div>
                              {(exercise.variableSets || []).map((vs, si) => (
                                <div key={si} className="grid grid-cols-[20px_1fr_1fr_20px] gap-1.5 items-center">
                                  <span className="text-center text-[10px] font-mono text-teal-400">{si + 1}</span>
                                  <input type="number" inputMode="decimal" placeholder="kg" value={vs.weight || ''}
                                    onChange={e => {
                                      const updated = [...(exercise.variableSets || [])];
                                      updated[si] = { ...updated[si], weight: e.target.value };
                                      update('variableSets', updated);
                                    }}
                                    className="w-full text-center py-1.5 px-1 rounded-lg bg-bg-0 border border-teal-500/20 font-display text-sm text-teal-400 outline-none focus:border-teal-400/50"
                                    onFocus={e => e.target.select()} />
                                  <input type="text" placeholder="8-12" value={vs.repRange || ''}
                                    onChange={e => {
                                      const updated = [...(exercise.variableSets || [])];
                                      updated[si] = { ...updated[si], repRange: e.target.value };
                                      update('variableSets', updated);
                                    }}
                                    className="w-full text-center py-1.5 px-1 rounded-lg bg-bg-0 border border-teal-500/20 font-mono text-sm text-teal-400 outline-none focus:border-teal-400/50" />
                                  <button onClick={() => {
                                    const updated = (exercise.variableSets || []).filter((_, i) => i !== si);
                                    onChange(index, 'variableSets', updated);
                                    onChange(index, 'sets', Math.max(updated.length, 1));
                                  }} className="text-error/50 hover:text-error text-sm font-mono flex items-center justify-center">×</button>
                                </div>
                              ))}
                              <motion.button whileTap={{ scale: 0.97 }}
                                onClick={() => {
                                  const updated = [...(exercise.variableSets || []), { weight: '', repRange: '8-12' }];
                                  onChange(index, 'variableSets', updated);
                                  onChange(index, 'sets', updated.length);
                                }}
                                className="w-full py-1.5 border border-dashed border-teal-500/30 rounded-lg text-[10px] font-mono text-teal-400/70 hover:text-teal-400 hover:border-teal-500/50 transition-colors mt-1">
                                + Add set
                              </motion.button>
                            </div>
                          )}
                        </div>

                        {/* Superset */}
                        <div className={`p-3 rounded-xl border transition-colors ${exercise.supersetWith ? 'border-blue-500/40 bg-blue-500/5' : 'border-border bg-bg-2'}`}>
                          <div className="font-display font-semibold text-xs text-text-primary mb-1">Superset</div>
                          <div className="text-[10px] text-text-secondary mb-2">Pair with another exercise, no rest between.</div>
                          {exercise.supersetWith ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-blue-400">Paired with: {exercise.supersetWith}</span>
                              <button onClick={() => update('supersetWith', '')}
                                className="ml-auto text-[10px] text-error/70 font-mono">unlink</button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                              {allExercises
                                .filter((_, ei) => ei !== index)
                                .filter(ex => ex.name.trim())
                                .map((ex, i) => (
                                  <motion.button key={i} whileTap={{ scale: 0.97 }}
                                    onClick={() => update('supersetWith', ex.name)}
                                    className="w-full px-2.5 py-2 rounded-lg border border-border text-left text-xs font-display text-text-primary bg-bg-2 hover:border-blue-500/30 transition-colors">
                                    {ex.name}
                                  </motion.button>
                                ))}
                              {allExercises.filter((_, ei) => ei !== index).filter(ex => ex.name.trim()).length === 0 && (
                                <div className="text-[10px] text-text-muted font-mono">Add more named exercises to create supersets</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ProgramsPage — main component
   ══════════════════════════════════════════════════════════════════════════ */
export default function ProgramsPage({ onNavigate }) {
  const { programs, startWorkout, reloadPrograms, activeWorkout, workoutHistory } = useWorkout();
  const { user } = useAuth();
  const { showToast, showCenterModal } = useToast();
  const { showHeaderMessage } = useHeaderMessage();
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteWorkoutConfirm, setDeleteWorkoutConfirm] = useState(null); // { index, name }
  const [renamingWorkout, setRenamingWorkout] = useState(null);
  const [expandedWorkouts, setExpandedWorkouts] = useState(new Set());

  // AI Remix state
  const [remixTarget, setRemixTarget] = useState(null); // { workout, index }
  const [remixInstruction, setRemixInstruction] = useState('');
  const [remixMode, setRemixMode] = useState('trim'); // 'trim' | 'swap' | 'edit'
  const [remixLoading, setRemixLoading] = useState(false);
  const [remixResult, setRemixResult] = useState(null); // { exercises, changeDescription }
  const [remixName, setRemixName] = useState('');

  const [manualName, setManualName] = useState('');
  const [manualExercises, setManualExercises] = useState([newExercise()]);

  // Workout hamburger action sheet
  const [workoutMenu, setWorkoutMenu] = useState(null); // { index, workout }
  // Share code display modal
  const [shareModal, setShareModal] = useState(null); // { code, workoutName, expiresAt }
  const [shareLoading, setShareLoading] = useState(false);
  // Import code
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState('');
  const [importTargetProgramId, setImportTargetProgramId] = useState('');
  const [importMode, setImportMode] = useState('new');

  const handleDeleteWorkout = useCallback(async () => {
    if (!deleteWorkoutConfirm || !selectedProgram) return;
    try {
      const workouts = typeof selectedProgram.workouts === 'string'
        ? JSON.parse(selectedProgram.workouts) : [...(selectedProgram.workouts || [])];
      workouts.splice(deleteWorkoutConfirm.index, 1);
      await api.updateProgram(selectedProgram.id, selectedProgram.name, workouts);
      await reloadPrograms();
      setSelectedProgram(prev => prev ? { ...prev, workouts } : prev);
      showToast('Workout deleted', 'success');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
    setDeleteWorkoutConfirm(null);
  }, [deleteWorkoutConfirm, selectedProgram, reloadPrograms, showToast]);

  const handleRenameWorkout = useCallback(async (workoutIndex, newName) => {
    if (!newName.trim() || !selectedProgram) return;
    try {
      const workouts = typeof selectedProgram.workouts === 'string'
        ? JSON.parse(selectedProgram.workouts) : [...(selectedProgram.workouts || [])];
      workouts[workoutIndex] = { ...workouts[workoutIndex], name: newName.trim() };
      await api.updateProgram(selectedProgram.id, selectedProgram.name, workouts);
      await reloadPrograms();
      setSelectedProgram(prev => prev ? { ...prev, workouts } : prev);
      setRenamingWorkout(null);
      showToast('Renamed!', 'success');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  }, [selectedProgram, reloadPrograms, showToast]);

  const handleToggleFavorite = useCallback(async (workoutIndex) => {
    if (!selectedProgram) return;
    try {
      const workouts = typeof selectedProgram.workouts === 'string'
        ? JSON.parse(selectedProgram.workouts) : [...(selectedProgram.workouts || [])];
      workouts[workoutIndex] = { ...workouts[workoutIndex], favorite: !workouts[workoutIndex].favorite };
      await api.updateProgram(selectedProgram.id, selectedProgram.name, workouts);
      await reloadPrograms();
      setSelectedProgram(prev => prev ? { ...prev, workouts } : prev);
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  }, [selectedProgram, reloadPrograms, showToast]);

  const handleShareWorkout = useCallback(async (workout) => {
    setShareLoading(true);
    setWorkoutMenu(null);
    try {
      const result = await api.shareWorkout(workout, workout.name);
      setShareModal({ code: result.code, workoutName: workout.name, expiresAt: result.expiresAt });
    } catch (e) {
      showCenterModal('Share Failed', e.message, 'error');
    }
    setShareLoading(false);
  }, [showCenterModal]);

  const handlePreviewImport = useCallback(async () => {
    if (!importCode.trim()) return;
    setImportLoading(true);
    setImportError('');
    setImportPreview(null);
    try {
      const result = await api.previewShare(importCode.trim().toUpperCase());
      setImportPreview(result);
      if (!selectedProgram && programs.length > 0) setImportTargetProgramId(String(programs[0].id));
    } catch {
      setImportError('Code not found or expired. Double-check and try again.');
    }
    setImportLoading(false);
  }, [importCode, selectedProgram, programs]);

  const handleImportWorkout = useCallback(async () => {
    const creatingNew = !selectedProgram && importMode === 'new';
    const targetProgram = selectedProgram ||
      programs.find(p => String(p.id) === String(importTargetProgramId));
    if (!importPreview || (!creatingNew && !targetProgram)) return;
    setImportLoading(true);
    try {
      const result = await api.importShare(importCode.trim().toUpperCase());
      if (result.success) {
        const imported = { ...result.workout, name: result.workoutName };
        if (creatingNew) {
          await api.createProgram(result.workoutName, [imported]);
        } else {
          const workouts = typeof targetProgram.workouts === 'string'
            ? JSON.parse(targetProgram.workouts) : [...(targetProgram.workouts || [])];
          await api.updateProgram(targetProgram.id, targetProgram.name, [...workouts, imported]);
          if (selectedProgram?.id === targetProgram.id) {
            setSelectedProgram(prev => prev ? { ...prev, workouts: [...workouts, imported] } : prev);
          }
        }
        await reloadPrograms();
        showToast('Workout imported!', 'success');
        setShowImportModal(false);
        setImportCode('');
        setImportPreview(null);
        setImportError('');
        setImportTargetProgramId('');
        setImportMode('new');
      }
    } catch (e) {
      setImportError('Import failed: ' + e.message);
    }
    setImportLoading(false);
  }, [importMode, importPreview, importCode, importTargetProgramId, selectedProgram, programs, reloadPrograms, showToast]);

  const resetRemix = useCallback(() => {
    setRemixTarget(null);
    setRemixInstruction('');
    setRemixResult(null);
    setRemixName('');
  }, []);

  const handleRemix = useCallback(async () => {
    if (!remixInstruction.trim() || !remixTarget) return;
    setRemixLoading(true);
    setRemixResult(null);
    try {
      const result = await api.remixWorkout(remixTarget.workout, remixInstruction.trim(), remixMode);
      if (result.success && Array.isArray(result.exercises)) {
        setRemixResult({ exercises: result.exercises, changeDescription: result.changeDescription || '' });
        // Pre-fill name based on the original workout
        const baseName = (remixTarget.workout.variationOf || remixTarget.workout.name)
          .replace(/\s*\(Variation\s*\d+\)\s*$/i, '').trim();
        // The instruction itself made unreadable names; use the AI's short label.
        const label = result.shortLabel || remixInstruction.trim().slice(0, 30);
        setRemixName(baseName + ' — ' + label);
      } else if (result.success && !Array.isArray(result.exercises)) {
        showCenterModal('Remix Failed', 'AI returned an unexpected format. Please try again.', 'error');
      } else {
        showCenterModal('Remix Failed', result.error || 'Unknown error. Please try again.', 'error');
      }
    } catch (e) {
      showCenterModal('Error', e.message, 'error');
    }
    setRemixLoading(false);
  }, [remixInstruction, remixTarget, remixMode, showCenterModal]);

  const handleSaveRemix = useCallback(async (saveAsNew) => {
    if (!remixResult || !remixTarget || !selectedProgram || !remixName.trim()) return;
    try {
      const workouts = typeof selectedProgram.workouts === 'string'
        ? JSON.parse(selectedProgram.workouts) : [...(selectedProgram.workouts || [])];
      const baseName = (remixTarget.workout.variationOf || remixTarget.workout.name)
        .replace(/\s*\(Variation\s*\d+\)\s*$/i, '').trim();
      const newWorkout = saveAsNew
        ? { name: remixName.trim(), exercises: remixResult.exercises }
        : { name: remixName.trim(), variationOf: baseName, variationChanges: remixResult.changeDescription, exercises: remixResult.exercises };
      await api.updateProgram(selectedProgram.id, selectedProgram.name, [...workouts, newWorkout]);
      await reloadPrograms();
      setSelectedProgram(prev => prev ? { ...prev, workouts: [...workouts, newWorkout] } : prev);
      showToast(saveAsNew ? 'New workout saved!' : 'Variation saved!', 'success');
      resetRemix();
    } catch (e) {
      showCenterModal('Save Failed', e.message, 'error');
    }
  }, [remixResult, remixTarget, remixName, selectedProgram, reloadPrograms, showToast, showCenterModal, resetRemix]);

  const handleStartWorkout = useCallback(async (workoutIndex, program = selectedProgram) => {
    if (activeWorkout) {
      showToast('Finish or cancel current workout first', 'warning');
      return;
    }
    try {
      await startWorkout(program, workoutIndex);
      setSelectedProgram(null);
      showHeaderMessage('Workout started');
      onNavigate('workout');
    } catch (e) {
      showToast('Error starting workout: ' + e.message, 'error');
    }
  }, [selectedProgram, activeWorkout, startWorkout, showToast, onNavigate, showHeaderMessage]);

  // "Up next": the workout after the one you did last, in that program's order.
  const sessions = useMemo(() => (workoutHistory || []).filter((w) => !isMarker(w)), [workoutHistory]);
  const upNext = useMemo(() => {
    const last = sessions[0];
    const program = programs.find((p) => p.name === last?.program_name) || programs[0];
    if (!program) return { line: 'Create a program to get started.' };
    const ws = parseWorkouts(program);
    const from = ws.findIndex((w) => w.name === last?.workout_name);
    let index = from < 0 ? 0 : (from + 1) % ws.length;
    for (let k = 0; k < ws.length && ws[index]?.variationOf; k++) index = (index + 1) % ws.length;
    const workout = ws[index];
    const line = last && workout
      ? `${last.workout_name} was ${daysAgo(last.date)}. ${workout.name} is up next.`
      : workout ? `${workout.name} is first up.` : 'Add a workout to this program to start.';
    return { program, workout, index, line };
  }, [sessions, programs]);
  const [openProgram, setOpenProgram] = useState(() => upNext.program?.id ?? null);
  const today = new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  const workoutMeta = (w, long, program = upNext.program) => {
    const exs = w.exercises || [];
    const blocks = supersetRows(exs).length;
    const parts = [`${blocks} block${blocks !== 1 ? 's' : ''}`, `~${estimateMinutes(exs)} min`];
    if (long) {
      const sp = specials(exs);
      if (sp.length) parts.push(sp.join(', '));
    } else {
      const done = sessions.find((h) => h.workout_name === w.name && h.program_name === program?.name);
      parts.push(done ? daysAgo(done.date) : 'not done yet');
    }
    return parts.join(' · ');
  };

  const handleDeleteProgram = useCallback(async () => {
    if (!deleteConfirm) return;
    try {
      await api.deleteProgram(deleteConfirm.id);
      await reloadPrograms();
      showToast('Program deleted', 'success');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, reloadPrograms, showToast]);

  /* ── Manual create handlers ──────────────────────────────────────────── */
  const addManualExercise = useCallback(() => {
    setManualExercises(prev => [...prev, newExercise()]);
  }, []);

  const updateManualExercise = useCallback((i, field, value) => {
    setManualExercises(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }, []);

  const removeManualExercise = useCallback((i) => {
    setManualExercises(prev => prev.length <= 1 ? prev : prev.filter((_, j) => j !== i));
  }, []);

  const moveExercise = useCallback((from, to) => {
    setManualExercises(prev => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const handleSaveManual = useCallback(async () => {
    if (!manualName.trim()) return showToast('Enter a workout name', 'error');
    const exercises = manualExercises.filter(e => e.name.trim());
    if (exercises.length === 0) return showToast('Add at least one exercise', 'error');

    const workouts = [{
      name: manualName,
      exercises: exercises.map(ex => {
        // Build the exercise object that the backend & WorkoutContext understand
        const base = {
          name: ex.name,
          sets: parseInt(ex.sets) || 3,
          repRange: ex.repRange || '8-12',
          restSeconds: parseInt(ex.restSeconds) || 120,
          weight: parseFloat(ex.weight) || 0,
        };

        if (ex.type === 'cardio') {
          base.type = 'cardio';
          base.targetDurationSec = ex.targetDurationSec != null ? ex.targetDurationSec : 0;
          // Cardio exercises get 1 set that is a cardio timer
          base.sets = 1;
          return base;
        }

        // Special set flags
        if (ex.hasDrops) {
          base.hasDrops = true;
          base.numDrops = ex.numDrops || 1;
        }
        if (ex.isBFR) {
          base.isBFR = true;
          base.bfrSeconds = ex.bfrSeconds || 45;
        }
        if (ex.isInterval) {
          base.isInterval = true;
          base.intervalWork = ex.intervalWork || 30;
          base.intervalRest = ex.intervalRest || 30;
          base.intervalTotal = ex.intervalTotal || 180;
        }
        if (ex.supersetWith && ex.supersetWith.trim()) {
          base.supersetWith = ex.supersetWith.trim();
        }

        return base;
      }),
    }];

    try {
      await api.createProgram(manualName, workouts);
      await reloadPrograms();
      showToast('Program created!', 'success');
      setShowCreate(false);
      setManualName('');
      setManualExercises([newExercise()]);
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  }, [manualName, manualExercises, reloadPrograms, showToast]);

  const handleCloseCreate = useCallback(() => {
    setShowCreate(false);
    // Don't reset form so they can re-open it and keep editing
  }, []);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="pb-4"
    >
      <div className="g-root px-5 pt-2.5 pb-7 fx-rise">
        <div className="flex justify-between items-center">
          <span className="text-accent" style={{ font: `500 11px ${MONO}`, letterSpacing: '.16em' }}>GAINS_CMD</span>
          <span className="text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{today}</span>
        </div>
        <h1 className="mt-[22px] mb-1" style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1 }}>
          {user?.username ? `Hello, ${user.username}` : 'Hello'}
        </h1>
        <p className="text-sm text-text-secondary">{upNext.line}</p>

        {upNext.workout && (
          <div className="mt-[22px] p-5 rounded-[26px] bg-bg-1 flex flex-col gap-4">
            <div>
              <div className="g-label truncate">UP NEXT · {upNext.program.name.toUpperCase()}</div>
              <div className="mt-2" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1 }}>{upNext.workout.name}</div>
              <div className="mt-1.5 g-meta">{workoutMeta(upNext.workout, true)}</div>
            </div>
            <button onClick={() => handleStartWorkout(upNext.index, upNext.program)}
              className="h-14 rounded-[18px] bg-accent font-extrabold text-base flex items-center justify-between px-5 active:scale-[.98] transition-transform"
              style={{ color: 'var(--color-on-accent)' }}>
              {activeWorkout ? 'Workout in progress' : 'Start workout'} <span style={{ fontFamily: MONO }}>→</span>
            </button>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          {[['+ Create', () => setShowCreate(true)], ['AI Wizard', () => setShowWizard(true)], ['Import', () => setShowImportModal(true)]].map(([label, fn]) => (
            <button key={label} onClick={fn} className="flex-1 h-[46px] rounded-2xl bg-bg-1 text-text-primary font-semibold text-[13px] active:scale-[.97] transition-transform">{label}</button>
          ))}
        </div>

        <div className="mt-7 mb-2.5 g-label">PROGRAMS</div>
        {programs.length === 0 && (
          <div className="text-center py-8 text-text-tertiary" style={{ font: `400 12px ${MONO}` }}>No programs yet. Create one to get started.</div>
        )}
        <div className="flex flex-col gap-2">
          {programs.map((program) => {
            const workouts = parseWorkouts(program);
            const open = openProgram === program.id;
            return (
              <div key={program.id} className="bg-bg-1 rounded-[22px] overflow-hidden">
                <button onClick={() => setOpenProgram(open ? null : program.id)}
                  className="w-full flex items-center justify-between gap-3 px-[18px] py-4 text-left">
                  <div className="min-w-0">
                    <div className="text-[17px] font-bold truncate" style={{ letterSpacing: '-0.02em' }}>{program.name}</div>
                    <div className="mt-[3px] text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{workouts.length} workout{workouts.length !== 1 ? 's' : ''}</div>
                  </div>
                  <span className="text-text-tertiary text-[22px]" style={{ transition: 'transform .25s cubic-bezier(.2,1.4,.4,1)', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
                </button>
                {open && (
                  <div className="flex flex-col px-2 pb-2">
                    {workouts.map((w, i) => (
                      <button key={i} onClick={() => handleStartWorkout(i, program)}
                        className="flex items-center gap-3 p-2.5 rounded-2xl text-left active:bg-bg-2"
                        style={{ animation: `fx-in .3s ${i * 0.05}s both` }}>
                        <div className="w-[38px] h-[38px] flex-none rounded-[13px] bg-bg-2 flex items-center justify-center text-text-secondary" style={{ font: `500 11px ${MONO}` }}>
                          {w.favorite ? '★' : initials(w.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[15px] font-bold truncate">{w.name}</div>
                          <div className="mt-0.5 text-text-tertiary truncate" style={{ font: `400 11px ${MONO}` }}>{workoutMeta(w, false, program)}</div>
                        </div>
                        <span className="text-accent" style={{ font: `500 11px ${MONO}` }}>Start</span>
                      </button>
                    ))}
                    <div className="flex gap-2 px-2 pt-2">
                      <button onClick={() => setSelectedProgram(program)} className="flex-1 h-10 rounded-[12px] bg-bg-2 text-text-secondary" style={{ font: `500 11px ${MONO}` }}>Manage workouts</button>
                      <button onClick={() => setDeleteConfirm(program)} className="h-10 px-4 rounded-[12px] bg-bg-2 text-error/70" style={{ font: `500 11px ${MONO}` }}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Select Workout Modal ──────────────────────────────────────── */}
      <Modal
        open={!!selectedProgram}
        onClose={() => { setSelectedProgram(null); setRenamingWorkout(null); setExpandedWorkouts(new Set()); }}
        title={selectedProgram?.name || 'Select Workout'}
        maxWidth="max-w-2xl"
      >
        <div className="p-3 flex flex-col gap-2">
          {selectedProgram && (() => {
            const rawWorkouts = typeof selectedProgram.workouts === 'string'
              ? JSON.parse(selectedProgram.workouts)
              : selectedProgram.workouts || [];

            const workoutsWithIdx = rawWorkouts.map((w, i) => ({ ...w, _idx: i }));

            const sorted = [...workoutsWithIdx].sort((a, b) => {
              if (a.favorite && !b.favorite) return -1;
              if (!a.favorite && b.favorite) return 1;
              if (!a.variationOf && b.variationOf) return -1;
              if (a.variationOf && !b.variationOf) return 1;
              return 0;
            });

            function specialLabel(ex) {
              if (ex.hasDrops || ex.numDrops > 0) return ' · DROP';
              if (ex.isBFR) return ' · BFR';
              if (ex.isInterval) return ' · INTERVAL';
              if (ex.supersetWith) return ` · SS w/ ${ex.supersetWith}`;
              return '';
            }

            return sorted.map((w) => {
              const i = w._idx;
              const isVariation = !!w.variationOf;
              const isExpanded = expandedWorkouts.has(i);
              const isFav = !!w.favorite;

              const base = isVariation
                ? rawWorkouts.find(bw => bw.name === w.variationOf && !bw.variationOf)
                : null;

              let diffLines = [];
              if (isVariation && base && w.exercises && base.exercises) {
                const baseExNames = base.exercises.map(e => e.name);
                const varExNames = w.exercises.map(e => e.name);
                varExNames.filter(n => !baseExNames.includes(n)).forEach(n => {
                  const ex = w.exercises.find(e => e.name === n);
                  diffLines.push({ type: 'added', text: `+ ${n}${specialLabel(ex)}` });
                });
                baseExNames.filter(n => !varExNames.includes(n)).forEach(n => {
                  diffLines.push({ type: 'removed', text: `− ${n}` });
                });
                w.exercises.forEach(ex => {
                  const orig = base.exercises.find(e => e.name === ex.name);
                  if (!orig) return;
                  const changes = [];
                  if ((ex.sets || 0) !== (orig.sets || 0)) changes.push(`${orig.sets}→${ex.sets} sets`);
                  // Older workouts store the range as `reps`, newer ones as `repRange`.
                  const reps = (e) => e.repRange || e.reps || '';
                  if (reps(ex) !== reps(orig)) changes.push(`${reps(orig) || '?'}→${reps(ex)} reps`);
                  if (ex.hasDrops && !orig.hasDrops) changes.push('drop sets');
                  if (ex.isBFR && !orig.isBFR) changes.push('BFR');
                  if (ex.isInterval && !orig.isInterval) changes.push('intervals');
                  if (ex.supersetWith && !orig.supersetWith) changes.push(`superset w/ ${ex.supersetWith}`);
                  if (changes.length > 0) diffLines.push({ type: 'changed', text: `~ ${ex.name}: ${changes.join(', ')}` });
                });
                if (diffLines.length === 0) diffLines.push({ type: 'same', text: 'Same exercises, different order' });
              }

              return (
                <div key={i} className="relative">
                  {renamingWorkout?.index === i ? (
                    <div className="p-3 bg-bg-2 border-2 border-accent/40 rounded-xl flex items-center gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={renamingWorkout.value}
                        onChange={e => setRenamingWorkout(r => ({ ...r, value: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameWorkout(i, renamingWorkout.value);
                          if (e.key === 'Escape') setRenamingWorkout(null);
                        }}
                        className="flex-1 bg-bg-0 border border-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/50 font-display font-medium"
                      />
                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => handleRenameWorkout(i, renamingWorkout.value)}
                        className="px-3 py-2 bg-accent text-white text-xs font-mono rounded-lg">Save</motion.button>
                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => setRenamingWorkout(null)}
                        className="px-2 py-2 text-text-muted text-xs font-mono">✕</motion.button>
                    </div>
                  ) : (
                    <div className={`bg-bg-2 border rounded-xl overflow-hidden transition-colors ${isFav ? 'border-accent/40' : 'border-border'}`}>
                      {/* Card header row */}
                      <div className="flex items-center gap-3 px-4 py-4">
                        <motion.button whileTap={{ scale: 0.8 }}
                          onClick={() => handleToggleFavorite(i)}
                          className={`flex-shrink-0 text-xl leading-none ${isFav ? 'text-accent' : 'text-text-muted hover:text-text-tertiary'}`}>
                          {isFav ? '★' : '☆'}
                        </motion.button>

                        <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleStartWorkout(i)}
                          className="flex-1 min-w-0 text-left">
                          <div className={`font-display font-medium text-base truncate ${isFav ? 'text-accent' : 'text-text-primary'}`}>
                            {w.name}
                          </div>
                          {!isExpanded && (
                            <div className="text-xs text-text-muted font-mono">
                              {isVariation ? 'Variation' : `${w.exercises?.length || 0} exercises`}
                              {isFav ? ' · ★ Favourite' : ''}
                            </div>
                          )}
                        </motion.button>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <motion.button whileTap={{ scale: 0.85 }}
                            onClick={() => setExpandedWorkouts(prev => {
                              const next = new Set(prev);
                              next.has(i) ? next.delete(i) : next.add(i);
                              return next;
                            })}
                            className="w-9 h-9 flex items-center justify-center text-sm font-mono text-text-muted border border-border rounded-lg hover:border-border-strong transition-colors">
                            <motion.span animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>▾</motion.span>
                          </motion.button>
                          <motion.button whileTap={{ scale: 0.85 }}
                            onClick={() => setWorkoutMenu({ index: i, workout: w })}
                            className="w-9 h-9 flex items-center justify-center text-lg font-mono text-text-muted border border-border rounded-lg hover:border-border-strong transition-colors">
                            ⋮
                          </motion.button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-border"
                          >
                            <div className="px-3 pb-3 pt-2">
                              {isVariation ? (
                                <div className="flex flex-col gap-0.5">
                                  {diffLines.map((line, li) => (
                                    <span key={li} className={`text-[10px] font-mono ${
                                      line.type === 'added' ? 'text-success' :
                                      line.type === 'removed' ? 'text-error/70' :
                                      line.type === 'changed' ? 'text-warning' :
                                      'text-text-muted'
                                    }`}>{line.text}</span>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {(w.exercises || []).map((ex, ei) => (
                                    <span key={ei} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-3 text-text-tertiary border border-border">
                                      {ex.name}{specialLabel(ex)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </Modal>

      {/* ── AI Remix Modal ───────────────────────────────────────────── */}
      <Modal
        open={!!remixTarget}
        onClose={resetRemix}
        title={remixTarget ? `Remix: ${remixTarget.workout.name}` : 'AI Remix'}
      >
        <div className="p-4 flex flex-col gap-4">
          <AnimatePresence>
            {remixLoading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-accent/10 border border-accent/20">
                  <ThinkingDots className="text-accent" />
                  <span className="text-xs font-mono text-accent">AI is redesigning your workout…</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {!remixResult ? (
            <>
              <p className="text-xs text-text-secondary">Tell the AI what you want to focus on and how it should make room for it.</p>

              <input
                type="text"
                placeholder="e.g. I want to focus more on biceps"
                value={remixInstruction}
                onChange={e => setRemixInstruction(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !remixLoading && handleRemix()}
                className="w-full bg-bg-0 border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50"
                autoFocus
              />

              <div className="flex flex-col gap-2">
                <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">How to make room</div>
                <div className="flex flex-col gap-2">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setRemixMode('trim')}
                    className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${remixMode === 'trim' ? 'border-accent/50 bg-accent-muted' : 'border-border bg-bg-2 hover:border-border-strong'}`}
                  >
                    <div className={`text-xs font-semibold font-display mb-0.5 ${remixMode === 'trim' ? 'text-accent' : 'text-text-primary'}`}>
                      Trim existing exercises
                    </div>
                    <div className="text-[10px] text-text-secondary font-mono leading-relaxed">
                      Keep all exercises. Cut sets from lower-priority ones and add them to your focus muscle group.
                    </div>
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setRemixMode('swap')}
                    className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${remixMode === 'swap' ? 'border-accent/50 bg-accent-muted' : 'border-border bg-bg-2 hover:border-border-strong'}`}
                  >
                    <div className={`text-xs font-semibold font-display mb-0.5 ${remixMode === 'swap' ? 'text-accent' : 'text-text-primary'}`}>
                      Swap overlapping exercises
                    </div>
                    <div className="text-[10px] text-text-secondary font-mono leading-relaxed">
                      Replace exercises that only hit your focus muscle as a secondary with ones that target it directly.
                    </div>
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setRemixMode('edit')}
                    className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${remixMode === 'edit' ? 'border-accent/50 bg-accent-muted' : 'border-border bg-bg-2 hover:border-border-strong'}`}
                  >
                    <div className={`text-xs font-semibold font-display mb-0.5 ${remixMode === 'edit' ? 'text-accent' : 'text-text-primary'}`}>
                      Do exactly what I said
                    </div>
                    <div className="text-[10px] text-text-secondary font-mono leading-relaxed">
                      Add, remove or replace exercises as written, e.g. "remove seated row and legs, keep it to 40 minutes".
                    </div>
                  </motion.button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={resetRemix} className="flex-1">Cancel</Button>
                <Button variant="primary" onClick={handleRemix} disabled={!remixInstruction.trim() || remixLoading} className="flex-1">
                  {remixLoading ? <span className="flex items-center justify-center gap-2">Remixing <ThinkingDots /></span> : '✦ Remix'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-bg-2 border border-border rounded-xl p-3">
                <div className="text-[10px] font-mono text-accent uppercase tracking-wider mb-2">What changed</div>
                <p className="text-xs text-text-secondary leading-relaxed">{remixResult.changeDescription}</p>
              </div>

              <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">New exercise layout</div>
                {remixResult.exercises.map((ex, ei) => {
                  const orig = (remixTarget.workout.exercises || []).find(o => o.name === ex.name);
                  const setsChanged = orig && ex.sets !== orig.sets;
                  const rangeChanged = orig && ex.repRange !== orig.repRange;
                  const isNew = !orig;
                  return (
                    <div key={ei} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${isNew ? 'border-success/30 bg-success/5' : setsChanged || rangeChanged ? 'border-accent/30 bg-accent-muted' : 'border-border bg-bg-2'}`}>
                      <span className={`font-display font-medium truncate ${isNew ? 'text-success' : 'text-text-primary'}`}>{ex.name}{isNew ? ' ★' : ''}</span>
                      <span className="font-mono text-[10px] text-text-tertiary flex-shrink-0 ml-2">
                        {setsChanged && orig ? <span className="text-accent">{orig.sets}→{ex.sets}</span> : ex.sets} × {rangeChanged && orig ? <span className="text-accent">{ex.repRange}</span> : ex.repRange}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1.5">Name</div>
                  <input
                    type="text"
                    value={remixName}
                    onChange={e => setRemixName(e.target.value)}
                    className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2.5 text-sm font-display font-semibold text-text-primary outline-none focus:border-accent/50"
                    placeholder="Workout name"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Button variant="primary" onClick={() => handleSaveRemix(false)} disabled={!remixName.trim()} className="w-full">
                    Save as Variation
                  </Button>
                  <Button variant="secondary" onClick={() => handleSaveRemix(true)} disabled={!remixName.trim()} className="w-full">
                    Save as New Workout
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setRemixResult(null)} className="flex-1">← Back</Button>
                    <Button variant="ghost" onClick={resetRemix} className="flex-1">Cancel</Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Create Workout Modal (NEW — full builder) ─────────────────── */}
      <Modal
        open={showCreate}
        onClose={handleCloseCreate}
        title="Create Your Own Workout"
        maxWidth="max-w-xl"
      >
        <div className="p-3 flex flex-col gap-3">
          {/* Workout name */}
          <input
            type="text"
            placeholder="Workout Name (e.g. Push Day)"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            className="w-full bg-bg-0 border border-border rounded-lg px-3 py-2.5 text-sm font-display font-semibold text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50"
          />

          {/* Exercises header */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono text-text-secondary">Exercises ({manualExercises.length})</h3>
            <span className="text-[10px] font-mono text-text-muted">tap ★ Special for drop sets, BFR, etc.</span>
          </div>

          {/* Exercise cards */}
          <div className="flex flex-col gap-2">
            <AnimatePresence>
              {manualExercises.map((ex, i) => (
                <CreateExerciseCard
                  key={i}
                  exercise={ex}
                  index={i}
                  allExercises={manualExercises}
                  onChange={updateManualExercise}
                  onRemove={removeManualExercise}
                  onMoveUp={(idx) => moveExercise(idx, idx - 1)}
                  onMoveDown={(idx) => moveExercise(idx, idx + 1)}
                  isFirst={i === 0}
                  isLast={i === manualExercises.length - 1}
                />
              ))}
            </AnimatePresence>
          </div>

          <Button variant="ghost" onClick={addManualExercise} className="w-full">
            + Add Exercise
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleCloseCreate} className="flex-1">Cancel</Button>
            <Button variant="primary" onClick={handleSaveManual} className="flex-1">Save Workout</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Program?"
        message={`"${deleteConfirm?.name}" and all its workouts will be permanently deleted.`}
        onConfirm={handleDeleteProgram}
        onCancel={() => setDeleteConfirm(null)}
        confirmLabel="Delete"
        danger
      />

      <ConfirmDialog
        open={!!deleteWorkoutConfirm}
        title="Delete Workout?"
        message={`"${deleteWorkoutConfirm?.name}" will be permanently deleted.`}
        onConfirm={handleDeleteWorkout}
        onCancel={() => setDeleteWorkoutConfirm(null)}
        confirmLabel="Delete"
        danger
      />

      <WizardModal open={showWizard} onClose={() => setShowWizard(false)} />

      {/* ── Workout action sheet (portaled) ──────────────────────────── */}
      {createPortal(
        <AnimatePresence>
          {workoutMenu && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4"
              onClick={() => setWorkoutMenu(null)}
            >
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1, transition: { type: 'spring', damping: 26, stiffness: 340 } }}
                exit={{ y: 40, opacity: 0, transition: { duration: 0.18 } }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-sm bg-bg-1 border border-border-strong rounded-2xl overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-border">
                  <p className="font-display font-semibold text-sm text-text-primary truncate">{workoutMenu.workout.name}</p>
                  <p className="text-[10px] font-mono text-text-muted mt-0.5">{(workoutMenu.workout.exercises || []).length} exercises</p>
                </div>
                <div className="flex flex-col">
                  {[
                    { label: '▶  Start Workout', action: () => { setWorkoutMenu(null); handleStartWorkout(workoutMenu.index); }, color: 'text-accent' },
                    { label: `${workoutMenu.workout.favorite ? '★  Remove Favourite' : '☆  Add to Favourites'}`, action: () => { handleToggleFavorite(workoutMenu.index); setWorkoutMenu(null); }, color: workoutMenu.workout.favorite ? 'text-accent' : 'text-text-primary' },
                    { label: '✦  AI Remix', action: () => { setRemixTarget({ workout: workoutMenu.workout, index: workoutMenu.index }); setRemixInstruction(''); setRemixMode('trim'); setRemixResult(null); setWorkoutMenu(null); }, color: 'text-text-primary' },
                    { label: '✎  Rename', action: () => { setRenamingWorkout({ index: workoutMenu.index, value: workoutMenu.workout.name }); setWorkoutMenu(null); }, color: 'text-text-primary' },
                    { label: shareLoading ? '⏳  Generating Code…' : '⇪  Share (get code)', action: () => !shareLoading && handleShareWorkout(workoutMenu.workout), color: 'text-text-primary' },
                    { label: '▾  View Exercises', action: () => { setExpandedWorkouts(prev => { const next = new Set(prev); next.has(workoutMenu.index) ? next.delete(workoutMenu.index) : next.add(workoutMenu.index); return next; }); setWorkoutMenu(null); }, color: 'text-text-primary' },
                    { label: '✕  Delete', action: () => { setDeleteWorkoutConfirm({ index: workoutMenu.index, name: workoutMenu.workout.name }); setWorkoutMenu(null); }, color: 'text-error' },
                  ].map(({ label, action, color }) => (
                    <motion.button
                      key={label}
                      whileTap={{ scale: 0.98 }}
                      onClick={action}
                      className={`w-full text-left px-5 py-4 text-sm font-mono border-b border-border/50 last:border-0 hover:bg-bg-2 transition-colors ${color}`}
                    >
                      {label}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── Share code display modal (portaled) ──────────────────────── */}
      {createPortal(
        <AnimatePresence>
          {shareModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-6"
              onClick={() => setShareModal(null)}
            >
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
              <motion.div
                initial={{ scale: 0.88, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0, transition: { type: 'spring', damping: 22, stiffness: 320 } }}
                exit={{ scale: 0.92, opacity: 0, y: 8, transition: { duration: 0.18 } }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-xs bg-bg-1 border border-border-strong rounded-2xl p-6 text-center"
              >
                <div className="text-3xl mb-2">⇪</div>
                <p className="font-display font-bold text-base text-text-primary mb-1">{shareModal.workoutName}</p>
                <p className="text-xs text-text-muted font-mono mb-4">Share this code with anyone</p>
                <div className="bg-bg-3 border border-border-strong rounded-xl py-5 px-4 mb-4">
                  <span className="font-display font-bold text-3xl tracking-[0.3em] text-accent">{shareModal.code}</span>
                </div>
                <p className="text-[10px] font-mono text-text-muted mb-4">Expires in 7 days · Recipient must have an account</p>
                <Button variant="ghost" onClick={() => setShareModal(null)} className="w-full">Done</Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── Import code modal ─────────────────────────────────────────── */}
      {createPortal(
        <AnimatePresence>
          {showImportModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center p-6"
              onClick={() => { setShowImportModal(false); setImportCode(''); setImportPreview(null); setImportError(''); setImportTargetProgramId(''); setImportMode('new'); }}
            >
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
              <motion.div
                initial={{ scale: 0.88, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0, transition: { type: 'spring', damping: 22, stiffness: 320 } }}
                exit={{ scale: 0.92, opacity: 0, y: 8, transition: { duration: 0.18 } }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-xs bg-bg-1 border border-border-strong rounded-2xl p-6"
              >
                <p className="font-display font-bold text-base text-text-primary mb-1">Import Workout</p>
                <p className="text-xs text-text-muted font-mono mb-4">Enter a share code to import a workout</p>
                <input
                  type="text"
                  placeholder="e.g. ABC123"
                  value={importCode}
                  onChange={e => { setImportCode(e.target.value.toUpperCase()); setImportPreview(null); setImportError(''); }}
                  onKeyDown={e => e.key === 'Enter' && !importLoading && !importPreview && handlePreviewImport()}
                  className="w-full bg-bg-3 border border-border rounded-xl px-4 py-3 text-center text-lg font-display font-bold tracking-widest text-text-primary outline-none focus:border-accent/50 mb-3"
                  maxLength={8}
                  autoFocus
                />
                {importError && <p className="text-xs text-error font-mono text-center mb-3">{importError}</p>}
                {importPreview && (
                  <div className="bg-success/10 border border-success/30 rounded-xl p-3 mb-3 text-center">
                    <p className="font-display font-semibold text-sm text-success">{importPreview.workoutName}</p>
                    <p className="text-[10px] font-mono text-text-muted mt-0.5">{importPreview.exerciseCount} exercises</p>
                  </div>
                )}
                {importPreview && !selectedProgram && (
                  <div className="mb-3 flex flex-col gap-2">
                    <button type="button" onClick={() => setImportMode('new')}
                      className="w-full flex items-center gap-2.5 rounded-xl border border-border bg-bg-3 px-3 py-2.5 text-left">
                      <span className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 ${importMode === 'new' ? 'bg-accent border-accent' : 'border-border-strong'}`}>
                        {importMode === 'new' && <span className="w-2 h-2 rounded-[2px] bg-bg-1" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-mono text-text-primary">Make a new program <span className="text-accent">(recommended)</span></span>
                        <span className="block text-[10px] font-mono text-text-muted truncate">"{importPreview.workoutName}"</span>
                      </span>
                    </button>

                    <button type="button" onClick={() => setImportMode('existing')}
                      className="w-full flex items-center gap-2.5 rounded-xl border border-border bg-bg-3 px-3 py-2.5 text-left">
                      <span className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 ${importMode === 'existing' ? 'bg-accent border-accent' : 'border-border-strong'}`}>
                        {importMode === 'existing' && <span className="w-2 h-2 rounded-[2px] bg-bg-1" />}
                      </span>
                      <span className="text-xs font-mono text-text-primary">Add to existing program</span>
                    </button>

                    {importMode === 'existing' && (
                      <select
                        value={importTargetProgramId}
                        onChange={e => setImportTargetProgramId(e.target.value)}
                        className="w-full bg-bg-3 border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50 font-mono"
                      >
                        <option value="">— select program —</option>
                        {programs.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {!importPreview ? (
                    <Button variant="primary" onClick={handlePreviewImport} disabled={!importCode.trim() || importLoading} className="w-full">
                      {importLoading ? <span className="flex items-center justify-center gap-2">Checking <ThinkingDots /></span> : 'Look Up Code'}
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={handleImportWorkout}
                      disabled={(!selectedProgram && importMode === 'existing' && !importTargetProgramId) || importLoading} className="w-full">
                      {importLoading ? <span className="flex items-center justify-center gap-2">Importing <ThinkingDots /></span> : 'Import into Program'}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => { setShowImportModal(false); setImportCode(''); setImportPreview(null); setImportError(''); setImportTargetProgramId(''); setImportMode('new'); }} className="w-full">Cancel</Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </motion.div>
  );
}
