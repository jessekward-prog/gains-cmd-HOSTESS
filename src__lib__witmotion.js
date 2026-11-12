// WT901BLE5.0 (WitMotion) over Web Bluetooth.
//
// Confirmed against the real device on 2026-11-02 (WT901BLE68, Pixel 9 Pro):
// the service is 0000ffe5-0000-1000-8000-00805f9a34fb and notify is ffe4 on the
// same base, frames arrive as the packed 0x61 form, and the scale factors below
// are right — lying still it reads |a| = 1.02 g with the gyro at 0.00.
// Still unconfirmed: the axis *mapping*, which needs all three poses.

// WitMotion's firmware builds its 128-bit UUIDs on a base ending `00805f9a34fb`
// — one character off the standard Bluetooth base, `00805f9b34fb`. Passing the
// short form 0xffe5 expands to the standard base and finds nothing on the
// device, which is how this was caught:
//   NotFoundError: No Services matching UUID 0000ffe5-...-00805f9b34fb
// So both bases are listed, and the real service is discovered rather than
// assumed. Extra candidates cost nothing: optionalServices only grants access,
// it doesn't require the device to have them.
const base = (short, tail) => `0000${short}-0000-1000-8000-00805f${tail}`;
export const SERVICE_CANDIDATES = [
  base('ffe5', '9a34fb'), base('ffe5', '9b34fb'),
  base('ffe0', '9a34fb'), base('ffe0', '9b34fb'),
  base('fff0', '9a34fb'), base('fff0', '9b34fb'),
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART, in case it's a relabelled module
];

// raw int16 → real units
const ACC = 16 / 32768;    // g
const GYR = 2000 / 32768;  // deg/s
const ANG = 180 / 32768;   // deg

// Config writes, in the order the device wants them: unlock, change, save.
// Verified on the device: unlock, then rate code 0x08, took the stream from
// 10 Hz to a measured 52 Hz, and save persisted it. The factory default is
// 10 Hz — thin for rep counting, so 50 Hz is the one to use.
export const CMD = {
  unlock: [0xff, 0xaa, 0x69, 0x88, 0xb5],
  save: [0xff, 0xaa, 0x00, 0x00, 0x00],
  rate: (code) => [0xff, 0xaa, 0x03, code, 0x00],
};
export const RATES = [[0x06, '10 Hz'], [0x07, '20 Hz'], [0x08, '50 Hz'], [0x09, '100 Hz']];

export const SAMPLE_FIELDS = ['t', 'ax', 'ay', 'az', 'gx', 'gy', 'gz', 'roll', 'pitch', 'yaw'];

const PACKED = 0x61; // accel + gyro + angle in one 20-byte notification
const ACCEL = 0x51, GYRO = 0x52, ANGLE = 0x53;

/**
 * Byte-stream decoder. BLE hands over notifications, not frames: one
 * notification can carry two frames, or half of one, so the header hunt and the
 * leftover buffer both have to survive across calls.
 *
 * push(bytes) returns however many complete samples those bytes finished — zero,
 * one, or several.
 */
export function createDecoder() {
  let buf = new Uint8Array(0);
  let partial = null;   // split-frame mode assembles a sample across 0x51/0x52/0x53
  let skipped = 0;      // bytes discarded hunting for a header — a resync counter
  let badSum = 0;
  const types = {};

  const i16 = (d, o) => d.getInt16(o, true);

  return {
    stats: () => ({ skipped, badSum, types: { ...types } }),
    reset() { buf = new Uint8Array(0); partial = null; },

    push(bytes, t = Date.now()) {
      const merged = new Uint8Array(buf.length + bytes.length);
      merged.set(buf);
      merged.set(bytes, buf.length);
      buf = merged;

      const out = [];
      for (;;) {
        if (buf.length < 2) break;
        if (buf[0] !== 0x55) { buf = buf.slice(1); skipped++; continue; }

        const type = buf[1];
        const packed = type === PACKED;
        // Anything that isn't a frame type we know is a false header — a 0x55
        // that happened to land in the middle of a payload. Resync past it.
        if (!packed && (type < 0x50 || type > 0x5a)) { buf = buf.slice(1); skipped++; continue; }

        const len = packed ? 20 : 11;
        if (buf.length < len) break; // rest of the frame is in the next notification

        const frame = buf.slice(0, len);
        const d = new DataView(frame.buffer, 0, len);

        // The 11-byte frames carry a checksum; the packed 20-byte one does not.
        if (!packed) {
          let sum = 0;
          for (let i = 0; i < 10; i++) sum += frame[i];
          if ((sum & 0xff) !== frame[10]) { buf = buf.slice(1); skipped++; badSum++; continue; }
        }

        types[type] = (types[type] || 0) + 1;
        buf = buf.slice(len);

        if (packed) {
          out.push({
            t,
            ax: i16(d, 2) * ACC, ay: i16(d, 4) * ACC, az: i16(d, 6) * ACC,
            gx: i16(d, 8) * GYR, gy: i16(d, 10) * GYR, gz: i16(d, 12) * GYR,
            roll: i16(d, 14) * ANG, pitch: i16(d, 16) * ANG, yaw: i16(d, 18) * ANG,
          });
        } else if (type === ACCEL) {
          partial = { ...(partial || {}), ax: i16(d, 2) * ACC, ay: i16(d, 4) * ACC, az: i16(d, 6) * ACC };
        } else if (type === GYRO) {
          partial = { ...(partial || {}), gx: i16(d, 2) * GYR, gy: i16(d, 4) * GYR, gz: i16(d, 6) * GYR };
        } else if (type === ANGLE) {
          // Angle closes the trio: accel and gyro always arrive before it.
          out.push({
            t, ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0, ...partial,
            roll: i16(d, 2) * ANG, pitch: i16(d, 4) * ANG, yaw: i16(d, 6) * ANG,
          });
          partial = null;
        }
      }
      return out;
    },
  };
}

