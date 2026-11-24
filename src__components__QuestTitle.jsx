import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AsciiReveal } from 'ascii-reveal';
import { useWorkout } from '../context/WorkoutContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import useQuest, { readTint, readScanlines } from '../hooks/useQuest';
import useQuestArt from '../hooks/useQuestArt';
import useBackHandler from '../hooks/useBackHandler';
import QuestStage, { stageArt } from './QuestStage';
import SceneSheet from './QuestScene';
import { PLACES, placeOf } from '../lib/places';
import ConfirmDialog from './ConfirmDialog';
import useRepStartPrompt from './RepStartPrompt';
import QuestHeroCard, { MiniHeroCard } from './QuestHeroCard';
import { isMarker } from '../lib/history';
import { buildBlocks } from '../lib/focus';
import { lvTitle, tierOf, monsOf, favCardId } from '../lib/quest';
import BossPanel, { BOSS_H } from './BossPanel';
import QuestFan, { FAN_ROW_H } from './QuestFan';
import DitherCard, { effCard } from './DitherCard';
import { CARDS, RAR } from '../lib/dither';
import TypewriterName from './TypewriterName';
import Ticker from './Ticker';
import { usePageH, stageScale, STAGE_H } from '../lib/fit';
import { aggressionOf } from '../lib/levelup';
import { autoCapable, autoOn, setAutoWeight } from '../lib/autofail';
import * as api from '../lib/api';

const MONO = 'var(--font-mono)';
const parse = (p) => (typeof p.workouts === 'string' ? JSON.parse(p.workouts) : p.workouts) || [];
const FAN_IDEAL = 284, FAN_MIN = 200, FAN_MAX = 360, FAN_GROWN = 540, TITLE_MIN_K = 0.64;
const newGroupId = () => Math.random().toString(36).slice(2, 8);
// A group of one is not a group: drop its id so it renders as a plain favourite.
const tidy = (list) => list.map((f) => {
  if (!f.g || list.filter((x) => x.g === f.g).length > 1) return f;
  const { g, ...rest } = f;
  return rest;
});

// Identity of a favourite in the saved list: [program, workout].
const keyOf = (p, w) => JSON.stringify([p, w]);
const SHEET_TITLE = { auto: 'Auto weight per workout', autoEx: 'Auto weight', menu: 'Options', reorder: 'Reorder', group: 'Create group', editGroup: 'Edit group', rename: 'Rename workout', remove: 'Remove favourites', picture: 'Picture' };
const FAV_ACTIONS = [['reorder', 'Reorder'], ['group', 'Create group'], ['editGroup', 'Edit group'], ['rename', 'Rename a favourite'], ['remove', 'Remove favourites']];
// Moves the selected favourites together at the first selected one's place, all in `gid`.
const placeTogether = (list, keys, gid) => {
  const isSel = (f) => keys.includes(keyOf(f.p, f.w));
  const first = list.findIndex(isSel);
  if (first < 0) return list;
  const before = list.slice(0, first).filter((f) => !isSel(f));
  const block = list.filter(isSel).map((f) => ({ ...f, g: gid }));
  const after = list.slice(first).filter((f) => !isSel(f));
  return [...before, ...block, ...after];
};
const clearGroup = (list, gid) => list.map((f) => {
  if (f.g !== gid) return f;
  const { g, ...rest } = f;
  return rest;
});

