// Pine Forest — dense scatter plus a dark foreground band.
//
// STATIC. The gust is dropped entirely: at 6x CPU throttle a wind tick costs
// 17.6ms p95, which fails the handoff's 16ms animation budget. The still frame
// was already approved to read on its own.
//
// Note the handoff's "t = 0 is the still frame" is wrong — the phase formula
// gives p = 0.25 there, which is mid-gust. Hence gust weight 0 everywhere
// rather than evaluating the gust at zero.

import { bakeOrganic } from '../terrain';
import { hash } from '../noise';

const CFG = { el: 'needles', gL: 0.05, es: 0.8, tufts: 1.0, path: null };

// Rooted at y 338, at most 24px tall, so it spans y 314-338 and the bottom
// letterbox hides the roots. The hero's sprite ends at y~285, so the band never
// overlaps an actor and can live in this background canvas. Keep it under 28px
// tall or it would need a second canvas in front of the actors.
function drawBand(put) {
  let x = -6, k = 0;
  while (x < 396) {
    const hh = 12 + hash(k, 3, 201) * 12;
    const nb = 4 + Math.floor(hash(k, 5, 203) * 3);
    for (let b = 0; b < nb; b++) {
      const bx = x + (b - nb / 2) * 2.2;
      const bh = Math.round(hh * (0.55 + 0.45 * hash(k, b, 204)));
      const lean = (hash(k, b, 205) - 0.5) * 4;     // fixed lean; the sway term is gone
      for (let j = 0; j < bh; j++) {
        const f = j / bh;
        put(bx + lean * f * f, 338 - j, j >= bh - 2 ? 0.17 : 0.012, 0.1);
      }
    }
    x += 7 + hash(k, 6, 206) * 10;
    k++;
  }
}

export default {
  id: 'forest',
  cover: 'ground',
  anim: null,
  shadows: { hero: [72, 14], monster: [52, 9], boss: [120, 10] },
  *bake() {
    const b = yield* bakeOrganic(CFG);
    yield;
    drawBand(b.put);
    return { L: b.L, A: b.A, Z: b.Z, extra: {} };
  },
};
