// Skies: unlockable filters over the Quest title scene. Epic and Legendary only,
// and only from chests. Drawn on a coarse grid (one cell = 2 px) so they sit in the
// same pixel world as the stage. `grade` is a wash blended over the scene behind it.
export const SKY_CELL = 2;
// [key, name, rarity 2–3, what it does]
export const SKIES = [
  ['rain', 'Rainfall', 2, 'Steady rain, splashing on the road'],
  ['snow', 'Snowfall', 2, 'Slow flakes that settle'],
  ['dawn', 'Daybreak', 2, 'First light and long sun shafts'],
  ['moon', 'Moonlit', 2, 'Deep night, a moon and turning stars'],
  ['fog', 'Deep Fog', 2, 'Banks of fog rolling through'],
  ['dust', 'Sandstorm', 2, 'Grit blowing hard across the road'],
  ['storm', 'Thunderstorm', 3, 'Heavy rain and forked lightning'],
  ['aurora', 'Aurora', 3, 'Curtains of light over a dark sky'],
  ['matrix', 'Digital Rain', 3, 'The world seen as falling code'],
  ['signal', 'Signal Loss', 3, 'Tape tears, colour bleed and static'],
];
export const GRADES = {
  rain: ['rgba(90,130,190,.5)', 'hard-light'], snow: ['rgba(190,215,255,.22)', 'screen'], dawn: ['linear-gradient(to bottom, rgba(255,120,150,.5), rgba(255,190,90,.65) 70%)', 'overlay'],
  moon: ['linear-gradient(to bottom, rgba(40,60,170,.72), rgba(60,84,190,.5))', 'color'], fog: ['rgba(200,205,215,.16)', 'screen'], dust: ['rgba(230,160,70,.42)', 'overlay'],
  storm: ['rgba(70,90,160,.75)', 'color'], aurora: ['linear-gradient(to bottom, rgba(20,50,110,.85), rgba(40,120,120,.6))', 'color'], matrix: ['rgba(20,160,60,.9)', 'color'], signal: ['rgba(255,0,120,.12)', 'screen'],
};
const { sin, cos, abs, floor, max, min, PI } = Math;
const rnd = (i, s = 0) => { const v = sin(i * 127.1 + s * 311.7 + 1.3) * 43758.5453; return v - floor(v); };
const mod = (x, n) => ((x % n) + n) % n;
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

