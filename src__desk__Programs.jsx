// Desk → Programs: searchable programs directory on the left, clean variant pills
// and single-line scannable exercise rows with an expandable tuning tray on the right.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import useQuest from '../hooks/useQuest';
import { aggressionOf } from '../lib/levelup';
import { autoCapable, autoOn } from '../lib/autofail';
import { supersetMembersOf, pairSuperset, renameInSuperset, gatherOrder, moveOrder } from '../lib/supersets';
import * as api from '../lib/api';
import { MONO, Btn, TextIn, NumIn, Sel, ConfirmBtn, SaveBar, parseW, clone, allNames, NamesList } from './ui';

const KINDS = [
  ['normal', 'Normal'],
  ['drops', 'Drop sets'],
  ['bfr', 'BFR'],
  ['interval', 'Interval'],
  ['timed', 'Timed'],
  ['cardio', 'Cardio'],
];
const kindOf = (e) => (e.type === 'cardio' ? 'cardio' : e.isBFR ? 'bfr' : e.isInterval ? 'interval' : e.isTimed ? 'timed' : e.hasDrops ? 'drops' : 'normal');
function withKind(e, k) {
  const base = { ...e, type: undefined, isBFR: false, isInterval: false, isTimed: false, hasDrops: false };
  if (e.type === 'cardio' && k !== 'cardio') Object.assign(base, { repRange: '8-12', sets: 3 });
  if (k === 'cardio') return { ...base, type: 'cardio', repRange: 'cardio', sets: 1, isVariable: false, failureIndices: [], targetDurationSec: e.targetDurationSec || 600 };
  if (k === 'drops') return { ...base, hasDrops: true, numDrops: e.numDrops || 1 };
  if (k === 'bfr') return { ...base, isBFR: true, bfrSeconds: e.bfrSeconds || 45 };
  if (k === 'interval') return { ...base, isInterval: true, intervalWork: e.intervalWork || 30, intervalRest: e.intervalRest || 30, intervalTotal: e.intervalTotal || 180 };
  if (k === 'timed') return { ...base, isTimed: true, timedSec: e.timedSec || 60 };
  return base;
}
const newExercise = () => ({ name: '', sets: 3, repRange: '8-12', restSeconds: 90, failureIndices: [] });
const move = (arr, i, d) => { const a = [...arr]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };
const tidy = (list) => list.map((f) => {
  if (!f.g || list.filter((x) => x.g === f.g).length > 1) return f;
  const { g, ...rest } = f;
  return rest;
});

function shortVariantLabel(workoutName, programName) {
  const wn = (workoutName || '').trim();
  const pn = (programName || '').trim();
  if (!wn) return 'Untitled';
  if (pn && wn.toLowerCase() === pn.toLowerCase()) return 'Base';
  if (pn && wn.toLowerCase().startsWith(pn.toLowerCase())) {
    let rest = wn.slice(pn.length).trim().replace(/^[—–\-:]+\s*/, '').trim();
    if (rest.startsWith('(') && rest.endsWith(')')) rest = rest.slice(1, -1).trim();
    if (rest) return rest;
  }
  return wn;
}

const inlineField = 'bg-transparent hover:bg-bg-2/70 focus:bg-bg-0 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-accent/60 transition-colors min-w-0';

