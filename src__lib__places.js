// Places the hero runs through on the Quest title screen. Each is four parallax
// layers of pixel art drawn in luma (0–1) on a tile that wraps left to right, so
// the active skin colours them exactly as it colours the game's own lands.
// No React, no DOM, no assets: quest.check.mjs bakes them all.
export const PW = 240, PH = 128; // one tile, shown at 2×; its bottom edge is the ground line
// [key, name, the stage's line]
export const PLACES = [
  ['dunes', 'The Dune Sea', 'Heat shimmers off the Dune Sea. Choose your quest, HERO.'],
  ['ember', 'Emberpeak', 'Emberpeak rumbles in its sleep. Choose your quest, HERO.'],
  ['graves', 'Hollow Graves', 'Something stirs in the Hollow Graves. Choose your quest, HERO.'],
  ['cavern', 'Crystal Cavern', 'Light hums in the Crystal Cavern. Choose your quest, HERO.'],
];
export const MEADOW = 'meadow'; // the original title scene, drawn by the stage itself
/** The place to show: the one picked, or a different one each day. `day` counts days. */
export const placeOf = (pick, day) => {
  const all = [MEADOW, ...PLACES.map((p) => p[0])];
  return all.includes(pick) ? pick : all[((day % all.length) + all.length) % all.length];
};

const { sin, cos, abs, floor, max, min, round, PI, hypot } = Math;
const rnd = (i, s = 0) => { const v = sin(i * 127.1 + s * 311.7 + 1.3) * 43758.5453; return v - floor(v); };
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
// Hills that meet themselves at the tile's edge.
const wave = (x, ...hs) => hs.reduce((a, [n, amp, ph]) => a + amp * sin((x / PW) * 2 * PI * n + ph), 0);

function layer(sp) {
  const L = new Float32Array(PW * PH), A = new Uint8Array(PW * PH);
  const T = {
    sp, L, A,
    px(x, y, l) { x = ((round(x) % PW) + PW) % PW; y = round(y); if (y < 0 || y >= PH) return; L[y * PW + x] = max(0, min(1, l)); A[y * PW + x] = 1; },
    rect(x, y, w, h, l) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) T.px(x + i, y + j, typeof l === 'function' ? l(i, j) : l); },
    disc(cx, cy, r, l) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) T.px(cx + x, cy + y, typeof l === 'function' ? l(x, y) : l); },
    oval(cx, cy, rx, ry, l) { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x / (rx + 0.4)) ** 2 + (y / (ry + 0.4)) ** 2 <= 1) T.px(cx + x, cy + y, typeof l === 'function' ? l(x, y) : l); },
    line(x0, y0, x1, y1, l, w = 1) { const n = max(abs(x1 - x0), abs(y1 - y0), 1); for (let k = 0; k <= n; k++) T.rect(round(x0 + (x1 - x0) * k / n), round(y0 + (y1 - y0) * k / n), w, 1, l); },
    // A two-tone gradient, ordered-dithered through `steps` tones.
    sky(top, bot, y1 = PH, steps = 7) { for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) { const v = (top + (bot - top) * min(1, y / y1)) * steps; T.px(x, y, (floor(v) + (v - floor(v) > bayer(x, y) ? 1 : 0)) / steps); } },
    // Ground from hill(x) down, shaded by slope; tex adds grain.
    hill(f, l, { lit = 0.14, fade = 0, tex = 0.03 } = {}) { for (let x = 0; x < PW; x++) { const y0 = round(f(x)), s = f(x + 2) - f(x - 2); for (let y = y0; y < PH; y++) T.px(x, y, l + (y === y0 ? lit : 0) + (s > 0.6 ? -0.05 : s < -0.6 ? 0.05 : 0) * (bayer(x, y) > 0.4 ? 1 : 0) - fade * (y - y0) / 60 + (rnd(x * 7 + y * 131) > 0.86 ? tex : 0)); } },
    // A rock or peak: lit on the left, with a ragged cap of `cap` px.
    peak(cx, base, w, h, l, cap = 0, capL = 0.9, jag = 2) { for (let y = 0; y <= h; y++) { const k = y / h, half = w / 2 * k + (rnd(y, cx) - 0.5) * jag; for (let x = floor(-half); x <= half; x++) { const ridge = (rnd(y >> 1, cx + 5) - 0.5) * 3; T.px(cx + x, base - h + y, y < cap + (rnd(x + 50, cx) - 0.5) * 8 ? capL - (x > ridge ? 0.22 : 0) : l + (x < ridge ? 0.09 : -0.05) + (rnd(x * 3 + y * 17) > 0.9 ? 0.04 : 0)); } } },
    stars(n, seed = 0, y1 = 70) { for (let i = 0; i < n; i++) T.px(rnd(i, seed) * PW, rnd(i, seed + 1) * y1, 0.5 + rnd(i, seed + 2) * 0.5); },
    bare(x, y, len, a, l, d = 0) { if (d > 4 || len < 2) return; const x1 = x + cos(a) * len, y1 = y + sin(a) * len; T.line(x, y, x1, y1, l, d === 0 ? 3 : d === 1 ? 2 : 1); T.bare(x1, y1, len * 0.68, a - 0.35 - rnd(x1, d) * 0.4, l, d + 1); T.bare(x1, y1, len * 0.66, a + 0.3 + rnd(y1, d) * 0.45, l, d + 1); },
    cloud(x, y, w, l) { for (let i = 0; i < w / 4; i++) T.oval(x + i * 4 + rnd(i, x) * 3, y - rnd(i, y) * 4, 5, 2 + floor(rnd(i, x + 2) * 3), (dx, dy) => l - (dy > 0 ? 0.1 : 0)); },
    crystal(x, base, h, w, lean, l) { for (let y = 0; y < h; y++) { const k = y / h, half = y < w ? y * 0.5 : w / 2, cx = x + lean * (1 - k); for (let i = -half; i <= half; i++) T.px(cx + i, base - h + y, i < -half * 0.2 ? l + 0.3 : i < half * 0.5 ? l + 0.08 : l - 0.1); } },
  };
  return T;
}

