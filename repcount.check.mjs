// Self-check for the live rep counter — `node repcount.check.mjs`.
// One rule: a rep is the load turning from up to down. The cases that matter
// are the ones that broke earlier counters in real use — a still sensor must
// count zero, a weight stack must count (the tilt counter read 0), and a bar
// rolling as it is picked up must not (the tilt counter read 1 for 10).
import assert from 'node:assert/strict';
import { createCounter, heldStill, gyroMag, restLevel, refPose, CALIBRATE_MS,
  MIN_GYRO, STILL_GYRO, MIN_TRAVEL, MIN_SPEED, ACC_OFFSET } from './src__lib__repcount.js';

const HZ = 50, DT = 1000 / HZ;
// Seeded, so a failure here is a real regression and reproduces every run —
// a check that fails one run in thirty gets ignored. rep-tuner/stat runs over
// many seeds are where the failure *rates* are measured.
let seed = 0x9e3779b9;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);
const ref = null; // the counter has no reference pose any more; kept so call sites read the same
// The synthetic samples are a perfect sensor; the counter removes the real
// one's zero offset, so put it back before feeding it.
const sensor = (s) => ({ ...s, ax: (s.ax || 0) + ACC_OFFSET[0], ay: (s.ay || 0) + ACC_OFFSET[1], az: (s.az || 0) + ACC_OFFSET[2] });
const run = (samples, _ref, opts) => {
  const c = createCounter(opts);
  samples.forEach((s) => c.push(sensor(s)));
  return c;
};
const still = ({ ms = 5000, t0 = 0, gyro = 0.5, g0 = 1.02, noise = 0.01 }) => {
  const out = [];
  for (let i = 0; i <= Math.round(ms / DT); i++) {
    const j = () => (Math.random() - 0.5) * 2 * noise;
    out.push({ t: t0 + i * DT, ax: j(), ay: j(), az: g0 + j(), gx: gyro, gy: gyro, gz: gyro });
  }
  return out;
};

/**
 * A dumbbell curl from the arm's own kinematics: the forearm (`arm` m, elbow
 * fixed) swings from hanging to `deg` and back, the sensor on the wrist
 * rotating with it. The measured specific force is gravity plus the wrist's
 * real acceleration (tangential AND centripetal), rotated into the sensor's
 * frame — so this is the tilt, the arc and the rise together, not a picture
 * of any one of them. Up and down has to count it from the rise alone.
 */
function curlSet({ reps, deg = 130, arm = 0.32, up = 900, down = 1300, pause = 300, noise = 0.01, lead = 1000 }) {
  const ss = (x) => x * x * (3 - 2 * x);
  const per = up + down + pause, end = lead + reps * per;
  const th = (t) => { // forearm angle from hanging, radians
    if (t < lead || t >= end) return 0;
    const k = (t - lead) % per;
    const d = (deg * Math.PI) / 180;
    return k < up ? d * ss(k / up) : k < up + down ? d * (1 - ss((k - up) / down)) : 0;
  };
  // wrist position in the vertical plane: x forward, y up; elbow at origin
  const pos = (t) => [arm * Math.sin(th(t)), -arm * Math.cos(th(t))];
  const out = [];
  for (let t = 0; t < end + 7000; t += DT) {
    const h = 0.005, p0 = pos(t - h * 1000), p1 = pos(t), p2 = pos(t + h * 1000);
    const ax = (p2[0] - 2 * p1[0] + p0[0]) / h ** 2 / 9.81, ay = (p2[1] - 2 * p1[1] + p0[1]) / h ** 2 / 9.81;
    const f = [ax, ay + 1.02];             // specific force, world frame, g
    const a = th(t), w = ((th(t + 10) - th(t - 10)) / 0.02) * (180 / Math.PI);
    const j = () => (Math.random() - 0.5) * 2 * noise;
    // into the sensor's frame, which turns with the forearm
    out.push({ t, ax: j(), ay: f[0] * Math.cos(a) + f[1] * Math.sin(a) + j(), az: -f[0] * Math.sin(a) + f[1] * Math.cos(a) + j(), gx: w, gy: 0, gz: 0 });
  }
  return out;
}

