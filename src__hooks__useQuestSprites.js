import { useEffect, useState } from 'react';
import { ASSET, landFilesOf } from '../lib/quest';
import { colourFns } from '../lib/questSkins';

// Quest sprites are recoloured once per skin at load and cached as object URLs
// for the whole session, the way the handoff prototype does it. How a luma maps
// to a colour is the skin's business (tint / duo / pal4 / grad — colourFns);
// the loop here only walks the pixels.
const cache = new Map(); // `${id}|${what}` → Promise
const resolved = new Map(); // `${id}|${what}` → resolved value (already decoded)

const loadImg = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
const decodeCssUrl = (cssUrl) => {
  if (!cssUrl) return Promise.resolve();
  const m = cssUrl.match(/^url\((.*)\)$/);
  if (!m) return Promise.resolve();
  return new Promise((res) => {
    const im = new Image();
    im.decoding = 'async';
    im.src = m[1];
    if (im.decode) im.decode().then(res, res);
    else { im.onload = res; im.onerror = res; }
  });
};
const toUrl = (cv) => new Promise((res) => cv.toBlob((b) => res(b ? URL.createObjectURL(b) : null)));

async function recolour(src, fn, mix = 0) {
  const im = await loadImg(src);
  if (!im) return null;
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let p = 0; p < d.data.length; p += 4) {
    if (!d.data[p + 3]) continue;
    const [r, g, b] = fn((0.3 * d.data[p] + 0.59 * d.data[p + 1] + 0.11 * d.data[p + 2]) / 255);
    d.data[p] = r + (d.data[p] - r) * mix; d.data[p + 1] = g + (d.data[p + 1] - g) * mix; d.data[p + 2] = b + (d.data[p + 2] - b) * mix;
  }
  ctx.putImageData(d, 0, 0);
  const u = await toUrl(c);
  if (!u) return null;
  const css = `url(${u})`;
  await decodeCssUrl(css);
  return css;
}

const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const memo = (key, make) => {
  if (!cache.has(key)) {
    cache.set(key, Promise.resolve().then(make).then((v) => { resolved.set(key, v); return v; }));
  }
  return cache.get(key);
};
// The base skin carries the scene tint, which the Scene picker can still change,
// so the cache key has to move with it. A real skin's tint never changes.
const idOf = (skin) => `${skin.id}|${skin.tint}|${skin.theme}`;

/** An animation's frames: { tint: [css url…], hit: [css url…] }. */
function frames(skin, key, count) {
  return memo(`${idOf(skin)}|${key}`, async () => {
    const { spr, hit, mix } = colourFns(skin);
    const fr = await Promise.all(Array.from({ length: count }, async (_, i) => {
      const src = `${ASSET}sprites/${key}_${i}.png`;
      const [t, h] = await Promise.all([recolour(src, spr, mix), recolour(src, hit)]);
      return { t, h };
    }));
    return { tint: fr.map((x) => x.t), hit: fr.map((x) => x.h) };
  });
}

function lands(skin) {
  return memo(`${idOf(skin)}|lands`, async () => {
    const { land, mix } = colourFns(skin);
    const r = await Promise.all(landFilesOf(skin.theme).map(async (n) => [n, await recolour(`${ASSET}sprites/land_${n}.png`, land, mix)]));
    return Object.fromEntries(r);
  });
}
function strip(skin) {
  return memo(`${idOf(skin)}|strip`, () => {
    const { land, mix } = colourFns(skin);
    // A tint skin keeps the strip's own slightly darker ramp (it only ever
    // existed because land was one colour under a curve); every other mode
    // maps a luma to a fixed colour, so the strip is just more land.
    const rgb = rgbOf(skin.tint);
    const fn = skin.mode === 'tint'
      ? (l) => { const k = 0.05 + 0.5 * Math.pow(l, 1.1); return rgb.map((c) => c * k); }
      : land;
    return recolour(`${ASSET}sprites/dungeon_strip.png`, fn, mix);
  });
}

/**
 * Fill the cache for a skin and job list without subscribing to it. The recolour
 * is the slowest thing the quest screen does on its first open — a second of
 * fetch, per-pixel work and toBlob, which used to land in the middle of the
 * decode wave and leave the scene black while it played. Run from wherever the
 * user is before they get there and the stage is already drawn when it arrives.
 * Returns a stop function.
 */
export function warmQuestSprites(skin, jobs) {
  // One set per idle slot, not all at once: the whole recolour is about a
  // second of work, and firing it in one go costs the screen you're actually
  // looking at a visible hitch. The backdrop goes first — a missing land reads
  // as a black stage, a missing attack frame doesn't show at all on the title.
  const queue = [() => lands(skin), () => strip(skin), ...jobs.map(([key, n]) => () => frames(skin, key, n))];
  let id = 0, live = true;
  const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 32));
  const pump = () => {
    const job = queue.shift();
    if (!job || !live) return;
    job().then(() => { if (live) id = idle(pump); });
  };
  id = idle(pump);
  return () => { live = false; if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id); else clearTimeout(id); };
}

function readResolved(skin, jobs) {
  const base = idOf(skin);
  const spr = {};
  for (const [key] of jobs) {
    const v = resolved.get(`${base}|${key}`);
    if (v) spr[key] = v;
  }
  return {
    sprites: spr,
    lands: resolved.get(`${base}|lands`) || null,
    strip: resolved.get(`${base}|strip`) || null,
  };
}

export function isQuestSpritesReady(skin, jobs) {
  const base = idOf(skin);
  if (!resolved.has(`${base}|lands`) || !resolved.has(`${base}|strip`)) return false;
  return jobs.every(([key]) => resolved.has(`${base}|${key}`));
}

export async function preloadQuestSprites(skin, jobs) {
  if (isQuestSpritesReady(skin, jobs)) return readResolved(skin, jobs);
  const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
  const tasks = [() => lands(skin), () => strip(skin), ...jobs.map(([key, n]) => () => frames(skin, key, n))];
  for (const fn of tasks) {
    await fn().catch(() => null);
    await yieldFrame();
  }
  return readResolved(skin, jobs);
}

/**
 * Recoloured sprites for the scene. `skin` is a questSkins entry (BASE carrying
 * the scene tint when no skin is picked); `jobs` is [[key, frameCount], …].
 * Returns { sprites: { key: {tint, hit} }, lands, strip } filling in as they load.
 */
export default function useQuestSprites(skin, jobs) {
  const sig = `${idOf(skin)}|${jobs.map((j) => j.join(':')).join(',')}`;
  const [state, setState] = useState(() => readResolved(skin, jobs));
  useEffect(() => {
    const cur = readResolved(skin, jobs);
    setState(cur);
    if (isQuestSpritesReady(skin, jobs)) return undefined;
    let live = true;
    jobs.forEach(([key, n]) => frames(skin, key, n).then((f) => live && setState((s) => ({ ...s, sprites: { ...s.sprites, [key]: f } }))));
    lands(skin).then((l) => live && setState((s) => ({ ...s, lands: l })));
    strip(skin).then((u) => live && setState((s) => ({ ...s, strip: u })));
    return () => { live = false; };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
