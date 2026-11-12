// Ported verbatim from the handoff's stage-lab.js so a renderer's output can be
// compared pixel-for-pixel against the comps. Deliberately NOT lib/dither.js's
// hash — that one seeds differently and the comps were tuned against this.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const hash = (x, y, s) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

export function vn(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Band-limited fbm: octaves whose wavelength drops under ~3px fade out, so far
// ground settles to flat tone instead of shimmering.
export function fbm(x, y, w0, oct, fp, s) {
  let sum = 0, amp = 1, norm = 0, w = w0;
  for (let i = 0; i < oct; i++) {
    const k = clamp((w / fp - 2) / 2, 0, 1);
    if (k > 0) sum += amp * k * (vn(x / w, y / w, s + i) - 0.5);
    norm += amp;
    amp *= 0.55;
    w *= 0.5;
  }
  return (sum / norm) * 2;
}