function Chip({ children, onClick, tone = 'neutral', title }) {
  const styles = {
    neutral: 'bg-bg-2 text-text-secondary border-border hover:border-border-strong',
    accent: 'bg-accent/12 text-accent border-accent/35 hover:border-accent/60',
    ss: 'bg-[#4f8fe0]/12 text-[#7cb3f4] border-[#4f8fe0]/35 hover:border-[#4f8fe0]/60',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-1.5 py-0.5 rounded border text-[10px] font-mono leading-none cursor-pointer transition-colors whitespace-nowrap ${styles}`}
    >
      {children}
    </button>
  );
}

export default function DeskPrograms() {
  const { programs, workoutHistory, settings, reloadPrograms, reloadSettings } = useWorkout();
  const { showToast } = useToast();
  const { prof, updProf } = useQuest();
  const agg = aggressionOf(settings);
  const toggleAutoGlobal = async () => {
    const raw = settings?.aggressionSettings;
    const a = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : (raw || {});
    const next = !agg.autoFailure;
    try {
      await api.updateAggression({ ...a, autoFailure: next });
      await reloadSettings();
      showToast(next ? 'Auto weight default enabled' : 'Auto weight default disabled', 'success');
    } catch (e) { showToast('Could not update auto weight: ' + e.message, 'error'); }
  };
  const [pid, setPid] = useState(programs?.[0]?.id ?? null);
  const program = programs.find((p) => p.id === pid) || null;
  const [draft, setDraft] = useState(null); // { id, name, workouts }
  const [wi, setWi] = useState(0);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [expandedAll, setExpandedAll] = useState(false);
  const [nickEdit, setNickEdit] = useState(null);
  const focusNewRef = useRef(false);
  const skipNickBlurRef = useRef(false);
  const nameRefs = useRef([]);

  const savedDraft = useMemo(() => (program ? { id: program.id, name: program.name, workouts: parseW(program) } : null), [program]);
  const forProgram = !!(draft && savedDraft && draft.id === savedDraft.id);
  const viewDraft = forProgram ? draft : savedDraft;
  const dirty = forProgram && JSON.stringify(draft) !== JSON.stringify(savedDraft);
  useEffect(() => { if (!forProgram || !dirty) setDraft(clone(savedDraft)); }, [savedDraft, forProgram]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!program && programs.length) setPid(programs[0].id); }, [programs, program]);

  const questFavMap = useMemo(
    () => new Map((prof.favs || []).map((f) => [JSON.stringify([f.p, f.w]), f])),
    [prof.favs],
  );
  const questFavOf = (pName, wName) => (pName && wName ? questFavMap.get(JSON.stringify([pName, wName])) || null : null);

  const names = useMemo(() => allNames(programs, workoutHistory), [programs, workoutHistory]);
  const filteredPrograms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return programs;
    return programs.filter((p) => {
      if ((p.name || '').toLowerCase().includes(q)) return true;
      return parseW(p).some((x) => {
        if ((x.name || '').toLowerCase().includes(q)) return true;
        const alias = questFavMap.get(JSON.stringify([p.name, x.name]))?.alias;
        return !!alias && alias.toLowerCase().includes(q);
      });
    });
  }, [programs, search, questFavMap]);

  const ws = viewDraft?.workouts || [];
  const w = ws[wi] || null;
  const activeQuestFav = program && w ? questFavOf(program.name, w.name) : null;
  const canQuestFav = !!(program && w?.name?.trim() && (savedDraft?.workouts || []).some((x) => x.name === w.name));
  const nickKey = `${program?.id ?? ''}:${wi}:${activeQuestFav?.alias || ''}`;
  const nickDraft = nickEdit?.key === nickKey ? nickEdit.val : (activeQuestFav?.alias || '');

  const toggleQuestFav = async () => {
    if (!canQuestFav) return;
    const wasFav = !!activeQuestFav;
    try {
      await updProf((pr) => {
        const list = pr.favs || [];
        return {
          ...pr,
          favs: wasFav
            ? tidy(list.filter((f) => !(f.p === program.name && f.w === w.name)))
            : [...list, { p: program.name, w: w.name }],
        };
      });
      showToast(wasFav ? 'Removed from Quest favourites' : 'Added to Quest favourites', 'success');
    } catch (e) { showToast('Could not update Quest favourite: ' + e.message, 'error'); }
  };

  const commitNickname = async () => {
    if (!program || !w || !activeQuestFav) return;
    const trimmed = nickDraft.trim();
    const nextAlias = trimmed && trimmed !== w.name ? trimmed : undefined;
    const curAlias = activeQuestFav.alias || undefined;
    if (nextAlias === curAlias) {
      if (nickEdit) setNickEdit(null);
      return;
    }
    try {
      await updProf((pr) => ({
        ...pr,
        favs: (pr.favs || []).map((f) => (f.p === program.name && f.w === w.name ? { ...f, alias: nextAlias } : f)),
      }));
      setNickEdit(null);
      showToast(nextAlias ? 'Quest nickname updated' : 'Quest nickname cleared', 'success');
    } catch (e) { showToast('Could not update nickname: ' + e.message, 'error'); }
  };

  const nickInputProps = {
    type: 'text',
    value: nickDraft,
    onChange: (e) => setNickEdit({ key: nickKey, val: e.target.value }),
    onBlur: () => {
      if (skipNickBlurRef.current) { skipNickBlurRef.current = false; return; }
      commitNickname();
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter') e.currentTarget.blur();
      if (e.key === 'Escape') {
        skipNickBlurRef.current = true;
        setNickEdit(null);
        e.currentTarget.blur();
      }
    },
    'aria-label': 'Quest nickname',
  };
  const patchDraft = (fn) => setDraft((d) => fn(d && savedDraft && d.id === savedDraft.id ? d : clone(savedDraft)));
  const setW = (fn) => patchDraft((d) => ({ ...d, workouts: d.workouts.map((x, k) => (k === wi ? fn(x) : x)) }));
  const setEx = (i, patch) => setW((x) => ({ ...x, exercises: x.exercises.map((e, k) => (k === i ? (typeof patch === 'function' ? patch(e) : { ...e, ...patch }) : e)) }));
  const setWs = (fn) => patchDraft((d) => ({ ...d, workouts: fn(d.workouts) }));

  useEffect(() => {
    if (focusNewRef.current && w?.exercises?.length) {
      focusNewRef.current = false;
      const el = nameRefs.current[w.exercises.length - 1];
      if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
    }
  }, [w?.exercises?.length]);

  const pickProgram = (id) => {
    if (id === pid) return;
    if (dirty) { showToast('Save or discard changes before switching programs', 'info'); return; }
    setPid(id);
    setWi(0);
    setExpandedIdx(null);
  };

  const pickVariant = (idx) => {
    setWi(idx);
    setExpandedIdx(null);
  };

  const save = async () => {
    if (!program || !viewDraft) return;
    setSaving(true);
    try {
      const cleanName = viewDraft.name.trim() || program.name;
      const clean = viewDraft.workouts.map((x) => ({ ...x, exercises: (x.exercises || []).filter((e) => e.name.trim()) }));
      await api.updateProgram(program.id, cleanName, clean);
      setDraft({ id: program.id, name: cleanName, workouts: clone(clean) });
      await reloadPrograms();
      showToast('Program saved', 'success');
    } catch (e) { showToast('Could not save: ' + e.message, 'error'); }
    setSaving(false);
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && dirty && !saving) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const newProgram = async () => {
    if (dirty) { showToast('Save or discard changes before creating a program', 'info'); return; }
    try {
      const r = await api.createProgram('New program', [{ name: 'Workout A', exercises: [] }]);
      await reloadPrograms();
      if (r?.program?.id) { setPid(r.program.id); setWi(0); setExpandedIdx(null); }
    } catch (e) { showToast('Could not create: ' + e.message, 'error'); }
  };

  const delProgram = async () => {
    if (!program) return;
    try {
      await api.deleteProgram(program.id);
      setPid(null);
      setExpandedIdx(null);
      await reloadPrograms();
      showToast('Program deleted', 'success');
    } catch (e) { showToast('Could not delete: ' + e.message, 'error'); }
  };

  const addVariant = () => {
    const nextIdx = ws.length;
    setWs((a) => [...a, { name: `Workout ${String.fromCharCode(65 + a.length)}`, exercises: [] }]);
    setWi(nextIdx);
    setExpandedIdx(null);
  };

  const moveEx = (i, d) => {
    reorder(moveOrder(exList, i, d), exList);
  };

  const reorder = (order, list) => {
    setW((x) => ({ ...x, exercises: order.map((k) => list[k]) }));
    if (expandedIdx != null) setExpandedIdx(order.indexOf(expandedIdx));
  };

  const pairWith = (i, partner) => {
    const list = pairSuperset(exList, i, partner);
    reorder(gatherOrder(list, i), list);
  };

  // A superset rests once, after the round, so its members share one rest value.
  const setRest = (i, v) => {
    const targets = supersetMembersOf(exList, i) || [i];
    setW((x) => ({ ...x, exercises: x.exercises.map((e, k) => (targets.includes(k) ? { ...e, restSeconds: v } : e)) }));
  };

  const setSets = (i, v) => setEx(i, (x) => ({ ...x, sets: v ?? 1, failureIndices: (x.failureIndices || []).filter((f) => f < (v ?? 1)) }));

  const removeEx = (i) => {
    setW((x) => ({ ...x, exercises: pairSuperset(x.exercises, i, null).filter((_, k) => k !== i) }));
    if (expandedIdx === i) setExpandedIdx(null);
    else if (expandedIdx != null && expandedIdx > i) setExpandedIdx(expandedIdx - 1);
  };

  const exList = w?.exercises || [];

  const hasVars = ws.some((x) => x.variationOf);

  return (
    <div className="min-h-dvh grid" style={{ gridTemplateColumns: '236px minmax(0, 1fr)' }}>
      <NamesList id="desk-names" names={names} />

      {/* Left Pane: Programs Directory */}
      <aside className="border-r border-border bg-bg-0 sticky top-0 h-dvh flex flex-col">
        <div className="px-4 pt-5 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold tracking-tight">Programs</h2>
            <span className="text-[11px] font-mono text-text-tertiary tabular-nums flex-1">{programs.length}</span>
            <Btn kind="plain" onClick={newProgram} disabled={dirty} className="px-2.5 py-1 text-[12px]">+ New</Btn>
          </div>
          <div className="relative mt-2.5">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or nickname…"
              aria-label="Search programs or nicknames"
              className={`w-full bg-bg-1 border border-border rounded-lg pl-8 ${search ? 'pr-7' : 'pr-3'} py-1.5 text-[12px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/60 transition-colors`}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary cursor-pointer text-xs px-1"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 flex flex-col gap-0.5">
          {filteredPrograms.map((p) => {
            const on = p.id === pid;
            const pWorkouts = parseW(p);
            const hasNormalFav = pWorkouts.some((x) => x.favorite);
            const qFavs = pWorkouts.map((x) => questFavOf(p.name, x.name)).filter(Boolean);
            const hasQuestFav = qFavs.length > 0;
            const nicknames = qFavs.map((f) => f.alias).filter(Boolean);
            const tip = nicknames.length ? `${p.name || 'Untitled'} · ${nicknames.join(', ')}` : (p.name || 'Untitled');
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pickProgram(p.id)}
                title={tip}
                className={`w-full text-left px-2.5 py-2 rounded-lg flex flex-col items-stretch cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${on ? 'bg-bg-2 text-text-primary font-semibold' : 'text-text-secondary hover:bg-bg-1 hover:text-text-primary'}`}
                style={on ? { boxShadow: 'inset 2px 0 0 var(--color-accent)' } : undefined}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate flex-1 min-w-0 text-[13px]">{p.name || 'Untitled'}</span>
                  {hasNormalFav && <span className="text-accent text-[10px] shrink-0" title="Favourite in Normal mode">★</span>}
                  {hasQuestFav && <span className="text-[#fbbf24] text-[10px] shrink-0" title="Favourite in Quest mode">★</span>}
                  <span className="text-[11px] font-mono text-text-tertiary tabular-nums shrink-0">{pWorkouts.length}</span>
                </span>
                {nicknames.length > 0 && (
                  <span className="block truncate text-[10px] font-mono font-normal text-[#fbbf24]/85 mt-0.5">
                    {nicknames.join(' · ')}
                  </span>
                )}
              </button>
            );
          })}
          {filteredPrograms.length === 0 && (
            <p className="px-3 py-6 text-center text-[12px] text-text-tertiary">No programs match “{search}”.</p>
          )}
        </div>
      </aside>

      {/* Right Pane: Program & Variant Studio */}
      <section className="min-w-0 px-6 py-6 pb-24 max-w-[1140px]">
        {!program || !viewDraft ? (
          <div className="rounded-[14px] bg-bg-1 border border-border p-8 text-center">
            <p className="text-text-secondary text-sm">No program selected.</p>
            <Btn kind="primary" onClick={newProgram} className="mt-4">+ Create first program</Btn>
          </div>
        ) : (
          <>
            {/* Program Header */}
            <header className="pb-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <input
                  type="text"
                  value={viewDraft.name}
                  onChange={(e) => patchDraft((d) => ({ ...d, name: e.target.value }))}
                  aria-label="Program name"
                  className="text-[22px] font-extrabold tracking-tight bg-transparent hover:bg-bg-1 focus:bg-bg-1 rounded-lg px-2 py-0.5 -ml-2 w-full max-w-[520px] outline-none focus:ring-1 focus:ring-accent/60 transition-colors"
                />
                <div className="mt-1 flex items-center gap-2 text-[11px] font-mono text-text-tertiary">
                  <span>{ws.length} {ws.length === 1 ? 'workout' : hasVars ? 'variants' : 'workouts'}</span>
                  {w && <span>· {exList.length} {exList.length === 1 ? 'exercise' : 'exercises'}</span>}
                  <span>·</span>
                  <span className={dirty ? 'text-accent font-medium' : 'text-text-tertiary'}>{dirty ? 'Unsaved' : 'Saved'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <Btn
                  onClick={toggleAutoGlobal}
                  className={agg.autoFailure ? 'border-accent/50 text-accent' : ''}
                  title="Global Auto weight default for every workout (saves immediately)"
                >
                  {agg.autoFailure ? '✓ Auto default: On' : 'Auto default: Off'}
                </Btn>
                <Btn onClick={addVariant}>+ New {hasVars ? 'variant' : 'workout'}</Btn>
                <ConfirmBtn label="Delete program" confirm="Confirm delete" onConfirm={delProgram} />
              </div>
            </header>

            {/* Variants Selector Strip */}
            {(() => {
              const anyNormalFav = ws.some((x) => x.favorite);
              const anyQuestFav = ws.some((x) => !!questFavOf(program.name, x.name));
              return (
                <div className="py-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="text-text-tertiary uppercase" style={{ font: `600 10px ${MONO}`, letterSpacing: '.14em' }}>
                      {hasVars ? 'Base & variants' : 'Workouts'}
                    </div>
                    {(anyNormalFav || anyQuestFav) && (
                      <div className="flex items-center gap-3 text-[10px] font-mono text-text-tertiary">
                        {anyNormalFav && (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-accent">★</span>Normal
                          </span>
                        )}
                        {anyQuestFav && (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-[#fbbf24]">★</span>Quest
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {ws.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ws.map((x, k) => {
                        const on = k === wi;
                        const isNormalFav = !!x.favorite;
                        const qFav = questFavOf(program.name, x.name);
                        const isQuestFav = !!qFav;
                        const alias = qFav?.alias || null;
                        const baseLabel = shortVariantLabel(x.name, viewDraft.name);
                        const modeTip = [isNormalFav && 'Normal fav', isQuestFav && 'Quest fav'].filter(Boolean).join(' + ');
                        const tip = [alias ? `${alias} (${x.name})` : x.name, modeTip].filter(Boolean).join(' · ');
                        const pillCls = on
                          ? (isQuestFav && !isNormalFav
                            ? 'bg-bg-3 text-text-primary border-[#fbbf24]/80 ring-1 ring-[#fbbf24]/35 font-semibold'
                            : 'bg-bg-3 text-text-primary border-accent/70 ring-1 ring-accent/35 font-semibold')
                          : isQuestFav
                            ? 'bg-[#fbbf24]/[0.06] text-text-primary border-[#fbbf24]/35 hover:bg-[#fbbf24]/[0.12]'
                            : isNormalFav
                              ? 'bg-accent/[0.06] text-text-primary border-accent/35 hover:bg-accent/[0.12]'
                              : 'bg-bg-1 text-text-secondary border-border hover:bg-bg-2 hover:text-text-primary';
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => pickVariant(k)}
                            title={tip}
                            className={`px-3 py-1.5 rounded-lg border text-[12px] flex items-center gap-1.5 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${pillCls}`}
                          >
                            {isNormalFav && <span className="text-accent text-[10px]" aria-label="Normal favourite">★</span>}
                            {isQuestFav && <span className="text-[#fbbf24] text-[10px]" aria-label="Quest favourite">★</span>}
                            {alias ? (
                              <>
                                <span className="max-w-[200px] truncate font-semibold">{alias}</span>
                                <span className="text-[10px] font-mono text-text-tertiary truncate max-w-[110px]">{baseLabel}</span>
                              </>
                            ) : (
                              <span className="max-w-[210px] truncate">{baseLabel}</span>
                            )}
                            <span className="text-[10px] font-mono text-text-tertiary tabular-nums">{(x.exercises || []).length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Selected Variant Editor Card */}
            {!w ? (
              <div className="rounded-[14px] bg-bg-1 border border-border p-8 text-center">
                <p className="text-text-tertiary text-sm">This program has no workouts yet.</p>
                <Btn onClick={addVariant} className="mt-3">+ Add workout</Btn>
              </div>
            ) : (
              <div className="rounded-[14px] bg-bg-1 border border-border overflow-hidden">
                {/* Variant Toolbar */}
                <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    {activeQuestFav?.alias ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#fbbf24] text-[13px] shrink-0" title="Quest nickname">★</span>
                          <input
                            {...nickInputProps}
                            placeholder="Quest nickname…"
                            className="text-[16px] font-extrabold tracking-tight text-text-primary bg-transparent hover:bg-bg-2 focus:bg-bg-0 rounded-lg px-2 py-0.5 -ml-1 w-full max-w-[460px] outline-none focus:ring-1 focus:ring-[#fbbf24]/60 transition-colors"
                          />
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="text-[10px] font-mono uppercase tracking-[.1em] text-text-tertiary shrink-0">Workout</span>
                          <input
                            type="text"
                            value={w.name}
                            onChange={(e) => setW((x) => ({ ...x, name: e.target.value }))}
                            aria-label="Workout name"
                            className="text-[12px] font-mono text-text-secondary bg-transparent hover:bg-bg-2 focus:bg-bg-0 rounded-md px-1.5 py-0.5 w-full max-w-[420px] outline-none focus:ring-1 focus:ring-accent/60 transition-colors"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={w.name}
                          onChange={(e) => setW((x) => ({ ...x, name: e.target.value }))}
                          aria-label="Workout name"
                          className="text-[15px] font-bold bg-transparent hover:bg-bg-2 focus:bg-bg-0 rounded-lg px-2 py-1 -ml-2 w-full max-w-[480px] outline-none focus:ring-1 focus:ring-accent/60 transition-colors"
                        />
                        {activeQuestFav && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-[#fbbf24]/85 shrink-0">★ Quest nickname</span>
                            <input
                              {...nickInputProps}
                              placeholder="Add nickname…"
                              className="text-[12px] font-mono text-text-primary placeholder:text-text-tertiary bg-transparent hover:bg-bg-2 focus:bg-bg-0 rounded-md px-2 py-0.5 w-56 outline-none focus:ring-1 focus:ring-[#fbbf24]/60 transition-colors"
                            />
                          </div>
                        )}
                      </>
                    )}
                    {w.variationOf && (
                      <p className="mt-1 text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>
                        Variation of {w.variationOf}{w.variationChanges ? ` · ${w.variationChanges}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    <Btn
                      onClick={() => setW((x) => ({ ...x, favorite: !x.favorite }))}
                      className={w.favorite ? 'border-accent/50 text-accent' : ''}
                      title="Normal mode favourite (saves with program)"
                    >
                      {w.favorite ? '★ Normal' : '☆ Normal'}
                    </Btn>
                    <Btn
                      onClick={toggleQuestFav}
                      disabled={!canQuestFav}
                      className={activeQuestFav ? 'border-[#fbbf24]/50 text-[#fbbf24]' : ''}
                      title={canQuestFav ? 'Quest mode favourite (saves immediately)' : 'Save program first to favourite in Quest mode'}
                    >
                      {activeQuestFav ? '★ Quest' : '☆ Quest'}
                    </Btn>
                    <Btn onClick={() => { setWs((a) => move(a, wi, -1)); setWi(Math.max(0, wi - 1)); setExpandedIdx(null); }} disabled={wi === 0} title="Move variant earlier">←</Btn>
                    <Btn onClick={() => { setWs((a) => move(a, wi, 1)); setWi(Math.min(ws.length - 1, wi + 1)); setExpandedIdx(null); }} disabled={wi === ws.length - 1} title="Move variant later">→</Btn>
                    <Btn onClick={() => { setWs((a) => [...a.slice(0, wi + 1), { ...clone(w), name: `${w.name} (copy)`, favorite: false }, ...a.slice(wi + 1)]); setWi(wi + 1); setExpandedIdx(null); }}>Duplicate</Btn>
                    <ConfirmBtn label="Delete" confirm="Confirm" onConfirm={() => { setWs((a) => a.filter((_, k) => k !== wi)); setWi(Math.max(0, wi - 1)); setExpandedIdx(null); }} />
                  </div>
                </div>

                {/* Column Header Bar */}
                <div className="px-4 py-2 bg-bg-0/40 border-b border-border/70 flex items-center gap-2 text-[10px] font-mono tracking-[.12em] text-text-tertiary uppercase">
                  <span className="w-6 text-center">#</span>
                  <span className="flex-1 min-w-0">Exercise</span>
                  <span className="w-12 text-right">Sets</span>
                  <span className="w-16 text-center">Reps</span>
                  <span className="w-[62px] text-right">Rest</span>
                  <span className="w-[122px]" />
                </div>

                {/* Exercise Rows */}
                <div className="divide-y divide-border/60">
                  {exList.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-text-tertiary">
                      No exercises in this variant yet.
                    </div>
                  ) : exList.map((e, i) => {
                    const kind = kindOf(e);
                    const cardio = kind === 'cardio';
                    const n = Math.max(1, Math.min(12, Number(e.sets) || 1));
                    const fails = e.failureIndices || [];
                    const open = expandedAll || expandedIdx === i;
                    const toggleOpen = () => {
                      if (expandedAll) { setExpandedAll(false); setExpandedIdx(i); }
                      else setExpandedIdx(expandedIdx === i ? null : i);
                    };
                    const members = supersetMembersOf(exList, i);
                    const partners = (members || []).filter((k) => k !== i);
                    const setsOf = (k) => Math.max(1, Math.min(12, Number(exList[k].sets) || 1));
                    const counts = (members || []).map(setsOf);
                    const together = Math.min(...counts), rounds = Math.max(...counts);

                    const kindLabel = kind === 'drops' ? `DROP ×${e.numDrops || 1}`
                      : kind === 'bfr' ? `BFR ${e.bfrSeconds || 45}s`
                        : kind === 'interval' ? 'INTERVAL'
                          : kind === 'timed' ? `TIMED ${e.timedSec || 60}s`
                            : kind === 'cardio' ? 'CARDIO' : null;
                    const failLabel = ['normal', 'drops'].includes(kind) && fails.length > 0
                      ? (fails.length >= n ? 'FAIL ALL' : `FAIL ${fails.map((f) => f + 1).join(',')}`)
                      : null;
                    const autoLabel = autoCapable(e) && e.autoWeight !== undefined
                      ? (e.autoWeight ? 'AUTO ON' : 'AUTO OFF')
                      : null;

                    return (
                      <div key={i} style={members ? { boxShadow: 'inset 2px 0 0 var(--g-ss, #4f8fe0)' } : undefined}>
                        {/* Main single-line row */}
                        <div className="group px-4 py-2 flex items-center gap-2 hover:bg-bg-2/40 transition-colors">
                          <span className="w-6 text-center text-[11px] font-mono text-text-tertiary tabular-nums shrink-0">{i + 1}</span>

                          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <input
                              ref={(el) => { nameRefs.current[i] = el; }}
                              type="text"
                              list="desk-names"
                              value={e.name}
                              placeholder="Exercise name"
                              onChange={(ev) => setW((x) => ({ ...x, exercises: renameInSuperset(x.exercises, i, ev.target.value) }))}
                              className={`flex-1 min-w-[min(200px,100%)] text-[14px] font-medium text-text-primary ${inlineField} -ml-2`}
                            />
                            <div className="ml-auto flex flex-wrap justify-end items-center gap-1">
                              {kindLabel && <Chip onClick={toggleOpen} title="Exercise mode">{kindLabel}</Chip>}
                              {members && (
                                <Chip tone="ss" onClick={toggleOpen} title={`Superset with ${partners.map((k) => exList[k].name).join(' + ')}`}>
                                  {`SS ${String.fromCharCode(65 + members.indexOf(i))} · ${partners.map((k) => `#${k + 1}`).join(' ')}`}
                                </Chip>
                              )}
                              {failLabel && <Chip tone="accent" onClick={toggleOpen} title="Sets to failure">{failLabel}</Chip>}
                              {autoLabel && <Chip onClick={toggleOpen} title="Auto weight override">{autoLabel}</Chip>}
                              {e.isVariable && ['normal', 'drops'].includes(kind) && <Chip onClick={toggleOpen} title="Custom weight/reps per set">PER-SET</Chip>}
                            </div>
                          </div>

                          <div className="w-12 shrink-0 flex justify-end">
                            {cardio ? (
                              <span className="text-text-tertiary font-mono text-[13px] pr-2">1</span>
                            ) : (
                              <input
                                type="number"
                                min={1}
                                max={12}
                                value={e.sets ?? ''}
                                onFocus={(ev) => ev.target.select()}
                                onChange={(ev) => setSets(i, ev.target.value === '' ? undefined : Number(ev.target.value))}
                                aria-label={`Sets for ${e.name || 'exercise'}`}
                                className={`w-12 text-right text-[13px] font-mono tabular-nums ${inlineField}`}
                              />
                            )}
                          </div>

                          <div className="w-16 shrink-0 flex items-center justify-center">
                            {cardio ? (
                              <span className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={1}
                                  value={Math.round((e.targetDurationSec || 0) / 60)}
                                  onFocus={(ev) => ev.target.select()}
                                  onChange={(ev) => setEx(i, { targetDurationSec: (ev.target.value === '' ? 0 : Number(ev.target.value)) * 60 })}
                                  className={`w-11 text-right text-[13px] font-mono tabular-nums ${inlineField}`}
                                />
                                <span className="text-text-tertiary text-[11px] font-mono">m</span>
                              </span>
                            ) : (
                              <input
                                type="text"
                                value={e.repRange || ''}
                                placeholder="8-12"
                                onChange={(ev) => setEx(i, { repRange: ev.target.value })}
                                aria-label={`Reps for ${e.name || 'exercise'}`}
                                className={`w-16 text-center text-[13px] font-mono tabular-nums ${inlineField}`}
                              />
                            )}
                          </div>

                          <div className="w-[62px] shrink-0 flex items-center justify-end gap-0.5">
                            {cardio ? null : (
                              <>
                                <input
                                  type="number"
                                  min={0}
                                  step={15}
                                  value={e.restSeconds ?? ''}
                                  onFocus={(ev) => ev.target.select()}
                                  onChange={(ev) => setRest(i, ev.target.value === '' ? undefined : Number(ev.target.value))}
                                  aria-label={`Rest seconds for ${e.name || 'exercise'}`}
                                  className={`w-[48px] text-right text-[13px] font-mono tabular-nums ${inlineField}`}
                                />
                                <span className="text-text-tertiary text-[11px] font-mono">s</span>
                              </>
                            )}
                          </div>

                          <div className="w-[122px] shrink-0 flex items-center justify-end gap-0.5">
                            <button
                              type="button"
                              onClick={toggleOpen}
                              aria-expanded={open}
                              aria-label="Tune exercise"
                              className={`px-2 py-1 rounded-md text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-colors ${open ? 'bg-bg-3 text-text-primary' : 'text-text-tertiary hover:text-text-primary hover:bg-bg-2'}`}
                            >
                              <span>Tune</span>
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                                className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true">
                                <path d="M4 6l4 4 4-4" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => moveEx(i, -1)}
                              disabled={i === 0}
                              title="Move up"
                              className="w-6 h-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-3 opacity-45 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity cursor-pointer disabled:opacity-15 disabled:pointer-events-none text-xs"
                            >↑</button>
                            <button
                              type="button"
                              onClick={() => moveEx(i, 1)}
                              disabled={i === exList.length - 1}
                              title="Move down"
                              className="w-6 h-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-3 opacity-45 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity cursor-pointer disabled:opacity-15 disabled:pointer-events-none text-xs"
                            >↓</button>
                            <button
                              type="button"
                              onClick={() => removeEx(i)}
                              title="Remove"
                              aria-label={`Remove ${e.name || 'exercise'}`}
                              className="w-6 h-7 rounded-md flex items-center justify-center text-error/80 hover:text-error hover:bg-error/20 opacity-65 group-hover:opacity-100 group-focus-within:opacity-100 transition-[background-color,color,opacity] cursor-pointer"
                            >
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4.5 4.5l.7 8.5a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9l.7-8.5" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Expandable Tuning Tray */}
                        {open && (
                          <div className="bg-bg-0/65 border-t border-border/50 px-6 py-4 flex flex-col gap-4">
                            {/* Row 1: Type + kind-specific params */}
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-[10px] font-mono uppercase tracking-[.12em] text-text-tertiary">Type</span>
                                <div className="inline-flex flex-wrap gap-1 p-1 rounded-lg bg-bg-1 border border-border">
                                  {KINDS.map(([k, l]) => {
                                    const active = kind === k;
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        onClick={() => setW((x) => ({ ...x, exercises: (k === 'cardio' ? pairSuperset(x.exercises, i, null) : x.exercises).map((y, j) => (j === i ? withKind(y, k) : y)) }))}
                                        className={`px-2.5 py-1 rounded-md text-[12px] cursor-pointer transition-colors ${active ? 'bg-bg-3 text-text-primary border border-border-strong font-semibold' : 'text-text-secondary hover:text-text-primary border border-transparent'}`}
                                      >
                                        {l}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex items-center gap-4 flex-wrap text-[12px] text-text-secondary">
                                {kind === 'drops' && (
                                  <label className="flex items-center gap-2">Drops per set <NumIn value={e.numDrops} min={1} max={4} onChange={(v) => setEx(i, { numDrops: v ?? 1 })} className="w-14" /></label>
                                )}
                                {kind === 'bfr' && (
                                  <label className="flex items-center gap-2">Cuff time <NumIn value={e.bfrSeconds} min={10} step={5} onChange={(v) => setEx(i, { bfrSeconds: v })} className="w-16" /> s</label>
                                )}
                                {kind === 'interval' && (
                                  <>
                                    <label className="flex items-center gap-2">Work <NumIn value={e.intervalWork} min={5} step={5} onChange={(v) => setEx(i, { intervalWork: v })} className="w-16" /> s</label>
                                    <label className="flex items-center gap-2">Rest <NumIn value={e.intervalRest} min={0} step={5} onChange={(v) => setEx(i, { intervalRest: v })} className="w-16" /> s</label>
                                    <label className="flex items-center gap-2">Total <NumIn value={e.intervalTotal} min={30} step={30} onChange={(v) => setEx(i, { intervalTotal: v })} className="w-20" /> s</label>
                                  </>
                                )}
                                {kind === 'timed' && (
                                  <label className="flex items-center gap-2">Each set <NumIn value={e.timedSec} min={10} step={5} onChange={(v) => setEx(i, { timedSec: v })} className="w-16" /> s</label>
                                )}
                              </div>
                            </div>

                            {/* Row 2: Failure sets | Superset partner | Auto weight */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-3 border-t border-border/40">
                              {['normal', 'drops'].includes(kind) ? (
                                <div>
                                  <div className="text-[10px] font-mono uppercase tracking-[.12em] text-text-tertiary mb-2">Failure sets</div>
                                  <div className="flex flex-wrap gap-1">
                                    {Array.from({ length: n }, (_, k) => {
                                      const on = fails.includes(k);
                                      return (
                                        <button
                                          key={k}
                                          type="button"
                                          onClick={() => setEx(i, { failureIndices: on ? fails.filter((f) => f !== k) : [...fails, k].sort((a, b) => a - b) })}
                                          className={`px-2 h-7 rounded-md text-[11px] font-mono cursor-pointer transition-colors ${on ? 'bg-accent font-bold' : 'bg-bg-2 text-text-secondary hover:bg-bg-3'}`}
                                          style={on ? { color: 'var(--color-on-accent)' } : undefined}
                                        >
                                          S{k + 1}
                                        </button>
                                      );
                                    })}
                                    <button
                                      type="button"
                                      onClick={() => setEx(i, { failureIndices: fails.length >= n ? [] : Array.from({ length: n }, (_, k) => k) })}
                                      className={`px-2.5 h-7 rounded-md text-[11px] font-mono cursor-pointer transition-colors ${fails.length >= n ? 'bg-accent font-bold' : 'bg-bg-2 text-text-secondary hover:bg-bg-3'}`}
                                      style={fails.length >= n ? { color: 'var(--color-on-accent)' } : undefined}
                                    >
                                      Fail all
                                    </button>
                                  </div>
                                </div>
                              ) : <div />}

                              {!cardio ? (
                                <div>
                                  <div className="text-[10px] font-mono uppercase tracking-[.12em] text-text-tertiary mb-2">Superset partner</div>
                                  <Sel aria-label={`Superset partner for ${e.name || 'exercise'}`} value={partners[0] ?? ''} disabled={!e.name.trim()} onChange={(ev) => pairWith(i, ev.target.value === '' ? null : Number(ev.target.value))} className="w-full text-[13px]">
                                    <option value="">None</option>
                                    {exList.map((x, k) => (k !== i && x.name.trim() && x.name.trim().toLowerCase() !== e.name.trim().toLowerCase() && kindOf(x) !== 'cardio'
                                      ? <option key={k} value={k}>{`#${k + 1} ${x.name}`}</option> : null))}
                                  </Sel>
                                </div>
                              ) : <div />}

                              {autoCapable(e) ? (
                                <div>
                                  <div className="text-[10px] font-mono uppercase tracking-[.12em] text-text-tertiary mb-2">Auto weight</div>
                                  <div className="inline-flex gap-1 p-1 rounded-lg bg-bg-1 border border-border">
                                    {[
                                      ['', `Default (${agg.autoFailure ? 'on' : 'off'})`],
                                      ['on', 'On'],
                                      ['off', 'Off'],
                                    ].map(([val, lbl]) => {
                                      const cur = e.autoWeight === undefined ? '' : e.autoWeight ? 'on' : 'off';
                                      const on = cur === val;
                                      return (
                                        <button
                                          key={val || 'def'}
                                          type="button"
                                          onClick={() => setEx(i, (x) => { const y = { ...x }; if (val === '') delete y.autoWeight; else y.autoWeight = val === 'on'; return y; })}
                                          className={`px-2.5 py-1 rounded-md text-[12px] cursor-pointer transition-colors ${on ? 'bg-bg-3 text-text-primary font-semibold border border-border-strong' : 'text-text-secondary hover:text-text-primary border border-transparent'}`}
                                        >
                                          {lbl}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : <div />}
                            </div>

                            {/* Superset: sets for each exercise and the rest after a round */}
                            {members && (
                              <div className="rounded-xl border border-[#4f8fe0]/35 bg-[#4f8fe0]/8 px-4 py-3 flex flex-col gap-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-mono uppercase tracking-[.12em] text-[#7cb3f4]">Superset</span>
                                  <span className="text-[12px] text-text-secondary flex-1 min-w-0">
                                    {`${together} round${together === 1 ? '' : 's'} back to back`}
                                    {rounds > together && `, then ${members.filter((k) => setsOf(k) > together).map((k) => `${setsOf(k) - together} extra ${exList[k].name}`).join(' and ')}`}
                                  </span>
                                  <Btn onClick={() => reorder(moveOrder(exList, members[0], 1), exList)} disabled={members.length !== 2 || members[1] !== members[0] + 1} className="px-2.5 py-1 text-[12px]">Swap order</Btn>
                                  <Btn onClick={() => pairWith(i, null)} className="px-2.5 py-1 text-[12px]">Unlink</Btn>
                                </div>
                                {members.map((k, s) => (
                                  <label key={k} className="flex items-center gap-3 text-[13px]">
                                    <span className="w-4 font-mono text-[11px] text-[#7cb3f4]">{String.fromCharCode(65 + s)}</span>
                                    <span className={`flex-1 min-w-0 truncate ${k === i ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>{exList[k].name}</span>
                                    <NumIn value={exList[k].sets} min={1} max={12} onChange={(v) => setSets(k, v)} className="w-16 py-1" />
                                    <span className="w-8 text-[11px] font-mono text-text-tertiary">sets</span>
                                  </label>
                                ))}
                                <label className="flex items-center gap-3 text-[13px] pt-3 border-t border-[#4f8fe0]/25">
                                  <span className="flex-1">Rest after each round</span>
                                  <NumIn value={exList[members[0]].restSeconds} min={0} step={15} onChange={(v) => setRest(members[0], v)} className="w-16 py-1" />
                                  <span className="w-8 text-[11px] font-mono text-text-tertiary">sec</span>
                                </label>
                              </div>
                            )}

                            {/* Row 3: Custom per-set weight / reps */}
                            {['normal', 'drops'].includes(kind) && (
                              <div className="pt-3 border-t border-border/40 flex flex-col gap-3">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={!!e.isVariable}
                                  onClick={() => setEx(i, (x) => ({
                                    ...x,
                                    isVariable: !x.isVariable,
                                    variableSets: !x.isVariable ? Array.from({ length: n }, (_, k) => x.variableSets?.[k] || { weight: '', repRange: x.repRange }) : undefined,
                                  }))}
                                  className="self-start flex items-center gap-2.5 cursor-pointer"
                                >
                                  <span className="w-9 h-5 rounded-full relative transition-colors shrink-0" style={{ background: e.isVariable ? 'var(--color-accent)' : 'var(--color-bg-3)' }}>
                                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: e.isVariable ? 18 : 2 }} />
                                  </span>
                                  <span className="text-[12px] text-text-secondary">Custom weight / reps per set</span>
                                </button>

                                {e.isVariable && (
                                  <div className="flex flex-wrap gap-2">
                                    {Array.from({ length: n }, (_, k) => {
                                      const vs = e.variableSets?.[k] || {};
                                      const setVs = (patch) => setEx(i, (x) => {
                                        const a = Array.from({ length: n }, (_, j) => ({ ...(x.variableSets?.[j] || { weight: '', repRange: x.repRange }) }));
                                        a[k] = { ...a[k], ...patch };
                                        return { ...x, variableSets: a };
                                      });
                                      return (
                                        <span key={k} className="flex items-center gap-1.5 bg-bg-1 border border-border rounded-lg px-2.5 py-1.5 text-[12px]">
                                          <span className="text-text-tertiary font-mono text-[10px]">S{k + 1}</span>
                                          <NumIn value={vs.weight === '' ? undefined : Number(vs.weight)} step={0.5} min={0} onChange={(v) => setVs({ weight: v == null ? '' : String(v) })} className="w-16 py-0.5 text-[12px]" />
                                          <span className="text-text-tertiary text-[11px] font-mono">kg</span>
                                          <TextIn value={vs.repRange || ''} onChange={(ev) => setVs({ repRange: ev.target.value })} className="w-16 py-0.5 text-center text-[12px]" />
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Card Footer */}
                <div className="px-4 py-2.5 border-t border-border/60 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Btn onClick={() => { focusNewRef.current = true; setW((x) => ({ ...x, exercises: [...(x.exercises || []), newExercise()] })); }}>+ Add exercise</Btn>
                    {exList.some((e) => ['normal', 'drops'].includes(kindOf(e))) && (() => {
                      const eligible = exList.filter((e) => ['normal', 'drops'].includes(kindOf(e)));
                      const allFail = eligible.every((e) => (e.failureIndices || []).length >= Math.max(1, Math.min(12, Number(e.sets) || 1)));
                      return (
                        <Btn
                          onClick={() => setW((x) => ({
                            ...x,
                            exercises: (x.exercises || []).map((e) => {
                              if (!['normal', 'drops'].includes(kindOf(e))) return e;
                              const nSets = Math.max(1, Math.min(12, Number(e.sets) || 1));
                              return { ...e, failureIndices: allFail ? [] : Array.from({ length: nSets }, (_, k) => k) };
                            }),
                          }))}
                          className={allFail ? 'border-accent/50 text-accent' : ''}
                          title={allFail ? 'Clear failure sets on all exercises' : 'Set every set to failure on all exercises'}
                        >
                          {allFail ? '✓ Fail all' : 'Fail all'}
                        </Btn>
                      );
                    })()}
                    {exList.some(autoCapable) && (() => {
                      const eligible = exList.filter(autoCapable);
                      const allAuto = eligible.every((e) => autoOn(e, agg));
                      return (
                        <Btn
                          onClick={() => setW((x) => ({
                            ...x,
                            exercises: (x.exercises || []).map((e) => (autoCapable(e) ? { ...e, autoWeight: !allAuto } : e)),
                          }))}
                          className={allAuto ? 'border-accent/50 text-accent' : ''}
                          title={allAuto ? 'Turn Auto weight off for all exercises in this workout' : 'Turn Auto weight on for all exercises in this workout'}
                        >
                          {allAuto ? '✓ Auto all' : 'Auto all'}
                        </Btn>
                      );
                    })()}
                  </div>
                  {exList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setExpandedAll((v) => !v); setExpandedIdx(null); }}
                      className="text-[11px] font-mono text-text-tertiary hover:text-text-primary cursor-pointer"
                    >
                      {expandedAll ? 'Collapse all' : 'Expand all'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => setDraft(clone(savedDraft))} label="Save program" idle="Program saved" autoHide shortcut />
    </div>
  );
}
