// Auto weight (Training Settings): every lifting set is a failure set, and each
// set's weight for next time comes from the reps its own last sessions counted.
// Way over the top of the range → heavier at once, scaled by the overshoot.
// Just over → heavier only after it happens N sessions running at that weight.
// In range → hold. Under → lighter, scaled by the shortfall.
//
// Every number in that is a rule the desktop planner (desktop planner → Rules) can edit,
// globally and per exercise. They're kept in aggression_settings.autoRules:
//   { ...global overrides, exercises: { [name]: { range?, step?, ...overrides } } }
// Anything unset falls back to DEFAULT_RULES, which is the original behaviour.

export const DEFAULT_RULES = {
  // Between sessions
  bigOver: 3,          // reps past the top that count as "way over" → heavier now
  repsPerStep: 2.5,    // reps over (or under) per weight step
  maxUp: 3,            // most steps up in one go
  maxDown: 3,          // most steps down in one go
  justOverRuns: 2,     // sessions running just over, same weight, before stepping up
  justOverSteps: 1,
  // Within a session: 0 = off
  nextUpOver: 0,       // a set this many reps over the top raises the next set now
  nextUpSteps: 1,
  nextDownUnder: 0,    // a set this many reps under the bottom lowers the next set now
  nextDownSteps: 1,
  // Too-fast alert (stored now; used once the alert ships)
  lowerBig: 1.0,       // s: lowering faster than this on a big lift is a dropped rep
  lowerSmall: 1.5,     // s: same for small isolation lifts
  swing: 'normal',     // 'low' | 'normal' | 'high': how readily a late fast rep counts as a swing
  fastRepCounts: 0.5,  // a too-fast rep counts as this much of a rep for Auto weight
};

export const isAssisted = (name) => /assisted|counterbalance/i.test(name || '');