// gyroMag, restLevel, and heldStill's percentile behaviour.
{
  near(gyroMag({ gx: 3, gy: 4, gz: 0 }), 5);
  near(restLevel([sensor({ az: 1.02 }), sensor({ az: 1.0 })]), 1.01);
  assert.equal(restLevel([]), null);
  assert.ok(heldStill(still({ ms: 5000 })), 'a still hold is still');
  // One twitch in five seconds is forgiven — it is the 95th percentile, not max.
  const hold = still({ ms: 5000 });
  hold[120] = { ...hold[120], gx: 200, az: 1.5 };
  assert.ok(heldStill(hold), 'a single twitch should not fail calibration');
  // Turning through the hold fails it.
  assert.ok(!heldStill(still({ ms: 5000 }).map((s, i) => (i > 125 ? { ...s, gx: 40 } : s))), 'sustained turning fails calibration');
  // So does a load moving with no turning at all — a stack being lifted.
  assert.ok(!heldStill(stackSet({ reps: 2, lead: 0, tail: 0 }).slice(0, 250)), 'a stack moving is not a hold');
  assert.ok(!heldStill(still({ ms: 100 })), 'too few samples is not a hold');
}

// THE case that invalidated the old baseline: a still sensor counts zero.
// The old cycles() rule reported 19-21 reps on windows exactly like this.
{
  assert.equal(run(still({ ms: 120_000 }), ref, { g0: 1.02 }).count, 0, 'still sensor must count 0');
  assert.equal(run(still({ ms: 120_000, gyro: 4, noise: 0.02 }), ref, { g0: 1.02 }).count, 0, 'rest noise must count 0');
}

// A curl counts on the rise alone — tilt, arc and all.
{
  const g0 = 1.02;
  for (const reps of [1, 5, 10, 15]) assert.equal(run(curlSet({ reps }), ref, { g0 }).count, reps, `${reps} curls`);
  assert.equal(run(curlSet({ reps: 8, up: 1500, down: 2500 }), ref, { g0 }).count, 8, 'slow curls');
  assert.equal(run(curlSet({ reps: 8, up: 500, down: 600, pause: 100 }), ref, { g0 }).count, 8, 'fast curls');
  assert.equal(run(curlSet({ reps: 10, noise: 0.03 }), ref, { g0 }).count, 10, 'noisy curls');
  // A half curl still rises well past MIN_TRAVEL, so it counts.
  assert.equal(run(curlSet({ reps: 6, deg: 70 }), ref, { g0 }).count, 6, 'half-range curls');
  // The gyro sign is physics, not a guess — but it is what rep-tuner checks on
  // real data, by upErr: with the wrong sign, up drifts from gravity wherever
  // the load comes to rest turned (a bar rolled and held). It must tell them apart.
  const held = barbellSet({ reps: 4, roll: 70 });
  const right = run(held, ref, { g0, ref: [0, 0, 1] }).upErr, wrong = run(held, ref, { g0, ref: [0, 0, 1], upSign: 1 }).upErr;
  assert.ok(wrong > 10 * right, `upErr separates the signs (${right.toFixed(4)} vs ${wrong.toFixed(4)})`);
  // Given the hold's up, as the live counter is.
  assert.equal(run(curlSet({ reps: 8 }), ref, { g0, ref: [0, 0, 1] }).count, 8, 'curls from a known start');
}

// Turning in place, with no travel, is not a rep however far it turns. Only
// the magnitude is read, and a pure rotation leaves it at rest.
{
  const out = [];
  for (let t = 0; t < 20_000; t += DT) {
    // 0 -> 90 deg -> 0 every 2 s, with the gyro reading that turn honestly
    const a = (Math.PI / 2) * (1 - Math.cos((2 * Math.PI * t) / 2000)) / 2;
    const w = (90 / 2) * Math.sin((2 * Math.PI * t) / 2000) * ((2 * Math.PI) / 2);
    out.push({ t, ax: 0, ay: 1.02 * Math.sin(a), az: 1.02 * Math.cos(a), gx: w, gy: 0, gz: 0 });
  }
  assert.equal(run(out, ref, { g0: 1.02 }).count, 0, 'rotation with no travel is not a rep');
}

