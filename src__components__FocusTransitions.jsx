import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useBackHandler from '../hooks/useBackHandler';
import { useHaptics } from '../hooks/useHaptics';
import * as api from '../lib/api';
import { TAGS, blockName, buildBlocks, fmtW } from '../lib/focus';
import { moodState } from '../lib/mood';
import { useWorkout } from '../context/WorkoutContext';
import useCatalog from '../hooks/useCatalog';
import { sessionMuscles, REGION_LABEL } from '../lib/catalog';
import BodyMap from './BodyMap';
import QuestHeroCard from './QuestHeroCard';
import useQuest from '../hooks/useQuest';
import { questSession, commitQuest, rollLoot, xpMult, luckOf, oddsOf, REEL, RARITY } from '../lib/quest';

const MONO = 'var(--font-mono)';
const PENDING = /⏳?\s*AI_ANALYSIS_PENDING/;

// Full-screen layers sit above the bottom nav (z-50) so the nav is hidden
// for the countdown, analysis, PR and summary screens. They're portalled to
// <body> because App's content wrapper carries a CSS filter, and a filtered
// ancestor turns position:fixed into "fixed to that ancestor".
const LAYER = 'fixed inset-0 z-[200] bg-bg-0 g-root';
const portal = (node) => createPortal(node, document.body);

// ── 3 · 2 · 1 · GO ──────────────────────────────────────────────────
export function Countdown({ workout, onDone }) {
  const [n, setN] = useState(3);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const ts = [setTimeout(() => setN(2), 850), setTimeout(() => setN(1), 1700), setTimeout(() => setN(0), 2550), setTimeout(() => done.current(), 3250)];
    return () => ts.forEach(clearTimeout);
  }, []);
  const skip = useCallback(() => done.current(), []);
  useBackHandler(true, skip);
  useEffect(() => { moodState.countdown = true; return () => { moodState.countdown = false; }; }, []);
  const blocks = buildBlocks(workout.exercises);
  return portal(
    <div onClick={skip} className={`${LAYER} flex flex-col cursor-pointer fx-fade`}>
      <div className="px-7 fx-in" style={{ paddingTop: 'calc(70px + env(safe-area-inset-top, 0px))' }}>
        <div className="g-label" style={{ fontSize: 11, letterSpacing: '.16em' }}>{n > 0 ? 'GET UNDER THE BAR' : 'LIFT'}</div>
        <div className="mt-2" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1 }}>{workout.workoutName}</div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="relative w-[260px] h-[260px] flex items-center justify-center">
          <svg key={`r${n}`} width="260" height="260" viewBox="0 0 260 260" className="absolute inset-0 -rotate-90">
            <circle cx="130" cy="130" r="120" fill="none" stroke="var(--color-bg-3)" strokeWidth="8" />
            <circle cx="130" cy="130" r="120" fill="none" stroke="var(--color-accent)" strokeWidth="8" strokeLinecap="round" strokeDasharray="754"
              style={{ animation: 'fx-ring .85s linear both' }} />
          </svg>
          {/* paddingRight hands back the trailing negative letter-spacing, which
              would otherwise shift the glyphs right of the ring's centre. */}
          <div key={`n${n}`} className="relative"
            style={{ fontWeight: 800, fontSize: n > 0 ? 170 : 110, lineHeight: 1, letterSpacing: '-0.05em', paddingRight: '0.05em', color: n === 0 ? 'var(--color-accent)' : 'var(--color-text-primary)', animation: 'fx-pop .45s cubic-bezier(.2,1.6,.4,1) both' }}>
            {n > 0 ? n : 'GO'}
          </div>
        </div>
      </div>
      <div className="px-7 pb-[18px] flex flex-col">
        {blocks.slice(0, 7).map((b, i) => {
          const e = workout.exercises[b.indices[0]];
          return (
            <div key={i} className="flex items-center gap-2.5 py-[9px] text-sm font-semibold" style={{ borderTop: '1px solid var(--color-bg-3)', animation: `fx-in .35s ${0.15 + i * 0.07}s cubic-bezier(.2,1.3,.4,1) both` }}>
              <span className="w-[22px] text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{String(i + 1).padStart(2, '0')}</span>
              <span className="flex-1 truncate">{blockName(workout.exercises, b)}</span>
              <span className="text-text-tertiary flex-shrink-0" style={{ font: `400 10px ${MONO}` }}>{TAGS[b.kind]?.[0] || (b.kind === 'cardio' ? 'CARDIO' : `${e.sets.length} × ${e.targetReps}`)}</span>
            </div>
          );
        })}
      </div>
      <div className="px-7 text-center text-text-tertiary" style={{ font: `400 11px ${MONO}`, paddingBottom: 'calc(40px + env(safe-area-inset-bottom, 0px))' }}>Tap to skip</div>
    </div>
  );
}