export const magnitude = (s) => Math.hypot(s.ax || 0, s.ay || 0, s.az || 0);

// Build a frame the way the device would — used by the self-check, and the only
// way to test the decoder without the hardware on the desk.
export function encodeFrame(type, values) {
  const len = type === PACKED ? 20 : 11;
  const f = new Uint8Array(len);
  const d = new DataView(f.buffer);
  f[0] = 0x55; f[1] = type;
  values.forEach((v, i) => d.setInt16(2 + i * 2, v, true));
  if (type !== PACKED) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += f[i];
    f[10] = sum & 0xff;
  }
  return f;
}

// --- trace encoding -------------------------------------------------------
// A set's worth of samples has to survive a round trip to Postgres without
// bloating it. JSON floats cost ~10x what the device actually sent, so samples
// go back to the int16s they were decoded from — the scales below are the exact
// inverse of ACC/GYR/ANG, so this is lossless to the original raw values.
const PACK = [1 / ACC, 1 / GYR, 1 / ANG];
const CH = ['ax', 'ay', 'az', 'gx', 'gy', 'gz', 'roll', 'pitch', 'yaw'];
const scaleOf = (i) => PACK[Math.floor(i / 3)];
const clamp = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));

/**
 * Where the set starts inside a trace, in ms from its first sample. The app
 * knows when rest ended and the sensor never will, so this is the one marker
 * that turns a two-minute window of rest-plus-set into a bounded set. Null when
 * Negative when the buffer was trimmed past that moment, which is itself worth
 * knowing: the whole window is then post-rest. Null only when the value is
 * stale — rest ended before the previous set was even logged — or absent.
 */
export const setStartOffset = (restEndedAt, firstT, lastCommitAt = 0) =>
  restEndedAt && firstT != null && restEndedAt >= lastCommitAt ? Math.round(restEndedAt - firstT) : null;

/** The period the sensor is configured to send at: 50 Hz. */
export const FRAME_MS = 20;

/**
 * BLE hands over notifications, not samples. Every frame in one notification
 * shares its arrival time, and when the phone delivers a queued burst — screen
 * locked, app backgrounded — dozens land in the same millisecond: a 47 s set
 * came back claiming 204 Hz. `dt` is the only clock a trace has, so frames are
 * spaced at the device's own period and made to END at the arrival instant,
 * which is what a queue flush actually represents. Never runs backwards past
 * `after`, the last time already handed out.
 */
export function spreadTimes(samples, arrival, { periodMs = FRAME_MS, after = -Infinity } = {}) {
  const k = samples.length;
  let prev = after;
  for (let i = 0; i < k; i++) {
    const want = arrival - (k - 1 - i) * periodMs;
    const t = want > prev ? want : prev + 1;
    samples[i].t = t;
    prev = t;
  }
  return samples;
}

/** samples → base64 of int16 [dtMs, ax…yaw] per sample. */
export function encodeSamples(samples) {
  const out = new Int16Array(samples.length * 10);
  let prev = samples[0]?.t ?? 0;
  samples.forEach((s, i) => {
    const o = i * 10;
    out[o] = clamp(s.t - prev);
    prev = s.t;
    CH.forEach((k, j) => { out[o + 1 + j] = clamp((s[k] || 0) * scaleOf(j)); });
  });
  const bytes = new Uint8Array(out.buffer);
  let bin = '';
  // Chunked: String.fromCharCode(...bytes) overflows the stack on a long set.
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** base64 → samples, with t rebuilt from the deltas. Used by the offline tuner. */
export function decodeSamples(b64, t0 = 0) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const a = new Int16Array(bytes.buffer);
  const out = [];
  let t = t0;
  for (let i = 0; i < a.length; i += 10) {
    t += a[i];
    const s = { t };
    CH.forEach((k, j) => { s[k] = a[i + 1 + j] / scaleOf(j); });
    out.push(s);
  }
  return out;
}
