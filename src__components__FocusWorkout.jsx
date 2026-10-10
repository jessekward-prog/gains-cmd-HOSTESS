import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useGlobalTimer } from '../context/TimerContext';
import { useHaptics } from '../hooks/useHaptics';
import useBackHandler from '../hooks/useBackHandler';
import CardioCard from './CardioCard';
import Modal from './Modal';
import RestPickerModal from './RestPickerModal';
import SpecialSetModal from './SpecialSetModal';
import SubstituteModal from './SubstituteModal';
import ExerciseNotes from './ExerciseNotes';
import TypewriterName from './TypewriterName';
import { computePhase, playBeep, vibrate, COUNT_IN_SEC } from './IntervalTimerBar';
import {
  TAGS, num, fmtW, restLabel, mmss, buildBlocks, blockDone, blockProgress, blockName,
  nextOpenBlock, focusIndex, setLabel, liftStats, isPR,
} from '../lib/focus';
import { nextMemberForRound, roundOfSet } from '../lib/supersets';
import { moodState } from '../lib/mood';
import ExerciseInfo from './ExerciseInfo';
import QuestStage from './QuestStage';
import useQuest, { readTint, readScanlines } from '../hooks/useQuest';
import { monsterOf, questSession, blockXp, addXp, unlocks, xpMult, setDamage, isCrit, topRep, loadOf, LANDS } from '../lib/quest';

const MONO = 'var(--font-mono)';
const letter = (k) => 'ABCD'[k] || String(k + 1);
const lowRep = (ex) => parseInt(String(ex.targetReps || ex.repRange || '').match(/\d+/)?.[0]) || 8;
const DROP_REPS = [9, 7, 6, 5];

// What the reps panel shows before the lifter has touched it: last session's
// reps (or the bottom of the range), "failure" for failure sets and for drops
// left in their default failure mode.
function defaultReps(ex, s, stats) {
  if (s.type === 'drop') return s.dropMode === 'fixed' ? String(DROP_REPS[s.dropIndex ?? 0] ?? 5) : 'failure';
  if (s.reps === 'failure') return 'failure';
  return String(stats?.lr ?? lowRep(ex));
}
const shownReps = (ex, s, stats) => (s.reps !== '' && s.reps != null ? String(s.reps) : defaultReps(ex, s, stats));
const roundW = (x) => String(Math.round(Math.max(0, x) * 100) / 100);

function useTick(active, ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

function Tag({ kind }) {
  const t = TAGS[kind];
  return t ? <span className="g-tag" style={{ '--tag': t[1] }}>{t[0]}</span> : null;
}

// ── Focus steppers ──────────────────────────────────────────────────
function Stepper({ label, value, onDec, onInc }) {
  const small = value.length > 5;
  return (
    <div className="bg-bg-2 rounded-[18px] px-2.5 py-3 text-center flex flex-col">
      <div className="g-label">{label}</div>
      <div className="flex-1 flex items-center justify-center g-tab" style={{ fontSize: small ? 30 : 64, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, margin: '6px 0 10px' }}>{value}</div>
      <div className="flex gap-1.5">
        <button onClick={onDec} className="flex-1 h-14 rounded-[12px] bg-bg-3 text-text-primary active:scale-95 transition-transform" style={{ font: `500 20px ${MONO}` }}>−</button>
        <button onClick={onInc} className="flex-1 h-14 rounded-[12px] bg-bg-3 text-text-primary active:scale-95 transition-transform" style={{ font: `500 20px ${MONO}` }}>+</button>
      </div>
    </div>
  );
}

// ── Rest: big ring (Focus) or strip (Dense) ─────────────────────────
function RestRing({ timer, next, onSkip }) {
  const left = timer.total > 0 ? timer.remaining / timer.total : 0;
  return (
    <div className="h-full flex flex-col items-center">
      <div className="flex-1 flex flex-col items-center justify-center">
      <div className="relative w-[200px] h-[200px]">
        <svg width="200" height="200" viewBox="0 0 200 200" className="absolute inset-0 -rotate-90">
          {/* 60 ticks cut out of the ring by a dashed mask, so the arc still drains smoothly. */}
          <mask id="rest-ticks">
            <circle cx="100" cy="100" r="90" fill="none" stroke="#fff" strokeWidth="12" strokeDasharray="6.42 3" />
          </mask>
          <g mask="url(#rest-ticks)">
            <circle cx="100" cy="100" r="90" fill="none" stroke="var(--color-bg-3)" strokeWidth="10" />
            <circle cx="100" cy="100" r="90" fill="none" stroke="var(--color-accent)" strokeWidth="10"
              strokeDasharray="565.5" strokeDashoffset={565.5 * (1 - left)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="g-label" style={{ letterSpacing: '.16em' }}>REST</span>
          <span className="g-tab" style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05 }}>{mmss(timer.remaining)}</span>
        </div>
      </div>
      {next && (
        <div className="mt-4 text-center">
          <div className="g-label">NEXT{next.tag ? ` · ${next.tag}` : ''}</div>
          <div className="mt-1.5" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{next.name}</div>
          <div className="mt-1 g-tab text-text-secondary" style={{ font: `500 18px ${MONO}` }}>{next.load}</div>
        </div>
      )}
      </div>
      <div className="flex gap-2 w-full mt-3.5">
        <button onClick={() => timer.extend(15)} className="flex-1 h-[62px] rounded-[20px] bg-bg-2 text-text-primary font-bold text-[15px]">+15s</button>
        <button onClick={onSkip} className="flex-[2] h-[62px] rounded-[20px] bg-accent font-extrabold text-[15px]" style={{ color: 'var(--color-on-accent)' }}>Skip rest</button>
      </div>
    </div>
  );
}

// ── Quest Mode panels (the handoff's ctlRest / ctlTravel) ────────────
function QuestRest({ timer, next, onSkip }) {
  const done = timer.total > 0 ? 1 - timer.remaining / timer.total : 0;
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center pt-[18px] pb-1.5">
        <span className="g-label" style={{ letterSpacing: '.16em' }}>REST</span>
        <span className="g-tab" style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05 }}>{mmss(timer.remaining)}</span>
        <div className="w-full h-1 rounded-[2px] bg-bg-3 mt-3.5 overflow-hidden">
          <div className="h-full bg-accent" style={{ width: `${done * 100}%`, transition: 'width 1s linear' }} />
        </div>
        {next && (
          <>
            <div className="mt-4 g-label">NEXT · {next.tag}</div>
            <div className="mt-1.5 text-center" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{next.name}</div>
            <div className="mt-1 g-tab text-text-secondary" style={{ font: `500 18px ${MONO}` }}>{next.load}</div>
          </>
        )}
      </div>
      <div className="flex gap-2 w-full mt-3.5">
        <button onClick={() => timer.extend(15)} className="flex-1 h-[62px] rounded-[20px] bg-bg-2 text-text-primary font-bold text-[15px]">+15s</button>
        <button onClick={onSkip} className="flex-[2] h-[62px] rounded-[20px] bg-accent font-extrabold text-[15px]" style={{ color: 'var(--color-on-accent)' }}>Skip rest</button>
      </div>
    </div>
  );
}

