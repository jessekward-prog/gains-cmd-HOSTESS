import { Fragment, useState, useMemo, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useGlobalTimer } from '../context/TimerContext';
import { useHaptics } from '../hooks/useHaptics';
import { useRepSensorCtx } from '../context/RepSensorContext';
import useBackHandler from '../hooks/useBackHandler';
import CardioCard from './CardioCard';
import Modal from './Modal';
import RestPickerModal from './RestPickerModal';
import SpecialSetModal from './SpecialSetModal';
import SubstituteModal from './SubstituteModal';
import { EXERCISE_LIST_ID } from './ExerciseNameOptions';
import ExerciseNotes from './ExerciseNotes';
import TypewriterName from './TypewriterName';
import Ticker from './Ticker';
import { computePhase, playBeep, vibrate, COUNT_IN_SEC } from './IntervalTimerBar';
import { useWakeLock } from './BFRTimerBar';
import {
  TAGS, num, fmtW, restLabel, mmss, buildBlocks, blockDone, blockProgress, blockName,
  nextOpenBlock, focusIndex, setLabel, liftStats, isPR, isAssisted,
} from '../lib/focus';
import { nextMemberForRound, roundOfSet, setIndexForRound, supersetRounds } from '../lib/supersets';
import { moodState } from '../lib/mood';
import ExerciseInfo from './ExerciseInfo';
import QuestStage from './QuestStage';
import { AsciiReveal } from 'ascii-reveal';
import RepScope, { RepTag, repTracking } from './RepScope';
import useQuest, { readTint, readScanlines, readScrolls, readQuestFx } from '../hooks/useQuest';
import {
  monsterOf, questSession, blockXp, addXp, unlocks, xpMult, setDamage, isCrit, topRep, landsOf, comboXp,
  EVENTS, EVENT_LINES, VICTORY_LINES, REST_LINES, planEvents, eventLoad, eventDone, seeded, fillLine, weekKey,
  recordBossFight, BOSS_GROUPS, BOSS_GROUP_SETS, bossSprite, TINTS, titleCase, ASSET,
} from '../lib/quest';
import useCatalog from '../hooks/useCatalog';
import { guess, gifUrl } from '../lib/catalog';
import useWeeklyBoss from '../hooks/useWeeklyBoss';
import * as api from '../lib/api';
import { useWorkout } from '../context/WorkoutContext';
import { useTheme } from '../context/ThemeContext';
import { aggressionOf, acceptLevelUp, snoozeLevelUp } from '../lib/levelup';

const MONO = 'var(--font-mono)';
const letter = (k) => 'ABCD'[k] || String(k + 1);
const lowRep = (ex) => parseInt(String(ex.targetReps || ex.repRange || '').match(/\d+/)?.[0]) || 8;
const DROP_REPS = [9, 7, 6, 5];
const FOCUS_AT_KEY = 'gains-beta-focus-at';
// The card's size cap, per layout. Measuring a "master" card was never stable
// — a strength card's own height moves with the rest view (whether there's a
// next set), how the meta line wraps and the block kind — so the card takes a
// set size instead and its set/rest box absorbs the slack. It also shrinks
// below the cap to whatever is left between the battle screen and the
// finish row, so those buttons are always on screen without scrolling.
// Dense keeps its natural height: it lists every set as a row.
const CARD_H = { quest: 392, focus: 450 };
// …and the floor it won't go under, below which the card's own controls start to
// clip. Under this the page scrolls again (a short screen can't have both).
const CARD_MIN = { quest: 290, focus: 360 };
// How long a quest hit plays: a drop chain strikes once per set.
const hitDur = (h) => (h ? (h.chain > 1 ? 0.6 + 0.45 * h.chain : 1.5) : 0);
const COMBO_GAP_MS = 150000; // a set logged within this of going live keeps the combo
const DOZE_MS = 180000;      // live this long with nothing logged → the monster dozes
const COMBO_TIP_KEY = 'gains-beta-combo-tips'; // how many times the full combo explainer has shown
const COMBO_TIP_TIMES = 3;

// What the reps panel shows before the lifter has touched it: last session's
// reps (or the bottom of the range), "failure" for failure sets and for drops
// left in their default failure mode.
function defaultReps(ex, s, stats) {
  if (s.type === 'timed') return '';
  if (s.type === 'drop') return s.dropMode === 'fixed' ? String(DROP_REPS[s.dropIndex ?? 0] ?? 5) : 'failure';
  if (s.reps === 'failure') return 'failure';
  return String(stats?.lr ?? lowRep(ex));
}
const shownReps = (ex, s, stats) => (s.reps !== '' && s.reps != null ? String(s.reps) : defaultReps(ex, s, stats));
const roundW = (x) => String(Math.round(Math.max(0, x) * 100) / 100);

// A working set and the drops hanging off it, done back-to-back with the phone
// down — so Focus shows and logs the whole chain at once. null when no drops.
function dropChain(sets, i) {
  let a = i;
  while (a > 0 && sets[a]?.type === 'drop') a--;
  let b = a;
  while (sets[b + 1]?.type === 'drop') b++;
  return b > a ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : null;
}
// The last 10 s of any rest blink the clock red; the keyframe is in index.css.
const last10 = (sec) => (sec > 0 && sec <= 10 ? ' q-last10' : '');

// A drop with no weight yet suggests ~80% of the step before it.
function shownWeight(sets, j) {
  const s = sets[j];
  if (s?.type !== 'drop' || (s.weight !== '' && s.weight != null) || j === 0) return s?.weight ?? '';
  const prev = num(shownWeight(sets, j - 1));
  return prev > 0 ? roundW(Math.round(prev * 0.8 / 2.5) * 2.5) : '';
}

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

// ── Typing an exact weight ──────────────────────────────────────────
// The ± step 2.5 kg, which a machine that goes up in 1s can't reach. The KG
// cell carries a TYPE chip in the same slot (and the same shape) as the reps
// cell's TO FAIL, and the number itself is tappable; either opens a keypad in
// a sheet at the bottom of the screen, where a keyboard would come up. Reps
// are unchanged.
const VAL_STYLE = (small) => ({
  fontSize: small ? 'clamp(18px, 16cqh, 30px)' : 'clamp(26px, 34cqh, 64px)',
  fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1,
  margin: 'clamp(2px, 2cqh, 6px) 0 clamp(4px, 3cqh, 10px)',
});

// The keypad itself.
function Keypad({ value, onChange, onDone, onCancel, label = 'KG', placeholder }) {
  const key = (k) => {
    if (k === '⌫') return onChange(value.slice(0, -1));
    if (k === '.' && value.includes('.')) return;
    if (value.length >= 6) return;
    onChange((value === '0' && k !== '.' ? '' : value) + k);
  };
  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="rounded-[18px] bg-bg-2 px-4 flex items-baseline justify-center gap-2 flex-shrink-0" style={{ paddingTop: 'clamp(4px, 2cqh, 10px)', paddingBottom: 'clamp(4px, 2cqh, 10px)' }}>
        <span className="g-tab" style={{ fontSize: 'clamp(26px, 9cqh, 34px)', fontWeight: 800, letterSpacing: '-0.03em', color: value ? undefined : 'var(--color-text-tertiary)' }}>{value || placeholder || '0'}</span>
        <span className="g-label">{label}</span>
      </div>
      {/* rows share whatever height is left, so the pad fits a short card too */}
      <div className="grid grid-cols-3 gap-1.5 flex-1 min-h-0" style={{ gridTemplateRows: 'repeat(4, minmax(0, 1fr))' }}>
        {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map((k) => (
          <button key={k} onClick={() => key(k)}
            className="rounded-[14px] bg-bg-2 text-text-primary active:scale-95 transition-transform min-h-0"
            style={{ font: `500 clamp(16px, 5cqh, 20px) ${MONO}` }}>{k}</button>
        ))}
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={onCancel} className="flex-1 rounded-[16px] bg-bg-2 text-text-secondary font-bold text-[14px]" style={{ height: 'clamp(38px, 12cqh, 46px)' }}>Cancel</button>
        <button onClick={onDone} className="flex-[2] rounded-[16px] font-extrabold text-[15px]" style={{ height: 'clamp(38px, 12cqh, 46px)', background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}>Set {label.toLowerCase()}</button>
      </div>
    </div>
  );
}

// ── Focus steppers ──────────────────────────────────────────────────
function Stepper({ label, value, onDec, onInc, toggle, onKeypad, live = false }) {
  const small = value.length > 5;
  // The weight cell gets the TYPE chip and a tappable number; the reps cell
  // passes its own toggle and keeps its plain one.
  const chip = toggle || (onKeypad ? { label: 'TYPE', onClick: onKeypad } : null);
  // Live: the rep tracker is filling this box as the reps happen.
  const valStyle = live ? { ...VAL_STYLE(small), color: '#ff2222', textShadow: '0 0 14px rgba(255,34,34,.55)' } : VAL_STYLE(small);
  return (
    <div className="g-step bg-bg-2 rounded-[18px] px-2.5 py-3 text-center flex flex-col min-h-0 overflow-hidden">
      <div className="g-label flex items-center justify-center gap-2">
        {label}
        {live && <span className="rep-rec-dot" style={{ font: `700 9px ${MONO}`, letterSpacing: '.08em', color: '#ff2222' }}>● LIVE</span>}
        {chip && <button onClick={chip.onClick} className="px-2 py-0.5 rounded-full bg-bg-3 text-text-secondary active:scale-95 transition-transform" style={{ font: `600 9px ${MONO}`, letterSpacing: '.08em' }}>{chip.label}</button>}
      </div>
      <div className="g-step-body flex-1 min-h-0 flex flex-col">
        {onKeypad ? (
          <button onClick={onKeypad} data-long={small || undefined} className="g-step-val flex-1 min-h-0 min-w-0 flex items-center justify-center g-tab" style={valStyle}>{value}</button>
        ) : (
          <div data-long={small || undefined} className="g-step-val flex-1 min-h-0 min-w-0 flex items-center justify-center g-tab" style={valStyle}>{value}</div>
        )}
        <div className="g-step-btns flex gap-1.5">
          <button onClick={onDec} className="g-step-btn flex-1 rounded-[12px] bg-bg-3 text-text-primary active:scale-95 transition-transform" style={{ height: 'clamp(34px, 20cqh, 56px)', font: `500 20px ${MONO}` }}>−</button>
          <button onClick={onInc} className="g-step-btn flex-1 rounded-[12px] bg-bg-3 text-text-primary active:scale-95 transition-transform" style={{ height: 'clamp(34px, 20cqh, 56px)', font: `500 20px ${MONO}` }}>+</button>
        </div>
      </div>
    </div>
  );
}

// Rows of weight/reps pills, one button logging them all: a drop chain (top
// set first, each step its own weight and reps) or a superset round (A then B,
// drops under their own exercise, the exercise name in a wider label column).
// The exercise you're on: a full-width band in the superset blue, with faint
// CRT lines over it so it reads as lit rather than just tinted.
const SCANLINES = 'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 1px, transparent 1px, transparent 3px)';
const SS_BAND = `${SCANLINES}, color-mix(in srgb, var(--g-ss) 22%, var(--color-bg-2))`;

function DropChain({ rows, wide = false }) {
  const cols = `${wide ? '96px' : '30px'} minmax(0,1fr) minmax(0,1fr)`;
  const vFont = (val) => (val.length > 5 ? 15 : 22);
  const pill = (r, field, val) => {
    const live = field === 'reps' && r.live;
    const vStyle = { fontSize: vFont(val), fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, ...(live ? { color: '#ff2222', textShadow: '0 0 14px rgba(255,34,34,.55)' } : {}) };
    return (
      <div className="flex items-center bg-bg-3 rounded-[12px] h-full max-h-12 min-w-0">
        <button onClick={() => r.onStep(field, field === 'weight' ? -2.5 : -1)} aria-label={`Less ${field}`} className="w-8 flex-shrink-0 h-full text-text-tertiary active:scale-90 transition-transform" style={{ font: `500 18px ${MONO}` }}>−</button>
        {field === 'reps'
          ? <button onClick={r.onToggleFail} aria-label={val === 'failure' ? 'Switch to reps' : 'Switch to failure'} className="flex-1 min-w-0 text-center g-tab truncate" style={vStyle}>{val}</button>
          : <span className="flex-1 text-center g-tab truncate" style={vStyle}>{val}</span>}
        <button onClick={() => r.onStep(field, field === 'weight' ? 2.5 : 1)} aria-label={`More ${field}`} className="w-8 flex-shrink-0 h-full text-text-tertiary active:scale-90 transition-transform" style={{ font: `500 18px ${MONO}` }}>+</button>
      </div>
    );
  };
  // Quest's card leaves this box ~96px, so the bands and the gaps between them
  // are sized to fit there, and grow into Focus's taller card.
  return (
    <div className={`${wide ? '' : 'bg-bg-2 rounded-[18px] p-2.5'} flex-1 min-h-0 overflow-y-auto flex flex-col`}>
      <div className={`flex flex-col ${wide ? 'flex-1 min-h-0 justify-center gap-1.5' : 'my-auto gap-1'}`}>
      <div className={`grid gap-2 px-2.5 text-center g-label`} style={{ gridTemplateColumns: cols }}>
        <span /><span>KG</span><span>REPS</span>
      </div>
      {rows.map((r) => (
        <Fragment key={r.key}>
          <div className={`grid gap-2 items-center flex-1 transition-colors ${wide ? 'max-h-16 px-2.5 py-1.5 min-h-[22px] rounded-[16px] bg-bg-2' : 'max-h-12 px-1.5 py-0.5 rounded-[14px] min-h-[30px]'}`}
            style={{ gridTemplateColumns: cols, opacity: r.done ? 0.5 : r.active === false ? 0.65 : 1,
              ...(!r.active ? {} : wide ? { background: SS_BAND } : { background: 'var(--color-bg-0)', boxShadow: 'inset 0 0 0 1.5px var(--g-ss)' }) }}>
            <span className={wide ? 'text-left' : 'text-center'} style={{ font: `700 ${wide ? 13 : 11}px ${MONO}`, color: r.drop ? 'var(--g-drop)' : r.done ? 'var(--color-success)' : wide ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', ...(wide ? { lineHeight: 1.08, maxHeight: '2.16em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}) }}>{r.label}</span>
            {pill(r, 'weight', r.weight)}
            {pill(r, 'reps', r.reps)}
          </div>
        </Fragment>
      ))}
      </div>
    </div>
  );
}