// A set that never started cannot end, however long it stays quiet.
{
  const c = createCounter({ g0: 1.02 });
  still({ ms: 30_000 }).forEach((s) => c.push(sensor(s)));
  assert.ok(!c.setEnded(30_000), 'no reps means no set to end');
  assert.equal(c.quietFor(30_000), null, 'never moved, so never quiet-since');
}

// The floors: well above a resting sensor, well below any real rep.
{
  assert.ok(MIN_TRAVEL >= 0.03 && MIN_TRAVEL <= 0.1, 'travel floor: a few cm');
  assert.ok(MIN_SPEED > 0.02 && MIN_SPEED < 0.15, 'speed floor between rest and reps');
  assert.ok(STILL_GYRO < MIN_GYRO, 'calibration is stricter than motion');
}

/**
 * A weight stack: the sensor travels `dist` metres straight up and back, never
 * tilting and never turning. This is what counted 0 live on 2026-11-09 — the
 * rotation channel cannot see it at all. `g0` is the device's resting reading
 * (the real WT901 sits at about 1.02 g); `clank` rings the stack as it lands.
 */
function stackSet({ reps, dist = 0.4, up = 1000, top = 300, down = 1800, bottom = 500, hz = HZ,
  g0 = 1.02, noise = 0.01, clank = 0, lead = 1000, tail = 7000 }) {
  const dt = 1000 / hz, per = up + top + down + bottom, end = lead + reps * per;
  const ss = (x) => x * x * (3 - 2 * x);
  const pos = (t) => {
    if (t < lead || t >= end) return 0;
    const k = (t - lead) % per;
    if (k < up) return dist * ss(k / up);
    if (k < up + top) return dist;
    if (k < up + top + down) return dist * (1 - ss((k - up - top) / down));
    return 0;
  };
  const out = [];
  for (let t = 0; t < end + tail; t += dt) {
    const acc = (pos(t + 5) - 2 * pos(t) + pos(t - 5)) / 0.005 ** 2 / 9.81;
    const j = () => (Math.random() - 0.5) * 2 * noise;
    const k = (t - lead) % per - (up + top + down);
    const ring = clank && t >= lead && t < end && k >= 0 && k < 120
      ? clank * Math.sin((k / 120) * 6 * Math.PI) * Math.exp(-k / 40) : 0;
    out.push({ t, ax: j(), ay: j(), az: g0 + acc + ring + j(), gx: j() * 50, gy: 0, gz: 0 });
  }
  return out;
}

// A weight stack counts.
{
  const ref = [0, 0, 1];
  const g0 = 1.02;
  for (const reps of [1, 6, 12]) {
    assert.equal(run(stackSet({ reps }), ref, { g0 }).count, reps, `${reps} stack reps`);
  }
  assert.equal(run(stackSet({ reps: 10, hz: 10 }), ref, { g0 }).count, 10, 'stack at the 10 Hz default rate');
  assert.equal(run(stackSet({ reps: 10, dist: 0.2, up: 1500, down: 3000 }), ref, { g0 }).count, 10, 'short, slow stack reps');
  assert.equal(run(stackSet({ reps: 15, up: 600, top: 0, down: 700, bottom: 100 }), ref, { g0 }).count, 15, 'fast stack reps');
  assert.equal(run(stackSet({ reps: 10, clank: 1.5 }), ref, { g0 }).count, 10, 'the stack clanking down adds no reps');
  // Without a measured resting level it learns one rather than reading the
  // 0.02 g offset as a climb.
  assert.equal(run(stackSet({ reps: 8 }), ref).count, 8, 'no g0 given');
  // And the set ends when the stack stops.
  const s = stackSet({ reps: 6 });
  const c = run(s, ref, { g0 });
  assert.ok(c.setEnded(s.at(-1).t), 'a stack set ends when the stack stops');
}
// Settling onto the seat jolts the stack a centimetre down before the set. A
// rep is up-turning-to-down, so a dip before the first lift adds nothing.
{
  const set = stackSet({ reps: 8, lead: 1500 });
  // A 1.5 cm drop and recovery in the first second: down, then back up.
  const jolt = (t) => (t > 0 && t < 1000 ? -0.015 * Math.sin((Math.PI * t) / 1000) ** 2 : 0);
  const acc = (t) => (jolt(t + 5) - 2 * jolt(t) + jolt(t - 5)) / 0.005 ** 2 / 9.81;
  const s = set.map((x) => ({ ...x, az: x.az + acc(x.t) }));
  assert.equal(run(s, [0, 0, 1], { g0: 1.02 }).count, 8, 'a settling jolt does not cost the last rep');
}
/**
 * A stack that never goes back to its pin mid-set: lifted off once, then
 * worked between `low` and `high` metres above the pin with no pause at the
 * bottom (touch-and-go), and set down only at the end. Reps are counted at the
 * turnaround, not by returning to where the set started, so this must count
 * exactly the same as a full-range set.
 */
