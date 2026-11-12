// The Dark Wood — a stream, plus pines standing on the battle ground itself.
//
// The stream gives convergence; the pines give occlusion and scale. Its
// centreline is deliberately a different shape from the Ridge trail, so the two
// areas don't read as the same effect twice.

import { W, H, HOR, F, assertBehind } from '../camera';
import { hash } from '../noise';
import { bakeOrganic } from '../terrain';

const CFG = { el: 'litter', gL: 0.042, es: 0.85, tufts: 0.3, path: 'b' };

// [z, screen x, trunk width in world units]. The client cut a trunk from each
// near edge and the one at x 235 between the actors; this is what survived.
const TREES = [[2.5, 160, 0.3], [7, 370, 0.26], [9, 60, 0.3], [12, 215, 0.3],
               [14, 290, 0.3], [16, 120, 0.3], [20, 330, 0.3], [25, 25, 0.3], [32, 175, 0.3]];

function drawTrees(L, A, Z, boss) {
  // A boss is far wider than a monster (x 188-392 vs 262-350) and sits at z 12.67,
  // so the z 7 and z 12 pines end up nearer than it while overlapping it — they
  // would have to draw in front, which a background canvas cannot do. The
  // handoff's §6 calls for dropping exactly two pines in a boss fight; these are
  // the two, and camera.assertBehind is what identified them.
  const trees = boss ? TREES.filter(([z]) => z !== 7 && z !== 12) : TREES;
  for (const [z, sx, wW] of [...trees].sort((p, q) => q[0] - p[0])) {   // far first
    const s = F / z, sy = HOR + s, hw = Math.max(0.6, (wW * s) / 2);
    const top = sy - 7 * s, cb = sy - 1.8 * s;
    const near = Math.exp(-z / 10), haze = 0.004 + 0.03 * (1 - Math.exp(-z / 14));

    if (process.env.NODE_ENV !== 'production')
      assertBehind(`darkwood pine z${z}`, sx - hw * 2, sx + hw * 2, Math.max(10, top), sy, z, boss);

    const set = (x, y, v) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || x >= W || y < 10 || y >= H) return;
      const i = y * W + x;
      if (y > HOR && Z[i] < z * 0.97) return;
      L[i] = v;
      A[i] = 1;                    // a pine above the horizon is opaque, unlike the ground
    };

    // contact shadow, offset right
    const sh = Math.max(1, s * 0.05);
    for (let yy = -sh; yy <= sh; yy++) for (let xx = -hw * 2.2; xx <= hw * 2.2; xx++) {
      if ((xx / (hw * 2.2)) ** 2 + (yy / sh) ** 2 > 1) continue;
      const x = Math.round(sx + xx + hw * 0.6), y = Math.round(sy + yy);
      if (x >= 0 && x < W && y > HOR && y < H) L[y * W + x] *= 0.35;
    }

    // trunk, with a root flare over the bottom 22%
    for (let y = Math.max(10, Math.ceil(top)); y <= sy; y++) {
      const f = (sy - y) / s;
      const w = hw + (f < 0.22 ? ((0.22 - f) / 0.22) ** 2 * hw * 0.8 : 0);
      for (let x = Math.floor(sx - w); x <= Math.ceil(sx + w); x++) {
        const u = (x - (sx - w)) / (2 * w + 1);
        let v = haze + (s > 20 ? 0.01 * (hash(Math.floor((x - sx) / Math.max(2, s * 0.03)), Math.floor(y / Math.max(3, s * 0.1)), 501) - 0.5) : 0);
        if (u < 0.14 && hw > 1.2) v += 0.06 * near + 0.02;   // left rim
        else if (u > 0.8) v *= 0.6;                          // right edge falls away
        set(x, y, v);
      }
    }

    // canopy, five tapering tiers
    if (cb < 10) continue;
    for (let y = Math.max(10, Math.ceil(top)); y <= cb; y++) {
      const f = (cb - y) / (cb - top), tier = (f * 5) % 1;
      const half = 0.6 * (1 - f) * (0.5 + 0.5 * tier) * s;
      for (let x = Math.floor(sx - half); x <= Math.ceil(sx + half); x++)
        set(x, y, haze + (x - (sx - half) < 1.2 ? 0.035 : 0) + (tier < 0.12 ? 0.012 : 0));
    }
  }
}

export default {
  id: 'darkwood',
  cover: 'ground',
  anim: null,
  shadows: { hero: [72, 14], monster: [52, 9], boss: [120, 10] },
  *bake({ boss }) {
    const b = yield* bakeOrganic(CFG);
    yield;
    drawTrees(b.L, b.A, b.Z, boss);
    return { L: b.L, A: b.A, Z: b.Z, extra: {} };
  },
};
