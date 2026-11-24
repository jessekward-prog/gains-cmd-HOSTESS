import { useState } from 'react';
import BodyMap from './BodyMap';
import useWeeklyBoss from '../hooks/useWeeklyBoss';
import { BOSS_GROUPS, BOSS_WORDS } from '../lib/quest';

const MONO = 'var(--font-mono)';

export const BOSS_H = 68; // closed

// Weekly boss progress: two fights of one set to failure, at least 48 h apart,
// offered at the start of a workout. One line on the quest screen; tap for the rest.
export default function BossPanel() {
  const { boss, nextAt, beaten } = useWeeklyBoss();
  const [open, setOpen] = useState(false);
  if (!boss) return null;
  const fights = boss.fights.length;
  const ok = beaten ? 'var(--color-success)' : '#ff2222';
  const wait = nextAt && nextAt > Date.now() ? Math.ceil((nextAt - Date.now()) / 3600e3) : 0;
  return (
    <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full text-left flex-shrink-0 flex items-center gap-3 bg-bg-1 rounded-[22px] px-3.5 py-2.5"
      style={{ minHeight: BOSS_H, boxShadow: `inset 0 0 0 1.5px ${ok}` }}>
      <span className="flex-shrink-0 block" style={{ width: open ? 92 : 48 }}><BodyMap heat={{ [boss.region]: 1 }} height={open ? 92 : 48} /></span>
      <span className="flex-1 min-w-0 block">
        <span className="block" style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em', color: ok }}>WEEKLY BOSS{beaten ? ' · DEFEATED' : ''}</span>
        <span className="block truncate" style={{ marginTop: 2, fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{boss.name}</span>
        {open ? (
          <>
            {boss.cry && <span className="block text-text-secondary" style={{ font: `400 11px/1.45 ${MONO}` }}>“{boss.cry}”</span>}
            <span className="block mt-1 text-text-secondary" style={{ font: `400 11px/1.45 ${MONO}` }}>
              {beaten ? 'Beaten this week · +1 card pack claimed'
                : `${BOSS_WORDS[boss.region]} · ${BOSS_GROUPS} fights, each 1 set to failure of ${boss.exercise} · ${wait ? `next fight in ${wait} h` : 'offered at the start of your next workout'}`}
            </span>
          </>
        ) : (
          <span className="block truncate text-text-secondary" style={{ font: `400 11px ${MONO}` }}>
            {beaten ? 'Beaten this week' : wait ? `Next fight in ${wait} h` : `${BOSS_WORDS[boss.region]} · ${boss.exercise}`}
          </span>
        )}
      </span>
      <span className="flex-shrink-0 flex flex-col items-end gap-1.5">
        <span className="text-text-secondary" style={{ font: `500 12px ${MONO}` }}>{fights}/{BOSS_GROUPS}</span>
        <span className="flex gap-1">
          {Array.from({ length: BOSS_GROUPS }, (_, i) => (
            <span key={i} style={{ width: 18, height: 6, borderRadius: 3, background: i < fights ? ok : 'transparent', boxShadow: `inset 0 0 0 1.5px ${ok}` }} />
          ))}
        </span>
      </span>
    </button>
  );
}
