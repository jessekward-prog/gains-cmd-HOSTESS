// The Iron Dungeon — cast flagstones, a brick wall, an arch and three torches.
//
// cover:'full': there is no sky here, so this canvas owns all 340 rows and the
// DOM parallax layers (the old dungeon_strip crops) are not rendered at all.
//
// STATIC. The flicker term is dropped — it is a noise sample at t = 0, not 1, so
// a "first frame" would be up to 20% off, and the baked torchlight already IS the
// average brightness. The flames themselves live in the handoff's per-frame code,
// so they are baked here explicitly: without this the room has torchlight and no
// torches.

import { W, H, HOR, CX, F } from '../camera';
import { clamp, hash, vn, fbm } from '../noise';

const TORCH = [[128, 98], [252, 80], [360, 80]];
// Off-centre on purpose: directly behind the monster it read as too busy.
const ARCH = { x: 190, hw: 30, top: 52 };

const closest = (x, y) => Math.min(...TORCH.map(([tx, ty]) => Math.hypot(x - tx, (y - ty) * 1.2)));

// Light in discrete rings, not a smooth falloff. A continuous gaussian is a
// modern soft glow and makes the room read as a real 3D space; an 8-bit game had
// a handful of palette entries, so its torchlight stepped. The global Bayer pass
// then breaks each ring's edge, which is what sells it as period art rather than
// as banding. This is the single thing keeping the dungeon 2D-pretending-to-be-3D.
const RINGS = 7;
const band = (v) => Math.round(v * RINGS) / RINGS;

function wallL(x, y, arch) {
  const row = Math.floor(y / 7), off = (row % 2) * 9, xx = x + off;
  const bx = Math.floor(xx / 18), lx = xx - bx * 18, ly = y - row * 7;
  let alb = lx === 0 || ly === 0
    ? 0.01                                                   // mortar
    : 0.05 + 0.022 * (hash(bx, row, 301) - 0.5) * 2 + 0.016 * (vn(x / 5, y / 5, 302) - 0.5) + (ly === 1 ? 0.012 : 0);

  const dx = x - ARCH.x, cy = ARCH.top + ARCH.hw;
  const rr = arch ? (y < cy ? Math.hypot(dx, y - cy) : Math.abs(dx)) : Infinity;
  if (rr < ARCH.hw) {
    // depth, not a silhouette: darkest at the crown, lifting toward the floor,
    // with the jambs catching a little of the room's light
    const lift = 0.012 + 0.055 * Math.pow((y - ARCH.top) / (HOR - ARCH.top), 1.6);
    const jamb = 0.02 * Math.pow(Math.abs(dx) / ARCH.hw, 3);
    return { v: lift + jamb, tg: 0 };
  }
  if (rr < ARCH.hw + 6) {                                    // voussoir ring
    const an = Math.atan2(y - cy, dx);
    const seg = y < cy ? Math.floor(an / 0.26) : Math.floor(y / 9) + 50;
    const edge = y < cy ? Math.abs(an / 0.26 - Math.round(an / 0.26)) < 0.08 : y % 9 === 0;
    alb = edge || rr > ARCH.hw + 5 ? 0.01 : 0.075 + 0.02 * (hash(seg, 3, 303) - 0.5) + (rr < ARCH.hw + 1 ? 0.025 : 0);
  }

  let lt = 0;
  for (const [tx, ty] of TORCH) {
    const d = Math.hypot(x - tx, (y - ty) * 1.2);            // elliptical: y weighted 1.2
    lt += 0.22 * Math.exp(-((d / 16) ** 2)) + 0.08 * Math.exp(-((d / 50) ** 2));
  }
  lt = band(lt / 0.3) * 0.3;
  const amb = (0.55 + 0.75 * (y / HOR)) * (1 - 0.6 * Math.exp(-(HOR - y) / 3));
  // 7x left the room lit by three specks. The torches ARE the dungeon, so the
  // wall gain is what sells it; the extra near-field term gives each one a pool
  // instead of a halo.
  const glow = band(Math.exp(-((closest(x, y) / 9) ** 2))) * 0.10;
  return { v: alb * amb * 1.5 + alb * 13 * lt + glow, tg: alb * 13 * lt + glow };
}