function QuestTravel({ exercises, blocks, defeated, next, walking, intro, timer, onSkip, onClaim }) {
  const d = defeated >= 0 ? blocks[defeated] : null;
  const dSets = d ? d.indices.flatMap((i) => exercises[i].sets.filter((s) => s.completed)) : [];
  const dVol = dSets.reduce((a, s) => a + num(s.weight) * num(s.reps), 0);
  const n = next >= 0 ? blocks[next] : null, n0 = n && exercises[n.indices[0]];
  const left = intro ? Math.max(0, intro.left) : timer.remaining, total = intro ? intro.total : timer.total;
  return (
    <div className="flex-shrink-0 bg-bg-1 rounded-[28px] p-5">
      {d && (
        <>
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-success text-white flex items-center justify-center font-bold flex-shrink-0">✓</span>
            <div className="min-w-0">
              <div className="text-base font-bold text-text-secondary truncate">{blockName(exercises, d)} defeated</div>
              <div className="mt-0.5 text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{dSets.length} sets · {Math.round(dVol).toLocaleString()} kg moved</div>
            </div>
          </div>
          {n && <div className="h-px bg-bg-3 my-5" />}
        </>
      )}
      {n && (
        <>
          <div className="flex justify-between items-center">
            <span className="text-accent" style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em' }}>NEXT ENCOUNTER · {next + 1} OF {blocks.length}</span>
            <span className="px-2 py-1 rounded-[8px] bg-bg-2 text-text-secondary" style={{ font: `600 10px ${MONO}`, letterSpacing: '.12em' }}>LV {Math.round(num(n0.sets[0]?.weight)) || '—'}</span>
          </div>
          <div className="mt-2.5" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 0.98, textWrap: 'balance' }}>{blockName(exercises, n)}</div>
          <div className="mt-2.5 text-text-secondary" style={{ font: `400 13px ${MONO}` }}>
            {n.kind === 'cardio' ? 'Cardio' : `${n0.sets.length} sets × ${n0.targetReps} reps · ${restLabel(n0.restSeconds)} rest`}
          </div>
        </>
      )}
      {onClaim && (
        <button onClick={onClaim} className="mt-1 w-full h-[62px] rounded-[20px] font-extrabold text-[17px]" style={{ background: '#ff2222', color: '#fff' }}>Quest clear · open the loot</button>
      )}
      {walking && !onClaim && (
        <div className="mt-[18px] relative overflow-hidden flex items-center gap-2.5 py-2.5 pr-2.5 pl-3.5 rounded-[14px] bg-bg-2">
          <div className="absolute left-0 top-0 bottom-0" style={{ background: 'var(--g-acc-soft)', width: `${total ? (1 - left / total) * 100 : 0}%`, transition: 'width 1s linear' }} />
          <span className="relative g-label">{intro ? intro.label : 'REST · WALKING'}</span>
          <span className="relative flex-1 g-tab" style={{ font: `500 20px ${MONO}` }}>{mmss(left)}</span>
          {!intro && <button onClick={() => timer.extend(15)} className="relative h-[34px] px-2.5 rounded-[10px] bg-bg-3 text-text-primary" style={{ font: `500 11px ${MONO}` }}>+15s</button>}
          <button onClick={onSkip} className="relative h-[34px] px-3 rounded-[10px] bg-accent font-bold text-xs" style={{ color: 'var(--color-on-accent)' }}>Sprint</button>
        </div>
      )}
    </div>
  );
}

function RestStrip({ timer, onSkip }) {
  return (
    <div className="mt-3 relative overflow-hidden flex items-center gap-2.5 py-2.5 pr-2.5 pl-3.5 rounded-[14px] bg-bg-2 fx-in">
      <div className="absolute left-0 top-0 bottom-0" style={{ background: 'var(--g-acc-soft)', width: `${timer.progress * 100}%`, transition: 'width 1s linear' }} />
      <span className="relative g-label">REST</span>
      <span className="relative flex-1 g-tab" style={{ font: `500 20px ${MONO}` }}>{mmss(timer.remaining)}</span>
      <button onClick={() => timer.extend(15)} className="relative h-[34px] px-2.5 rounded-[10px] bg-bg-3 text-text-primary" style={{ font: `500 11px ${MONO}` }}>+15s</button>
      <button onClick={onSkip} className="relative h-[34px] px-3 rounded-[10px] bg-accent font-bold text-xs" style={{ color: 'var(--color-on-accent)' }}>Skip</button>
    </div>
  );
}

