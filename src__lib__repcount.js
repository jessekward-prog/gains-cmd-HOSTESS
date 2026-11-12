// Live rep counting from the WT901: the weight goes up, the weight comes down.
//
// One rule for every lift. Put the sensor on whatever moves — a weight stack,
// the bar, a dumbbell — and a rep is the load turning from going UP to going
// DOWN. Picking a bar up off the floor is one stretch of up with no turn, and
// putting it back is one stretch of down, so neither is a rep; the last rep
// counts the moment it turns at the top.
//
// The signal is the load's VERTICAL acceleration: the accelerometer reading
// along the "up" direction, minus its resting level. Which way is up, in the
// sensor's own frame, is tracked through the set by turning it with the gyro
// (and nudging it back toward the measured gravity whenever the load is not
// accelerating), so it reads the same strapped to a stack, rolling on a bar,
// or swinging through a curl. The sensor's own fused roll/pitch give "up"
// directly and are used whenever the sample carries them: on 2026-11-11 a
// barbell spun ~1300 deg/s in the hands at pick-up, the 50 Hz gyro
// integration came out of it pointing the wrong way, and with the bar never
// still mid-set it never recovered — gravity leaked in as a steady fall and
// three curl sets read 16, 0 and 5 against 20, 20, 15. With the device's
// angles they read 17, 19 and 9, and every non-curl set is unchanged. The
// rest of the curl error was the accelerometer's own offset (ACC_OFFSET), and
// a thigh bump at the bottom read as an impact (IMPACT_MS). Just the
// accelerometer's magnitude is not
// enough: on an arc like a curl, the swing's centripetal pull reads as a
// climb, and in simulation five curls counted as one.
//
// An earlier version also counted by TILT (the angle between gravity
// and the start pose), and on 2026-11-09 it failed both ways in real use: on a
// weight stack it saw nothing (a stack never tilts — a set read 0), and on a
// barbell the bar rolling in the hands at pick-up read as a curl rep and took
// over the count (a 10-rep set read 1). Up and down covers both and the curl.
//
// Why ABSOLUTE floors: the offline rule this replaced thresholded at a fraction
// of the signal's own spread, and on windows with no motion at all it amplified
// the noise floor into 19-21 reps. A still sensor has to count zero.

/** Angular velocity below this is a sensor at rest. deg/s. Used by the tuner. */
export const MIN_GYRO = 25;
/** What "hold still to calibrate" has to beat. deg/s. */
export const STILL_GYRO = 12;
/** And the load's acceleration, 95th percentile off the hold's median. g. */
export const STILL_G = 0.03;
/** Motion stopping for this long ends the set. ms. */
export const QUIET_MS = 5000;
/** How long the calibration hold lasts. ms. */
export const CALIBRATE_MS = 5000;
/** Vertical speed that counts as the load moving. m/s. */
export const MIN_SPEED = 0.06;
/** The climb before a turn has to cover this much to be a rep. m. */
export const MIN_TRAVEL = 0.05;

const G = 9.81;
const VEL_TAU = 10;      // s — the speed integrator's leak, so it cannot drift off
const BIAS_TAU = 10;     // s — how slowly the resting level is re-learned
const STILL_ACC = 0.004; // g — smoothed acceleration under this is a load at rest
const STILL_MS = 1500;   // held that long, the speed is known to be zero
const TURN_FRAC = 0.2;   // a turn back must reach this share of the climb's top speed
// Impacts: a weight stack bottoming out, a bar dropped. The hit lasts a few ms,
// far shorter than a sample, so one reading catches a spike of several g, or
// none does, and the gyro jolts with it — either way the speed and "up" go
// wrong. Lifting itself cannot make the reading jump this far from one
// sample to the next at 50 Hz; at slower rates smooth motion moves further
// between samples, so the threshold scales with the gap (a fast curl at the
// 10 Hz default would otherwise look like a hit). Run the sensor at 50 Hz.
const IMPACT_JUMP = 1.2;  // g between consecutive samples, at 50 Hz
const IMPACT_G = 2.5;     // g off rest, whatever came before
const IMPACT_MS = 120;    // the ringing after, ignored. At 200 a curl's bar brushing the thighs at the
                          // bottom swallowed the start of the next lift, and that rep never counted.

