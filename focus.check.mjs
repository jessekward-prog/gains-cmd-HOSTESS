// Self-check for the Focus layout's PR + block rules — `node focus.check.mjs`.
// focus.js imports its siblings by their unfolded names (setup.sh moves
// src__lib__x.js to src/lib/x.js), so copy them into that shape first.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dir = join(mkdtempSync(join(tmpdir(), 'focus-')), 'lib');
mkdirSync(dir);
for (const f of ['focus', 'supersets', 'history', 'mood']) copyFileSync(resolve(`src__lib__${f}.js`), join(dir, `${f}.js`));
const F = await import(join(dir, 'focus.js'));

const session = (date, name, sets) => ({
  date, program_name: 'P', workout_name: 'W',
  exercises: [{ name, sets: sets.map(([weight, reps, type]) => ({ weight: String(weight), reps: String(reps), completed: true, type })) }],
});

// Last = newest session's top set; best = heaviest ever, with its best reps.
{
  const h = [
    session('2026-10-03', 'Bench', [[80, 8], [80, 7], [60, 12, 'drop']]),
    { date: '2026-10-02', program_name: 'LEVEL_UP_MILESTONE', exercises: [{ name: 'Bench', sets: [{ weight: '90', reps: '1', completed: true }] }] },
    session('2026-09-28', 'Bench', [[82.5, 5], [80, 9]]),
  ];
  const s = F.liftStats(h, 'Bench');
  assert.deepEqual(s, { lw: 80, lr: 8, best: 82.5, bestReps: 5 });
  assert.equal(F.isPR(s, 'Bench', 85, 3), true);
  assert.equal(F.isPR(s, 'Bench', 82.5, 6), true);
  assert.equal(F.isPR(s, 'Bench', 82.5, 5), false);
  assert.equal(F.isPR(s, 'Bench', 80, 12), false);
  // Exact names only — recommendations credit exact names, so PRs do too.
  assert.equal(F.liftStats(h, 'bench').best, null);
}

// Assisted lifts: the weight is a counterweight, so lower is the PR.
{
  const h = [session('2026-10-03', 'Assisted Pull-Up', [[30, 8], [25, 6]])];
  const s = F.liftStats(h, 'Assisted Pull-Up');
  assert.equal(s.best, 25);
  assert.equal(F.isPR(s, 'Assisted Pull-Up', 22.5, 5), true);
  assert.equal(F.isPR(s, 'Assisted Pull-Up', 30, 10), false);
  assert.equal(F.isPR(s, 'Assisted Pull-Up', 0, 3), true); // fully unassisted
}

// No history = baseline, never a PR; bodyweight never a PR on normal lifts.
assert.equal(F.isPR(F.liftStats([], 'Squat'), 'Squat', 100, 5), false);
assert.equal(F.isPR({ best: 0, bestReps: 5 }, 'Pull-Up', 0, 12), false);

// Blocks: supersets fold into one, kinds come from set types.
{
  const ex = (name, extra = {}, type) => ({ name, sets: [{ completed: false, type }, { completed: false, type }], ...extra });
  const w = [ex('A', { supersetWith: 'B' }), ex('B'), ex('C', {}, 'bfr'), ex('D', {}, 'interval'), ex('E')];
  w[4].sets.splice(1, 0, { completed: false, type: 'drop', dropIndex: 0 });
  const b = F.buildBlocks(w);
  assert.deepEqual(b.map((x) => x.kind), ['superset', 'bfr', 'interval', 'drop']);
  assert.deepEqual(F.buildBlocks(w)[0].indices, [0, 1]);
  assert.equal(F.setLabel(w[4].sets, 1), 'D1');
  assert.equal(F.setLabel(w[4].sets, 2), '2');
  w[2].sets.forEach((s) => { s.completed = true; });
  assert.equal(F.nextOpenBlock(w, b, 0), 2);
}

console.log('focus checks passed');

