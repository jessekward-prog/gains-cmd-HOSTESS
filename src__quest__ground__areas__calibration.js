// Scaffold checkpoint. Not a look — a ruler. Enabled only via ?ground=calib.
// Proves the camera, the layer stack, the bake scheduler and the tick path all
// work before any real ground exists.

import { W, H, HOR, toWorld, toScreen, ANCHORS } from '../camera';

const SQ = 0.5; // world units per checker square

function cross(L, A, cx, cy, v) {
  for (let d = -4; d <= 4; d++) {
    for (const [x, y] of [[cx + d, cy], [cx, cy + d]]) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      L[y * W + x] = v;
      A[y * W + x] = 1;
    }
  }
}

function row(L, A, y, v) {
  if (y < 0 || y >= H) return;
  for (let x = 0; x < W; x++) { L[y * W + x] = v; A[y * W + x] = 1; }
}

export default {
  id: 'calib',
  cover: 'ground',
  anim: { fps: 6 },
  shadows: { hero: [72, 14], monster: [52, 9], boss: [120, 10] },

  *bake({ boss }) {
    const L = new Float32Array(W * H), A = new Uint8Array(W * H), Z = new Float32Array(W * H);
    const span = H - HOR;

    for (let y = HOR; y < H; y++) {
      const depth = (y - HOR) / span;
      const fade = 0.35 + 0.65 * depth;
      for (let x = 0; x < W; x++) {
        const { xw, z } = toWorld(x + 0.5, y + 0.5); // pixel centre, per the shared model
        const i = y * W + x;
        const dark = (Math.floor(xw / SQ) + Math.floor(z / SQ)) & 1;
        L[i] = (dark ? 0.03 : 0.06) * fade;
        A[i] = 1;
        Z[i] = z;
      }
      if ((y - HOR) % 8 === 7) yield; // exercise the scheduler
    }

    row(L, A, HOR, 0.5);                                   // the horizon itself
    row(L, A, Math.round(toScreen(0, ANCHORS.hero.z).y), 0.35);
    row(L, A, Math.round(toScreen(0, ANCHORS.monster.z).y), 0.35);
    yield;

    for (const k of boss ? ['hero', 'boss'] : ['hero', 'monster']) {
      const p = toScreen(ANCHORS[k].xw, ANCHORS[k].z);
      cross(L, A, Math.round(p.x), Math.round(p.y), 0.55);
    }
    return { L, A, Z, extra: {} };
  },

  // One pixel travelling the horizon, so the tick path is visibly alive.
  frame(baked, tSec, out) {
    const y = HOR, base = y * W;
    for (let x = 0; x < W; x++) out[base + x] = baked.L[base + x];
    out[base + (Math.floor(tSec * 60) % W)] = 1;
    return [y, y + 1];
  },
};
