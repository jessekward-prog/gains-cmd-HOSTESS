// Desk → Rules: every number Auto weight runs on, as "if this, then that" rows,
// for everything at once or for one exercise. A preview replays your real
// history under the edited rules next to the saved ones before you save.
import { useEffect, useMemo, useState } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import { aggressionOf } from '../lib/levelup';
import { DEFAULT_RULES, autoCapable, incrementFor, parseRange, replay } from '../lib/autofail';
import { isMarker } from '../lib/history';
import * as api from '../lib/api';

const MONO = 'var(--font-mono)';
const fmt = (n) => (n == null || n === '' ? '' : String(Math.round(n * 100) / 100));
const parseW = (p) => (typeof p.workouts === 'string' ? JSON.parse(p.workouts) : p.workouts) || [];
const exsOf = (h) => { try { return typeof h.exercises === 'string' ? JSON.parse(h.exercises) : h.exercises || []; } catch { return []; } };
// Saved rules without empty per-exercise entries, so "dirty" compares like for like.
const clean = (r) => {
  const { exercises = {}, ...g } = r || {};
  const ex = Object.fromEntries(Object.entries(exercises).filter(([, v]) => v && Object.keys(v).length));
  return Object.keys(ex).length ? { ...g, exercises: ex } : g;
};

