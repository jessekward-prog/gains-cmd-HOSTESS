// Self-check for exercise-library matching + muscle heat — `node catalog.check.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { norm, indexCatalog, resolve, candidates, regionsOf, muscleSets, sessionMuscles } from './src__lib__catalog.js';

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
assert.ok(top('Cable Crunches').includes('cable kneeling crunch'));

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

console.log('catalog.check: ok');
