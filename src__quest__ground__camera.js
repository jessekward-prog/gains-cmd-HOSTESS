// Battle-ground camera. One perspective shared by every area renderer, so a
// world position means the same thing in all of them.
//
// The handoff's shared model samples pixel CENTRES (dy = y - HOR + 0.5), but the
// anchor table it publishes — hero at world (-0.717, 1.0), monster at (4.625,
// 6.33) — only reproduces without that half pixel. So the +0.5 belongs inside a
// renderer's sampling loop, not here: toWorld/toScreen are an exact inverse pair
// on whole pixel coordinates, which is what the calibration crosshairs need.

export const W = 390, H = 340, HOR = 124, CX = 195, F = 152;

export const toWorld = (x, y) => {
  const z = F / (y - HOR);
  return { xw: ((x - CX) * z) / F, z };
};

export const toScreen = (xw, z, h = 0) => ({
  x: CX + (xw * F) / z,
  y: HOR + (F * (1 - h)) / z,
});

export const ANCHORS = {
  hero: toWorld(86, 276),
  monster: toWorld(306, 148),
  boss: toWorld(290, 136),
};

// Screen rects with glow margin, from the handoff. A canvas element may overlap
// one of these only if its z is GREATER than that actor's — anything nearer has
// to be drawn in front, which this background canvas cannot do.
export const RECTS = {
  hero: { x: [41, 135], y: [181, 285], z: ANCHORS.hero.z },
  monster: { x: [262, 350], y: [60, 152], z: ANCHORS.monster.z },
  boss: { x: [188, 392], y: [12, 140], z: ANCHORS.boss.z },
};

// Dev-only: catches a renderer placing scenery in front of an actor it is drawn
// behind. The Dark Wood's z 2.5 pine is nearer than the monster (z 6.33) and only
// works because their screen rects miss each other.
export function assertBehind(id, x0, x1, y0, y1, z, boss) {
  const present = boss ? ['hero', 'boss'] : ['hero', 'monster'];
  for (const who of present) {
    const r = RECTS[who];
    const overlaps = x0 < r.x[1] && x1 > r.x[0] && y0 < r.y[1] && y1 > r.y[0];
    if (overlaps && z <= r.z)
      console.warn(`[ground] ${id}: element at z ${z.toFixed(2)} overlaps ${who} (z ${r.z.toFixed(2)}) and would need to draw in front`);
  }
}
