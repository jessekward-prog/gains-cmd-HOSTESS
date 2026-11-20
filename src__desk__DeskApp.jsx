// The desktop planner: same account and data as the phone app, built
// for a big screen and for planning rather than lifting.
import { useState } from 'react';
import { toggleDeskLayout } from '../lib/fit';
import { MONO, SIDEBAR_W } from './ui';
import RulesPage from './RulesPage';
import DeskPrograms from './Programs';
import DeskHistory from './History';
import DeskData from './Data';
import DeskExercises from './Exercises';

const TAB_KEY = 'gains-desk-tab';
const SECTIONS = [
  ['programs', 'Programs'],
  ['data', 'Data'],
  ['history', 'History'],
  ['rules', 'Rules'],
  ['exercises', 'Exercises'],
];

function NavIcon({ id, className = '' }) {
  const common = { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', className: `shrink-0 ${className}`, 'aria-hidden': true };
  if (id === 'programs') return <svg {...common}><rect x="2.25" y="2.5" width="4.75" height="4.75" rx="1" /><rect x="9" y="2.5" width="4.75" height="4.75" rx="1" /><rect x="2.25" y="9.25" width="4.75" height="4.75" rx="1" /><rect x="9" y="9.25" width="4.75" height="4.75" rx="1" /></svg>;
  if (id === 'data') return <svg {...common}><path d="M2.25 12.75h11.5" /><path d="M3.5 10.25 6.5 7l2.5 2 3.5-4.75" /><path d="M10.5 4.25h2v2" /></svg>;
  if (id === 'history') return <svg {...common}><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.25l2.25 1.25" /></svg>;
  if (id === 'rules') return <svg {...common}><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /><circle cx="5.5" cy="4.5" r="1.25" fill="var(--color-bg-1)" /><circle cx="10.5" cy="8" r="1.25" fill="var(--color-bg-1)" /><circle cx="6.5" cy="11.5" r="1.25" fill="var(--color-bg-1)" /></svg>;
  return <svg {...common}><path d="M4.5 5.5v5M11.5 5.5v5M2.5 6.75v2.5M13.5 6.75v2.5M4.5 8h7" /></svg>;
}

export default function DeskApp() {
  const [section, setSection] = useState(() => {
    try {
      const saved = sessionStorage.getItem(TAB_KEY);
      if (SECTIONS.some(([id]) => id === saved)) return saved;
    } catch {}
    return 'programs';
  });

  const pick = (id) => {
    setSection(id);
    try { sessionStorage.setItem(TAB_KEY, id); } catch {}
  };

  return (
    <div className="min-h-dvh bg-bg-0 text-text-primary grid" style={{ gridTemplateColumns: `${SIDEBAR_W}px minmax(0, 1fr)`, position: 'relative', zIndex: 1 }}>
      <aside className="border-r border-border bg-bg-1 flex flex-col sticky top-0 h-dvh">
        <div className="px-4 pt-5 pb-4">
          <div className="text-accent" style={{ font: `600 10px ${MONO}`, letterSpacing: '.18em' }}>GAINS_CMD</div>
          <div className="mt-1 font-extrabold tracking-tight text-[18px]">Planner</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2.5">
          {SECTIONS.map(([id, label]) => {
            const on = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => pick(id)}
                className={`text-left px-3 py-2 rounded-lg flex items-center gap-2.5 text-[13px] cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${on ? 'bg-bg-3 text-text-primary font-semibold' : 'text-text-secondary font-medium hover:bg-bg-2 hover:text-text-primary'}`}
                style={on ? { boxShadow: 'inset 2px 0 0 var(--color-accent)' } : undefined}
              >
                <NavIcon id={id} className={on ? 'text-accent' : 'text-text-tertiary'} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-auto px-4 pb-5 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => toggleDeskLayout(false)}
            className="text-text-secondary hover:text-text-primary cursor-pointer flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded"
            style={{ font: `500 12px ${MONO}` }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 3.5 5.5 8 10 12.5" />
            </svg>
            <span>Phone layout</span>
          </button>
          <p className="mt-2 text-text-tertiary" style={{ font: `400 10px/1.45 ${MONO}` }}>Planning view · swap anytime in Settings.</p>
        </div>
      </aside>
      <main className="min-w-0">
        {section === 'programs' && <DeskPrograms />}
        {section === 'data' && <DeskData />}
        {section === 'history' && <DeskHistory />}
        {section === 'rules' && <RulesPage />}
        {section === 'exercises' && <DeskExercises />}
      </main>
    </div>
  );
}