const DRAW = {
  dunes() {
    const s = layer(0), f = layer(0.1), m = layer(0.28), n = layer(0.62);
    s.sky(0.2, 0.72, 100); s.disc(70, 44, 17, (x, y) => (y > 5 && (y - 5) % 4 === 0 ? 0.6 : 0.97));
    for (const [x, w, h] of [[150, 64, 44], [196, 40, 28], [30, 34, 22]]) for (let y = 0; y <= h; y++) for (let i = -round(w / 2 * y / h); i <= w / 2 * y / h; i++) f.px(x + i, 104 - h + y, (i < w * 0.08 * y / h ? 0.5 : 0.33) - (y % 4 === 0 ? 0.05 : 0));
    f.hill((x) => 101 + wave(x, [1, 2, 0], [3, 1.4, 1]), 0.42, { lit: 0.1 });
    m.hill((x) => 106 + wave(x, [2, 6, 1], [1, 4, 2]), 0.3, { lit: 0.22, fade: 0.2 });
    for (const [x, h] of [[40, 26], [58, 19], [164, 30]]) { m.rect(x, 106 - h, 6, h + 6, (i, j) => 0.4 - i * 0.04 - (j % 7 === 0 ? 0.08 : 0)); m.rect(x - 2, 104 - h, 10, 3, 0.48); }
    m.rect(38, 78, 30, 3, (i) => (i < 20 ? 0.46 : 0.4));
    n.hill((x) => 121 + wave(x, [2, 3, 4], [5, 1.3, 1]), 0.14, { lit: 0.2 });
    for (const [x, h] of [[20, 24], [112, 30], [200, 20]]) { n.rect(x, 121 - h, 4, h, (i) => (i ? 0.1 : 0.26)); n.rect(x - 6, 121 - h * 0.6, 6, 3, 0.13); n.rect(x - 6, 121 - h * 0.9, 3, h * 0.3, (i) => (i ? 0.1 : 0.24)); n.rect(x + 4, 121 - h * 0.45, 5, 3, 0.12); n.rect(x + 7, 121 - h * 0.75, 3, h * 0.3, 0.12); }
    return [s, f, m, n];
  },
  ember() {
    const s = layer(0), f = layer(0.08), m = layer(0.3), n = layer(0.66);
    s.sky(0.06, 0.4, 118); for (let i = 0; i < 40; i++) s.px(rnd(i) * PW, rnd(i, 1) * 100, 0.4 + rnd(i, 2) * 0.5);
    for (let i = 0; i < 24; i++) f.disc(round(122 + sin(i * 0.9) * (4 + i) + i * 1.6), 34 - i, 4 + floor(i / 3), (x, y) => (y < 0 ? 0.28 : 0.18) + i * 0.002);
    for (let y = 0; y < 82; y++) { const half = 9 + y * 0.82 + (rnd(y) - 0.5) * 3; for (let x = -floor(half); x < half; x++) f.px(120 + x, 36 + y, x < -half * 0.2 ? 0.27 : 0.17); }
    f.oval(120, 36, 9, 2, 0.98);
    for (const [x0, drift, len] of [[117, -0.35, 60], [122, 0.2, 78], [126, 0.62, 48]]) for (let y = 0; y < len; y++) f.rect(x0 + drift * y + sin(y * 0.4) * 2, 37 + y, y < 20 ? 2 : 1, 1, 0.95 - y * 0.006);
    for (const [x, w, h] of [[20, 60, 34], [214, 66, 40]]) f.peak(x, 120, w, h, 0.2);
    for (const [x, w, h] of [[14, 34, 30], [52, 26, 22], [96, 40, 18], [150, 30, 34], [190, 44, 24], [228, 24, 30]]) m.peak(x, 122, w, h, 0.15, 0, 0, 4);
    m.hill((x) => 116 + wave(x, [3, 2, 0], [7, 1, 2]), 0.13, { lit: 0.1 });
    for (let i = 0; i < 9; i++) { let x = rnd(i, 7) * PW, y = 117; for (let k = 0; k < 11; k++) { m.px(x, y, 0.95); m.px(x + 1, y, 0.7); x += rnd(k, i) * 3 - 1.5; y += 1; } }
    n.hill((x) => 122 + wave(x, [4, 2, 1]), 0.05, { lit: 0.45 });
    for (const [x, w, h] of [[34, 16, 34], [48, 12, 20], [128, 18, 28], [206, 14, 38], [220, 12, 22]]) n.peak(x, 125, w, h, 0.08, 0, 0, 2);
    return [s, f, m, n];
  },
  graves() {
    const s = layer(0), f = layer(0.1), m = layer(0.32), n = layer(0.68);
    s.sky(0.08, 0.46, 116); s.stars(40, 6, 70); s.disc(64, 40, 22, (x, y) => (hypot(x + 7, y + 5) < 4 || hypot(x - 6, y - 8) < 5 || hypot(x - 10, y + 7) < 2.5 ? 0.72 : 0.92)); s.cloud(40, 54, 60, 0.32); s.cloud(150, 30, 46, 0.22);
    f.hill((x) => 100 + wave(x, [1, 5, 0], [2, 3, 1]), 0.24, { lit: 0.1 });
    f.rect(166, 72, 30, 30, (i) => (i < 6 ? 0.3 : 0.2)); for (let y = 0; y < 18; y++) f.rect(181 - y, 54 + y, y * 2 + 1, 1, (i) => (i < y ? 0.32 : 0.2)); f.rect(176, 34, 10, 26, (i) => (i < 3 ? 0.32 : 0.2)); for (let y = 0; y < 16; y++) f.rect(181 - y * 0.35, 18 + y, y * 0.7 + 1, 1, 0.24); f.rect(180, 10, 2, 9, 0.3); f.rect(178, 13, 6, 2, 0.3); f.rect(179, 42, 4, 8, 0.9); f.rect(172, 82, 4, 8, 0.8); f.rect(186, 82, 4, 8, 0.8);
    m.hill((x) => 111 + wave(x, [2, 3, 2]), 0.16, { lit: 0.12 });
    for (const [x, l] of [[34, 19], [118, 23], [206, 20]]) m.bare(x, 114, l, -PI / 2 + (rnd(x) - 0.5) * 0.3, 0.1);
    for (let i = 0; i < 9; i++) { const x = i * 27 + 8, h = 9 + floor(rnd(i) * 5); m.rect(x, 113 - h, 8, h, (a) => (a < 2 ? 0.44 : 0.32)); m.rect(x + 1, 112 - h, 6, 1, 0.46); m.rect(x + 2, 116 - h, 4, 1, 0.16); }
    n.hill((x) => 122 + wave(x, [3, 1.5, 1]), 0.07, { lit: 0.16 });
    for (const [x, k] of [[26, 0], [90, 1], [160, 2], [214, 0]]) { if (k === 1) { n.rect(x + 5, 96, 4, 28, 0.2); n.rect(x, 102, 14, 4, 0.24); n.rect(x + 5, 96, 1, 28, 0.36); } else { n.rect(x, 104, 15, 20, (a) => (a < 2 ? 0.34 : 0.2)); n.oval(x + 7, 104, 7, 5, (a) => (a < -4 ? 0.34 : 0.2)); n.rect(x + 4, 107, 7, 1, 0.08); n.rect(x + 7, 104, 1, 8, 0.08); } for (let g = 0; g < 8; g++) n.line(x - 2 + g * 2.4, 124, x - 3 + g * 2.4 + rnd(g) * 3, 119, 0.14); }
    for (let x = 0; x < PW; x += 6) { if ((x > 20 && x < 46) || (x > 84 && x < 110)) continue; n.rect(x, 112, 1, 13, 0.1); n.px(x, 111, 0.22); } n.rect(48, 116, 34, 1, 0.1); n.rect(112, 116, 46, 1, 0.1);
    return [s, f, m, n];
  },
  cavern() {
    const s = layer(0), f = layer(0.1), m = layer(0.32), n = layer(0.68);
    s.sky(0.05, 0.2, 120); for (let i = 0; i < 60; i++) { const x = rnd(i) * PW, y = rnd(i, 1) * 120; s.px(x, y, 0.16); if (i % 4 === 0) s.px(x, y, 0.6); }
    const tite = (T, x, h, w, l) => { for (let y = 0; y < h; y++) { const half = w / 2 * (1 - y / h) ** 1.2; for (let i = -floor(half); i <= half; i++) T.px(x + i, y, l + (i < 0 ? 0.06 : -0.02)); } };
    for (let i = 0; i < 14; i++) tite(f, i * 17 + rnd(i) * 8, 18 + rnd(i, 2) * 34, 14, 0.15);
    for (const [x, h, w, k] of [[30, 46, 10, 6], [42, 30, 8, -5], [108, 64, 14, -4], [122, 40, 10, 9], [186, 52, 12, 5], [200, 32, 8, -6]]) f.crystal(x, 116, h, w, k, 0.4);
    f.hill((x) => 110 + wave(x, [2, 3, 0], [5, 2, 1]), 0.14, { lit: 0.1 });
    for (let i = 0; i < 9; i++) tite(m, i * 27 + rnd(i, 5) * 10, 10 + rnd(i, 6) * 24, 18, 0.08);
    for (const [x, h, w, k] of [[14, 24, 8, -5], [66, 40, 12, 7], [78, 24, 8, -3], [148, 48, 14, -6], [162, 28, 9, 6], [228, 34, 10, 4]]) m.crystal(x, 120, h, w, k, 0.56);
    m.hill((x) => 115 + wave(x, [3, 2, 1], [7, 1, 0]), 0.09, { lit: 0.16 });
    n.hill((x) => 122 + wave(x, [4, 2, 1]), 0.04, { lit: 0.14 });
    for (const [x, h, w, k] of [[36, 24, 9, 5], [48, 14, 6, -3], [130, 30, 11, -6], [212, 20, 8, 4]]) n.crystal(x, 125, h, w, k, 0.34);
    return [s, f, m, n];
  },
};
const baked = new Map();
/** A place's layers, back to front: [{ sp: scroll speed, L: luma, A: 1 where drawn }]. */
export function bakePlace(key) {
  if (!DRAW[key]) return null;
  if (!baked.has(key)) baked.set(key, DRAW[key]());
  return baked.get(key);
}
