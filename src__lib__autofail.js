// Auto weight (Training Settings): every lifting set is a failure set, and each
// set's weight for next time comes from the reps its own last sessions counted.
// Way over the top of the range → heavier at once, scaled by the overshoot.
// Just over → heavier only after it happens twice in a row at that weight.
// In range → hold. Under → lighter, scaled by the shortfall.

const BIG_OVER = 3;  // reps past the top that count as "way over"
const MAX_STEPS = 3; // never move more than this many increments in one go

const isAssisted = (name) => /assisted|counterbalance/i.test(name || '');

// Same buckets as the server's classifyExercise (server.js).
function bucket(name) {
  const n = name || '';
  if (/squat|deadlift|lunge|leg press|hip thrust|clean|snatch|step up|sled/i.test(n)) return 'lowerCompound';
  if (/leg curl|leg extension|hamstring curl|calf raise|calf press|hip abduction|hip adduction|glute kick|nordic/i.test(n)) return 'lowerIsolated';
  if (/curl|lateral raise|front raise|fly|pushdown|tricep extension|skull crusher|shrug|rear delt|pec deck|pullover/i.test(n)) return 'upperIsolated';
  return 'upperCompound';
}

/** One weight step for this exercise, from the Training Settings increments. */
export function incrementFor(name, agg) {
  return parseFloat(agg?.[bucket(name) + 'Increment']) || 2.5;
}

/** "15-20" → [15, 20]; anything without two numbers → null. */
export function parseRange(r) {
  const m = String(r ?? '').match(/(\d+)\s*[-–]\s*(\d+)/);
  return m && +m[1] <= +m[2] ? [+m[1], +m[2]] : null;
}

/** Can Auto weight run this program exercise? Cardio, timed, interval and BFR sets have no reps to judge. */
export const autoCapable = (ex) => !!ex && ex.type !== 'cardio' && !ex.isBFR && !ex.isInterval && !ex.isTimed && !!parseRange(ex.repRange);

/** Is it on for this program exercise: its own switch (workout ⋮ → Auto weight), else the Training default. */
export const autoOn = (ex, agg) => autoCapable(ex) && (ex.autoWeight ?? !!agg?.autoFailure);

/** A program's workouts with exercises `idxs` of workout `wi` switched on or off. */
export const setAutoWeight = (workouts, wi, idxs, value) => workouts.map((w, k) => (k !== wi ? w
  : { ...w, exercises: (w.exercises || []).map((ex, i) => (idxs.includes(i) ? { ...ex, autoWeight: value } : ex)) }));

const stepsFor = (by) => Math.min(MAX_STEPS, Math.max(1, Math.round(by / 2.5)));

/**
 * Next weight for set `i` (counting working sets only, drops skipped) of `name`.
 * `history` is newest first, as the API returns it. Returns null when there's no
 * counted, weighted past set to go on — the caller keeps its usual prefill.
 * Otherwise { weight, d, why }: d is the change in kg (0 = hold).
 */
export function autoWeight(history, name, i, [lo, hi], inc) {
  const done = [];
  for (const h of history || []) {
    if (/_MILESTONE$/.test(h.program_name || '')) continue;
    let exs = h.exercises;
    if (typeof exs === 'string') { try { exs = JSON.parse(exs); } catch { continue; } }
    const ex = (exs || []).find((e) => e.name === name && !e.boss);
    const s = ex?.sets?.filter((x) => x.type !== 'drop')[i];
    const reps = parseInt(s?.reps, 10), w = parseFloat(s?.weight);
    // A failure set nobody counted still reads "failure" — nothing to learn from it.
    if (!s?.completed || Number.isNaN(reps) || !(w > 0)) continue;
    done.push({ reps, w });
    if (done.length === 2) break;
  }
  if (!done.length) return null;

  const [a, b] = done;
  const over = a.reps - hi, under = lo - a.reps;
  let steps = 0, why = '';
  if (over >= BIG_OVER) { steps = stepsFor(over); why = `${a.reps} reps last time`; }
  else if (over > 0 && b && b.reps > hi && b.w === a.w) { steps = 1; why = `over ${hi} twice running`; }
  else if (under > 0) { steps = -stepsFor(under); why = `${a.reps} reps last time`; }

  // Assisted machines: less assistance is the harder direction.
  const weight = Math.max(0, a.w + (isAssisted(name) ? -1 : 1) * steps * inc);
  return { weight, d: Math.round((weight - a.w) * 100) / 100, why };
}
