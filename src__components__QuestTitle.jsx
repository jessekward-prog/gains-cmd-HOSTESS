import { useMemo, useState } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import { useToast } from '../context/ToastContext';
import useQuest, { readTint, readScanlines } from '../hooks/useQuest';
import QuestStage from './QuestStage';
import QuestHeroCard, { MiniHeroCard } from './QuestHeroCard';
import { isMarker } from '../lib/history';
import { buildBlocks } from '../lib/focus';
import { lvTitle, tierOf } from '../lib/quest';

const MONO = 'var(--font-mono)';
const parse = (p) => (typeof p.workouts === 'string' ? JSON.parse(p.workouts) : p.workouts) || [];

// Quest Mode's title screen, in place of "No active workout": choose today's
// quest from your program (defaulting to the one that's up next) and begin.
export default function QuestTitle({ onNavigate }) {
  const { programs, workoutHistory, startWorkout } = useWorkout();
  const { showToast } = useToast();
  const { prof } = useQuest();
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
  const program = programs.find((p) => p.id === pick?.programId) || upNext?.program;
  const index = pick?.index ?? (program === upNext?.program ? upNext?.index : 0) ?? 0;
  const ws = program ? parse(program).map((w, i) => [w, i]).filter(([w]) => !w.variationOf) : [];

  const tier = tierOf(prof.lvl);
  const begin = async () => {
    try { await startWorkout(program, index); } catch (e) { showToast('Error starting quest: ' + e.message, 'error'); }
  };

  return (
    <div className="g-root flex flex-col min-h-full">
      <div className="px-5 pt-3 pb-3">
        <div className="g-label truncate">{program ? `${program.name} · QUEST` : 'QUEST'}</div>
        <div className="mt-1 truncate" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{ws.find(([, i]) => i === index)?.[0].name || 'Gains Quest'}</div>
      </div>
      <div className="flex-1 px-3.5 pb-6 flex flex-col gap-2.5">
        <QuestStage phase="title" area={0} heroName={prof.hero} petKey={prof.pet} lvl={prof.lvl} xp={prof.xp}
          tint={readTint()} scanlines={readScanlines()} msg="A new day dawns over the meadow. Choose your quest, HERO."
          title={{ line: `LV ${prof.lvl} · ${lvTitle(prof.lvl).toUpperCase()}`, color: tier[2] }}
          card={<MiniHeroCard onOpen={() => setCardOpen(true)} />} />

        <div className="flex-shrink-0 bg-bg-1 rounded-[28px] p-5">
          <div className="text-accent" style={{ font: `600 11px ${MONO}`, letterSpacing: '.16em' }}>CHOOSE TODAY'S QUEST</div>
          {programs.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto mt-3" style={{ scrollbarWidth: 'none' }}>
              {programs.map((p) => (
                <button key={p.id} onClick={() => setPick({ programId: p.id, index: 0 })} className="flex-shrink-0 h-8 px-3 rounded-[10px]"
                  style={{ font: `500 11px ${MONO}`, background: p === program ? 'var(--color-accent)' : 'var(--color-bg-2)', color: p === program ? 'var(--color-on-accent)' : 'var(--color-text-secondary)' }}>{p.name}</button>
              ))}
            </div>
          )}
          {!program && (
            <div className="mt-3 text-sm text-text-secondary">No program yet. Make one in Programs and it becomes your quest list.</div>
          )}
          <div className="flex flex-col gap-1.5 mt-3">
            {ws.map(([w, i]) => {
              const on = i === index;
              const exs = w.exercises || [];
              const sets = exs.reduce((a, e) => a + (Number(e.sets) || 0), 0);
              return (
                <button key={i} onClick={() => setPick({ programId: program.id, index: i })} className="flex items-center gap-3 px-4 py-3.5 rounded-[18px] text-left"
                  style={{ background: on ? 'rgba(255,34,34,.08)' : 'var(--color-bg-2)', boxShadow: `inset 0 0 0 1.5px ${on ? 'var(--color-accent)' : 'transparent'}` }}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: on ? 'var(--color-accent)' : '#333' }} />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{w.name}</span>
                    <span className="block mt-0.5 truncate text-text-secondary" style={{ font: `400 11px ${MONO}` }}>{exs.slice(0, 3).map((e) => e.name).join(' · ')}</span>
                  </span>
                  <span className="text-right text-text-tertiary flex-shrink-0" style={{ font: `400 10px ${MONO}` }}>
                    {buildBlocks(exs.map((e) => ({ ...e, sets: [] }))).length} monsters{sets ? ` · ${sets} sets` : ''}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 mt-3.5">
            <button onClick={() => setCardOpen(true)} className="flex-1 h-[62px] rounded-[20px] bg-bg-2 font-bold text-[15px]" style={{ boxShadow: `inset 0 0 0 1.5px ${tier[2]}` }}>Hero card</button>
            <button onClick={program ? begin : () => onNavigate('programs')} className="flex-[2] h-[62px] rounded-[20px] bg-accent font-extrabold text-[17px]" style={{ color: 'var(--color-on-accent)' }}>
              {program ? 'Begin quest' : 'Make a program'}
            </button>
          </div>
        </div>
      </div>
      {cardOpen && <QuestHeroCard open onClose={() => setCardOpen(false)} />}
    </div>
  );
}