function drops(g, W, H, t, n, speed, slant, len, c) { g.fillStyle = c; for (let i = 0; i < n; i++) { const y = mod(rnd(i) * H + t * speed * (0.8 + rnd(i, 1) * 0.5), H + 10) - 6, x = mod(rnd(i, 2) * W - y * slant, W); for (let k = 0; k < len; k++) g.fillRect(floor(x - k * slant), floor(y + k), 1, 1); } }
function splash(g, W, G, t, n, c) { g.fillStyle = c; for (let i = 0; i < n; i++) { const k = mod(t * 2.4 + rnd(i), 1), x = floor(rnd(i + floor(t * 2.4 + rnd(i)) * 31, 3) * W), y = G - floor(sin(k * PI) * 2); g.fillRect(x - 1 - floor(k * 2), y, 1, 1); g.fillRect(x + 1 + floor(k * 2), y, 1, 1); } }
const PAINT = {
  rain(g, W, H, G, t) { drops(g, W, G, t, 70, 150, 0.22, 5, 'rgba(190,215,245,.55)'); splash(g, W, G, t, 16, 'rgba(220,235,255,.8)'); },
  snow(g, W, H, G, t) { for (let i = 0; i < 80; i++) { const near = i % 3 === 0, y = mod(rnd(i) * G + t * (near ? 20 : 11), G), x = mod(rnd(i, 2) * W + sin(t * 0.8 + i) * 5 + t * 4, W); g.fillStyle = near ? '#fff' : 'rgba(225,238,255,.7)'; g.fillRect(floor(x), floor(y), near ? 2 : 1, near ? 2 : 1); } g.fillStyle = 'rgba(245,250,255,.9)'; for (let x = 0; x < W; x++) g.fillRect(x, G - floor(1.4 + sin(x * 0.13) + sin(x * 0.05 + 1)), 1, 3); },
  dawn(g, W, H, G, t) { for (let i = 0; i < 6; i++) { const a = -0.5 + i * 0.34 + sin(t * 0.1 + i) * 0.05, f = 0.16 + 0.07 * sin(t * 0.5 + i * 2); for (let y = 0; y < G; y++) { const cx = W * 0.26 + y * a * 1.4, half = 2 + y * 0.09; for (let x = floor(cx - half); x < cx + half; x++) if (bayer(x, y) < f * (1 - y / G * 0.5) * 2) { g.fillStyle = 'rgba(255,225,150,.38)'; g.fillRect(x, y, 1, 1); } } } for (let i = 0; i < 18; i++) { const x = mod(rnd(i) * W + t * 3, W), y = G * rnd(i, 2) + sin(t + i) * 3; g.fillStyle = `rgba(255,240,190,${0.3 + 0.5 * max(0, sin(t * 1.5 + i))})`; g.fillRect(floor(x), floor(y), 1, 1); } },
  moon(g, W, H, G, t) { for (let i = 0; i < 60; i++) { const tw = 0.35 + 0.65 * abs(sin(t * (0.5 + rnd(i)) + i)); g.fillStyle = `rgba(225,232,255,${tw})`; g.fillRect(floor(mod(rnd(i) * W - t * 0.6, W)), floor(rnd(i, 1) * G * 0.62), 1, 1); } const cx = floor(W * 0.46), cy = 20, r = 10; for (let y = -r - 5; y <= r + 5; y++) for (let x = -r - 5; x <= r + 5; x++) { const d = Math.hypot(x, y); if (d <= r) { g.fillStyle = Math.hypot(x + 3, y - 2) < 2.4 || Math.hypot(x - 4, y + 3) < 3 || Math.hypot(x - 2, y - 6) < 1.6 ? '#c3cbe6' : '#f2f4ff'; g.fillRect(cx + x, cy + y, 1, 1); } else if (bayer(cx + x + 64, cy + y + 64) < (r + 5 - d) / 9) { g.fillStyle = 'rgba(200,212,255,.35)'; g.fillRect(cx + x, cy + y, 1, 1); } } const k = mod(t, 9); if (k < 0.7) { g.fillStyle = '#fff'; for (let i = 0; i < 9; i++) g.fillRect(floor(W * 0.2 + k * 90 - i * 2), floor(8 + k * 40 - i), 1, 1); } },
  fog(g, W, H, G, t) { for (let b = 0; b < 3; b++) for (let y = 0; y < 30; y++) for (let x = 0; x < W; x++) { const yy = G - 46 + b * 17 + y - 8, n = sin((x + t * (5 + b * 4)) * 0.045 + b * 2) + sin((x - t * 3) * 0.09 + y * 0.16 + b) * 0.6, d = (1 - abs(y - 15) / 15) * (0.5 + n * 0.3); if (yy < G + 2 && bayer(x, yy + 64) < d) { g.fillStyle = `rgba(222,226,234,${0.26 + b * 0.07})`; g.fillRect(x, yy, 1, 1); } } },
  dust(g, W, H, G, t) { for (let i = 0; i < 130; i++) { const y = floor(rnd(i) * G + sin(t * 2 + i) * 2), x = mod(rnd(i, 2) * W + t * (70 + rnd(i, 3) * 90), W + 20) - 10, len = 2 + floor(rnd(i, 4) * 7); g.fillStyle = `rgba(255,${200 + floor(rnd(i, 5) * 30)},130,${0.16 + rnd(i, 6) * 0.4})`; g.fillRect(floor(x), y, len, 1); } for (let x = 0; x < W; x++) for (let y = G - 26; y < G; y++) if (bayer(x, y) < (y - G + 26) / 26 * 0.5 * (0.6 + 0.4 * sin((x - t * 60) * 0.06))) { g.fillStyle = 'rgba(235,170,90,.45)'; g.fillRect(x, y, 1, 1); } },
  storm(g, W, H, G, t) { drops(g, W, G, t, 120, 220, 0.4, 7, 'rgba(170,200,245,.6)'); splash(g, W, G, t, 26, 'rgba(220,235,255,.85)'); const n = floor(t / 3.4), k = mod(t, 3.4) - 1.2 * rnd(n, 4); if (k > 0 && k < 0.5) { if (k < 0.12 || (k > 0.2 && k < 0.28)) { g.fillStyle = 'rgba(210,225,255,.3)'; g.fillRect(0, 0, W, G); } let x = W * (0.12 + rnd(n, 1) * 0.5); for (let y = 0; y < G * 0.82; y++) { x += (rnd(y + n * 77, 2) - 0.5) * 4.4; g.fillStyle = k < 0.3 ? '#fff' : 'rgba(170,195,255,.6)'; g.fillRect(floor(x), y, y < 40 ? 2 : 1, 1); if (rnd(y, n) > 0.93) { let bx = x; for (let q = 0; q < 13; q++) { bx += rnd(q + y, n) * 3 - (y % 2 ? 0 : 3); g.fillRect(floor(bx), y + q, 1, 1); } } } } },
  aurora(g, W, H, G, t) { for (let i = 0; i < 34; i++) { g.fillStyle = `rgba(230,240,255,${0.3 + 0.5 * abs(sin(t + i))})`; g.fillRect(floor(rnd(i) * W), floor(rnd(i, 1) * G * 0.6), 1, 1); } const C = [[90, 255, 170], [70, 220, 255], [190, 120, 255]]; for (let b = 0; b < 3; b++) for (let x = 0; x < W; x++) { const y0 = 16 + b * 11 + sin(x * 0.035 + t * 0.5 + b * 2) * 9 + sin(x * 0.09 - t * 0.3) * 3, len = 24 + 12 * sin(x * 0.06 + t * 0.8 + b), [r, gg, bb] = C[b]; for (let y = 0; y < len; y++) { const a = (1 - y / len) * (0.55 + 0.35 * sin(x * 0.4 + t * 2)); if (bayer(x, floor(y0 + y)) < a) { g.fillStyle = `rgba(${r},${gg},${bb},.62)`; g.fillRect(x, floor(y0 - y * 0.55 + 10), 1, 1); } } } },
  matrix(g, W, H, G, t) { const cols = floor(W / 5); for (let c = 0; c < cols; c++) { const sp = 11 + rnd(c) * 20, len = 8 + floor(rnd(c, 1) * 12), head = floor(mod(rnd(c, 2) * 60 + t * sp, G / 6 + len)); for (let k = 0; k < len; k++) { const row = head - k, y = row * 6; if (row < 0 || y > G - 5) continue; const a = 1 - k / len, sd = floor(rnd(c * 31 + row * 7) * 512 + (rnd(c + row, floor(t * 3)) > 0.9 ? floor(t * 8) : 0)); g.fillStyle = k === 0 ? '#e6ffe9' : `rgba(60,255,110,${a * 0.85})`; for (let b = 0; b < 15; b++) if (rnd(sd, b + 3) > 0.48) g.fillRect(c * 5 + (b % 3), y + floor(b / 3), 1, 1); } } },
  signal(g, W, H, G, t) { for (let i = 0; i < 420; i++) { const s = floor(t * 12); g.fillStyle = rnd(i, s) > 0.5 ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.3)'; g.fillRect(floor(rnd(i, s + 1) * W), floor(rnd(i, s + 2) * G), 2, 1); } const q = floor(t * 7); for (let b = 0; b < 5; b++) { if (rnd(b, q) < 0.45) continue; const y = floor(rnd(b, q + 3) * G), hh = 2 + floor(rnd(b, q + 5) * 7); g.fillStyle = 'rgba(255,0,90,.34)'; g.fillRect(0, y, W, hh); g.fillStyle = 'rgba(0,240,255,.34)'; g.fillRect(floor(rnd(b, q + 7) * 26), y + 1, W, hh); } const y = floor(mod(t * 26, G + 24) - 12); for (let k = 0; k < 9; k++) { g.fillStyle = `rgba(255,255,255,${0.2 - abs(k - 4) * 0.04})`; g.fillRect(0, y + k, W, 1); } for (let i = 0; i < 3; i++) for (let x = 0; x < W; x++) if (rnd(x + i * 999, floor(t * 14)) > 0.5) { g.fillStyle = '#fff'; g.fillRect(x, y + i * 3, 1, 1); } },
};
/** Paint sky `key` on a W×H grid whose ground line is at row G, at `t` seconds. */
export const paintSky = (g, key, W, H, G, t) => PAINT[key]?.(g, W, H, G, t);
