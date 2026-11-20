// The desktop planner: same account and data as the phone app, built
// for a big screen and for planning rather than lifting.
import { useState } from 'react';
import { toggleDeskLayout } from '../lib/fit';
import RulesPage from './RulesPage';
import DeskPrograms from './Programs';
import DeskHistory from './History';
import DeskData from './Data';
import DeskExercises from './Exercises';

const MONO = 'var(--font-mono)';
const SECTIONS = [
  ['rules', 'Rules', 'If this, then that'],
  ['programs', 'Programs', 'Workouts and exercises'],
  ['history', 'History', 'Every session, editable'],
  ['data', 'Data', 'Progress and best sets'],
  ['exercises', 'Exercises', 'Rename and merge'],
];

export default function DeskApp() {
  const [section, setSection] = useState('rules');
  return (
    <div className="min-h-dvh bg-bg-0 text-text-primary grid" style={{ gridTemplateColumns: '220px minmax(0, 1fr)', position: 'relative', zIndex: 1 }}>
      <aside className="border-r border-border bg-bg-1 flex flex-col sticky top-0 h-dvh">
        <div className="px-5 pt-6 pb-5">
          <div className="text-accent" style={{ font: `600 11px ${MONO}`, letterSpacing: '.18em' }}>GAINS_CMD</div>
          <div className="mt-1 font-extrabold" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>Planner</div>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {SECTIONS.map(([id, label, sub]) => {
            const live = true;
            const on = section === id;
            return (
              <button key={id} disabled={!live} onClick={() => setSection(id)}
                className={`text-left px-3 py-2.5 rounded-xl transition-colors ${on ? 'bg-bg-3' : live ? 'hover:bg-bg-2' : 'opacity-45 cursor-default'}`}
                style={on ? { boxShadow: 'inset 2px 0 0 var(--color-accent)' } : undefined}>
                <span className="block font-bold text-[15px]">{label}</span>
                <span className="block text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>{sub}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-auto px-5 pb-6 pt-4">
          <button type="button" onClick={() => toggleDeskLayout(false)} className="text-text-secondary hover:text-text-primary cursor-pointer" style={{ font: `500 12px ${MONO}` }}>‹ Phone layout</button>
          <p className="mt-2 text-text-tertiary" style={{ font: `400 10px/1.5 ${MONO}` }}>For planning. Lift with the phone app. Switch back anytime from Settings.</p>
        </div>
      </aside>
      <main className="min-w-0">
        {section === 'rules' && <RulesPage />}
        {section === 'programs' && <DeskPrograms />}
        {section === 'history' && <DeskHistory />}
        {section === 'data' && <DeskData />}
        {section === 'exercises' && <DeskExercises />}
      </main>
    </div>
  );
}
