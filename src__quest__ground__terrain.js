// Shared machinery for the organic areas. Ported from the handoff's stage-lab.js
// with the paths the static build never takes removed: no backlight preset, no
// Meadow heightfield (held — 305ms bake), and no wind.
//
// An area renderer is a config plus whatever is unique to it, not a copy of this.

import { W, H, HOR, CX, F } from './camera';
import { clamp, hash, vn, fbm } from './noise';

// Centrelines in world space, Hermite-interpolated over log z.
// 'a' is High Ridge's trail, 'b' is the Dark Wood's stream — deliberately a
// different line, so the two areas don't read as the same trick.
const PATHS = {
  a: { z: [0.5, 0.7, 1.2, 2, 3.5, 6.3, 10, 18, 40, 400].map(Math.log), x: [-0.3, -0.15, 0.05, 0.6, 2.0, 3.9, 4.5, 2.0, -3, -10] },
  b: { z: [0.5, 0.75, 1.1, 1.7, 2.6, 4, 6, 9, 15, 30, 80, 400].map(Math.log), x: [2.2, 1.3, 0.45, -0.55, -1.6, -1.2, 0.9, 1.6, -0.6, 3, 9, 18] },
};

export function pathX(z, v) {
  const PZ = PATHS[v].z, PXS = PATHS[v].x;
  const u = Math.log(z);
  let i = 0;
  while (i < PZ.length - 2 && u > PZ[i + 1]) i++;
  const t = clamp((u - PZ[i]) / (PZ[i + 1] - PZ[i]), 0, 1);
  const m = (j) => (PXS[Math.min(j + 1, PXS.length - 1)] - PXS[Math.max(j - 1, 0)]) / 2;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * PXS[i] + (t3 - 2 * t2 + t) * m(i) + (-2 * t3 + 3 * t2) * PXS[i + 1] + (t3 - t2) * m(i + 1);
}

export const pathHW = (z, v) =>
  v === 'b' ? 0.15 + 0.06 * (vn(z * 1.4, 5.1, 37) - 0.5) * 2
            : 0.22 + 0.04 * (vn(z * 2.5, 3.3, 31) - 0.5) * 2;

const onPath = (xw, z, v) => Math.abs(xw - pathX(z, v)) < pathHW(z, v) + 0.05;

// Water reads by glints, not by being lighter than the ground — it is darker.
function streamL(xw, z, d, hw) {
  const kz = clamp((0.02 * F) / z - 0.5, 0, 1), row = Math.floor(z / 0.02);
  const seg = Math.floor((xw + hash(row, 0, 61) * 0.3) / 0.09);
  const gl = hash(seg, row, 63) > 0.8 ? 1 : 0;
  const far = Math.exp(-(F / z) / 30), mid = 0.4 + 0.6 * clamp(1 - Math.abs(d) / hw, 0, 1);
  return 0.012 + 0.09 * far + (0.17 * gl * kz + 0.03 * (1 - kz)) * mid;
}

// One ground pixel. `out.m` carries the mottle back out for the scatter to reuse.
export function groundShade(xw, z, dy, a, out) {
  const depth = clamp(dy / (H - HOR), 0, 1);
  const fp = z / F + ((z * z) / F) * 0.35;        // band limit: kill sub-3px octaves
  const m = fbm(xw, z, 1.1, 5, fp, 21);
  const cell = 0.03, gk = clamp((cell * F) / z - 0.3, 0, 1);
  const g = hash(Math.floor(xw / cell), Math.floor(z / cell), 77) - 0.5;

  // The 0.06*e^(-dy/9) term is the horizon lift that carries the join to the
  // DOM backdrop, now that the old 2px accent rule is gone.
  let L = a.gL * (0.55 + 0.55 * Math.pow(depth, 0.6))
        + m * 0.09 * (0.4 + 0.6 * depth)
        + g * 0.035 * gk
        + 0.06 * Math.exp(-dy / 9);

  if (a.path) {
    const d = xw - pathX(z, a.path), hw = pathHW(z, a.path);
    const edge = 0.06 * (vn(z * 9, d > 0 ? 7 : 8, 33) - 0.5) * 2;
    const ad = Math.abs(d) - hw - edge, pxw = z / F;
    const cov = clamp(0.5 - ad / pxw, 0, 1);
    const vk = clamp(0.05 / pxw - 0.5, 0, 1);    // fades verge/lip once sub-pixel
    let pl;
    if (a.path === 'b') pl = streamL(xw, z, d, hw);
    else {
      pl = a.pathL * clamp(0.85 + 0.6 * m, 0.5, 1.4) * (0.55 + 0.45 * Math.pow(depth, 0.4));
      if (hash(Math.floor(xw / 0.022), Math.floor(z / 0.022), 91) > 0.95)
        pl += 0.06 * clamp((0.022 * F) / z - 0.3, 0, 1);  // pebbles
      if (ad > -0.05 && ad < 0) pl *= 1 - 0.55 * vk;       // dark verge
    }
    if (ad >= 0 && ad < 0.035) L += 0.04 * vk;             // bank lip
    L = L * (1 - cov) + pl * cov;
  }
  out.m = m;
  return L;
}

