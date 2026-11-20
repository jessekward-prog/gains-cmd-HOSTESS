// Shared parts for the desktop planner pages.
import { useState } from 'react';

export const MONO = 'var(--font-mono)';
export const fmt = (n) => (n == null || n === '' || Number.isNaN(+n) ? '' : String(Math.round(+n * 100) / 100));
export const parseW = (p) => { try { return (typeof p?.workouts === 'string' ? JSON.parse(p.workouts) : p?.workouts) || []; } catch { return []; } };
export const exsOf = (h) => { try { return (typeof h?.exercises === 'string' ? JSON.parse(h.exercises) : h?.exercises) || []; } catch { return []; } };
export const day = (d) => String(d || '').slice(0, 10);
export const clone = (x) => JSON.parse(JSON.stringify(x ?? null));

export function PageHead({ eyebrow, title, children, right }) {
  return (
    <header className="px-8 pt-8 pb-6 border-b border-border flex items-end gap-6 flex-wrap">
      <div className="flex-1 min-w-[280px]">
        <div className="text-accent" style={{ font: `600 11px ${MONO}`, letterSpacing: '.18em' }}>{eyebrow}</div>
        <h1 className="mt-2 font-extrabold" style={{ fontSize: 32, letterSpacing: '-0.025em', lineHeight: 1.1 }}>{title}</h1>
        {children && <p className="mt-2 text-text-secondary max-w-[72ch]">{children}</p>}
      </div>
      {right}
    </header>
  );
}

export function Panel({ title, note, right, children, className = '', pad = true }) {
  return (
    <section className={`rounded-[20px] bg-bg-1 border border-border min-w-0 ${className}`}>
      {(title || right) && (
        <header className="px-4 pt-4 pb-3 flex items-baseline gap-3 flex-wrap border-b border-border">
          {title && <h3 className="font-bold text-[16px]">{title}</h3>}
          {note && <span className="text-text-tertiary" style={{ font: `400 11px ${MONO}` }}>{note}</span>}
          <span className="flex-1" />
          {right}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Btn({ kind = 'plain', className = '', ...p }) {
  const k = {
    plain: 'border border-border hover:bg-bg-2',
    primary: 'bg-accent font-bold hover:bg-accent-hover',
    danger: 'border border-error/40 text-error hover:bg-error/10',
    ghost: 'hover:bg-bg-2 text-text-secondary',
  }[kind];
  return <button type="button" {...p} className={`px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 disabled:pointer-events-none transition-colors ${k} ${className}`}
    style={kind === 'primary' ? { color: 'var(--color-on-accent)', ...p.style } : p.style} />;
}

const field = 'bg-bg-0 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-accent/60 min-w-0';
const ring = { boxShadow: 'inset 0 0 0 1px var(--color-border-strong)' };
export const TextIn = ({ className = '', ...p }) => <input type="text" {...p} className={`${field} ${className}`} style={{ ...ring, ...p.style }} />;
export const NumIn = ({ className = '', value, onChange, ...p }) => (
  <input type="number" {...p} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    className={`${field} text-right ${className}`} style={{ ...ring, fontVariantNumeric: 'tabular-nums', ...p.style }} />
);
export const Sel = ({ className = '', children, ...p }) => <select {...p} className={`${field} ${className}`} style={{ ...ring, ...p.style }}>{children}</select>;

/** Two-tap delete: first tap arms it, second confirms. */
export function ConfirmBtn({ label = 'Delete', confirm = 'Tap again to delete', onConfirm, className = '' }) {
  const [armed, setArmed] = useState(false);
  return <Btn kind="danger" className={className} onBlur={() => setArmed(false)}
    onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>{armed ? confirm : label}</Btn>;
}

export function SaveBar({ dirty, saving, onSave, onDiscard, idle = 'All changes saved', label = 'Save' }) {
  return (
    <div className="fixed bottom-0 right-0 z-20 border-t border-border bg-bg-1/95 backdrop-blur px-8 py-3 flex items-center gap-3"
      style={{ left: 220, paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
      <span className={`flex-1 ${dirty ? 'text-text-primary' : 'text-text-tertiary'}`} style={{ font: `500 12px ${MONO}` }}>{dirty ? 'Unsaved changes' : idle}</span>
      <Btn disabled={!dirty || saving} onClick={onDiscard}>Discard</Btn>
      <Btn kind="primary" disabled={!dirty || saving} onClick={onSave} className="px-5">{saving ? 'Saving…' : label}</Btn>
    </div>
  );
}

/** Every exercise name in programs and history, for autocomplete. */
export function allNames(programs, history) {
  const s = new Set();
  for (const p of programs || []) for (const w of parseW(p)) for (const e of w.exercises || []) e?.name && s.add(e.name);
  for (const h of history || []) for (const e of exsOf(h)) e?.name && s.add(e.name);
  return [...s].sort((a, b) => a.localeCompare(b));
}
export const NamesList = ({ id, names }) => <datalist id={id}>{names.map((n) => <option key={n} value={n} />)}</datalist>;
