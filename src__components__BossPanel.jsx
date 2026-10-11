import BodyMap from './BodyMap';
import useWeeklyBoss from '../hooks/useWeeklyBoss';
import { BOSS_GROUPS, BOSS_GROUP_SETS, BOSS_WORDS } from '../lib/quest';

const MONO = 'var(--font-mono)';

// Weekly boss progress: two groups of four sets, at least 48 h apart, offered at
// the end of any workout. Shown on the home screen and the quest screen.
export default function BossPanel() {
  const { boss, nextAt, beaten } = useWeeklyBoss();
  if (!boss) return null;
  const fights = boss.fights.length;
  const ok = beaten ? 'var(--color-success)' : '#ff2222';
  const wait = nextAt && nextAt > Date.now() ? Math.ceil((nextAt - Date.now()) / 3600e3) : 0;
  return (
    <div className="flex-shrink-0 flex items-center gap-3.5 bg-bg-1 rounded-[22px] p-3.5" style={{ boxShadow: `inset 0 0 0 1.5px ${ok}` }}>
      <div className="flex-shrink-0" style={{ width: 92 }}><BodyMap heat={{ [boss.region]: 1 }} height={92} /></div>
      <div className="flex-1 min-w-0">
        <div style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em', color: ok }}>WEEKLY BOSS{beaten ? ' · DEFEATED' : ''}</div>
        <div className="truncate" style={{ marginTop: 2, fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>{boss.name}</div>
        {boss.cry && <div className="truncate text-text-secondary" style={{ font: `400 11px ${MONO}` }}>“{boss.cry}”</div>}
        <div className="mt-2 flex gap-1.5">
          {Array.from({ length: BOSS_GROUPS }, (_, i) => (
            <span key={i} className="flex-1 h-1.5 rounded-[3px]" style={{ background: i < fights ? ok : 'var(--color-bg-3)' }} />
          ))}
        </div>
        <div className="mt-1.5 text-text-tertiary" style={{ font: `400 10px/1.45 ${MONO}` }}>
          {beaten ? 'Beaten this week · +1 card pack claimed'
            : `${BOSS_WORDS[boss.region]} · ${BOSS_GROUPS} fights of ${BOSS_GROUP_SETS} sets of ${boss.exercise} · ${fights}/${BOSS_GROUPS} done · ${wait ? `next fight in ${wait} h` : 'ready at the end of your next workout'}`}
        </div>
      </div>
    </div>
  );
}
