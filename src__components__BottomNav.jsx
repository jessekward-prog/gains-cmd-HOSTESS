import { useState, useCallback, useEffect } from 'react';
import NavIcon from './NavIcon';
import useBackHandler from '../hooks/useBackHandler';

const tabs = [
  { id: 'programs', label: 'Programs' },
  { id: 'workout', label: 'Workout' },
  { id: 'history', label: 'History' },
  { id: 'recommendations', label: 'Progress' },
  { id: 'aggression', label: 'Training' },
  { id: 'coach', label: 'Coach' },
  { id: 'settings', label: 'Settings' },
];

const MONO = 'var(--font-mono)';
const BAR = 60; // px above the safe area; App.jsx reserves the same height

export default function BottomNav({ activeTab, onChange, hasActiveWorkout, onExpandedChange }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { onExpandedChange?.(expanded); }, [expanded, onExpandedChange]);

  // Android back gesture closes the expanded sheet before navigating.
  useBackHandler(expanded, () => setExpanded(false));

  const handleSelect = useCallback((id) => {
    onChange(id);
    setExpanded(false);
  }, [onChange]);

  // The Quest title screen belongs to Workout.
  const current = tabs.find((t) => t.id === (activeTab === 'quest' ? 'workout' : activeTab));

  return (
    <>
      {expanded && (
        <div onClick={() => setExpanded(false)} className="fixed inset-0 z-40 fx-fade" style={{ background: 'rgba(0,0,0,.4)' }} />
      )}

      {expanded && (
        <div className="fixed left-2 right-2 z-50 max-w-xl mx-auto p-3 bg-bg-1 rounded-[28px] grid grid-cols-4 gap-1.5 fx-up g-root"
          style={{ bottom: `calc(${BAR + 2}px + env(safe-area-inset-bottom, 0px))`, boxShadow: 'var(--g-sheet-shadow)' }}>
          {tabs.map((tab) => {
            const on = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => handleSelect(tab.id)}
                className="flex flex-col items-center gap-2 px-1 py-4 rounded-[18px] active:scale-95 transition-transform"
                style={{ background: on ? 'var(--g-acc-soft)' : 'var(--color-bg-2)', color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                <span className="relative flex">
                  <NavIcon id={tab.id} size={22} />
                  {tab.id === 'workout' && hasActiveWorkout && !on && (
                    <span className="absolute -top-0.5 -right-1 w-[7px] h-[7px] rounded-full bg-accent" />
                  )}
                </span>
                <span style={{ font: `500 10px ${MONO}` }}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <button onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} aria-label="Navigation"
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2.5 bg-bg-0 text-accent"
        style={{ height: `calc(${BAR}px + env(safe-area-inset-bottom, 0px))`, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <NavIcon id={activeTab} size={18} />
        <span style={{ font: `500 12px ${MONO}`, letterSpacing: '.06em' }}>{current?.label}</span>
        <span className="text-text-tertiary" style={{ fontFamily: MONO, fontSize: 14, transition: 'transform .25s', transform: expanded ? 'rotate(180deg)' : 'none' }}>⌃</span>
        {hasActiveWorkout && activeTab !== 'workout' && (
          <span className="absolute right-7 w-2 h-2 rounded-full bg-accent" style={{ top: 26 }} />
        )}
      </button>
    </>
  );
}
