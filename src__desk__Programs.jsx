// Desk → Programs: every program, its workouts, and each workout's exercises
// edited as a table: kind, sets, reps, rest, failure sets, supersets, per-set
// weights and Auto weight. Saved per program, like the phone app does.
import { useEffect, useMemo, useState } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import { aggressionOf } from '../lib/levelup';
import { autoCapable, autoOn } from '../lib/autofail';
import * as api from '../lib/api';
import { MONO, PageHead, Panel, Btn, TextIn, NumIn, Sel, ConfirmBtn, SaveBar, parseW, clone, allNames, NamesList } from './ui';

const KINDS = [['normal', 'Normal'], ['drops', 'Drop sets'], ['bfr', 'BFR'], ['interval', 'Interval'], ['timed', 'Timed'], ['cardio', 'Cardio']];
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

export default function DeskPrograms() {
  const { programs, workoutHistory, settings, reloadPrograms } = useWorkout();
  const { showToast } = useToast();
  const agg = aggressionOf(settings);
  const [pid, setPid] = useState(programs?.[0]?.id ?? null);
  const program = programs.find((p) => p.id === pid) || null;
  const [draft, setDraft] = useState(null); // { name, workouts }
  const [wi, setWi] = useState(0);
  const [saving, setSaving] = useState(false);
  const savedDraft = useMemo(() => (program ? { name: program.name, workouts: parseW(program) } : null), [program]);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(savedDraft);
  useEffect(() => { if (!dirty) setDraft(clone(savedDraft)); }, [savedDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!program && programs.length) setPid(programs[0].id); }, [programs, program]);
  const names = useMemo(() => allNames(programs, workoutHistory), [programs, workoutHistory]);

  const ws = draft?.workouts || [];
  const w = ws[wi] || null;
  const setW = (fn) => setDraft((d) => ({ ...d, workouts: d.workouts.map((x, k) => (k === wi ? fn(x) : x)) }));
  const setEx = (i, patch) => setW((x) => ({ ...x, exercises: x.exercises.map((e, k) => (k === i ? (typeof patch === 'function' ? patch(e) : { ...e, ...patch }) : e)) }));
  const setWs = (fn) => setDraft((d) => ({ ...d, workouts: fn(d.workouts) }));

  const pick = (id) => { if (dirty) return; setPid(id); setWi(0); };
  const save = async () => {
    setSaving(true);
    try {
      const clean = draft.workouts.map((x) => ({ ...x, exercises: (x.exercises || []).filter((e) => e.name.trim()) }));
      await api.updateProgram(program.id, draft.name.trim() || program.name, clean);
      await reloadPrograms();
      showToast('Program saved', 'success');
    } catch (e) { showToast('Could not save: ' + e.message, 'error'); }
    setSaving(false);
  };
  const newProgram = async () => {
    try { const r = await api.createProgram('New program', [{ name: 'Workout A', exercises: [] }]); await reloadPrograms(); if (r?.program?.id) { setPid(r.program.id); setWi(0); } }
    catch (e) { showToast('Could not create: ' + e.message, 'error'); }
  };
  const delProgram = async () => {
    try { await api.deleteProgram(program.id); setPid(null); await reloadPrograms(); showToast('Program deleted', 'success'); }
    catch (e) { showToast('Could not delete: ' + e.message, 'error'); }
  };

  const exNames = (w?.exercises || []).map((e) => e.name).filter(Boolean);

  return (
    <div className="pb-28">
      <PageHead eyebrow="PROGRAMS" title="Programs and workouts">
        Build and edit every workout on a big screen. Changes save per program with the button at the bottom, and show up in the phone app straight away.
      </PageHead>
      <NamesList id="desk-names" names={names} />

      <div className="grid gap-6 px-8 pt-6" style={{ gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)' }}>
        {/* Workouts */}
        <div className="min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1"><span className="flex-1 text-text-tertiary" style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em' }}>PROGRAM</span><Btn kind="ghost" onClick={newProgram} disabled={dirty}>+ New</Btn></div>
          <Sel value={pid ?? ''} onChange={(e) => pick(Number(e.target.value))} disabled={dirty} title={dirty ? 'Save or discard first' : ''}>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name} · {parseW(p).length} workout{parseW(p).length === 1 ? "" : "s"}</option>)}
          </Sel>
          {draft && (<>
            <TextIn value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className="font-extrabold text-[17px] px-3 py-2" aria-label="Program name" />
            <div className="flex items-center justify-between px-1 pt-1"><span className="text-text-tertiary" style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em' }}>WORKOUTS</span>
              <Btn kind="ghost" onClick={() => { setWs((a) => [...a, { name: `Workout ${String.fromCharCode(65 + a.length)}`, exercises: [] }]); setWi(ws.length); }}>+ New</Btn></div>
            <div className="flex flex-col gap-1 max-h-[64vh] overflow-y-auto pr-1">
              {ws.map((x, k) => {
                const c = (x.exercises || []).filter(autoCapable);
                return (
                  <button key={k} onClick={() => setWi(k)} className={`text-left px-3 py-2 rounded-lg ${k === wi ? 'bg-bg-3' : 'hover:bg-bg-2'}`}
                    style={k === wi ? { boxShadow: 'inset 2px 0 0 var(--color-accent)' } : undefined}>
                    <span className="flex items-baseline gap-2"><span className="flex-1 min-w-0 truncate text-[14px] font-semibold">{x.name || 'Untitled'}</span>{x.favorite && <span className="text-accent">★</span>}</span>
                    <span className="block text-text-tertiary truncate" style={{ font: `400 10px ${MONO}` }}>
                      {(x.exercises || []).length} exercises{c.length ? ` · AUTO ${c.filter((e) => autoOn(e, agg)).length}/${c.length}` : ''}{x.variationOf ? ' · variation' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            {dirty && <p className="px-1 text-text-tertiary" style={{ font: `400 10px/1.5 ${MONO}` }}>Save or discard to switch program.</p>}
            <ConfirmBtn label="Delete program" confirm="Tap again: delete program" onConfirm={delProgram} className="mt-3 self-start" />
          </>)}
        </div>

        {/* Workout editor */}
        <div className="min-w-0">
          {!w ? <Panel><p className="text-text-tertiary">This program has no workouts. Add one with + New.</p></Panel> : (
            <Panel pad={false}
              title={<TextIn value={w.name} onChange={(e) => setW((x) => ({ ...x, name: e.target.value }))} className="font-extrabold text-[18px] w-[min(520px,100%)]" aria-label="Workout name" />}
              right={<div className="flex gap-1.5 flex-wrap">
                <Btn onClick={() => setW((x) => ({ ...x, favorite: !x.favorite }))}>{w.favorite ? '★ Favourite' : '☆ Favourite'}</Btn>
                <Btn onClick={() => { setWs((a) => move(a, wi, -1)); setWi(Math.max(0, wi - 1)); }} disabled={wi === 0}>↑</Btn>
                <Btn onClick={() => { setWs((a) => move(a, wi, 1)); setWi(Math.min(ws.length - 1, wi + 1)); }} disabled={wi === ws.length - 1}>↓</Btn>
                <Btn onClick={() => { setWs((a) => [...a.slice(0, wi + 1), { ...clone(w), name: `${w.name} (copy)`, favorite: false }, ...a.slice(wi + 1)]); setWi(wi + 1); }}>Duplicate</Btn>
                <ConfirmBtn label="Delete" confirm="Tap again" onConfirm={() => { setWs((a) => a.filter((_, k) => k !== wi)); setWi(Math.max(0, wi - 1)); }} />
              </div>}>
              {w.variationOf && <p className="px-4 pt-3 text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>Variation of {w.variationOf}{w.variationChanges ? ` · ${w.variationChanges}` : ''}</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-[14px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <thead><tr className="text-text-tertiary text-left" style={{ font: `500 10px ${MONO}`, letterSpacing: '.08em' }}>
                    <th className="px-3 py-2 font-medium w-8">#</th><th className="px-2 py-2 font-medium min-w-[170px] w-full">EXERCISE</th><th className="px-2 py-2 font-medium">KIND</th>
                    <th className="px-2 py-2 font-medium">SETS</th><th className="px-2 py-2 font-medium">REPS</th><th className="px-2 py-2 font-medium">REST</th>
                    <th className="px-3 py-2" />
                  </tr></thead>
                  <tbody>
                    {(w.exercises || []).map((e, i) => {
                      const kind = kindOf(e), cardio = kind === 'cardio', n = Math.max(1, Math.min(12, Number(e.sets) || 1));
                      const fails = e.failureIndices || [];
                      return [
                        <tr key={i} className="border-t border-border align-top">
                          <td className="px-3 py-2.5 text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{i + 1}</td>
                          <td className="px-2 py-2"><TextIn list="desk-names" value={e.name} placeholder="Exercise name" onChange={(ev) => setEx(i, { name: ev.target.value })} className="w-full" /></td>
                          <td className="px-2 py-2"><Sel value={kind} onChange={(ev) => setEx(i, (x) => withKind(x, ev.target.value))}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Sel></td>
                          <td className="px-2 py-2">{cardio ? <span className="text-text-tertiary">1</span> : <NumIn value={e.sets} min={1} max={12} onChange={(v) => setEx(i, { sets: v ?? 1, failureIndices: fails.filter((f) => f < (v ?? 1)) })} className="w-14" />}</td>
                          <td className="px-2 py-2">{cardio ? <span className="flex items-center gap-1"><NumIn value={Math.round((e.targetDurationSec || 0) / 60)} min={1} onChange={(v) => setEx(i, { targetDurationSec: (v ?? 0) * 60 })} className="w-16" /><span className="text-text-tertiary text-xs">min</span></span>
                            : <TextIn value={e.repRange || ''} onChange={(ev) => setEx(i, { repRange: ev.target.value })} className="w-20 text-center" placeholder="8-12" />}</td>
                          <td className="px-2 py-2">{cardio ? null : <span className="flex items-center gap-1"><NumIn value={e.restSeconds} min={0} step={15} onChange={(v) => setEx(i, { restSeconds: v })} className="w-16" /><span className="text-text-tertiary text-xs">s</span></span>}</td>
                          <td className="px-1 py-2 whitespace-nowrap">
                            <Btn kind="ghost" onClick={() => setW((x) => ({ ...x, exercises: move(x.exercises, i, -1) }))} disabled={i === 0}>↑</Btn>
                            <Btn kind="ghost" onClick={() => setW((x) => ({ ...x, exercises: move(x.exercises, i, 1) }))} disabled={i === w.exercises.length - 1}>↓</Btn>
                            <Btn kind="ghost" onClick={() => setW((x) => ({ ...x, exercises: x.exercises.filter((_, k) => k !== i) }))} title="Remove">✕</Btn>
                          </td>
                        </tr>,
                        <tr key={`${i}-x`} className="align-top">
                          <td />
                          <td colSpan={6} className="px-2 pb-3">
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-text-secondary text-[13px]">
                              {['normal', 'drops'].includes(kind) && <span className="flex items-center gap-2">To failure <span className="flex gap-1">{Array.from({ length: n }, (_, k) => {
                              const on = fails.includes(k);
                              return <button key={k} onClick={() => setEx(i, { failureIndices: on ? fails.filter((f) => f !== k) : [...fails, k].sort((a, b) => a - b) })}
                                className={`w-7 h-7 rounded-md text-xs font-bold ${on ? 'bg-accent' : 'bg-bg-3 text-text-secondary'}`} style={on ? { color: 'var(--color-on-accent)' } : undefined} title={`Set ${k + 1} to failure`}>{k + 1}</button>;
                            })}</span></span>}
                              {!cardio && <label className="flex items-center gap-2">Superset with <Sel value={e.supersetWith || ''} onChange={(ev) => setEx(i, { supersetWith: ev.target.value || null })} className="max-w-[200px]">
                                <option value="">—</option>{exNames.filter((x) => x !== e.name).map((x) => <option key={x} value={x}>{x}</option>)}</Sel></label>}
                              {autoCapable(e) && <label className="flex items-center gap-2">Auto weight <Sel value={e.autoWeight === undefined ? '' : e.autoWeight ? 'on' : 'off'}
                                onChange={(ev) => setEx(i, (x) => { const y = { ...x }; if (ev.target.value === '') delete y.autoWeight; else y.autoWeight = ev.target.value === 'on'; return y; })}>
                                <option value="">Default ({agg.autoFailure ? 'on' : 'off'})</option><option value="on">On</option><option value="off">Off</option></Sel></label>}
                              {kind === 'drops' && <label className="flex items-center gap-2">Drops after each set <NumIn value={e.numDrops} min={1} max={4} onChange={(v) => setEx(i, { numDrops: v ?? 1 })} className="w-14" /></label>}
                              {kind === 'bfr' && <label className="flex items-center gap-2">Cuff time <NumIn value={e.bfrSeconds} min={10} step={5} onChange={(v) => setEx(i, { bfrSeconds: v })} className="w-16" /> s</label>}
                              {kind === 'interval' && <>
                                <label className="flex items-center gap-2">Work <NumIn value={e.intervalWork} min={5} step={5} onChange={(v) => setEx(i, { intervalWork: v })} className="w-16" /> s</label>
                                <label className="flex items-center gap-2">Rest <NumIn value={e.intervalRest} min={0} step={5} onChange={(v) => setEx(i, { intervalRest: v })} className="w-16" /> s</label>
                                <label className="flex items-center gap-2">Total <NumIn value={e.intervalTotal} min={30} step={30} onChange={(v) => setEx(i, { intervalTotal: v })} className="w-20" /> s</label></>}
                              {kind === 'timed' && <label className="flex items-center gap-2">Each set lasts <NumIn value={e.timedSec} min={10} step={5} onChange={(v) => setEx(i, { timedSec: v })} className="w-16" /> s</label>}
                              {['normal', 'drops'].includes(kind) && (
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={!!e.isVariable} style={{ accentColor: 'var(--color-accent)' }}
                                    onChange={(ev) => setEx(i, (x) => ({ ...x, isVariable: ev.target.checked, variableSets: ev.target.checked ? Array.from({ length: n }, (_, k) => x.variableSets?.[k] || { weight: '', repRange: x.repRange }) : undefined }))} />
                                  Weight per set</label>)}
                              {e.isVariable && ['normal', 'drops'].includes(kind) && Array.from({ length: n }, (_, k) => {
                                const vs = e.variableSets?.[k] || {};
                                const setVs = (patch) => setEx(i, (x) => { const a = Array.from({ length: n }, (_, j) => ({ ...(x.variableSets?.[j] || { weight: '', repRange: x.repRange }) })); a[k] = { ...a[k], ...patch }; return { ...x, variableSets: a }; });
                                return <span key={k} className="flex items-center gap-1.5 bg-bg-2 rounded-lg px-2 py-1"><span className="text-text-tertiary" style={{ font: `500 10px ${MONO}` }}>S{k + 1}</span>
                                  <NumIn value={vs.weight === '' ? undefined : Number(vs.weight)} step={0.5} min={0} onChange={(v) => setVs({ weight: v == null ? '' : String(v) })} className="w-16" />kg
                                  <TextIn value={vs.repRange || ''} onChange={(ev) => setVs({ repRange: ev.target.value })} className="w-16 text-center" /></span>;
                              })}
                            </div>
                          </td>
                        </tr>,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-border"><Btn onClick={() => setW((x) => ({ ...x, exercises: [...(x.exercises || []), newExercise()] }))}>+ Add exercise</Btn></div>
            </Panel>
          )}
        </div>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => setDraft(clone(savedDraft))} label="Save program" idle="Program saved" />
    </div>
  );
}