// ── Superset A/B switch ─────────────────────────────────────────────
// The lit pill is one element that slides between members, so a hand-off has
// something on screen that visibly moves. Same switch in Focus and Dense.
function SupersetTabs({ exercises, indices, m, onPick, className = '' }) {
  const pill = useId();
  const reduce = useReducedMotion();
  return (
    <div className={`flex gap-1 p-1 rounded-2xl bg-bg-2 ${className}`}>
      {indices.map((xi, k) => {
        const x = exercises[xi], on = k === m;
        return (
          <button key={xi} onClick={() => onPick(k)}
            className="relative flex-1 min-w-0 flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-[12px] text-left transition-colors"
            style={{ color: on ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
            {on && (
              <motion.span layoutId={pill} aria-hidden
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 440, damping: 36 }}
                className="absolute inset-0 rounded-[12px]"
                style={{ background: 'var(--color-bg-0)', boxShadow: 'inset 0 0 0 1.5px var(--g-ss)' }} />
            )}
            <span className="relative" style={{ font: `500 10px ${MONO}`, opacity: 0.7 }}>{letter(k)}</span>
            <span className="relative w-full text-[13px] font-bold truncate">{x.name}</span>
            <span className="relative" style={{ font: `400 10px ${MONO}`, opacity: 0.7 }}>{x.sets.filter((s) => s.completed).length}/{x.sets.length}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Rest: big ring (Focus) or strip (Dense) ─────────────────────────
// The GO card's image flash: one pass of its 10-frame sequence, 80 ms a frame,
// never looped: after the last one the picture holds, glitching, for GO_HOLD
// while GO stays over it. The files are ASCII art, not photographs: each is
// rendered to a 52-column grid of monospace glyphs off the ' .:-=+*#%@' ramp and
// thresholded to 1-bit, so the card is lit type rather than a dithered picture.
// The red filter sits over them, and the glyphs leave enough bare card that the
// red reads as the dominant colour.
const GO_SEQ = [['01-hacker', '50% 50%'], ['02-wail', '50% 35%'], ['03-eye', '50% 45%'], ['04-skull', '50% 40%'], ['05-saint', '50% 30%'],
  ['06-archer', '50% 40%'], ['02-wail', '50% 35%'], ['03-eye', '50% 45%'], ['04-skull', '50% 40%'], ['05-saint', '50% 30%']];
const GO_SRC = (n) => `${ASSET}goflash/${n}.webp`;
const GO_RUN = 800;                       // the frames
const GO_HOLD = 1000;                     // then red and GO alone, no images
const GO_MS = GO_RUN + GO_HOLD;           // how long the card is up in all
const GO_STEP = GO_RUN / GO_SEQ.length;
const GO_RED_HEX = '#d4181d';             // the filter's red, a shade under the old flash red
const GO_RED = 0.6;                       // and how strongly it sits over the frames
const goReduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Every frame is in the DOM from the first render, so nothing swaps src
// mid-flash — only visibility moves. Decorative: out of the accessibility tree.
// Reduced motion holds frame 1 throughout: 12.5 changes/s is past WCAG's three.
function GoFlash() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (goReduceMotion) return undefined;
    const id = setInterval(() => setI((n) => Math.min(n + 1, GO_SEQ.length - 1)), GO_STEP);
    return () => clearInterval(id);
  }, []);
  return GO_SEQ.map(([n, pos], k) => (
    <div key={k} className="absolute inset-0" aria-hidden="true" style={{ visibility: k === i ? 'visible' : 'hidden' }}>
      <img src={GO_SRC(n)} alt="" className="absolute inset-0 w-full h-full go-vhs"
        style={{ objectFit: 'cover', objectPosition: pos, imageRendering: 'pixelated' }} />
      {/* the tracking band: the same picture, blown out and slipped sideways,
          clipped to a strip that jumps down the card */}
      <div className="absolute inset-0 go-vhs-tear"
        style={{ backgroundImage: `url(${GO_SRC(n)})`, backgroundSize: 'cover', backgroundPosition: pos, imageRendering: 'pixelated' }} />
    </div>
  ));
}

function RestRing({ timer, next, onSkip }) {
  const left = timer.total > 0 ? timer.remaining / timer.total : 0;
  return (
    <div className="h-full flex flex-col items-center">
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
      <div className="relative flex-1 min-h-0" style={{ aspectRatio: '1', maxHeight: 200, minHeight: 104 }}>
        <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full -rotate-90">
          {/* 60 ticks cut out of the ring by a dashed mask, so the arc still drains smoothly. */}
          <mask id="rest-ticks">
            <circle cx="100" cy="100" r="90" fill="none" stroke="#fff" strokeWidth="12" strokeDasharray="6.42 3" />
          </mask>
          <g mask="url(#rest-ticks)" className="rest-ring-ticks">
            <circle cx="100" cy="100" r="90" fill="none" stroke="var(--color-bg-3)" strokeWidth="10" />
            <circle cx="100" cy="100" r="90" fill="none" stroke="var(--g-timer)" strokeWidth="10"
              strokeDasharray="565.5" strokeDashoffset={565.5 * (1 - left)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="g-label" style={{ letterSpacing: '.16em' }}>REST</span>
          <span className={`g-tab${last10(timer.remaining)}`} style={{ fontSize: 'clamp(30px, 17cqh, 52px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05 }}>{mmss(timer.remaining)}</span>
        </div>
      </div>
      {next && (
        <div className="mt-4 text-center q-rest-next">
          <div className="g-label q-rest-next-label">NEXT{next.tag ? ` · ${next.tag}` : ''}</div>
          <div className="mt-1.5 max-w-[300px] truncate q-rest-next-name" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{next.name}</div>
          <div className="mt-1 g-tab text-text-secondary q-rest-next-load" style={{ font: `500 18px ${MONO}` }}>{next.load}</div>
        </div>
      )}
      </div>
      <div className="flex gap-2 w-full mt-3.5 q-rest-btns">
        <button onClick={() => timer.extend(15)} className="flex-1 h-[50px] rounded-[18px] bg-bg-2 text-text-primary font-bold text-[15px]"><Glyph k="s" />+15s</button>
        <button onClick={onSkip} className="flex-[2] h-[50px] rounded-[18px] bg-accent q-cta font-extrabold text-[15px]" style={{ color: 'var(--color-on-accent)' }}><Glyph k="c" />Skip rest</button>
      </div>
    </div>
  );
}

// ── Quest Mode panels (the handoff's ctlRest / ctlTravel) ────────────
// The class hooks (q-rest-*) are what index.css's container query shrinks when
// the card is short: the flavour scroll goes first, then the next-set block
// tightens, so the clock and the buttons are never the thing that gets cut.
// The AI's taunt wraps a real form tip ("Even <tip> won't help you now."); the
// rest card shows the tip on its own, since the cut-in has already said the taunt.
const tipOf = (line) => {
  const m = /^Even (.+) won't (?:help you now|save you from me)\.$/.exec(line);
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)}.` : line;
};

// The card's title already names the exercise and its tag says REST, so the
// rest view is just the clock, the next set and the tip.
function QuestRest({ timer, next, onSkip, scroll }) {
  const done = timer.total > 0 ? 1 - timer.remaining / timer.total : 0;
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center pt-2 pb-1">
        <span className={`g-tab q-rest-time${last10(timer.remaining)}`} style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05 }}>{mmss(timer.remaining)}</span>
        <div className="w-full h-1 rounded-[2px] bg-bg-3 mt-2 overflow-hidden">
          <div className="h-full" style={{ background: 'var(--g-timer)', width: `${done * 100}%`, transition: 'width 1s linear' }} />
        </div>
        {next && (
          <div className="mt-2 text-center w-full truncate q-rest-next-name" style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            {next.tag[0]}{next.tag.slice(1).toLowerCase()} · <span className="g-tab text-text-secondary" style={{ font: `500 17px ${MONO}` }}>{next.load}</span>
          </div>
        )}
        {/* Always takes its two lines, so the rest view is one fixed size. */}
        <div className="mt-2 px-3.5 py-2 rounded-[14px] text-center text-text-secondary w-full flex items-center justify-center q-rest-scroll" style={{ background: 'var(--color-bg-2)', font: `400 12px/1.5 ${MONO}`, height: 50, ...(scroll ? {} : { visibility: 'hidden' }) }}>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textWrap: 'pretty' }}>{scroll}</span>
        </div>
      </div>
      <div className="flex gap-2 w-full mt-3.5 q-rest-btns">
        <button onClick={() => timer.extend(15)} className="flex-1 h-[50px] rounded-[18px] bg-bg-2 text-text-primary font-bold text-[15px]"><Glyph k="s" />+15s</button>
        <button onClick={onSkip} className="flex-[2] h-[50px] rounded-[18px] bg-accent q-cta font-extrabold text-[15px]" style={{ color: 'var(--color-on-accent)' }}><Glyph k="c" />Skip rest</button>
      </div>
    </div>
  );
}

// What to set the bar to for an exercise's first set. '' is "not planned yet",
// which is not the same as 0 — that one really is bodyweight.
const loadLabel = (e) => {
  const w = e?.sets?.[0]?.weight;
  if (w === '' || w == null) return '—';
  return num(w) === 0 ? 'BW' : `${fmtW(w)} kg`;
};

function QuestTravel({ exercises, blocks, defeated, next, walking, intro, timer, onSkip, onClaim }) {
  const d = defeated >= 0 ? blocks[defeated] : null;
  const dSets = d ? d.indices.flatMap((i) => exercises[i].sets.filter((s) => s.completed)) : [];
  const dVol = dSets.reduce((a, s) => a + num(s.weight) * num(s.reps), 0);
  const n = next >= 0 ? blocks[next] : null, n0 = n && exercises[n.indices[0]];
  const left = intro ? Math.max(0, intro.left) : timer.remaining, total = intro ? intro.total : timer.total;
  const { settings } = useWorkout();
  const cat = useCatalog();
  // One column per member of the next block, so a superset shows both movements
  // instead of only the first. Art: the user's own link, then an exact match,
  // then a fuzzy guess — most hand-typed names ("Chest fly machine") don't
  // exact-match the library, so without the fuzzy step the frame is almost
  // always blank. `guess` drops a weak one rather than show the wrong movement;
  // the ExerciseInfo modal is still the way to pin a name by hand.
  const upNext = n && n.kind !== 'cardio'
    ? n.indices.map((i) => exercises[i]).filter(Boolean)
      .map((e) => ({ e, art: cat ? guess(e.name, settings?.exerciseLinks || {}, cat) : null }))
    : [];
  return (
    <div className="flex-1 bg-bg-1 rounded-[28px] p-5 flex flex-col">
      <div className="flex-1 flex flex-col min-h-0">
      {d && (
        <>
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full flex items-center justify-center font-bold flex-shrink-0" style={{ background: 'var(--g-ok)', color: 'var(--g-ok-ink)' }}>✓</span>
            <div className="min-w-0">
              <div className="text-base font-bold text-text-secondary truncate">{blockName(exercises, d)} defeated</div>
              <div className="mt-0.5 text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{dSets.length} sets · {Math.round(dVol).toLocaleString()} kg moved</div>
            </div>
          </div>
          {n && <div className="h-px bg-bg-3 my-3" />}
        </>
      )}
      {n && (
        <>
          <div className="flex justify-between items-center">
            <span className="text-accent" style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em' }}>NEXT ENCOUNTER · {next + 1} OF {blocks.length}</span>
            <span className="px-2 py-1 rounded-[8px] bg-bg-2 text-text-secondary" style={{ font: `600 10px ${MONO}`, letterSpacing: '.12em' }}>LV {Math.round(num(n0.sets[0]?.weight)) || '—'}</span>
          </div>
          <div className="mt-1.5" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, textWrap: 'balance' }}>{n.kind === 'superset' ? 'Superset' : blockName(exercises, n)}</div>
          <div className="mt-1.5 text-text-secondary" style={{ font: `400 13px ${MONO}` }}>
            {n.kind === 'cardio' ? 'Cardio' : `${n0.sets.length} sets × ${n0.targetReps} reps · ${restLabel(n0.restSeconds)} rest`}
          </div>
          {upNext.length > 0 && (
            // A fixed square per member on a grid. It has to be the grid's own
            // track size: a flex row sized the columns off their caption text
            // instead and squashed the art to 45x74. The panel is 325 wide
            // inside its padding: two 100s and a 10px gap come to 210, three
            // come to 320, so a tri-set still lays out without wrapping.
            <div className="mt-2 grid justify-center gap-x-2.5"
              style={{ gridTemplateColumns: `repeat(${upNext.length}, minmax(0, ${upNext.length > 1 ? 100 : 120}px))` }}>
              {upNext.map(({ e, art }, k) => {
                // Something has to say what the number underneath is: in a
                // superset that's the member's name, and for a lone exercise
                // the art does it. With neither, the weight sits on its own
                // under the rep line and reads as just another stat.
                const cap = upNext.length > 1 ? { text: e.name, track: '.06em' }
                  : art ? null : { text: 'LOAD', track: '.16em' };
                return (
                <div key={k} className="min-w-0 text-center">
                  {art && (
                    // Cropped to the art: at full panel width the frame was 57%
                    // empty box, with the scanlines painted over the empty part.
                    <div className="relative w-full aspect-square rounded-[18px] overflow-hidden" style={{ background: '#0e0e0e' }}>
                      <TintedExerciseArt x={art} />
                    </div>
                  )}
                  {cap && (
                    <div className="mt-1 truncate text-text-tertiary" style={{ font: `500 10px ${MONO}`, letterSpacing: cap.track }}>{cap.text}</div>
                  )}
                  {/* The load to set the bar to before you get there. */}
                  <div className="mt-0.5 text-text-primary" style={{ font: `600 15px ${MONO}` }}>{loadLabel(e)}</div>
                </div>
                );
              })}
            </div>
          )}
        </>
      )}
      </div>
      {onClaim && (
        <button onClick={onClaim} className="mt-1 w-full h-[62px] rounded-[20px] font-extrabold text-[17px]" style={{ background: '#ff2222', color: '#fff' }}>Quest clear · open the loot</button>
      )}
      {walking && !onClaim && (
        <div className="mt-3 relative overflow-hidden flex items-center gap-2.5 py-2.5 pr-2.5 pl-3.5 rounded-[14px] bg-bg-2">
          <div className="absolute left-0 top-0 bottom-0" style={{ background: 'var(--g-timer-soft)', width: `${total ? (1 - left / total) * 100 : 0}%`, transition: 'width 1s linear' }} />
          <span className="relative g-label">{intro ? intro.label : 'REST · WALKING'}</span>
          <span className={`relative flex-1 g-tab${intro ? '' : last10(left)}`} style={{ font: `500 20px ${MONO}` }}>{mmss(left)}</span>
          {!intro && <button onClick={() => timer.extend(15)} className="relative h-[34px] px-2.5 rounded-[10px] bg-bg-3 text-text-primary" style={{ font: `500 11px ${MONO}` }}>+15s</button>}
          <button onClick={onSkip} className="relative h-[34px] px-3 rounded-[10px] bg-accent q-cta font-bold text-xs" style={{ color: 'var(--color-on-accent)' }}><Glyph k="t" />Sprint</button>
        </div>
      )}
    </div>
  );
}

// The weekly boss finale, offered when a workout's done and a fight is due.
function BossAsk({ boss, onFight, onSkip }) {
  const n = (boss.fights?.length || 0) + 1;
  return (
    <div className="flex-1 flex flex-col rounded-[28px] p-5 fx-in" style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(251,191,36,.16), var(--color-bg-1) 65%)', boxShadow: 'inset 0 0 0 1.5px #fbbf24' }}>
      <div style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em', color: '#fbbf24' }}>WEEKLY BOSS APPEARS</div>
      <div className="mt-2" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1 }}>{boss.name}</div>
      {boss.cry && <div className="mt-1.5 text-text-secondary" style={{ font: `400 12px ${MONO}` }}>“{boss.cry}”</div>}
      <div className="mt-4 p-3.5 rounded-[18px] bg-bg-2">
        <div className="g-label">FIGHT {n} OF {BOSS_GROUPS}</div>
        <div className="mt-1 text-[16px] font-extrabold">1 set to failure · {boss.exercise}</div>
        <div className="mt-1 text-text-secondary" style={{ font: `400 11px/1.5 ${MONO}` }}>
          One all-out set while you're fresh, then your workout as planned. {n === BOSS_GROUPS ? 'Beat it for a card pack.' : 'The next fight opens in 48 hours.'}
        </div>
      </div>
      <div className="flex-1" />
      <div className="flex gap-2 mt-4">
        <button onClick={onSkip} className="flex-1 h-[56px] rounded-[18px] bg-bg-2 text-text-primary font-bold text-[14px]">Not today</button>
        <button onClick={onFight} className="flex-[2] h-[56px] rounded-[18px] font-extrabold text-[16px]" style={{ background: '#fbbf24', color: '#050505' }}>Fight</button>
      </div>
    </div>
  );
}

function RestStrip({ timer, onSkip }) {
  return (
    <div className="mt-3 relative overflow-hidden flex items-center gap-2.5 py-2.5 pr-2.5 pl-3.5 rounded-[14px] bg-bg-2 fx-in">
      <div className="absolute left-0 top-0 bottom-0" style={{ background: 'var(--g-timer-soft)', width: `${timer.progress * 100}%`, transition: 'width 1s linear' }} />
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

// ── Timed set: one countdown, pausable. timedStartMs = running since,
// timedDoneSec = seconds banked before the last pause. Running out logs the set
// (and so starts the normal rest timer), same as ticking it off by hand. ──
const timedElapsed = (s) => (s.timedDoneSec || 0) + (s.timedStartMs ? (Date.now() - s.timedStartMs) / 1000 : 0);
function TimedBlock({ set, onPatch, onDone, big = false }) {
  const secs = set.timedSec || 60;
  const running = !!set.timedStartMs && !set.completed;
  useTick(running);
  useWakeLock(running);
  const e = set.completed ? secs : Math.min(secs, timedElapsed(set));
  const fired = useRef(false);
  useEffect(() => {
    if (!running) { fired.current = false; return; }
    if (e >= secs && !fired.current) { fired.current = true; playBeep('work'); vibrate([200, 150, 200]); onDone(); }
  });
  const pct = (e / secs) * 100;
  const started = e > 0;
  const pause = () => onPatch({ timedStartMs: null, timedDoneSec: timedElapsed(set) });
  const go = () => onPatch({ timedStartMs: Date.now(), timedDoneSec: set.timedDoneSec || 0 });
  const reset = () => onPatch({ timedStartMs: null, timedDoneSec: 0 });
  return (
    <div className={`mt-3 relative overflow-hidden rounded-[18px] bg-bg-2 px-4 py-3.5${big ? ' flex-1 min-h-0 flex flex-col justify-center' : ''}`}>
      <div className="absolute left-0 top-0 bottom-0" style={{ background: 'color-mix(in srgb, var(--g-timed) 22%, transparent)', width: `${pct}%`, transition: 'width .25s linear' }} />
      <div className="relative flex justify-between items-center gap-2.5">
        <div className="min-w-0">
          <div style={{ font: `500 10px ${MONO}`, letterSpacing: '.14em', color: 'var(--g-timed)' }}>TIMED SET · {mmss(secs)}</div>
          <div className="mt-1 g-tab" style={{ font: `500 ${big ? 'clamp(30px, 18cqh, 56px)' : '26px'} ${MONO}` }}>{set.completed ? 'Done' : mmss(secs - e + (running ? 0.999 : 0))}</div>
          <div style={{ font: `400 11px ${MONO}` }} className="text-text-secondary">
            {running ? 'Keep going — it logs itself at zero' : set.completed ? 'Logged' : started ? 'Paused' : 'Rest timer starts when it ends'}
          </div>
        </div>
        {!set.completed && (
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button onClick={running ? pause : go} className="h-12 px-[18px] rounded-[15px] font-extrabold text-sm whitespace-nowrap" style={{ background: 'var(--g-timed)', color: '#06141f' }}>
              {running ? 'Pause' : started ? 'Resume' : `Start ${mmss(secs)}`}
            </button>
            <div className="flex gap-1.5">
              {started && !running && <button onClick={reset} className="flex-1 h-8 px-2 rounded-[10px] bg-bg-3 text-text-secondary" style={{ font: `600 10px ${MONO}` }}>Reset</button>}
              <button onClick={onDone} aria-label="Mark set done" className="flex-1 h-8 px-2 rounded-[10px] bg-bg-3 text-text-secondary" style={{ font: `600 10px ${MONO}` }}>✓ Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Interval phase block — same stamps + beeps as IntervalTimerBar ───
function IntervalBlock({ set, onStamp, onDone }) {
  const work = set.intervalWork || 30, rest = set.intervalRest || 30, total = set.intervalTotal || 180;
  const load = num(set.weight) > 0 ? `${fmtW(set.weight)} KG` : 'BODYWEIGHT';
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
  // h-full + a flexible middle: in a short card the clock and the Start button
  // keep their place and only the type scales, so nothing has to scroll.
  return (
    <div className="px-[18px] rounded-[22px] text-center h-full flex flex-col"
      style={{ background: bg, color: running ? '#0b1a10' : 'var(--color-text-primary)', transition: 'background .3s, color .3s',
        marginTop: 'clamp(8px, 6cqh, 14px)', paddingTop: 'clamp(8px, 6cqh, 18px)', paddingBottom: 'clamp(8px, 6cqh, 16px)' }}>
      <div className="flex-1 min-h-0 flex flex-col justify-center">
      <div style={{ font: `500 10px ${MONO}`, letterSpacing: '.16em', opacity: 0.75 }}>{top}</div>
      <div style={{ fontSize: 'clamp(28px, 20cqh, 64px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 6 }}>{word}</div>
      <div className="g-tab" style={{ font: `500 clamp(16px, 10cqh, 30px) ${MONO}`, marginTop: 4 }}>
        {mmss(running ? phaseRemaining + 0.999 : set.completed ? 0 : total)}
      </div>
      <div style={{ font: `500 10px ${MONO}`, letterSpacing: '.16em', opacity: 0.75, marginTop: 4 }}>{load}</div>
      </div>
      <div className="h-1.5 rounded-[3px] overflow-hidden flex-shrink-0" style={{ background: 'rgba(0,0,0,.18)', marginTop: 'clamp(6px, 5cqh, 14px)' }}>
        <div className="h-full" style={{ background: 'currentColor', width: `${set.completed ? 100 : running ? Math.min(100, (elapsed / total) * 100) : 0}%`, transition: 'width .25s linear' }} />
      </div>
      <button
        onClick={() => {
          if (set.completed) onStamp({ completed: false, intervalCountInStartMs: null, intervalTimerStartMs: null });
          else if (active) onStamp({ intervalCountInStartMs: null, intervalTimerStartMs: null });
          else { const now = Date.now(); onStamp({ intervalCountInStartMs: now, intervalTimerStartMs: now + COUNT_IN_SEC * 1000 }); }
        }}
        className="w-full rounded-2xl bg-bg-0 text-text-primary font-extrabold text-[15px] flex-shrink-0"
        style={{ marginTop: 'clamp(6px, 5cqh, 14px)', height: 'clamp(40px, 24cqh, 52px)' }}>
        {set.completed ? 'Undo' : active ? 'Stop' : 'Start intervals'}
      </button>
    </div>
  );
}

// Pixelated, theme-tinted CRT GIF layers for an exercise. Caller controls the
// wrapper's size and `position: relative`. Shared by QuestTravel's next-encounter
// frame and RenameModal's "renamed" preview so both read the same tint/scanlines.
function TintedExerciseArt({ x }) {
  const hex = TINTS[readTint()]?.[1] || TINTS.amber[1];
  const scanlines = readScanlines();
  return (
    <>
      <img src={gifUrl(x)} alt="" loading="lazy"
        className="absolute inset-0 w-full h-full object-contain"
        style={{ imageRendering: 'pixelated', filter: 'grayscale(1) contrast(1.15) brightness(0.95)' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: hex, mixBlendMode: 'multiply', opacity: 0.9 }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: hex, mixBlendMode: 'screen', opacity: 0.1 }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,.55) 100%)' }} />
      {scanlines && <div className="absolute inset-0 pointer-events-none" style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 1px, transparent 3px)' }} />}
    </>
  );
}

// A plain rename: swaps the name without stamping `substituted`, so progression
// still credits the new name. After Save, if the new name resolves to a library
// entry the modal shows a 3 s GIF preview so the user can confirm the match
// before it closes (and sees that Quest/muscle maps will now use it).
function RenameModal({ open, onClose, currentName, onSave }) {
  const [val, setVal] = useState(currentName || '');
  const [preview, setPreview] = useState(null);
  const cat = useCatalog();
  const { settings } = useWorkout();

  useEffect(() => { if (open) { setVal(currentName || ''); setPreview(null); } }, [open, currentName]);
  useEffect(() => {
    if (!preview) return;
    const t = setTimeout(() => { setPreview(null); onClose(); }, 3000);
    return () => clearTimeout(t);
  }, [preview, onClose]);

  const trimmed = val.trim();
  const disabled = !trimmed || trimmed === currentName;
  const commit = () => {
    if (disabled) return;
    onSave(trimmed);
    const art = guess(trimmed, settings?.exerciseLinks || {}, cat);
    if (art) setPreview({ art, name: trimmed });
    else onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={preview ? 'Renamed' : 'Rename exercise'}>
      {preview ? (
        <div className="p-4 flex flex-col gap-3">
          <div className="relative rounded-[18px] overflow-hidden" style={{ background: '#0e0e0e', aspectRatio: '1 / 1' }}>
            <TintedExerciseArt x={preview.art} />
          </div>
          <div className="text-center">
            <div className="text-text-primary font-extrabold text-base">{preview.name}</div>
            <div className="text-text-tertiary text-xs mt-0.5">matched · {preview.art.n}</div>
          </div>
        </div>
      ) : (
        <div className="p-4 flex flex-col gap-3">
          <input type="text" autoFocus value={val} onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            list={EXERCISE_LIST_ID} placeholder="Exercise name"
            className="bg-bg-0 border border-bg-3 rounded-xl px-3 py-3 text-base text-text-primary outline-none focus:border-accent/60" />
          <button onClick={commit} disabled={disabled}
            className="h-12 rounded-2xl bg-accent font-extrabold text-[15px] disabled:opacity-40"
            style={{ color: 'var(--color-on-accent)' }}>Rename</button>
        </div>
      )}
    </Modal>
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
    ['Rename exercise', () => pick('rename')],
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
            onAddTimed={handlers.onAddTimed} onRemoveTimed={handlers.onRemoveTimed}
            onAddVariable={handlers.onAddVariable} onRemoveVariable={handlers.onRemoveVariable}
            onToggleFailure={(si) => handlers.onUpdateSet(ei, si, { ...ex.sets[si], reps: ex.sets[si].reps === 'failure' ? '' : 'failure' })} />
          <SubstituteModal open={modal === 'swap'} onClose={() => setModal(null)} exerciseName={ex.name}
            onSelect={(n, type) => handlers.onSubstitute(ei, n, type)} />
          <RenameModal open={modal === 'rename'} onClose={() => setModal(null)} currentName={ex.name}
            onSave={(n) => handlers.onRename(ei, n)} />
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
    : b.kind === 'timed' ? `${b0.sets.length} × ${mmss(b0.sets[0]?.timedSec || 60)} timed · ${restLabel(b0.restSeconds)} rest`
    : b.kind === 'cardio' ? 'Cardio'
    : `${b0.sets.length} sets × ${b0.targetReps} reps · ${restLabel(b0.restSeconds)} rest`;
  // Portalled: App's content wrapper carries a CSS filter, which would make
  // this fixed layer position against the wrapper instead of the viewport.
  return createPortal(
    <div onClick={onGo} className="fixed inset-0 z-[150] flex flex-col justify-end cursor-pointer fx-fade g-root" style={{ background: 'rgba(0,0,0,.45)' }}>
      <div className="bg-bg-1 m-2 px-6 pt-7 pb-[34px] max-w-xl w-[calc(100%-16px)] self-center"
        style={{ borderRadius: '32px 32px 44px 44px', animation: 'fx-up .45s cubic-bezier(.2,1.2,.3,1) both', marginBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full flex items-center justify-center font-bold" style={{ background: 'var(--g-ok)', color: 'var(--g-ok-ink)', animation: 'fx-pop .45s cubic-bezier(.2,1.6,.4,1) both' }}>✓</span>
          <div className="min-w-0">
            <div className="text-base font-bold text-text-secondary truncate">{blockName(exercises, a)}</div>
            <div className="mt-0.5 text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>
              {a.kind === 'interval' ? 'Interval block complete' : a.kind === 'timed' ? `${done.length} timed set${done.length === 1 ? '' : 's'} done` : `${done.length} sets · ${Math.round(vol).toLocaleString()} kg moved`}
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
// Console 2000 marks each action with the face button that runs it; every
// other skin shows nothing at all.
const GLYPHS = { t: ['△', 't'], c: ['○', 'c'], x: ['✕', 'x'], s: ['□', 's'] };
function Glyph({ k }) {
  const { questSkin } = useTheme() || {};
  if (!questSkin?.glyphs) return null;
  const [ch, cls] = GLYPHS[k];
  return <span aria-hidden className={`q-glyph q-glyph-${cls}`}>{ch}</span>;
}

export default function FocusWorkout({
  workout, layout, history, elapsed, handlers, onSetComplete, updateWorkout,
  onFinish, onCancel, onAddExercise, onQuestClear,
}) {
  const dense = layout === 'dense';
  const exercises = workout.exercises;
  const blocks = useMemo(() => buildBlocks(exercises), [exercises]);
  const timer = useGlobalTimer();
  const haptics = useHaptics();
  const repSensor = useRepSensorCtx();

  const stats = useMemo(() => {
    const m = {};
    exercises.forEach((ex) => { if (!m[ex.name]) m[ex.name] = liftStats(history, ex.name, lowRep(ex)); });
    return m;
  }, [exercises, history]);

  // Reopen on the exercise you were on (leaving the screen and coming back
  // remounts this), unless it's done since; else the first unfinished one.
  const [cur, setCur] = useState(() => {
    try {
      const p = JSON.parse(localStorage.getItem(FOCUS_AT_KEY));
      if (p?.key === workout.startTime && p.cur < blocks.length && !blockDone(exercises, blocks[p.cur])) return p.cur;
    } catch { /* nothing saved */ }
    return Math.max(0, blocks.findIndex((b) => !blockDone(exercises, b)));
  });
  useEffect(() => { try { localStorage.setItem(FOCUS_AT_KEY, JSON.stringify({ key: workout.startTime, cur })); } catch { /* private mode */ } }, [cur, workout.startTime]);
  const [mem, setMem] = useState(0);
  // Superset hand-offs: n re-keys what fades up, at gates the pulse to the moment
  // itself (the card remounting later mustn't replay it).
  const [swap, setSwap] = useState({ n: 0, at: 0 });
  const swapN = swap.n;
  const reduce = useReducedMotion();
  const [fset, setFset] = useState(null);
  const [handoff, setHandoff] = useState(null);
  const [toast, setToast] = useState(null);
  const [goAt, setGoAt] = useState(0);
  const [qReact, setQReact] = useState(null); // the monster reacting to a stepper tap
  // Which cardio cards have their timer running (CardioCard reports it).
  const [cardioOn, setCardioOn] = useState({});
  const onCardioTimer = useCallback((i, on, phase = null, progress = null) => setCardioOn((c) => (c[i]?.on === on && c[i]?.phase === phase && c[i]?.progress === progress ? c : { ...c, [i]: { on, phase, progress } })), []);
  const chaseAt = useRef({}); // block → when its gauntlet began (the monster flees then)
  const tauntAt = useRef({}); // block|exercise → when its taunt cut-in played
  const comboTip = useRef({ at: 0, full: false }); // which rest the combo explainer is for
  const fx = readQuestFx();
  const [drag, setDrag] = useState({ dx: 0, dy: 0, anim: true });
  const [editOpen, setEditOpen] = useState(false);
  const [kpad, setKpad] = useState(null); // the weight keypad's draft, null = closed
  useBackHandler(kpad !== null, () => { setKpad(null); return true; });
  const dragRef = useRef({});

  // Blocks can disappear under us (exercise removed, superset unlinked).
  const ci = Math.min(cur, blocks.length - 1);
  const block = blocks[ci];
  // Focus/Quest show a superset as one round: every member's set for the round
  // on the card at once, logged by one button. Dense keeps the A/B tabs.
  const roundMode = block.kind === 'superset' && !dense;
  const lead0 = exercises[block.indices[0]];
  const roundDone = (r) => block.indices.every((i) => {
    const s0 = setIndexForRound(exercises[i], r);
    return s0 < 0 || (dropChain(exercises[i].sets, s0) || [s0]).every((j) => exercises[i].sets[j].completed);
  });
  const rd = !roundMode ? -1 : fset != null && lead0.sets[fset] ? Math.max(0, roundOfSet(lead0, fset))
    : (() => { const tot = supersetRounds(exercises, block.indices); for (let r = 0; r < tot; r++) if (!roundDone(r)) return r; return tot - 1; })();
  // Inside a round you work one exercise at a time: the first member that still
  // owes its set is the one in front of you, so logging it hands you to the next.
  const inRound = (k) => setIndexForRound(exercises[block.indices[k]], rd);
  const roundChain = (k) => { const s0 = inRound(k); return s0 < 0 ? [] : (dropChain(exercises[block.indices[k]].sets, s0) || [s0]); };
  const owing = roundMode ? block.indices.findIndex((i, k) => roundChain(k).some((j) => !exercises[i].sets[j].completed)) : -1;
  const m = roundMode ? (owing >= 0 ? owing : block.indices.reduce((a, _, k) => (inRound(k) >= 0 ? k : a), 0)) : Math.min(mem, block.indices.length - 1);
  const ei = block.indices[m];
  const ex = exercises[ei];
  const fi = roundMode ? (roundChain(m).find((j) => !ex.sets[j].completed) ?? setIndexForRound(ex, rd)) : focusIndex(ex, fset);
  const fs = ex.sets[fi];
  const st = stats[ex.name];
  const kind = block.kind;
  const isTimed = kind === 'bfr' || kind === 'interval' || kind === 'timed';

  // ── Quest Mode: the same workout as a monster battler ─────────────
  // Phase is derived from the real state (rest timer, sets done) plus three
  // stamps: the last hit, the last victory, and when this encounter began.
  const quest = layout === 'quest';
  // Dense and Quest: swipe left/right changes exercise, and vertical drags just
  // scroll the page (Quest has the set pips on screen, so no set swiping).
  const swipeExercises = dense || quest;
  // Every card is the same size, full stop: one height for the slot, applied to
  // every block kind (cardio and the camera included). Nothing is measured, so
  // no exercise can come out a different size from the one before it.
  const cardH = dense ? 0 : CARD_H[quest ? 'quest' : 'focus'];
  const cardMin = dense ? 0 : CARD_MIN[quest ? 'quest' : 'focus'];
  const { prof, updProf } = useQuest();
  const { questSkin: qSkin } = useTheme();
  const heroN = prof.hero || 'Warlord';
  const lands = landsOf(prof.theme);
  const mult = xpMult(prof, prof.lvl);
  const qKey = workout.startTime;

  // ── Weekly boss (normal and quest workouts) ─────────────────────
  // Offered once, at the start: one set to failure while you're fresh, so it
  // never costs you the rest of the session. Fought first, then the workout.
  const { boss: wBoss, offerable: bossDue, wk: bossWk } = useWeeklyBoss();
  const [bossAsk, setBossAsk] = useState(false);
  const canBoss = !!wBoss && bossDue && !workout.bossFight && !workout.bossOffered;
  const fightBoss = () => {
    const name = wBoss.exercise;
    let last = null; // prefill from your last time on it
    for (const w of history) {
      let exs = w.exercises; if (typeof exs === 'string') { try { exs = JSON.parse(exs); } catch { exs = []; } }
      const e = (exs || []).find((x) => x?.name === name);
      if (e) { last = e; break; }
    }
    const lastSets = (last?.sets || []).filter((x) => x.type !== 'drop');
    const sets = Array.from({ length: BOSS_GROUP_SETS }, () => ({ reps: 'failure', weight: String(num(lastSets[0]?.weight) || ''), completed: false }));
    // Added at the end of the list (so planned quest events keep their places)
    // but opened now; after it, the workout carries on from your first exercise.
    updateWorkout((prev) => (prev ? {
      ...prev,
      exercises: [...prev.exercises, { name, targetSets: BOSS_GROUP_SETS, targetReps: 'failure', repRange: 'failure', restSeconds: 90, sets, notes: [], boss: true }],
      bossFight: { key: qKey, done: false }, bossOffered: true,
    } : prev));
    setBossAsk(false);
    openBlock(blocks.length);
  };
  const skipBoss = () => { setBossAsk(false); updateWorkout((prev) => (prev ? { ...prev, bossOffered: true } : prev)); };
  // The boss block done → the fight counts (once per workout); the second one beats it.
  const bossIdx = exercises.findIndex((e) => e.boss);
  const bossBlockDone = bossIdx >= 0 && exercises[bossIdx].sets.every((x) => x.completed);
  useEffect(() => {
    if (!bossBlockDone || !workout.bossFight || workout.bossFight.done) return;
    const beatNow = (wBoss?.fights?.length || 0) + 1 >= BOSS_GROUPS;
    updProf((p) => recordBossFight(p, bossWk, workout.bossFight.key)).catch(() => {});
    updateWorkout((prev) => (prev ? { ...prev, bossFight: { ...prev.bossFight, done: true } } : prev));
    if (beatNow) setToast({ text: `Weekly boss defeated · +1 card pack`, at: Date.now() });
  }, [bossBlockDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Random events: planned once per quest and stored on the workout, so a reload
  // (or a bonus set changing which set is "last") can't move them.
  // localStorage 'gains-beta-quest-force' = an event key forces one (testing).
  useEffect(() => {
    if (!quest || workout.questPlan) return;
    let force = null; try { force = localStorage.getItem('gains-beta-quest-force'); } catch { /* none */ }
    const plan = planEvents(exercises, qKey, history, force);
    updateWorkout((prev) => (prev && !prev.questPlan ? { ...prev, questPlan: plan } : prev));
  }, [quest, !!workout.questPlan]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flavour text from the local AI, written once when the quest begins and kept
  // on the workout. Never awaited: until (or unless) it lands, the app's own lines are used.
  const scriptAsked = useRef(false);
  useEffect(() => {
    if (!quest || !workout.questPlan || workout.questScript || scriptAsked.current) return;
    scriptAsked.current = true;
    const names = [...new Set(exercises.filter((e) => !(e.type === 'cardio' || e.sets?.[0]?.type === 'cardio')).map((e) => e.name))];
    const boss = prof.boss?.week === weekKey() && !prof.boss.ai ? prof.boss.label : null;
    api.questScript({ exercises: names, events: [...new Set(Object.values(workout.questPlan).map((e) => e.k))], boss })
      .then((r) => {
        if (!r?.script) return;
        updateWorkout((prev) => (prev ? { ...prev, questScript: r.script } : prev));
        if (r.script.boss) updProf((p) => (p.boss?.week === weekKey() ? { ...p, boss: { ...p.boss, ...r.script.boss, ai: true } } : p)).catch(() => {});
      })
      .catch(() => { /* offline or the model is busy — the built-in lines carry on */ });
  }, [quest, !!workout.questPlan, !!workout.questScript]); // eslint-disable-line react-hooks/exhaustive-deps
  const script = workout.questScript || null;
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
  // The weekly boss is offered as the workout begins (after the quest's setting-off walk).
  const anyLogged = exercises.some((e) => e.sets.some((x) => x.completed));
  useEffect(() => {
    if (canBoss && !anyLogged && !introOn) setBossAsk(true);
  }, [canBoss, introOn]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setQWin({ at: hitAt, msg: `${heroN} gains ${gain.toLocaleString()} XP.${won.lvl > before.lvl ? ` Reached Lv ${won.lvl}!` : ''}${un ? ` Unlocked ${un}!` : ''}` });
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
    const t = setTimeout(() => bump((n) => n + 1), GO_MS + 20);
    return () => clearTimeout(t);
  }, [goAt]);
  const goFlash = Date.now() - goAt < GO_MS && !timer.isRunning;
  useEffect(() => { for (const [n] of GO_SEQ) new Image().src = GO_SRC(n); }, []); // the GO frames, warm long before a rest timer ends

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
  // Moving between superset members — counted, so the card can announce it.
  const pickMember = (k) => { if (k !== m) setSwap((w) => ({ n: w.n + 1, at: Date.now() })); setMem(k); };
  const pickTab = (k) => { if (k !== m) haptics.tap(); pickMember(k); setFset(null); };

  const step = (xi, si, field, d) => {
    const x = exercises[xi], s = x.sets[si];
    // More weight (less on an assisted lift, where it's a counterweight) or more reps: the monster flinches.
    if (quest && fx.react) {
      const harder = field === 'weight' ? (isAssisted(x.name) ? d < 0 : d > 0) : d > 0;
      setQReact({ at: Date.now(), kind: harder ? 'flinch' : 'laugh' });
    }
    if (field === 'weight') return patchSet(xi, si, { weight: roundW(num(shownWeight(x.sets, si)) + d) });
    const shown = shownReps(x, s, stats[x.name]);
    const base = shown === 'failure' ? (s.type === 'drop' ? DROP_REPS[s.dropIndex ?? 0] ?? 5 : stats[x.name]?.lr ?? lowRep(x)) : num(shown);
    patchSet(xi, si, { reps: String(Math.max(0, base + d)), ...(s.type === 'drop' ? { dropMode: 'fixed' } : {}) });
  };
  // Failure ⇄ reps for any lifting set. Drops keep their own mode flag; BFR and intervals are timed, so they have no reps to swap.
  const canFail = (s) => s && s.type !== 'bfr' && s.type !== 'interval' && s.type !== 'timed';
  const toggleFail = (xi, si) => {
    const x = exercises[xi], s = x.sets[si];
    const failing = shownReps(x, s, stats[x.name]) === 'failure';
    if (s.type === 'drop') return patchSet(xi, si, failing ? { dropMode: 'fixed', reps: String(DROP_REPS[s.dropIndex ?? 0] ?? 5) } : { dropMode: 'failure', reps: '' });
    patchSet(xi, si, { reps: failing ? '' : 'failure' });
  };

  // Completing a set: log it, check for a PR, then decide what happens next —
  // the partner (superset), the next drop, rest, or the handoff to a new block.
  // With a drop chain, every set in it is logged at once and si is its last drop.
  const complete = (xi, si, chain = null) => {
    const x = exercises[xi], s = x.sets[si];
    if (s.completed) { (chain || [si]).forEach((j) => patchSet(xi, j, { completed: false })); setFset(chain ? chain[0] : si); return; }
    const logged = (j) => { const sh = shownReps(x, x.sets[j], stats[x.name]); return sh === 'failure' ? x.sets[j].reps : sh; };
    (chain || []).slice(0, -1).forEach((j) => patchSet(xi, j, { completed: true, reps: logged(j) ?? '', weight: shownWeight(x.sets, j) }));
    const top = chain ? x.sets[chain[0]] : s, topReps = logged(chain ? chain[0] : si);
    const shown = shownReps(x, s, stats[x.name]);
    const reps = shown === 'failure' ? s.reps : shown;
    // An accepted event is judged here, and the verdict kept on the set (XP reads it back).
    const ev = s.qe?.st === 'accepted' ? s.qe : null;
    const evOk = ev ? eventDone(ev.k, x, { ...s, reps, completed: true }, stats[x.name] && { lw: stats[x.name].lw, lr: stats[x.name].lr }) : false;
    patchSet(xi, si, { completed: true, reps: reps ?? '', ...(chain ? { weight: shownWeight(x.sets, si) } : {}), ...(ev ? { qe: { ...ev, ok: evOk } } : {}) });
    // Alpha rep tracker: the motion since the last logged set, labelled with
    // the reps just typed. No-ops unless the quest opted in and the sensor is
    // linked, and it can never block the set being logged.
    // No mount label: the sensor goes on a weight stack for machine work and on
    // the wrist for free weights, and a label you have to remember to toggle is
    // one you'll forget mid-session — mislabelled traces are worse than none,
    // because they'd train one model across two unrelated signal regimes.
    // A stack is rigid (near-zero gyro throughout); a wrist rotates on nearly
    // every lift, so the trace says which it was far more reliably than a toggle.
    repSensor?.commitSet({ exercise: x.name, setIndex: si, reps, weight: shownWeight(x.sets, si), restEndedAt: goAt, kind, setType: s.type || 'normal' });
    moodState.pulse = Date.now();
    haptics.tap();
    setFset(null);

    const pr = top.type !== 'drop' && top.type !== 'timed' && topReps !== 'failure' && isPR(stats[x.name], x.name, top.weight, topReps);
    if (pr) {
      haptics.success();
      setToast({ text: `${x.name} ${fmtW(top.weight)} × ${topReps}`, at: Date.now() });
      moodState.prUntil = Date.now() + 2400;
    }

    const doneNow = (i, j) => (i === xi && (j === si || chain?.includes(j))) || exercises[i].sets[j].completed;
    const allDone = block.indices.every((i) => exercises[i].sets.every((_, j) => doneNow(i, j)));
    const nextIsDrop = x.sets[si + 1]?.type === 'drop' && !x.sets[si + 1].completed;
    const moreInRound = roundMode && block.indices.some((i, k) => roundChain(k).some((j) => !doneNow(i, j)));
    const restMod = ev ? EVENTS[ev.k]?.rest || 0 : 0;
    if (!nextIsDrop && !moreInRound) onSetComplete(xi, roundMode ? setIndexForRound(x, rd) : si, Math.max(15, (x.restSeconds || 0) + restMod));

    if (quest) {
      const hitSet = { ...s, reps }, crit = isCrit(x, hitSet) || (evOk && EVENTS[ev.k]?.crit);
      const evLine = !ev ? '' : !evOk ? ' The event slips away.'
        : { shield: ' The shield shatters!', goblin: ' Goblin caught: +1 card pack!', mirror: ' You matched your past self!', weak: ' Critical hit!',
          enraged: ' You out-paced it!', slow: ' The curse breaks.', paused: ' Rock steady.', spring: '', ambush: ' Ambush repelled!', blessing: ' Blessed strike!' }[ev.k] || '';
      const parts = chain ? chain.map((j) => setDamage(x, { ...x.sets[j], weight: shownWeight(x.sets, j), reps: logged(j) }, kind)) : null;
      const dmg = parts ? parts.reduce((a, v) => a + v, 0) : setDamage(x, hitSet, kind);
      const now = Date.now();
      // Combo: logged soon enough after the set went live keeps it going.
      const combo = fx.combo ? (timedWork || now - liveAt <= COMBO_GAP_MS ? (workout.qCombo || 0) + 1 : 1) : 0;
      if (fx.combo) {
        patchSet(xi, si, { qc: combo });
        updateWorkout((prev) => (prev ? { ...prev, qCombo: combo } : prev));
      }
      const sneak = dozing;
      const lost = !!(fx.combo && combo === 1 && (workout.qCombo || 0) >= 2);
      const by = kind === 'superset' && m === 1 && prof.pet && fx.tag ? 'pet' : 'hero';
      const who = by === 'pet' ? 'Your pet tags in' : heroN;
      setQHit({ at: now, bi: ci, dmg, crit: crit || sneak, pr: pr && fx.pr, sneak, by,
        power: fx.charge ? chargeK : 1, special: !!(charge?.timed && fx.charge), chain: parts && fx.chain ? parts.length : 0, parts,
        msg: (sneak ? 'Sneak attack! ' : '') + (chain ? `${who} chains ${chain.map((j) => fmtW(shownWeight(x.sets, j))).join(' → ')} kg without stopping!${crit ? " It's super effective!" : ''}${allDone ? ' Finishing blow!' : ''}`
        : `${by === 'pet' ? 'Your pet tags in!' : `${heroN} lifts`} ${num(s.weight) > 0 ? `${fmtW(s.weight)} kg` : 'bodyweight'} × ${reps}!${crit ? " It's super effective!" : ''}${pr && fx.pr ? ' A new record!' : ''}${evLine}${allDone ? ' Finishing blow!' : ''}`), lost });
    }
    if (allDone) {
      if (quest) return; // the victory effect below takes it from here
      const after = exercises.map((e, i) => (i === xi ? { ...e, sets: e.sets.map((ss, j) => (j === si ? { ...ss, completed: true } : ss)) } : e));
      const nx = nextOpenBlock(after, blocks, ci);
      setTimeout(() => { if (nx < 0) onFinish(); else setHandoff({ from: ci, to: nx }); }, 600);
      return;
    }
    if (block.kind === 'superset' && !roundMode && roundOfSet(x, si) >= 0) {
      const partner = nextMemberForRound(exercises, block.indices, xi, si);
      if (partner >= 0) { pickMember(block.indices.indexOf(partner)); return; }
      const firstOwing = block.indices.findIndex((i) => exercises[i].sets.some((ss, j) => !doneNow(i, j)));
      if (firstOwing >= 0) pickMember(firstOwing);
    }
  };

  const skipRest = () => { timer.stop(); setGoAt(Date.now()); };

  // Guided rep tracker on the card: START SET takes the attack button's place,
  // the calibration hold fills the card like the GO card does (readable from a
  // phone propped a metre away), GO fires when counting starts, and the live
  // count lands in the REPS box — still adjustable with − / + before logging.
  const chain = !dense && (kind === 'normal' || kind === 'drop' || roundMode) ? dropChain(ex.sets, fi) : null;
  const gMulti = !!(roundMode || chain);
  const gSteps = !dense ? (
    roundMode
      ? block.indices.flatMap((xi, k) => roundChain(k).filter((j) => !exercises[xi].sets[j].completed).map((j) => ({ xi, si: j })))
      : chain
      ? chain.filter((j) => !ex.sets[j].completed).map((j) => ({ xi: ei, si: j }))
      : fs && !fs.completed ? [{ xi: ei, si: fi }] : []
  ) : [];
  const gStep = gSteps[0] || null;
  const guidedOn = !!(repSensor?.guided && repSensor?.alpha && repSensor?.sensor?.status === 'linked');
  const gPhase = guidedOn ? repSensor.phase : 'idle';
  const gCard = guidedOn && (kind === 'normal' || kind === 'drop' || roundMode) && !dense && !!gStep;
  const gTarget = useRef(null); // the set the running count belongs to
  // A set started from the header tag rather than the button still fills this card.
  if (gCard && gPhase === 'hold' && !gTarget.current) gTarget.current = { ...gStep, multi: gMulti };
  const gLiveHere = gCard && (gPhase === 'counting' || gPhase === 'done') && gSteps.some((st) => st.xi === gTarget.current?.xi && st.si === gTarget.current?.si);
  const advanceGuided = () => {
    const g = gTarget.current;
    if (!g) return;
    const rem = gSteps.filter((st) => !(st.xi === g.xi && st.si === g.si));
    complete(g.xi, g.si);
    if (rem.length > 0) {
      gTarget.current = { ...rem[0], multi: true };
      repSensor.nextSet();
      setGoAt(Date.now());
      playBeep('work');
      setSwap((w) => ({ n: w.n + 1, at: Date.now() }));
    } else {
      gTarget.current = null;
    }
  };
  const prevGPhase = useRef(gPhase);
  useEffect(() => {
    // Hold over and counting: that is the set going live, so rest is over too.
    if (prevGPhase.current === 'hold' && gPhase === 'counting') skipRest();
    if (gPhase === 'idle') gTarget.current = null;
    prevGPhase.current = gPhase;
    // Superset / drop chain: 5 s of stillness advances to the next set (using
    // those 5 quiet seconds as baseline + flashing GO), and after 5 s of
    // stillness on the final set starts the rest timer for the whole round.
    if (gPhase === 'done' && gTarget.current?.multi) advanceGuided();
  }, [gPhase]); // eslint-disable-line react-hooks/exhaustive-deps
  const liveCount = repSensor?.liveCount ?? 0;
  useEffect(() => {
    const g = gTarget.current;
    if (!g || (gPhase !== 'counting' && gPhase !== 'done')) return;
    const s = exercises[g.xi]?.sets[g.si];
    if (!s || s.completed) return;
    if (s.reps === String(liveCount) && (s.type !== 'drop' || s.dropMode === 'fixed')) return;
    patchSet(g.xi, g.si, { reps: String(liveCount), ...(s.type === 'drop' ? { dropMode: 'fixed' } : {}) });
  }, [liveCount, gPhase, swapN]); // eslint-disable-line react-hooks/exhaustive-deps
  const startGuided = () => { if (!gStep) return; gTarget.current = { ...gStep, multi: gMulti }; haptics.tap(); repSensor.startSet(); };
  // Auto accept: a single counted set logs itself 5 s after its count ends.
  // Chains already advance on their own when the count ends, so they are left alone.
  useEffect(() => {
    if (gPhase !== 'done' || !repSensor?.auto?.accept || !gTarget.current || gTarget.current.multi) return undefined;
    const id = setTimeout(advanceGuided, 5000);
    return () => clearTimeout(id);
  }, [gPhase]); // eslint-disable-line react-hooks/exhaustive-deps
  // Auto progress: from set 2 on, when rest ends, the next count-in starts by itself.
  const wasResting = useRef(timer.isRunning);
  useEffect(() => {
    const ended = wasResting.current && !timer.isRunning;
    wasResting.current = timer.isRunning;
    if (!ended || !repSensor?.auto?.progress || !gCard || gPhase !== 'idle' || gStep.si < 1) return;
    startGuided();
  }, [timer.isRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Swipe ─────────────────────────────────────────────────────────
  const swipe = (dir) => {
    let apply = null;
    if (!swipeExercises && (dir === 'left' || dir === 'right')) {
      const ni = roundMode ? rd + (dir === 'left' ? 1 : -1) : fi + (dir === 'left' ? 1 : -1);
      const lim = roundMode ? supersetRounds(exercises, block.indices) : ex.sets.length;
      if (ni >= 0 && ni < lim) apply = () => setFset(roundMode ? setIndexForRound(lead0, ni) : ni);
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
      if (swipeExercises && d.axis === 'y') { d.on = false; return; }
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
  const activeXi = gLiveHere ? gTarget.current.xi : ei;
  const activeSi = gLiveHere ? gTarget.current.si : fi;
  // The round's rows: each member's set for round `rd`, with the drops hanging off it.
  const roundRows = roundMode ? block.indices.flatMap((xi, k) => {
    const x = exercises[xi], si = setIndexForRound(x, rd);
    if (si < 0) return [];
    return (dropChain(x.sets, si) || [si]).map((j) => {
      const s = x.sets[j];
      const isAct = xi === activeXi && j === activeSi && !s.completed;
      return {
        key: `${xi}-${j}`, xi, j, done: !!s.completed, drop: s.type === 'drop', active: isAct || (xi === ei && !gLiveHere),
        live: isAct && gLiveHere && gPhase === 'counting',
        label: s.type === 'drop' ? '↓ drop' : `${s.completed ? '✓' : letter(k)} ${x.name}`,
        weight: fmtW(shownWeight(x.sets, j)), reps: shownReps(x, s, stats[x.name]),
        onStep: (f, d) => step(xi, j, f, d), onToggleFail: () => toggleFail(xi, j),
      };
    });
  }) : null;
  const chainEnd = chain ? chain[chain.length - 1] : fi;
  // The member after the one you're on — the last of the round completes it, so
  // that's the tap that starts the rest.
  const nextInRound = roundMode ? block.indices.findIndex((i, k) => k > m && roundChain(k).some((j) => !exercises[i].sets[j].completed)) : -1;
  let completeLabel = `Complete set ${label}`;
  if (chain) completeLabel = gLiveHere && !roundMode ? (gSteps.length > 1 ? 'Next drop' : 'Complete set') : `Complete set ${setLabel(ex.sets, chain[0])} + ${chain.length - 1} drop${chain.length > 2 ? 's' : ''}`;
  else if (fs?.type === 'drop') completeLabel = `Complete drop ${(fs.dropIndex ?? 0) + 1}${ex.sets[fi + 1]?.type === 'drop' ? ' — no rest' : ''}`;
  if (roundMode) {
    completeLabel = ex.sets[chainEnd].completed ? `${ex.name} done · tap to undo`
      : nextInRound >= 0 || gSteps.length > 1 ? 'Next exercise'
      : 'Complete set';
  } else if (kind === 'superset' && round >= 0) {
    const partner = block.indices.find((i) => i !== ei && !exercises[i].sets.filter((s) => s.type !== 'drop')[round]?.completed);
    completeLabel = `Complete ${letter(m)} · round ${round + 1}${partner !== undefined && m < block.indices.length - 1 ? ` → ${letter(m + 1)}` : ''}`;
  }
  if (!roundMode && (chain ? ex.sets[chainEnd].completed : fs?.completed)) completeLabel = `${chain ? setLabel(ex.sets, chain[0]) : label}${chain ? ' + drops' : ''} done · tap to undo`;
  const restNext = fs && {
    tag: roundMode ? `ROUND ${rd + 1}` : kind === 'superset' ? letter(m) : fs.type === 'drop' ? setLabel(ex.sets, fi) : `SET ${label}`,
    name: roundMode ? block.indices.map((i) => exercises[i].name).join(' + ') : ex.name,
    load: roundMode ? '' : fs.type === 'timed' ? `${mmss(fs.timedSec || 60)} timed` : `${fmtW(fs.weight) === 'BW' ? 'BW' : `${fmtW(fs.weight)} kg`} × ${shownReps(ex, fs, st)}`,
  };
  const lastLine = kind === 'interval'
    ? `${fs?.intervalWork || 30}s on / ${fs?.intervalRest || 30}s off · ${mmss(fs?.intervalTotal || 180)} total`
    : kind === 'timed' ? `${ex.sets.length} × ${mmss(fs?.timedSec || 60)} · countdown per set, rest between`
    : st?.lw != null ? `Last ${fmtW(st.lw)} × ${st.lr}${st.rangeBest != null ? ` · best ${fmtW(st.rangeBest)} × ${st.rangeBestReps}` : ''}` : 'First time — this sets your baseline';
  const finishedBtn = ex.sets[chainEnd].completed;
  const cardName = roundMode ? block.indices.map((i) => exercises[i].name).join(' + ') : ex.name;
  const tagColor = TAGS[kind]?.[1] || 'var(--color-accent)';
  const resting = timer.isRunning;
  const cardMoved = Math.abs(drag.dx) + Math.abs(drag.dy);
  const fadeIn = swapN && !reduce ? { animation: 'fx-fade .2s both' } : undefined;

  // ── Quest events on the set in focus ────────────────────────────
  // Offered on its planned set until accepted or declined; once accepted, the
  // banner stays as the instruction until the set is done.
  const qEvent = quest && kind === 'normal' ? workout.questPlan?.[ci] : null;
  const evActive = quest && fs && !fs.completed && fs.qe?.st === 'accepted' ? fs.qe.k : null;
  const evOffered = qEvent && fs && qEvent.si === fi && !fs.completed && !fs.qe ? qEvent.k : null;
  const evKey = evActive || evOffered;
  const evText = (k) => {
    const ls = script?.events?.[k]?.length ? script.events[k] : EVENT_LINES[k];
    return ls[Math.floor(seeded(`${qKey}|${ci}|line`) * ls.length)];
  };
  const evAct = (k) => EVENTS[k].act.replace('{top}', topRep(ex))
    .replace('{last}', st?.lw != null ? `${fmtW(st.lw)} kg × ${st.lr}` : 'last time');
  // Shield's 45 s of steady reps: a timer in the banner, its start kept on the set.
  const timedLeft = evActive && EVENTS[evActive].timed && fs.qe.at ? Math.max(0, EVENTS[evActive].timed - (Date.now() - fs.qe.at) / 1000) : null;
  useTick(timedLeft !== null && timedLeft > 0, 250);
  const buzzed = useRef(null);
  useEffect(() => {
    if (timedLeft === 0 && buzzed.current !== fs?.qe?.at) { buzzed.current = fs.qe.at; try { navigator.vibrate?.([200, 100, 200]); } catch { /* no vibration */ } }
  }, [timedLeft === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const acceptEvent = () => {
    const k = evOffered, e = EVENTS[k];
    if (k === 'ambush') {
      // One bonus set at 80%, appended; the bonus is earned on that set.
      updateWorkout((prev) => {
        if (!prev) return prev;
        const next = { ...prev, exercises: [...prev.exercises] };
        const sets = [...next.exercises[ei].sets];
        sets[fi] = { ...sets[fi], qe: { k, st: 'seen' } };
        sets.push({ weight: roundW(Math.round(num(fs.weight) * e.bonusSet.pct * 2) / 2), reps: String(e.bonusSet.reps), completed: false, qe: { k, st: 'accepted' } });
        next.exercises[ei] = { ...next.exercises[ei], sets };
        return next;
      });
      return;
    }
    const reps = e.reps ? String(e.reps) : e.plusReps ? String(num(qReps) + e.plusReps) : null;
    patchSet(ei, fi, { qe: { k, st: 'accepted' }, ...(e.pct ? { weight: roundW(eventLoad(ex, fs, k)) } : {}), ...(reps ? { reps } : {}) });
  };
  const declineEvent = () => patchSet(ei, fi, { qe: { k: evOffered, st: 'declined' } });

  // ── Level up: weight increases you've earned, checked once as the workout
  // starts (the same deterministic engine as the Progress page). The first time
  // you reach such an exercise, you set the weight your machine or plates
  // actually go to — the app never changes it on its own.
  const { settings: wsSettings, programs, reloadHistory, reloadPrograms } = useWorkout();
  const luAsked = useRef(false);
  useEffect(() => {
    if (workout.levelUps || luAsked.current || !wsSettings) return;
    luAsked.current = true;
    const names = new Set(exercises.filter((e) => !e.boss).map((e) => e.name));
    api.generateRecommendations(aggressionOf(wsSettings)).then((r) => {
      if (!r?.success) return;
      const found = {};
      (r.recommendations || []).forEach((x) => { if (names.has(x.exercise)) found[x.exercise] = { from: x.currentWeight, to: x.newWeight }; });
      updateWorkout((prev) => (prev && !prev.levelUps ? { ...prev, levelUps: found } : prev));
    }).catch(() => { /* offline: no prompt this session */ });
  }, [!!wsSettings]); // eslint-disable-line react-hooks/exhaustive-deps
  const lu = workout.levelUps?.[ex.name];
  const luOffer = !!(lu && !lu.done && fs && !fs.completed && !resting && kind !== 'cardio' && kind !== 'interval' && kind !== 'timed'
    && !ex.sets.some((x) => x.completed && x.type !== 'drop'));
  const [luW, setLuW] = useState(null); // the weight you've dialled in, before confirming
  useEffect(() => { setLuW(null); }, [ex.name]);
  const luWeight = luW ?? lu?.to;
  const [luBusy, setLuBusy] = useState(false);
  const acceptLu = async () => {
    const w = roundW(num(luWeight));
    setLuBusy(true);
    try {
      await acceptLevelUp({ exercise: ex.name, currentWeight: lu.from, newWeight: w, history, programs });
      // This session uses it straight away: every set not done yet (drops keep theirs).
      updateWorkout((prev) => {
        if (!prev) return prev;
        const next = { ...prev, exercises: [...prev.exercises], levelUps: { ...prev.levelUps, [ex.name]: { ...prev.levelUps[ex.name], done: 'accepted', w } } };
        next.exercises[ei] = { ...next.exercises[ei], sets: next.exercises[ei].sets.map((x) => (x.completed || x.type === 'drop' ? x : { ...x, weight: w })) };
        return next;
      });
      haptics.success();
      setToast({ text: `${ex.name} → ${fmtW(w)} kg`, label: 'LEVEL UP', at: Date.now() });
      reloadHistory?.(); reloadPrograms?.();
    } catch { /* keep the prompt so it can be tried again */ }
    setLuBusy(false);
  };
  const snoozeLu = () => {
    updateWorkout((prev) => (prev ? { ...prev, levelUps: { ...prev.levelUps, [ex.name]: { ...prev.levelUps[ex.name], done: 'snoozed' } } } : prev));
    snoozeLevelUp({ exercise: ex.name, currentWeight: lu.from }).then(() => reloadHistory?.()).catch(() => {});
  };

  // The combo explains itself at the start of a rest: in full the first few times, then briefly.
  const comboNow = quest && fx.combo ? workout.qCombo || 0 : 0;
  if (comboNow >= 2 && resting && qHit && comboTip.current.at !== qHit.at) {
    let seen = COMBO_TIP_TIMES;
    try { seen = +localStorage.getItem(COMBO_TIP_KEY) || 0; } catch { /* treat as seen */ }
    comboTip.current = { at: qHit.at, full: seen < COMBO_TIP_TIMES, seen };
  }
  // Long enough to type out and read (the typewriter does ~45 characters a second, plus pauses).
  const restIn = resting ? timer.total - timer.remaining : 99;
  const comboRestLine = qHit?.lost && fx.combo && resting && restIn < 10
    ? 'Combo lost: that set took over 2:30 from GO. Keep the next within 2:30 to build it back up.'
    : comboNow >= 2 && resting && restIn < (comboTip.current.full ? 12 : 6)
    ? (comboTip.current.full
      ? `Combo ×${comboNow}! Log your next set within 2:30 of GO to keep it going — +${comboXp(comboNow + 1)} XP a set.`
      : `Combo ×${comboNow} — keep the pace (+${comboXp(comboNow + 1)} XP a set).`)
    : null;
  // Count each full explainer once (per rest), so it shortens after a few.
  useEffect(() => {
    const c = comboTip.current;
    if (c.full && c.at && !c.saved) { c.saved = true; try { localStorage.setItem(COMBO_TIP_KEY, String((c.seen || 0) + 1)); } catch { /* private mode */ } }
  }, [comboTip.current.at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quest phase: victory → hit → setting off → rest/walk → encounter → battle.
  let qPhase = 'battle', qT = 0, qStart = 0, qMsg = '', taunt = null;
  // The rest scroll: the monster's taunt (wrapping a real form tip) when the script has one.
  const tauntLines = script?.rest?.[ex.name]?.length ? script.rest[ex.name] : null;
  const restLine = quest && readScrolls() ? ((l) => l[Math.floor(seeded(`${qKey}|${ci}|${fi}|rest`) * l.length)])(tauntLines || REST_LINES) : null;
  const mon0 = quest ? monsterOf(exercises, block, ci, prof.theme) : null;
  const isBossBlock = !!ex.boss;
  const mon = mon0 && isBossBlock ? { ...mon0, name: (wBoss?.name || 'The Boss').toUpperCase(), species: 'WEEKLY BOSS', boss: bossSprite(bossWk, prof.theme) } : mon0;
  // The monster as the dialogue names it: the boss by its name, others by species.
  const foe = !mon ? '' : isBossBlock ? wBoss?.name || 'The Boss' : titleCase(mon.species);
  if (quest) {
    const now = Date.now(), since = (t) => (now - t) / 1000;
    if (qWin && since(qWin.at) >= 0 && since(qWin.at) < 3.8) { qPhase = 'victory'; qStart = qWin.at; }
    else if (qHit && qHit.bi === ci && since(qHit.at) < hitDur(qHit)) { qPhase = 'attack'; qStart = qHit.at; }
    else if (introOn) qPhase = 'walk';
    else if (resting) qPhase = blockStarted ? 'rest' : 'walk';
    else if (!blockStarted && since(encAt) < 2.5) { qPhase = 'encounter'; qStart = encAt; }
    else if (!blockStarted && encAt) qStart = encAt + 2500; // battle entry: bars wipe out, monster slides in
    qT = qStart ? since(qStart) : 9;
    // The taunt plays as a cut-in once per exercise: in the rest after its first
    // working set (a drop chain is one), and only if it has more sets to come.
    const work = ex.sets.filter((x) => x.type !== 'drop');
    if (qPhase === 'rest' && tauntLines && restLine && work.length > 1 && work.filter((x) => x.completed).length === 1) {
      const k = `${ci}|${ei}`;
      if (!tauntAt.current[k] && timer.total - timer.remaining < 2) tauntAt.current[k] = now;
      if (tauntAt.current[k]) taunt = { text: restLine, at: tauntAt.current[k] };
    }
    const won = block.indices.flatMap((i) => exercises[i].sets.filter((x) => x.completed));
    const vLines = script?.victory?.length ? script.victory : VICTORY_LINES;
    const vLine = fillLine(vLines[Math.floor(seeded(`${qKey}|${ci}|win`) * vLines.length)], {
      name: foe, kg: Math.round(won.reduce((a, x) => a + num(x.weight) * num(x.reps), 0)).toLocaleString(), sets: won.length });
    qMsg = qPhase === 'victory' ? (qT < 1.4 ? vLine : qWin.msg)
      : qPhase === 'attack' ? qHit.msg
      : qPhase === 'walk' ? (introOn ? `${heroN} sets out across the meadow. Something is out there…` : `${heroN} pushes deeper. Rest up while ${lands[Math.min(ci, lands.length - 1)].walk}…`)
      : qPhase === 'rest' ? (comboRestLine || `${foe} is catching its breath…`)
      : qPhase === 'encounter' ? 'Something stirs in the dark…'
      : evKey ? evText(evKey)
      : blockStarted ? `${foe} gets back up.` : isBossBlock ? `${foe} blocks your path! One set to failure — make it count.` : `A wild ${foe} appears!`;
    if (!fs?.completed && kind !== 'cardio' && kind !== 'interval') {
      completeLabel = roundMode
        ? (nextInRound >= 0 ? 'Attack · next exercise' : `Attack · finish round ${rd + 1}`)
        : `Attack · ${completeLabel.replace(/^Complete /, '')}`;
    }
  }
  // When the set in front of you went live: rest ended, battle began, or the last hit landed.
  const liveAt = Math.max(goAt || 0, encAt ? encAt + 2500 : 0, qHit ? qHit.at + hitDur(qHit) * 1000 : 0, new Date(workout.startTime).getTime() || 0);
  const liveSet = quest && qPhase === 'battle' && !resting && fs && !fs.completed;
  // Gauntlet: a running cardio timer, or an interval's work phase, is a run past
  // small monsters; an interval's rest is the hero getting their breath back.
  let gauntlet = null;
  if (quest && fx.gauntlet && qPhase === 'battle') {
    if (kind === 'cardio' && cardioOn[ei]?.on) gauntlet = cardioOn[ei].phase === 'rest' ? 'rest' : 'run';
    else if (kind === 'interval' && fs && !fs.completed) {
      const ph = computePhase(fs.intervalCountInStartMs, fs.intervalTimerStartMs, fs.intervalWork || 30, fs.intervalRest || 30, fs.intervalTotal || 180).phase;
      gauntlet = ph === 'work' ? 'run' : ph === 'rest' ? 'rest' : null;
    }
  }
  // Cardio and interval exercises are gauntlet-style for their whole duration,
  // but `gauntlet` above only goes truthy once the timer is actually running. At
  // battle entry it is still null, so the canvas battle ground would latch on and
  // then swap back to the travel scene the moment the timer started. The stage
  // needs to know the EXERCISE is gauntlet-style, not just that one is active.
  const gauntletEx = !!(quest && fx.gauntlet && (kind === 'cardio' || kind === 'interval'));

  // The chase: the monster flees as the gauntlet begins, HERO cuts through its
  // minions, and it comes back into view over the last 15% — finishing catches it.
  let chase = null;
  if (gauntlet) {
    if (!chaseAt.current[ci]) chaseAt.current[ci] = Date.now();
    const k = kind === 'cardio' ? cardioOn[ei]?.progress ?? null
      : fs?.intervalTimerStartMs ? Math.min(1, Math.max(0, (Date.now() - fs.intervalTimerStartMs) / ((fs.intervalTotal || 180) * 1000))) : null;
    chase = { from: chaseAt.current[ci], k };
    const fleeing = Date.now() - chase.from < 2600, closing = k != null && k >= 0.85;
    qMsg = fleeing ? `${foe} flees! ${heroN} gives chase…`
      : closing ? `${heroN} is closing in on ${foe}!`
      : gauntlet === 'rest' ? `${heroN} catches their breath between rounds.`
      : `${heroN} runs ${foe}'s gauntlet — its minions keep coming!`;
  }
  // Spell charge: timed sets fill to their own clock, others over ~3 s a rep.
  let charge = null;
  if (liveSet && fx.charge && kind !== 'cardio' && !gauntlet) {
    // `timed`: the set runs on a clock, so it charges a special for every hero.
    if (evActive && EVENTS[evActive].timed && fs.qe.at) charge = { from: fs.qe.at, dur: EVENTS[evActive].timed * 1000, timed: true };
    else if (kind === 'bfr' && fs.bfrStartMs) charge = { from: fs.bfrStartMs, dur: 90000, timed: true };
    else if (kind === 'timed') charge = fs.timedStartMs ? { from: fs.timedStartMs - (fs.timedDoneSec || 0) * 1000, dur: (fs.timedSec || 60) * 1000, timed: true } : null;
    else if (kind === 'interval') charge = fs.intervalTimerStartMs ? { from: fs.intervalTimerStartMs, dur: (fs.intervalTotal || 180) * 1000, timed: true } : null;
    else charge = { from: liveAt, dur: Math.max(20, (num(shownReps(ex, fs, st)) || lowRep(ex)) * 3) * 1000 };
  }
  const chargeK = charge ? Math.min(1, Math.max(0, (Date.now() - charge.from) / charge.dur)) : 0;
  // Long timed work (cardio, intervals) never makes the monster doze or ends a combo.
  const timedWork = kind === 'cardio' || kind === 'interval' || kind === 'timed';
  const dozing = !!(liveSet && fx.doze && !timedWork && Date.now() - liveAt > DOZE_MS);
  const setsLeftHere = block.indices.reduce((a, i) => a + exercises[i].sets.filter((x) => !x.completed).length, 0);
  const lastStand = !!(liveSet && fx.last && !timedWork && !evKey && !isBossBlock && (setsLeftHere === 1 || (chain && setsLeftHere === chain.length)));
  if (quest && !bossAsk) { // both only during a live battle set
    if (dozing) qMsg = `${foe} has dozed off… strike now for a sneak attack!`;
    else if (lastStand) qMsg = `${foe} makes its last stand — finish it!`;
  }
  const dayK = quest && fx.daynight ? Math.min(1, Math.max(0, ((Date.now() - (new Date(workout.startTime).getTime() || Date.now())) / 60000 - 20) / 55)) : 0;
  const qShown = quest ? addXp(prof.lvl, prof.xp, questSession(exercises, mult).xp) : null;
  const qClear = quest && allClear && qPhase !== 'victory';
  if (qClear) { qPhase = 'walk'; qMsg = 'Quest clear! The last monster dropped a loot chest.'; }
  // The encounter only plays on the stage — the controls are usable straight away.
  if (quest && bossAsk) { qPhase = 'walk'; qMsg = wBoss?.cry ? `${wBoss.name}: “${wBoss.cry}”` : `A shadow falls across the path. ${wBoss?.name || 'The boss'} appears!`; }
  const qTravel = quest && (qPhase === 'walk' || qPhase === 'victory');
  const shownBlock = qPhase === 'victory' && qTravel ? nextOpenBlock(exercises, blocks, ci) : ci;
  const upNext = shownBlock < 0 ? -1 : (() => { const n = nextOpenBlock(exercises, blocks, shownBlock); return n === shownBlock ? -1 : n; })();
  const qReps = fs ? shownReps(ex, fs, st) : '';

  // The walk and the boss offer sit over the battle card, which stays laid out
  // underneath, so the lower half is the same size in every state.
  const overlay = bossAsk && wBoss ? (
          <BossAsk boss={wBoss} onFight={fightBoss} onSkip={skipBoss} />
  ) : qTravel ? (
          <QuestTravel exercises={exercises} blocks={blocks}
            defeated={qPhase === 'victory' || qClear ? ci : ci > 0 && blockDone(exercises, blocks[ci - 1]) ? ci - 1 : -1}
            next={qClear ? -1 : qPhase === 'victory' ? nextOpenBlock(exercises, blocks, ci) : ci}
            walking={qPhase === 'walk' || qPhase === 'victory'}
            intro={introOn ? { left: (introEnd - Date.now()) / 1000, total: 4, label: 'SETTING OFF' }
              : qPhase === 'victory' && !resting && qWin ? { left: (qWin.at + 3800 - Date.now()) / 1000, total: 3.8, label: 'ONWARD' } : null}
            timer={timer} onSkip={introOn ? () => setIntroOff(true) : qPhase === 'victory' ? skipVictory : skipRest}
            onClaim={qClear ? onQuestClear : null} />
  ) : null;

  const body = (
    <div className={`g-root flex flex-col ${dense ? 'min-h-full' : 'h-full'}`}>
      {/* Header */}
      <div className="px-5 pt-2 pb-2.5">
        <div className="flex justify-between items-end gap-3">
          <div className="min-w-0">
            <div className="g-label truncate ps-x">{workout.programName}{quest ? ' · QUEST' : ''}</div>
            <div className="mt-1 truncate q-head" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{workout.workoutName}</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="g-tab" style={{ font: `500 24px ${MONO}`, lineHeight: 1 }}>{elapsed}</div>
            <div className="mt-1 g-label ps-s" style={{ letterSpacing: '.12em', fontWeight: 400 }}>{setsLeft} SETS LEFT</div>
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

      <div className={`flex-1 px-3.5 pb-2 flex flex-col gap-2${dense ? '' : ' min-h-0'}`}>
        {quest && (
          <div className={`relative flex-shrink-0 overflow-hidden rounded-[28px]${qSkin?.st.bezel ? ' q-bezel' : ''}`}>
          <QuestStage phase={qPhase} start={qStart} monster={mon} hit={qHit} area={Math.min(ci, lands.length - 1)} theme={prof.theme}
            heroName={prof.hero} petKey={prof.pet} lvl={qShown.lvl} xp={qShown.xp}
            tint={readTint()} scanlines={readScanlines()} msg={qMsg}
            aura={(qPhase === 'battle' || qPhase === 'encounter') ? (isBossBlock ? '#fbbf24' : evKey ? EVENTS[evKey].color : lastStand ? '#ef4444' : null) : null}
            fx={fx} charge={charge} react={qReact} lastStand={lastStand} dozing={dozing} dayK={dayK} gauntlet={gauntlet} gauntletEx={gauntletEx} chase={chase}
            combo={comboNow} taunt={taunt}
            rest={qPhase === 'rest' ? { left: timer.remaining, total: timer.total } : null} />
          {/* Sits over the stage rather than inside it: QuestStage is shared with
              the title screen, and the trace only belongs in a running quest. */}
          <RepScope />
          </div>
        )}
        <div className={`grid grid-cols-[minmax(0,1fr)] ${dense ? 'flex-shrink-0' : 'flex-1 min-h-0'}`}
          style={{ maxHeight: cardH || undefined, minHeight: cardMin || undefined }}>
          {overlay && <div className="flex flex-col min-h-0" style={{ gridArea: '1 / 1', zIndex: 1 }}>{overlay}</div>}
          <div className="flex flex-col min-h-0" aria-hidden={!!overlay} style={{ gridArea: '1 / 1', ...(overlay ? { opacity: 0, pointerEvents: 'none' } : {}) }}>
        {kind === 'cardio' ? (
          // Same swipe handling as the other cards, so cardio blocks cycle too.
          <div
            onPointerDown={pd} onPointerMove={pm} onPointerUp={pu} onPointerCancel={pu} onClickCapture={swallowClick}
            className={`relative select-none ${dense ? 'flex-shrink-0' : 'flex-1 min-h-0'}`}
            style={{
              touchAction: swipeExercises ? 'pan-y' : 'none',
              transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 40}deg)`,
              transition: drag.anim ? 'transform .3s cubic-bezier(.2,1.2,.3,1)' : 'none',
              opacity: cardMoved ? Math.max(0.4, 1 - cardMoved / 600) : 1,
            }}>
            <CardioCard exercise={ex} exerciseIndex={ei} onUpdateSet={handlers.onUpdateSet}
              onUpdateExercise={handlers.onUpdateCardioExercise} onSubstitute={handlers.onSubstitute} onTimerActiveChange={onCardioTimer}
              focus={{ label: `BLOCK ${ci + 1} OF ${blocks.length}`, h: dense ? undefined : '100%' }} />
          </div>
        ) : (
          <div
            onPointerDown={pd} onPointerMove={pm} onPointerUp={pu} onPointerCancel={pu} onClickCapture={swallowClick}
            className={`relative bg-bg-1 rounded-[28px] q-card select-none ${dense ? 'flex-shrink-0' : 'flex flex-col min-h-0 overflow-hidden'}`}
            style={{
              padding: dense ? 16 : 20,
              // the one footprint — identical for every block kind
              height: dense ? undefined : '100%',
              touchAction: swipeExercises ? 'pan-y' : 'none',
              transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 40}deg)`,
              transition: drag.anim ? 'transform .3s cubic-bezier(.2,1.2,.3,1)' : 'none',
              opacity: cardMoved ? Math.max(0.4, 1 - cardMoved / 600) : 1,
            }}>
            {/* The hand-off pulse: one ring around the card, replayed per switch. */}
            {kind === 'superset' && swapN > 0 && !reduce && Date.now() - swap.at < 700 && (
              <span key={swapN} aria-hidden className="pointer-events-none absolute inset-0 rounded-[28px]"
                style={{ zIndex: 5, boxShadow: 'inset 0 0 0 1.5px rgba(96,165,250,0.75), inset 0 0 26px rgba(59,130,246,0.35)', animation: 'fx-handoff .66s ease-out both' }} />
            )}
            {kind === 'superset' && dense && (
              <SupersetTabs exercises={exercises} indices={block.indices} m={m} onPick={pickTab} className="mb-3.5" />
            )}

            <div className="flex justify-between items-center gap-2">
              {quest ? (
                // Quest: the exercise is the card's title; the monster is on the stage.
                <span className="min-w-0 flex-1 truncate q-head" style={{ fontSize: roundMode ? 17 : 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15 }}><TypewriterName text={cardName} /></span>
              ) : (
                <span className="g-label truncate">{isBossBlock ? 'WEEKLY BOSS · ONE SET TO FAILURE' : <>BLOCK {ci + 1} OF {blocks.length} · {kind === 'interval' ? 'INTERVAL' : kind === 'timed' ? `${mmss(fs?.timedSec || 60)} TIMED` : ex.targetReps}{ex.restSeconds ? ` · ${restLabel(ex.restSeconds)}` : ''}</>}</span>
              )}
              <span className="flex items-center gap-2 flex-shrink-0">
                {(kind === 'normal' || kind === 'drop' || roundMode) && repTracking(repSensor)
                  // With the rep tracker in play its state takes the tag slot: the tracker
                  // needs somewhere you look. In a quest REST/BATTLE stays on the stage.
                  ? <RepTag />
                  : quest && (kind === 'normal' || kind === 'drop' || roundMode)
                    ? <span className="g-tag" style={{ '--tag': resting ? '#f59e0b' : '#ff2222' }}>{resting ? 'REST' : 'BATTLE'}</span>
                    : <Tag kind={kind} />}
                <button onClick={() => setEditOpen(true)} aria-label="Edit exercise" className="w-8 h-8 -my-2 -mr-1 rounded-[8px] text-text-tertiary active:bg-bg-2" style={{ font: `700 16px ${MONO}` }}>⋯</button>
              </span>
            </div>
            {!quest && (
              <div style={{ marginTop: 10, fontSize: dense ? 24 : 30, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.02, ...(dense ? {} : { height: '2.04em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>
                <div className="grid">
                  <span style={{ gridArea: '1 / 1' }}>
                    {ex.substituted && <span className="text-text-tertiary line-through mr-2" style={{ fontSize: '0.6em' }}>{ex.substituted.original}</span>}
                    <TypewriterName text={cardName} />
                  </span>
                  {/* Dense isn't clamped: size the line to the longest member's name so a hand-off can't grow the card */}
                  {dense && kind === 'superset' && block.indices.filter((xi) => xi !== ei).map((xi) => (
                    <span key={xi} aria-hidden style={{ gridArea: '1 / 1', visibility: 'hidden' }}>
                      {exercises[xi].substituted && <span className="mr-2" style={{ fontSize: '0.6em' }}>{exercises[xi].substituted.original}</span>}
                      {exercises[xi].name}_
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div key={`meta-${swapN}`} className={`mt-1.5 g-meta${quest ? ' truncate' : ''}`} style={fadeIn}>
              {quest ? `${isBossBlock ? 'Weekly boss · one set to failure' : `${ci + 1}/${blocks.length} · ${kind === 'interval' ? 'interval' : kind === 'timed' ? `${mmss(fs?.timedSec || 60)} timed` : `${String(ex.targetReps).replace('-', '–')} reps`}`}${ex.restSeconds ? ` · ${restLabel(ex.restSeconds)}` : ''} · ${lastLine[0].toLowerCase()}${lastLine.slice(1)}` : lastLine}
            </div>

            {!dense && kind !== 'interval' && (
              <div key={`pips-${swapN}`} className={`flex items-center ${quest ? 'gap-[4px] mt-2' : 'gap-[5px] mt-3'}`} style={fadeIn}>
                {(roundMode
                  ? Array.from({ length: supersetRounds(exercises, block.indices) }, (_, r) => ({ completed: roundDone(r), r }))
                  : ex.sets).map((s, i) => {
                  const on = roundMode ? i === rd : chain ? chain.includes(i) : i === fi, small = !roundMode && s.type === 'drop';
                  return (
                    <button key={i} onClick={() => (roundMode ? setFset(setIndexForRound(lead0, i)) : setFset(i))}
                      style={{
                        flex: small ? '0 0 16px' : 1, height: small ? 20 : quest ? 24 : 34, borderRadius: small ? 7 : quest ? 9 : 12, padding: 0,
                        font: `500 ${quest ? 11 : 12}px ${MONO}`, transition: 'all .2s',
                        border: `1.5px solid ${on ? tagColor : 'transparent'}`,
                        background: s.completed ? 'var(--g-ok)' : small ? 'color-mix(in srgb, var(--g-drop) 25%, transparent)' : on && quest ? `color-mix(in srgb, ${tagColor} 18%, var(--color-bg-2))` : 'var(--color-bg-2)',
                        color: s.completed ? 'var(--g-ok-ink)' : on ? (quest ? 'var(--color-text-primary)' : 'var(--color-accent)') : 'var(--color-text-tertiary)',
                        animation: s.completed ? 'fx-pop .35s cubic-bezier(.2,1.6,.4,1)' : 'none',
                      }}>
                      {s.completed ? '✓' : small ? '' : roundMode ? i + 1 : setLabel(ex.sets, i)}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Focus: the rest view is always laid out and sets the size; the
                set controls float inside that same box and shrink to fit (with
                the superset tabs and any event), so the card never changes size
                between rest, sets, drop chains or events. Only one is visible. */}
            {!dense && kind !== 'interval' && fs && (
              <div className="relative mt-3 flex-1 min-h-0" style={{ containerType: 'size' }}>
                <div key={`rest-${resting}`} aria-hidden={!resting} className="flex flex-col" style={{ visibility: resting ? 'visible' : 'hidden', animation: resting ? 'fx-pop .4s cubic-bezier(.2,1.4,.4,1) both' : 'none' }}>
                  {quest ? <QuestRest timer={timer} next={restNext} onSkip={skipRest}
                    scroll={restLine && tipOf(restLine)} />
                    : <RestRing timer={timer} next={restNext} onSkip={skipRest} />}
                </div>
                <div key={`set-${resting}`} aria-hidden={resting} className="absolute inset-0 flex flex-col min-h-0" style={{ visibility: resting ? 'hidden' : 'visible', animation: resting ? 'none' : 'fx-fade .25s both' }}>
                  {/* Everything under the tabs is the member's own; on a hand-off it's
                      replaced outright and faded up, so two members never share the card. */}
                  <div key={`sw-${swapN}`} className="flex-1 min-h-0 flex flex-col" style={fadeIn}>
                  {luOffer && (
                    <div className="rounded-[18px] p-3.5 fx-in flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--color-success) 12%, transparent)', boxShadow: 'inset 0 0 0 1.5px var(--color-success)' }}>
                      <div className="flex justify-between items-center gap-2">
                        <span style={{ font: `700 11px ${MONO}`, letterSpacing: '.16em', color: 'var(--color-success)' }}>LEVEL UP EARNED</span>
                        <span className="text-text-tertiary" style={{ font: `500 9px ${MONO}`, letterSpacing: '.1em' }}>WAS {fmtW(lu.from)} KG</span>
                      </div>
                      <div className="mt-1.5 text-[13px] text-text-secondary" style={{ lineHeight: 1.4 }}>
                        Suggested {fmtW(lu.to)} kg. Set the next weight your machine or plates actually go to.
                      </div>
                      <div className="mt-2.5 flex items-center gap-2">
                        <button onClick={() => setLuW(roundW(Math.max(0, num(luWeight) - 2.5)))} aria-label="Less" className="w-12 h-11 rounded-[12px] bg-bg-3 text-text-primary" style={{ font: `500 18px ${MONO}` }}>−</button>
                        <span className="flex-1 text-center g-tab" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>{fmtW(luWeight)}<span className="text-text-tertiary" style={{ fontSize: 13, fontWeight: 600 }}> kg</span></span>
                        <button onClick={() => setLuW(roundW(num(luWeight) + 2.5))} aria-label="More" className="w-12 h-11 rounded-[12px] bg-bg-3 text-text-primary" style={{ font: `500 18px ${MONO}` }}>+</button>
                      </div>
                      <div className="flex gap-2 mt-2.5">
                        <button onClick={snoozeLu} className="flex-1 h-11 rounded-[14px] bg-bg-2 text-text-secondary font-bold text-[13px]">Not yet</button>
                        <button onClick={acceptLu} disabled={luBusy} className="flex-[2] h-11 rounded-[14px] font-extrabold text-[14px] disabled:opacity-60" style={{ background: 'var(--color-success)', color: '#fff' }}>
                          {luBusy ? 'Saving…' : `Use ${fmtW(luWeight)} kg`}
                        </button>
                      </div>
                    </div>
                  )}
                  {evKey && !resting && !luOffer && (
                    <div className={`rounded-[18px] p-3.5 fx-in flex-shrink-0 ${evOffered ? '' : 'mb-2.5'}`} style={{ background: `color-mix(in srgb, ${EVENTS[evKey].color} 13%, transparent)`, boxShadow: `inset 0 0 0 1.5px ${EVENTS[evKey].color}` }}>
                      <div className="flex justify-between items-center gap-2">
                        <span style={{ font: `700 11px ${MONO}`, letterSpacing: '.16em', color: EVENTS[evKey].color }}>{EVENTS[evKey].title}</span>
                        <span className="text-text-tertiary" style={{ font: `500 9px ${MONO}`, letterSpacing: '.12em' }}>{evActive ? 'ACCEPTED' : 'RANDOM EVENT'}</span>
                      </div>
                      {evOffered && <div className="mt-1.5 text-[14px] font-bold" style={{ lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{evText(evKey)}</div>}
                      <div className="mt-1 text-text-secondary" style={{ font: `400 11px/1.5 ${MONO}`, ...(evOffered ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>
                        {evAct(evKey)}
                        {EVENTS[evKey].xp > 1 ? ` · ${EVENTS[evKey].xp}× XP` : ''}{EVENTS[evKey].crit ? ' · crit' : ''}{EVENTS[evKey].pack ? ' · +1 card pack' : ''}
                      </div>
                      {evActive && EVENTS[evActive].timed && (
                        timedLeft === null ? (
                          <button onClick={() => patchSet(ei, fi, { qe: { ...fs.qe, at: Date.now() } })} className="w-full mt-2.5 h-10 rounded-[14px] font-extrabold text-[14px]"
                            style={{ background: EVENTS[evActive].color, color: '#050505' }}>Start {EVENTS[evActive].timed} s</button>
                        ) : (
                          <div className="mt-3 flex items-center gap-3">
                            <span className="g-tab" style={{ font: `500 26px ${MONO}`, color: timedLeft > 0 ? 'var(--color-text-primary)' : EVENTS[evActive].color }}>{mmss(timedLeft + (timedLeft > 0 ? 0.999 : 0))}</span>
                            <div className="flex-1 h-1.5 rounded-[3px] bg-bg-3 overflow-hidden">
                              <div className="h-full" style={{ width: `${(1 - timedLeft / EVENTS[evActive].timed) * 100}%`, background: EVENTS[evActive].color, transition: 'width .25s linear' }} />
                            </div>
                            <span className="text-text-secondary" style={{ font: `500 11px ${MONO}` }}>{timedLeft > 0 ? 'keep going' : 'time! log your reps'}</span>
                          </div>
                        )
                      )}
                      {evOffered && (
                        <div className="flex gap-2 mt-3">
                          <button onClick={declineEvent} className="flex-1 h-11 rounded-[14px] bg-bg-2 text-text-secondary font-bold text-[13px]">Not today</button>
                          <button onClick={acceptEvent} className="flex-[2] h-11 rounded-[14px] font-extrabold text-[14px]" style={{ background: EVENTS[evKey].color, color: '#050505' }}>Accept</button>
                        </div>
                      )}
                    </div>
                  )}
                  {/* An event on offer takes the space until it's answered. */}
                  {(evOffered || luOffer) && !resting ? <div className="flex-1" /> : roundMode ? (
                    <DropChain rows={roundRows} wide />
                  ) : chain ? (
                    <DropChain rows={chain.map((j) => {
                      const isAct = j === activeSi && !ex.sets[j].completed;
                      return {
                        key: j, done: !!ex.sets[j].completed, drop: ex.sets[j].type === 'drop', active: isAct && gLiveHere,
                        live: isAct && gLiveHere && gPhase === 'counting',
                        label: setLabel(ex.sets, j),
                        weight: fmtW(shownWeight(ex.sets, j)), reps: shownReps(ex, ex.sets[j], st),
                        onStep: (f, d) => step(ei, j, f, d), onToggleFail: () => toggleFail(ei, j),
                      };
                    })} />
                  ) : kind === 'timed' ? (
                    fs.completed ? <div className="flex-1" /> : (
                      <TimedBlock big set={fs} onPatch={(p) => patchSet(ei, fi, p)} onDone={() => complete(ei, fi)} />
                    )
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 flex-1 min-h-0" style={{ containerType: 'size' }}>
                      <Stepper label="KG" value={fmtW(fs.weight)} onDec={() => step(ei, fi, 'weight', -2.5)} onInc={() => step(ei, fi, 'weight', 2.5)}
                        onKeypad={() => setKpad('')} />
                      <Stepper label="REPS" value={shownReps(ex, fs, st)} onDec={() => step(ei, fi, 'reps', -1)} onInc={() => step(ei, fi, 'reps', 1)}
                        live={gLiveHere && gPhase === 'counting'}
                        toggle={canFail(fs) && !gLiveHere ? { label: shownReps(ex, fs, st) === 'failure' ? 'TO REPS' : 'TO FAIL', onClick: () => toggleFail(ei, fi) } : null} />
                    </div>
                  )}
                  {kind === 'bfr' && !fs.completed && (
                    <BFRBlock set={fs}
                      onStart={() => patchSet(ei, fi, { bfrStartMs: Date.now() })}
                      onStop={() => patchSet(ei, fi, { bfrStartMs: null })}
                      onDone={() => complete(ei, fi)} />
                  )}
                  {gCard && gPhase === 'idle' ? (
                    // START SET stands where the attack button does: the set is
                    // logged with the attack once the tracker has counted it.
                    <button onClick={startGuided}
                      className="mt-2.5 w-full h-[50px] flex-shrink-0 rounded-[18px] font-extrabold text-[17px] active:scale-[.98] q-cta"
                      style={{ background: repSensor.holdFailed ? '#f59e0b' : '#ff2222', color: '#fff' }}>
                      {repSensor.holdFailed ? 'Not still enough · Start set again' : 'Start set'}
                    </button>
                  ) : gCard && gPhase === 'hold' ? (
                    <button onClick={repSensor.cancelSet}
                      className="mt-2.5 w-full h-[50px] flex-shrink-0 rounded-[18px] font-extrabold text-[17px] bg-bg-3 text-text-secondary">
                      Hold still · tap to cancel
                    </button>
                  ) : (!isTimed || ((kind === 'bfr' || kind === 'timed') && fs.completed)) && (
                    <button onClick={() => (gLiveHere && gMulti ? advanceGuided() : complete(ei, chainEnd, chain))}
                      className={`mt-2.5 w-full h-[50px] flex-shrink-0 rounded-[18px] font-extrabold text-[17px] transition-colors active:scale-[.98]${finishedBtn ? '' : ' q-cta'}`}
                      style={{ background: finishedBtn ? 'var(--g-ok-soft)' : 'var(--color-accent)', color: finishedBtn ? 'var(--color-success)' : 'var(--color-on-accent)' }}>
                      <Glyph k="x" />{completeLabel}
                    </button>
                  )}
                  </div>
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
                <div className="grid mt-1">
                {/* Same idea for the rows: blank stand-ins for each other member's sets
                    (a row is py-[3px] around 40px controls) hold the card at the
                    longest member's height. */}
                {kind === 'superset' && block.indices.filter((xi) => xi !== ei).map((xi) => (
                  <div key={xi} aria-hidden className="flex flex-col gap-1" style={{ gridArea: '1 / 1', visibility: 'hidden' }}>
                    {exercises[xi].sets.map((_, i) => <div key={i} className="py-[3px]"><div className="h-10" /></div>)}
                  </div>
                ))}
                <div key={`rows-${swapN}`} className="flex flex-col gap-1 self-start" style={{ gridArea: '1 / 1', ...fadeIn }}>
                  {ex.sets.map((s, i) => {
                    const on = i === fi;
                    const pill = (field, val) => (
                      <div className="flex items-center bg-bg-2 rounded-[11px] h-10">
                        <button onClick={() => step(ei, i, field, field === 'weight' ? -2.5 : -1)} className="w-7 h-10 text-text-tertiary" style={{ font: `500 15px ${MONO}` }}>−</button>
                        {field === 'reps' && canFail(s)
                          ? <button onClick={() => toggleFail(ei, i)} aria-label={val === 'failure' ? 'Switch to reps' : 'Switch to failure'} className="flex-1 min-w-0 text-center g-tab truncate" style={{ fontSize: val.length > 5 ? 12 : 17, fontWeight: 800 }}>{val}</button>
                          : <span className="flex-1 text-center g-tab truncate" style={{ fontSize: val.length > 5 ? 12 : 17, fontWeight: 800 }}>{val}</span>}
                        <button onClick={() => step(ei, i, field, field === 'weight' ? 2.5 : 1)} className="w-7 h-10 text-text-tertiary" style={{ font: `500 15px ${MONO}` }}>+</button>
                      </div>
                    );
                    return (
                      <div key={i} className="grid gap-1.5 items-center py-[3px] rounded-[12px] transition-opacity"
                        style={{ gridTemplateColumns: '30px minmax(0,1fr) minmax(0,1fr) 40px', opacity: s.completed && !on ? 0.55 : 1, color: s.completed ? 'var(--color-success)' : 'var(--color-text-primary)' }}>
                        <span className="text-center" style={{ font: `500 12px ${MONO}`, color: s.type === 'drop' ? 'var(--g-drop)' : 'var(--color-text-tertiary)' }}>{setLabel(ex.sets, i)}</span>
                        {pill('weight', fmtW(s.weight))}
                        {s.type === 'timed'
                          ? <div className="flex items-center justify-center bg-bg-2 rounded-[11px] h-10 g-tab" style={{ font: `700 14px ${MONO}`, color: 'var(--g-timed)' }}>{mmss(s.timedSec || 60)}</div>
                          : pill('reps', shownReps(ex, s, st))}
                        {s.type === 'timed' && !s.completed ? (
                          <button onClick={() => { setFset(i); }} className="w-10 h-10 rounded-[12px]" style={{ border: `1.5px solid ${on ? 'var(--g-timed)' : 'var(--color-bg-3)'}`, color: 'var(--g-timed)', font: `600 9px ${MONO}` }}>TIME</button>
                        ) : s.type === 'bfr' && !s.completed ? (
                          <button onClick={() => { setFset(i); }} className="w-10 h-10 rounded-[12px]" style={{ border: `1.5px solid ${on ? 'var(--g-bfr)' : 'var(--color-bg-3)'}`, color: 'var(--g-bfr)', font: `600 9px ${MONO}` }}>BFR</button>
                        ) : (
                          <button onClick={() => complete(ei, i)} className="w-10 h-10 rounded-[12px] font-bold"
                            style={{ border: s.completed ? 'none' : `1.5px solid ${on ? 'var(--color-accent)' : 'var(--color-bg-3)'}`, background: s.completed ? 'var(--g-ok)' : 'transparent', color: 'var(--g-ok-ink)', animation: s.completed ? 'fx-pop .35s cubic-bezier(.2,1.6,.4,1)' : 'none' }}>
                            {s.completed ? '✓' : ''}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                </div>
              </>
            )}

            {dense && kind === 'timed' && fs && !resting && !fs.completed && (
              <TimedBlock set={fs} onPatch={(p) => patchSet(ei, fi, p)} onDone={() => complete(ei, fi)} />
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
                        style={{ font: `500 12px ${MONO}`, border: `1.5px solid ${i === fi ? 'var(--g-int)' : 'transparent'}`, background: s.completed ? 'var(--g-ok)' : 'var(--color-bg-2)', color: s.completed ? 'var(--g-ok-ink)' : 'var(--color-text-tertiary)' }}>
                        {s.completed ? '✓' : i + 1}
                      </button>
                    ))}
                  </div>
                )}
                {resting && <RestStrip timer={timer} onSkip={skipRest} />}
                <div className={dense ? '' : 'flex-1 min-h-0'} style={dense ? undefined : { containerType: 'size' }}>
                  <IntervalBlock key={`${ei}-${fi}`} set={fs}
                    onStamp={(p) => patchSet(ei, fi, p)}
                    onDone={() => complete(ei, fi)} />
                </div>
              </>
            )}

            {!quest && (
              <div className={`text-center text-text-tertiary truncate ${dense ? 'mt-3' : 'mt-auto pt-3'}`} style={{ font: `400 10px ${MONO}`, letterSpacing: '.06em' }}>
                {dense ? '← → exercises' : '← → sets · ↑ ↓ exercises'}
              </div>
            )}

            {gPhase === 'hold' && (
              // The calibration hold, as loud as the GO card: the phone is
              // propped up across the room and the number has to read from there.
              <div className="absolute inset-0 z-20 rounded-[28px] overflow-hidden flex flex-col items-center justify-center pointer-events-none"
                style={{ background: GO_RED_HEX, animation: 'fx-fade .2s both' }} role="status" aria-live="assertive">
                <span key={repSensor.holdLeft} style={{ color: '#fff', fontSize: 160, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, textShadow: '0 2px 20px rgba(0,0,0,.45)', animation: reduce ? 'none' : 'fx-pop .35s cubic-bezier(.2,1.6,.4,1)' }}>
                  {repSensor.holdLeft}
                </span>
                <span style={{ color: '#fff', marginTop: 10, font: `800 22px ${MONO}`, letterSpacing: '.18em' }}>HOLD STILL</span>
              </div>
            )}
            {goFlash && (
              // The panel only fades, clipped to the card; just the word pops, so
              // nothing grows past the card edge or slips under its contents.
              // Red panel, frames over it, the same red again as a filter, then
              // GO — so the hold after the frames hide is that flat red. In the
              // page at
              // z-20 keeps all three under the CRT layers, which ThemeContext
              // portals to <body> at z 9997+, so the scanlines read over it.
              <div key={goAt} className="absolute inset-0 z-20 rounded-[28px] overflow-hidden flex items-center justify-center pointer-events-none"
                style={{ background: GO_RED_HEX, animation: `fx-flash-bg ${GO_MS}ms ease both` }}>
                <GoFlash />
                <div className="absolute inset-0" style={{ background: GO_RED_HEX, opacity: GO_RED }} />
                <span style={{ position: 'relative', zIndex: 1, color: '#fff', fontSize: 112, fontWeight: 800, letterSpacing: '-0.05em', textShadow: '0 2px 20px rgba(0,0,0,.45)', animation: `fx-flash ${GO_MS}ms cubic-bezier(.2,1.2,.3,1) both` }}>GO</span>
              </div>
            )}
            {toast && (
              <ToastPR key={toast.at} text={toast.text} label={toast.label} onDone={() => setToast(null)} />
            )}
          </div>
        )}
          </div>
        </div>

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

        {/* One row, three equal parts: up next (always present, so the footprint never
            changes), finish, cancel. Dense keeps its own block list above and the old row. */}
        {dense ? (
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={onFinish} className="flex-1 h-[50px] rounded-[18px] bg-bg-1 text-success font-bold text-[15px]">Finish workout</button>
            <button onClick={onCancel} aria-label="Cancel workout" className="w-[50px] h-[50px] rounded-[18px] text-error" style={{ font: `600 15px ${MONO}`, background: 'color-mix(in srgb, var(--color-error) 14%, var(--color-bg-1))' }}>✕</button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 h-[56px] flex-shrink-0">
            <button onClick={() => upNext >= 0 && openBlock(upNext)} className="min-w-0 rounded-[18px] bg-bg-1 px-3 flex flex-col justify-center text-left">
              <span className="g-label ps-t" style={{ fontSize: quest ? 9 : 8 }}>{upNext >= 0 ? 'UP NEXT' : 'AFTER THIS'}</span>
              <span className="mt-0.5 flex min-w-0" style={{ fontSize: 13, fontWeight: 700 }}>
                <Ticker>{upNext >= 0 ? blockName(exercises, blocks[upNext]) : quest ? 'Last one, then the loot' : "Last one, then you're done"}</Ticker>
              </span>
            </button>
            <button onClick={onFinish} className="rounded-[18px] bg-bg-1 text-success font-bold text-[14px]">Finish</button>
            <button onClick={onCancel} aria-label="Cancel workout" className="rounded-[18px] text-error font-bold text-[14px] flex items-center justify-center gap-1.5"
              style={{ background: 'color-mix(in srgb, var(--color-error) 14%, var(--color-bg-1))' }}>
              <span style={{ font: `600 13px ${MONO}` }}>✕</span>Cancel
            </button>
          </div>
        )}
      </div>

      {handoff && (
        <Handoff exercises={exercises} blocks={blocks} from={handoff.from} to={handoff.to} stats={stats}
          onGo={() => { openBlock(handoff.to); setHandoff(null); }} />
      )}
      <EditSheet open={editOpen} onClose={() => setEditOpen(false)} ex={ex} ei={ei} exercises={exercises}
        handlers={handlers} onAddExercise={onAddExercise} />
      {/* portal: the shell is position:fixed, so its own stacking context would
          leave the sheet under the bottom nav */}
      {kpad !== null && createPortal(
        <>
          <div className="fixed inset-0 z-[8999]" style={{ background: 'rgba(0,0,0,.45)' }} onClick={() => setKpad(null)} />
          <div className="fixed inset-x-0 bottom-0 z-[9000] px-3 pt-3 rounded-t-[28px]"
            style={{ background: 'var(--color-bg-1)', boxShadow: 'var(--g-sheet-shadow)', height: 370, containerType: 'size',
              paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', animation: 'fx-up .3s cubic-bezier(.2,1.2,.3,1) both' }}>
            <Keypad value={kpad} placeholder={fmtW(fs.weight)} onChange={setKpad} onCancel={() => setKpad(null)}
              onDone={() => { if (kpad.trim() !== '') patchSet(ei, fi, { weight: roundW(num(kpad)) }); setKpad(null); }} />
          </div>
        </>,
        document.body
      )}
    </div>
  );
  // Quest battles come in with a short glitch decode, the title screen's effect cut down.
  return quest ? (
    <AsciiReveal className={dense ? 'min-h-full' : 'h-full'} preset="terminal" origin="top-left" duration="fast"
      media='[data-ascii="media"]' shimmer={false}>
      {body}
    </AsciiReveal>
  ) : body;
}

function ToastPR({ text, label = 'NEW PR', onDone }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => { const t = setTimeout(() => done.current(), 2400); return () => clearTimeout(t); }, []);
  return (
    <div className="absolute z-30 left-4 right-4 top-3.5 px-3.5 py-3 rounded-2xl flex items-center gap-2.5 pointer-events-none"
      style={{ background: 'var(--color-pr)', color: '#1f1400', animation: 'fx-toast 2.4s both', boxShadow: '0 10px 30px rgba(0,0,0,.3)' }}>
      <span style={{ font: `800 10px ${MONO}`, letterSpacing: '.16em' }}>{label}</span>
      <span className="text-[15px] font-extrabold truncate">{text}</span>
    </div>
  );
}
