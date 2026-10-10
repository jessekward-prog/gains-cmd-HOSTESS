import { useEffect, useState } from 'react';
import { ASSET } from '../lib/quest';

// Quest sprites are recoloured once per tint at load (two-tone: dark → near
// black, light → the tint; a white copy is the "hit" flash) and cached as
// object URLs for the whole session, the way the handoff prototype does it.
const cache = new Map(); // `${hex}|${what}` → Promise

const loadImg = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
const toUrl = (cv) => new Promise((res) => cv.toBlob((b) => res(b ? URL.createObjectURL(b) : null)));
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

async function recolour(src, fn) {
  const im = await loadImg(src);
  if (!im) return null;
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let p = 0; p < d.data.length; p += 4) {
    if (!d.data[p + 3]) continue;
    const [r, g, b] = fn((0.3 * d.data[p] + 0.59 * d.data[p + 1] + 0.11 * d.data[p + 2]) / 255);
    d.data[p] = r; d.data[p + 1] = g; d.data[p + 2] = b;
  }
  ctx.putImageData(d, 0, 0);
  const u = await toUrl(c);
  return u ? `url(${u})` : null;
}

const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

/** An animation's frames: { tint: [css url…], hit: [css url…] }. */
function frames(hex, key, count) {
  return memo(`${hex}|${key}`, async () => {
    const rgb = rgbOf(hex);
    const fr = await Promise.all(Array.from({ length: count }, async (_, i) => {
      const src = `${ASSET}sprites/${key}_${i}.png`;
      const [t, h] = await Promise.all([
        recolour(src, (l) => { const k = 0.28 + 0.72 * Math.pow(l, 0.75); return rgb.map((c) => c * k); }),
        recolour(src, (l) => { const k = 0.55 + 0.45 * Math.pow(l, 0.75); return [255 * k, 255 * k, 255 * k]; }),
      ]);
      return { t, h };
    }));
    return { tint: fr.map((x) => x.t), hit: fr.map((x) => x.h) };
  });
}

const LAND_FILES = ['bg', 'mountain-far', 'mountains', 'trees', 'foreground-trees'];
function lands(hex) {
  return memo(`${hex}|lands`, async () => {
    const rgb = rgbOf(hex);
    const r = await Promise.all(LAND_FILES.map(async (n) => [n, await recolour(`${ASSET}sprites/land_${n}.png`,
      (l) => { const k = 0.04 + 0.62 * Math.pow(l, 1.2); return rgb.map((c) => c * k); })]));
    return Object.fromEntries(r);
  });
}
function strip(hex) {
  return memo(`${hex}|strip`, () => recolour(`${ASSET}sprites/dungeon_strip.png`,
    (l) => { const k = 0.05 + 0.5 * Math.pow(l, 1.1); return rgbOf(hex).map((c) => c * k); }));
}

/**
 * Tinted sprites for the scene. `jobs` is [[key, frameCount], …]; returns
 * { sprites: { key: {tint, hit} }, lands, strip } filling in as they load.
 */
export default function useQuestSprites(hex, jobs) {
  const sig = `${hex}|${jobs.map((j) => j.join(':')).join(',')}`;
  const [state, setState] = useState({ sprites: {}, lands: null, strip: null });
  useEffect(() => {
    let live = true;
    setState({ sprites: {}, lands: null, strip: null });
    jobs.forEach(([key, n]) => frames(hex, key, n).then((f) => live && setState((s) => ({ ...s, sprites: { ...s.sprites, [key]: f } }))));
    lands(hex).then((l) => live && setState((s) => ({ ...s, lands: l })));
    strip(hex).then((u) => live && setState((s) => ({ ...s, strip: u })));
    return () => { live = false; };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
