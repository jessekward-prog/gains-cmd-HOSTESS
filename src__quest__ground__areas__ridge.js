// High Ridge — a worn trail converging on the horizon.
//
// The cheapest bake of the four (142ms at 6x CPU throttle) and the most direct
// answer to the problem: a path HAS edges, and edges converge, so you get the
// dungeon's depth cue on organic ground without drawing a grid on it.

import { bakeOrganic } from '../terrain';

const CFG = { el: 'scree', gL: 0.06, pathL: 0.15, es: 0.85, tufts: 0.3, path: 'a' };

export default {
  id: 'ridge',
  cover: 'ground',
  anim: null,
  shadows: { hero: [72, 14], monster: [52, 9], boss: [120, 10] },
  *bake() {
    const b = yield* bakeOrganic(CFG);
    return { L: b.L, A: b.A, Z: b.Z, extra: {} };
  },
};