function Num({ value, inherited, onChange, step = 1, min = 0, max = 99, width = 58, suffix }) {
  const custom = value !== undefined;
  return (
    <span className="inline-flex items-baseline gap-1 align-baseline">
      <input type="number" step={step} min={min} max={max} value={custom ? value : ''} placeholder={fmt(inherited)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className={`bg-bg-0 rounded-lg px-2 py-1 text-center font-bold outline-none focus:ring-2 focus:ring-accent/60 ${custom ? 'text-accent' : 'text-text-primary placeholder:text-text-primary'}`}
        style={{ width, boxShadow: `inset 0 0 0 1.5px ${custom ? 'var(--color-accent)' : 'var(--color-border-strong)'}`, fontVariantNumeric: 'tabular-nums' }} />
      {suffix && <span className="text-text-tertiary" style={{ font: `400 12px ${MONO}` }}>{suffix}</span>}
    </span>
  );
}

function Rule({ when, then, custom, onReset, muted = false }) {
  return (
    <div className={`grid gap-x-4 gap-y-2 items-baseline px-4 py-4 border-t border-border first:border-t-0 ${muted ? 'opacity-50' : ''}`} style={{ gridTemplateColumns: '44px minmax(0, 1fr)' }}>
      <span className="text-accent" style={{ font: `600 11px ${MONO}`, letterSpacing: '.14em' }}>IF</span>
      <span className="leading-[2.1] text-[15px]">{when}</span>
      <span className="text-text-tertiary" style={{ font: `600 11px ${MONO}`, letterSpacing: '.14em' }}>THEN</span>
      <span className="leading-[2.1] text-[15px] flex flex-wrap items-baseline gap-x-2">
        <span className="flex-1 min-w-0">{then}</span>
        {custom && <button onClick={onReset} className="text-text-tertiary hover:text-text-primary" style={{ font: `500 11px ${MONO}` }}>Reset ↺</button>}
      </span>
    </div>
  );
}

function Card({ title, note, children }) {
  return (
    <section className="rounded-[20px] bg-bg-1 border border-border overflow-hidden">
      <header className="px-4 pt-4 pb-3 flex items-baseline gap-3 flex-wrap">
        <h3 className="font-bold text-[16px]">{title}</h3>
        {note && <span className="text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{note}</span>}
      </header>
      <div className="border-t border-border">{children}</div>
    </section>
  );
}

export default function RulesPage() {
  const { settings, programs, workoutHistory, reloadSettings } = useWorkout();
  const { showToast } = useToast();
  const agg = aggressionOf(settings);
  const raw = useMemo(() => { const r = settings?.aggressionSettings; return typeof r === 'string' ? JSON.parse(r) : r || {}; }, [settings]);
  const saved = useMemo(() => clean(raw.autoRules), [raw]);
  const [draft, setDraft] = useState(saved);
  const [scope, setScope] = useState(null); // null = every exercise
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(clean(draft)) !== JSON.stringify(saved);
  useEffect(() => { if (!dirty) setDraft(saved); }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every exercise Auto weight can run, with how often you've logged it and its program range.
  const exercises = useMemo(() => {
    const m = new Map();
    for (const p of programs || []) for (const w of parseW(p)) for (const e of w.exercises || []) {
      if (autoCapable(e) && !m.has(e.name)) m.set(e.name, { name: e.name, range: e.repRange, sessions: 0 });
    }
    for (const h of workoutHistory || []) {
      if (isMarker(h)) continue;
      for (const e of exsOf(h)) if (m.has(e.name)) m.get(e.name).sessions++;
    }
    return [...m.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
  }, [programs, workoutHistory]);
  const [preview, setPreview] = useState(null);
  const previewName = preview || scope || exercises.find((e) => e.sessions > 0)?.name || exercises[0]?.name;

  // Reading and writing one rule in the current scope.
  const own = (k) => (scope ? draft.exercises?.[scope]?.[k] : draft[k]);
  const inherited = (k) => (scope ? (draft[k] ?? DEFAULT_RULES[k]) : DEFAULT_RULES[k]);
  const value = (k) => own(k) ?? inherited(k);
  const set = (k, v) => setDraft((d) => {
    const write = (o) => { const n = { ...o }; if (v === undefined) delete n[k]; else n[k] = v; return n; };
    if (!scope) return write(d);
    return { ...d, exercises: { ...(d.exercises || {}), [scope]: write(d.exercises?.[scope] || {}) } };
  });
  const reset = (...ks) => ks.forEach((k) => set(k, undefined));
  const isCustom = (...ks) => ks.some((k) => own(k) !== undefined);
  const N = (k, props = {}) => <Num value={own(k)} inherited={inherited(k)} onChange={(v) => set(k, v)} {...props} />;

  const scopeEx = exercises.find((e) => e.name === scope);
  const progRange = parseRange(scopeEx?.range);
  const ownRange = parseRange(own('range'));
  const setRange = (lo, hi) => set('range', lo == null && hi == null ? undefined : `${lo ?? progRange?.[0] ?? ''}-${hi ?? progRange?.[1] ?? ''}`);
  const customCount = (name) => Object.keys(draft.exercises?.[name] || {}).length;

  // Preview: the same history under the saved rules and under this draft.
  const pv = useMemo(() => {
    if (!previewName) return null;
    const a = replay(workoutHistory, previewName, { ...agg, autoRules: saved });
    const b = replay(workoutHistory, previewName, { ...agg, autoRules: clean(draft) });
    const rows = b.rows.map((r, i) => ({ ...r, was: a.rows[i]?.next }));
    return { rows: rows.slice(-18).reverse(), changed: rows.filter((r) => (r.next?.weight ?? null) !== (r.was?.weight ?? null)).length, total: rows.length, range: b.range, inc: b.inc };
  }, [previewName, workoutHistory, agg, saved, draft]);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateAggression({ ...raw, autoRules: clean(draft) });
      await reloadSettings();
      showToast('Rules saved. They apply from the next workout you start.', 'success');
    } catch (e) { showToast('Could not save rules: ' + e.message, 'error'); }
    setSaving(false);
  };

  const list = exercises.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()));
  const nextCell = (n) => (n ? <>{fmt(n.weight)}<span className={n.d > 0 ? 'text-accent' : n.d < 0 ? 'text-[#6aa2ff]' : 'text-text-tertiary'} style={{ font: `500 11px ${MONO}`, marginLeft: 6 }}>{n.d > 0 ? `▲${fmt(n.d)}` : n.d < 0 ? `▼${fmt(-n.d)}` : 'hold'}</span></> : <span className="text-text-tertiary">—</span>);

  return (
    <div className="pb-28">
      <header className="px-8 pt-8 pb-6 border-b border-border">
        <div className="text-accent" style={{ font: `600 11px ${MONO}`, letterSpacing: '.18em' }}>RULES · AUTO WEIGHT</div>
        <h1 className="mt-2 font-extrabold" style={{ fontSize: 32, letterSpacing: '-0.025em', lineHeight: 1.1 }}>If this, then that</h1>
        <p className="mt-2 text-text-secondary max-w-[72ch]">These rules decide each set's weight when Auto weight is on. Set them for everything, then give any exercise its own. Changes apply from the next workout you start, and the preview on the right shows what they would have done to your real sessions.</p>
      </header>

      <div className="grid gap-6 px-8 pt-6 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)_minmax(380px,440px)]">
        {/* Scope: everything, or one exercise */}
        <aside className="min-w-0">
          <button onClick={() => { setScope(null); setPreview(null); }}
            className={`w-full text-left px-3 py-3 rounded-xl mb-3 ${scope === null ? 'bg-bg-3' : 'bg-bg-1 hover:bg-bg-2'}`}
            style={scope === null ? { boxShadow: 'inset 0 0 0 1.5px var(--color-accent)' } : undefined}>
            <span className="block font-bold">Every exercise</span>
            <span className="block text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>{Object.keys(clean(draft)).filter((k) => k !== 'exercises').length} custom rules</span>
          </button>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an exercise"
            className="w-full bg-bg-1 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent/60 mb-2" />
          <div className="flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto pr-1">
            {list.map((e) => (
              <button key={e.name} onClick={() => { setScope(e.name); setPreview(null); }}
                className={`text-left px-3 py-2 rounded-lg flex items-baseline gap-2 ${scope === e.name ? 'bg-bg-3' : 'hover:bg-bg-2'}`}
                style={scope === e.name ? { boxShadow: 'inset 2px 0 0 var(--color-accent)' } : undefined}>
                <span className="flex-1 min-w-0 truncate text-[14px]">{e.name}</span>
                {customCount(e.name) > 0 && <span className="text-accent" style={{ font: `500 10px ${MONO}` }}>{customCount(e.name)} CUSTOM</span>}
                <span className="text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>{e.sessions}×</span>
              </button>
            ))}
            {!list.length && <p className="px-3 py-2 text-text-tertiary text-sm">No exercise matches “{query}”.</p>}
          </div>
        </aside>

        {/* The rules */}
        <div className="min-w-0 flex flex-col gap-5">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="font-extrabold text-[22px]" style={{ letterSpacing: '-0.02em' }}>{scope || 'Every exercise'}</h2>
            <span className="text-text-tertiary" style={{ font: `400 12px ${MONO}` }}>
              {scope ? 'Blank boxes use the every-exercise rule. Red ones are this exercise\'s own.' : 'Blank boxes use the built-in default. Red ones are yours.'}
            </span>
          </div>

          {scope && (
            <Card title="Range and step" note="Only this exercise">
              <Rule
                when={<>Aiming for <Num value={ownRange?.[0]} inherited={progRange?.[0]} onChange={(v) => setRange(v, ownRange?.[1])} /> to <Num value={ownRange?.[1]} inherited={progRange?.[1]} onChange={(v) => setRange(ownRange?.[0], v)} /> reps</>}
                then={<>Each weight step is <Num value={own('step')} inherited={incrementFor(scope, agg)} onChange={(v) => set('step', v)} step={0.25} width={70} suffix="kg" /></>}
                custom={isCustom('range', 'step')} onReset={() => reset('range', 'step')} />
              <p className="px-4 pb-4 text-text-tertiary" style={{ font: `400 11px/1.6 ${MONO}` }}>The workout says {scopeEx?.range || '—'} reps. The step comes from Training ({fmt(incrementFor(scope, agg))} kg) unless you set one here.</p>
            </Card>
          )}

          <Card title="Between sessions" note="Decides the next workout's weight for each set">
            <Rule when={<>A set ends {N('bigOver')} or more reps over the top of the range</>}
              then={<>Go heavier: 1 step for every {N('repsPerStep', { step: 0.5, min: 0.5 })} reps over, at most {N('maxUp', { min: 1, max: 10 })} steps</>}
              custom={isCustom('bigOver', 'repsPerStep', 'maxUp')} onReset={() => reset('bigOver', 'repsPerStep', 'maxUp')} />
            <Rule when={<>A set lands just over the top {N('justOverRuns', { min: 1, max: 6 })} sessions running, at the same weight</>}
              then={<>Go heavier by {N('justOverSteps', { min: 1, max: 5 })} step{value('justOverSteps') === 1 ? '' : 's'}</>}
              custom={isCustom('justOverRuns', 'justOverSteps')} onReset={() => reset('justOverRuns', 'justOverSteps')} />
            <Rule when={<>A set lands inside the range</>} then={<>Keep the weight</>} />
            <Rule when={<>A set ends under the bottom of the range</>}
              then={<>Go lighter: 1 step for every {fmt(value('repsPerStep'))} reps under, at most {N('maxDown', { min: 1, max: 10 })} steps</>}
              custom={isCustom('maxDown')} onReset={() => reset('maxDown')} />
          </Card>

          <Card title="Within a session" note="Moves the next set straight away, mid-workout">
            <Rule muted={!value('nextUpOver')}
              when={<label className="inline-flex items-baseline gap-2 cursor-pointer">
                <input type="checkbox" checked={!!value('nextUpOver')} onChange={(e) => set('nextUpOver', e.target.checked ? 4 : 0)} className="w-4 h-4 translate-y-0.5" style={{ accentColor: 'var(--color-accent)' }} />
                <span>A set ends {N('nextUpOver', { min: 1 })} or more reps over the top</span></label>}
              then={<>Raise the next set now by {N('nextUpSteps', { min: 1, max: 5 })} step{value('nextUpSteps') === 1 ? '' : 's'}</>}
              custom={isCustom('nextUpOver', 'nextUpSteps')} onReset={() => reset('nextUpOver', 'nextUpSteps')} />
            <Rule muted={!value('nextDownUnder')}
              when={<label className="inline-flex items-baseline gap-2 cursor-pointer">
                <input type="checkbox" checked={!!value('nextDownUnder')} onChange={(e) => set('nextDownUnder', e.target.checked ? 3 : 0)} className="w-4 h-4 translate-y-0.5" style={{ accentColor: 'var(--color-accent)' }} />
                <span>A set ends {N('nextDownUnder', { min: 1 })} or more reps under the bottom</span></label>}
              then={<>Lower the next set now by {N('nextDownSteps', { min: 1, max: 5 })} step{value('nextDownSteps') === 1 ? '' : 's'}</>}
              custom={isCustom('nextDownUnder', 'nextDownSteps')} onReset={() => reset('nextDownUnder', 'nextDownSteps')} />
          </Card>

          <Card title="Too-fast alert" note="Saved now · takes effect when the alert ships">
            <Rule when={<>The weight is lowered faster than {N('lowerBig', { step: 0.1, min: 0.3, max: 5, suffix: 's' })} on a big lift, or {N('lowerSmall', { step: 0.1, min: 0.3, max: 5, suffix: 's' })} on a small one</>}
              then={<>Buzz and say “slow it down”, and count that rep as {N('fastRepCounts', { step: 0.25, min: 0, max: 1 })} of a rep for Auto weight</>}
              custom={isCustom('lowerBig', 'lowerSmall', 'fastRepCounts')} onReset={() => reset('lowerBig', 'lowerSmall', 'fastRepCounts')} />
            <Rule when={<>A late rep in a set is suddenly faster than your normal pace</>}
              then={<>Treat it as a swing, with sensitivity{' '}
                <select value={own('swing') ?? ''} onChange={(e) => set('swing', e.target.value || undefined)}
                  className="bg-bg-0 rounded-lg px-2 py-1 font-bold outline-none" style={{ boxShadow: `inset 0 0 0 1.5px ${own('swing') ? 'var(--color-accent)' : 'var(--color-border-strong)'}`, color: own('swing') ? 'var(--color-accent)' : undefined }}>
                  <option value="">{inherited('swing')} (inherited)</option><option value="low">low</option><option value="normal">normal</option><option value="high">high</option>
                </select></>}
              custom={isCustom('swing')} onReset={() => reset('swing')} />
          </Card>
        </div>

        {/* Preview on real history */}
        <aside className="min-w-0 lg:col-start-2 2xl:col-start-auto">
          <div className="rounded-[20px] bg-bg-1 border border-border overflow-hidden 2xl:sticky 2xl:top-6">
            <header className="px-4 pt-4 pb-3 border-b border-border">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-bold text-[16px]">Preview on your history</h3>
                {pv && <span className={dirty && pv.changed ? 'text-accent' : 'text-text-tertiary'} style={{ font: `500 11px ${MONO}` }}>{pv.changed} of {pv.total} changed</span>}
              </div>
              <select value={previewName || ''} onChange={(e) => setPreview(e.target.value)} className="mt-2 w-full bg-bg-0 border border-border rounded-lg px-2 py-1.5 text-sm outline-none">
                {exercises.filter((e) => e.sessions > 0).map((e) => <option key={e.name} value={e.name}>{e.name} · {e.sessions} sessions</option>)}
              </select>
              {pv?.range && <p className="mt-2 text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>Range {pv.range.join('–')} · step {fmt(pv.inc)} kg · newest first</p>}
            </header>
            {pv && pv.rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <thead><tr className="text-text-tertiary" style={{ font: `500 10px ${MONO}`, letterSpacing: '.08em' }}>
                    <th className="text-left px-4 py-2 font-medium">SESSION</th><th className="text-right px-2 py-2 font-medium">DID</th>
                    <th className="text-right px-2 py-2 font-medium">SAVED → NEXT</th><th className="text-right px-4 py-2 font-medium">EDITED → NEXT</th>
                  </tr></thead>
                  <tbody>
                    {pv.rows.map((r, i) => {
                      const diff = (r.next?.weight ?? null) !== (r.was?.weight ?? null);
                      return (
                        <tr key={i} className="border-t border-border" style={diff ? { background: 'var(--color-accent-muted)' } : undefined} title={r.next?.why || ''}>
                          <td className="px-4 py-2 whitespace-nowrap text-text-secondary">{String(r.date).slice(5, 10)} <span className="text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>S{r.set + 1}</span></td>
                          <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(r.w)} × {r.reps}</td>
                          <td className="px-2 py-2 text-right whitespace-nowrap text-text-secondary">{nextCell(r.was)}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap font-bold">{nextCell(r.next)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-6 text-text-tertiary text-sm">No counted sets for this exercise yet. Once the sensor (or you) logs reps on it, every session shows here with the weight the rules would pick next.</p>
            )}
          </div>
        </aside>
      </div>

      {/* Save bar */}
      <div className="fixed bottom-0 right-0 z-20 border-t border-border bg-bg-1/95 backdrop-blur px-8 py-3 flex items-center gap-3"
        style={{ left: 220, paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
        <span className={`flex-1 ${dirty ? 'text-text-primary' : 'text-text-tertiary'}`} style={{ font: `500 12px ${MONO}` }}>
          {dirty ? 'Unsaved rule changes' : 'Rules saved · they apply from the next workout you start'}
        </span>
        <button disabled={!dirty || saving} onClick={() => setDraft(saved)} className="px-4 py-2 rounded-xl border border-border text-sm disabled:opacity-40">Discard</button>
        <button disabled={!dirty || saving} onClick={save} className="px-5 py-2 rounded-xl bg-accent text-sm font-bold disabled:opacity-40" style={{ color: 'var(--color-on-accent)' }}>{saving ? 'Saving…' : 'Save rules'}</button>
      </div>
    </div>
  );
}
