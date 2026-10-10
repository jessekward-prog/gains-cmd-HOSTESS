import { useEffect, useMemo, useState } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import useQuest, { readTint, readScanlines } from '../hooks/useQuest';
import QuestStage from './QuestStage';
import QuestHeroCard, { MiniHeroCard } from './QuestHeroCard';
import { isMarker } from '../lib/history';
import { buildBlocks } from '../lib/focus';
import { lvTitle, tierOf, weekKey, pickBossRegion, daysThisWeek, BOSS_SETS, BOSS_WORDS, BOSS_NAMES } from '../lib/quest';
import useCatalog from '../hooks/useCatalog';
import { muscleSets } from '../lib/catalog';
import BodyMap from './BodyMap';
import TypewriterName from './TypewriterName';

const MONO = 'var(--font-mono)';
const parse = (p) => (typeof p.workouts === 'string' ? JSON.parse(p.workouts) : p.workouts) || [];

// Quest Mode's title screen (home → Quest): choose today's quest from your
// program (defaulting to the one that's up next) and begin.
export default function QuestTitle({ onNavigate }) {
  const { programs, workoutHistory, startWorkout, settings } = useWorkout();
  const { showToast } = useToast();
  const { prof, updProf } = useQuest();
  const cat = useCatalog();

  // Weekly boss: the muscle you've trained least over the last 14 days, fixed
  // for the week once chosen. Beaten at BOSS_SETS sets on it this week.
  const wk = weekKey();
  const boss = useMemo(() => {
    if (!cat) return null;
    const links = settings?.exerciseLinks;
    const region = prof.boss?.week === wk ? prof.boss.region : pickBossRegion(muscleSets(workoutHistory, links, cat, 14));
    return { region, sets: Math.round((muscleSets(workoutHistory, links, cat, daysThisWeek())[region] || 0) * 2) / 2 };
  }, [cat, workoutHistory, settings?.exerciseLinks, prof.boss, wk]);
  useEffect(() => {
    if (boss && prof.boss?.week !== wk) {
      updProf((p) => (p.boss?.week === wk ? p : { ...p, boss: { week: wk, region: boss.region, label: BOSS_WORDS[boss.region], name: BOSS_NAMES[boss.region], cry: '' } })).catch(() => {});
    }
  }, [boss?.region, wk]); // eslint-disable-line react-hooks/exhaustive-deps
  const bossBeat = prof.bossBeat === wk;
  const bossReady = !bossBeat && boss && boss.sets >= BOSS_SETS; // beaten, claimed at the next quest's loot
  const [cardOpen, setCardOpen] = useState(false);

  const upNext = useMemo(() => {
    const last = (workoutHistory || []).find((w) => !isMarker(w));
    const program = programs.find((p) => p.name === last?.program_name) || programs[0];
    if (!program) return null;
    const ws = parse(program);
    const from = ws.findIndex((w) => w.name === last?.workout_name);
    let index = from < 0 ? 0 : (from + 1) % ws.length;
    for (let k = 0; k < ws.length && ws[index]?.variationOf; k++) index = (index + 1) % ws.length;
    return { program, index };
  }, [programs, workoutHistory]);
  const [pick, setPick] = useState(null);
  const [openIds, setOpenIds] = useState(null); // null = just the selected workout's program
  const program = programs.find((p) => p.id === pick?.programId) || upNext?.program;
  const index = pick?.index ?? (program === upNext?.program ? upNext?.index : 0) ?? 0;
  const ws = program ? parse(program).map((w, i) => [w, i]) : [];
  // Every workout in every program can be a quest — up-next's program first.
  const groups = upNext ? [upNext.program, ...programs.filter((p) => p !== upNext.program)] : programs;

  const tier = tierOf(prof.lvl);
  const begin = async () => {
    try { await startWorkout(program, index, { quest: true }); onNavigate('workout'); } catch (e) { showToast('Error starting quest: ' + e.message, 'error'); }
  };

  return (
    <div className="g-root flex flex-col min-h-full">
      <div className="px-5 pt-3 pb-3">
        <div className="g-label truncate">{program ? `${program.name} · QUEST` : 'QUEST'}</div>
        <div className="mt-1 truncate" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
          {/* Retypes with the cursor whenever you pick a different quest (and now and then on its own). */}
          <TypewriterName text={ws.find(([, i]) => i === index)?.[0].name || 'Gains Quest'} />
        </div>
      </div>
      <div className="flex-1 px-3.5 pb-6 flex flex-col gap-2.5">
        <QuestStage phase="title" area={0} heroName={prof.hero} petKey={prof.pet} lvl={prof.lvl} xp={prof.xp}
          tint={readTint()} scanlines={readScanlines()} msg="A new day dawns over the meadow. Choose your quest, HERO."
          title={{ line: `LV ${prof.lvl} · ${lvTitle(prof.lvl).toUpperCase()}`, color: tier[2] }}
          card={<MiniHeroCard onOpen={() => setCardOpen(true)} />} />

        {boss && prof.boss?.week === wk && (
          <div className="flex-shrink-0 flex items-center gap-3.5 bg-bg-1 rounded-[22px] p-3.5" style={{ boxShadow: `inset 0 0 0 1.5px ${bossBeat || bossReady ? 'var(--color-success)' : '#ff2222'}` }}>
            <div className="flex-shrink-0" style={{ width: 92 }}><BodyMap heat={{ [boss.region]: 1 }} height={92} /></div>
            <div className="flex-1 min-w-0">
              <div style={{ font: `600 10px ${MONO}`, letterSpacing: '.16em', color: bossBeat || bossReady ? 'var(--color-success)' : '#ff2222' }}>WEEKLY BOSS{bossBeat || bossReady ? ' · DEFEATED' : ''}</div>
              <div className="truncate" style={{ marginTop: 2, fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>{prof.boss.name}</div>
              {prof.boss.cry && <div className="truncate text-text-secondary" style={{ font: `400 11px ${MONO}` }}>“{prof.boss.cry}”</div>}
              <div className="mt-2 h-1 rounded-[2px] bg-bg-3 overflow-hidden">
                <div className="h-full" style={{ width: `${Math.min(1, boss.sets / BOSS_SETS) * 100}%`, background: bossBeat || bossReady ? 'var(--color-success)' : '#ff2222' }} />
              </div>
              <div className="mt-1 text-text-tertiary" style={{ font: `400 10px ${MONO}` }}>
                {bossBeat ? 'Beaten this week · +1 card pack claimed'
                  : bossReady ? 'Beaten · finish a quest to claim +1 card pack'
                  : `Train ${BOSS_WORDS[boss.region]} · ${boss.sets}/${BOSS_SETS} sets this week · +1 card pack`}
              </div>
            </div>
          </div>
        )}

        <div className="flex-shrink-0 bg-bg-1 rounded-[28px] p-5">
          <div className="text-accent" style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em' }}>CHOOSE TODAY'S QUEST</div>
          {!program && (
            <div className="mt-3 text-sm text-text-secondary">No program yet. Make one in Programs and it becomes your quest list.</div>
          )}
          {groups.map((pg) => {
            const open = openIds ? openIds.includes(pg.id) : pg === program;
            const toggle = () => setOpenIds((ids) => {
              const cur = ids || (program ? [program.id] : []);
              return cur.includes(pg.id) ? cur.filter((x) => x !== pg.id) : [...cur, pg.id];
            });
            const n = parse(pg).length;
            return (
            <div key={pg.id} className="mt-2">
              {groups.length > 1 && (
                <button onClick={toggle} className="w-full flex items-center gap-2 px-1 py-2.5 text-left">
                  <span className="flex-1 min-w-0 truncate" style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: pg === program ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{pg.name}</span>
                  <span className="text-text-tertiary flex-shrink-0" style={{ font: `400 10px ${MONO}` }}>{n} workout{n === 1 ? '' : 's'}</span>
                  <span className="text-text-tertiary inline-block transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none', font: `500 14px ${MONO}` }}>›</span>
                </button>
              )}
              {(open || groups.length === 1) && (
              <div className="flex flex-col gap-1.5 fx-in">
                {parse(pg).map((w, i) => {
                  const on = pg === program && i === index;
                  const exs = w.exercises || [];
                  const sets = exs.reduce((a, e) => a + (Number(e.sets) || 0), 0);
                  return (
                    <button key={i} onClick={() => setPick({ programId: pg.id, index: i })} className="flex items-center gap-3 px-4 py-3.5 rounded-[18px] text-left"
                      style={{ background: on ? 'rgba(255,34,34,.08)' : 'var(--color-bg-2)', boxShadow: `inset 0 0 0 1.5px ${on ? 'var(--color-accent)' : 'transparent'}` }}>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: on ? 'var(--color-accent)' : '#333' }} />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{w.name}</span>
                        <span className="block mt-0.5 truncate text-text-secondary" style={{ font: `400 11px ${MONO}` }}>
                          {buildBlocks(exs.map((e) => ({ ...e, sets: [] }))).length} monsters{sets ? ` · ${sets} sets` : ''} · {exs.map((e) => e.name).join(' · ')}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              )}
            </div>
            );
          })}
          {/* Reverse vignette: the list fades to the card colour behind the buttons,
              and each button casts a dark halo, so nothing busy shows through. */}
          <div className="flex gap-2 sticky bottom-0 -mx-5 px-5 pb-3" style={{ marginTop: -28, paddingTop: 44, borderRadius: '0 0 28px 28px', background: 'linear-gradient(to bottom, transparent, var(--color-bg-1) 38%)' }}>
            <button onClick={() => setCardOpen(true)} className="flex-1 h-[62px] rounded-[20px] bg-bg-2 font-bold text-[15px]" style={{ boxShadow: `inset 0 0 0 1.5px ${tier[2]}, 0 0 28px 10px var(--color-bg-1)` }}>Hero card</button>
            <button onClick={program ? begin : () => onNavigate('programs')} className="flex-[2] h-[62px] rounded-[20px] bg-accent font-extrabold text-[17px]" style={{ color: 'var(--color-on-accent)', boxShadow: '0 0 28px 10px var(--color-bg-1)' }}>
              {program ? 'Begin quest' : 'Make a program'}
            </button>
          </div>
        </div>
      </div>
      {cardOpen && <QuestHeroCard open onClose={() => setCardOpen(false)} />}
    </div>
  );
}
