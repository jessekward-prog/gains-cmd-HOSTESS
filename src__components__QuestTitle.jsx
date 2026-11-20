import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AsciiReveal } from 'ascii-reveal';
import { useWorkout } from '../context/WorkoutContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import useQuest, { readTint, readScanlines } from '../hooks/useQuest';
import QuestStage from './QuestStage';
import ConfirmDialog from './ConfirmDialog';
import useRepStartPrompt from './RepStartPrompt';
import QuestHeroCard, { MiniHeroCard } from './QuestHeroCard';
import { isMarker } from '../lib/history';
import { buildBlocks } from '../lib/focus';
import { lvTitle, tierOf } from '../lib/quest';
import BossPanel from './BossPanel';
import TypewriterName from './TypewriterName';
import { usePageH, stageScale } from '../lib/fit';
import { aggressionOf } from '../lib/levelup';
import { autoCapable, autoOn } from '../lib/autofail';

const MONO = 'var(--font-mono)';
const parse = (p) => (typeof p.workouts === 'string' ? JSON.parse(p.workouts) : p.workouts) || [];
const newGroupId = () => Math.random().toString(36).slice(2, 8);
// A group of one is not a group: drop its id so it renders as a plain favourite.
const tidy = (list) => list.map((f) => {
  if (!f.g || list.filter((x) => x.g === f.g).length > 1) return f;
  const { g, ...rest } = f;
  return rest;
});