// ── Finish → analysis → PR → summary ────────────────────────────────
// `result` is null until finishWorkout() resolves; the analysis screen paces
// itself to it. Coach notes are written server-side after the save, so they
// are polled from history until they land (or we give up and say so).
export function FinishFlow({ summary, result, failed, onDone, onProgress, quest = false }) {
  const haptics = useHaptics();
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState('analysis');
  const [notes, setNotes] = useState(null);
  const [notesGaveUp, setNotesGaveUp] = useState(false);
  const [prVal, setPrVal] = useState(summary.prs[0]?.best ?? 0);

  // Step 1 waits for the save; 2 and 3 are paced; 4 waits for notes (max ~15s).
  useEffect(() => {
    if (step === 0 && result) { const t = setTimeout(() => setStep(1), 600); return () => clearTimeout(t); }
    if (step === 1 || step === 2) { const t = setTimeout(() => setStep(step + 1), 850); return () => clearTimeout(t); }
    if (step === 3 && (notes !== null || notesGaveUp)) { const t = setTimeout(() => setStep(4), 300); return () => clearTimeout(t); }
    if (step === 3) { const t = setTimeout(() => setNotesGaveUp(true), 15000); return () => clearTimeout(t); }
    if (step === 4) {
      const t = setTimeout(() => setPhase(summary.prs.length ? 'pr' : 'summary'), 400);
      return () => clearTimeout(t);
    }
  }, [step, result, notes, notesGaveUp, summary.prs.length]);

  // Poll for the coach's notes for up to a minute — they keep arriving on the
  // summary screen if the analysis outlasts the checklist.
  useEffect(() => {
    const id = result?.workoutId;
    if (!id) return;
    let stop = false;
    const started = Date.now();
    const poll = async () => {
      try {
        const h = await api.getWorkoutHistory();
        const w = (h.workouts || []).find((x) => x.id === id);
        if (w && w.notes != null && !PENDING.test(w.notes)) {
          const text = w.notes.split('📱 Cardio Data')[0].trim();
          setNotes(text || '');
          return;
        }
      } catch { /* offline — try again */ }
      if (!stop && Date.now() - started < 60000) setTimeout(poll, 2000);
    };
    const t = setTimeout(poll, 1500);
    return () => { stop = true; clearTimeout(t); };
  }, [result?.workoutId]);

  // PR count-up from the old best to the new weight.
  useEffect(() => {
    if (phase !== 'pr') return;
    haptics.success();
    const p = summary.prs[0];
    let raf;
    const t0 = performance.now() + 300;
    const tick = (t) => {
      const k = Math.min(1, Math.max(0, (t - t0) / 700));
      const e = 1 - Math.pow(1 - k, 3);
      setPrVal(Math.round((p.best + (p.w - p.best) * e) * 2) / 2);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const auto = setTimeout(() => setPhase('summary'), 3200);
    return () => { cancelAnimationFrame(raf); clearTimeout(auto); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    moodState.finish = failed ? null : phase === 'pr' ? 'pr' : 'done';
  }, [phase, failed]);
  useEffect(() => () => { moodState.finish = null; }, []);

  const finish = useCallback(() => onDone(), [onDone]);
  useBackHandler(phase === 'summary', finish);

  if (failed) {
    return portal(
      <div className={`${LAYER} flex flex-col justify-center px-7 fx-fade`}>
        <div className="text-error" style={{ font: `500 11px ${MONO}`, letterSpacing: '.16em' }}>COULDN'T SAVE</div>
        <div className="mt-2" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>Your workout is still open</div>
        <p className="mt-3 text-sm text-text-secondary">{failed}</p>
        <button onClick={finish} className="mt-8 h-14 rounded-[18px] bg-accent font-extrabold" style={{ color: 'var(--color-on-accent)' }}>Back to workout</button>
      </div>
    );
  }

  if (phase === 'analysis') {
    const lines = ['Saving session', `Comparing with your past ${summary.name} sessions`, 'Checking progression on every lift', 'Coach is writing notes'];
    return portal(
      <div className={`${LAYER} flex flex-col justify-center px-7 fx-fade`}>
        <div className="text-accent fx-in" style={{ font: `500 11px ${MONO}`, letterSpacing: '.16em' }}>FINISHING</div>
        <div className="mt-2" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, animation: 'fx-in .3s .05s both' }}>{summary.name}</div>
        <div className="flex flex-col gap-3.5 mt-9">
          {lines.map((t, i) => {
            const done = step > i, active = step === i;
            return (
              <div key={i} className="flex items-center gap-3 text-base font-semibold"
                style={{ color: done || active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', opacity: step >= i ? 1 : 0.45, transition: 'opacity .3s, color .3s', animation: `fx-in .3s ${0.1 + i * 0.06}s both` }}>
                <span className="w-6 h-6 rounded-full flex-none flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: done ? 'var(--color-success)' : 'var(--color-bg-2)', transition: 'background .25s', animation: done ? 'fx-pop .35s cubic-bezier(.2,1.6,.4,1)' : 'none' }}>
                  {done ? '✓' : ''}
                </span>
                <span className="flex-1">{t}</span>
                {active && (
                  <span className="flex gap-[3px] fx-dots">
                    <span className="w-[5px] h-[5px] rounded-[3px] bg-accent" /><span className="w-[5px] h-[5px] rounded-[3px] bg-accent" /><span className="w-[5px] h-[5px] rounded-[3px] bg-accent" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-10 h-[3px] rounded-[2px] bg-bg-3 overflow-hidden">
          <div className="h-full bg-accent" style={{ width: `${Math.min(100, step * 25)}%`, transition: 'width .6s cubic-bezier(.2,1,.3,1)' }} />
        </div>
      </div>
    );
  }

  if (phase === 'pr') {
    const p = summary.prs[0];
    const delta = Math.round(Math.abs(p.w - p.best) * 10) / 10;
    return portal(
      <div onClick={() => setPhase('summary')} className={`${LAYER} flex flex-col items-center justify-center text-center cursor-pointer overflow-hidden fx-fade`}>
        <div className="absolute w-80 h-80 rounded-full" style={{ border: '2px solid var(--color-pr)', animation: 'fx-burst 1.4s .2s cubic-bezier(.2,.8,.3,1) both' }} />
        <div className="absolute w-80 h-80 rounded-full" style={{ border: '2px solid var(--color-pr)', animation: 'fx-burst 1.4s .45s cubic-bezier(.2,.8,.3,1) both' }} />
        <div className="relative" style={{ font: `700 12px ${MONO}`, letterSpacing: '.24em', color: 'var(--g-pr-ink)', animation: 'fx-in .3s .1s both' }}>NEW PERSONAL RECORD</div>
        <div className="relative mt-3.5 px-6" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', animation: 'fx-in .3s .2s both' }}>{p.name}</div>
        <div className="relative mt-1.5 g-tab" style={{ fontSize: 120, fontWeight: 800, letterSpacing: '-0.06em', lineHeight: 1, color: 'var(--color-pr)', animation: 'fx-pop .5s .3s cubic-bezier(.2,1.4,.4,1) both' }}>{prVal}</div>
        <div className="relative text-text-secondary" style={{ font: `500 14px ${MONO}`, animation: 'fx-in .3s .6s both' }}>
          kg × {p.r} · {p.assisted ? `−${delta} kg assistance` : p.w === p.best ? 'more reps at your best weight' : `+${delta} kg on your best`}
        </div>
        <div className="absolute text-text-tertiary" style={{ bottom: 'calc(48px + env(safe-area-inset-bottom, 0px))', font: `400 11px ${MONO}` }}>Tap to continue</div>
      </div>
    );
  }

  const dur = result?.duration ?? 0;
  const vol = summary.vol >= 10000 ? `${(summary.vol / 1000).toFixed(1)}t` : summary.vol.toLocaleString();
  const date = new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  const cell = (i) => ({ animation: `fx-in .4s ${0.3 + i * 0.08}s cubic-bezier(.2,1.3,.4,1) both` });
  return portal(
    <div className={`${LAYER} overflow-y-auto`}>
      <div className="max-w-xl mx-auto px-5 pb-8" style={{ paddingTop: 'calc(20px + env(safe-area-inset-top, 0px))' }}>
        <div className="text-success" style={{ font: `500 11px ${MONO}`, letterSpacing: '.16em', animation: 'fx-in .4s .05s both' }}>✓ WORKOUT COMPLETE</div>
        <div className="mt-2.5 origin-left" style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 0.95, animation: 'fx-pop .5s .1s cubic-bezier(.2,1.3,.4,1) both' }}>{summary.name}</div>
        <div className="mt-2 text-text-tertiary" style={{ font: `400 12px ${MONO}`, animation: 'fx-in .4s .2s both' }}>{summary.prog} · {date}</div>

        <div className="grid grid-cols-3 gap-2 mt-[22px]">
          {[[`${dur}m`, 'DURATION'], [vol, 'KG MOVED'], [String(summary.sets), 'SETS']].map(([v, l], i) => (
            <div key={l} className="px-3.5 py-4 rounded-[22px] bg-bg-1" style={cell(i)}>
              <div className="g-tab" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{v}</div>
              <div className="mt-1.5 g-label" style={{ letterSpacing: '.12em' }}>{l}</div>
            </div>
          ))}
        </div>

        {summary.prs.length > 0 && (
          <div className="mt-2 p-4 rounded-[22px]" style={{ background: 'var(--color-pr-soft)', animation: 'fx-in .4s .5s both' }}>
            <div style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em', color: 'var(--g-pr-ink)' }}>PERSONAL RECORDS</div>
            {summary.prs.map((p) => (
              <div key={p.name} className="flex justify-between mt-2 gap-3">
                <span className="text-base font-extrabold">{p.name}</span>
                <span style={{ font: `500 14px ${MONO}` }}>{fmtW(p.w)} kg × {p.r}</span>
              </div>
            ))}
          </div>
        )}

        {quest && <QuestChest exercises={summary.exercises} workoutId={result?.workoutId} />}
        <SessionMuscles exercises={summary.exercises} />
        <Strength rows={summary.strength} />

        <div className="mt-2 p-4 rounded-[22px] bg-bg-1" style={{ animation: 'fx-in .4s .65s both' }}>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-accent" style={{ background: 'var(--g-acc-soft)', font: `700 9px ${MONO}` }}>AI</span>
            <span className="g-label" style={{ fontWeight: 600 }}>COACH NOTES</span>
            {notes === null && !notesGaveUp && <span className="ml-auto flex gap-[3px] fx-dots"><span className="w-1 h-1 rounded-full bg-accent" /><span className="w-1 h-1 rounded-full bg-accent" /><span className="w-1 h-1 rounded-full bg-accent" /></span>}
          </div>
          <p className="mt-2.5 text-sm text-text-secondary whitespace-pre-line" style={{ lineHeight: 1.55, textWrap: 'pretty' }}>
            {notes || (notes === '' ? 'No coach notes this time — the analysis didn’t run.' : notesGaveUp ? 'The coach is still writing — the analysis will appear in History.' : 'Coach is writing notes…')}
          </p>
          <button onClick={onProgress} className="mt-3 w-full h-[46px] rounded-[15px] bg-bg-2 text-text-primary font-bold text-[13px] flex justify-between items-center px-4">
            <span>Check what's ready to level up</span><span className="text-success" style={{ fontFamily: MONO }}>→</span>
          </button>
        </div>

        <div className="mt-6 mb-1.5 g-label">EXERCISES</div>
        {summary.ex.map((x, i) => (
          <div key={x.name + i} className="flex items-center gap-3 py-3" style={{ borderTop: '1px solid var(--color-bg-3)', animation: `fx-in .35s ${0.75 + i * 0.05}s both` }}>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold truncate">{x.name}</div>
              <div className="mt-0.5 text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{x.sets}</div>
            </div>
            <span className="text-text-secondary" style={{ font: `500 13px ${MONO}` }}>{x.best}</span>
          </div>
        ))}
        <button onClick={finish} className="mt-6 w-full h-[58px] rounded-[20px] bg-accent font-extrabold text-[17px]" style={{ color: 'var(--color-on-accent)', animation: 'fx-in .4s 1s both' }}>Done</button>
      </div>
    </div>
  );
}

// What this session hit, on the body map (library-matched exercises only).
// 6 sets in one session reads as full colour.
function SessionMuscles({ exercises }) {
  const { settings } = useWorkout();
  const cat = useCatalog();
  if (!cat || !exercises) return null;
  const { sets, unmatched } = sessionMuscles(exercises, settings?.exerciseLinks, cat);
  const top = Object.entries(sets).sort((a, b) => b[1] - a[1]);
  if (!top.length && !unmatched.length) return null;
  return (
    <div className="mt-2 p-4 rounded-[22px] bg-bg-1" style={{ animation: 'fx-in .4s .55s both' }}>
      <div className="g-label">MUSCLES WORKED</div>
      {top.length > 0 && (
        <>
          <div className="mt-3"><BodyMap heat={sets} full={6} height={220} /></div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {top.map(([r, v]) => (
              <span key={r} className="px-2.5 h-7 inline-flex items-center gap-1.5 rounded-[10px] bg-bg-2 text-[12px] font-semibold">
                {REGION_LABEL[r]}<span className="text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{+v.toFixed(1)}</span>
              </span>
            ))}
          </div>
        </>
      )}
      {unmatched.length > 0 && (
        <p className="mt-3 text-text-tertiary" style={{ font: `400 11px ${MONO}`, lineHeight: 1.5 }}>
          Not on the map: {unmatched.join(', ')}. Match {unmatched.length > 1 ? 'them' : 'it'} in Settings → Exercise library.
        </p>
      )}
    </div>
  );
}

// Estimated 1RM per lift, against the last session that had one.
function Strength({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="mt-2 p-4 rounded-[22px] bg-bg-1" style={{ animation: 'fx-in .4s .6s both' }}>
      <div className="g-label">ESTIMATED 1RM</div>
      {rows.map((x) => {
        const d = x.prev === null ? null : Math.round((x.now - x.prev) * 2) / 2;
        return (
          <div key={x.name} className="flex items-baseline justify-between gap-3 mt-2.5">
            <span className="text-[15px] font-bold min-w-0 truncate">{x.name}</span>
            <span className="flex items-baseline gap-2 flex-shrink-0" style={{ font: `500 13px ${MONO}` }}>
              {x.prev !== null && <span className="text-text-tertiary">{fmtW(x.prev)} →</span>}
              <span>{fmtW(x.now)} kg</span>
              <span className="w-[52px] text-right" style={{ color: d > 0 ? 'var(--color-success)' : d < 0 ? 'var(--color-error)' : 'var(--color-text-tertiary)' }}>
                {d === null ? 'new' : d > 0 ? `+${fmtW(d)}` : d < 0 ? `−${fmtW(-d)}` : '='}
              </span>
            </span>
          </div>
        );
      })}
      <p className="mt-3 text-text-tertiary" style={{ font: `400 10px ${MONO}`, lineHeight: 1.5 }}>From your best set of 1–12 reps. Not shown for bodyweight or assisted lifts.</p>
    </div>
  );
}

// Quest Mode's reward: bank the quest's XP (+ a card pack) once the workout is
// saved, then open the loot chest. Both are keyed to the saved workout id in
// the profile, so a re-render or a reload can't award or roll them twice.
function QuestChest({ exercises, workoutId }) {
  const { prof, updProf } = useQuest();
  const [session] = useState(() => questSession(exercises, xpMult(prof, prof.lvl)));
  const [roll, setRoll] = useState(null); // { at, loot }
  const [cardOpen, setCardOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { if (workoutId) updProf((p) => commitQuest(p, workoutId, session)); }, [workoutId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!roll) return;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [roll]);

  const banked = !!workoutId && prof.lastQuest === workoutId;
  const opened = banked && prof.lastChest === workoutId;
  const t = roll ? (Date.now() - roll.at) / 1000 : 0;
  const rolling = roll && t < 2.4;
  const luck = luckOf(session.crits), od = oddsOf(luck);
  const open = () => {
    if (!banked || opened || roll) return;
    const loot = rollLoot(prof, session.crits);
    setRoll({ at: Date.now(), loot });
    setTimeout(() => updProf(() => ({ ...loot.prof, lastChest: workoutId })), 2400);
  };
  const reelI = Math.floor(Math.pow(t, 0.6) * 12);
  const loot = roll?.loot;
  const shown = roll && !rolling ? loot : null;
  const border = shown ? shown.color : opened ? '#2a2a2a' : 'var(--color-accent)';

  return (
    <>
      <div className="mt-2 p-4 rounded-[22px] bg-bg-1" style={{ animation: 'fx-in .4s .45s both' }}>
        <div className="flex justify-between items-baseline">
          <span style={{ font: `500 11px ${MONO}`, letterSpacing: '.16em', color: '#ff2222' }}>QUEST CLEAR · LV {prof.lvl}</span>
          <span className="text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{session.beaten}/{session.total} defeated</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-3">
          {[[`+${session.xp.toLocaleString()}`, 'XP'], [String(session.crits), 'CRITS'], ['+1', 'CARD PACK']].map(([v, l]) => (
            <div key={l} className="rounded-[14px] bg-bg-2 p-3 text-center">
              <div style={{ font: `500 9px ${MONO}`, letterSpacing: '.14em' }} className="text-text-tertiary">{l}</div>
              <div className="mt-1" style={{ font: `500 18px ${MONO}` }}>{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 p-3.5 rounded-[18px] bg-bg-2" style={{ boxShadow: `inset 0 0 0 1.5px ${border}` }}>
          <div className="flex-1 min-w-0">
            <div className="g-label">LOOT CHEST</div>
            {rolling ? (
              <div className="mt-1" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: RARITY[reelI % 4][1], transform: t < 2 ? `translateX(${reelI % 2 ? 2 : -2}px)` : 'none' }}>{REEL[reelI % REEL.length]}</div>
            ) : shown ? (
              <>
                <div className="mt-1 inline-block px-2 py-0.5 rounded-[8px]" style={{ font: `600 10px ${MONO}`, letterSpacing: '.2em', color: '#050505', background: shown.color }}>{shown.tier}</div>
                <div className="mt-1.5" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: shown.color }}>{shown.label}</div>
                <div className="mt-0.5 text-text-secondary" style={{ font: `400 10px ${MONO}` }}>{shown.sub} · saved to your hero card</div>
              </>
            ) : (
              <>
                <div className="mt-1" style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>{opened ? 'Opened' : banked ? '1 chest earned' : 'Saving your quest…'}</div>
                <div className="mt-0.5 text-text-secondary" style={{ font: `400 10px ${MONO}`, textWrap: 'pretty' }}>
                  {session.crits} crit{session.crits === 1 ? '' : 's'} → luck +{Math.round(luck * 100)}% · Rare {Math.round(od.r * 100)}% · Epic {Math.round(od.e * 100)}% · Legendary {Math.round(od.l * 100)}%
                </div>
              </>
            )}
          </div>
          <button onClick={shown || opened ? () => setCardOpen(true) : open} disabled={!banked || rolling}
            className="flex-shrink-0 h-12 px-4 rounded-[14px] font-extrabold text-sm disabled:opacity-45"
            style={{ background: shown || opened ? 'var(--color-bg-3)' : '#ff2222', color: '#fff' }}>
            {shown || opened ? 'Hero card' : 'Open'}
          </button>
        </div>
      </div>
      {cardOpen && <QuestHeroCard open onClose={() => setCardOpen(false)} />}
    </>
  );
}