// Same buckets as the server's classifyExercise (server.js).
export function bucket(name) {
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

/** The rules for one exercise: defaults ← your global rules ← that exercise's own. */
export function rulesFor(name, agg) {
  const { exercises, ...glob } = agg?.autoRules || {};
  return { ...DEFAULT_RULES, ...glob, ...(exercises?.[name] || {}) };
}

/** Range, step and rules Auto weight uses for an exercise; `programRange` is what the workout says. */
export function exerciseConfig(name, agg, programRange) {
  const rules = rulesFor(name, agg);
  return { rules, range: parseRange(rules.range) || parseRange(programRange), inc: parseFloat(rules.step) || incrementFor(name, agg) };
}

/** Can Auto weight run this program exercise? Cardio, timed, interval and BFR sets have no reps to judge. */
export const autoCapable = (ex) => !!ex && ex.type !== 'cardio' && !ex.isBFR && !ex.isInterval && !ex.isTimed && !!parseRange(ex.repRange);

/** Is it on for this program exercise: its own switch (workout ⋮ → Auto weight), else the Training default. */
export const autoOn = (ex, agg) => autoCapable(ex) && (ex.autoWeight ?? !!agg?.autoFailure);

/** A program's workouts with exercises `idxs` of workout `wi` switched on or off. */
export const setAutoWeight = (workouts, wi, idxs, value) => workouts.map((w, k) => (k !== wi ? w
  : { ...w, exercises: (w.exercises || []).map((ex, i) => (idxs.includes(i) ? { ...ex, autoWeight: value } : ex)) }));

const stepsFor = (by, per, max) => Math.min(max, Math.max(1, Math.round(by / (per || 2.5))));
const sessionsOf = (history) => (history || []).filter((h) => !/_MILESTONE$/.test(h.program_name || ''));
function setIn(h, name, i) {
  let exs = h.exercises;
  if (typeof exs === 'string') { try { exs = JSON.parse(exs); } catch { return null; } }
  const ex = (exs || []).find((e) => e.name === name && !e.boss);
  return ex?.sets?.filter((x) => x.type !== 'drop')[i] || null;
}
const counted = (s) => {
  const reps = parseInt(s?.reps, 10), w = parseFloat(s?.weight);
  // A failure set nobody counted still reads "failure" — nothing to learn from it.
  return s?.completed && !Number.isNaN(reps) && w > 0 ? { reps, w } : null;
};

/**
 * Next weight for set `i` (counting working sets only, drops skipped) of `name`.
 * `history` is newest first, as the API returns it. Returns null when there's no
 * counted, weighted past set to go on — the caller keeps its usual prefill.
 * Otherwise { weight, d, why }: d is the change in kg (0 = hold).
 */
export function autoWeight(history, name, i, [lo, hi], inc, rules = DEFAULT_RULES) {
  const R = { ...DEFAULT_RULES, ...rules };
  const need = Math.max(1, R.justOverRuns);
  const done = [];
  for (const h of sessionsOf(history)) {
    const c = counted(setIn(h, name, i));
    if (!c) continue;
    done.push(c);
    if (done.length === need) break;
  }
  if (!done.length) return null;

  const a = done[0];
  const over = a.reps - hi, under = lo - a.reps;
  let steps = 0, why = '';
  if (over >= R.bigOver) { steps = stepsFor(over, R.repsPerStep, R.maxUp); why = `${a.reps} reps last time`; }
  else if (over > 0 && done.length >= need && done.every((x) => x.reps > hi && x.w === a.w)) {
    steps = R.justOverSteps;
    why = need === 1 ? `over ${hi} last time` : need === 2 ? `over ${hi} twice running` : `over ${hi} ${need}× running`;
  } else if (under > 0) { steps = -stepsFor(under, R.repsPerStep, R.maxDown); why = `${a.reps} reps last time`; }

  // Assisted machines: less assistance is the harder direction.
  const weight = Math.max(0, a.w + (isAssisted(name) ? -1 : 1) * steps * inc);
  return { weight, d: Math.round((weight - a.w) * 100) / 100, why };
}

/**
 * Within a session: after a set logs `reps`, what the next set (now loaded at `w`) should change to.
 * null = leave it alone (rule off, or the set was in range).
 */
export function nextSetNow(name, reps, w, [lo, hi], inc, rules = DEFAULT_RULES) {
  const R = { ...DEFAULT_RULES, ...rules };
  const r = parseInt(reps, 10), x = parseFloat(w);
  if (Number.isNaN(r) || !(x > 0)) return null;
  let steps = 0;
  if (R.nextUpOver > 0 && r - hi >= R.nextUpOver) steps = R.nextUpSteps;
  else if (R.nextDownUnder > 0 && lo - r >= R.nextDownUnder) steps = -R.nextDownSteps;
  if (!steps) return null;
  const weight = Math.max(0, x + (isAssisted(name) ? -1 : 1) * steps * inc);
  return { weight, d: Math.round((weight - x) * 100) / 100, why: `last set hit ${r}` };
}

/**
 * Replays an exercise's real history: after each session, what the rules would
 * load next for each set. Oldest first. Rows: { date, set, w, reps, next, actual }
 * — `actual` is what the following session really used for that set.
 */
export function replay(history, name, agg, rulesOverride) {
  const sessions = sessionsOf(history).filter((h) => setIn(h, name, 0)).reverse();
  const programRange = (() => {
    for (const h of sessions) {
      let exs = h.exercises; if (typeof exs === 'string') { try { exs = JSON.parse(exs); } catch { continue; } }
      const ex = (exs || []).find((e) => e.name === name);
      if (ex?.repRange) return ex.repRange;
    }
    return null;
  })();
  const { rules, range, inc } = exerciseConfig(name, agg, programRange);
  const R = rulesOverride ? { ...rules, ...rulesOverride } : rules;
  const rng = parseRange(R.range) || range;
  const step = parseFloat(R.step) || inc;
  if (!rng) return { rows: [], range: null, inc: step };
  const rows = [];
  sessions.forEach((h, k) => {
    const upTo = sessions.slice(0, k + 1).reverse();
    for (let i = 0; i < 6; i++) {
      const c = counted(setIn(h, name, i));
      if (!c) { if (!setIn(h, name, i)) break; continue; }
      const next = autoWeight(upTo, name, i, rng, step, R);
      const following = sessions[k + 1] && counted(setIn(sessions[k + 1], name, i));
      rows.push({ date: h.date, set: i, w: c.w, reps: c.reps, next, actual: following ? following.w : null });
    }
  });
  return { rows, range: rng, inc: step };
}