export const gyroMag = (s) => Math.hypot(s.gx || 0, s.gy || 0, s.gz || 0);
const accMag = (s) => Math.hypot(s.ax || 0, s.ay || 0, s.az || 0);
const unit = (v) => {
  const m = Math.hypot(v[0], v[1], v[2]);
  return m > 0 ? [v[0] / m, v[1] / m, v[2] / m] : null;
};
const UP_TAU = 2; // s — how fast the tracked "up" is pulled back to measured gravity

const D2R = Math.PI / 180;
const deviceUp = (s) => {
  const r = s.roll * D2R, p = s.pitch * D2R;
  return [-Math.sin(p), Math.cos(p) * Math.sin(r), Math.cos(p) * Math.cos(r)];
};

/**
 * The accelerometer's zero offset, g per axis. Lying still this sensor reads
 * 1.022 g z-up and 0.981 g z-down (both sessions, 9 and 11 Nov), x 1.004 / 0.986.
 * The calibration hold absorbs it in the start pose, but a curl swings z through
 * horizontal and down, and there it returned as about -0.035 g of phantom fall
 * for the whole set: curls counted 17, 10, 11, 17, 19, 9 of 20, 20, 20, 20, 20, 15.
 * Removed, the same sets read within one.
 * ponytail: measured for the one WT901 there is. A second sensor, or a
 * re-calibration on the device (FF AA 01 01 00, lying flat), invalidates it;
 * the upgrade is learning it from rest samples in several orientations.
 */
export const ACC_OFFSET = [0.009, -0.0014, 0.0206];
const cal = (s) => ({ ...s, ax: (s.ax || 0) - ACC_OFFSET[0], ay: (s.ay || 0) - ACC_OFFSET[1], az: (s.az || 0) - ACC_OFFSET[2] });

/** Mean gravity direction over the hold, as a unit vector: "up" at the start. */
export function refPose(samples) {
  if (!samples || !samples.length) return null;
  return unit(samples.map(cal).reduce((a, s) => [a[0] + (s.ax || 0), a[1] + (s.ay || 0), a[2] + (s.az || 0)], [0, 0, 0]));
}

/** u turned by angle |w|*k about w (Rodrigues). */
function rotate(u, w, k) {
  const wm = Math.hypot(w[0], w[1], w[2]);
  const th = wm * k;
  if (!wm || !th) return u;
  const n = [w[0] / wm, w[1] / wm, w[2] / wm];
  const c = Math.cos(th), sn = Math.sin(th);
  const d = n[0] * u[0] + n[1] * u[1] + n[2] * u[2];
  const x = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return [0, 1, 2].map((i) => u[i] * c + x[i] * sn + n[i] * d * (1 - c));
}

/**
 * Tracks which way is up in the sensor's frame. Up is fixed in the room, so as
 * the sensor turns at w, up turns the other way in the sensor's frame:
 * du/dt = -(w x u). That sign is physics, for any IMU whose gyro and
 * accelerometer share one right-handed frame — the WT901's own angle fusion
 * depends on that being so. It is not confirmed against this device's data
 * yet; `err` (how far up disagrees with measured gravity while the load is
 * still) is what rep-tuner.mjs compares across `sign` to confirm it.
 *
 * While the load is still, measured gravity IS up, so the estimate is pulled
 * toward it; "still" means near the resting level AND barely turning, since
 * mid-swing the centripetal and tangential pulls can sum to about 1 g pointing
 * anywhere.
 */
