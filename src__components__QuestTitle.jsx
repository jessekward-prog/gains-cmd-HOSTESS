import { useEffect, useMemo, useRef, useState } from 'react';
import { AsciiReveal } from 'ascii-reveal';
import { useWorkout } from '../context/WorkoutContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import useQuest, { readTint, readScanlines } from '../hooks/useQuest';
import QuestStage from './QuestStage';
import ConfirmDialog from './ConfirmDialog';
import { useRepSensorCtx } from '../context/RepSensorContext';
import { sensorSupported } from '../hooks/useRepSensor';
import QuestHeroCard, { MiniHeroCard } from './QuestHeroCard';
import { isMarker } from '../lib/history';
import { buildBlocks } from '../lib/focus';
import { lvTitle, tierOf } from '../lib/quest';
import BossPanel from './BossPanel';
import TypewriterName from './TypewriterName';

const MONO = 'var(--font-mono)';
const parse = (p) => (typeof p.workouts === 'string' ? JSON.parse(p.workouts) : p.workouts) || [];

// Quest Mode's title screen (home → Quest): choose today's quest from your
// program (defaulting to the one that's up next) and begin. Favourites you've
// starred are pinned at the top with their quest-only alias.
export default function QuestTitle({ onNavigate }) {
  const { programs, workoutHistory, startWorkout, activeWorkout, cancelWorkout } = useWorkout();
  const { showToast } = useToast();
  const { prof, updProf } = useQuest();
  const { questSkin } = useTheme();
  const { sensor, setAlpha, setGuided } = useRepSensorCtx();

  const [cardOpen, setCardOpen] = useState(false);
  // Mounting the stage (sprite recolour + ground bake) blocks paint for the
  // best part of a second, and a reveal started during that gap plays out
  // invisibly. Hold the wave until the browser has painted a frame.
  const [settling, setSettling] = useState(true);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSettling(false)));
    return () => cancelAnimationFrame(id);
  }, []);

  // The wave draws every glyph on one canvas above the whole screen, so the
  // workouts that sit behind the sticky Begin quest bar decoded on top of its
  // buttons. Mask the canvas off from the bar's top edge, fading out over the
  // same span as the bar's own gradient, and follow the bar if the list is
  // scrolled mid-wave.
  const barRef = useRef(null);
  useEffect(() => {
    let overlay = null;
    const fit = () => {
      const bar = barRef.current;
      if (!overlay || !bar) return;
      const top = bar.getBoundingClientRect().top - overlay.getBoundingClientRect().top;
      const solid = top + (parseFloat(getComputedStyle(bar).paddingTop) || 0);
      overlay.style.maskImage = overlay.style.webkitMaskImage = `linear-gradient(to bottom, #000 ${top}px, transparent ${solid}px)`;
    };
    const onWave = (e) => {
      if (!barRef.current || !e.target.contains(barRef.current)) return;
      if (e.detail?.active) {
        overlay = e.target.querySelector(':scope > .ar-overlay');
        fit();
        document.addEventListener('scroll', fit, true);
      } else {
        document.removeEventListener('scroll', fit, true);
        if (overlay) overlay.style.maskImage = overlay.style.webkitMaskImage = '';
        overlay = null;
      }
    };
    document.addEventListener('asciireveal', onWave);
    return () => {
      document.removeEventListener('asciireveal', onWave);
      document.removeEventListener('scroll', fit, true);
    };
  }, []);

  const upNext = useMemo(() => {
    const last = (workoutHistory || []).find((w) => !isMarker(w));
    const program = programs.find((p) => p.name === last?.program_name) || programs[0];
    if (!program) return null;
    const ws = parse(program);
    const from = ws.findIndex((w) => w.name === last?.workout_name);
    let index = from < 0 ? 0 : (from + 1) % ws.length;
    for (let k = 0; k < ws.length && ws[index]?.variationOf; k++) index = (index + 1) % ws.length;
    return { program, index };
  }, [programs, workoutHistory]);
  // A quest already under way is what's selected (and continued) by default.
  const ongoing = useMemo(() => {
    if (!activeWorkout) return null;
    const p = programs.find((x) => x.name === activeWorkout.programName);
    const i = p ? parse(p).findIndex((w) => w.name === activeWorkout.workoutName) : -1;
    return p && i >= 0 ? { programId: p.id, index: i } : null;
  }, [activeWorkout, programs]);
  const [pick, setPick] = useState(() => (activeWorkout?.quest ? ongoing : null));
  const [confirm, setConfirm] = useState(false);
  const [askSensor, setAskSensor] = useState(false);
  const [askGuided, setAskGuided] = useState(false);
  const [openIds, setOpenIds] = useState(null); // null = just the selected workout's program
  const [allOpen, setAllOpen] = useState(false); // with favourites, every other workout sits in one dropdown
  const program = programs.find((p) => p.id === pick?.programId) || upNext?.program;
  const index = pick?.index ?? (program === upNext?.program ? upNext?.index : 0) ?? 0;
  const ws = program ? parse(program).map((w, i) => [w, i]) : [];
  // Every workout in every program can be a quest — up-next's program first.
  const groups = upNext ? [upNext.program, ...programs.filter((p) => p !== upNext.program)] : programs;

  // Favourites: pinned in order, with an optional quest-only alias. Drop any
  // whose program or workout has since been renamed or removed.
  const favs = useMemo(() => (prof.favs || []).map((f) => {
    const pg = programs.find((pp) => pp.name === f.p);
    const i = pg ? parse(pg).findIndex((w) => w.name === f.w) : -1;
    return i >= 0 ? { ...f, pg, i, w: parse(pg)[i] } : null;
  }).filter(Boolean), [prof.favs, programs]);
  const isFav = (p, w) => (prof.favs || []).some((f) => f.p === p && f.w === w);
  const aliasOf = (p, w) => (prof.favs || []).find((f) => f.p === p && f.w === w)?.alias || null;
  const toggleFav = (p, w) => updProf((pr) => {
    const list = pr.favs || [];
    return { ...pr, favs: list.some((f) => f.p === p && f.w === w)
      ? list.filter((f) => !(f.p === p && f.w === w))
      : [...list, { p, w }] };
  });
  const rename = (p, w) => {
    const cur = aliasOf(p, w) || w;
    const next = window.prompt('Rename this quest (empty to reset)', cur);
    if (next === null) return;
    const alias = next.trim();
    updProf((pr) => ({ ...pr, favs: (pr.favs || []).map((f) => (f.p === p && f.w === w ? { ...f, alias: alias && alias !== w ? alias : undefined } : f)) }));
  };

  const tier = tierOf(prof.lvl);
  const start = async () => {
    try { await startWorkout(program, index, { quest: true }); onNavigate('workout'); } catch (e) { showToast('Error starting quest: ' + e.message, 'error'); }
  };
  // The selected workout is the quest already running → carry on with it.
  const isOngoing = !!activeWorkout?.quest && !!ongoing && ongoing.programId === program?.id && ongoing.index === index;
  // Anything else never silently replaces a workout in progress.
  // The rep tracker is offered on the way into a quest, never mid-set, and the
  // answer only holds for this quest. A browser with no Web Bluetooth is never
  // asked a question it can't act on.
  const offerSensor = () => { if (sensorSupported()) setAskSensor(true); else start(); };
  const begin = () => {
    if (isOngoing) onNavigate('workout');
    else if (activeWorkout) setConfirm(true);
    else offerSensor();
  };
  const replace = async () => {
    setConfirm(false);
    try { await cancelWorkout(); } catch (e) { showToast('Error: ' + e.message, 'error'); return; }
    offerSensor();
  };
  const pairThenStart = async () => {
    setAskSensor(false);
    setAlpha(true);
    // requestDevice needs the tap that opened this dialog still counting as a
    // user gesture, so nothing may be awaited before connect().
    const ok = sensor.status === 'linked' ? true : await sensor.connect();
    // Guided counting is only worth offering once the sensor is actually on the
    // wrist — it is a per-set ritual, and there is nothing to guide without a
    // live link. A failed link goes straight into the quest instead.
    if (ok) { setAskGuided(true); return; }
    // The answer stands even when the link fails: the quest shows a grey
    // record dot, and tapping it tries again.
    showToast('Rep tracker not connected — tap the grey record dot in the battle to retry.', 'error');
    setGuided(false);
    start();
  };
  const skipSensor = () => { setAskSensor(false); setAlpha(false); setGuided(false); start(); };
  const chooseGuided = (on) => { setAskGuided(false); setGuided(on); start(); };

  const headerName = ws.find(([, i]) => i === index)?.[0]?.name;
  const headerAlias = program && headerName && aliasOf(program.name, headerName);

  // One workout button — shared by Favourites and the per-program lists.
  // `showFav` draws the pencil as well (favourites section only).
  const workoutRow = (pg, w, i, { showPencil = false, keyPrefix = '' }) => {
    const on = pg === program && i === index;
    const fav = isFav(pg.name, w.name);
    const alias = aliasOf(pg.name, w.name);
    const exs = w.exercises || [];
    const sets = exs.reduce((a, e) => a + (Number(e.sets) || 0), 0);
    const name = alias || w.name;
    return (
      <button key={`${keyPrefix}${pg.id}-${i}`} onClick={() => setPick({ programId: pg.id, index: i })} className="flex items-center gap-2 px-4 py-3.5 rounded-[18px] text-left"
        style={{ background: on ? 'rgba(255,34,34,.08)' : 'var(--color-bg-2)', boxShadow: `inset 0 0 0 1.5px ${on ? 'var(--color-accent)' : 'transparent'}` }}>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: on ? 'var(--color-accent)' : '#333' }} />
        <span className="flex-1 min-w-0">
          <span className="block truncate" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{name}</span>
          <span className="block mt-0.5 truncate text-text-secondary" style={{ font: `400 11px ${MONO}` }}>
            {alias ? `${w.name} · ` : ''}{buildBlocks(exs.map((e) => ({ ...e, sets: [] }))).length} monsters{sets ? ` · ${sets} sets` : ''} · {exs.map((e) => e.name).join(' · ')}
          </span>
        </span>
        {showPencil && (
          <span role="button" tabIndex={0} aria-label="Rename quest" onClick={(e) => { e.stopPropagation(); rename(pg.name, w.name); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); rename(pg.name, w.name); } }}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-text-tertiary" style={{ fontSize: 16 }}>✎</span>
        )}
        <span role="button" tabIndex={0} aria-label={fav ? 'Unpin from favourites' : 'Pin to favourites'}
          onClick={(e) => { e.stopPropagation(); toggleFav(pg.name, w.name); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); toggleFav(pg.name, w.name); } }}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center" style={{ fontSize: 18, color: fav ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
          {fav ? '★' : '☆'}
        </span>
      </button>
    );
  };

  return (
    // The screen decodes in through a character grid instead of snapping on.
    // `media` is opt-in only: the stage and the hero card animate themselves, and
    // the glyph grid would freeze a frame of them. The wrapper is held blank for
    // the settling frame, or panels that fill in late (the boss, the stage's
    // line) flash on screen before the wave hides them.
    //
    // The stage's *art* is skipped (`data-ascii` inside QuestStage): the
    // painted scene, the sprites and the hero card land at once, because
    // carrying them through the wave cost a third of the frame rate on a phone.
    // Its text decodes with everything else, so the whole screen boots.
    <AsciiReveal className="g-root flex flex-col min-h-full" preset="terminal" origin="top-left" duration="cinematic"
      media='[data-ascii="media"]' loading={settling} shimmer={false}
      style={settling ? { visibility: 'hidden' } : undefined}>
      <div className="px-5 pt-3 pb-3">
        <div className="g-label truncate ps-x">{program ? `${program.name} · QUEST` : 'QUEST'}</div>
        <div className="mt-1 truncate q-head" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
          {/* Retypes with the cursor whenever you pick a different quest (and now and then on its own). */}
          <TypewriterName text={headerAlias || headerName || 'Gains Quest'} />
        </div>
      </div>
      <div className="flex-1 px-3.5 pb-6 flex flex-col gap-2.5">
        <div className={questSkin?.st.bezel ? 'q-bezel flex-shrink-0' : 'contents'}>
        <QuestStage phase="title" area={0} heroName={prof.hero} petKey={prof.pet} lvl={prof.lvl} xp={prof.xp} theme={prof.theme}
          tint={readTint()} scanlines={readScanlines()} msg={prof.theme === 'cyberpunk' ? 'The neon night hums. Choose your quest, HERO.' : 'A new day dawns over the meadow. Choose your quest, HERO.'}
          title={{ line: `LV ${prof.lvl} · ${lvTitle(prof.lvl).toUpperCase()}`, color: tier[2] }}
          card={<MiniHeroCard onOpen={() => setCardOpen(true)} />} />
        </div>

        <BossPanel />

        <div data-ascii="surface" className="flex-shrink-0 bg-bg-1 rounded-[28px] q-card p-5">
          <div className="text-accent ps-t" style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em' }}>CHOOSE TODAY'S QUEST</div>
          {!program && (
            <div className="mt-3 text-sm text-text-secondary">No program yet. Make one in Programs and it becomes your quest list.</div>
          )}

          {favs.length > 0 && (
            <div className="mt-3">
              <div className="text-text-tertiary px-1 pb-2" style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em' }}>FAVOURITES</div>
              <div className="flex flex-col gap-1.5">
                {favs.map(({ pg, w, i }) => workoutRow(pg, w, i, { showPencil: true, keyPrefix: 'fav-' }))}
              </div>
            </div>
          )}

          {favs.length > 0 && program && (() => {
            const total = groups.reduce((n, pg) => n + parse(pg).length, 0);
            const sel = ws[index]?.[0];
            return (
              <button onClick={() => setAllOpen((o) => !o)} className="mt-4 w-full flex items-center gap-2 px-4 py-3.5 rounded-2xl bg-bg-2 text-left" style={{ marginBottom: allOpen ? 0 : 32 }}>
                <span className="flex-1 min-w-0">
                  <span className="block" style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em' }}>All workouts</span>
                  {sel && !isFav(program.name, sel.name) && (
                    <span className="block truncate text-accent" style={{ font: `400 10px ${MONO}`, marginTop: 2 }}>Selected: {sel.name}</span>
                  )}
                </span>
                <span className="text-text-tertiary flex-shrink-0" style={{ font: `400 10px ${MONO}` }}>{total}</span>
                <span className="text-text-tertiary inline-block transition-transform" style={{ transform: allOpen ? 'rotate(90deg)' : 'none', font: `500 14px ${MONO}` }}>›</span>
              </button>
            );
          })()}

          {(allOpen || favs.length === 0) && groups.map((pg, gi) => {
            const open = openIds ? openIds.includes(pg.id) : pg === program;
            const toggle = () => setOpenIds((ids) => {
              const cur = ids || (program ? [program.id] : []);
              return cur.includes(pg.id) ? cur.filter((x) => x !== pg.id) : [...cur, pg.id];
            });
            const n = parse(pg).length;
            return (
              <div key={pg.id} className="mt-2">
                {(groups.length > 1 || favs.length > 0) && (
                  <button onClick={toggle} className="w-full flex items-center gap-2 px-1 py-2.5 text-left">
                    <span className="flex-1 min-w-0 truncate" style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: pg === program ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{pg.name}</span>
                    <span className={`text-text-tertiary flex-shrink-0 ${['ps-s', 'ps-x', 'ps-o', 'ps-t'][gi % 4]}`} style={{ font: `400 10px ${MONO}` }}>{n} workout{n === 1 ? '' : 's'}</span>
                    <span className="text-text-tertiary inline-block transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none', font: `500 14px ${MONO}` }}>›</span>
                  </button>
                )}
                {(open || (groups.length === 1 && favs.length === 0)) && (
                  <div className="flex flex-col gap-1.5 fx-in">
                    {parse(pg).map((w, i) => workoutRow(pg, w, i, {}))}
                  </div>
                )}
              </div>
            );
          })}
          {/* Reverse vignette: the list fades to the card colour behind the buttons,
              and each button casts a dark halo, so nothing busy shows through.
              The wave is masked off here (barRef), so the labels can't decode
              on it: they fade in with the bar instead. */}
          <div ref={barRef} data-ascii="fade" className="flex gap-2 sticky bottom-0 -mx-5 px-5 pb-3" style={{ marginTop: -28, paddingTop: 44, borderRadius: '0 0 28px 28px', background: 'linear-gradient(to bottom, transparent, var(--color-bg-1) 38%)' }}>
            <button data-ascii="skip" onClick={() => setCardOpen(true)} className="flex-1 h-[62px] rounded-[20px] bg-bg-2 font-bold text-[15px]" style={{ boxShadow: `inset 0 0 0 1.5px ${tier[2]}, 0 0 28px 10px var(--color-bg-1)` }}>Hero card</button>
            <button data-ascii="skip" onClick={program ? begin : () => onNavigate('programs')} className="flex-[2] h-[62px] rounded-[20px] bg-accent q-cta font-extrabold text-[17px]" style={{ color: 'var(--color-on-accent)', boxShadow: '0 0 28px 10px var(--color-bg-1)' }}>
              {!program ? 'Make a program' : isOngoing ? 'Continue quest' : activeWorkout ? 'Start new quest' : 'Begin quest'}
            </button>
          </div>
        </div>
      </div>
      {cardOpen && <QuestHeroCard open onClose={() => setCardOpen(false)} />}
      <ConfirmDialog open={confirm} danger
        title="Start a new quest?"
        message={activeWorkout?.quest ? 'Are you sure? This will cancel your current quest.' : 'Are you sure? This will cancel your current workout.'}
        confirmLabel="Start new quest" cancelLabel="Keep going"
        onConfirm={replace} onCancel={() => setConfirm(false)} />

      <ConfirmDialog open={askSensor}
        title="Use the rep tracker?"
        message="Would you like to pair with the rep tracker and record results for alpha testing? Each set's motion is saved against the reps you log, so the counter gets built from real sets rather than guesswork."
        confirmLabel="Use sensor" cancelLabel="Not this time"
        onConfirm={pairThenStart} onCancel={skipSensor}
        onDismiss={() => setAskSensor(false)} />

      <ConfirmDialog open={askGuided}
        title="Count the reps for you?"
        message="Tap START SET before each set and hold still for five seconds while the start position is captured — the counter then counts every return to it, and the set is saved from the moment you started rather than the moment you log it. Without this, sets are still recorded, but nothing is counted."
        confirmLabel="Count my reps" cancelLabel="Just record"
        onConfirm={() => chooseGuided(true)} onCancel={() => chooseGuided(false)}
        onDismiss={() => chooseGuided(false)} />
    </AsciiReveal>
  );
}
