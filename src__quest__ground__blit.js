// Luma buffer -> tinted, dithered ImageData.
//
// The 1.8x gain and the 30-level quantise are the handoff's output stage: every
// renderer writes PRE-GAIN luma and nothing goes through useQuestSprites' land
// curve. (An earlier draft of the handoff said it should — that was a bug, and
// applying the curve here washes every area out.)

import { W, H } from './camera';

// ponytail: duplicated from lib/dither.js rather than imported — that module is
// the card renderer and pulls in sprite loading on import. It's the standard 8x8
// Bayer matrix; if a third copy ever appears, hoist it then.
const B8 = (() => {
  const m = [
    [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
  ];
  const a = new Float32Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) a[y * 8 + x] = (m[y][x] + 0.5) / 64;
  return a;
})();

export const hexToRGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// rows: optional [y0, y1) to re-blit only part of the frame.
//
// `baked.chunk` = { from, size } snaps the near field to square cells. The ground
// samples one luma per CSS pixel, but the monster is drawn at 3x and the hero at
// 1.9x, so their visible pixel is 2-3px — a 1px-detail floor beside them reads as
// a photograph behind a cartoon. Chunking only the near rows keeps the handoff's
// 1px far field, where fine detail is what stops the texture shimmering.
export function blit(baked, accentRGB, img, rows = null) {
  const { L, A, chunk } = baked;
  const D = img.data, [r, g, b] = accentRGB;
  const y0 = rows ? rows[0] : 0, y1 = rows ? rows[1] : H;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, p = i * 4;
      if (!A[i]) { D[p + 3] = 0; continue; }
      // A straight switch row reads as a seam across the floor, so the boundary
      // is broken up per column — the eye reads a ragged edge as texture.
      const c = chunk && y >= chunk.from + ((((x * 2654435761) >>> 24) % 14) - 7) ? chunk.size : 1;
      const sy = c > 1 ? Math.floor(y / c) * c : y;          // sample the cell, not the pixel
      const sx = c > 1 ? Math.floor(x / c) * c : x;
      const k = Math.min(1, 1.8 * L[sy * W + sx]);
      const v = Math.floor(k * 30 + B8[(sy & 7) * 8 + (sx & 7)]) / 30;
      D[p] = r * v; D[p + 1] = g * v; D[p + 2] = b * v; D[p + 3] = 255;
    }
  }
}