// Summary: volume, sets, PRs (biggest jump first), drops never count as the top set.
{
  const hist = [session('2026-10-01', 'Row', [[60, 10]]), session('2026-09-30', 'Curl', [[12, 10]])];
  const w = { workoutName: 'Pull', programName: 'PPL', exercises: [
    { name: 'Row', sets: [{ weight: '70', reps: '8', completed: true }, { weight: '90', reps: '3', completed: true, type: 'drop', dropIndex: 0 }] },
    { name: 'Curl', sets: [{ weight: '14', reps: '8', completed: true }, { weight: '14', reps: '', completed: false }] },
  ] };
  const s = F.summarize(w, hist);
  assert.equal(s.sets, 3);
  assert.equal(s.vol, 70 * 8 + 90 * 3 + 14 * 8);
  assert.deepEqual(s.prs.map((p) => p.name), ['Row', 'Curl']);
  assert.equal(s.ex[0].best, '70 × 8');
  assert.equal(s.ex[1].sets, '1/2 sets');
}
// Estimated 1RM: Epley from the best 1–12 rep working set; none for BW/assisted.
{
  const S = (w, r, extra = {}) => ({ weight: String(w), reps: String(r), completed: true, ...extra });
  assert.equal(F.e1rm('Bench', [S(100, 1)]), 100);
  assert.equal(F.e1rm('Bench', [S(60, 10), S(80, 5)]), 93.5); // 80×(1+5/30)=93.33 → 93.5 beats 60×(1+10/30)=80
  assert.equal(F.e1rm('Bench', [S(60, 15)]), null);             // past 12 reps: not trusted
  assert.equal(F.e1rm('Bench', [S(60, 8, { completed: false }), S(60, 8, { type: 'drop' })]), null);
  assert.equal(F.e1rm('Push-ups', [S(0, 20)]), null);
  assert.equal(F.e1rm('Assisted pull-up', [S(30, 8)]), null);
  const hist = [session('2026-10-08', 'Bench', [[70, 'failure']]), session('2026-10-05', 'Bench', [[80, 5]])];
  assert.equal(F.lastE1rm(hist, 'Bench'), 93.5); // skips a session with no usable set
  const sum = F.summarize({ workoutName: 'W', programName: 'P', exercises: [{ name: 'Bench', sets: [S(85, 5)] }] }, hist);
  assert.deepEqual(sum.strength, [{ name: 'Bench', now: 99, prev: 93.5 }]);
}
console.log('summary checks passed');

// Live background mood: priority order from LIVE_BACKGROUND.md, first match wins.
{
  const M = await import(join(dir, 'mood.js'));
  const now = 100000;
  const s = (o) => ({ preview: null, prUntil: 0, finish: null, pulse: 0, countdown: false, rest: null, timer: null, inWorkout: false, progress: 0, ...o });
  const mood = (o) => M.deriveMood(s(o), now).mood;
  assert.equal(mood({}), 'idle');
  assert.equal(mood({ inWorkout: true }), 'work');
  assert.equal(mood({ inWorkout: true, rest: { end: now + 30000, total: 60000 } }), 'rest');
  assert.equal(mood({ inWorkout: true, rest: { end: now - 1, total: 60000 } }), 'work'); // expired rest
  assert.equal(mood({ inWorkout: true, rest: { end: now + 30000, total: 60000 }, pulse: now - 500 }), 'done'); // set just done beats rest
  assert.equal(mood({ inWorkout: true, pulse: now - 1400 }), 'work'); // pulse window is 1.3s
  assert.equal(mood({ finish: 'done', prUntil: now + 100 }), 'pr'); // PR beats done
  assert.equal(mood({ countdown: true, inWorkout: true }), 'go');
  assert.equal(mood({ inWorkout: true, timer: { kind: 'bfr' } }), 'bfr');
  assert.equal(mood({ inWorkout: true, timer: { kind: 'interval', phase: 'rest' } }), 'intR');
  assert.equal(mood({ finish: 'pr', preview: { m: 'rest', t: now - 1000 } }), 'rest'); // preview wins for 2.8s
  assert.equal(mood({ preview: { m: 'rest', t: now - 3000 } }), 'idle');
  // The band sinks as rest drains: base 0.42 at the start → 0.72 at the end.
  const b = (left) => M.deriveMood(s({ rest: { end: now + left, total: 60000 } }), now).base;
  assert.ok(Math.abs(b(60000) - 0.42) < 1e-9 && Math.abs(b(1) - 0.72) < 0.001);
  // Cardio replaces the rest background and fills from the bottom: half the
  // target elapsed → half full, capped at full once the target is passed.
  const cardio = (sec, base = 0) => ({ inWorkout: true, rest: { end: now + 30000, total: 60000 }, cardio: { startMs: now - sec * 1000, baseSec: base, targetSec: 300 } });
  assert.equal(mood(cardio(10)), 'cardio');
  assert.equal(mood({ ...cardio(10), pulse: now - 500 }), 'done');
  assert.ok(Math.abs(M.deriveMood(s(cardio(120, 30)), now).fill - 0.5) < 1e-9);
  assert.equal(M.deriveMood(s(cardio(400)), now).fill, 1);
  console.log('mood checks passed');
}
