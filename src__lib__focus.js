// Pure helpers behind the Focus / Dense workout layouts. No React, so
// focus.check.mjs can exercise them directly.
import { supersetRows } from './supersets.js';
import { isMarker } from './history.js';

export const TAGS = {
  superset: ['SUPERSET', 'var(--g-ss)'],
  drop: ['DROP SET', 'var(--g-drop)'],
  bfr: ['BFR', 'var(--g-bfr)'],
  interval: ['INTERVAL', 'var(--g-int)'],
};

export const num = (v) => parseFloat(v) || 0;
export const fmtW = (v) => (num(v) === 0 ? 'BW' : String(num(v)));
export const restLabel = (s) => (s >= 120 && s % 60 === 0 ? `${s / 60}m` : `${s}s`);
export const mmss = (sec) => {
  const t = Math.max(0, Math.floor(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// Same test the server's progression engine uses: on these machines the weight
// is a counterweight, so a LOWER number is the harder, better lift.
export const isAssisted = (name) => /assisted|counterbalance/i.test(name || '');

export const isCardio = (ex) => ex?.type === 'cardio' || ex?.sets?.[0]?.type === 'cardio';

function kindOf(ex) {
  if (isCardio(ex)) return 'cardio';
  const sets = ex?.sets || [];
  if (sets.some((s) => s.type === 'interval')) return 'interval';
  if (sets.some((s) => s.type === 'bfr')) return 'bfr';
  if (sets.some((s) => s.type === 'drop')) return 'drop';
  return 'normal';
}

/** Workout as blocks: a superset is one block, everything else is one exercise. */
export function buildBlocks(exercises = []) {
  return supersetRows(exercises).map((row) => row.kind === 'superset'
    ? { kind: 'superset', indices: row.indices }
    : { kind: kindOf(exercises[row.index]), indices: [row.index] });
}

const blockSets = (exercises, b) => b.indices.flatMap((i) => exercises[i]?.sets || []);
export const blockDone = (exercises, b) => blockSets(exercises, b).every((s) => s.completed);
export const blockProgress = (exercises, b) => {
  const all = blockSets(exercises, b);
  return all.length ? all.filter((s) => s.completed).length / all.length : 0;
};
export const blockName = (exercises, b) => b.indices.map((i) => exercises[i]?.name).join(' + ');

/** The next unfinished block after `from`, wrapping round; -1 when all are done. */
export function nextOpenBlock(exercises, blocks, from) {
  for (let k = 1; k <= blocks.length; k++) {
    const i = (from + k) % blocks.length;
    if (!blockDone(exercises, blocks[i])) return i;
  }
  return -1;
}

/** The set the card is on: a manual pick if valid, else the first incomplete one. */
export function focusIndex(ex, override) {
  const sets = ex?.sets || [];
  if (override != null && override < sets.length) return override;
  const i = sets.findIndex((s) => !s.completed);
  return i < 0 ? Math.max(0, sets.length - 1) : i;
}

/** "1", "2"… for working sets, "D1"/"D2" for the drops that hang off them. */
export function setLabel(sets, i) {
  const s = sets[i];
  if (s?.type === 'drop') return `D${(s.dropIndex ?? 0) + 1}`;
  return String(sets.slice(0, i + 1).filter((x) => x.type !== 'drop').length);
}

/**
 * Last session's top set and the all-time best, from history for this exact
 * exercise name (recommendations credit exact names only, so this does too).
 * `best` is the best weight — highest, or lowest for assisted lifts — and
 * `bestReps` the most reps done at it.
 */
export function liftStats(history = [], name) {
  const assisted = isAssisted(name);
  const better = (a, b) => (assisted ? a < b : a > b);
  let last = null;
  let best = null;
  let bestReps = 0;
  for (const w of history) {
    if (isMarker(w)) continue;
    let exs = w.exercises;
    if (typeof exs === 'string') { try { exs = JSON.parse(exs); } catch { exs = []; } }
    const ex = (exs || []).find((e) => e?.name === name);
    if (!ex) continue;
    const done = (ex.sets || []).filter((s) => s.completed && s.type !== 'drop' && s.reps !== 'failure');
    if (!done.length) continue;
    if (!last) {
      const top = done.reduce((a, s) => (better(num(s.weight), num(a.weight)) || (num(s.weight) === num(a.weight) && num(s.reps) > num(a.reps)) ? s : a));
      last = { w: num(top.weight), r: num(top.reps) };
    }
    for (const s of done) {
      const w2 = num(s.weight), r2 = num(s.reps);
      if (best === null || better(w2, best)) { best = w2; bestReps = r2; }
      else if (w2 === best && r2 > bestReps) bestReps = r2;
    }
  }
  return { lw: last?.w ?? null, lr: last?.r ?? null, best, bestReps };
}

/**
 * Does this completed working set beat the stored best? Needs a history to
 * compare against — a first-ever session sets a baseline, not a PR. Bodyweight
 * (0) never counts, except on assisted lifts where 0 means fully unassisted.
 */
export function isPR(stats, name, weight, reps) {
  if (!stats || stats.best === null) return false;
  const w = num(weight), r = num(reps);
  const assisted = isAssisted(name);
  if (w === 0 && !assisted) return false;
  if (assisted ? w < stats.best : w > stats.best) return true;
  return w === stats.best && r > stats.bestReps;
}

/** Rough session length: ~40s under the bar per set plus the programmed rest. */
export function estimateMinutes(exercises = []) {
  const secs = exercises.reduce((a, ex) => {
    const n = ex.sets?.length ?? ex.sets ?? 3;
    const count = typeof n === 'number' ? n : 3;
    return a + count * (40 + (ex.restSeconds || 90));
  }, 0);
  return Math.max(5, Math.round(secs / 60 / 5) * 5);
}

/** Relative day label for a YYYY-MM-DD date: "today", "yesterday", "3 days ago"… */
export function daysAgo(dateStr, now = new Date()) {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).split('T')[0] + 'T12:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const n = Math.round((today - d) / 86400000);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return `${n} days ago`;
  if (n < 60) return `${Math.round(n / 7)} weeks ago`;
  return `${Math.round(n / 30)} months ago`;
}

/** Everything the finish flow shows, computed before finishWorkout clears the workout. */
export function summarize(workout, history = []) {
  let vol = 0, sets = 0;
  const prs = [], ex = [];
  for (const block of buildBlocks(workout.exercises)) {
    for (const i of block.indices) {
      const e = workout.exercises[i];
      const done = (e.sets || []).filter((s) => s.completed);
      sets += done.length;
      let top = null;
      const assisted = isAssisted(e.name);
      for (const s of done) {
        vol += num(s.weight) * num(s.reps);
        if (s.type === 'drop' || s.reps === 'failure') continue;
        const w = num(s.weight), tw = top ? num(top.weight) : null;
        if (!top || (assisted ? w < tw : w > tw) || (w === tw && num(s.reps) > num(top.reps))) top = s;
      }
      const stats = liftStats(history, e.name);
      if (top && isPR(stats, e.name, top.weight, top.reps)) {
        prs.push({ name: e.name, w: num(top.weight), r: num(top.reps), best: stats.best, assisted });
      }
      const tag = TAGS[block.kind]?.[0].toLowerCase();
      ex.push({
        name: e.name,
        sets: block.kind === 'cardio' ? 'cardio' : `${done.length}/${e.sets.length} sets${tag ? ` · ${tag}` : ''}`,
        best: top ? `${fmtW(top.weight)} × ${top.reps || '—'}` : '—',
      });
    }
  }
  // Biggest jump first — that's the one the PR screen reveals.
  prs.sort((a, b) => Math.abs(b.w - b.best) - Math.abs(a.w - a.best));
  return { name: workout.workoutName, prog: workout.programName, vol: Math.round(vol), sets, prs, ex };
}

/** Saved workout layout: focus (beta default), dense, classic or block-grid. */
export function workoutLayout() {
  try { return localStorage.getItem('gains-cmd-workout-layout') || 'focus'; } catch { return 'focus'; }
}
