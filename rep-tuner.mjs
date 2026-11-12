// Scoreboard for the rep counter — `node rep-tuner.mjs <export.json>`
// (the file from GET /api/rep-traces/export).
//
// This runs the counter the app actually ships, from src__lib__repcount.js,
// rather than a second copy of the rule. Every change to counting or capture
// gets re-run here and the summary line goes in the Obsidian note with the date
// and corpus size.
//
// 2026-11-09, 15 rows, BEFORE guided capture: unscorable, and the reason is the
// point. `commitSet` stored the trailing 120 s at the moment a set was logged,
// but sets get logged long after they finish — median 69 s later, up to 98 s —
// so 7 of 15 rows held no rep motion at all (peak gyro under 5 deg/s for the
// whole window): the set had been trimmed out of the rolling buffer before the
// tap. The remaining rows hold a set somewhere inside two minutes of rest and
// walking, at an unknown offset.
//
// An earlier version of this file recorded a baseline of "exact 3, within 1 of
// 8, MAE 2.7" over 14 sets. That number was void: it was measured over those
// same rows, and the old rule thresholded at a fraction of the signal's own
// standard deviation with no absolute floor, so on a window of pure rest it
// amplified the noise floor and reported 19-21 reps out of nothing. Do not
// compare anything to it.
//
// What IS established on real data: the absolute floors in repcount.js zero all
// six empty rows. The first honest accuracy number needs guided rows.
import { readFileSync } from 'node:fs';
import { decodeSamples } from './src__lib__witmotion.js';
import { createCounter, refPose, restLevel, heldStill, gyroMag, MIN_GYRO } from './src__lib__repcount.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: node rep-tuner.mjs <export.json>');
  process.exit(1);
}
const raw = JSON.parse(readFileSync(file, 'utf8'));
const traces = Array.isArray(raw) ? raw : raw.traces || [];
const mean = (v) => v.reduce((s, x) => s + x, 0) / (v.length || 1);

/**
 * Re-count a stored trace offline. A guided row carries its own calibration
 * hold at the front, which is exactly what the live counter used; an older row
 * has to make do with the quietest stretch before motion starts, which is a
 * guess and is marked as one.
 */
function recount(r) {
  const s = decodeSamples(r.samples);
  if (s.length < 50) return null;
  const hz = s.length / Math.max((s.at(-1).t - s[0].t) / 1000, 0.001);
  const oneSec = Math.max(10, Math.round(hz));
  let hold;
  if (r.guided && r.set_start_ms > 0) {
    // Everything before the marker is the hold.
    const end = s.findIndex((x) => x.t - s[0].t >= r.set_start_ms);
    hold = s.slice(0, end > oneSec ? end : oneSec);
  } else {
    const firstMove = s.findIndex((x) => gyroMag(x) >= MIN_GYRO);
    hold = firstMove > oneSec
      ? s.slice(Math.max(0, firstMove - oneSec * 2), firstMove - Math.round(oneSec * 0.2))
      : s.slice(0, oneSec);
  }
  const g0 = restLevel(hold);
  if (!g0) return null;
  const from = r.guided && r.set_start_ms > 0
    ? Math.max(0, s.findIndex((x) => x.t - s[0].t >= r.set_start_ms))
    : 0;
  const c = createCounter({ g0, ref: refPose(hold) });
  s.slice(from).forEach((x) => c.push(x));
  // Motion is the gyro turning OR the load accelerating: a weight stack only
  // travels, so a gyro-only test would file every stack set as empty. Measured
  // independently of the counter, so a counter firing on rest still FAILs.
  const moved = s.some((x) => gyroMag(x) >= MIN_GYRO
    || Math.abs(Math.hypot(x.ax, x.ay, x.az) - g0) >= 0.05);
  // The gyro's turning direction against the accelerometer: the counter
  // assumes the physical one. Re-run with it flipped; wherever the load came to
  // rest turned (a bar rolled and held), the wrong one leaves "up" off gravity.
  const flip = createCounter({ g0, ref: refPose(hold), upSign: 1 });
  s.slice(from).forEach((x) => flip.push(x));
  return { count: c.count, peak: c.peakSpeed, still: heldStill(hold), hz, moved, upErr: [c.upErr, flip.upErr] };
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('id', 5) + pad('exercise', 22) + pad('mode', 7) + pad('label', 6)
  + pad('live', 6) + pad('offline', 8) + pad('m/s', 7) + 'note');

const guided = [], legacy = [];
const upErr = [0, 0];
let empty = 0, emptyZero = 0;
for (const r of traces) {
  const g = recount(r);
  if (!g) continue;
  const label = Number(r.reps);
  const scorable = Number.isFinite(label) && label > 0;
  if (g.moved) { upErr[0] += g.upErr[0]; upErr[1] += g.upErr[1]; }
  if (!g.moved) {
    empty++;
    if (g.count === 0) emptyZero++;
  } else if (scorable) {
    (r.guided ? guided : legacy).push([r.predicted ?? g.count, label]);
  }
  console.log(pad(r.id, 5) + pad((r.exercise || '').trim().slice(0, 20), 22)
    + pad(r.guided ? 'guided' : 'legacy', 7) + pad(r.reps, 6)
    + pad(r.predicted ?? '—', 6) + pad(g.count, 8) + pad(g.peak.toFixed(2), 7)
    + (!g.moved ? 'no rep motion in window' : (g.still ? '' : 'resting level is a guess')));
}

const score = (name, v) => {
  if (!v.length) { console.log(`${name}: no rows yet`); return; }
  const exact = v.filter(([p, l]) => p === l).length;
  const w1 = v.filter(([p, l]) => Math.abs(p - l) <= 1).length;
  console.log(`${name}: ${v.length} sets — exact ${exact}, within 1 ${w1}, `
    + `MAE ${mean(v.map(([p, l]) => Math.abs(p - l))).toFixed(1)}`);
};
console.log('');
score('guided (the real scoreboard)', guided);
score('legacy capture (window unknown — not a fair score)', legacy);
console.log(`empty windows counted 0: ${emptyZero}/${empty}`
  + `${empty && emptyZero === empty ? '  PASS — the absolute floor holds' : empty ? '  FAIL' : ''}`);
console.log(`gyro direction: assumed ${upErr[0].toFixed(3)} vs flipped ${upErr[1].toFixed(3)} (lower agrees with gravity)`
  + (upErr[0] < upErr[1] / 3 ? '  CONFIRMED' : upErr[1] < upErr[0] / 3 ? '  WRONG — flip upSign' : '  not decided by this corpus'));
console.log('\nGate for making the counter authoritative: exact >= 95% over >= 100 guided sets.');
