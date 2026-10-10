// Gains Quest — dither card engine (from the Quest Mode handoff's dither-kit.js,
// unchanged apart from being a module and loading assets from /quest/).
const BASE = '/quest/';
const OW = 360, OH = 504;
// detail rises with rarity: f = dither pixel size, cs = halftone cell, cw/ch/fs = ASCII cell + font
const DET = { C: { f: 3, cs: 9, cw: 7, ch: 11, fs: 10, scan: 3 }, R: { f: 2, cs: 6, cw: 5, ch: 8, fs: 8, scan: 3 },
  E: { f: 1.5, cs: 5, cw: 4, ch: 7, fs: 7, scan: 2 }, L: { f: 1, cs: 4, cw: 4, ch: 6, fs: 6, scan: 2 } };
const det = (c) => DET[c.rarity] || DET.C;
let AW = OW, AH = OH, SX = 1;
const setRes = (c) => { const f = det(c).f; AW = Math.round(OW / f); AH = Math.round(OH / f); SX = AW / OW; };
const B8 = (() => {
  const m = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]];
  const a = new Float32Array(64); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) a[y * 8 + x] = (m[y][x] + 0.5) / 64; return a;
})();
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb = (c, a) => (a == null ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
const lerp = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

const PAL = {
  mono: ['#0a0a0a', '#f0f0f0'], paper: ['#161616', '#cfcfc6'], amber: ['#140a02', '#e08a2c'], blood: ['#0a0202', '#e0321f'],
  toxic: ['#020a04', '#6dff3a'], violet: ['#0b0614', '#c084fc'], ice: ['#03101a', '#7fe3ff'], gold: ['#120c00', '#f5c046'],
  cobalt: ['#000000', '#1838ff', '#ff3a1f', '#ffe2d6'], acid: ['#000000', '#7c00ff', '#00ff9c', '#eafff6'],
  sunset: ['#0a0410', '#7c3aed', '#ff4fa3', '#fbbf24'], neon: ['#02030a', '#0057ff', '#00e5ff', '#ffffff'],
};
const STYLES = [['bayer', 'Bayer 1-bit'], ['stipple', 'Stipple'], ['halftone', 'Halftone'], ['glitch', 'Glitch'], ['ascii', 'ASCII'], ['crt', 'Scanline CRT']];
const RAR = {
  C: { name: 'COMMON', col: '#9a9a9a', anim: '' }, R: { name: 'RARE', col: '#60a5fa', anim: '' },
  E: { name: 'EPIC', col: '#c084fc', anim: 'idle' }, L: { name: 'LEGENDARY', col: '#fbbf24', anim: 'atk' },
};

const H = { warrior: ['Warlord', 10, 7], samurai: ['Samurai', 8, 6], brawler: ['Brawler', 10, 7], king: ['Fallen King', 8, 4], ronin: ['Ronin', 4, 4],
  oldking: ['Old King', 6, 6], mwarrior2: ['Sellsword', 8, 4], mwarrior3: ['Iron Guard', 10, 4], huntress: ['Huntress', 8, 5], huntress2: ['Archer', 10, 6],
  wizard: ['Wizard', 6, 8], ewizard: ['Warlock', 8, 8], ewizard2: ['Sorcerer', 8, 8], ewizard3: ['Hexblade', 10, 13], knight: ['Knight', 4, 0] };
const M = { big_demon: 'Slabfiend', ogre: 'Skyogre', big_zombie: 'Gravelord', chort: 'Wingimp', swampy: 'Ropeslime' };
const PT = { goblin: 'Goblin', imp: 'Imp', skelet: 'Skelly', tiny_zombie: 'Grub', muddy: 'Mudling', ice_zombie: 'Frostbite', orc_shaman: 'Shaman', necro: 'Hexling' };
const src = (k, anim) => (H[k] ? { base: `${BASE}sprites/${k}_${anim === 'atk' && H[k][2] ? 'atk' : 'idle'}_`, n: anim === 'atk' && H[k][2] ? H[k][2] : H[k][1] }
  : M[k] ? { base: `${BASE}sprites/${k}_`, n: 4 } : { base: `${BASE}sprites/pet_${k}_`, n: 4 });
const nm = (k) => (H[k] && H[k][0]) || M[k] || PT[k];

const ART = [["blindfold","The Blind Oracle"],["skull","Morning Reaper"],["profile","The Profile"],["emperor","The Emperor"],["wraith","The Wraith"],["visor","Iron Visor"],["ronin","The Ronin"],["gunner","Hollow Gunner"],["oath","Oathkeeper"],["contact","First Contact"],["watcher","The Watcher"],["muse","The Muse"],["signal","Signal Runner"],["crimson","Crimson Vigil"],["highkeep","Highkeep"],["verdant","Verdant Blade"],["witch","Antler Witch"],["scribe","Star Scribe"],["moss","Moss Sage"],["hermit","Red Moon Hermit"],["rampart","Rampart Wraith"],["archive","The Archivist"],["devotee","Green Devotee"],["eyeseer","The Eye Seer"],["cloudlord","Cloud Throne"],["tower","Tower Sentinel"],["pilgrim","Field Pilgrim"],["starveil","Star Veil"],["redeye","The Red Eye"],["labyrinth","Labyrinth"],["astrolabe","The Astrolabe"]];
const ADEFS = [[0,0,"bayer","mono","C"],[1,0,"stipple","paper","C"],[2,0,"bayer","mono","C"],[3,0,"stipple","mono","C"],[4,0,"bayer","paper","C"],[5,0,"stipple","mono","C"],[6,0,"bayer","mono","C"],[7,0,"stipple","paper","C"],[8,0,"bayer","mono","C"],[9,0,"stipple","mono","C"],[10,0,"bayer","paper","C"],[11,0,"stipple","mono","C"],[12,0,"bayer","mono","C"],[13,0,"stipple","paper","C"],[14,0,"bayer","mono","C"],[15,0,"stipple","mono","C"],[16,0,"bayer","paper","C"],[17,0,"stipple","mono","C"],[18,0,"bayer","mono","C"],[19,0,"stipple","paper","C"],[20,0,"bayer","mono","C"],[21,0,"stipple","mono","C"],[22,0,"bayer","paper","C"],[23,0,"stipple","mono","C"],[24,0,"bayer","mono","C"],[25,0,"stipple","paper","C"],[26,0,"bayer","mono","C"],[27,0,"stipple","mono","C"],[28,0,"bayer","paper","C"],[29,0,"stipple","mono","C"],[30,0,"bayer","mono","C"],[0,"Amber","halftone","amber","R"],[1,"Ember","halftone","blood","R"],[3,"Gilded","halftone","gold","R"],[6,"Blood Oath","stipple","blood","R"],[9,"Wire","ascii","toxic","R"],[16,"Bone","ascii","mono","R"],[22,"Candlelight","halftone","gold","R"],[25,"Brimstone","halftone","blood","R"],[27,"Starlight","bayer","ice","R"],[29,"Eclipse","halftone","blood","R"],[11,"Phosphor","crt","amber","E"],[12,"Terminal","ascii","mono","E"],[4,"Haunt","ascii","ice","E"],[23,"Third Eye","crt","violet","E"],[28,"Omen","stipple","toxic","E"],[24,"Ascension","stipple","violet","E"],[6,"Shogun","glitch","cobalt","L"],[30,"Astral","glitch","sunset","L"],[0,"Prophecy","glitch","neon","L"]];
const DEFS = [
  ['warrior', 0, 'bayer', 'mono', 'C'], ['samurai', 0, 'stipple', 'mono', 'C'], ['brawler', 0, 'bayer', 'paper', 'C'], ['king', 0, 'stipple', 'mono', 'C'],
  ['ronin', 0, 'bayer', 'mono', 'C'], ['oldking', 0, 'bayer', 'paper', 'C'], ['mwarrior2', 0, 'stipple', 'mono', 'C'], ['mwarrior3', 0, 'bayer', 'mono', 'C'],
  ['huntress', 0, 'stipple', 'paper', 'C'], ['huntress2', 0, 'bayer', 'mono', 'C'], ['wizard', 0, 'stipple', 'mono', 'C'], ['ewizard', 0, 'bayer', 'mono', 'C'],
  ['knight', 0, 'bayer', 'paper', 'C'], ['goblin', 0, 'stipple', 'mono', 'C'], ['imp', 0, 'bayer', 'mono', 'C'], ['skelet', 0, 'bayer', 'paper', 'C'],
  ['tiny_zombie', 0, 'stipple', 'mono', 'C'], ['muddy', 0, 'bayer', 'mono', 'C'], ['swampy', 0, 'stipple', 'paper', 'C'], ['chort', 0, 'bayer', 'mono', 'C'],
  ['warrior', 'Amber Dusk', 'halftone', 'amber', 'R'], ['samurai', 'Blood Oath', 'stipple', 'blood', 'R'], ['ewizard2', 0, 'ascii', 'toxic', 'R'],
  ['ewizard3', 0, 'bayer', 'violet', 'R'], ['huntress', 'Frost', 'bayer', 'ice', 'R'], ['oldking', 'Gilded', 'halftone', 'gold', 'R'],
  ['big_demon', 0, 'halftone', 'blood', 'R'], ['ogre', 0, 'crt', 'amber', 'R'], ['big_zombie', 0, 'stipple', 'toxic', 'R'], ['ice_zombie', 0, 'bayer', 'ice', 'R'],
  ['orc_shaman', 0, 'ascii', 'gold', 'R'], ['necro', 0, 'stipple', 'violet', 'R'], ['mwarrior3', 'Steel', 'crt', 'ice', 'R'], ['brawler', 'Rust', 'halftone', 'amber', 'R'],
  ['ronin', 'Ink', 'ascii', 'mono', 'R'],
  ['warrior', 'Ember', 'crt', 'amber', 'E'], ['king', 'Gilt', 'stipple', 'gold', 'E'], ['wizard', 'Venom', 'ascii', 'toxic', 'E'], ['ewizard', 'Dusk', 'bayer', 'violet', 'E'],
  ['huntress2', 'Hoarfrost', 'halftone', 'ice', 'E'], ['big_demon', 'Furnace', 'crt', 'blood', 'E'], ['mwarrior2', 'Glacier', 'stipple', 'ice', 'E'],
  ['samurai', 'Red Rain', 'halftone', 'blood', 'E'], ['knight', 'Phosphor', 'crt', 'toxic', 'E'], ['big_zombie', 'Grave Signal', 'ascii', 'violet', 'E'],
  ['warrior', 'The Breaker', 'glitch', 'cobalt', 'L'], ['ewizard3', 'Null', 'glitch', 'acid', 'L'], ['samurai', 'Last Light', 'glitch', 'sunset', 'L'],
  ['ewizard2', 'Starfall', 'glitch', 'neon', 'L'], ['king', 'Crowned in Ash', 'glitch', 'cobalt', 'L'],
];
const CARDS = ADEFS.map(([a, t, style, pal, r], i) => ({
  id: i + 1, num: String(i + 1).padStart(2, '0'), key: ART[a][0], art: `${BASE}art/${ART[a][0]}.png`, name: t ? `${ART[a][1]} · ${t}` : ART[a][1],
  style, pal, rarity: r, anim: !!RAR[r].anim, src: null,
}));
const SPRITE_CARDS = DEFS.map(([k, t, style, pal, r], i) => ({
  id: 100 + i, key: k, name: t ? `${nm(k)}, ${t}` : nm(k), style, pal, rarity: r, anim: !!RAR[r].anim, src: src(k, RAR[r].anim),
}));

const imgs = new Map();
const load = (s) => {
  if (!imgs.has(s)) imgs.set(s, new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = s; }));
  return imgs.get(s);
};
const bboxOf = (ims) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const im of ims) {
    const c = cv(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, im.width, im.height).data;
    for (let y = 0; y < im.height; y++) for (let xx = 0; xx < im.width; xx++) if (d[(y * im.width + xx) * 4 + 3] > 20) {
      if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? { x: 0, y: 0, w: ims[0].width, h: ims[0].height } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
const levels = (L) => {
  const s = Float32Array.from(L).sort();
  const lo = s[Math.floor(s.length * 0.02)], hi = s[Math.floor(s.length * 0.985)], k = 1 / Math.max(0.05, hi - lo);
  for (let i = 0; i < L.length; i++) L[i] = Math.min(1, Math.max(0, (L[i] - lo) * k));
  return L;
};
const lumOf = (c) => {
  const d = c.getContext('2d').getImageData(0, 0, AW, AH).data, L = new Float32Array(AW * AH);
  for (let i = 0; i < L.length; i++) L[i] = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255;
  return levels(L);
};
const isLight = (card) => card.style === 'halftone' || card.pal === 'paper';
function spriteFrame(im, bb, light) {
  const c = cv(AW, AH), x = c.getContext('2d');
  const g = x.createRadialGradient(AW * 0.5, AH * 0.42, 6, AW * 0.5, AH * 0.45, AH * 0.7);
  if (light) { g.addColorStop(0, '#f2f2f2'); g.addColorStop(1, '#9a9a9a'); } else { g.addColorStop(0, '#5c5c5c'); g.addColorStop(0.55, '#1c1c1c'); g.addColorStop(1, '#000'); }
  x.fillStyle = g; x.fillRect(0, 0, AW, AH);
  x.fillStyle = light ? 'rgba(40,40,40,.35)' : 'rgba(140,140,140,.16)';
  x.beginPath(); x.ellipse(AW * 0.5, AH * 0.915, AW * 0.4, 6, 0, 0, Math.PI * 2); x.fill();
  const s = Math.min((AW * 0.9) / bb.w, (AH * 0.78) / bb.h), dw = bb.w * s, dh = bb.h * s;
  const t = cv(bb.w * 3, bb.h * 3), tx = t.getContext('2d'); tx.imageSmoothingEnabled = false;
  tx.drawImage(im, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w * 3, bb.h * 3);
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.filter = light ? 'contrast(1.15)' : 'contrast(1.25) brightness(1.2)';
  x.drawImage(t, (AW - dw) / 2, AH * 0.92 - dh, dw, dh);
  x.filter = 'none';
  return lumOf(c);
}

const preps = new Map();
function prepare(card, art) {
  art = art || card.art;
  const light = isLight(card);
  const key = `${card.id}|${det(card).f}|${light}|${art ? art.length + art.slice(-32) : ''}`;
  if (preps.has(key)) return preps.get(key);
  const p = (async () => {
    if (art) {
      const im = await load(art); if (!im) return null; setRes(card);
      const c = cv(AW, AH), x = c.getContext('2d'), s = Math.max(AW / im.width, AH / im.height) * 1.08;
      x.imageSmoothingQuality = 'high';
      x.drawImage(im, (AW - im.width * s) / 2, (AH - im.height * s) / 2, im.width * s, im.height * s);
      return { frames: [lumOf(c)], w: AW, h: AH };
    }
    const n = card.anim ? card.src.n : 1;
    const ims = (await Promise.all(Array.from({ length: n }, (_, i) => load(`${card.src.base}${i}.png`)))).filter(Boolean);
    if (!ims.length) return null; setRes(card);
    const bb = bboxOf(ims);
    return { frames: ims.map((im) => spriteFrame(im, bb, light)), w: AW, h: AH };
  })();
  preps.set(key, p); return p;
}

const low = cv(OW, OH);
function render(out, card, prep, t) {
  if (!out || !prep) return;
  if (out.width !== OW) out.width = OW;
  if (out.height !== OH) out.height = OH;
  const ctx = out.getContext('2d');
  const pal = (PAL[card.pal] || PAL.mono).map(hx), dark = pal[0], light = pal[pal.length - 1];
  const anim = card.anim, tt = anim ? t : 0;
  const L = prep.frames[anim ? Math.floor(t * 7) % prep.frames.length : 0];
  const st = card.style, dt = det(card);
  AW = prep.w || OW; AH = prep.h || OH; SX = AW / OW;
  if (low.width !== AW || low.height !== AH) { low.width = AW; low.height = AH; }
  if (st === 'halftone') {
    ctx.fillStyle = rgb(light); ctx.fillRect(0, 0, OW, OH); ctx.fillStyle = rgb(dark);
    const cs = dt.cs;
    for (let cy = 0, row = 0; cy < OH + cs; cy += cs, row++) for (let cx = (row % 2) * (cs / 2) - cs; cx < OW + cs; cx += cs) {
      const lx = Math.min(AW - 1, Math.max(0, Math.floor((cx + cs / 2) * SX))), ly = Math.min(AH - 1, Math.max(0, Math.floor((cy + cs / 2) * SX)));
      let r = cs * 0.64 * Math.sqrt(1 - L[ly * AW + lx]);
      if (anim) r *= 1 + 0.16 * Math.sin(tt * 3 + cy * 0.06 + cx * 0.02);
      if (r < 0.35) continue;
      ctx.beginPath(); ctx.arc(cx + cs / 2, cy + cs / 2, r, 0, Math.PI * 2); ctx.fill();
    }
    const sd = Math.floor(tt * 8);
    for (let i = 0; i < 700; i++) ctx.fillRect(Math.floor(hash(i, 1, sd) * OW), Math.floor(hash(i, 2, sd) * OH), 1, 1);
    return;
  }
  if (st === 'ascii') {
    ctx.fillStyle = rgb(dark); ctx.fillRect(0, 0, OW, OH);
    ctx.font = `500 ${dt.fs}px 'DM Mono', monospace`; ctx.textBaseline = 'top';
    const ramp = ' .:-=+*#%@', cw = dt.cw, ch = dt.ch, sd = Math.floor(tt * 6);
    for (let r = 0; r * ch < OH; r++) for (let c = 0; c * cw < OW; c++) {
      let v = L[Math.min(AH - 1, Math.floor((r * ch + 3) * SX)) * AW + Math.min(AW - 1, Math.floor((c * cw + 2) * SX))];
      if (anim) v += (hash(c, r, sd) - 0.5) * 0.14;
      const idx = Math.max(0, Math.min(ramp.length - 1, Math.floor(v * ramp.length)));
      if (idx === 0) continue;
      ctx.fillStyle = rgb(lerp(dark, light, 0.3 + 0.7 * Math.min(1, v)));
      ctx.fillText(ramp[idx], c * cw, r * ch);
    }
    return;
  }
  const lx = low.getContext('2d'), img = lx.createImageData(AW, AH), D = img.data, n = pal.length;
  const o = anim ? 0.07 * Math.sin(tt * 1.6) : 0, sd = anim ? Math.floor(tt * 10) : 0, gs = anim ? Math.floor(tt * 8) : 3;
  for (let y = 0; y < AH; y++) {
    let shift = 0, swap = false;
    if (st === 'glitch') { const b = Math.floor(y / Math.max(3, Math.round(7 * SX))), r = hash(b, 0, gs); if (r < 0.22) shift = Math.round((hash(b, 1, gs) - 0.5) * 36 * SX); swap = r < 0.05; }
    for (let x = 0; x < AW; x++) {
      const i = y * AW + x, th = B8[(y & 7) * 8 + (x & 7)];
      let c;
      if (st === 'stipple') c = Math.pow(L[i], 1.15) > hash(x, y, sd) * 0.92 + 0.04 ? light : dark;
      else if (st === 'glitch') {
        const sx = Math.min(AW - 1, Math.max(0, x - shift));
        let k = Math.round(L[y * AW + sx] * (n - 1) + (th - 0.5));
        k = Math.max(0, Math.min(n - 1, k)); if (swap) k = (k + 1) % n; c = pal[k];
      } else c = L[i] + o > th ? light : dark;
      const p = i * 4; D[p] = c[0]; D[p + 1] = c[1]; D[p + 2] = c[2]; D[p + 3] = 255;
    }
  }
  lx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(low, 0, 0, OW, OH);
  if (st === 'glitch' && anim && hash(gs, 9, 9) < 0.35) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35;
    ctx.drawImage(low, 0, 0, AW, AH, Math.round((hash(gs, 3, 3) - 0.5) * 16), 0, OW, OH);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  if (st === 'crt') {
    ctx.fillStyle = 'rgba(0,0,0,.38)'; for (let y = 0; y < OH; y += dt.scan) ctx.fillRect(0, y, OW, Math.max(1, dt.scan - 1));
    if (anim) { const y0 = ((tt * 70) % (OH + 60)) - 30; ctx.fillStyle = rgb(light, 0.12); ctx.fillRect(0, y0, OW, 40); }
  }
}
function thumb(card, prep) {
  const c = cv(OW, OH); render(c, card, prep, 0);
  return new Promise((res) => c.toBlob((b) => res(b ? `url(${URL.createObjectURL(b)})` : 'none'), 'image/png'));
}

export { CARDS, SPRITE_CARDS, PAL, STYLES, RAR, prepare, render, thumb, OW, OH, hx };