function hoverSet({ reps, low, high = 0.45, up = 1000, top = 200, down = 1500, hz = HZ, noise = 0.01 }) {
  const ss = (x) => x * x * (3 - 2 * x), lead = 1000, lift = 1000, per = up + top + down, land = 1200;
  const end = lead + lift + reps * per;
  const pos = (t) => {
    if (t < lead) return 0;
    if (t < lead + lift) return low * ss((t - lead) / lift);
    if (t < end) {
      const r = (t - lead - lift) % per;
      if (r < up) return low + (high - low) * ss(r / up);
      if (r < up + top) return high;
      return high - (high - low) * ss((r - up - top) / down);
    }
    const q = t - end;
    return q < land ? low * (1 - ss(q / land)) : 0;
  };
  const out = [];
  for (let t = 0; t < end + land + 7000; t += 1000 / hz) {
    const acc = (pos(t + 5) - 2 * pos(t) + pos(t - 5)) / 0.005 ** 2 / 9.81;
    const j = () => (Math.random() - 0.5) * 2 * noise;
    out.push({ t, ax: j(), ay: j(), az: 1.02 + acc + j(), gx: j() * 50, gy: 0, gz: 0 });
  }
  return out;
}
{
  const ref = [0, 0, 1], g0 = 1.02;
  assert.equal(run(hoverSet({ reps: 10, low: 0.08 }), ref, { g0 }).count, 10, 'touch-and-go, 8 cm off the pin');
  assert.equal(run(hoverSet({ reps: 10, low: 0.15 }), ref, { g0 }).count, 10, 'touch-and-go, 15 cm off the pin');
  assert.equal(run(hoverSet({ reps: 10, low: 0.30 }), ref, { g0 }).count, 10, 'top-half partials, never near the pin');
  assert.equal(run(hoverSet({ reps: 12, low: 0.1, up: 600, top: 0, down: 700 }), ref, { g0 }).count, 12, 'fast touch-and-go');
  const s = hoverSet({ reps: 8, low: 0.1 });
  assert.ok(run(s, ref, { g0 }).setEnded(s.at(-1).t), 'set down at the end, the set ends');
}

/**
 * A barbell with the sensor on the bar: picked up off the floor to standing
 * (`pick` m), reps from standing up to `rom` above it, put back on the floor.
 * The bar rolls `roll` degrees in the hands on the way up and back on the way
 * down — which the rotation channel reads as a curl rep. Picking up and putting
 * down are one stretch of travel each, so neither is a rep: a rep is the bar
 * turning from up to down at the top.
 */