// Identity of a favourite in the saved list: [program, workout].
const keyOf = (p, w) => JSON.stringify([p, w]);
const SHEET_TITLE = { menu: 'Favourites', reorder: 'Reorder', group: 'Create group', editGroup: 'Edit group', rename: 'Rename workout', remove: 'Remove favourites' };
const FAV_ACTIONS = [['reorder', 'Reorder'], ['group', 'Create group'], ['editGroup', 'Edit group'], ['rename', 'Rename workout'], ['remove', 'Remove favourites']];
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
  const { programs, workoutHistory, startWorkout, activeWorkout, cancelWorkout, settings } = useWorkout();
  const agg = aggressionOf(settings);
  const { showToast } = useToast();
  const { prof, updProf } = useQuest();
  const { questSkin } = useTheme();
  const { offer: offerSensor, prompts } = useRepStartPrompt();

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
  const LIST_PEEK = 112; // the top of the boss panel or the first favourite
  const stageK = stageScale(pageH && chrome != null ? pageH - chrome - LIST_PEEK : null);

  // Favourites: pinned in order, with an optional quest-only alias and an
  // optional group id `g`. Drop any whose program or workout has since been
  // renamed or removed.
  const favs = useMemo(() => (prof.favs || []).map((f) => {
    const pg = programs.find((pp) => pp.name === f.p);
    const i = pg ? parse(pg).findIndex((w) => w.name === f.w) : -1;
    return i >= 0 ? { ...f, pg, i, w: parse(pg)[i] } : null;
  }).filter(Boolean), [prof.favs, programs]);

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
  const [editGid, setEditGid] = useState(null); // the group being edited
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
  const toggleSel = (k) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

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

  // One workout button. In favourites edit mode the row gets its controls;
  // everything else gets the star to pin it.
  const workoutRow = (pg, w, i, { asFav = false, keyPrefix = '', nextUp = false }) => {
    const on = pg === program && i === index;
    const fav = isFav(pg.name, w.name);
    const alias = aliasOf(pg.name, w.name);
    const exs = w.exercises || [];
    const sets = exs.reduce((a, e) => a + (Number(e.sets) || 0), 0);
    const name = alias || w.name;
    const autoN = exs.filter((e) => autoOn(e, agg)).length, autoOf = exs.filter(autoCapable).length;
    return (
      <div key={`${keyPrefix}${pg.id}-${i}`} className="flex items-stretch gap-2">
        <button onClick={() => setPick({ programId: pg.id, index: i })} className="flex-1 min-w-0 flex items-center gap-2 px-4 py-3.5 rounded-[18px] text-left"
          style={{ background: on ? 'rgba(255,34,34,.08)' : 'var(--color-bg-2)', boxShadow: `inset 0 0 0 1.5px ${on ? 'var(--color-accent)' : 'transparent'}` }}>
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: on ? 'var(--color-accent)' : '#333' }} />
          <span className="flex-1 min-w-0">
            <span className="block truncate" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{name}</span>
            <span className="block mt-0.5 truncate text-text-secondary" style={{ font: `400 11px ${MONO}` }}>
              {nextUp && <span className="text-accent">UP NEXT · </span>}
              {alias ? `${w.name} · ` : ''}{buildBlocks(exs.map((e) => ({ ...e, sets: [] }))).length} monsters{sets ? ` · ${sets} sets` : ''}{autoN ? ` · AUTO ${autoN}/${autoOf}` : ''} · {exs.map((e) => e.name).join(' · ')}
            </span>
          </span>
        </button>
        {!asFav && (
          <button aria-label={fav ? 'Unpin from favourites' : 'Pin to favourites'} onClick={() => toggleFav(pg.name, w.name)}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center self-center" style={{ fontSize: 18, color: fav ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
            {fav ? '★' : '☆'}
          </button>
        )}
      </div>
    );
  };

  // Favourites in list order, with each run of same-group members boxed together.
  const favChunks = [];
  favs.forEach((f) => {
    const prev = favChunks.at(-1);
    const grouped = !!f.g && favs.filter((x) => x.g === f.g).length > 1;
    if (grouped && prev?.g === f.g) prev.items.push(f);
    else favChunks.push({ g: grouped ? f.g : null, items: [f] });
  });

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
        <div className="mt-1 truncate q-head" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
          {/* Retypes with the cursor whenever you pick a different quest (and now and then on its own). */}
          <TypewriterName text={headerAlias || headerName || 'Gains Quest'} />
        </div>
      </div>
      <div className="flex-1 px-3.5 pb-2 flex flex-col gap-2.5">
        <div className={questSkin?.st.bezel ? 'q-bezel flex-shrink-0' : 'contents'}>
        <QuestStage phase="title" area={0} heroName={prof.hero} petKey={prof.pet} lvl={prof.lvl} xp={prof.xp} theme={prof.theme}
          tint={readTint()} scanlines={readScanlines()} msg={prof.theme === 'cyberpunk' ? 'The neon night hums. Choose your quest, HERO.' : 'A new day dawns over the meadow. Choose your quest, HERO.'}
          title={{ line: `LV ${prof.lvl} · ${lvTitle(prof.lvl).toUpperCase()}`, color: tier[2] }}
          card={<MiniHeroCard onOpen={() => setCardOpen(true)} />} scale={stageK} />
        </div>

        <BossPanel />

        {favs.length > 0 && (
          <div data-ascii="favs" className="flex-shrink-0 bg-bg-1 rounded-[28px] q-card p-5">
            <div>
              <div className="flex items-center justify-between px-1 pb-2">
                <div className="text-text-tertiary" style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em' }}>FAVOURITES</div>
                <button onClick={() => setFavSheet('menu')} aria-label="Favourites options"
                  className="w-8 h-8 -my-2 -mr-1 rounded-[8px] text-text-tertiary active:bg-bg-2 flex items-center justify-center"
                  style={{ font: `700 16px ${MONO}` }}>⋯</button>
              </div>
              <div className="flex flex-col gap-1.5">
                {favChunks.map((chunk, ci) => {
                  const rows = chunk.items.map(({ pg, w, i, ...f }) => workoutRow(pg, w, i, {
                    asFav: true, keyPrefix: 'fav-', nextUp: nextFav?.p === f.p && nextFav?.w.name === w.name,
                  }));
                  if (!chunk.g) return <div key={ci} className="flex flex-col gap-1.5">{rows}</div>;
                  return (
                    <div key={ci} className="rounded-[22px] p-1.5 flex flex-col gap-1.5" style={{ boxShadow: 'inset 0 0 0 1.5px var(--color-accent)' }}>
                      <div className="text-accent px-2 pt-0.5" style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em' }}>GROUP · {chunk.items.length} QUESTS</div>
                      {rows}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <div data-ascii="surface" className={`flex-shrink-0 bg-bg-1 rounded-[28px] q-card p-5 ${favs.length > 0 ? 'mt-2' : ''}`}>
          <div className="text-accent ps-t" style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em' }}>CHOOSE TODAY'S QUEST</div>
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
                    {parse(pg).map((w, i) => workoutRow(pg, w, i, {}))}
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

      {favSheet && createPortal(
        <div className="fixed inset-0 z-[200] flex items-end g-root" onClick={closeSheet} style={{ background: 'rgba(0,0,0,.55)' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-h-[80vh] overflow-y-auto bg-bg-1 rounded-t-[28px] p-4 pb-8">
            <div className="flex items-center justify-between px-2 pb-3">
              <div className="text-accent truncate" style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em' }}>{SHEET_TITLE[favSheet].toUpperCase()}</div>
              <button onClick={closeSheet} className="text-text-tertiary px-2 py-1" style={{ font: `700 13px ${MONO}` }}>Close</button>
            </div>
            {favSheet === 'menu' && FAV_ACTIONS.map(([mode, label]) => (
              <button key={mode} onClick={() => { setSel([]); setEditGid(null); setFavSheet(mode); }}
                className="w-full text-left px-4 py-3.5 rounded-2xl bg-bg-2 mb-1.5 font-bold">{label}</button>
            ))}

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
