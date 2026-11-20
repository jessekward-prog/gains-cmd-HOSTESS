// Desk → History: every logged session, searchable, and fully editable: date,
// names, notes, and each set's weight, reps and done state. Fixing a miscounted
// set here also fixes what Auto weight learns from it.
import { useEffect, useMemo, useState } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import { isMarker } from '../lib/history';
import * as api from '../lib/api';
import { MONO, PageHead, Panel, Btn, TextIn, NumIn, Sel, ConfirmBtn, SaveBar, exsOf, day, clone, fmt, allNames, NamesList } from './ui';

const SET_TYPES = [['', 'Normal'], ['drop', 'Drop'], ['variable', 'Variable'], ['bfr', 'BFR'], ['interval', 'Interval'], ['timed', 'Timed'], ['cardio', 'Cardio']];
const volumeOf = (exs) => exs.reduce((v, e) => v + (e.sets || []).reduce((a, s) => a + (s.completed && +s.weight > 0 && +s.reps > 0 ? +s.weight * +s.reps : 0), 0), 0);
const setsOf = (exs) => exs.reduce((n, e) => n + (e.sets || []).filter((s) => s.completed).length, 0);

export default function DeskHistory() {
  const { workoutHistory, programs, reloadHistory } = useWorkout();
  const { showToast } = useToast();
  const [q, setQ] = useState('');
  const [prog, setProg] = useState('');
  const [id, setId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const names = useMemo(() => allNames(programs, workoutHistory), [programs, workoutHistory]);

  const sessions = useMemo(() => (workoutHistory || []).filter((h) => !isMarker(h)).map((h) => {
    const exs = exsOf(h);
    return { h, exs, vol: volumeOf(exs), sets: setsOf(exs), text: `${h.workout_name} ${h.program_name} ${exs.map((e) => e.name).join(' ')}`.toLowerCase() };
  }), [workoutHistory]);
  const progNames = useMemo(() => [...new Set(sessions.map((s) => s.h.program_name).filter(Boolean))].sort(), [sessions]);
  const shown = sessions.filter((s) => (!prog || s.h.program_name === prog) && (!q.trim() || s.text.includes(q.trim().toLowerCase())));

  const entry = sessions.find((s) => s.h.id === id)?.h || null;
  const savedDraft = useMemo(() => (entry ? { program_name: entry.program_name || '', workout_name: entry.workout_name || '', date: day(entry.date), duration: entry.duration ?? '', notes: entry.notes || '', exercises: exsOf(entry) } : null), [entry]);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(savedDraft);
  useEffect(() => { setDraft(clone(savedDraft)); }, [savedDraft]);
  useEffect(() => { if (id == null && shown[0]) setId(shown[0].h.id); }, [id, shown]);

  const setEx = (i, fn) => setDraft((d) => ({ ...d, exercises: d.exercises.map((e, k) => (k === i ? fn(e) : e)) }));
  const setSet = (i, j, patch) => setEx(i, (e) => ({ ...e, sets: e.sets.map((s, k) => (k === j ? { ...s, ...patch } : s)) }));

  const save = async () => {
    setSaving(true);
    try {
      await api.updateWorkoutHistory(entry.id, { programName: draft.program_name, workoutName: draft.workout_name, date: draft.date, duration: draft.duration === '' ? null : Number(draft.duration), notes: draft.notes, exercises: draft.exercises });
      await reloadHistory();
      showToast('Session saved', 'success');
    } catch (e) { showToast('Could not save: ' + e.message, 'error'); }
    setSaving(false);
  };
  const remove = async () => {
    try { await api.deleteWorkoutHistory(entry.id); setId(null); await reloadHistory(); showToast('Session deleted', 'success'); }
    catch (e) { showToast('Could not delete: ' + e.message, 'error'); }
  };

  return (
    <div className="pb-28">
      <PageHead eyebrow="HISTORY" title="Every session">
        Search, check and correct what you logged. Fixing a miscounted set here also fixes what Auto weight learns from it.
      </PageHead>
      <NamesList id="desk-names-h" names={names} />
      <div className="grid gap-6 px-8 pt-6" style={{ gridTemplateColumns: 'minmax(360px, 460px) minmax(0, 1fr)' }}>
        <div className="min-w-0 flex flex-col gap-2">
          <div className="flex gap-2">
            <TextIn value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workout or exercise" className="flex-1" />
            <Sel value={prog} onChange={(e) => setProg(e.target.value)} className="max-w-[170px]"><option value="">All programs</option>{progNames.map((p) => <option key={p} value={p}>{p}</option>)}</Sel>
          </div>
          <p className="px-1 text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>{shown.length} of {sessions.length} sessions</p>
          <div className="rounded-[16px] border border-border bg-bg-1 overflow-y-auto max-h-[70vh]">
            <table className="w-full text-[13px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead className="sticky top-0 bg-bg-1"><tr className="text-text-tertiary text-left" style={{ font: `500 10px ${MONO}`, letterSpacing: '.08em' }}>
                <th className="px-3 py-2 font-medium">DATE</th><th className="px-2 py-2 font-medium">WORKOUT</th><th className="px-2 py-2 font-medium text-right">SETS</th><th className="px-3 py-2 font-medium text-right">VOLUME</th>
              </tr></thead>
              <tbody>
                {shown.map(({ h, sets, vol }) => (
                  <tr key={h.id} onClick={() => !dirty && setId(h.id)} className={`border-t border-border ${dirty && h.id !== id ? 'opacity-40' : 'cursor-pointer hover:bg-bg-2'} ${h.id === id ? 'bg-bg-3' : ''}`}
                    style={h.id === id ? { boxShadow: 'inset 2px 0 0 var(--color-accent)' } : undefined}>
                    <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{day(h.date)}</td>
                    <td className="px-2 py-2 max-w-[200px]"><span className="block truncate">{h.workout_name}</span><span className="block truncate text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>{h.program_name}</span></td>
                    <td className="px-2 py-2 text-right">{sets}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{vol ? `${Math.round(vol).toLocaleString()} kg` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length && <p className="p-4 text-text-tertiary text-sm">No session matches.</p>}
          </div>
          {dirty && <p className="px-1 text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>Save or discard this session's changes to open another.</p>}
        </div>

        <div className="min-w-0 flex flex-col gap-4">
          {!draft ? <Panel><p className="text-text-tertiary">Pick a session on the left.</p></Panel> : (<>
            <Panel title="Session" right={<ConfirmBtn label="Delete session" confirm="Tap again: delete session" onConfirm={remove} />}>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                <label className="flex flex-col gap-1 text-text-tertiary text-xs">Date<input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} className="bg-bg-0 rounded-lg px-2 py-1.5 text-text-primary text-sm" style={{ boxShadow: 'inset 0 0 0 1px var(--color-border-strong)' }} /></label>
                <label className="flex flex-col gap-1 text-text-tertiary text-xs">Workout<TextIn value={draft.workout_name} onChange={(e) => setDraft((d) => ({ ...d, workout_name: e.target.value }))} className="text-sm text-text-primary" /></label>
                <label className="flex flex-col gap-1 text-text-tertiary text-xs">Program<TextIn value={draft.program_name} onChange={(e) => setDraft((d) => ({ ...d, program_name: e.target.value }))} className="text-sm text-text-primary" /></label>
                <label className="flex flex-col gap-1 text-text-tertiary text-xs">Minutes<NumIn value={draft.duration === '' ? undefined : draft.duration} min={0} onChange={(v) => setDraft((d) => ({ ...d, duration: v ?? '' }))} className="text-sm text-text-primary" /></label>
              </div>
              <label className="flex flex-col gap-1 text-text-tertiary text-xs mt-3">Notes
                <textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} rows={2} className="bg-bg-0 rounded-lg px-2 py-1.5 text-text-primary text-sm outline-none resize-y" style={{ boxShadow: 'inset 0 0 0 1px var(--color-border-strong)' }} /></label>
            </Panel>

            {draft.exercises.map((e, i) => (
              <Panel key={i} pad={false}
                title={<TextIn list="desk-names-h" value={e.name} onChange={(ev) => setEx(i, (x) => ({ ...x, name: ev.target.value }))} className="font-bold text-[15px] w-[min(420px,100%)]" />}
                note={e.type === 'cardio' ? 'cardio' : `${e.targetReps || e.repRange || ''} reps${e.boss ? ' · weekly boss' : ''}`}
                right={<div className="flex gap-1.5">
                  {e.type !== 'cardio' && <Btn onClick={() => setEx(i, (x) => ({ ...x, sets: [...x.sets, { ...(x.sets.at(-1) || { weight: '', reps: '' }), completed: true }] }))}>+ Set</Btn>}
                  <ConfirmBtn label="Remove" confirm="Tap again" onConfirm={() => setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, k) => k !== i) }))} />
                </div>}>
                {e.type === 'cardio' ? (
                  <div className="p-4 flex items-center gap-3 text-sm text-text-secondary">
                    Time <NumIn value={Math.round((e.sets?.[0]?.elapsedSec || 0) / 60)} min={0} onChange={(v) => setSet(i, 0, { elapsedSec: (v ?? 0) * 60 })} className="w-20" /> min
                    {e.sets?.[0]?.cardioStats?.distance && <span className="text-text-tertiary">· {e.sets[0].cardioStats.distance} km</span>}
                  </div>
                ) : (
                  <table className="w-full text-[14px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <thead><tr className="text-text-tertiary text-left" style={{ font: `500 10px ${MONO}`, letterSpacing: '.08em' }}>
                      <th className="px-4 py-2 font-medium w-12">SET</th><th className="px-2 py-2 font-medium">TYPE</th><th className="px-2 py-2 font-medium">KG</th><th className="px-2 py-2 font-medium">REPS</th><th className="px-2 py-2 font-medium">DONE</th><th className="px-4 py-2" />
                    </tr></thead>
                    <tbody>
                      {(e.sets || []).map((s, j) => (
                        <tr key={j} className="border-t border-border">
                          <td className="px-4 py-1.5 text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{j + 1}</td>
                          <td className="px-2 py-1.5"><Sel value={s.type || ''} onChange={(ev) => setSet(i, j, { type: ev.target.value || undefined })}>{SET_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></td>
                          <td className="px-2 py-1.5"><NumIn value={s.weight === '' || s.weight == null ? undefined : Number(s.weight)} step={0.5} min={0} onChange={(v) => setSet(i, j, { weight: v == null ? '' : String(v) })} className="w-20" /></td>
                          <td className="px-2 py-1.5"><TextIn value={s.reps ?? ''} onChange={(ev) => setSet(i, j, { reps: ev.target.value })} className="w-20 text-right" placeholder="reps" /></td>
                          <td className="px-2 py-1.5"><input type="checkbox" checked={!!s.completed} onChange={(ev) => setSet(i, j, { completed: ev.target.checked })} className="w-4 h-4" style={{ accentColor: 'var(--color-accent)' }} /></td>
                          <td className="px-4 py-1.5 text-right"><Btn kind="ghost" onClick={() => setEx(i, (x) => ({ ...x, sets: x.sets.filter((_, k) => k !== j) }))} title="Remove set">✕</Btn></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
            ))}
            <p className="text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>Volume {fmt(Math.round(volumeOf(draft.exercises)))} kg · {setsOf(draft.exercises)} sets done</p>
          </>)}
        </div>
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => setDraft(clone(savedDraft))} label="Save session" idle="Session saved" />
    </div>
  );
}