function barbellSet({ reps, pick = 0.55, rom = 0.35, roll = 70, stand = 2000, standEnd = 1000 }) {
  const ss = (x) => x * x * (3 - 2 * x), c01 = (x) => Math.max(0, Math.min(1, x));
  const lead = 1500, pickMs = 800, putMs = 1000, up = 800, top = 150, down = 1200, bottom = 200, per = up + top + down + bottom;
  const t1 = lead + pickMs, t2 = t1 + stand, t3 = t2 + reps * per - bottom, t4 = t3 + standEnd, t5 = t4 + putMs;
  const pos = (t) => {
    if (t < lead) return 0;
    if (t < t1) return pick * ss((t - lead) / pickMs);
    if (t < t2) return pick;
    if (t < t3) {
      const r = (t - t2) % per;
      if (r < up) return pick + rom * ss(r / up);
      if (r < up + top) return pick + rom;
      if (r < up + top + down) return pick + rom * (1 - ss((r - up - top) / down));
      return pick;
    }
    if (t < t4) return pick;
    return pick * (1 - ss(c01((t - t4) / putMs)));
  };
  const ang = (t) => roll * (ss(c01((t - lead) / 500)) - ss(c01((t - t4) / 500)));
  const out = [];
  for (let t = 0; t < t5 + 7000; t += DT) {
    const lin = (pos(t + 5) - 2 * pos(t) + pos(t - 5)) / 0.005 ** 2 / 9.81;
    const j = () => (Math.random() - 0.5) * 0.02;
    const a = (ang(t) * Math.PI) / 180, w = (ang(t + 10) - ang(t - 10)) / 0.02;
    const ay = j(), az = 1.02 + lin + j();
    // A world-fixed force seen from a sensor turned by a about x (rate +w):
    // the transpose of the rotation, so the gyro and the picture agree.
    out.push({ t, ax: j(), ay: ay * Math.cos(a) + az * Math.sin(a), az: -ay * Math.sin(a) + az * Math.cos(a), gx: w + j() * 50, gy: 0, gz: 0 });
  }
  return out;
}
{
  const ref = [0, 0, 1], g0 = 1.02;
  for (const roll of [0, 40, 90]) {
    assert.equal(run(barbellSet({ reps: 10, roll }), ref, { g0 }).count, 10, `barbell, bar rolling ${roll} deg on pick-up and put-down`);
  }
  assert.equal(run(barbellSet({ reps: 10, stand: 0, standEnd: 0 }), ref, { g0 }).count, 10, 'barbell, no pause at standing');
  // The device's fused angles are "up" when present: with the gyro useless
  // (as after a 1300 deg/s spin on 11 Nov), the roll alone must carry the set.
  const blind = barbellSet({ reps: 10, roll: 90 }).map((x) => {
    const a = Math.atan2(x.ay, x.az) * 180 / Math.PI;
    return { ...x, gx: 0, roll: a, pitch: 0 };
  });
  assert.equal(run(blind, ref, { g0 }).count, 10, 'barbell, up from the device angles with no gyro');
  // Picking the bar up is not a rep, live: nothing counted before the first top.
  const s = barbellSet({ reps: 3, roll: 90 });
  const c = createCounter({ g0 });
  s.filter((x) => x.t < 1500 + 800 + 2000).forEach((x) => c.push(sensor(x)));
  assert.equal(c.count, 0, 'picked up and standing: still 0');
}

