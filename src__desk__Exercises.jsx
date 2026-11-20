// Desk → Exercises: every exercise name you've used, where it's used, and
// rename / merge applied everywhere at once: programs (and supersets),
// history, library links and Auto weight rules. Likely duplicates are flagged.
import { useMemo, useState } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import useCatalog from '../hooks/useCatalog';
import { resolve, norm } from '../lib/catalog';
import { isMarker } from '../lib/history';
import * as api from '../lib/api';
import { MONO, PageHead, Panel, Btn, TextIn, parseW, exsOf, day, NamesList } from './ui';

export default function DeskExercises() {
  const { programs, workoutHistory, settings, reloadPrograms, reloadHistory, reloadSettings } = useWorkout();
  const { showToast } = useToast();
  const cat = useCatalog();
  const links = settings?.exerciseLinks || {};
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState('');

  const rows = useMemo(() => {
    const m = new Map();
    const get = (n) => { if (!m.has(n)) m.set(n, { name: n, workouts: new Set(), sessions: 0, last: '' }); return m.get(n); };
    for (const p of programs || []) for (const w of parseW(p)) for (const e of w.exercises || []) if (e?.name) get(e.name).workouts.add(`${p.name} · ${w.name}`);
    for (const h of workoutHistory || []) {
      if (isMarker(h)) continue;
      for (const e of exsOf(h)) if (e?.name) { const r = get(e.name); r.sessions++; if (day(h.date) > r.last) r.last = day(h.date); }
    }
    return [...m.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
  }, [programs, workoutHistory]);

  // Names that only differ by case, spacing, punctuation or plurals.
  const dupes = useMemo(() => {
    const g = new Map();
    for (const r of rows) { const k = norm(r.name); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
    return [...g.values()].filter((x) => x.length > 1);
  }, [rows]);

  const cur = rows.find((r) => r.name === sel) || null;
  const target = to.trim();
  const merging = target && target !== sel && rows.some((r) => r.name === target);
  const lib = cur && cat ? resolve(cur.name, links, cat) : null;
  const shown = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));

  const apply = async () => {
    const from = sel, into = target;
    if (!into || into === from) return;
    try {
      setBusy('Updating programs…');
      const ren = (e) => ({ ...e, ...(e.name === from ? { name: into } : {}), ...(e.supersetWith === from ? { supersetWith: into } : {}) });
      for (const p of programs || []) {
        const ws = parseW(p);
        if (!ws.some((w) => (w.exercises || []).some((e) => e.name === from || e.supersetWith === from))) continue;
        await api.updateProgram(p.id, p.name, ws.map((w) => ({ ...w, exercises: (w.exercises || []).map(ren) })));
      }
      const hs = (workoutHistory || []).filter((h) => exsOf(h).some((e) => e.name === from || e.supersetWith === from));
      let k = 0;
      for (const h of hs) {
        setBusy(`Updating history ${++k} of ${hs.length}…`);
        await api.updateWorkoutHistory(h.id, { programName: h.program_name, workoutName: h.workout_name, date: day(h.date), duration: h.duration, notes: h.notes, exercises: exsOf(h).map(ren) });
      }
      setBusy('Updating links and rules…');
      if (from in links) {
        const next = { ...links }; if (!(into in next)) next[into] = next[from]; delete next[from];
        await api.saveExerciseLinks(next);
      }
      const raw = typeof settings?.aggressionSettings === 'string' ? JSON.parse(settings.aggressionSettings) : settings?.aggressionSettings || {};
      const exRules = raw.autoRules?.exercises || {};
      if (exRules[from]) {
        const nextEx = { ...exRules, [into]: { ...exRules[from], ...(exRules[into] || {}) } }; delete nextEx[from];
        await api.updateAggression({ ...raw, autoRules: { ...raw.autoRules, exercises: nextEx } });
      }
      await Promise.all([reloadPrograms(), reloadHistory(), reloadSettings()]);
      showToast(merging ? `Merged “${from}” into “${into}”` : `Renamed to “${into}”`, 'success');
      setSel(into); setTo('');
    } catch (e) { showToast('Stopped partway: ' + e.message + '. Run it again to finish.', 'error'); }
    setBusy('');
  };

  return (
    <div className="pb-16">
      <PageHead eyebrow="EXERCISES" title="Your exercise list">
        Every name used in your programs and history. Rename one, or merge two spellings of the same lift, and it changes everywhere at once.
      </PageHead>
      <NamesList id="desk-names-x" names={rows.map((r) => r.name)} />
      <div className="grid gap-6 px-8 pt-6" style={{ gridTemplateColumns: 'minmax(320px, 440px) minmax(0, 1fr)' }}>
        <div className="min-w-0 flex flex-col gap-3">
          {dupes.length > 0 && (
            <div className="rounded-[18px] p-3 flex flex-col gap-1.5" style={{ boxShadow: 'inset 0 0 0 1.5px var(--color-accent)' }}>
              <div className="text-accent px-1" style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em' }}>LIKELY DUPLICATES · {dupes.length}</div>
              {dupes.map((g) => (
                <div key={g[0].name} className="flex flex-wrap gap-1.5">
                  {g.map((r) => <button key={r.name} onClick={() => { setSel(r.name); setTo(g.find((x) => x !== r)?.name || ''); }}
                    className={`px-2.5 py-1 rounded-lg text-sm ${sel === r.name ? 'bg-bg-3' : 'bg-bg-2 hover:bg-bg-3'}`}>“{r.name}” <span className="text-text-tertiary text-xs">{r.sessions}×</span></button>)}
                </div>
              ))}
            </div>
          )}
          <TextIn value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an exercise" />
          <div className="rounded-[16px] border border-border bg-bg-1 overflow-y-auto max-h-[62vh]">
            {shown.map((r) => (
              <button key={r.name} onClick={() => { setSel(r.name); setTo(''); }}
                className={`w-full text-left px-3 py-2 border-t border-border first:border-t-0 flex items-baseline gap-2 ${r.name === sel ? 'bg-bg-3' : 'hover:bg-bg-2'}`}
                style={r.name === sel ? { boxShadow: 'inset 2px 0 0 var(--color-accent)' } : undefined}>
                <span className="flex-1 min-w-0 truncate" style={{ whiteSpace: 'pre' }}>{r.name}</span>
                <span className="text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>{r.workouts.size}w · {r.sessions}×</span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex flex-col gap-4">
          {!cur ? <Panel><p className="text-text-tertiary">Pick an exercise, or a likely duplicate, on the left.</p></Panel> : (<>
            <Panel title={<span style={{ whiteSpace: 'pre' }}>“{cur.name}”</span>} note={`${cur.sessions} sessions · last ${cur.last || 'never'}`}>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div><div className="text-text-tertiary mb-1" style={{ font: `500 10px ${MONO}`, letterSpacing: '.12em' }}>LIBRARY MATCH</div>
                  <div>{!cat ? 'Loading…' : lib ? <>{lib.n} <span className="text-text-tertiary text-xs">{lib.eq}</span></> : <span className="text-text-tertiary">No match</span>}</div></div>
                <div><div className="text-text-tertiary mb-1" style={{ font: `500 10px ${MONO}`, letterSpacing: '.12em' }}>USED IN {cur.workouts.size} WORKOUTS</div>
                  <div className="text-sm text-text-secondary max-h-32 overflow-y-auto">{[...cur.workouts].map((w) => <div key={w} className="truncate">{w}</div>)}{!cur.workouts.size && 'History only'}</div></div>
              </div>
            </Panel>
            <Panel title="Rename or merge" note="Applies to programs, supersets, history, library link and Auto weight rules">
              <div className="flex gap-2 flex-wrap items-center">
                <TextIn list="desk-names-x" value={to} onChange={(e) => setTo(e.target.value)} placeholder="New name, or an existing one to merge into" className="flex-1 min-w-[260px] py-2" />
                <Btn kind="primary" disabled={!target || target === sel || !!busy} onClick={apply} className="py-2">{merging ? 'Merge' : 'Rename'}</Btn>
              </div>
              <p className="mt-3 text-text-tertiary" style={{ font: `400 11px/1.6 ${MONO}` }}>
                {busy || (merging
                  ? `“${sel}” becomes “${target}” in ${cur.workouts.size} workouts and ${cur.sessions} sessions. Their history then counts as one exercise for charts and Auto weight.`
                  : target && target !== sel ? `“${sel}” becomes “${target}” in ${cur.workouts.size} workouts and ${cur.sessions} sessions.` : 'Type a new name. Pick an existing name to merge the two.')}
              </p>
            </Panel>
          </>)}
        </div>
      </div>
    </div>
  );
}