function upTracker(start, sign = -1) {
  let u = start ? [...start] : null;
  let err = 0, n = 0;
  let wPrev = null;
  const past = [];          // up over the last few samples, for rewind()
  return {
    get up() { return u; },
    get err() { return n ? err / n : 0; },
    /** Back to up as it was a few samples ago, before a hit's gyro jolt. */
    rewind() { if (past.length) u = [...past[0]]; wPrev = null; },
    push(s, dt, level) {
      const ah = unit([s.ax || 0, s.ay || 0, s.az || 0]);
      if (!u) { u = ah; return; }
      const wNow = [(s.gx || 0) * Math.PI / 180, (s.gy || 0) * Math.PI / 180, (s.gz || 0) * Math.PI / 180];
      // The rate over the step is the mean of its two ends, and the turn is
      // applied exactly (Rodrigues), not as a small-angle step: at the WT901's
      // 10 Hz default a fast curl turns ~40 deg between samples, and the
      // straight-line step lost most curls in simulation.
      const w = wPrev ? wNow.map((x, i) => (x + wPrev[i]) / 2) : wNow;
      wPrev = wNow;
      let v = rotate(u, w, sign * dt);
      if (ah && Math.abs(accMag(s) - level) < 0.03 && gyroMag(s) < 30) {
        err += (u[0] - ah[0]) ** 2 + (u[1] - ah[1]) ** 2 + (u[2] - ah[2]) ** 2;
        n++;
        const c = dt / (UP_TAU + dt);
        v = [v[0] + c * (ah[0] - v[0]), v[1] + c * (ah[1] - v[1]), v[2] + c * (ah[2] - v[2])];
      }
      u = unit(v) || u;
      past.push(u);
      if (past.length > 4) past.shift();
    },
  };
}

/**
 * Resting accelerometer magnitude over the hold, in g. The WT901 reads about
 * 1.02 g lying still, and the counter integrates the difference from rest, so a
 * 0.02 g offset left in would read as a steady 0.2 m/s^2 climb.
 */
export function restLevel(samples) {
  if (!samples || !samples.length) return null;
  return samples.reduce((a, s) => a + accMag(cal(s)), 0) / samples.length;
}

/**
 * Was the load held still enough to trust its resting level? 95th
 * percentiles, so one twitch in five seconds is forgiven but a load still
 * moving is not. Both the gyro and the acceleration: a weight stack being
 * lifted barely turns, so the gyro alone would pass it.
 */
export function heldStill(samples, limit = STILL_GYRO) {
  if (!samples || samples.length < 10) return false;
  const p95 = (v) => v.sort((a, b) => a - b)[Math.floor(v.length * 0.95)];
  if (p95(samples.map(gyroMag)) >= limit) return false;
  const m = samples.map(accMag).sort((a, b) => a - b);
  const med = m[Math.floor(m.length / 2)];
  return p95(m.map((x) => Math.abs(x - med))) < STILL_G;
}

/**
 * Streaming counter. `g0` is the resting level from the hold and `ref` the
 * direction of up at the start (refPose of the hold); without them both are
 * learned from the stream.
 *
 * Acceleration is integrated to a vertical speed with a leak and a slow bias
 * tracker, so it cannot drift off, and snapped to zero whenever the load has
 * been genuinely still — which also clears the phantom drift the leak leaves
 * while a stack hangs part-way up between reps. The speed then has a direction:
 * up, down, or not yet decided. Up turning to down, after a climb of at least
 * MIN_TRAVEL, is a rep. The other gates are against noise, not short reps: the
 * turn has to reach TURN_FRAC of the climb's top speed. Partial reps count as
 * reps; telling them apart is a later job.
 */