// Stack lowered fast and SLAMMED onto the pin each rep (lands at `vLand` m/s, stops in one instant).
// The sensor sees: the stopping impulse caught by 0-2x (a 20 ms sample either misses the spike or
// catches it whole, or the accelerometer rings), then ±`ring` g ringing for ~120 ms, and a gyro jolt.
function slamSet({ reps = 10, dist = 0.4, up = 1000, top = 200, down = 700, bottom = 600, vLand = 0.6,
  ring = 2, jolt = 300, hz = 50, noise = 0.01, lead = 1500, tail = 7000, seedFn = Math.random }) {
  const dt = 1000 / hz, per = up + top + down + bottom, end = lead + reps * per;
  const ss = (x) => x * x * (3 - 2 * x);
  // down phase: ease in from rest, still moving at vLand when it hits — position profile with that end speed
  const downPos = (x) => { // x in 0..1, returns fraction of dist remaining
    const T = down / 1000, v1 = vLand / dist * T; // end slope in normalised units
    // cubic p(x)=1 + a x^2 + b x^3 with p(1)=0, p'(1)=-v1
    const b = 2 - v1, a = -3 + v1; return 1 + a * x * x + b * x * x * x; };
  const pos = (t) => {
    if (t < lead || t >= end) return 0;
    const k = (t - lead) % per;
    if (k < up) return dist * ss(k / up);
    if (k < up + top) return dist;
    if (k < up + top + down) return dist * downPos((k - up - top) / down);
    return 0;
  };
  const out = [];
  let lastImpactRep = -1;
  for (let t = 0; t < end + tail; t += dt) {
    const k = (t - lead) % per, rep = Math.floor((t - lead) / per);
    const inRep = t >= lead && t < end;
    // smooth part of the motion (excluding the impact instant)
    const h = 5, safe = (x) => pos(x);
    let acc = (safe(t + h) - 2 * safe(t) + safe(t - h)) / (h / 1000) ** 2 / 9.81;
    const sinceImpact = inRep ? k - (up + top + down) : -1;
    if (inRep && sinceImpact >= 0 && sinceImpact < dt) acc = 0; // the finite difference straddles the impact; replaced below
    let ax = (seedFn() - 0.5) * 2 * noise, ay = (seedFn() - 0.5) * 2 * noise, az = 1.02 + acc + (seedFn() - 0.5) * 2 * noise;
    let gx = (seedFn() - 0.5), gy = 0, gz = 0;
    if (inRep && sinceImpact >= 0 && sinceImpact < 150) {
      if (rep !== lastImpactRep) { // the first sample after landing carries the stopping impulse, caught by 0..2x
        lastImpactRep = rep;
        az += seedFn() * 2 * (vLand / 9.81) / (dt / 1000);
      }
      const r = ring * Math.exp(-sinceImpact / 40) * Math.sin(sinceImpact / 150 * 9 * Math.PI);
      az += r; ax += r * 0.4 * (seedFn() - 0.5); ay += r * 0.4 * (seedFn() - 0.5);
      const g = jolt * Math.exp(-sinceImpact / 30);
      gx += g * (seedFn() - 0.5) * 2; gy += g * (seedFn() - 0.5) * 2; gz += g * (seedFn() - 0.5) * 2;
    }
    out.push({ t, ax, ay, az, gx, gy, gz });
  }
  return out;
}
{
  const ref = [0, 0, 1], g0 = 1.02;
  assert.equal(run(slamSet({ vLand: 0.05, ring: 0, jolt: 0 }), ref, { g0, ref }).count, 10, 'stack set down gently');
  const c = run(slamSet({}), ref, { g0, ref });
  assert.equal(c.count, 10, 'stack bottoming out every rep');
  assert.ok(c.impacts >= 9, `impacts seen (${c.impacts})`);
  assert.equal(run(slamSet({ bottom: 150 }), ref, { g0, ref }).count, 10, 'bottoming out, touch-and-go');
  assert.equal(run(slamSet({ vLand: 1.0, ring: 4, jolt: 600 }), ref, { g0, ref }).count, 10, 'slammed hard');
  // A still sensor has no impacts to find.
  assert.equal(run(still({ ms: 60_000 }), ref, { g0 }).impacts, 0, 'no impacts at rest');
}

// A resting stack counts nothing, even with a resting level a little off.
{
  const rest = stackSet({ reps: 0, tail: 120_000 });
  assert.equal(run(rest, [0, 0, 1], { g0: 1.02 }).count, 0, 'resting stack counts 0');
  assert.equal(run(rest, [0, 0, 1], { g0: 1.0 }).count, 0, 'resting stack with a 0.02 g level error counts 0');
}

// Superset / drop-set chaining: 5 s of stillness ends set A (e.g. leg press),
// those same 5 quiet seconds seed set B's baseline (calves) with no new hold,
// and 5 more seconds of stillness ends the round.
{
  const setA = stackSet({ reps: 10, dist: 0.38, tail: 6000 }).map(sensor);
  const cA = createCounter({ g0: 1.02, ref: [0, 0, 1] });
  let switchAt = null;
  for (const s of setA) {
    cA.push(s);
    if (cA.setEnded(s.t)) { switchAt = s.t; break; }
  }
  assert.ok(switchAt !== null, 'set A ends after 5 s of stillness');
  assert.equal(cA.count, 10, 'set A counted 10 leg-press reps');
  const quietWindow = setA.filter((s) => s.t >= switchAt - CALIBRATE_MS && s.t <= switchAt);
  const cB = createCounter({ g0: restLevel(quietWindow), ref: refPose(quietWindow) });
  const setB = stackSet({ reps: 15, dist: 0.14, up: 700, top: 200, down: 900, bottom: 200, tail: 6000 })
    .map((s) => sensor({ ...s, t: s.t + switchAt + DT }));
  let restAt = null;
  for (const s of setB) {
    cB.push(s);
    if (cB.setEnded(s.t)) { restAt = s.t; break; }
  }
  assert.ok(restAt !== null, 'set B ends after 5 more seconds of stillness');
  assert.equal(cB.count, 15, 'set B counted 15 calf reps from the 5 s quiet baseline');
}
console.log('repcount.check.mjs ok');
