import { useEffect } from 'react';
import { useWorkout } from '../context/WorkoutContext';
import useQuest from './useQuest';
import useCatalog from './useCatalog';
import { muscleSets, topExerciseFor } from '../lib/catalog';
import { weekKey, pickBossRegion, bossOfferable, bossNextAt, BOSS_WORDS, BOSS_NAMES, BOSS_DEFAULT_EXERCISE } from '../lib/quest';

// This week's boss: your least-trained muscle over the last 14 days, fought with
// the exercise you've done most for it (or a simple default). Set up once per
// week — only after the profile has loaded, so it can't overwrite saved progress.
export default function useWeeklyBoss() {
  const { workoutHistory, settings, programs } = useWorkout();
  const { prof, updProf } = useQuest();
  const cat = useCatalog();
  const wk = weekKey();
  const cur = prof.boss?.week === wk ? prof.boss : null;
  const ready = !!(cur && cur.exercise && cur.fights);
  useEffect(() => {
    if (!cat || !settings || ready) return;
    const links = settings.exerciseLinks;
    const region = cur?.region || pickBossRegion(muscleSets(workoutHistory, links, cat, 14));
    // Prefer a move still in your programs; then anything you've done; then a safe default.
    const inPrograms = new Set((programs || []).flatMap((pg) => ((typeof pg.workouts === 'string' ? JSON.parse(pg.workouts) : pg.workouts) || [])
      .flatMap((w) => (w.exercises || []).map((e) => e.name))));
    const exercise = cur?.exercise || topExerciseFor(workoutHistory, links, cat, region, inPrograms)
      || topExerciseFor(workoutHistory, links, cat, region) || BOSS_DEFAULT_EXERCISE[region];
    updProf((p) => {
      const b = p.boss?.week === wk ? p.boss : null;
      if (b?.exercise && b.fights) return p;
      return { ...p, boss: { name: BOSS_NAMES[region], cry: '', ...(b || {}), week: wk, region, label: BOSS_WORDS[region], exercise: b?.exercise || exercise, fights: b?.fights || [] } };
    }).catch(() => {});
  }, [cat, !!settings, wk, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return { boss: ready ? cur : null, wk, offerable: ready && bossOfferable(cur, wk), nextAt: ready ? bossNextAt(cur) : null, beaten: prof.bossBeat === wk };
}
