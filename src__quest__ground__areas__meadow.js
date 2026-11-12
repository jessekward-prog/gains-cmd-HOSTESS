// The Meadow — a relief heightfield, ray-marched per column.
//
// This is area 0, the one every quest opens in and the one seen most, so it was
// the wrong one to hold. It was held on the 305ms full-quality bake; the bench's
// degraded variant measured 107ms at 6x CPU throttle, the CHEAPEST of all five
// areas, and the handoff's own note says stride 2 at step 1.012 "looks identical".
//
// Crests occluding the ground behind them is a far stronger depth cue than
// texture frequency, which is why this area gets relief rather than a path.

import { W, H, HOR, CX, F } from '../camera';
import { clamp, sstep, vn } from '../noise';
import { groundShade, buildScatter, drawEl } from '../terrain';

const CFG = { el: 'grass', gL: 0.055, es: 1, tufts: 0.3, path: null };

// step = z multiplier per march sample, stride = columns actually marched.
// 1.006/1 is full quality (305ms at 6x); 1.012/2 is 107ms and visually the same.
const STEP = 1.012, STRIDE = 2;

// Flattened at both anchors so the actors' feet never move off their own rows.
// The boss ellipse is wider because a boss is.
function heightAt(xw, z, boss) {
  const amp = Math.min(0.9, 0.3 + 0.06 * z);
  let h = amp * ((vn(xw * 0.09 + 3.1, z * 0.3, 51) - 0.5) * 1.7 + (vn(xw * 0.3, z * 0.7, 52) - 0.5) * 0.5);
  if (h < 0) h *= 0.4;                                   // shallow dips, taller crests
  const dH = Math.hypot(xw + 0.717, z - 1);
  const dM = boss
    ? Math.hypot((xw - 7.917) / 2.6, (z - 12.667) / 3.2)
    : Math.hypot((xw - 4.625) / 1.6, (z - 6.33) / 2.2);
  return h * sstep(0.7, 1.9, dH) * sstep(0.8, 2.2, dM);
}

export default {
  id: 'meadow',
  cover: 'ground',
  anim: null,
  shadows: { hero: [72, 14], monster: [52, 9], boss: [120, 10] },

  *bake({ boss }) {
    const L = new Float32Array(W * H), A = new Uint8Array(W * H), Z = new Float32Array(W * H).fill(1e9);
    const M = new Float32Array(W * H), out = { m: 0 };

    for (let x = 0; x < W; x += STRIDE) {
      let ybuf = H, zp = 0.5, hp = heightAt(((x + 0.5 - CX) * 0.5) / F, 0.5, boss);
      for (let z = 0.5; z < 260; z *= STEP) {
        const xw = ((x + 0.5 - CX) * z) / F;
        const h = heightAt(xw, z, boss);
        const yi = Math.max(HOR, Math.ceil(HOR + (F * (1 - h)) / z));
        if (yi < ybuf) {
          // lit by the slope of the ground facing us, so crests catch light
          const shade = clamp(1 + 5 * ((h - hp) / (z - zp)), 0.3, 2.0);
          const v = groundShade(xw, z, F / z, CFG, out) * shade;
          for (let yy = yi; yy < ybuf; yy++) {
            const i = yy * W + x;
            L[i] = v; Z[i] = z; M[i] = out.m; A[i] = 1;
          }
          ybuf = yi;
        }
        hp = h; zp = z;
        if (ybuf <= HOR) break;
      }
      // crest lines: where depth jumps between adjacent rows, brighten the near
      // pixel and darken the far one, so a fold reads as an edge
      for (let y = HOR + 2; y < H; y++) {
        const i = y * W + x, j = i - W;
        if (Z[j] / Z[i] > 1.25) {
          const fk = clamp((y - HOR) / 40, 0.15, 1);
          L[i] += 0.14 * fk;
          L[j] *= 1 - 0.55 * fk;
        }
      }
      if (x % 10 === 0) yield;   // ~39 slices across the march, so no chunk runs long
    }

    // duplicate the marched columns across the stride
    if (STRIDE > 1) {
      for (let y = HOR; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const r = x % STRIDE;
          if (!r) continue;
          const i = y * W + x, j = i - r;
          L[i] = L[j]; Z[i] = Z[j]; M[i] = M[j]; A[i] = A[j];
        }
      }
      yield;
    }

    // scatter sits ON the surface and z-tests against the marched depth buffer
    const put = (px, py, v, z) => {
      px = Math.round(px); py = Math.round(py);
      if (px < 0 || px >= W || py <= HOR || py >= H) return;
      const i = py * W + px;
      if (Z[i] < z * 0.97) return;
      L[i] = v; A[i] = 1;
    };
    const els = buildScatter(CFG);
    for (let n = 0; n < els.length; n++) {
      const e = els[n];
      const h = heightAt(e.xw, e.z, boss);
      e.sy = HOR + (F * (1 - h)) / e.z;                   // stand it on the fold
      const depth = clamp((e.sy - HOR) / (H - HOR), 0, 1);
      const tip = (0.13 + 0.13 * e.r1) * (0.5 + 0.5 * depth) + 0.02;
      drawEl(CFG.el, e, tip, tip * 0.55, CFG.gL * 0.45, (e.r2 - 0.5) * 1.2, put);
      if (n % 400 === 399) yield;
    }

    return { L, A, Z, chunk: { from: 240, size: 2 }, extra: {} };
  },
};
