// Self-check for exercise-library matching + muscle heat — `node catalog.check.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { norm, indexCatalog, resolve, candidates, guess, MATCH_MIN, regionsOf, muscleSets, sessionMuscles, topExerciseFor } from './src__lib__catalog.js';

const cat = indexCatalog(JSON.parse(readFileSync('src__lib__catalog.json', 'utf8')));
assert.equal(cat.list.length, 1324);

// Plurals and punctuation don't split an exercise in two.
assert.equal(norm('Push-ups'), norm('push-up'));
assert.equal(norm('Cable Crunches'), 'cable crunch');
assert.equal(norm('Rear delt flies'), norm('rear delt flyes'));
assert.equal(norm('Close-Grip Bench Presses'), 'close grip bench press');
assert.equal(norm('Close grip lat pull down'), norm('close grip lat pulldown'));

// A library spelling links itself; an explicit link wins; '' means "no match".
const bench = resolve('Barbell Bench Press', {}, cat);
assert.equal(bench.n, 'barbell bench press');
assert.equal(resolve('Bench', { Bench: bench.id }, cat), bench);
assert.equal(resolve('Barbell Bench Press', { 'Barbell Bench Press': '' }, cat), null);
assert.equal(resolve('Treadmill', {}, cat), null);

// The shortlist has the right movement near the top for loose names.
const top = (n) => candidates(n, cat, 4).map((x) => x.n);
assert.ok(top('Hammer Curls').includes('dumbbell hammer curl'));
assert.ok(top('Seated row').includes('cable seated row'));
// Five cable crunches tie on wording; which one leads is arbitrary, so this
// asks that they are all the right movement, not that a named variant leads.
assert.ok(top('Cable Crunches').every((n) => /^cable .*crunch$/.test(n)));

// The best guess is the right MOVEMENT, not just a name sharing a word with it.
// (Plain token overlap used to answer "chest dip" here, and "band bench press"
// — the shortest name with every word — for the bench press.)
const best = (n) => guess(n, {}, cat)?.n ?? null;
assert.equal(best('Chest Flies'), 'dumbbell fly');
assert.equal(best('Bench Press'), 'dumbbell bench press');
assert.equal(best('Seated Cable Row'), 'cable seated row');
assert.equal(best('Incline Dumbbell Press'), 'dumbbell incline bench press');
assert.equal(best('Goblet Squat'), 'dumbbell goblet squat');
// Named equipment is honoured over a better-worded entry with the wrong kit.
assert.equal(guess('Smith Machine Bench Press', {}, cat).eq, 'smith machine');
assert.equal(guess('Barbell Row', {}, cat).eq, 'barbell');
// A variant nobody asked for loses to the plain movement.
assert.ok(!/\bone\b/.test(best('Tricep Pushdown')));

// Nothing beats a wrong animation: movements the library simply doesn't have
// come back null rather than the nearest word-salad.
assert.equal(best('Nordic Curl'), null);        // was "barbell curl"
assert.equal(best('Cable Woodchop'), null);     // was "cable curl"
assert.equal(best('Pec Deck'), null);           // was "back pec stretch"
assert.equal(best('Face Pull'), null);
assert.ok(MATCH_MIN > 0 && MATCH_MIN < 1);
// A link still wins, and '' still means "the user said there is no match".
assert.equal(guess('Nordic Curl', { 'Nordic Curl': bench.id }, cat), bench);
assert.equal(guess('Chest Flies', { 'Chest Flies': '' }, cat), null);

// Target counts 1 per completed set, secondaries ½; old and unfinished sets don't count.
const r = regionsOf(bench);
assert.equal(r.chest, 1);
assert.ok(Object.values(r).every((v) => v === 1 || v === 0.5));
const now = Date.parse('2026-10-09T12:00:00');
const sets = (done, total) => Array.from({ length: total }, (_, i) => ({ completed: i < done }));
const heat = muscleSets([
  { date: '2026-10-08', exercises: [{ name: 'Barbell Bench Press', sets: sets(3, 4) }, { name: 'Treadmill', sets: sets(1, 1) }] },
  { date: '2026-09-20', exercises: [{ name: 'Barbell Bench Press', sets: sets(5, 5) }] },
], {}, cat, 7, now);
assert.equal(heat.chest, 3);
for (const [k, v] of Object.entries(r)) if (v === 0.5) assert.equal(heat[k], 1.5);

// One session: same counting; unlinked names are reported, "not in library" ones aren't.
const one = sessionMuscles([
  { name: 'Barbell Bench Press', sets: sets(2, 3) },
  { name: 'Mystery Move', sets: sets(1, 1) },
  { name: 'Treadmill', sets: sets(1, 1) },
  { name: 'Skipped', sets: sets(0, 3) },
], { Treadmill: '' }, cat);
assert.equal(one.sets.chest, 2);
assert.deepEqual(one.unmatched, ['Mystery Move']);

// A workout logged this morning counts before noon too.
{
  const morning = Date.parse('2026-10-09T08:00:00');
  assert.equal(muscleSets([{ date: '2026-10-09', exercises: [{ name: 'Barbell Bench Press', sets: sets(2, 2) }] }], {}, cat, 7, morning).chest, 2);
}
// Boss exercise: the most-trained one whose MAIN target is that muscle.
{
  const h = [{ exercises: [{ name: 'Barbell Bench Press', sets: sets(3, 3) }, { name: 'Dumbbell Fly', sets: sets(5, 5) }, { name: 'Triceps Dip', sets: sets(9, 9) }] }];
  assert.equal(topExerciseFor(h, {}, cat, 'chest'), 'Dumbbell Fly');
  assert.equal(topExerciseFor(h, {}, cat, 'hamstring'), null);
  assert.equal(topExerciseFor(h, {}, cat, 'chest', new Set(['Barbell Bench Press'])), 'Barbell Bench Press');
}
console.log('catalog.check: ok');
