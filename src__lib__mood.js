// What the live background reacts to. Parts of the app that know something is
// happening write here; WaveBackground reads it every frame. Deliberately not
// React state — the background owns no app state and nothing re-renders.
export const moodState = {
  preview: null,     // { m, t } from the Settings "Preview mood" chips, 2.8s
  prUntil: 0,        // PR toast / level-up pop: gold until this timestamp
  finish: null,      // 'done' (analysis, summary) | 'pr' (PR reveal)
  pulse: 0,          // timestamp of the last completed set — triggers the swell
  countdown: false,  // pre-workout 3·2·1·GO
  rest: null,        // { end, total } while the rest timer runs (ms)
  timer: null,       // { kind: 'bfr' } | { kind: 'interval', phase: 'work' | 'rest' }
  cardio: null,      // { startMs, baseSec, targetSec } while a cardio timer runs
  inWorkout: false,
  progress: 0,       // 0–1 share of the workout's sets done
};

// [colour token, strength 0–100, tempo seconds]
export const MOODS = {
  idle: ['accent', 16, 3.6], work: ['accent', 26, 1.8], go: ['accent', 55, 0.7],
  rest: ['error', 40, 4.4], done: ['success', 50, 1.2], pr: ['#fbbf24', 55, 1],
  bfr: ['#c084fc', 42, 1.2], cardio: ['#fb923c', 50, 2.2], intW: ['success', 44, 0.7], intR: ['#f59e0b', 40, 2.6],
};

/** First match wins — the priority order from the handoff. */
export function deriveMood(s, now) {
  const pv = s.preview && now - s.preview.t < 2800 ? s.preview.m : null;
  let mood = 'idle';
  if (pv) mood = pv;
  else if (s.finish === 'pr' || now < s.prUntil) mood = 'pr';
  else if (s.finish === 'done') mood = 'done';
  else if (s.pulse && now - s.pulse < 1300) mood = 'done';
  else if (s.countdown) mood = 'go';
  else if (s.cardio) mood = 'cardio';
  else if (s.rest && s.rest.end > now) mood = 'rest';
  else if (s.timer) mood = s.timer.kind === 'bfr' ? 'bfr' : s.timer.phase === 'work' ? 'intW' : 'intR';
  else if (s.inWorkout) mood = 'work';

  const resting = s.rest && s.rest.end > now;
  let amp = 0.3;
  if (mood === 'rest' && !resting) amp = 0.85; // previewing rest with no real timer
  else if (mood === 'rest') amp = Math.max(0, (s.rest.end - now) / s.rest.total);
  else if (mood === 'done' || mood === 'pr') amp = 0.92;
  else if (s.inWorkout) amp = 0.14 + 0.62 * s.progress;

  // Cardio: the screen fills from the bottom as the timer counts up, full at the
  // target; the waves ride the surface of the fill.
  const fill = mood === 'cardio'
    ? Math.min(1, Math.max(0, (s.cardio.baseSec + (now - s.cardio.startMs) / 1000) / s.cardio.targetSec))
    : 0;
  const base = mood === 'cardio' ? 1.02 - fill : mood === 'rest' ? 0.42 + 0.3 * (1 - amp) : mood === 'pr' || mood === 'done' ? 0.5 : 0.62;
  return { mood, amp, base, fill };
}