// ── BFR timed set — mirrors BFRTimerBar, stamps bfrStartMs on the set ──
function BFRBlock({ set, onStart, onStop, onDone }) {
  const secs = set.bfrSeconds || 45;
  const running = !!set.bfrStartMs && !set.completed;
  useTick(running);
  const e = running ? (Date.now() - set.bfrStartMs) / 1000 : 0;
  const fired = useRef(false);
  useEffect(() => {
    if (!running) return;
    moodState.timer = { kind: 'bfr' };
    return () => { moodState.timer = null; };
  }, [running]);
  useEffect(() => {
    if (!running) { fired.current = false; return; }
    if (e >= secs && !fired.current) { fired.current = true; onDone(); }
  });
  const pct = running ? Math.min(100, (e / secs) * 100) : set.completed ? 100 : 0;
  return (
    <div className="mt-3 relative overflow-hidden rounded-[18px] bg-bg-2 px-4 py-3.5">
      <div className="absolute left-0 top-0 bottom-0" style={{ background: 'color-mix(in srgb, var(--g-bfr) 22%, transparent)', width: `${pct}%`, transition: 'width .25s linear' }} />
      <div className="relative flex justify-between items-center gap-2.5">
        <div>
          <div style={{ font: `500 10px ${MONO}`, letterSpacing: '.14em', color: 'var(--g-bfr)' }}>BFR · TIMED SET</div>
          <div className="mt-1 g-tab" style={{ font: `500 26px ${MONO}` }}>{set.completed ? 'Done' : mmss(secs - e + (running ? 0.999 : 0))}</div>
          <div style={{ font: `400 11px ${MONO}` }} className="text-text-secondary">
            {running ? 'Keep repping until the bar fills' : set.completed ? 'Logged' : `Cuff on · ${fmtW(set.weight)} kg · rep to time`}
          </div>
        </div>
        {!set.completed && (
          <button onClick={running ? onStop : onStart} className="h-12 px-[18px] rounded-[15px] font-extrabold text-sm whitespace-nowrap flex-shrink-0" style={{ background: 'var(--g-bfr)', color: '#1a0b24' }}>
            {running ? 'Stop' : `Start ${secs}s`}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Interval phase block — same stamps + beeps as IntervalTimerBar ───
function IntervalBlock({ set, onStamp, onDone }) {
  const work = set.intervalWork || 30, rest = set.intervalRest || 30, total = set.intervalTotal || 180;
  const cycle = work + rest;
  const rounds = Math.max(1, Math.ceil(total / cycle));
  const active = !!(set.intervalCountInStartMs || set.intervalTimerStartMs) && !set.completed;
  useTick(active);
  const { phase, phaseRemaining, totalRemaining } = computePhase(set.intervalCountInStartMs, set.intervalTimerStartMs, work, rest, total);
  const prev = useRef(phase);
  useEffect(() => {
    if (phase === prev.current) return;
    const was = prev.current;
    prev.current = phase;
    if (phase === 'work' && was !== 'idle' && was !== 'countin') { playBeep('work'); vibrate([200]); }
    if (phase === 'work' && was === 'countin') playBeep('countdown');
    if (phase === 'rest') { playBeep('rest'); vibrate([100]); }
    if (phase === 'done' && !set.completed) { playBeep('rest'); vibrate([200, 100, 200]); onDone(); }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== 'work' && phase !== 'rest') return;
    moodState.timer = { kind: 'interval', phase };
    return () => { moodState.timer = null; };
  }, [phase]);

  const elapsed = total - totalRemaining;
  const round = Math.min(rounds, Math.floor(elapsed / cycle) + 1);
  const running = phase === 'work' || phase === 'rest';
  const bg = phase === 'work' ? 'var(--color-success)' : phase === 'rest' ? 'var(--g-drop)' : phase === 'countin' ? 'var(--color-bg-3)' : 'var(--color-bg-2)';
  const word = set.completed ? 'Done' : phase === 'work' ? 'WORK' : phase === 'rest' ? 'REST' : phase === 'countin' ? Math.ceil(phaseRemaining) : 'Ready';
  const top = set.completed ? 'BLOCK COMPLETE' : running ? `ROUND ${round} OF ${rounds}` : phase === 'countin' ? 'GET READY' : `${rounds} ROUNDS · ${work}s ON / ${rest}s OFF`;
  return (
    <div className="mt-3.5 px-[18px] pt-[18px] pb-4 rounded-[22px] text-center"
      style={{ background: bg, color: running ? '#0b1a10' : 'var(--color-text-primary)', transition: 'background .3s, color .3s' }}>
      <div style={{ font: `500 10px ${MONO}`, letterSpacing: '.16em', opacity: 0.75 }}>{top}</div>
      <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 6 }}>{word}</div>
      <div className="g-tab" style={{ font: `500 30px ${MONO}`, marginTop: 4 }}>
        {mmss(running ? phaseRemaining + 0.999 : set.completed ? 0 : total)}
      </div>
      <div className="h-1.5 rounded-[3px] mt-3.5 overflow-hidden" style={{ background: 'rgba(0,0,0,.18)' }}>
        <div className="h-full" style={{ background: 'currentColor', width: `${set.completed ? 100 : running ? Math.min(100, (elapsed / total) * 100) : 0}%`, transition: 'width .25s linear' }} />
      </div>
      <button
        onClick={() => {
          if (set.completed) onStamp({ completed: false, intervalCountInStartMs: null, intervalTimerStartMs: null });
          else if (active) onStamp({ intervalCountInStartMs: null, intervalTimerStartMs: null });
          else { const now = Date.now(); onStamp({ intervalCountInStartMs: now, intervalTimerStartMs: now + COUNT_IN_SEC * 1000 }); }
        }}
        className="mt-3.5 w-full h-[52px] rounded-2xl bg-bg-0 text-text-primary font-extrabold text-[15px]">
        {set.completed ? 'Undo' : active ? 'Stop' : 'Start intervals'}
      </button>
    </div>
  );
}

// ── Edit sheet: the per-exercise tools Classic shows as a button row ─
function EditSheet({ open, onClose, ex, ei, exercises, handlers, onAddExercise }) {
  const [modal, setModal] = useState(null);
  const pick = (m) => { onClose(); setModal(m); };
  const normal = (ex?.sets || []).filter((s) => s.type !== 'drop').length;
  const rows = [
    ['How to · muscles worked', () => pick('info')],
    ['+ Add set', () => { handlers.onAddSet(ei); onClose(); }],
    ['− Remove last set', () => {
      if (normal <= 1) return;
      const sets = ex.sets;
      for (let i = sets.length - 1; i >= 0; i--) if (sets[i].type !== 'drop') { handlers.onDeleteSet(ei, i); break; }
      onClose();
    }, normal <= 1],
    [`Rest time · ${restLabel(ex?.restSeconds || 0)}`, () => pick('rest')],
    ['Special sets', () => pick('special')],
    ['Swap exercise', () => pick('swap')],
    ['Notes', () => pick('notes')],
    ['+ Add exercise to workout', () => { onClose(); onAddExercise(); }],
  ];
  return (
    <>
      <Modal open={open} onClose={onClose} title={ex?.name || 'Exercise'}>
        <div className="p-3 flex flex-col gap-1.5">
          {rows.map(([label, fn, disabled]) => (
            <button key={label} onClick={fn} disabled={disabled}
              className="h-12 px-4 rounded-2xl bg-bg-2 text-left text-sm font-semibold text-text-primary disabled:opacity-40">{label}</button>
          ))}
        </div>
      </Modal>
      {ex && (
        <>
          <RestPickerModal open={modal === 'rest'} onClose={() => setModal(null)}
            minutes={Math.floor(ex.restSeconds / 60)} seconds={ex.restSeconds % 60}
            onConfirm={(t) => handlers.onUpdateRest(ei, t)} />
          <SpecialSetModal open={modal === 'special'} onClose={() => setModal(null)} exercise={ex} allExercises={exercises} exerciseIndex={ei}
            onAddDropSet={handlers.onAddDropSet} onRemoveDropSet={handlers.onRemoveDropSet}
            onLinkSuperset={handlers.onLinkSuperset} onUnlinkSuperset={handlers.onUnlinkSuperset}
            onAddBFR={handlers.onAddBFR} onRemoveBFR={handlers.onRemoveBFR}
            onAddInterval={handlers.onAddInterval} onRemoveInterval={handlers.onRemoveInterval}
            onAddVariable={handlers.onAddVariable} onRemoveVariable={handlers.onRemoveVariable}
            onToggleFailure={(si) => handlers.onUpdateSet(ei, si, { ...ex.sets[si], reps: ex.sets[si].reps === 'failure' ? '' : 'failure' })} />
          <SubstituteModal open={modal === 'swap'} onClose={() => setModal(null)} exerciseName={ex.name}
            onSelect={(n) => handlers.onSubstitute(ei, n)} />
          <ExerciseInfo open={modal === 'info'} onClose={() => setModal(null)} name={ex.name} />
          <Modal open={modal === 'notes'} onClose={() => setModal(null)} title="Notes">
            <div className="p-3">
              <ExerciseNotes exerciseName={ex.name} exerciseTarget={`${ex.sets.length} sets × ${ex.targetReps || ex.repRange} reps`} onClose={() => setModal(null)} />
            </div>
          </Modal>
        </>
      )}
    </>
  );
}

// ── Exercise handoff sheet ──────────────────────────────────────────
function Handoff({ exercises, blocks, from, to, stats, onGo }) {
  // The parent re-renders every second (elapsed clock) — keep the auto-advance
  // timer from restarting each time by reading the callback through a ref.
  const go = useRef(onGo);
  go.current = onGo;
  const fire = useCallback(() => go.current(), []);
  useEffect(() => { const t = setTimeout(fire, 2900); return () => clearTimeout(t); }, [fire]);
  useBackHandler(true, fire);
  const a = blocks[from], b = blocks[to];
  const done = a.indices.flatMap((i) => exercises[i].sets.filter((s) => s.completed));
  const vol = done.reduce((x, s) => x + num(s.weight) * num(s.reps), 0);
  const b0 = exercises[b.indices[0]];
  const normals = b0.sets.filter((s) => s.type !== 'drop').length;
  const st = stats[b0.name];
  const meta = b.kind === 'interval' ? `${b0.sets.length} × ${b0.sets[0]?.intervalWork || 30}s on / ${b0.sets[0]?.intervalRest || 30}s off`
    : b.kind === 'superset' ? `${normals} rounds · A then B · ${restLabel(b0.restSeconds)} rest after B`
    : b.kind === 'drop' ? `${normals} sets + ${b0.numDrops || 1} drop${(b0.numDrops || 1) > 1 ? 's' : ''} each · ${restLabel(b0.restSeconds)} rest`
    : b.kind === 'bfr' ? `${b0.sets.length} × ${b0.sets[0]?.bfrSeconds || 45}s timed · cuffs on`
    : b.kind === 'cardio' ? 'Cardio'
    : `${b0.sets.length} sets × ${b0.targetReps} reps · ${restLabel(b0.restSeconds)} rest`;
  // Portalled: App's content wrapper carries a CSS filter, which would make
  // this fixed layer position against the wrapper instead of the viewport.
  return createPortal(
    <div onClick={onGo} className="fixed inset-0 z-[150] flex flex-col justify-end cursor-pointer fx-fade g-root" style={{ background: 'rgba(0,0,0,.45)' }}>
      <div className="bg-bg-1 m-2 px-6 pt-7 pb-[34px] max-w-xl w-[calc(100%-16px)] self-center"
        style={{ borderRadius: '32px 32px 44px 44px', animation: 'fx-up .45s cubic-bezier(.2,1.2,.3,1) both', marginBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-success text-white flex items-center justify-center font-bold" style={{ animation: 'fx-pop .45s cubic-bezier(.2,1.6,.4,1) both' }}>✓</span>
          <div className="min-w-0">
            <div className="text-base font-bold text-text-secondary truncate">{blockName(exercises, a)}</div>
            <div className="mt-0.5 text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>
              {a.kind === 'interval' ? 'Interval block complete' : `${done.length} sets · ${Math.round(vol).toLocaleString()} kg moved`}
            </div>
          </div>
        </div>
        <div className="h-px bg-bg-3 my-6" />
        <div className="flex justify-between items-center" style={{ animation: 'fx-in .3s .2s both' }}>
          <span className="text-accent" style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em' }}>NEXT UP · {to + 1} OF {blocks.length}</span>
          <Tag kind={b.kind} />
        </div>
        <div className="mt-2.5" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 0.98, animation: 'fx-drop .5s .3s cubic-bezier(.2,1.4,.4,1) both', textWrap: 'balance' }}>
          {blockName(exercises, b)}
        </div>
        <div className="mt-3 text-text-secondary" style={{ font: `400 13px ${MONO}`, animation: 'fx-in .3s .45s both' }}>{meta}</div>
        {st?.lw != null && (
          <div className="mt-1 text-text-secondary" style={{ font: `400 13px ${MONO}`, animation: 'fx-in .3s .5s both' }}>Last time {fmtW(st.lw)} × {st.lr}</div>
        )}
        <div className="mt-7 h-[3px] rounded-[2px] bg-bg-3" />
        <div className="-mt-[3px] h-[3px] rounded-[2px] bg-accent origin-left" style={{ animation: 'fx-sweep 2.6s linear both' }} />
        <div className="mt-2.5 text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>Tap to start now</div>
      </div>
    </div>,
    document.body,
  );
}

// ── The workout screen ──────────────────────────────────────────────
export default function FocusWorkout({
  workout, layout, history, elapsed, handlers, onSetComplete, updateWorkout,
  onFinish, onCancel, onAddExercise, onQuestClear,
}) {
  const dense = layout === 'dense';
  const exercises = workout.exercises;
  const blocks = useMemo(() => buildBlocks(exercises), [exercises]);
  const timer = useGlobalTimer();
  const haptics = useHaptics();

  const stats = useMemo(() => {
    const m = {};
    exercises.forEach((ex) => { if (!m[ex.name]) m[ex.name] = liftStats(history, ex.name); });
    return m;
  }, [exercises, history]);

  const [cur, setCur] = useState(() => Math.max(0, blocks.findIndex((b) => !blockDone(exercises, b))));
  const [mem, setMem] = useState(0);
  const [fset, setFset] = useState(null);
  const [handoff, setHandoff] = useState(null);
  const [toast, setToast] = useState(null);
  const [goAt, setGoAt] = useState(0);
  const [drag, setDrag] = useState({ dx: 0, dy: 0, anim: true });
  const [editOpen, setEditOpen] = useState(false);
  const dragRef = useRef({});

  // Blocks can disappear under us (exercise removed, superset unlinked).
  const ci = Math.min(cur, blocks.length - 1);
  const block = blocks[ci];
  const m = Math.min(mem, block.indices.length - 1);
  const ei = block.indices[m];
  const ex = exercises[ei];
  const fi = focusIndex(ex, fset);
  const fs = ex.sets[fi];
  const st = stats[ex.name];
  const kind = block.kind;
  const isTimed = kind === 'bfr' || kind === 'interval';

  // ── Quest Mode: the same workout as a monster battler ─────────────
  // Phase is derived from the real state (rest timer, sets done) plus three
  // stamps: the last hit, the last victory, and when this encounter began.
  const quest = layout === 'quest';
  const { prof } = useQuest();
  const mult = xpMult(prof, prof.lvl);
  const [qHit, setQHit] = useState(null); // { at, bi, dmg, crit, msg }
  const [qWin, setQWin] = useState(null); // { at, msg } — victory starts after the finishing hit
  const [encAt, setEncAt] = useState(0);
  const [introOff, setIntroOff] = useState(false);
  const introEnd = quest && !introOff ? new Date(workout.startTime).getTime() + 4000 : 0;
  const blockStarted = block.indices.some((i) => exercises[i].sets.some((s) => s.completed));
  const introOn = Date.now() < introEnd;
  useEffect(() => {
    if (quest && !timer.isRunning && !blockStarted && !introOn) setEncAt(Date.now());
  }, [quest, ci, timer.isRunning, introOn]); // eslint-disable-line react-hooks/exhaustive-deps
  // Victory whenever the block on screen becomes done — by its last set, a
  // cardio timer, anything. After the finishing hit (1.5s) and the XP line
  // (3.8s): walk to the next encounter, or — nothing left — stop the rest
  // timer and go straight to the loot (no "rest" over a dead monster).
  const celebrated = useRef(null);
  if (celebrated.current === null) celebrated.current = new Set(blocks.map((b, i) => (blockDone(exercises, b) ? i : -1)));
  const blockIsDone = blockDone(exercises, block);
  const allClear = blocks.every((b) => blockDone(exercises, b));
  const clearRef = useRef(onQuestClear);
  const winRef = useRef(null); // the pending victory → next-monster step
  clearRef.current = onQuestClear;
  useEffect(() => {
    if (!quest || !blockIsDone || celebrated.current.has(ci)) return;
    celebrated.current.add(ci);
    const hitAt = qHit && qHit.bi === ci && Date.now() - qHit.at < 1500 ? qHit.at + 1500 : Date.now();
    const gain = blockXp(exercises, block, mult);
    const before = addXp(prof.lvl, prof.xp, questSession(exercises, mult).xp - gain);
    const won = addXp(before.lvl, before.xp, gain);
    const un = unlocks(before.lvl, won.lvl);
    setQWin({ at: hitAt, msg: `HERO gained ${gain.toLocaleString()} XP!${won.lvl > before.lvl ? ` Grew to Lv ${won.lvl}!` : ''}${un ? ` Unlocked ${un}!` : ''}` });
    const nx = nextOpenBlock(exercises, blocks, ci);
    // The last monster goes straight to the loot (which shows the XP) once it falls.
    const t = setTimeout(() => {
      winRef.current = null;
      if (nx < 0) { timer.stop(); clearRef.current?.(); } else openBlock(nx);
    }, hitAt - Date.now() + (nx < 0 ? 1400 : 3800));
    winRef.current = { t, nx };
    return () => clearTimeout(t);
  }, [quest, ci, blockIsDone]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sprint during a victory: skip the rest of it and the rest timer, on to the next monster.
  const skipVictory = () => {
    const w = winRef.current;
    if (!w) return;
    clearTimeout(w.t); winRef.current = null; setQWin(null);
    if (w.nx < 0) { timer.stop(); clearRef.current?.(); } else { timer.stop(); openBlock(w.nx); }
  };

  // Re-render at each phase boundary; the scene animates itself in between.
  const [, qBump] = useState(0);
  useEffect(() => {
    if (!quest) return;
    const now = Date.now();
    const ends = [introEnd, encAt + 2500, qHit && qHit.at + 1500, qWin && qWin.at, qWin && qWin.at + 1400].filter((t) => t && t > now);
    const ids = ends.map((t) => setTimeout(() => qBump((n) => n + 1), t - now + 20));
    return () => ids.forEach(clearTimeout);
  }, [quest, introEnd, encAt, qHit, qWin]);

  // GO flash when a rest runs out on its own (TimerContext stamps endedAt).
  useEffect(() => { if (timer.endedAt) setGoAt(timer.endedAt); }, [timer.endedAt]);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!goAt) return;
    const t = setTimeout(() => bump((n) => n + 1), 820);
    return () => clearTimeout(t);
  }, [goAt]);
  const goFlash = Date.now() - goAt < 800 && !timer.isRunning;

  const patchSet = useCallback((xi, si, patch) => {
    updateWorkout((prev) => {
      if (!prev) return prev;
      const next = { ...prev, exercises: [...prev.exercises] };
      const sets = [...next.exercises[xi].sets];
      sets[si] = { ...sets[si], ...patch };
      next.exercises[xi] = { ...next.exercises[xi], sets };
      return next;
    });
  }, [updateWorkout]);

  const openBlock = useCallback((i) => { setCur(i); setMem(0); setFset(null); }, []);

  const step = (xi, si, field, d) => {
    const x = exercises[xi], s = x.sets[si];
    if (field === 'weight') return patchSet(xi, si, { weight: roundW(num(s.weight) + d) });
    const shown = shownReps(x, s, stats[x.name]);
    const base = shown === 'failure' ? (s.type === 'drop' ? DROP_REPS[s.dropIndex ?? 0] ?? 5 : stats[x.name]?.lr ?? lowRep(x)) : num(shown);
    patchSet(xi, si, { reps: String(Math.max(0, base + d)), ...(s.type === 'drop' ? { dropMode: 'fixed' } : {}) });
  };

  // Completing a set: log it, check for a PR, then decide what happens next —
  // the partner (superset), the next drop, rest, or the handoff to a new block.
  const complete = (xi, si) => {
    const x = exercises[xi], s = x.sets[si];
    if (s.completed) { patchSet(xi, si, { completed: false }); setFset(si); return; }
    const shown = shownReps(x, s, stats[x.name]);
    const reps = shown === 'failure' ? s.reps : shown;
    patchSet(xi, si, { completed: true, reps: reps ?? '' });
    moodState.pulse = Date.now();
    haptics.tap();
    setFset(null);

    if (s.type !== 'drop' && reps !== 'failure' && isPR(stats[x.name], x.name, s.weight, reps)) {
      haptics.success();
      setToast({ text: `${x.name} ${fmtW(s.weight)} × ${reps}`, at: Date.now() });
      moodState.prUntil = Date.now() + 2400;
    }

    const doneNow = (i, j) => (i === xi && j === si) || exercises[i].sets[j].completed;
    const allDone = block.indices.every((i) => exercises[i].sets.every((_, j) => doneNow(i, j)));
    const nextIsDrop = x.sets[si + 1]?.type === 'drop' && !x.sets[si + 1].completed;
    if (!nextIsDrop) onSetComplete(xi, si, x.restSeconds);

    if (quest) {
      const hitSet = { ...s, reps }, crit = isCrit(x, hitSet);
      setQHit({ at: Date.now(), bi: ci, dmg: setDamage(x, hitSet, kind), crit,
        msg: `HERO lifts ${num(s.weight) > 0 ? `${fmtW(s.weight)} kg` : 'bodyweight'} × ${reps}!${crit ? " It's super effective!" : ''}${allDone ? ' Finishing blow!' : ''}` });
    }
    if (allDone) {
      if (quest) return; // the victory effect below takes it from here
      const after = exercises.map((e, i) => (i === xi ? { ...e, sets: e.sets.map((ss, j) => (j === si ? { ...ss, completed: true } : ss)) } : e));
      const nx = nextOpenBlock(after, blocks, ci);
      setTimeout(() => { if (nx < 0) onFinish(); else setHandoff({ from: ci, to: nx }); }, 600);
      return;
    }
    if (block.kind === 'superset' && roundOfSet(x, si) >= 0) {
      const partner = nextMemberForRound(exercises, block.indices, xi, si);
      if (partner >= 0) { setMem(block.indices.indexOf(partner)); return; }
      const firstOwing = block.indices.findIndex((i) => exercises[i].sets.some((ss, j) => !doneNow(i, j)));
      if (firstOwing >= 0) setMem(firstOwing);
    }
  };

  const skipRest = () => { timer.stop(); setGoAt(Date.now()); };

  // ── Swipe ─────────────────────────────────────────────────────────
  const swipe = (dir) => {
    let apply = null;
    if (!dense && (dir === 'left' || dir === 'right')) {
      const ni = fi + (dir === 'left' ? 1 : -1);
      if (ni >= 0 && ni < ex.sets.length) apply = () => setFset(ni);
    } else {
      const ni = ci + (dir === 'left' || dir === 'up' ? 1 : -1);
      if (ni >= 0 && ni < blocks.length) apply = () => openBlock(ni);
    }
    if (!apply) { setDrag({ dx: 0, dy: 0, anim: true }); return; }
    const ox = dir === 'left' ? -420 : dir === 'right' ? 420 : 0;
    const oy = dir === 'up' ? -700 : dir === 'down' ? 700 : 0;
    setDrag({ dx: ox, dy: oy, anim: true });
    setTimeout(() => {
      apply();
      setDrag({ dx: -ox * 0.5, dy: -oy * 0.4, anim: false });
      requestAnimationFrame(() => requestAnimationFrame(() => setDrag({ dx: 0, dy: 0, anim: true })));
    }, 170);
  };
  const pd = (e) => {
    // Controls with their own gesture (the cardio card's inputs and duration
    // wheel) keep it; a swipe only starts on the card itself.
    if (e.target.closest('input, textarea, select, .overflow-y-scroll')) return;
    dragRef.current = { x: e.clientX, y: e.clientY, on: true, moved: false, axis: null };
  };
  const pm = (e) => {
    const d = dragRef.current;
    if (!d.on) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 10) {
      d.moved = true;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (dense && d.axis === 'y') { d.on = false; return; }
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    }
    if (d.moved) setDrag({ dx: d.axis === 'x' ? dx : 0, dy: d.axis === 'y' ? dy * 0.6 : 0, anim: false });
  };
  const pu = () => {
    const d = dragRef.current;
    if (!d.on) return;
    d.on = false;
    if (!d.moved) return;
    d.justDragged = true;
    setTimeout(() => { d.justDragged = false; }, 60);
    if (d.axis === 'x' && Math.abs(drag.dx) > 70) swipe(drag.dx < 0 ? 'left' : 'right');
    else if (d.axis === 'y' && Math.abs(drag.dy) > 50) swipe(drag.dy < 0 ? 'up' : 'down');
    else setDrag({ dx: 0, dy: 0, anim: true });
  };
  const swallowClick = (e) => { if (dragRef.current.justDragged) { e.stopPropagation(); e.preventDefault(); } };

  // ── Derived display ───────────────────────────────────────────────
  const setsLeft = exercises.reduce((a, x) => a + x.sets.filter((s) => !s.completed).length, 0);
  const nx = nextOpenBlock(exercises, blocks, ci);
  const label = setLabel(ex.sets, fi);
  const round = roundOfSet(ex, fi);
  let completeLabel = `Complete set ${label}`;
  if (fs?.type === 'drop') completeLabel = `Complete drop ${(fs.dropIndex ?? 0) + 1}${ex.sets[fi + 1]?.type === 'drop' ? ' — no rest' : ''}`;
  if (kind === 'superset' && round >= 0) {
    const partner = block.indices.find((i) => i !== ei && !exercises[i].sets.filter((s) => s.type !== 'drop')[round]?.completed);
    completeLabel = `Complete ${letter(m)} · round ${round + 1}${partner !== undefined && m < block.indices.length - 1 ? ` → ${letter(m + 1)}` : ''}`;
  }
  if (fs?.completed) completeLabel = `${label} done · tap to undo`;
  const restNext = fs && {
    tag: kind === 'superset' ? letter(m) : fs.type === 'drop' ? setLabel(ex.sets, fi) : `SET ${label}`,
    name: ex.name,
    load: `${fmtW(fs.weight) === 'BW' ? 'BW' : `${fmtW(fs.weight)} kg`} × ${shownReps(ex, fs, st)}`,
  };
  const lastLine = kind === 'interval'
    ? `${fs?.intervalWork || 30}s on / ${fs?.intervalRest || 30}s off · ${mmss(fs?.intervalTotal || 180)} total`
    : st?.lw != null ? `Last ${fmtW(st.lw)} × ${st.lr} · best ${fmtW(st.best)}` : 'First time — this sets your baseline';
  const tagColor = TAGS[kind]?.[1] || 'var(--color-accent)';
  const resting = timer.isRunning;
  const cardMoved = Math.abs(drag.dx) + Math.abs(drag.dy);

  // Quest phase: victory → hit → setting off → rest/walk → encounter → battle.
  let qPhase = 'battle', qT = 0, qStart = 0, qMsg = '';
  const mon = quest ? monsterOf(exercises, block, ci) : null;
  if (quest) {
    const now = Date.now(), since = (t) => (now - t) / 1000;
    if (qWin && since(qWin.at) >= 0 && since(qWin.at) < 3.8) { qPhase = 'victory'; qStart = qWin.at; }
    else if (qHit && qHit.bi === ci && since(qHit.at) < 1.5) { qPhase = 'attack'; qStart = qHit.at; }
    else if (introOn) qPhase = 'walk';
    else if (resting) qPhase = blockStarted ? 'rest' : 'walk';
    else if (!blockStarted && since(encAt) < 2.5) { qPhase = 'encounter'; qStart = encAt; }
    else if (!blockStarted && encAt) qStart = encAt + 2500; // battle entry: bars wipe out, monster slides in
    qT = qStart ? since(qStart) : 9;
    qMsg = qPhase === 'victory' ? (qT < 1.4 ? `Wild ${mon.name} fainted!` : qWin.msg)
      : qPhase === 'attack' ? qHit.msg
      : qPhase === 'walk' ? (introOn ? 'HERO sets out across the meadow. Something is out there…' : 'HERO pushes deeper. Rest up while the halls roll by…')
      : qPhase === 'rest' ? `${mon.species} is catching its breath…`
      : qPhase === 'encounter' ? 'Something stirs in the dark…'
      : blockStarted ? `${mon.species} gets back up. Set ${label} — go!` : `A wild ${mon.name} appeared!`;
    if (!fs?.completed && kind !== 'cardio' && kind !== 'interval') {
      completeLabel = `Attack · ${completeLabel[0].toLowerCase()}${completeLabel.slice(1)}`;
    }
  }
  const qShown = quest ? addXp(prof.lvl, prof.xp, questSession(exercises, mult).xp) : null;
  const qClear = quest && allClear && qPhase !== 'victory';
  if (qClear) { qPhase = 'walk'; qMsg = 'Quest clear! The last monster dropped a loot chest.'; }
  // The encounter only plays on the stage — the controls are usable straight away.
  const qTravel = quest && (qPhase === 'walk' || qPhase === 'victory');
  const qReps = fs ? shownReps(ex, fs, st) : '';
  const qPreview = fs && `${fmtW(fs.weight)} kg × ${qReps} reps = ${(kind === 'bfr' ? 1 : Math.round(loadOf(ex.name, fs.weight) * num(qReps))).toLocaleString()} damage${num(qReps) > topRep(ex) ? ' · beat target for a crit' : ''}`;

  return (
    <div className="g-root flex flex-col min-h-full">
      {/* Header */}
      <div className="px-5 pt-3 pb-3">
        <div className="flex justify-between items-end gap-3">
          <div className="min-w-0">
            <div className="g-label truncate">{workout.programName}{quest ? ' · QUEST' : ''}</div>
            <div className="mt-1 truncate" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{workout.workoutName}</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="g-tab" style={{ font: `500 24px ${MONO}`, lineHeight: 1 }}>{elapsed}</div>
            <div className="mt-1 g-label" style={{ letterSpacing: '.12em', fontWeight: 400 }}>{setsLeft} SETS LEFT</div>
          </div>
        </div>
        <div className="flex gap-1 mt-3">
          {blocks.map((b, i) => {
            const p = blockProgress(exercises, b);
            return (
              <button key={i} onClick={() => openBlock(i)} aria-label={`Block ${i + 1}`} className="flex-1 h-1 rounded-[2px] bg-bg-3 overflow-hidden">
                <div className="h-full" style={{ width: `${Math.max(p * 100, i === ci ? 8 : 0)}%`, background: p === 1 ? 'var(--color-success)' : 'var(--color-accent)', transition: 'width .4s cubic-bezier(.2,1.4,.4,1)' }} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 px-3.5 pb-6 flex flex-col gap-2.5">
        {quest && (
          <QuestStage phase={qPhase} start={qStart} monster={mon} hit={qHit} area={Math.min(ci, LANDS.length - 1)}
            heroName={prof.hero} petKey={prof.pet} lvl={qShown.lvl} xp={qShown.xp}
            tint={readTint()} scanlines={readScanlines()} msg={qMsg} goFlash={goFlash} />
        )}
        {qTravel ? (
          <QuestTravel exercises={exercises} blocks={blocks}
            defeated={qPhase === 'victory' || qClear ? ci : ci > 0 && blockDone(exercises, blocks[ci - 1]) ? ci - 1 : -1}
            next={qClear ? -1 : qPhase === 'victory' ? nextOpenBlock(exercises, blocks, ci) : ci}
            walking={qPhase === 'walk' || qPhase === 'victory'}
            intro={introOn ? { left: (introEnd - Date.now()) / 1000, total: 4, label: 'SETTING OFF' }
              : qPhase === 'victory' && !resting && qWin ? { left: (qWin.at + 3800 - Date.now()) / 1000, total: 3.8, label: 'ONWARD' } : null}
            timer={timer} onSkip={introOn ? () => setIntroOff(true) : qPhase === 'victory' ? skipVictory : skipRest}
            onClaim={qClear ? onQuestClear : null} />
        ) : kind === 'cardio' ? (
          // Same swipe handling as the other cards, so cardio blocks cycle too.
          <div
            onPointerDown={pd} onPointerMove={pm} onPointerUp={pu} onPointerCancel={pu} onClickCapture={swallowClick}
            className="relative flex-shrink-0 select-none"
            style={{
              touchAction: dense ? 'pan-y' : 'none',
              transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 40}deg)`,
              transition: drag.anim ? 'transform .3s cubic-bezier(.2,1.2,.3,1)' : 'none',
              opacity: cardMoved ? Math.max(0.4, 1 - cardMoved / 600) : 1,
            }}>
            <CardioCard exercise={ex} exerciseIndex={ei} onUpdateSet={handlers.onUpdateSet}
              onUpdateExercise={handlers.onUpdateCardioExercise} onTimerActiveChange={() => {}}
              focus={{ label: `BLOCK ${ci + 1} OF ${blocks.length}` }} />
          </div>
        ) : (
          <div
            onPointerDown={pd} onPointerMove={pm} onPointerUp={pu} onPointerCancel={pu} onClickCapture={swallowClick}
            className="relative flex-shrink-0 bg-bg-1 rounded-[28px] select-none"
            style={{
              padding: dense ? 16 : 20,
              touchAction: dense ? 'pan-y' : 'none',
              transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 40}deg)`,
              transition: drag.anim ? 'transform .3s cubic-bezier(.2,1.2,.3,1)' : 'none',
              opacity: cardMoved ? Math.max(0.4, 1 - cardMoved / 600) : 1,
            }}>
            {kind === 'superset' && (
              <div className="flex gap-1 p-1 rounded-2xl bg-bg-2 mb-3.5">
                {block.indices.map((xi, k) => {
                  const x = exercises[xi], on = k === m;
                  return (
                    <button key={xi} onClick={() => { setMem(k); setFset(null); }}
                      className="flex-1 min-w-0 flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-[12px] text-left transition-colors"
                      style={{ background: on ? 'var(--color-bg-0)' : 'transparent', color: on ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', boxShadow: on ? 'inset 0 0 0 1.5px var(--g-ss)' : 'none' }}>
                      <span style={{ font: `500 10px ${MONO}`, opacity: 0.7 }}>{letter(k)}</span>
                      <span className="w-full text-[13px] font-bold truncate">{x.name}</span>
                      <span style={{ font: `400 10px ${MONO}`, opacity: 0.7 }}>{x.sets.filter((s) => s.completed).length}/{x.sets.length}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between items-center gap-2">
              <span className="g-label truncate">{quest ? 'ENCOUNTER' : 'BLOCK'} {ci + 1} OF {blocks.length} · {kind === 'interval' ? 'INTERVAL' : `${ex.targetReps}${quest ? ' REPS' : ''}`}{ex.restSeconds ? ` · ${restLabel(ex.restSeconds)}` : ''}</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                {quest && (kind === 'normal' || kind === 'drop')
                  ? <span className="g-tag" style={{ '--tag': resting ? '#f59e0b' : '#ff2222' }}>{resting ? 'ITS TURN' : 'BATTLE'}</span>
                  : <Tag kind={kind} />}
                <button onClick={() => setEditOpen(true)} aria-label="Edit exercise" className="w-8 h-8 -my-2 -mr-1 rounded-[8px] text-text-tertiary active:bg-bg-2" style={{ font: `700 16px ${MONO}` }}>⋯</button>
              </span>
            </div>
            {!quest && (
              <div style={{ marginTop: 10, fontSize: dense ? 24 : 30, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.02 }}>
                {ex.substituted && <span className="text-text-tertiary line-through mr-2" style={{ fontSize: '0.6em' }}>{ex.substituted.original}</span>}
                <TypewriterName text={ex.name} />
              </div>
            )}
            <div className="mt-1.5 g-meta">{lastLine}</div>

            {!dense && kind !== 'interval' && (
              <div className="flex gap-[5px] mt-4 items-center">
                {ex.sets.map((s, i) => {
                  const on = i === fi, small = s.type === 'drop';
                  return (
                    <button key={i} onClick={() => setFset(i)}
                      style={{
                        flex: small ? '0 0 16px' : 1, height: small ? 20 : 34, borderRadius: small ? 7 : 12, padding: 0,
                        font: `500 12px ${MONO}`, transition: 'all .2s',
                        border: `1.5px solid ${on ? tagColor : 'transparent'}`,
                        background: s.completed ? 'var(--color-success)' : small ? 'color-mix(in srgb, var(--g-drop) 25%, transparent)' : 'var(--color-bg-2)',
                        color: s.completed ? '#fff' : on ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                        animation: s.completed ? 'fx-pop .35s cubic-bezier(.2,1.6,.4,1)' : 'none',
                      }}>
                      {s.completed ? '✓' : small ? '' : setLabel(ex.sets, i)}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Focus: rest and the steppers share one grid cell, both always
                laid out, so the card is the same size in either state and the
                bottom button lands in the same place. Only one is visible. */}
            {!dense && kind !== 'interval' && fs && (
              <div className="grid mt-4">
                <div key={`rest-${resting}`} aria-hidden={!resting} className="flex flex-col" style={{ gridArea: '1 / 1', visibility: resting ? 'visible' : 'hidden', animation: resting ? 'fx-pop .4s cubic-bezier(.2,1.4,.4,1) both' : 'none' }}>
                  {quest ? <QuestRest timer={timer} next={restNext} onSkip={skipRest} /> : <RestRing timer={timer} next={restNext} onSkip={skipRest} />}
                </div>
                <div key={`set-${resting}`} aria-hidden={resting} className="flex flex-col" style={{ gridArea: '1 / 1', visibility: resting ? 'hidden' : 'visible', animation: resting ? 'none' : 'fx-fade .25s both' }}>
                  <div className="grid grid-cols-2 gap-2.5 flex-1">
                    <Stepper label={quest ? 'KG · POWER' : 'KG'} value={fmtW(fs.weight)} onDec={() => step(ei, fi, 'weight', -2.5)} onInc={() => step(ei, fi, 'weight', 2.5)} />
                    <Stepper label={quest ? 'REPS · HITS' : 'REPS'} value={shownReps(ex, fs, st)} onDec={() => step(ei, fi, 'reps', -1)} onInc={() => step(ei, fi, 'reps', 1)} />
                  </div>
                  {kind === 'bfr' && !fs.completed && (
                    <BFRBlock set={fs}
                      onStart={() => patchSet(ei, fi, { bfrStartMs: Date.now() })}
                      onStop={() => patchSet(ei, fi, { bfrStartMs: null })}
                      onDone={() => complete(ei, fi)} />
                  )}
                  {(!isTimed || (kind === 'bfr' && fs.completed)) && (
                    <button onClick={() => complete(ei, fi)}
                      className="mt-3.5 w-full h-[62px] rounded-[20px] font-extrabold text-[17px] transition-colors active:scale-[.98]"
                      style={{ background: fs.completed ? 'var(--g-ok-soft)' : 'var(--color-accent)', color: fs.completed ? 'var(--color-success)' : 'var(--color-on-accent)' }}>
                      {completeLabel}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Dense: rest strip + every set as a row */}
            {dense && resting && kind !== 'interval' && <RestStrip timer={timer} onSkip={skipRest} />}
            {dense && kind !== 'interval' && (
              <>
                <div className="grid gap-1.5 mt-3 text-center" style={{ gridTemplateColumns: '30px minmax(0,1fr) minmax(0,1fr) 40px', font: `500 9px ${MONO}`, letterSpacing: '.12em', color: 'var(--color-text-tertiary)' }}>
                  <span>SET</span><span>KG</span><span>REPS</span><span />
                </div>
                <div className="flex flex-col gap-1 mt-1">
                  {ex.sets.map((s, i) => {
                    const on = i === fi;
                    const pill = (field, val) => (
                      <div className="flex items-center bg-bg-2 rounded-[11px] h-10">
                        <button onClick={() => step(ei, i, field, field === 'weight' ? -2.5 : -1)} className="w-7 h-10 text-text-tertiary" style={{ font: `500 15px ${MONO}` }}>−</button>
                        <span className="flex-1 text-center g-tab truncate" style={{ fontSize: val.length > 5 ? 12 : 17, fontWeight: 800 }}>{val}</span>
                        <button onClick={() => step(ei, i, field, field === 'weight' ? 2.5 : 1)} className="w-7 h-10 text-text-tertiary" style={{ font: `500 15px ${MONO}` }}>+</button>
                      </div>
                    );
                    return (
                      <div key={i} className="grid gap-1.5 items-center py-[3px] rounded-[12px] transition-opacity"
                        style={{ gridTemplateColumns: '30px minmax(0,1fr) minmax(0,1fr) 40px', opacity: s.completed && !on ? 0.55 : 1, color: s.completed ? 'var(--color-success)' : 'var(--color-text-primary)' }}>
                        <span className="text-center" style={{ font: `500 12px ${MONO}`, color: s.type === 'drop' ? 'var(--g-drop)' : 'var(--color-text-tertiary)' }}>{setLabel(ex.sets, i)}</span>
                        {pill('weight', fmtW(s.weight))}
                        {pill('reps', shownReps(ex, s, st))}
                        {s.type === 'bfr' && !s.completed ? (
                          <button onClick={() => { setFset(i); }} className="w-10 h-10 rounded-[12px]" style={{ border: `1.5px solid ${on ? 'var(--g-bfr)' : 'var(--color-bg-3)'}`, color: 'var(--g-bfr)', font: `600 9px ${MONO}` }}>BFR</button>
                        ) : (
                          <button onClick={() => complete(ei, i)} className="w-10 h-10 rounded-[12px] text-white font-bold"
                            style={{ border: s.completed ? 'none' : `1.5px solid ${on ? 'var(--color-accent)' : 'var(--color-bg-3)'}`, background: s.completed ? 'var(--color-success)' : 'transparent', animation: s.completed ? 'fx-pop .35s cubic-bezier(.2,1.6,.4,1)' : 'none' }}>
                            {s.completed ? '✓' : ''}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {dense && kind === 'bfr' && fs && !resting && !fs.completed && (
              <BFRBlock set={fs}
                onStart={() => patchSet(ei, fi, { bfrStartMs: Date.now() })}
                onStop={() => patchSet(ei, fi, { bfrStartMs: null })}
                onDone={() => complete(ei, fi)} />
            )}
            {kind === 'interval' && fs && (
              <>
                {ex.sets.length > 1 && (
                  <div className="flex gap-[5px] mt-4">
                    {ex.sets.map((s, i) => (
                      <button key={i} onClick={() => setFset(i)} className="flex-1 h-[34px] rounded-[12px]"
                        style={{ font: `500 12px ${MONO}`, border: `1.5px solid ${i === fi ? 'var(--g-int)' : 'transparent'}`, background: s.completed ? 'var(--color-success)' : 'var(--color-bg-2)', color: s.completed ? '#fff' : 'var(--color-text-tertiary)' }}>
                        {s.completed ? '✓' : i + 1}
                      </button>
                    ))}
                  </div>
                )}
                {resting && <RestStrip timer={timer} onSkip={skipRest} />}
                <IntervalBlock key={`${ei}-${fi}`} set={fs}
                  onStamp={(p) => patchSet(ei, fi, p)}
                  onDone={() => complete(ei, fi)} />
              </>
            )}

            <div className="mt-3 text-center text-text-tertiary" style={{ font: `400 10px ${MONO}`, letterSpacing: '.06em' }}>
              {quest && qPreview && kind !== 'interval' ? qPreview : dense ? '← → exercises' : '← → sets · ↑ ↓ exercises'}
            </div>

            {goFlash && !quest && (
              // The panel only fades, clipped to the card; just the word pops, so
              // nothing grows past the card edge or slips under its contents.
              <div key={goAt} className="absolute inset-0 z-20 rounded-[28px] overflow-hidden bg-accent flex items-center justify-center pointer-events-none"
                style={{ animation: 'fx-flash-bg .8s ease both' }}>
                <span style={{ color: 'var(--color-on-accent)', fontSize: 96, fontWeight: 800, letterSpacing: '-0.05em', animation: 'fx-flash .8s cubic-bezier(.2,1.2,.3,1) both' }}>GO</span>
              </div>
            )}
            {toast && (
              <ToastPR key={toast.at} text={toast.text} onDone={() => setToast(null)} />
            )}
          </div>
        )}

        {!dense && !qTravel && nx >= 0 && nx !== ci && (
          <button onClick={() => openBlock(nx)} className="flex-shrink-0 flex items-center gap-3 px-[18px] py-4 rounded-[22px] bg-bg-1 text-left opacity-85">
            <div className="flex-1 min-w-0">
              <div className="g-label">UP NEXT</div>
              <div className="mt-1 text-base font-bold truncate">{blockName(exercises, blocks[nx])}</div>
            </div>
            <span className="text-text-tertiary flex-shrink-0" style={{ font: `400 11px ${MONO}` }}>
              {TAGS[blocks[nx].kind] ? TAGS[blocks[nx].kind][0].toLowerCase() : `${exercises[blocks[nx].indices[0]].sets.length} × ${exercises[blocks[nx].indices[0]].targetReps}`}
            </span>
          </button>
        )}
        {dense && blocks.length > 1 && (
          <div className="flex-shrink-0 flex flex-col gap-0.5 bg-bg-1 rounded-[22px] p-1.5">
            {blocks.map((b, i) => {
              if (i === ci) return null;
              const done = blockDone(exercises, b);
              const all = b.indices.reduce((a, x) => a + exercises[x].sets.length, 0);
              const d = b.indices.reduce((a, x) => a + exercises[x].sets.filter((s) => s.completed).length, 0);
              const b0 = exercises[b.indices[0]];
              return (
                <button key={i} onClick={() => openBlock(i)} className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-left" style={{ opacity: done ? 0.5 : 1 }}>
                  <span className="w-5 text-text-tertiary" style={{ font: `500 11px ${MONO}` }}>{String(i + 1).padStart(2, '0')}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{blockName(exercises, b)}</div>
                    <div className="mt-px text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>{TAGS[b.kind] ? TAGS[b.kind][0].toLowerCase() : `${b0.sets.length} × ${b0.targetReps}`}</div>
                  </div>
                  <span className="min-w-9 text-center px-1.5 py-1 rounded-[9px]" style={{ font: `500 11px ${MONO}`, background: done ? 'var(--g-ok-soft)' : 'var(--color-bg-2)', color: done ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                    {done ? '✓' : `${d}/${all}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 flex-shrink-0">
          <button onClick={onFinish} className="flex-1 h-[50px] rounded-[18px] bg-bg-1 text-success font-bold text-[15px]">Finish workout</button>
          <button onClick={onCancel} aria-label="Cancel workout" className="w-[50px] h-[50px] rounded-[18px] text-error" style={{ font: `600 15px ${MONO}`, background: 'color-mix(in srgb, var(--color-error) 14%, var(--color-bg-1))' }}>✕</button>
        </div>
      </div>

      {handoff && (
        <Handoff exercises={exercises} blocks={blocks} from={handoff.from} to={handoff.to} stats={stats}
          onGo={() => { openBlock(handoff.to); setHandoff(null); }} />
      )}
      <EditSheet open={editOpen} onClose={() => setEditOpen(false)} ex={ex} ei={ei} exercises={exercises}
        handlers={handlers} onAddExercise={onAddExercise} />
    </div>
  );
}

function ToastPR({ text, onDone }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => { const t = setTimeout(() => done.current(), 2400); return () => clearTimeout(t); }, []);
  return (
    <div className="absolute z-30 left-4 right-4 top-3.5 px-3.5 py-3 rounded-2xl flex items-center gap-2.5 pointer-events-none"
      style={{ background: 'var(--color-pr)', color: '#1f1400', animation: 'fx-toast 2.4s both', boxShadow: '0 10px 30px rgba(0,0,0,.3)' }}>
      <span style={{ font: `800 10px ${MONO}`, letterSpacing: '.16em' }}>NEW PR</span>
      <span className="text-[15px] font-extrabold truncate">{text}</span>
    </div>
  );
}
