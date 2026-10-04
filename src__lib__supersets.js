// Superset grouping is DERIVED from `supersetWith` at render time, never stored.
// That's what makes existing programs retrofit themselves: every program and
// in-flight workout already carries the field, so they group with no migration.
// It also tolerates the two shapes that exist in real data — ProgramsPage writes
// the link on one side only, WorkoutPage writes both.

const norm = (s) => (s || '').trim().toLowerCase();

const isCardio = (ex) => ex?.type === 'cardio' || ex?.sets?.[0]?.type === 'cardio';

/**
 * Union-find over `supersetWith` links.
 * Returns Map<leaderIndex, memberIndices[]>, leader = lowest index, members sorted.
 */
export function buildSupersetGroups(exercises = []) {
  const parent = exercises.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  // First occurrence wins, so a workout with two "Cable Row" entries links the first.
  const byName = new Map();
  exercises.forEach((ex, i) => {
    const k = norm(ex?.name);
    if (k && !byName.has(k)) byName.set(k, i);
  });

  exercises.forEach((ex, i) => {
    if (!ex?.supersetWith) return;
    const j = byName.get(norm(ex.supersetWith));
    // A link pointing at a name that isn't in this workout — renamed, removed,
    // or typed by hand in the program editor — leaves the exercise standalone
    // instead of producing a one-member card.
    if (j === undefined || j === i) return;
    // Cardio has its own card (timer, photo capture); never fold it into a superset.
    if (isCardio(ex) || isCardio(exercises[j])) return;
    union(i, j);
  });

  const groups = new Map();
  exercises.forEach((_, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  });
  return groups;
}

/**
 * The workout list as rows: a superset renders once, at its lowest member's
 * position, and its other members are not rendered separately.
 */
export function supersetRows(exercises = []) {
  const groups = buildSupersetGroups(exercises);
  const seen = new Set();
  const rows = [];
  exercises.forEach((_, i) => {
    if (seen.has(i)) return;
    const members = groups.get(i) || [i];
    members.forEach((m) => seen.add(m));
    rows.push(members.length > 1
      ? { kind: 'superset', indices: members }
      : { kind: 'exercise', index: i });
  });
  return rows;
}

/** The member indices of the superset containing `index`, or null if it isn't in one. */
export function supersetMembersOf(exercises = [], index) {
  const groups = buildSupersetGroups(exercises);
  for (const members of groups.values()) {
    if (members.length > 1 && members.includes(index)) return members;
  }
  return null;
}

// ── Rounds ──────────────────────────────────────────────────────────
// A round is one pass through the superset: member A's set 1, then B's set 1.
// Drop sets hang off the normal set they follow, so they don't count as rounds —
// the same rule SetRow uses to number rows.

export const normalSetCount = (ex) =>
  (ex?.sets || []).filter((s) => s.type !== 'drop').length;

/** Which round a given set index belongs to, or -1 if it isn't a normal set. */
export function roundOfSet(ex, setIndex) {
  const sets = ex?.sets || [];
  if (!sets[setIndex] || sets[setIndex].type === 'drop') return -1;
  let n = -1;
  for (let i = 0; i <= setIndex; i++) if (sets[i].type !== 'drop') n++;
  return n;
}

/** The set index for a round, or -1 when this exercise has no set that far in. */
export function setIndexForRound(ex, round) {
  const sets = ex?.sets || [];
  let n = -1;
  for (let i = 0; i < sets.length; i++) {
    if (sets[i].type !== 'drop' && ++n === round) return i;
  }
  return -1;
}

/**
 * Is every member done with this round?
 * `justCompleted` counts the set that is being checked right now — SetRow calls
 * onComplete in the same tick as its own update, so that set isn't in state yet.
 */
export function roundComplete(exercises, indices, round, justCompleted = null) {
  return indices.every((ei) => {
    const si = setIndexForRound(exercises[ei], round);
    if (si < 0) return true;
    if (justCompleted && justCompleted.exerciseIndex === ei && justCompleted.setIndex === si) return true;
    return !!exercises[ei].sets[si].completed;
  });
}

/** Total rounds in a superset = the longest member. */
export const supersetRounds = (exercises, indices) =>
  Math.max(1, ...indices.map((i) => normalSetCount(exercises[i])));

/** The round the lifter is on: the first one that isn't finished. */
export function currentRound(exercises, indices) {
  const total = supersetRounds(exercises, indices);
  for (let r = 0; r < total; r++) if (!roundComplete(exercises, indices, r)) return r;
  return total - 1;
}

/**
 * After finishing a set, which member still owes you a set in the same round?
 * Returns an exercise index, or -1 when the round is done. This is what hands
 * the lifter from A to B.
 */
export function nextMemberForRound(exercises, indices, exerciseIndex, setIndex) {
  const r = roundOfSet(exercises[exerciseIndex], setIndex);
  if (r < 0) return -1;
  const from = indices.indexOf(exerciseIndex);
  for (let k = 1; k < indices.length; k++) {
    const next = indices[(from + k) % indices.length];
    const nsi = setIndexForRound(exercises[next], r);
    if (nsi >= 0 && !exercises[next].sets[nsi].completed) return next;
  }
  return -1;
}

// ── Rest mode ───────────────────────────────────────────────────────
// Stored per member as `supersetRest`. Absent means shared, because that's what
// a superset means — and it's the behaviour existing programs never had.

export const SHARED = 'shared';
export const EACH = 'each';

export const supersetRestMode = (exercises, indices) =>
  indices.map((i) => exercises[i]?.supersetRest).find(Boolean) || SHARED;