// Quest Mode's title screen (home → Quest): choose today's quest from your
// program (defaulting to the one that's up next) and begin. Favourites you've
// starred are pinned at the top with their quest-only alias. Favourites can be
// grouped: a group is a progression, and the next member is queued for you.
export default function QuestTitle({ onNavigate }) {
  const { programs, workoutHistory, startWorkout, activeWorkout, cancelWorkout, settings, reloadPrograms, reloadSettings } = useWorkout();
  const agg = aggressionOf(settings);
  const { showToast } = useToast();
  const { prof, vault, updProf } = useQuest();
  const art = useQuestArt();
  const { questSkin } = useTheme();
  const { offer: offerSensor, prompts } = useRepStartPrompt();

  const [cardOpen, setCardOpen] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const today = new Date();
  const place = placeOf(prof.place, Math.round(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 864e5));
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

  // Begin quest is pinned to the bottom of the screen, so the stage gives up
  // height on a short screen to keep some of the list in view between them.
  const pageH = usePageH();
  const headRef = useRef(null);
  const [chrome, setChrome] = useState(null); // header + pinned bar, px
  useEffect(() => {
    const els = [headRef.current, barRef.current].filter(Boolean);
    if (typeof ResizeObserver === 'undefined' || !els.length) return undefined;
    const read = () => setChrome(els.reduce((a, el) => a + el.offsetHeight, 0));
    const ro = new ResizeObserver(read);
    els.forEach((el) => ro.observe(el));
    read();
    return () => ro.disconnect();
  }, []);
  const bossRef = useRef(null);
  const [bossH, setBossH] = useState(0);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !bossRef.current) return undefined;
    const ro = new ResizeObserver(([e]) => setBossH(e.contentRect.height));
    ro.observe(bossRef.current);
    return () => ro.disconnect();
  }, []);

  // Favourites: pinned in order, with an optional quest-only alias and an
  // optional group id `g`. Drop any whose program or workout has since been
  // renamed or removed.
  const favs = useMemo(() => (prof.favs || []).map((f) => {
    const pg = programs.find((pp) => pp.name === f.p);
    const i = pg ? parse(pg).findIndex((w) => w.name === f.w) : -1;
    return i >= 0 ? { ...f, pg, i, w: parse(pg)[i] } : null;
  }).filter(Boolean), [prof.favs, programs]);

  const sceneSkin = stageArt({ theme: prof.theme, hero: prof.hero, tint: readTint() }, questSkin).K;
  // With favourites the stage, the boss and the cards share one screen: the stage
  // gives up height first, then the cards.
  const LIST_PEEK = 112; // without favourites: the top of the boss panel
  const boss = Math.min(bossH, BOSS_H);
  const bezel = questSkin?.st.bezel ? 24 : 0;
  const room = pageH && chrome != null ? pageH - chrome - (boss ? boss + 10 : 0) - FAN_ROW_H - 12 - bezel : null;
  const stageK = favs.length ? stageScale(room == null ? null : room - FAN_IDEAL, TITLE_MIN_K)
    : stageScale(pageH && chrome != null ? pageH - chrome - LIST_PEEK : null);
  const fanH = room == null ? FAN_IDEAL : Math.round(Math.max(FAN_MIN, Math.min(FAN_MAX, room - STAGE_H * stageK)));

  const last = useMemo(() => (workoutHistory || []).find((w) => !isMarker(w)), [workoutHistory]);
  const isLast = (f) => f.p === last?.program_name && f.w.name === last?.workout_name;
  // Progression runs inside each group, in list order. The group holding the
  // last workout you logged moves on to its next member; otherwise the first
  // group starts at its first member.
  const nextFav = useMemo(() => {
    const grouped = favs.filter((f) => f.g && favs.some((x) => x !== f && x.g === f.g));
    if (!grouped.length) return null;
    const at = grouped.findIndex(isLast);
    if (at < 0) return grouped[0];
    const members = grouped.filter((f) => f.g === grouped[at].g);
    return members[(members.indexOf(grouped[at]) + 1) % members.length];
  }, [favs, last]);

  const upNext = useMemo(() => {
    if (nextFav) return { program: nextFav.pg, index: nextFav.i };
    const program = programs.find((p) => p.name === last?.program_name) || programs[0];
    if (!program) return null;
    const ws = parse(program);
    const from = ws.findIndex((w) => w.name === last?.workout_name);
    let index = from < 0 ? 0 : (from + 1) % ws.length;
    for (let k = 0; k < ws.length && ws[index]?.variationOf; k++) index = (index + 1) % ws.length;
    return { program, index };
  }, [programs, last, nextFav]);
  // A quest already under way is what's selected (and continued) by default.
  const ongoing = useMemo(() => {
    if (!activeWorkout) return null;
    const p = programs.find((x) => x.name === activeWorkout.programName);
    const i = p ? parse(p).findIndex((w) => w.name === activeWorkout.workoutName) : -1;
    return p && i >= 0 ? { programId: p.id, index: i } : null;
  }, [activeWorkout, programs]);
  const [pick, setPick] = useState(() => (activeWorkout?.quest ? ongoing : null));
  const [confirm, setConfirm] = useState(false);
  const [openIds, setOpenIds] = useState(null); // null = just the selected workout's program
  const [allOpen, setAllOpen] = useState(false); // with favourites, every other workout sits in one dropdown
  const [favSheet, setFavSheet] = useState(null); // null | a key of SHEET_TITLE
  const [sel, setSel] = useState([]); // favourite keys ticked inside the sheet
  const [autoPick, setAutoPick] = useState(null); // { programId, index } open in Auto weight
  const [editGid, setEditGid] = useState(null); // the group being edited
  const [picFor, setPicFor] = useState(null); // key of the favourite choosing its picture
  const program = programs.find((p) => p.id === pick?.programId) || upNext?.program;
  const index = pick?.index ?? (program === upNext?.program ? upNext?.index : 0) ?? 0;
  const ws = program ? parse(program).map((w, i) => [w, i]) : [];
  // Every workout in every program can be a quest — up-next's program first.
  const groups = upNext ? [upNext.program, ...programs.filter((p) => p !== upNext.program)] : programs;

  const isFav = (p, w) => (prof.favs || []).some((f) => f.p === p && f.w === w);
  const aliasOf = (p, w) => (prof.favs || []).find((f) => f.p === p && f.w === w)?.alias || null;
  const toggleFav = (p, w) => updProf((pr) => {
    const list = pr.favs || [];
    return { ...pr, favs: list.some((f) => f.p === p && f.w === w)
      ? tidy(list.filter((f) => !(f.p === p && f.w === w)))
      : [...list, { p, w }] };
  });
  const rename = (p, w) => {
    const cur = aliasOf(p, w) || w;
    const next = window.prompt('Rename this quest (empty to reset)', cur);
    if (next === null) return;
    const alias = next.trim();
    updProf((pr) => ({ ...pr, favs: (pr.favs || []).map((f) => (f.p === p && f.w === w ? { ...f, alias: alias && alias !== w ? alias : undefined } : f)) }));
  };
  const moveFav = (p, w, dir) => updProf((pr) => {
    const list = [...(pr.favs || [])];
    const from = list.findIndex((f) => f.p === p && f.w === w);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= list.length) return pr;
    [list[from], list[to]] = [list[to], list[from]];
    return { ...pr, favs: list };
  });

  const groupSelected = (keys) => updProf((pr) => ({ ...pr, favs: tidy(placeTogether(pr.favs || [], keys, newGroupId())) }));
  const saveGroup = (gid, keys) => updProf((pr) => ({ ...pr, favs: tidy(placeTogether(clearGroup(pr.favs || [], gid), keys, gid)) }));
  const removeFavs = (keys) => updProf((pr) => ({ ...pr, favs: tidy((pr.favs || []).filter((f) => !keys.includes(keyOf(f.p, f.w)))) }));
  const closeSheet = () => { setFavSheet(null); setSel([]); setEditGid(null); };

  // Auto weight, from either ⋯: the every-workout default (same setting as
  // Training), then any workout's exercises one by one.
  const autoCount = (w) => { const exs = w?.exercises || []; return `${exs.filter((e) => autoOn(e, agg)).length}/${exs.filter(autoCapable).length}`; };
  const toggleAutoAll = async () => {
    const raw = settings?.aggressionSettings;
    const a = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
    try { await api.updateAggression({ ...a, autoFailure: !agg.autoFailure }); await reloadSettings(); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
  };
  const selW = program ? parse(program)[index] : null;
  const autoPg = autoPick && programs.find((pg) => pg.id === autoPick.programId);
  const autoW = autoPg ? parse(autoPg)[autoPick.index] : null;
  const setAuto = async (idxs, value) => {
    try { await api.updateProgram(autoPg.id, autoPg.name, setAutoWeight(parse(autoPg), autoPick.index, idxs, value)); await reloadPrograms(); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
  };
  useBackHandler(favSheet === 'picture', closeSheet);
  const setPicture = (id) => updProf((pr) => ({ ...pr, favs: (pr.favs || []).map((f) => {
    if (keyOf(f.p, f.w) !== picFor) return f;
    const { card, ...rest } = f;
    return id ? { ...rest, card: id } : rest;
  }) })).catch((e) => showToast('Not saved: ' + e.message, 'error'));
  const toggleSel = (k) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  // The fan's cards, rebuilt only when what they show changes.
  const fan = useMemo(() => favs.map((f, i) => {
    const exs = f.w.exercises || [];
    const blocks = buildBlocks(exs.map((e) => ({ ...e, sets: [] })));
    const sets = exs.reduce((a, e) => a + (Number(e.sets) || 0), 0);
    const autoN = exs.filter((e) => autoOn(e, agg)).length;
    const c = CARDS[favCardId(f, i, vault) - 1];
    const mons = monsOf(prof.theme);
    return {
      key: keyOf(f.p, f.w.name), name: f.alias || f.w.name, count: exs.length,
      g: f.g && favs.filter((x) => x.g === f.g).length > 1 ? f.g : null,
      next: nextFav?.p === f.p && nextFav?.w.name === f.w.name,
      info: `${blocks.length} monster${blocks.length === 1 ? '' : 's'}${sets ? ` · ${sets} sets` : ''}${autoN ? ` · AUTO\u00a0${autoN}/${exs.filter(autoCapable).length}` : ''}`,
      card: c && effCard(c, art[c.id]), img: c && art[c.id]?.img,
      rows: blocks.map((b, bi) => ({
        sprite: mons[bi % mons.length][0],
        lines: b.indices.map((x) => [exs[x].name, [exs[x].sets, exs[x].repRange].filter(Boolean).join(' × ')]),
      })),
    };
  }), [favs, vault, art, prof.theme, nextFav, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const tier = tierOf(prof.lvl);
  const start = async () => {
    try { await startWorkout(program, index, { quest: true }); onNavigate('workout'); } catch (e) { showToast('Error starting quest: ' + e.message, 'error'); }
  };
  // The selected workout is the quest already running → carry on with it.
  const isOngoing = !!activeWorkout?.quest && !!ongoing && ongoing.programId === program?.id && ongoing.index === index;
  // Anything else never silently replaces a workout in progress.
  const begin = () => {
    if (isOngoing) onNavigate('workout');
    else if (activeWorkout) setConfirm(true);
    else offerSensor(start);
  };
  const replace = async () => {
    setConfirm(false);
    try { await cancelWorkout(); } catch (e) { showToast('Error: ' + e.message, 'error'); return; }
    offerSensor(start);
  };

  const headerName = ws.find(([, i]) => i === index)?.[0]?.name;
  const headerAlias = program && headerName && aliasOf(program.name, headerName);

  // One workout button, with the star to pin it.
  const workoutRow = (pg, w, i) => {
    const on = pg === program && i === index;
    const fav = isFav(pg.name, w.name);
    const alias = aliasOf(pg.name, w.name);
    const exs = w.exercises || [];
    const sets = exs.reduce((a, e) => a + (Number(e.sets) || 0), 0);
    const name = alias || w.name;
    const autoN = exs.filter((e) => autoOn(e, agg)).length, autoOf = exs.filter(autoCapable).length;
    const info = `${alias ? `${w.name} · ` : ''}${buildBlocks(exs.map((e) => ({ ...e, sets: [] }))).length} monsters${sets ? ` · ${sets} sets` : ''}${autoN ? ` · AUTO ${autoN}/${autoOf}` : ''} · ${exs.map((e) => e.name).join(' · ')}`;
    return (
      <div key={`${pg.id}-${i}`} className="flex items-stretch gap-2">
        <button onClick={() => setPick({ programId: pg.id, index: i })} className="flex-1 min-w-0 flex items-center gap-2 px-4 py-3.5 rounded-[18px] text-left"
          style={{ background: on ? 'rgba(255,34,34,.08)' : 'var(--color-bg-2)', boxShadow: `inset 0 0 0 1.5px ${on ? 'var(--color-accent)' : 'transparent'}` }}>
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: on ? 'var(--color-accent)' : '#333' }} />
          <span className="flex-1 min-w-0">
            <span className="block truncate" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{name}</span>
            {/* The picked row scrolls its whole line like a ticker tape; the rest truncate. */}
            <span className={`mt-0.5 text-text-secondary ${on ? 'flex min-w-0' : 'block truncate'}`} style={{ font: `400 11px ${MONO}` }}>
              {on ? <Ticker>{info}</Ticker> : info}
            </span>
          </span>
        </button>
        <button aria-label={fav ? 'Unpin from favourites' : 'Pin to favourites'} onClick={() => toggleFav(pg.name, w.name)}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center self-center" style={{ fontSize: 18, color: fav ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
          {fav ? '★' : '☆'}
        </button>
      </div>
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
      <div ref={headRef} className="px-5 pt-3 pb-3">
        <div className="g-label truncate ps-x">{program ? `${program.name} · QUEST` : 'QUEST'}</div>
        <div className="truncate q-head" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: '32px', marginBottom: -4 }}>
          {/* Retypes with the cursor whenever you pick a different quest (and now and then on its own). */}
          <TypewriterName text={headerAlias || headerName || 'Gains Quest'} />
        </div>
      </div>
      <div className="flex-1 px-3.5 pb-2 flex flex-col gap-2.5">
        <div className={questSkin?.st.bezel ? 'q-bezel flex-shrink-0' : 'contents'}>
        <QuestStage phase="title" area={0} heroName={prof.hero} petKey={prof.pet} lvl={prof.lvl} xp={prof.xp} theme={prof.theme}
          tint={readTint()} scanlines={readScanlines()} place={place} sky={(prof.skies || []).includes(prof.sky) ? prof.sky : null} onScene={() => setSceneOpen(true)}
          msg={prof.theme === 'cyberpunk' ? 'The neon night hums. Choose your quest, HERO.' : PLACES.find((p) => p[0] === place)?.[2] || 'A new day dawns over the meadow. Choose your quest, HERO.'}
          title={{ line: `LV ${prof.lvl} · ${lvTitle(prof.lvl).toUpperCase()}`, color: tier[2] }}
          card={<MiniHeroCard onOpen={() => setCardOpen(true)} />} scale={stageK} />
        </div>

        <div ref={bossRef} className="flex-shrink-0 empty:hidden"><BossPanel skin={sceneSkin} /></div>

        {favs.length > 0 && (
          <div data-ascii="favs" className="flex-shrink-0">
            <QuestFan items={fan} index={favs.findIndex((f) => f.pg === program && f.i === index)}
              height={fanH} grow={Math.max(0, Math.min(FAN_GROWN - fanH, STAGE_H * stageK + boss))}
              menu={(
                <button onClick={() => setFavSheet('menu')} aria-label="Favourites options"
                  className="w-11 h-11 rounded-[8px] text-text-tertiary active:bg-bg-2 flex items-center justify-center"
                  style={{ font: `700 16px ${MONO}` }}><span className="bg-bg-0 px-1">⋯</span></button>
              )}
              onPick={(k) => setPick({ programId: favs[k].pg.id, index: favs[k].i })}
              onPicture={(k) => { setPicFor(keyOf(favs[k].p, favs[k].w.name)); setFavSheet('picture'); }} />
          </div>
        )}
        <div data-ascii="surface" className={`flex-shrink-0 bg-bg-1 rounded-[28px] q-card p-5 ${favs.length > 0 ? 'mt-2' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="text-accent ps-t" style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em' }}>CHOOSE TODAY'S QUEST</div>
            {program && (
              <button onClick={() => setFavSheet('menu')} aria-label="Workout options"
                className="w-8 h-8 -my-2 -mr-1 rounded-[8px] text-text-tertiary active:bg-bg-2 flex items-center justify-center"
                style={{ font: `700 16px ${MONO}` }}>⋯</button>
            )}
          </div>
          {!program && (
            <div className="mt-3 text-sm text-text-secondary">No program yet. Make one in Programs and it becomes your quest list.</div>
          )}

          {favs.length > 0 && program && (() => {
            const total = groups.reduce((n, pg) => n + parse(pg).length, 0);
            const sel = ws[index]?.[0];
            return (
              <button onClick={() => setAllOpen((o) => !o)} className="mt-4 w-full flex items-center gap-2 px-4 py-3.5 rounded-2xl bg-bg-2 text-left">
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
                    {parse(pg).map((w, i) => workoutRow(pg, w, i))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* Pinned to the bottom of the screen, just above the nav, however long the
          lists get: Begin quest never needs a scroll to reach. The page fades
          out under it into the nav's own colour, so nothing busy shows behind
          the buttons. The wave is masked off here (barRef), so the labels can't
          decode on it: they fade in with the bar instead. */}
      <div ref={barRef} data-ascii="fade" className="sticky bottom-0 z-10 flex gap-2 px-3.5 pb-3"
        style={{ paddingTop: 22, marginTop: -6, background: 'linear-gradient(to bottom, transparent, var(--q-nav-bg, var(--color-bg-0)) 20px)' }}>
        <button data-ascii="skip" onClick={() => setCardOpen(true)} className="flex-1 min-w-0 h-[62px] rounded-[20px] bg-bg-2 font-bold text-[15px]" style={{ boxShadow: `inset 0 0 0 1.5px ${tier[2]}` }}>Hero card</button>
        <button data-ascii="skip" onClick={program ? begin : () => onNavigate('programs')} className="flex-[2] min-w-0 h-[62px] rounded-[20px] bg-accent q-cta font-extrabold text-[17px]" style={{ color: 'var(--color-on-accent)' }}>
          {!program ? 'Make a program' : isOngoing ? 'Continue quest' : activeWorkout ? 'Start new quest' : 'Begin quest'}
        </button>
      </div>
      {cardOpen && <QuestHeroCard open onClose={() => setCardOpen(false)} />}
      <SceneSheet open={sceneOpen} onClose={() => setSceneOpen(false)} prof={prof} skin={sceneSkin}
        save={(fn) => updProf(fn).catch((e) => showToast('Not saved: ' + e.message, 'error'))} />

      {favSheet && createPortal(
        <div className="fixed inset-0 z-[200] flex items-end g-root" onClick={closeSheet} style={{ background: 'rgba(0,0,0,.55)' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-h-[80vh] overflow-y-auto bg-bg-1 rounded-t-[28px] p-4 pb-8">
            <div className="flex items-center justify-between px-2 pb-3">
              <div className="text-accent truncate" style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em' }}>{SHEET_TITLE[favSheet].toUpperCase()}</div>
              <button onClick={closeSheet} className="text-text-tertiary px-2 py-1" style={{ font: `700 13px ${MONO}` }}>Close</button>
            </div>
            {favSheet === 'auto' && (() => {
              const pickRow = (pg, w, i, label, k) => (
                <button key={k} onClick={() => { setAutoPick({ programId: pg.id, index: i, from: 'auto' }); setFavSheet('autoEx'); }}
                  className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-2xl bg-bg-2 mb-1.5">
                  <span className="flex-1 min-w-0 truncate font-bold">{label}</span>
                  <span className="text-text-secondary flex-shrink-0" style={{ font: `500 11px ${MONO}` }}>AUTO {autoCount(w)} ›</span>
                </button>
              );
              return (
                <>
                  <button onClick={() => setFavSheet('menu')} className="px-2 pb-2 text-text-secondary" style={{ font: `500 12px ${MONO}` }}>‹ Options</button>
                  <p className="px-2 pt-3 pb-2 text-text-tertiary" style={{ font: `400 10px/1.6 ${MONO}` }}>Pick a workout to choose its exercises. Untouched ones follow “Auto weight for every workout” ({agg.autoFailure ? 'on' : 'off'}).</p>
                  {favs.length > 0 && <div className="text-text-tertiary px-2 pb-1.5" style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em' }}>FAVOURITES</div>}
                  {favs.map((f) => pickRow(f.pg, f.w, f.i, f.alias || f.w.name, 'f' + keyOf(f.p, f.w.name)))}
                  {groups.map((pg) => (
                    <div key={pg.id}>
                      <div className="text-text-tertiary px-2 pt-2 pb-1.5 truncate" style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em' }}>{pg.name.toUpperCase()}</div>
                      {parse(pg).map((w, i) => pickRow(pg, w, i, aliasOf(pg.name, w.name) || w.name, `${pg.id}-${i}`))}
                    </div>
                  ))}
                </>
              );
            })()}

            {favSheet === 'autoEx' && autoW && (() => {
              const exs = autoW.exercises || [];
              const capable = exs.flatMap((e, i) => (autoCapable(e) ? [i] : []));
              return (
                <>
                  <button onClick={() => setFavSheet(autoPick.from)} className="px-2 pb-2 text-text-secondary" style={{ font: `500 12px ${MONO}` }}>{autoPick.from === 'menu' ? '‹ Options' : '‹ All workouts'}</button>
                  <div className="px-2 pb-1 font-bold truncate" style={{ fontSize: 17 }}>{aliasOf(autoPg.name, autoW.name) || autoW.name}</div>
                  <p className="px-2 pb-3 text-text-tertiary" style={{ font: `400 10px/1.6 ${MONO}` }}>
                    {autoPg.name} · AUTO {autoCount(autoW)} · untouched ones follow “every workout” ({agg.autoFailure ? 'on' : 'off'})
                  </p>
                  <div className="flex gap-1.5 mb-1.5">
                    <button onClick={() => setAuto(capable, true)} className="flex-1 px-4 py-3 rounded-2xl bg-bg-2 font-bold">All on</button>
                    <button onClick={() => setAuto(capable, false)} className="flex-1 px-4 py-3 rounded-2xl bg-bg-2 font-bold">All off</button>
                  </div>
                  {exs.map((e, i) => (autoCapable(e) ? (
                    <button key={i} role="checkbox" aria-checked={autoOn(e, agg)} onClick={() => setAuto([i], !autoOn(e, agg))}
                      className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-2xl bg-bg-2 mb-1.5">
                      <span className="text-accent" style={{ font: `700 16px ${MONO}` }}>{autoOn(e, agg) ? '☑' : '☐'}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate font-bold">{e.name}</span>
                        <span className="block text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>{e.repRange} reps{e.autoWeight === undefined ? ' · default' : ''}</span>
                      </span>
                    </button>
                  ) : (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-1.5 text-text-tertiary">
                      <span style={{ font: `700 16px ${MONO}` }}>–</span>
                      <span className="flex-1 min-w-0 truncate">{e.name}</span>
                      <span style={{ font: `400 10px ${MONO}` }}>{e.type === 'cardio' ? 'CARDIO' : 'TIMED'}</span>
                    </div>
                  )))}
                </>
              );
            })()}

            {favSheet === 'menu' && (() => {
              // Same outline as a favourites group on the quest screen.
              const box = (label, items) => (
                <div className="rounded-[22px] p-1.5 flex flex-col gap-1.5 mb-3" style={{ boxShadow: 'inset 0 0 0 1.5px var(--color-accent)' }}>
                  <div className="text-accent px-2 pt-0.5 truncate" style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em' }}>{label}</div>
                  {items}
                </div>
              );
              const item = (key, label, onClick, right = null) => (
                <button key={key} onClick={onClick} className="w-full flex items-center gap-3 text-left px-4 py-3.5 rounded-2xl bg-bg-2">
                  <span className="flex-1 min-w-0 truncate font-bold">{label}</span>
                  {right && <span className="text-text-secondary flex-shrink-0" style={{ font: `500 11px ${MONO}` }}>{right}</span>}
                </button>
              );
              const selFav = selW && isFav(program.name, selW.name);
              return (
                <>
                  {selW && box(`SELECTED · ${(aliasOf(program.name, selW.name) || selW.name).toUpperCase()}`, [
                    item('auto', 'Auto weight', () => { setAutoPick({ programId: program.id, index, from: 'menu' }); setFavSheet('autoEx'); }, `AUTO ${autoCount(selW)} ›`),
                    selFav && item('rename', 'Rename workout', () => { closeSheet(); rename(program.name, selW.name); }),
                    item('fav', selFav ? 'Remove from favourites' : 'Add to favourites', () => toggleFav(program.name, selW.name)),
                  ])}
                  {box('ALL WORKOUTS', [
                    <button key="every" role="checkbox" aria-checked={agg.autoFailure} onClick={toggleAutoAll}
                      className="w-full flex items-center gap-3 text-left px-4 py-3.5 rounded-2xl bg-bg-2">
                      <span className="text-accent" style={{ font: `700 16px ${MONO}` }}>{agg.autoFailure ? '☑' : '☐'}</span>
                      <span className="flex-1 min-w-0 font-bold">Auto weight for every workout</span>
                    </button>,
                    item('pick', 'Auto weight per workout', () => setFavSheet('auto'), '›'),
                    ...(favs.length ? FAV_ACTIONS.map(([mode, label]) => item(mode, label, () => { setSel([]); setEditGid(null); setFavSheet(mode); })) : []),
                  ])}
                </>
              );
            })()}

            {favSheet === 'picture' && (() => {
              const cur = favs.find((f) => keyOf(f.p, f.w.name) === picFor);
              if (!cur) return null;
              const on = favCardId(cur, favs.indexOf(cur), vault);
              return (
                <>
                  <div className="px-2 pb-3 font-bold truncate" style={{ fontSize: 17 }}>{cur.alias || cur.w.name}</div>
                  <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))' }}>
                    {CARDS.filter((c) => vault.owned[c.id]).map((c0) => {
                      const c = effCard(c0, art[c0.id]);
                      return (
                        <button key={c.id} aria-pressed={c.id === on} onClick={() => setPicture(c.id)} className="min-w-0 text-left">
                          <span className="block relative overflow-hidden" style={{ aspectRatio: '5 / 7', borderRadius: 12, background: '#0b0b0b', boxShadow: c.id === on ? '0 0 0 3px var(--color-text-primary)' : 'none' }}>
                            <DitherCard card={c} img={art[c.id]?.img} still />
                          </span>
                          <span className="block truncate font-bold" style={{ marginTop: 6, fontSize: 13 }}>{c.name}</span>
                          <span className="block" style={{ font: `400 11px ${MONO}`, color: RAR[c.rarity].col }}>{RAR[c.rarity].name}</span>
                        </button>
                      );
                    })}
                  </div>
                  {cur.card && <button onClick={() => setPicture(null)} className="w-full mt-3 h-11 text-text-secondary font-bold">Use an automatic picture</button>}
                </>
              );
            })()}

            {favSheet === 'reorder' && favs.map((f) => (
              <div key={keyOf(f.p, f.w.name)} className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-bg-2 mb-1.5">
                <span className="flex-1 min-w-0 truncate font-bold">{f.alias || f.w.name}</span>
                <button aria-label={`Move ${f.w.name} up`} onClick={() => moveFav(f.p, f.w.name, -1)} className="w-9 h-9 text-text-secondary">▲</button>
                <button aria-label={`Move ${f.w.name} down`} onClick={() => moveFav(f.p, f.w.name, 1)} className="w-9 h-9 text-text-secondary">▼</button>
              </div>
            ))}

            {(favSheet === 'group' || favSheet === 'remove' || (favSheet === 'editGroup' && editGid)) && favs.map((f) => {
              const k = keyOf(f.p, f.w.name);
              const on = sel.includes(k);
              return (
                <button key={k} role="checkbox" aria-checked={on} onClick={() => toggleSel(k)}
                  className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-2xl bg-bg-2 mb-1.5">
                  <span className="text-accent" style={{ font: `700 16px ${MONO}` }}>{on ? '☑' : '☐'}</span>
                  <span className="flex-1 min-w-0 truncate font-bold">{f.alias || f.w.name}</span>
                  {favSheet === 'editGroup' && f.g && f.g !== editGid && <span className="text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>IN ANOTHER GROUP</span>}
                </button>
              );
            })}
            {favSheet === 'group' && (
              <button disabled={sel.length < 2} onClick={() => { groupSelected(sel); closeSheet(); }}
                className="w-full mt-2 h-[52px] rounded-[18px] bg-accent font-extrabold disabled:opacity-40" style={{ color: 'var(--color-on-accent)' }}>
                Create group{sel.length ? ` (${sel.length})` : ''}
              </button>
            )}
            {favSheet === 'remove' && (
              <button disabled={!sel.length} onClick={() => { removeFavs(sel); closeSheet(); }}
                className="w-full mt-2 h-[52px] rounded-[18px] bg-accent font-extrabold disabled:opacity-40" style={{ color: 'var(--color-on-accent)' }}>
                Remove favourites{sel.length ? ` (${sel.length})` : ''}
              </button>
            )}
            {favSheet === 'editGroup' && !editGid && (() => {
              const gids = [...new Set(favs.map((f) => f.g).filter((g) => g && favs.filter((x) => x.g === g).length > 1))];
              if (!gids.length) return <div className="px-2 text-text-secondary">No groups yet. Use Create group first.</div>;
              return gids.map((g) => {
                const members = favs.filter((f) => f.g === g);
                return (
                  <button key={g} onClick={() => { setEditGid(g); setSel(members.map((f) => keyOf(f.p, f.w.name))); }}
                    className="w-full text-left px-4 py-3.5 rounded-2xl bg-bg-2 mb-1.5">
                    <span className="block font-bold truncate">{members.map((f) => f.alias || f.w.name).join(' · ')}</span>
                  </button>
                );
              });
            })()}
            {favSheet === 'editGroup' && editGid && (
              <>
                <button disabled={sel.length < 2} onClick={() => { saveGroup(editGid, sel); closeSheet(); }}
                  className="w-full mt-2 h-[52px] rounded-[18px] bg-accent font-extrabold disabled:opacity-40" style={{ color: 'var(--color-on-accent)' }}>
                  Save group{sel.length ? ` (${sel.length})` : ''}
                </button>
                <button onClick={() => { setEditGid(null); setSel([]); }} className="w-full mt-1.5 h-11 text-text-tertiary font-bold">Back</button>
              </>
            )}

            {favSheet === 'rename' && favs.map((f) => (
              <button key={keyOf(f.p, f.w.name)} onClick={() => rename(f.p, f.w.name)}
                className="w-full text-left px-4 py-3.5 rounded-2xl bg-bg-2 mb-1.5 font-bold truncate">{f.alias || f.w.name}</button>
            ))}
          </div>
        </div>,
        document.body,
      )}

      <ConfirmDialog open={confirm} danger
        title="Start a new quest?"
        message={activeWorkout?.quest ? 'Are you sure? This will cancel your current quest.' : 'Are you sure? This will cancel your current workout.'}
        confirmLabel="Start new quest" cancelLabel="Keep going"
        onConfirm={replace} onCancel={() => setConfirm(false)} />

      {prompts}
    </AsciiReveal>
  );
}
