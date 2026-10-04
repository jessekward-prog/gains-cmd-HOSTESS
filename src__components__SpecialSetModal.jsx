import { createPortal } from 'react-dom';
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { overlayVariants, modalVariants } from '../lib/variants';
import useBackHandler from '../hooks/useBackHandler';
import { PickerWheel } from './RestPickerModal';
import { EXERCISE_LIST_ID } from './ExerciseNameOptions';

export default function SpecialSetModal({ open, onClose, exercise, allExercises, exerciseIndex, onAddDropSet, onRemoveDropSet, onLinkSuperset, onUnlinkSuperset, onAddBFR, onRemoveBFR, onAddInterval, onRemoveInterval, onAddVariable, onRemoveVariable, onToggleFailure }) {
  const [mode, setMode] = useState(null);
  const [drops, setDrops] = useState(2);
  const [supersetTarget, setSupersetTarget] = useState('');
  const [customName, setCustomName] = useState('');

  const hasDrops = exercise?.sets?.some(s => s.type === 'drop');
  const currentDropCount = exercise?.numDrops || 0;
  const hasBFR = exercise?.sets?.some(s => s.type === 'bfr');
  const hasInterval = exercise?.sets?.some(s => s.type === 'interval');
  const hasVariable = exercise?.sets?.some(s => s.type === 'variable');
  const failureEligible = (exercise?.sets || []).map((s, i) => ({ s, i })).filter(({ s }) => s.type !== 'drop' && s.type !== 'bfr' && s.type !== 'interval');
  const failureCount = failureEligible.filter(({ s }) => s.reps === 'failure').length;
  const hasSuperset = !!exercise?.supersetWith;
  const [bfrSeconds, setBfrSeconds] = useState(45);
  const [customBfr, setCustomBfr] = useState('');
  const [intervalWorkMin, setIntervalWorkMin] = useState(0);
  const [intervalWorkSec, setIntervalWorkSec] = useState(30);
  const [intervalRestMin, setIntervalRestMin] = useState(0);
  const [intervalRestSec, setIntervalRestSec] = useState(30);
  const [intervalSets, setIntervalSets] = useState(3);
  const [varSets, setVarSets] = useState([
    { weight: '', repRange: '8-12' },
    { weight: '', repRange: '8-12' },
    { weight: '', repRange: '8-12' },
  ]);

  const handleClose = useCallback(() => {
    setMode(null);
    setSupersetTarget('');
    setCustomName('');
    setDrops(2);
    setBfrSeconds(45);
    setCustomBfr('');
    setIntervalWorkMin(0);
    setIntervalWorkSec(30);
    setIntervalRestMin(0);
    setIntervalRestSec(30);
    setIntervalSets(3);
    setVarSets([{ weight: '', repRange: '8-12' }, { weight: '', repRange: '8-12' }, { weight: '', repRange: '8-12' }]);
    onClose();
  }, [onClose]);

  // Back gesture: if inside a sub-mode, step back to the menu first.
  // Only close the whole modal when on the top-level menu.
  useBackHandler(open, useCallback(() => {
    if (mode) {
      setMode(null);
      return true;
    }
    handleClose();
    return true;
  }, [mode, handleClose]));

  const handleApplyDrop = useCallback(() => {
    onAddDropSet(exerciseIndex, drops);
    handleClose();
  }, [exerciseIndex, drops, onAddDropSet, handleClose]);

  const handleRemoveDrop = useCallback(() => {
    onRemoveDropSet(exerciseIndex);
    handleClose();
  }, [exerciseIndex, onRemoveDropSet, handleClose]);

  const handleApplyBFR = useCallback(() => {
    const secs = customBfr ? parseInt(customBfr) : bfrSeconds;
    if (!secs || secs < 5) return;
    onAddBFR(exerciseIndex, secs);
    handleClose();
  }, [exerciseIndex, bfrSeconds, customBfr, onAddBFR, handleClose]);

  const handleRemoveBFR = useCallback(() => {
    onRemoveBFR(exerciseIndex);
    handleClose();
  }, [exerciseIndex, onRemoveBFR, handleClose]);

  const handleUnlinkSuperset = useCallback(() => {
    onUnlinkSuperset(exerciseIndex);
    handleClose();
  }, [exerciseIndex, onUnlinkSuperset, handleClose]);

  const handleApplyInterval = useCallback(() => {
    const work = intervalWorkMin * 60 + intervalWorkSec;
    const rest = intervalRestMin * 60 + intervalRestSec;
    if (!work || !rest || !intervalSets) return;
    const total = intervalSets * (work + rest);
    onAddInterval(exerciseIndex, work, rest, total);
    handleClose();
  }, [exerciseIndex, intervalWorkMin, intervalWorkSec, intervalRestMin, intervalRestSec, intervalSets, onAddInterval, handleClose]);

  const handleRemoveInterval = useCallback(() => {
    onRemoveInterval(exerciseIndex);
    handleClose();
  }, [exerciseIndex, onRemoveInterval, handleClose]);

  const handleApplyVariable = useCallback(() => {
    if (varSets.length === 0) return;
    onAddVariable(exerciseIndex, varSets);
    handleClose();
  }, [exerciseIndex, varSets, onAddVariable, handleClose]);

  const handleRemoveVariable = useCallback(() => {
    onRemoveVariable(exerciseIndex);
    handleClose();
  }, [exerciseIndex, onRemoveVariable, handleClose]);

  const handleApplySuperset = useCallback(() => {
    const target = supersetTarget === '__custom__' ? customName.trim() : supersetTarget;
    if (!target) return;
    onLinkSuperset(exerciseIndex, target);
    handleClose();
  }, [exerciseIndex, supersetTarget, customName, onLinkSuperset, handleClose]);

  const otherExercises = (allExercises || []).filter((_, i) => i !== exerciseIndex);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div variants={overlayVariants} initial="initial" animate="animate" exit="exit"
          className="fixed inset-0 z-[200] flex items-start justify-center pt-16 sm:pt-0 sm:items-center"
          onClick={handleClose}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div variants={modalVariants} initial="initial" animate="animate" exit="exit"
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-sm bg-bg-1 border border-border-strong rounded-2xl overflow-hidden max-h-[88vh] flex flex-col"
          >
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="font-display font-semibold text-base text-text-primary">Special Set</span>
              <button onClick={handleClose} className="text-text-tertiary text-xl leading-none">×</button>
            </div>

            {/* Mode picker */}
            {!mode && (
              <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1 overscroll-contain">
                <p className="text-xs text-text-secondary font-mono">{exercise?.name}</p>

                {/* Drop set — shows current state if active */}
                {hasDrops ? (
                  <div className="w-full p-4 bg-bg-2 border border-accent/30 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-display font-semibold text-sm text-accent mb-0.5">Drop Set active</div>
                        <div className="text-[11px] text-text-secondary">{currentDropCount} drop{currentDropCount !== 1 ? 's' : ''} per set</div>
                      </div>
                      <span className="text-[9px] font-mono px-2 py-1 rounded bg-accent/10 text-accent border border-accent/20">ON</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <motion.button whileTap={{ scale: 0.97 }} onClick={() => setMode('drop')}
                        className="flex-1 py-2 bg-bg-3 border border-border rounded-lg text-xs font-mono text-text-secondary hover:border-accent/30 transition-colors">
                        Change drops
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.97 }} onClick={handleRemoveDrop}
                        className="flex-1 py-2 bg-error/10 border border-error/30 rounded-lg text-xs font-mono text-error hover:bg-error/20 transition-colors">
                        Remove drops
                      </motion.button>
                    </div>
                  </div>
                ) : (
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => setMode('drop')}
                    className="w-full p-4 bg-bg-2 border border-border rounded-xl text-left hover:border-accent/40 transition-colors">
                    <div className="font-display font-semibold text-sm text-text-primary mb-1">Drop Set</div>
                    <div className="text-[11px] text-text-secondary leading-relaxed">
                      Same exercise, weight drops between each set. No rest between drops.
                    </div>
                  </motion.button>
                )}

                {hasSuperset ? (
                  <div className="w-full p-4 bg-bg-2 border border-blue-500/30 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-display font-semibold text-sm text-blue-400 mb-0.5">Superset active</div>
                        <div className="text-[11px] text-text-secondary truncate">with {exercise?.supersetWith}</div>
                      </div>
                      <span className="text-[9px] font-mono px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 flex-shrink-0 ml-2">ON</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <motion.button whileTap={{ scale: 0.97 }} onClick={() => setMode('superset')}
                        className="flex-1 py-2 bg-bg-3 border border-border rounded-lg text-xs font-mono text-text-secondary hover:border-blue-400/30 transition-colors">
                        Change pair
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.97 }} onClick={handleUnlinkSuperset}
                        className="flex-1 py-2 bg-error/10 border border-error/30 rounded-lg text-xs font-mono text-error hover:bg-error/20 transition-colors">
                        Remove superset
                      </motion.button>
                    </div>
                  </div>
                ) : (
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => setMode('superset')}
                    className="w-full p-4 bg-bg-2 border border-border rounded-xl text-left hover:border-accent/40 transition-colors">
                    <div className="font-display font-semibold text-sm text-text-primary mb-1">Superset</div>
                    <div className="text-[11px] text-text-secondary leading-relaxed">
                      Pair with another exercise. Do both back-to-back, rest only after.
                    </div>
                  </motion.button>
                )}

                {/* BFR */}
                {hasBFR ? (
                  <div className="w-full p-4 bg-bg-2 border border-purple-500/30 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-display font-semibold text-sm text-purple-400 mb-0.5">BFR active</div>
                        <div className="text-[11px] text-text-secondary">Timed sets with loading bar</div>
                      </div>
                      <span className="text-[9px] font-mono px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">ON</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <motion.button whileTap={{ scale: 0.97 }} onClick={() => setMode('bfr')}
                        className="flex-1 py-2 bg-bg-3 border border-border rounded-lg text-xs font-mono text-text-secondary hover:border-purple-400/30 transition-colors">
                        Change timer
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.97 }} onClick={handleRemoveBFR}
                        className="flex-1 py-2 bg-error/10 border border-error/30 rounded-lg text-xs font-mono text-error hover:bg-error/20 transition-colors">
                        Remove BFR
                      </motion.button>
                    </div>
                  </div>
                ) : (
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => setMode('bfr')}
                    className="w-full p-4 bg-bg-2 border border-border rounded-xl text-left hover:border-purple-400/30 transition-colors">
                    <div className="font-display font-semibold text-sm text-text-primary mb-1">Blood Flow Restriction</div>
                    <div className="text-[11px] text-text-secondary leading-relaxed">
                      Timed sets with a loading bar. Weight input + countdown per set.
                    </div>
                  </motion.button>
                )}

                {/* Interval */}
                {hasInterval ? (
                  <div className="w-full p-4 bg-bg-2 border border-orange-400/30 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-display font-semibold text-sm text-orange-400 mb-0.5">Intervals active</div>
                        <div className="text-[11px] text-text-secondary">Work / rest cycling</div>
                      </div>
                      <span className="text-[9px] font-mono px-2 py-1 rounded bg-orange-400/10 text-orange-400 border border-orange-400/20">ON</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <motion.button whileTap={{ scale: 0.97 }} onClick={() => setMode('interval')}
                        className="flex-1 py-2 bg-bg-3 border border-border rounded-lg text-xs font-mono text-text-secondary hover:border-orange-400/30 transition-colors">
                        Change timing
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.97 }} onClick={handleRemoveInterval}
                        className="flex-1 py-2 bg-error/10 border border-error/30 rounded-lg text-xs font-mono text-error hover:bg-error/20 transition-colors">
                        Remove
                      </motion.button>
                    </div>
                  </div>
                ) : (
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => setMode('interval')}
                    className="w-full p-4 bg-bg-2 border border-border rounded-xl text-left hover:border-orange-400/30 transition-colors">
                    <div className="font-display font-semibold text-sm text-text-primary mb-1">Intervals</div>
                    <div className="text-[11px] text-text-secondary leading-relaxed">
                      Work / rest cycles. Green bar for work, red for rest. Set interval and total time.
                    </div>
                  </motion.button>
                )}

                {/* Variable — Pat Sgro */}
                {hasVariable ? (
                  <div className="w-full p-4 bg-bg-2 border border-teal-500/30 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-display font-semibold text-sm text-teal-400 mb-0.5">Variable active</div>
                        <div className="text-[11px] text-text-secondary">Individual weight &amp; rep range per set</div>
                      </div>
                      <span className="text-[9px] font-mono px-2 py-1 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">ON</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <motion.button whileTap={{ scale: 0.97 }} onClick={() => {
                        const existing = exercise.sets
                          .filter(s => s.type === 'variable')
                          .map(s => ({ weight: s.weight || '', repRange: s.variableRepRange || '8-12' }));
                        setVarSets(existing.length > 0 ? existing : [{ weight: '', repRange: '8-12' }]);
                        setMode('variable');
                      }}
                        className="flex-1 py-2 bg-bg-3 border border-border rounded-lg text-xs font-mono text-text-secondary hover:border-teal-400/30 transition-colors">
                        Change sets
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.97 }} onClick={handleRemoveVariable}
                        className="flex-1 py-2 bg-error/10 border border-error/30 rounded-lg text-xs font-mono text-error hover:bg-error/20 transition-colors">
                        Remove
                      </motion.button>
                    </div>
                  </div>
                ) : (
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => {
                    setVarSets([{ weight: '', repRange: '8-12' }, { weight: '', repRange: '8-12' }, { weight: '', repRange: '8-12' }]);
                    setMode('variable');
                  }}
                    className="w-full p-4 bg-bg-2 border border-border rounded-xl text-left hover:border-teal-400/30 transition-colors">
                    <div className="font-display font-semibold text-sm text-text-primary mb-1">
                      Variable <span className="text-text-tertiary text-[11px]">— Pat Sgro</span>
                    </div>
                    <div className="text-[11px] text-text-secondary leading-relaxed">
                      Individual weight &amp; rep range per set. Reverse pyramids, step progressions, and more.
                    </div>
                  </motion.button>
                )}

                {/* Failure Set */}
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => setMode('failure')}
                  className={`w-full p-4 border rounded-xl text-left transition-colors ${
                    failureCount > 0 ? 'bg-bg-2 border-warning/30' : 'bg-bg-2 border-border hover:border-warning/40'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-display font-semibold text-sm text-text-primary">Failure Set</div>
                    {failureCount > 0 && (
                      <span className="text-[9px] font-mono px-2 py-1 rounded bg-warning-muted text-warning border border-warning/20">
                        {failureCount} of {failureEligible.length}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-text-secondary leading-relaxed">
                    Mark specific sets as trained to failure instead of a fixed rep count.
                  </div>
                </motion.button>
              </div>
            )}

            {/* Drop set config */}
            {mode === 'drop' && (
              <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1 overscroll-contain">
                <button onClick={() => setMode(null)} className="text-[11px] font-mono text-text-tertiary text-left">← back</button>
                <div>
                  <div className="text-xs font-mono text-text-secondary mb-3">How many drops after each set?</div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map(n => (
                      <motion.button key={n} whileTap={{ scale: 0.9 }} onClick={() => setDrops(n)}
                        className={`flex-1 py-3 rounded-xl border-2 text-sm font-mono font-semibold transition-all ${
                          drops === n ? 'border-accent bg-accent-muted text-accent' : 'border-border text-text-secondary'}`}>
                        {n}
                      </motion.button>
                    ))}
                  </div>
                  <div className="mt-3 text-[11px] text-text-tertiary font-mono">
                    = {drops + 1} total sets per row · {drops} drop{drops > 1 ? 's' : ''}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] px-2 py-1 rounded bg-accent-muted text-accent font-mono">Set (heavy)</span>
                  {Array.from({ length: drops }).map((_, i) => (
                    <span key={i} className="text-[11px] px-2 py-1 rounded bg-bg-3 text-text-tertiary font-mono border border-dashed border-border">
                      D{i + 1}
                    </span>
                  ))}
                </div>

                <motion.button whileTap={{ scale: 0.97 }} onClick={handleApplyDrop}
                  className="w-full py-3 bg-accent text-white rounded-xl font-mono font-semibold text-sm">
                  {hasDrops ? 'Update Drop Set' : 'Add Drop Set'}
                </motion.button>
              </div>
            )}

            {/* Interval config */}
            {mode === 'interval' && (() => {
              const minOptions = [0, 1, 2, 3, 4, 5];
              const secOptions = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
              const setOptions = Array.from({ length: 20 }, (_, i) => i + 1);
              const totalWork = intervalWorkMin * 60 + intervalWorkSec;
              const totalRest = intervalRestMin * 60 + intervalRestSec;
              const totalSec = intervalSets * (totalWork + totalRest);
              const fmt = s => s >= 60 ? `${Math.floor(s/60)}m${s%60 ? ` ${s%60}s` : ''}` : `${s}s`;
              return (
                <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1 overscroll-contain">
                  <button onClick={() => setMode(null)} className="text-[11px] font-mono text-text-tertiary text-left">← back</button>

                  {/* Work time */}
                  <div>
                    <div className="text-xs font-mono text-success mb-2">Work time</div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <PickerWheel items={minOptions} value={intervalWorkMin} onChange={setIntervalWorkMin} />
                        <div className="text-center text-xs font-mono text-text-tertiary mt-1">min</div>
                      </div>
                      <div className="flex-1">
                        <PickerWheel items={secOptions} value={intervalWorkSec} onChange={setIntervalWorkSec} />
                        <div className="text-center text-xs font-mono text-text-tertiary mt-1">sec</div>
                      </div>
                    </div>
                  </div>

                  {/* Rest time */}
                  <div>
                    <div className="text-xs font-mono text-error mb-2">Rest time</div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <PickerWheel items={minOptions} value={intervalRestMin} onChange={setIntervalRestMin} />
                        <div className="text-center text-xs font-mono text-text-tertiary mt-1">min</div>
                      </div>
                      <div className="flex-1">
                        <PickerWheel items={secOptions} value={intervalRestSec} onChange={setIntervalRestSec} />
                        <div className="text-center text-xs font-mono text-text-tertiary mt-1">sec</div>
                      </div>
                    </div>
                  </div>

                  {/* Sets */}
                  <div>
                    <div className="text-xs font-mono text-text-secondary mb-2">Sets</div>
                    <PickerWheel items={setOptions} value={intervalSets} onChange={setIntervalSets} />
                    <div className="text-center text-xs font-mono text-text-tertiary mt-1">sets</div>
                  </div>

                  {/* Preview */}
                  {totalWork > 0 && totalRest > 0 && (
                    <div className="text-[11px] text-text-tertiary font-mono bg-bg-3 rounded-lg px-3 py-2">
                      {intervalSets} sets · {fmt(totalWork)} work / {fmt(totalRest)} rest · {fmt(totalSec)} total
                    </div>
                  )}

                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleApplyInterval}
                    className="w-full py-3 rounded-xl font-mono font-semibold text-sm text-white"
                    style={{ background: 'rgb(251 146 60)' }}>
                    {hasInterval ? 'Update Intervals' : 'Apply Intervals'}
                  </motion.button>
                </div>
              );
            })()}

            {/* BFR config */}
            {mode === 'bfr' && (
              <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1 overscroll-contain">
                <button onClick={() => setMode(null)} className="text-[11px] font-mono text-text-tertiary text-left">← back</button>
                <div className="text-xs font-mono text-text-secondary">How long per set?</div>

                {/* Presets */}
                <div className="grid grid-cols-4 gap-2">
                  {[20, 30, 45, 60].map(s => (
                    <motion.button key={s} whileTap={{ scale: 0.9 }}
                      onClick={() => { setBfrSeconds(s); setCustomBfr(''); }}
                      className={`py-3 rounded-xl border-2 text-sm font-mono font-semibold transition-all ${
                        bfrSeconds === s && !customBfr
                          ? 'border-purple-400 bg-purple-400/10 text-purple-400'
                          : 'border-border text-text-secondary'}`}>
                      {s}s
                    </motion.button>
                  ))}
                </div>

                {/* Custom */}
                <div>
                  <div className="text-[11px] font-mono text-text-tertiary mb-2">Custom (seconds)</div>
                  <input type="number" inputMode="numeric" placeholder="e.g. 90"
                    value={customBfr} onChange={e => { setCustomBfr(e.target.value); setBfrSeconds(0); }}
                    className="w-full bg-bg-0 border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none focus:border-purple-400/50" />
                </div>

                <div className="text-[11px] text-text-tertiary font-mono">
                  Each set: weight input + {customBfr ? customBfr + 's' : bfrSeconds + 's'} loading bar
                </div>

                <motion.button whileTap={{ scale: 0.97 }} onClick={handleApplyBFR}
                  className="w-full py-3 rounded-xl font-mono font-semibold text-sm text-white"
                  style={{ background: 'rgb(168 85 247)' }}>
                  {hasBFR ? 'Update BFR Timer' : 'Apply BFR Sets'}
                </motion.button>
              </div>
            )}

            {/* Variable config */}
            {mode === 'variable' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-4 pt-4 flex flex-col gap-3 flex-shrink-0">
                  <button onClick={() => setMode(null)} className="text-[11px] font-mono text-text-tertiary text-left">← back</button>
                  <div className="text-xs font-mono text-text-secondary">Set individual weight &amp; rep range per set:</div>
                  <div className="grid grid-cols-[28px_1fr_1fr_28px] gap-2 text-[9px] font-mono text-text-tertiary uppercase tracking-wider">
                    <span></span>
                    <span className="text-center">KG</span>
                    <span className="text-center">REPS</span>
                    <span></span>
                  </div>
                </div>

                {/* Scrollable sets list */}
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 flex flex-col gap-2 pb-2">
                  {varSets.map((vs, i) => (
                    <div key={i} className="grid grid-cols-[28px_1fr_1fr_28px] gap-2 items-center">
                      <span className="text-center text-sm font-mono text-teal-400">{i + 1}</span>
                      <input type="number" inputMode="decimal" placeholder="kg" value={vs.weight || ''}
                        onChange={e => {
                          const next = [...varSets];
                          next[i] = { ...next[i], weight: e.target.value };
                          setVarSets(next);
                        }}
                        className="w-full text-center py-2.5 px-2 rounded-lg bg-bg-0 border border-teal-500/20 font-display font-bold text-lg text-teal-400 outline-none focus:border-teal-400/50 focus:ring-1 focus:ring-teal-500/10"
                        onFocus={e => e.target.select()} />
                      <input type="text" placeholder="8-12" value={vs.repRange || ''}
                        onChange={e => {
                          const next = [...varSets];
                          next[i] = { ...next[i], repRange: e.target.value };
                          setVarSets(next);
                        }}
                        className="w-full text-center py-2.5 px-2 rounded-lg bg-bg-0 border border-teal-500/20 font-mono text-lg text-teal-400 outline-none focus:border-teal-400/50 focus:ring-1 focus:ring-teal-500/10" />
                      <button onClick={() => setVarSets(varSets.filter((_, idx) => idx !== i))}
                        className="text-error/50 hover:text-error text-lg font-mono flex items-center justify-center">
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {/* Pinned footer: add + apply */}
                <div className="flex-shrink-0 px-4 pb-4 pt-2 flex flex-col gap-3 border-t border-border">
                  <motion.button whileTap={{ scale: 0.97 }}
                    onClick={() => setVarSets([...varSets, { weight: '', repRange: '8-12' }])}
                    className="w-full py-2.5 border border-dashed border-teal-500/30 rounded-xl text-xs font-mono text-teal-400/70 hover:text-teal-400 hover:border-teal-500/50 transition-colors">
                    + Add set
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleApplyVariable}
                    disabled={varSets.length === 0}
                    className="w-full py-3 rounded-xl font-mono font-semibold text-sm text-white disabled:opacity-40"
                    style={{ background: 'rgb(20 184 166)' }}>
                    {hasVariable ? 'Update Variable Sets' : 'Apply Variable Sets'}
                  </motion.button>
                </div>
              </div>
            )}

            {/* Failure set config */}
            {mode === 'failure' && (
              <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1 overscroll-contain">
                <button onClick={() => setMode(null)} className="text-[11px] font-mono text-text-tertiary text-left">← back</button>
                <div className="text-xs font-mono text-text-secondary">Tap a set to toggle it to failure:</div>

                <div className="flex flex-col gap-2">
                  {failureEligible.map(({ s, i }, label) => {
                    const isFailure = s.reps === 'failure';
                    return (
                      <motion.button key={i} whileTap={{ scale: 0.97 }} onClick={() => onToggleFailure(i)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-colors ${
                          isFailure ? 'border-warning/40 bg-warning-muted text-warning' : 'border-border bg-bg-2 text-text-primary'}`}>
                        <span className="font-display font-semibold text-sm">Set {label + 1}</span>
                        <span className="text-[11px] font-mono">{isFailure ? 'failure' : s.reps || '—'}</span>
                      </motion.button>
                    );
                  })}
                  {failureEligible.length === 0 && (
                    <div className="text-[11px] text-text-muted font-mono">No eligible sets on this exercise.</div>
                  )}
                </div>
              </div>
            )}

            {/* Superset config */}
            {mode === 'superset' && (
              <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1 overscroll-contain">
                <button onClick={() => setMode(null)} className="text-[11px] font-mono text-text-tertiary text-left">← back</button>
                <div className="text-xs font-mono text-text-secondary">Pair {exercise?.name} with:</div>

                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                  {otherExercises.map((ex, i) => (
                    <motion.button key={i} whileTap={{ scale: 0.97 }}
                      onClick={() => { setSupersetTarget(ex.name); setCustomName(''); }}
                      className={`w-full px-3 py-2.5 rounded-xl border text-left text-sm font-display transition-all ${
                        supersetTarget === ex.name ? 'border-accent bg-accent-muted text-accent' : 'border-border text-text-primary bg-bg-2'}`}>
                      {ex.name}
                    </motion.button>
                  ))}
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => setSupersetTarget('__custom__')}
                    className={`w-full px-3 py-2.5 rounded-xl border text-left text-sm font-mono transition-all ${
                      supersetTarget === '__custom__' ? 'border-accent bg-accent-muted text-accent' : 'border-border text-text-secondary bg-bg-2'}`}>
                    + Enter a different exercise...
                  </motion.button>
                </div>

                {supersetTarget === '__custom__' && (
                  <input type="text" value={customName} onChange={e => setCustomName(e.target.value)}
                    placeholder="Exercise name" list={EXERCISE_LIST_ID} autoFocus
                    className="w-full bg-bg-0 border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent/50" />
                )}

                <motion.button whileTap={{ scale: 0.97 }} onClick={handleApplySuperset}
                  disabled={!supersetTarget || (supersetTarget === '__custom__' && !customName.trim())}
                  className="w-full py-3 bg-accent text-white rounded-xl font-mono font-semibold text-sm disabled:opacity-40">
                  Link Superset
                </motion.button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
