// Self-check for the WT901BLE decoder — `node witmotion.check.mjs`.
// BLE hands over notifications, not frames, so the cases that matter are the
// ones where a frame is split, doubled up, or preceded by junk.
import assert from 'node:assert/strict';
import { createDecoder, encodeFrame, magnitude, encodeSamples, decodeSamples, setStartOffset, spreadTimes, FRAME_MS } from './src__lib__witmotion.js';

const ACC = 16 / 32768, GYR = 2000 / 32768, ANG = 180 / 32768;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);
const packed = (v) => encodeFrame(0x61, v);
const RAW = [1000, -2000, 16384, 300, -300, 0, 8192, -4096, 16384];

// One whole packed frame in one notification.
{
  const d = createDecoder();
  const [s] = d.push(packed(RAW), 42);
  assert.equal(s.t, 42);
  near(s.ax, 1000 * ACC); near(s.ay, -2000 * ACC); near(s.az, 16384 * ACC);
  near(s.gx, 300 * GYR); near(s.gz, 0);
  near(s.roll, 8192 * ANG); near(s.pitch, -4096 * ANG); near(s.yaw, 16384 * ANG);
}

// Split across two notifications — the half-frame has to survive the gap.
{
  const d = createDecoder();
  const f = packed(RAW);
  assert.deepEqual(d.push(f.slice(0, 7)), []);
  const out = d.push(f.slice(7));
  assert.equal(out.length, 1);
  near(out[0].az, 16384 * ACC);
}

// Two frames in one notification.
{
  const d = createDecoder();
  const f = packed(RAW);
  const both = new Uint8Array(40);
  both.set(f); both.set(f, 20);
  assert.equal(d.push(both).length, 2);
}

// Junk before the header is skipped, and counted.
{
  const d = createDecoder();
  const f = packed(RAW);
  const noisy = new Uint8Array(f.length + 3);
  noisy.set([0x12, 0x34, 0x56]); noisy.set(f, 3);
  assert.equal(d.push(noisy).length, 1);
  assert.equal(d.stats().skipped, 3);
}

// A 0x55 inside a payload is a false header: the type byte after it is not a
// frame type, so the decoder steps past it instead of swallowing real bytes.
{
  const d = createDecoder();
  const f = packed(RAW);
  const noisy = new Uint8Array(f.length + 2);
  noisy.set([0x55, 0x01]); noisy.set(f, 2);
  assert.equal(d.push(noisy).length, 1);
}

// Split-frame mode: accel + gyro + angle assemble into one sample, and only
// the angle frame emits it.
{
  const d = createDecoder();
  assert.deepEqual(d.push(encodeFrame(0x51, [1000, -2000, 16384, 0])), []);
  assert.deepEqual(d.push(encodeFrame(0x52, [300, -300, 0, 0])), []);
  const [s] = d.push(encodeFrame(0x53, [8192, -4096, 16384, 0]));
  near(s.ax, 1000 * ACC); near(s.gx, 300 * GYR); near(s.roll, 8192 * ANG);
  assert.deepEqual(d.stats().types, { 0x51: 1, 0x52: 1, 0x53: 1 });
}

// A corrupted 11-byte frame fails its checksum and is dropped, not decoded.
{
  const d = createDecoder();
  const f = encodeFrame(0x51, [1000, -2000, 16384, 0]);
  f[10] ^= 0xff;
  assert.deepEqual(d.push(f), []);
  assert.equal(d.stats().badSum, 1);
}

// Gravity: a sensor lying still reads 1g on one axis and nothing on the others.
{
  const d = createDecoder();
  const [s] = d.push(packed([0, 0, 2048, 0, 0, 0, 0, 0, 0]));
  near(s.az, 1); near(magnitude(s), 1);
}

// A trace round-trips through base64 int16 without drifting: the pack scales
// are the exact inverse of the decode scales, so what comes back is what the
// device sent, not an approximation of it.
{
  const d = createDecoder();
  const raw = [[1000, -2000, 2048, 300, -300, 0, 8192, -4096, 16384],
    [-500, 700, 2000, -120, 45, 900, -1000, 2000, -16000]];
  const samples = raw.map((v, i) => d.push(packed(v), 1000 + i * 20)[0]);
  const back = decodeSamples(encodeSamples(samples), samples[0].t);
  assert.equal(back.length, samples.length);
  samples.forEach((s, i) => {
    for (const k of ['ax', 'ay', 'az', 'gx', 'gy', 'gz', 'roll', 'pitch', 'yaw']) near(back[i][k], s[k], 1e-9);
    assert.equal(back[i].t, s.t);  // deltas rebuild the timeline exactly
  });
}

// An empty set encodes to an empty string rather than throwing.
assert.equal(decodeSamples(encodeSamples([])).length, 0);

console.log('witmotion.check.mjs — all checks passed');

// Set start: the app's rest-timer clock, as an offset into the trace. Negative
// means the buffer was trimmed past the moment rest ended, so the whole window
// is post-rest. Null is only for a stale value — a rest that ended before the
// previous set was logged, which is what two quick logs in a row would give.
{
  assert.equal(setStartOffset(10_600, 10_000, 9_000), 600);
  assert.equal(setStartOffset(10_000, 10_000, 9_000), 0);
  assert.equal(setStartOffset(9_000, 10_000, 8_000), -1000); // trimmed past it
  assert.equal(setStartOffset(9_000, 10_000, 9_500), null);  // stale
  assert.equal(setStartOffset(0, 10_000, 0), null);          // no rest yet
  assert.equal(setStartOffset(null, 10_000, 0), null);
  assert.equal(setStartOffset(10_600.4, 10_000, 0), 600);
  console.log('set-start offset checks passed');
}

// Frame timing: one notification carries several frames and they all arrive at
// once, so they are spaced at the device period and end at the arrival instant.
// The 204 Hz trace of 2026-11-06 is what this prevents.
{
  const mk = (n) => Array.from({ length: n }, () => ({ t: 0 }));
  assert.deepEqual(spreadTimes(mk(2), 1000).map((s) => s.t), [1000 - FRAME_MS, 1000]);
  assert.deepEqual(spreadTimes(mk(1), 1000).map((s) => s.t), [1000]);
  // A queue flush spreads backwards over the period it really spans.
  assert.deepEqual(spreadTimes(mk(5), 1000).map((s) => s.t), [920, 940, 960, 980, 1000]);
  // Never rewinds past what was already handed out.
  const t = spreadTimes(mk(2), 1000, { after: 995 }).map((s) => s.t);
  assert.deepEqual(t, [996, 1000]);
  assert.ok(t[0] > 995 && t[1] > t[0]);
  assert.deepEqual(spreadTimes(mk(0), 1000).map((s) => s.t), []);
  // The whole point: a burst no longer collapses into one millisecond.
  const burst = spreadTimes(mk(100), 50_000);
  assert.equal(new Set(burst.map((s) => s.t)).size, 100);
  assert.equal(burst.at(-1).t - burst[0].t, 99 * FRAME_MS);
  console.log('frame spreading checks passed');
}
