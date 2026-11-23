import { isMarker } from './history.js';
import { supersetRows } from './supersets.js';
import { estimateMinutes, daysAgo } from './focus.js';
import { weekKey, BOSS_GROUPS } from './quest.js';

export const parseWorkouts = (p) => (typeof p?.workouts === 'string' ? JSON.parse(p.workouts) : p?.workouts || []);

// "Up next": the workout after the one you did last, in that program's order.
export function upNextOf(programs, sessions) {
  const last = sessions[0];
  const program = programs.find((p) => p.name === last?.program_name) || programs[0];
  if (!program) return { line: 'Create a program to get started.' };
  const ws = parseWorkouts(program);
  const from = ws.findIndex((w) => w.name === last?.workout_name);
  let index = from < 0 ? 0 : (from + 1) % ws.length;
  for (let k = 0; k < ws.length && ws[index]?.variationOf; k++) index = (index + 1) % ws.length;
  const workout = ws[index];
  const line = last && workout
    ? `${last.workout_name} was ${daysAgo(last.date)}. ${workout.name} is up next.`
    : workout ? `${workout.name} is first up.` : 'Add a workout to this program to start.';
  return { program, workout, index, line };
}

// What the Android app's widget and reminder show. It keeps this for when the page is closed, so anything that
// changes with the date (days ago, this week, the streak) is worked out there from `dates`.
export function homeMessage({ programs, workoutHistory, activeWorkout, prof }) {
  const sessions = (workoutHistory || []).filter((w) => !isMarker(w));
  const { workout } = upNextOf(programs || [], sessions);
  const exs = workout?.exercises || [];
  const blocks = supersetRows(exs).length;
  const dates = [...new Set(sessions.map((w) => String(w.date || '').split('T')[0]).filter(Boolean))].sort().reverse().slice(0, 400);
  const boss = prof?.boss?.week === weekKey() && prof.boss.fights && prof.bossBeat !== prof.boss.week ? prof.boss : null;
  return {
    t: 'home',
    next: workout?.name || '',
    meta: workout ? `${blocks} block${blocks !== 1 ? 's' : ''} · ~${estimateMinutes(exs)} min` : '',
    dates,
    active: activeWorkout?.workoutName || '',
    since: Date.parse(activeWorkout?.startTime) || 0,
    boss: boss ? `${boss.name} ${boss.fights.length}/${BOSS_GROUPS}` : '',
    bossWeek: boss ? boss.week : '',
  };
}

const KEY = 'gains-beta-remind';
/** This phone's workout reminder: days without training (0 = off) and the time of day. */
export function readRemind() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY));
    if (r && [0, 1, 2, 3, 4].includes(r.days) && /^\d\d:\d\d$/.test(r.at)) return { days: r.days, at: r.at };
  } catch { /* none saved */ }
  return { days: 0, at: '17:00' };
}
export const saveRemind = (r) => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* private mode */ } };