// Rows 0.15 world deep, slab width random per row and staggered, so the grout
// lines converge. This is the cue the organic areas had to find another way to get.
function slabFloor(xw, z, x, dy, m) {
  const rd = 0.15, r = Math.floor(z / rd), fz = z / rd - r;
  const sw = 0.17 + 0.1 * hash(r, 0, 311);
  const ox = xw / sw + hash(r, 1, 312) * 7, c = Math.floor(ox), fx = ox - c;
  const gw = 0.015, ex = Math.min(fx, 1 - fx) * sw, ez = Math.min(fz, 1 - fz) * rd;
  // anti-aliased separately in x and z, so grout fades to tone instead of aliasing
  const grout = Math.max(clamp(0.5 + (gw / 2 - ex) / (z / F), 0, 1),
                         clamp(0.5 + (gw / 2 - ez) / ((z * z) / F), 0, 1));
  const crack = hash(c, r, 315) > 0.82
    && Math.abs(fx - 0.5 + 0.3 * (fz - 0.5) + 0.04 * Math.sin(fz * 19)) < ((0.012 * F) / z / sw) * (z / F) * 1.2 ? 0.5 : 0;

  let alb = 0.07 + 0.03 * (hash(c, r, 313) - 0.5) * 2 + m * 0.05 + (fz < 0.08 ? 0.015 : fz > 0.93 ? -0.02 : 0);
  alb *= 1 - crack;
  alb = alb * (1 - grout) + 0.008 * grout;

  const depth = clamp(dy / (H - HOR), 0, 1);
  let pool = 0, refl = 0;
  for (const [tx] of TORCH) {
    // the fans widen toward camera and all point back at the horizon
    pool += 0.26 * band(Math.exp(-(((x - tx) / (10 + 0.9 * dy)) ** 2)) * Math.exp(-dy / 40));
    refl += 0.13 * Math.exp(-(((x - tx) / (1 + 0.06 * dy)) ** 2)) * Math.exp(-dy / 45)
          * clamp(0.5 + m * 3, 0, 1.5) * (1 - grout);        // wet streak, broken by mottle
  }
  return alb * (0.5 + 0.4 * depth) + alb * 5 * pool + refl;
}

// The flames are drawn in the handoff's FRAME code, not its bake. Static would
// otherwise light the room with nothing visibly burning. Tallest shape, no
// jitter, no spark — a still 5px flame reads as fire; a 2px one reads as a glyph.
function drawFlames(L) {
  const set = (x, y, v) => { if (x >= 0 && x < W && y >= 10 && y < HOR) L[y * W + x] = v; };
  const add = (x, y, v) => { if (x >= 0 && x < W && y >= 10 && y < HOR) L[y * W + x] += v; };
  for (const [tx, ty] of TORCH) {
    // halo first, so the flame body overwrites its centre
    for (let yy = -9; yy <= 7; yy++) for (let xx = -7; xx <= 7; xx++)
      add(tx + xx, ty + yy, 0.16 * band(Math.exp(-((xx / 3.6) ** 2) - ((yy + 2) / 4.2) ** 2)));
    for (let yy = 1; yy <= 5; yy++) for (let xx = -1; xx <= 1; xx++)
      set(tx + xx, ty + yy, yy === 1 ? 0.22 : 0.012);        // bracket, 3x5 with a lip
    // 7px tall, 2px core: the tallest shape in the cycle, since a still flame has
    // to read as fire from one frame and a 5px one reads as a glyph
    for (let j = 0; j < 7; j++) {
      const hw = j < 2 ? 2 : j < 5 ? 1 : 0;
      for (let xx = -hw; xx <= hw; xx++)
        set(tx + xx, ty - j, Math.abs(xx) === 0 ? 1.0 : Math.abs(xx) === 1 ? 0.72 : 0.4);
    }
  }
}

export default {
  id: 'dungeon',
  cover: 'full',
  anim: null,
  shadows: { hero: [72, 14], monster: [52, 9], boss: [120, 10] },

  *bake({ boss }) {
    // The arch sits at x 190 and a boss spans x 188-392, so in a boss fight it
    // reads as clutter directly behind the monster — the thing the client
    // rejected when it was centred. Handoff §6: hide it.
    const arch = !boss;
    const L = new Float32Array(W * H), A = new Uint8Array(W * H).fill(1), Z = new Float32Array(W * H);

    for (let y = 10; y < HOR; y++) {
      for (let x = 0; x < W; x++) L[y * W + x] = wallL(x, y, arch).v;
      if (y % 8 === 7) yield;
    }

    for (let y = HOR; y < H; y++) {
      const dy = y - HOR + 0.5, z = F / dy;
      const fp = z / F + ((z * z) / F) * 0.35;
      for (let x = 0; x < W; x++) {
        const xw = ((x + 0.5 - CX) * z) / F, i = y * W + x;
        L[i] = slabFloor(xw, z, x, dy, fbm(xw, z, 1.1, 5, fp, 21));
        Z[i] = z;
      }
      if ((y - HOR) % 8 === 7) yield;
    }

    drawFlames(L);
    // 2px cells across the WHOLE room, wall included — not just the near floor.
    // Brick at 1px read as too fine beside sprites whose own pixel is 2-3px, which
    // is the "too high res" complaint. from:0 also removes the chunk boundary, so
    // the per-column jitter in blit never comes into play here.
    return { L, A, Z, chunk: { from: 0, size: 2 }, extra: {} };
  },
};