// Scatter lives in WORLD space, not texture space — that is what makes it shrink
// with distance instead of just getting denser.
export function buildScatter(a) {
  const els = [];
  for (let z = 0.6; z < 16;) {
    const cell = 0.05 * (1 + z / 2), zi = Math.round(z * 1000);
    const x0 = Math.floor((((-12 - CX) * z) / F) / cell), x1 = Math.ceil((((402 - CX) * z) / F) / cell);
    for (let xi = x0; xi <= x1; xi++) {
      if (hash(xi, zi, 101) > a.tufts * 0.8) continue;
      const xw = (xi + hash(xi, zi, 103)) * cell, zz = z + hash(xi, zi, 107) * cell;
      if (a.path && onPath(xw, zz, a.path)) continue;     // nothing grows on the trail
      const sz = ((0.035 + 0.05 * hash(xi, zi, 109)) * F) / zz * a.es;
      if (sz < 0.9) continue;                              // sub-pixel, would just shimmer
      els.push({ xw, z: zz, sx: CX + (xw * F) / zz, sy: HOR + F / zz, sz,
                 r1: hash(xi, zi, 113), r2: hash(xi, zi, 127), id: xi * 7919 + zi });
    }
    z += cell;
  }
  return els.sort((p, q) => q.z - p.z);                    // painter order, far first
}

export function drawEl(kind, e, tip, mid, bas, lean, put) {
  const { sx, sy, sz, z } = e;
  if (kind === 'grass') {
    const nb = clamp(1 + Math.floor(sz / 3.5), 1, 4), sp = Math.max(1, sz * 0.3);
    if (sz > 3) put(sx, sy + 1, bas, z);
    for (let b = 0; b < nb; b++) {
      const bx = Math.round(sx + (b - (nb - 1) / 2) * sp);
      const bh = Math.max(1, Math.round(sz * (0.55 + 0.45 * hash(b, e.id, 5))));
      const lb = lean + (b - (nb - 1) / 2) * 0.4;
      for (let j = 0; j < bh; j++) {
        const f = j / bh;
        put(bx + lb * f * f * sz * 0.25, Math.round(sy) - j, j === bh - 1 ? tip : j >= bh * 0.6 ? (tip + mid) / 2 : mid, z);
      }
    }
  } else if (kind === 'needles') {
    if (e.r2 > 0.93 && sz > 2) {                           // the occasional cone
      const c = sz > 5 ? 3 : 2;
      for (let yy = 0; yy < c; yy++) for (let xx = 0; xx < c; xx++)
        put(sx + xx, sy - c + 1 + yy, yy === 0 ? tip * 1.3 : yy === c - 1 ? bas : mid * 1.4, z);
      return;
    }
    const n = clamp(Math.round(sz / 3), 1, 3);
    for (let k = 0; k < n; k++) {
      const an = (hash(k, e.id, 9) - 0.5) * 1.3 + (hash(k, e.id, 10) > 0.5 ? Math.PI : 0);
      const ln = Math.max(1, Math.round(sz * 0.8));
      const ox = sx + (hash(k, e.id, 11) - 0.5) * sz, oy = sy - hash(k, e.id, 12) * sz * 0.3;
      for (let j = 0; j < ln; j++)
        put(ox + Math.cos(an) * j, oy - Math.abs(Math.sin(an)) * j * 0.6, j < ln / 2 ? tip : tip * 0.65, z);
    }
  } else if (kind === 'scree') {
    const w = Math.max(1, Math.round(sz * 1.2)), h = Math.max(1, Math.round(sz * 0.55));
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      if (w >= 3 && h >= 2 && yy === 0 && (xx === 0 || xx === w - 1)) continue;  // knock the corners off
      put(sx - w / 2 + xx, sy - h + 1 + yy, yy === 0 ? tip * 1.1 : yy < h / 2 ? mid * 1.3 : bas, z);
    }
    for (let xx = 0; xx <= w; xx++) put(sx - w / 2 + xx + 1, sy + 1, bas * 0.5, z);
  } else {                                                  // litter
    if (e.r2 > 0.9 && sz > 3) {                             // a twig
      const ln = Math.round(sz * 2.5);
      for (let j = 0; j < ln; j++) {
        const wy = Math.round(Math.sin(j * 0.5 + e.r1 * 6));
        put(sx + j - ln / 2, sy - 1 + wy, tip * 0.7, z);
        put(sx + j - ln / 2, sy + wy, bas * 0.4, z);
      }
      return;
    }
    const lw = sz > 3 ? 3 : 2, lh = sz > 6 ? 2 : 1;
    for (let yy = 0; yy < lh; yy++) for (let xx = 0; xx < lw; xx++)
      put(sx + xx - 1, sy - yy, yy === lh - 1 ? tip * 0.9 : mid, z);
  }
}

// The generator every organic area's bake delegates to. Yields often enough that
// a 125-190ms bake never holds a frame.
export function* bakeOrganic(a) {
  const L = new Float32Array(W * H), A = new Uint8Array(W * H), Z = new Float32Array(W * H);
  const M = new Float32Array(W * H), out = { m: 0 };

  for (let y = HOR; y < H; y++) {
    const dy = y - HOR + 0.5;                    // pixel centre, per the shared model
    const z = F / dy;
    for (let x = 0; x < W; x++) {
      const xw = ((x + 0.5 - CX) * z) / F, i = y * W + x;
      L[i] = groundShade(xw, z, dy, a, out);
      M[i] = out.m;
      A[i] = 1;
      Z[i] = z;
    }
    if ((y - HOR) % 8 === 7) yield;
  }

  const put = (x, y, v, z) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= W || y <= HOR || y >= H) return;
    const i = y * W + x;
    if (Z[i] < z * 0.97) return;                 // behind something already drawn
    L[i] = v;
  };

  const els = buildScatter(a);
  for (let n = 0; n < els.length; n++) {
    const e = els[n], depth = clamp((e.sy - HOR) / (H - HOR), 0, 1);
    const tip = (0.13 + 0.13 * e.r1) * (0.5 + 0.5 * depth) + 0.02;
    drawEl(a.el, e, tip, tip * 0.55, a.gL * 0.45, (e.r2 - 0.5) * 1.2, put);
    if (n % 400 === 399) yield;
  }

  return { L, A, Z, M, put, extra: {} };
}
