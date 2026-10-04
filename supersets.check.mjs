// Self-check for superset grouping — `node supersets.check.mjs`.
// The cases here are the shapes that already exist in saved programs, which is
// what "it retrofits itself" has to mean in practice.
import assert from 'node:assert/strict';
import {
  supersetRows, supersetMembersOf, roundComplete, nextMemberForRound,
  currentRound, supersetRestMode, SHARED,
} from './src__lib__supersets.js';

const ex = (name, sets = 3, extra = {}) => ({
  name,
  restSeconds: 90,
  sets: Array.from({ length: sets }, () => ({ reps: '', weight: '', completed: false })),
  ...extra,
});

// ProgramsPage writes the link on one side only — both still group.
{
  const w = [ex('Bench', 3, { supersetWith: 'Row' }), ex('Row')];
  assert.deepEqual(supersetRows(w), [{ kind: 'superset', indices: [0, 1] }]);
}

// WorkoutPage writes both sides — one card, not two.
{
  const w = [ex('Bench', 3, { supersetWith: 'Row' }), ex('Row', 3, { supersetWith: 'Bench' })];
  assert.deepEqual(supersetRows(w), [{ kind: 'superset', indices: [0, 1] }]);
}

// Case and whitespace drift in a hand-typed partner name still matches.
{
  const w = [ex('Bench', 3, { supersetWith: '  row ' }), ex('Row')];
  assert.equal(supersetRows(w).length, 1);
}

// A link to something that isn't in the workout leaves the exercise alone.
{
  const w = [ex('Bench', 3, { supersetWith: 'Deleted Exercise' }), ex('Row')];
  assert.deepEqual(supersetRows(w), [{ kind: 'exercise', index: 0 }, { kind: 'exercise', index: 1 }]);
  assert.equal(supersetMembersOf(w, 0), null);
}

// Members that aren't adjacent group anyway, and render at the first one's slot.
{
  const w = [ex('Bench', 3, { supersetWith: 'Row' }), ex('Squat'), ex('Row')];
  assert.deepEqual(supersetRows(w), [
    { kind: 'superset', indices: [0, 2] },
    { kind: 'exercise', index: 1 },
  ]);
}

// Chains give a tri-set rather than two overlapping pairs.
{
  const w = [ex('A', 3, { supersetWith: 'B' }), ex('B', 3, { supersetWith: 'C' }), ex('C')];
  assert.deepEqual(supersetRows(w), [{ kind: 'superset', indices: [0, 1, 2] }]);
}

// Cardio keeps its own card no matter what the link says.
{
  const w = [ex('Bench', 3, { supersetWith: 'Treadmill' }), ex('Treadmill', 1, { type: 'cardio' })];
  assert.equal(supersetRows(w).length, 2);
}

// Rest gating: mid-round fires nothing, the last set of the round fires once.
{
  const w = [ex('Bench', 3, { supersetWith: 'Row' }), ex('Row', 3, { supersetWith: 'Bench' })];
  const members = supersetMembersOf(w, 0);
  assert.deepEqual(members, [0, 1]);
  assert.equal(supersetRestMode(w, members), SHARED);
  // Checking A's set 1: B hasn't done round 1 yet → no rest.
  assert.equal(roundComplete(w, members, 0, { exerciseIndex: 0, setIndex: 0 }), false);
  w[0].sets[0].completed = true;
  // Now checking B's set 1 closes the round → rest.
  assert.equal(roundComplete(w, members, 0, { exerciseIndex: 1, setIndex: 0 }), true);
  // And the hand-off runs A → B → done.
  assert.equal(nextMemberForRound(w, members, 0, 0), 1);
  w[1].sets[0].completed = true;
  assert.equal(nextMemberForRound(w, members, 1, 0), -1);
  assert.equal(currentRound(w, members), 1);
}

// Uneven set counts: the short member simply has no set in the later rounds.
{
  const w = [ex('Bench', 3, { supersetWith: 'Row' }), ex('Row', 2, { supersetWith: 'Bench' })];
  const members = [0, 1];
  w[0].sets[2].completed = true;
  assert.equal(roundComplete(w, members, 2, null), true);
  assert.equal(nextMemberForRound(w, members, 0, 2), -1);
}

// Drop sets hang off their parent set and never count as a round.
{
  const bench = ex('Bench', 2, { supersetWith: 'Row' });
  bench.sets.splice(1, 0, { reps: '', weight: '', completed: false, type: 'drop', dropIndex: 0 });
  const w = [bench, ex('Row', 2, { supersetWith: 'Bench' })];
  const members = [0, 1];
  // Set index 2 is the second NORMAL set, i.e. round 1.
  assert.equal(nextMemberForRound(w, members, 0, 2), 1);
  // The drop row itself isn't a round, so it starts no rest and hands off to nobody.
  assert.equal(nextMemberForRound(w, members, 0, 1), -1);
}

console.log('supersets: all checks passed');