export function createCounter({ g0 = null, ref = null, upSign = -1, minRepMs = 500, minSpeed = MIN_SPEED, minTravel = MIN_TRAVEL } = {}) {
  let count = 0;
  const marks = [];          // when each rep was counted, for the live trace
  let lastRepAt = -Infinity;
  let lastMoveAt = null;

  let prevT = null;
  let elapsed = 0;           // s since the first sample
  const level = g0 == null ? 1 : g0;
  let bias = g0 == null ? null : 0;  // residual resting level, g
  let vel = 0;               // vertical speed, m/s, up positive
  let vPeak = 0;
  let accAvg = 0;            // acceleration smoothed over ~0.3 s, g
  let stillSince = null;
  let prevMag = null;
  let impactUntil = -Infinity;
  let impacts = 0;
  let dir = 0;               // current direction: 1 up, -1 down, 0 not yet
  let travel = 0;            // distance covered in the current direction, m
  let phasePeak = 0;         // top speed in the current direction, m/s
  const upT = upTracker(ref, upSign);

  return {
    get count() { return count; },
    /** Vertical speed, m/s: the decision signal. */
    get speed() { return vel; },
    get peakSpeed() { return vPeak; },
    /** Impacts seen and ignored (a stack bottoming out, a bar set down hard). */
    get impacts() { return impacts; },
    /** How far tracked up disagreed with gravity at rest (mean squared). */
    get upErr() { return upT.err; },
    /** The decision signal scaled to about -1..1, for the live trace. */
    get trace() { return vel / Math.max(vPeak, 0.3); },
    /** Timestamps of counted reps (the last 64). */
    get marks() { return marks; },
    /** ms since the load last moved, or null if it never has. */
    quietFor(now) { return lastMoveAt == null ? null : now - lastMoveAt; },
    /** True once motion has stopped long enough to call the set over. */
    setEnded(now, quietMs = QUIET_MS) {
      return count > 0 && lastMoveAt != null && now - lastMoveAt >= quietMs;
    },

    push(raw) {
      const s = cal(raw);
      const dt = prevT == null ? 0 : Math.min(0.2, Math.max(0, (s.t - prevT) / 1000));
      prevT = s.t;
      elapsed += dt;

      // An impact means the load just stopped against something. Ignore the
      // hit and its ringing, for speed and for "up" alike, and come out of it
      // stopped — which is what the load is.
      const m = accMag(s);
      const dm = prevMag == null ? 0 : m - prevMag;
      prevMag = m;
      if (Math.abs(dm) > IMPACT_JUMP * Math.max(1, dt * 50) || Math.abs(m - level) > IMPACT_G) {
        // A hit that fell between samples is caught a reading or two late, on
        // its ringing — by which time the gyro's jolt has already turned "up".
        // Take up back to where it was before the hit.
        if (s.t >= impactUntil) { impacts++; upT.rewind(); }
        impactUntil = s.t + IMPACT_MS;
      }
      if (s.t < impactUntil) {
        vel = 0;
        accAvg = 0;
        stillSince = null;
        return count;
      }

      upT.push(s, dt, level);
      const u = s.roll != null ? deviceUp(s) : upT.up;
      const lin = (u ? (s.ax || 0) * u[0] + (s.ay || 0) * u[1] + (s.az || 0) * u[2] : accMag(s)) - level;
      // With no measured resting level, start from a running mean so one noisy
      // first sample is not taken as the level for the next ten seconds.
      if (bias == null) bias = lin;
      const tau = g0 == null ? Math.min(BIAS_TAU, elapsed) : BIAS_TAU;
      if (dt > 0) bias += (lin - bias) * (dt / (tau + dt));
      const a = lin - bias;
      vel = vel * Math.exp(-dt / VEL_TAU) + a * G * dt;

      // A load at rest has zero speed, whatever the integrator thinks.
      accAvg += (a - accAvg) * (dt / (0.3 + dt));
      if (Math.abs(accAvg) < STILL_ACC && gyroMag(s) < STILL_GYRO) {
        if (stillSince == null) stillSince = s.t;
        else if (s.t - stillSince >= STILL_MS) {
          vel = 0;
          // Quiet since it went still, not since the snap.
          if (lastMoveAt != null && lastMoveAt > stillSince) lastMoveAt = stillSince;
        }
      } else stillSince = null;

      if (Math.abs(vel) > vPeak) vPeak = Math.abs(vel);
      if (Math.abs(vel) > minSpeed) lastMoveAt = s.t;

      const turn = Math.max(minSpeed, TURN_FRAC * phasePeak);
      const d = dir && vel * dir < -turn ? -dir
        : !dir ? (vel > minSpeed ? 1 : vel < -minSpeed ? -1 : 0)
          : 0;
      if (d && d !== dir) {
        // Up turning to down: one rep.
        if (dir === 1 && d === -1 && travel >= minTravel && s.t - lastRepAt >= minRepMs) {
          count++;
          lastRepAt = s.t;
          marks.push(s.t);
          if (marks.length > 64) marks.shift();
        }
        dir = d;
        travel = 0;
        phasePeak = 0;
      }
      if (dir) {
        travel += Math.max(0, vel * dir) * dt;
        if (vel * dir > phasePeak) phasePeak = vel * dir;
      }
      return count;
    },
  };
}
