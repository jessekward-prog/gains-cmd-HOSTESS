// Quest Mode skins: one more look for the quest screens, next to Phosphor.
// Tokens lifted verbatim from the design handoff (`Quest Themes.dc.html`); see
// `~/Desktop/App beta screens/design_handoff_quest_skins/README.md` for the schema.
// A skin restyles only — the 340px stage, card order, footer grid and nav bar
// are the same ones Quest lays out today.
//
// BASE is Phosphor, i.e. exactly what the stage renders with no skin picked, so
// every hardcoded colour QuestStage used to carry now reads through a token and
// comes back unchanged.

const MAN = "'Manrope', system-ui, sans-serif";
// The base skin's headings follow the font picker; a skin's pin Manrope.
const MANQ = "'Manrope', var(--font-display), sans-serif";
const MONO = "'DM Mono', ui-monospace, monospace";
const SERIF = "Georgia, 'Times New Roman', serif";
const mix = (c, p, b = 'transparent') => `color-mix(in srgb, ${c} ${p}%, ${b})`;

// ── Theme tokens. Base = Phosphor (today); each theme overrides pieces. ──
export const BASE = {
  theme: 'fantasy', tint: '#ff9a3c', mode: 'tint', m: 0.1,
  st: { bg: '#0e0e0e', sky: '#050505', ground: '#070604', line: null, scan: 0.28, vig: 'rgba(0,0,0,.6)', txt: '#f0f0f0', rad: 28, border: 'none', overlay: null },
  box: { background: '#171717', borderRadius: 14 }, boxTxt: '#f0f0f0', boxSub: '#bbb', boxLv: '#999', nameMono: false, upper: false,
  hp: 'classic', hpTrack: '#222', hpLab: '#f59e0b', xp: '#60a5fa', xpLab: '#60a5fa', seg: false, segOff: '#222', hatch: false,
  chip: { padding: '5px 9px', borderRadius: 8, background: 'rgba(5,5,5,.75)', color: '#f0f0f0' },
  msg: { background: '#050505', borderRadius: 16, boxShadow: 'inset 0 0 0 1px #2a2a2a', color: '#f0f0f0' }, pre: ['>', '#ff2222', 0.7],
  dmg: '#ff2222', dmgShadow: 'none', stamp: false, slash: null, flash: '#f0f0f0', wipe: '#050505', glow: true, zz: '#cfd8ff', shadow: 'rgba(0,0,0,.55)',
  title: { font: MANQ, size: 44, weight: 800, track: '-0.04em', color: '#f0f0f0', shadow: '0 2px 0 #050505, 0 0 18px rgba(0,0,0,.8)', words: ['GAINS', 'QUEST'], clip: null }, lvCol: '#c08457',
  P: { bg0: '#000000', bg1: '#0d0a06', bg2: '#120d08', bg3: '#18110a', tx: '#ff9a3c', tx2: '#c4751f', tx3: '#8a5010', acc: 'rgba(255,0,0,0.25)', on: '#ffffff', ok: '#b6ff5a', err: '#ff5a6a',
    R: 28, rb: 18, rs: 14, line: 'none', shadow: 'none', disp: MAN, label: '#ff6b5a', battle: '#ff2222', rest: '#f59e0b', okFill: null, okInk: null, btnFx: 'none', navBg: '#000', navCol: 'rgba(255,0,0,.6)' },
  crt: 0.15, roll: 'rgba(255,0,0,.05)',
};
const DEFS = [
  { id: 'q-cur', badge: 'CURRENT', name: 'Phosphor', desc: 'Quest today, the starting point: Phosphor amber sprites, the red accent at 25%, light CRT lines and the rolling scan line.' },
  { id: 'q-3a', name: 'Cabinet', desc: 'From 2A: red tint, edges squared off to 0–8px, block HP, a mono uppercase HUD and an arcade attack key with a lip that presses down.',
    tint: '#ff2222', m: 0,
    st: { bg: '#000', sky: '#000', ground: '#0a0000', line: 'inset 0 3px 0 #ff2222', scan: 0.35, vig: 'rgba(0,0,0,.75)', txt: '#fff', rad: 10 },
    box: { background: '#000', borderRadius: 0, border: '2px solid #ff2222' }, boxTxt: '#fff', boxSub: '#ddd', nameMono: true, upper: true, hp: '#ff2222', seg: true, segOff: '#2a0606', xp: '#fbbf24', xpLab: '#fbbf24',
    chip: { padding: '4px 8px', borderRadius: 0, background: '#000', border: '2px solid #ff2222', color: '#fff' },
    msg: { background: '#000', borderRadius: 0, border: '2px solid #ff2222', color: '#fff', textTransform: 'uppercase', letterSpacing: '.04em' }, pre: ['▶', '#ff2222', 1],
    dmgShadow: '2px 2px 0 #000', title: { font: MONO, size: 34, weight: 500, track: '.02em', color: '#fff', shadow: '3px 3px 0 #ff2222, 6px 6px 0 #3a0000', words: ['GAINS', 'QUEST'] }, lvCol: '#fbbf24',
    P: { bg0: '#050505', bg1: '#0c0c0c', bg2: '#151515', bg3: '#222', tx: '#f4f4f4', tx2: '#b0b0b0', tx3: '#777', acc: '#ff2222', on: '#fff', ok: '#22c55e', err: '#ff4d4d', R: 8, rb: 8, rs: 6,
      line: '2px solid #2a0b0b', label: '#ff2222', btnFx: 'arcade', upper: true, navCol: '#ff2222' } },
  { id: 'q-3b', name: 'Field Journal', desc: 'From 2C: the art redrawn as ink on paper, an outlined HUD and a hatched HP bar, damage shown as a red stamp, and a hard drop shadow on the cards.',
    mode: 'duo', spr: [[36, 31, 26], [150, 132, 108], 1.1], land: [[205, 190, 162], [239, 232, 218], 0.9], hit: [[192, 57, 43], [240, 140, 120]],
    st: { bg: '#efe8da', sky: '#efe8da', ground: '#e2d8c3', line: 'inset 0 1.5px 0 #2a2620', scan: 0, vig: 'rgba(120,96,60,.22)', txt: '#1f1b16', rad: 6, border: '1.5px solid #2a2620' },
    box: { background: '#fbf8f1', borderRadius: 3, border: '1.5px solid #2a2620' }, boxTxt: '#1f1b16', boxSub: '#5e554a', boxLv: '#8b8072', hp: '#2a2620', hpTrack: 'transparent', hatch: true, hpLab: '#c0392b', xp: '#2a2620', xpLab: '#2f6b3a',
    chip: { padding: '4px 8px', borderRadius: 3, background: '#fbf8f1', border: '1.5px solid #2a2620', color: '#1f1b16' },
    msg: { background: '#fbf8f1', borderRadius: 3, border: '1.5px solid #2a2620', color: '#1f1b16' }, pre: ['¶', '#c0392b', 1],
    stamp: true, slash: '#2a2620', flash: '#1f1b16', wipe: '#1f1b16', glow: false, zz: '#5e554a', shadow: 'rgba(42,38,32,.22)',
    title: { font: MAN, size: 40, weight: 800, track: '-0.045em', color: '#1f1b16', shadow: 'none', words: ['Gains', 'Quest'] }, lvCol: '#1f1b16',
    P: { bg0: '#f3eee3', bg1: '#fbf8f1', bg2: '#efe8da', bg3: '#e2d8c3', tx: '#1f1b16', tx2: '#5e554a', tx3: '#857a6b', acc: '#1f1b16', on: '#fbf8f1', ok: '#2f6b3a', err: '#c0392b', R: 6, rb: 8, rs: 6,
      line: '1.5px solid #2a2620', shadow: '3px 3px 0 #2a2620', label: '#c0392b', battle: '#c0392b', rest: '#8a5a00', okFill: '#2f6b3a', okInk: '#fbf8f1', btnFx: 'offset', navBg: '#f3eee3', navCol: '#1f1b16' }, crt: 0 },
  { id: 'q-3c', name: 'Matrix', desc: 'The app’s Matrix theme on the stage: green tint, monospace everywhere, $ prompts and a green scan line. The UI reuses the theme’s existing tokens.',
    tint: '#33ff33', m: 0,
    st: { bg: '#000800', sky: '#000800', ground: '#001000', line: 'inset 0 2px 0 #33ff33', scan: 0.3, vig: 'rgba(0,0,0,.65)', txt: '#33ff33', rad: 8 },
    box: { background: '#001400', borderRadius: 4, border: '1px solid #0a440a' }, boxTxt: '#33ff33', boxSub: '#22aa22', boxLv: '#117711', nameMono: true, upper: true, hp: '#33ff33', hpTrack: '#002200', hpLab: '#33ff33', xp: '#22aa22', xpLab: '#22aa22',
    chip: { padding: '5px 9px', borderRadius: 4, background: 'rgba(0,8,0,.85)', border: '1px solid #0a440a', color: '#33ff33' },
    msg: { background: '#000800', borderRadius: 6, border: '1px solid #0a440a', color: '#33ff33' }, pre: ['$', '#33ff33', 1],
    dmg: '#ccffcc', dmgShadow: '0 0 8px #33ff33', flash: '#33ff33', wipe: '#000800', zz: '#33ff33',
    title: { font: MONO, size: 36, weight: 500, track: '0', color: '#33ff33', shadow: '0 0 14px rgba(51,255,51,.6)', words: ['GAINS', 'QUEST'] }, lvCol: '#33ff33',
    P: { bg0: '#000800', bg1: '#001000', bg2: '#001800', bg3: '#002200', tx: '#33ff33', tx2: '#22aa22', tx3: '#117711', acc: '#00ff00', on: '#000', ok: '#33ff33', err: '#ff5a5a', R: 8, rb: 6, rs: 4,
      line: '1px solid #003300', disp: MONO, label: '#00ff00', battle: '#00ff00', rest: '#ccff66', okFill: '#0a5a0a', okInk: '#ccffcc', navBg: '#000800', navCol: '#33ff33' }, roll: 'rgba(0,255,0,.06)' },
  { id: 'q-3e', name: 'Handheld', desc: 'A four-shade green handheld screen. Sprites and land are reduced to four greens, the stage sits in a grey bezel, and the attack button is the magenta round key.',
    mode: 'pal4', pal: [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]],
    st: { bg: '#9bbc0f', sky: '#9bbc0f', ground: '#8bac0f', line: 'inset 0 2px 0 #0f380f', scan: 0, vig: null, txt: '#0f380f', rad: 4, border: 'none', overlay: 'repeating-linear-gradient(0deg, rgba(15,56,15,.07) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(15,56,15,.07) 0 1px, transparent 1px 3px)', bezel: true },
    box: { background: '#9bbc0f', borderRadius: 2, border: '2px solid #0f380f' }, boxTxt: '#0f380f', boxSub: '#306230', boxLv: '#306230', nameMono: true, upper: true, hp: '#0f380f', hpTrack: '#8bac0f', hpLab: '#0f380f', xp: '#306230', xpLab: '#0f380f',
    chip: { padding: '4px 8px', borderRadius: 2, background: '#9bbc0f', border: '2px solid #0f380f', color: '#0f380f' },
    msg: { background: '#9bbc0f', borderRadius: 2, border: '2px solid #0f380f', color: '#0f380f' }, pre: ['▶', '#0f380f', 1],
    dmg: '#0f380f', slash: '#0f380f', flash: '#0f380f', wipe: '#0f380f', glow: false, zz: '#0f380f', shadow: 'rgba(15,56,15,.3)',
    title: { font: MONO, size: 34, weight: 500, track: '0', color: '#0f380f', shadow: '2px 2px 0 #8bac0f', words: ['GAINS', 'QUEST'] }, lvCol: '#0f380f',
    P: { bg0: '#d6d9cc', bg1: '#e6e8dd', bg2: '#cfd3c2', bg3: '#bfc4ae', tx: '#1f2a18', tx2: '#4a5640', tx3: '#6e7862', acc: '#9b2257', on: '#fff', ok: '#306230', err: '#9b2257', R: 12, rb: 27, rs: 10,
      label: '#3949ab', battle: '#9b2257', rest: '#306230', okFill: '#306230', okInk: '#e6e8dd', btnFx: 'round', navBg: '#d6d9cc', navCol: '#3949ab' }, crt: 0 },
  { id: 'q-4d', name: 'Console 2000', desc: 'A 3E variant: a dark, bitmap console. Four flat greys for sprites and land, hard 2px pixel edges with stepped shadows and no gradients, and the four face-button colours (green △, red ○, blue ✕, pink □) as the only accents.',
    mode: 'pal4', pal: [[14, 14, 16], [58, 58, 64], [128, 128, 136], [214, 214, 220]], glyphs: true,
    st: { bg: '#111113', sky: '#111113', ground: '#0a0a0b', line: 'inset 0 2px 0 #3a3a40', scan: 0, vig: null, txt: '#e4e4e8', rad: 0, border: '2px solid #2a2a2e', bezel: '#1c1c20',
      overlay: 'repeating-conic-gradient(rgba(255,255,255,.035) 0 25%, transparent 0 50%) 0 0 / 4px 4px' },
    box: { background: '#16161a', borderRadius: 0, border: '2px solid #e4e4e8', boxShadow: '4px 4px 0 #000' }, boxTxt: '#e4e4e8', boxSub: '#9a9aa2', boxLv: '#9a9aa2', nameMono: true, upper: true, hp: '#40c890', seg: true, segOff: '#2a2a2e', hpLab: '#40c890', xp: '#f08ad8', xpLab: '#f08ad8',
    chip: { padding: '4px 8px', borderRadius: 0, background: '#16161a', border: '2px solid #e4e4e8', color: '#e4e4e8', boxShadow: '3px 3px 0 #000' },
    msg: { background: '#16161a', borderRadius: 0, border: '2px solid #e4e4e8', color: '#e4e4e8', boxShadow: '4px 4px 0 #000', textTransform: 'uppercase', letterSpacing: '.04em' }, pre: ['▶', '#ff5a5a', 1],
    dmg: '#ff5a5a', dmgShadow: '2px 2px 0 #000', slash: '#e4e4e8', flash: '#e4e4e8', wipe: '#000', glow: false, zz: '#9a9aa2', shadow: 'rgba(0,0,0,.6)',
    title: { font: MONO, size: 36, weight: 500, track: '.04em', color: '#e4e4e8', shadow: '3px 3px 0 #000', words: ['GAINS', 'QUEST'] }, lvCol: '#40c890',
    P: { bg0: '#0b0b0d', bg1: '#141417', bg2: '#1c1c20', bg3: '#2a2a2e', tx: '#e4e4e8', tx2: '#9a9aa2', tx3: '#70707a', acc: '#ff5a5a', on: '#0b0b0d', ok: '#40c890', err: '#ff5a5a', R: 0, rb: 0, rs: 0,
      line: '2px solid #2a2a2e', shadow: '4px 4px 0 #000', disp: MONO, upper: true, label: '#6a9cff', battle: '#ff5a5a', rest: '#f08ad8', okFill: '#40c890', okInk: '#0b0b0d', btnFx: 'bitmap', navBg: '#0b0b0d', navCol: '#e4e4e8' }, crt: 0 },
  { id: 'q-3j', name: 'Bubblegum', desc: 'A light theme in Bubblegum colours: plum-ink sprites on a pink sky, white HUD cards, magenta hits and a heart prompt. Bright and playful.',
    mode: 'duo', spr: [[64, 14, 46], [196, 96, 150], 1.1], land: [[242, 196, 220], [255, 240, 247], 1], hit: [[255, 255, 255], [255, 220, 240]],
    st: { bg: '#fff0f8', sky: '#fff0f8', ground: '#f7d6e8', line: 'inset 0 2px 0 #d6006e', scan: 0, vig: 'rgba(214,0,110,.1)', txt: '#2b0a20', rad: 28 },
    box: { background: '#ffffff', borderRadius: 16, boxShadow: '0 4px 14px rgba(214,0,110,.16)' }, boxTxt: '#2b1821', boxSub: '#77465f', boxLv: '#77465f', hp: '#d6006e', hpTrack: '#f7d6e8', hpLab: '#d6006e', xp: '#7c3aed', xpLab: '#7c3aed',
    chip: { padding: '5px 10px', borderRadius: 999, background: '#ffffff', color: '#2b1821', boxShadow: '0 2px 8px rgba(214,0,110,.14)' },
    msg: { background: '#ffffff', borderRadius: 18, color: '#2b1821', boxShadow: '0 4px 14px rgba(214,0,110,.14)' }, pre: ['♥', '#d6006e', 1],
    dmg: '#d6006e', dmgShadow: '2px 2px 0 #fff', slash: '#d6006e', flash: '#ffffff', wipe: '#d6006e', glow: false, zz: '#77465f', shadow: 'rgba(120,20,80,.18)',
    title: { font: MAN, size: 44, weight: 800, track: '-0.045em', color: '#d6006e', shadow: '3px 3px 0 #ffffff', words: ['Gains', 'Quest'] }, lvCol: '#7c3aed',
    P: { bg0: '#f8f4f6', bg1: '#ffffff', bg2: '#f1e9ed', bg3: '#e7d0dc', tx: '#2b1821', tx2: '#593145', tx3: '#77465f', acc: '#d6006e', on: '#fff', ok: '#15803d', err: '#c62828', R: 28, rb: 18, rs: 14,
      shadow: '0 1px 2px rgba(43,24,33,.05), 0 10px 30px rgba(214,0,110,.08)', label: '#d6006e', battle: '#d6006e', rest: '#7c3aed', okFill: '#15803d', okInk: '#fff', navBg: '#f8f4f6', navCol: '#d6006e' }, crt: 0 },
  { id: 'q-3k', name: 'Comic', desc: 'A comic panel: four flat inks (black, red, yellow, cream), a halftone over the stage, thick outlines with hard drop shadows, a speech-bubble message box and a red-on-yellow title.',
    mode: 'pal4', pal: [[17, 17, 17], [230, 57, 70], [255, 209, 26], [255, 248, 226]], landMap: [0.45, 0.55],
    st: { bg: '#fff7dc', sky: '#fff7dc', ground: '#ffe27a', line: 'inset 0 3px 0 #111', scan: 0, vig: null, txt: '#111', rad: 8, border: '3px solid #111', overlay: 'radial-gradient(rgba(17,17,17,.14) 1px, transparent 1.6px) 0 0 / 6px 6px' },
    box: { background: '#ffffff', borderRadius: 4, border: '3px solid #111', boxShadow: '4px 4px 0 #111' }, boxTxt: '#111', boxSub: '#333', boxLv: '#555', upper: true, hp: '#e63946', hpTrack: '#fff0bf', hpLab: '#e63946', xp: '#1d70b8', xpLab: '#1d70b8',
    chip: { padding: '4px 9px', borderRadius: 4, background: '#ffd11a', border: '2.5px solid #111', color: '#111', fontWeight: 600 },
    msg: { background: '#ffffff', borderRadius: 18, border: '3px solid #111', color: '#111', boxShadow: '4px 4px 0 #111' }, pre: ['!', '#e63946', 1],
    dmg: '#e63946', dmgShadow: '2px 2px 0 #111, -1px -1px 0 #111, 1px -1px 0 #111, -1px 1px 0 #111', slash: '#111', flash: '#ffd11a', wipe: '#111', glow: false, zz: '#111', shadow: 'rgba(17,17,17,.25)',
    title: { font: MAN, size: 46, weight: 800, track: '-0.04em', color: '#ffd11a', shadow: '3px 3px 0 #111, -1.5px -1.5px 0 #111, 1.5px -1.5px 0 #111, -1.5px 1.5px 0 #111, 1.5px 1.5px 0 #111', words: ['GAINS', 'QUEST'] }, lvCol: '#e63946',
    P: { bg0: '#fff7dc', bg1: '#ffffff', bg2: '#fff0bf', bg3: '#ffe27a', tx: '#111111', tx2: '#333333', tx3: '#666666', acc: '#e63946', on: '#ffffff', ok: '#1a8a4a', err: '#e63946', R: 10, rb: 12, rs: 8,
      line: '3px solid #111', shadow: '4px 4px 0 #111', label: '#e63946', battle: '#e63946', rest: '#1d70b8', okFill: '#1a8a4a', okInk: '#ffffff', btnFx: 'comic', navBg: '#fff7dc', navCol: '#111' }, crt: 0 },
  { id: 'q-3m', name: 'Riso', desc: 'A two-colour risograph print: federal-blue sprites on cream with a fluorescent-pink layer slightly out of register, a pink land and blue-on-pink offset shadows.',
    mode: 'duo', spr: [[44, 74, 156], [246, 241, 231], 1], land: [[255, 168, 210], [246, 241, 231], 0.9], hit: [[255, 72, 176], [255, 200, 230]],
    st: { bg: '#f6f1e7', sky: '#f6f1e7', ground: '#ffd3e8', line: 'inset 0 2px 0 #3255a4', scan: 0, vig: null, txt: '#22346f', rad: 14, overlay: 'radial-gradient(rgba(255,72,176,.16) 0.8px, transparent 1.4px) 0 0 / 4px 4px' },
    box: { background: '#fffdf7', borderRadius: 2, border: '1.5px solid #3255a4', boxShadow: '3px 3px 0 #ff48b0' }, boxTxt: '#22346f', boxSub: '#4a5a94', boxLv: '#7a84a8', hp: '#ff48b0', hpTrack: 'rgba(50,85,164,.15)', hpLab: '#ff48b0', xp: '#3255a4', xpLab: '#3255a4',
    chip: { padding: '4px 9px', borderRadius: 2, background: '#fffdf7', border: '1.5px solid #3255a4', color: '#22346f', boxShadow: '2px 2px 0 #ff48b0' },
    msg: { background: '#fffdf7', borderRadius: 2, border: '1.5px solid #3255a4', color: '#22346f', boxShadow: '3px 3px 0 #ff48b0' }, pre: ['✶', '#ff48b0', 1],
    dmg: '#ff48b0', dmgShadow: '2px 2px 0 #3255a4', slash: '#3255a4', flash: '#ff48b0', wipe: '#3255a4', glow: false, zz: '#3255a4', shadow: 'rgba(50,85,164,.22)', sprFilter: 'drop-shadow(3px 2px 0 rgba(255,72,176,.8))',
    title: { font: MAN, size: 44, weight: 800, track: '-0.045em', color: '#3255a4', shadow: '4px 3px 0 #ff48b0', words: ['Gains', 'Quest'] }, lvCol: '#ff48b0',
    P: { bg0: '#f6f1e7', bg1: '#fffdf7', bg2: '#efe7d6', bg3: '#e3d7bf', tx: '#22346f', tx2: '#4a5a94', tx3: '#7a84a8', acc: '#ff48b0', on: '#ffffff', ok: '#1f8a70', err: '#e0245e', R: 14, rb: 14, rs: 10,
      shadow: '3px 3px 0 #3255a4', label: '#ff48b0', battle: '#ff48b0', rest: '#3255a4', okFill: '#3255a4', okInk: '#fffdf7', btnFx: 'riso', navBg: '#f6f1e7', navCol: '#3255a4' }, crt: 0 },
  { id: 'q-3p', name: 'Noir', desc: 'Black-and-white film: sprites in hard greys under a spotlight, film grain over the stage, Georgia titles, and red used only for damage and the attack button.',
    mode: 'duo', spr: [[18, 18, 18], [235, 235, 230], 0.9], land: [[10, 10, 10], [92, 92, 90], 1.1], hit: [[200, 20, 30], [255, 120, 120]],
    st: { bg: '#0a0a0a', sky: 'radial-gradient(ellipse at 30% 40%, #3a3a38 0%, #0a0a0a 70%)', ground: '#111', line: 'inset 0 1px 0 #e8e8e2', scan: 0, vig: 'rgba(0,0,0,.8)', txt: '#ecece6', rad: 28, overlay: 'repeating-radial-gradient(circle at 17% 31%, rgba(255,255,255,.04) 0 1px, transparent 1px 3px)' },
    box: { background: '#000', borderRadius: 0, borderTop: '1px solid #ecece6', borderBottom: '1px solid #ecece6' }, boxTxt: '#ecece6', boxSub: '#a6a6a0', boxLv: '#7a7a74', hp: '#ecece6', hpTrack: '#262626', hpLab: '#c8141e', xp: '#a6a6a0', xpLab: '#a6a6a0',
    chip: { padding: '5px 9px', borderRadius: 0, background: '#000', borderTop: '1px solid #ecece6', borderBottom: '1px solid #ecece6', color: '#ecece6' },
    msg: { background: '#000', borderRadius: 0, borderTop: '1px solid #ecece6', borderBottom: '1px solid #ecece6', color: '#ecece6', fontStyle: 'italic' }, pre: ['—', '#c8141e', 1],
    dmg: '#e01a26', dmgShadow: '0 0 12px rgba(200,20,30,.6)', slash: '#ecece6', flash: '#ffffff', wipe: '#000', glow: false, zz: '#a6a6a0', shadow: 'rgba(0,0,0,.7)',
    title: { font: SERIF, size: 46, weight: 700, track: '-0.02em', color: '#ecece6', shadow: '0 0 24px rgba(0,0,0,.9)', words: ['Gains', 'Quest'], italic: true }, lvCol: '#c8141e',
    P: { bg0: '#000000', bg1: '#0c0c0c', bg2: '#161616', bg3: '#242424', tx: '#ecece6', tx2: '#a6a6a0', tx3: '#7a7a74', acc: '#c8141e', on: '#ffffff', ok: '#ecece6', err: '#e01a26', R: 4, rb: 4, rs: 2,
      line: '1px solid #242424', serifHead: true, label: '#a6a6a0', battle: '#e01a26', rest: '#a6a6a0', okFill: '#ecece6', okInk: '#000', navBg: '#000', navCol: '#ecece6' }, crt: 0 },
  { id: 'q-3s', name: 'Frostbite', desc: 'A light winter theme: navy sprites on pale ice with snow drifting over the stage, frosted-glass HUD cards, icy-blue HP and a cold cobalt attack button.',
    mode: 'duo', spr: [[16, 36, 74], [120, 160, 205], 1.1], land: [[196, 220, 240], [246, 251, 255], 1], hit: [[255, 255, 255], [210, 235, 255]],
    st: { bg: '#eef6fd', sky: 'linear-gradient(#f7fbff, #dceaf7)', ground: '#e3eef8', line: 'inset 0 2px 0 #9cc3e6', scan: 0, vig: 'rgba(120,160,205,.18)', txt: '#10244a', rad: 28,
      overlay: 'radial-gradient(circle at 12% 18%, #fff 0 1.5px, transparent 2px), radial-gradient(circle at 38% 8%, #fff 0 1px, transparent 1.6px), radial-gradient(circle at 63% 30%, #fff 0 1.5px, transparent 2px), radial-gradient(circle at 86% 14%, #fff 0 1px, transparent 1.6px), radial-gradient(circle at 24% 46%, #fff 0 1px, transparent 1.6px), radial-gradient(circle at 74% 52%, #fff 0 1.5px, transparent 2px)' },
    box: { background: 'rgba(255,255,255,.75)', borderRadius: 14, border: '1px solid rgba(156,195,230,.8)', boxShadow: '0 6px 18px rgba(16,36,74,.10)' }, boxTxt: '#10244a', boxSub: '#41618f', boxLv: '#6a86ad', hp: '#3b82f6', hpTrack: '#dceaf7', hpLab: '#2563eb', xp: '#0ea5b7', xpLab: '#0ea5b7',
    chip: { padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.8)', border: '1px solid rgba(156,195,230,.8)', color: '#10244a' },
    msg: { background: 'rgba(255,255,255,.85)', borderRadius: 16, border: '1px solid rgba(156,195,230,.8)', color: '#10244a' }, pre: ['❄', '#3b82f6', 1],
    dmg: '#1d4ed8', dmgShadow: '0 2px 0 #fff', slash: '#3b82f6', flash: '#ffffff', wipe: '#10244a', glow: false, zz: '#41618f', shadow: 'rgba(16,36,74,.16)',
    title: { font: MAN, size: 44, weight: 800, track: '-0.05em', color: '#10244a', shadow: '0 0 18px rgba(255,255,255,.9)', words: ['GAINS', 'QUEST'] }, lvCol: '#2563eb',
    P: { bg0: '#f2f7fc', bg1: '#ffffff', bg2: '#e6eff8', bg3: '#d3e2f1', tx: '#10244a', tx2: '#41618f', tx3: '#5f7aa0', acc: '#1d4ed8', on: '#ffffff', ok: '#0f8a6a', err: '#c0392b', R: 26, rb: 18, rs: 14,
      shadow: '0 1px 2px rgba(16,36,74,.05), 0 10px 30px rgba(16,36,74,.07)', label: '#2563eb', battle: '#1d4ed8', rest: '#0ea5b7', okFill: '#0f8a6a', okInk: '#ffffff', navBg: '#f2f7fc', navCol: '#1d4ed8' }, crt: 0 },
  { id: 'q-3u', name: 'Sunset Drive', desc: 'Synthwave dusk: sprites and hills mapped through a violet-to-coral-to-gold gradient, a striped sun on the horizon, a magenta grid floor and a sunset-gradient attack button.',
    mode: 'grad', stops: [[0, [26, 8, 52]], [0.35, [120, 30, 140]], [0.65, [255, 90, 120]], [1, [255, 214, 130]]], sprMap: [0.9, 0.1], landMap: [0.55, 0],
    st: { bg: '#14062b', sky: 'radial-gradient(circle at 70% 62%, #ffd27a 0 18px, #ff7a5a 19px 34px, transparent 35px), linear-gradient(#14062b, #4a1260 60%, #ff5a7a)', ground: 'repeating-linear-gradient(90deg, rgba(255,72,200,.55) 0 1px, transparent 1px 28px), repeating-linear-gradient(0deg, rgba(255,72,200,.55) 0 1px, transparent 1px 14px), #1a0630', line: 'inset 0 2px 0 #ff48c8', scan: 0.18, vig: 'rgba(10,0,24,.6)', txt: '#ffe9f4', rad: 28 },
    box: { background: 'rgba(20,6,43,.85)', borderRadius: 12, border: '1px solid #ff48c8', boxShadow: '0 0 16px rgba(255,72,200,.3)' }, boxTxt: '#ffe9f4', boxSub: '#d9a6d8', boxLv: '#ffb36b', hp: 'linear-gradient(90deg, #ff5a7a, #ffd27a)', hpTrack: '#2a0d45', hpLab: '#ff7a9a', xp: '#7dd3fc', xpLab: '#7dd3fc',
    chip: { padding: '5px 10px', borderRadius: 999, background: 'rgba(20,6,43,.8)', border: '1px solid #ff48c8', color: '#ffe9f4' },
    msg: { background: 'rgba(20,6,43,.92)', borderRadius: 14, border: '1px solid #ff48c8', color: '#ffe9f4' }, pre: ['▸', '#ffb36b', 1],
    dmg: '#ffd27a', dmgShadow: '0 0 10px #ff48c8', slash: '#ff9a4a', flash: '#ffd27a', wipe: '#14062b', glow: false, zz: '#d9a6d8', shadow: 'rgba(10,0,24,.5)', sprFilter: 'drop-shadow(0 0 5px rgba(255,72,200,.55))',
    title: { font: MAN, size: 46, weight: 800, track: '-0.04em', color: 'transparent', shadow: 'none', words: ['GAINS', 'QUEST'], italic: true, clip: 'linear-gradient(#ffe7a8, #ff9a4a 50%, #ff48c8)' }, lvCol: '#ffb36b',
    P: { bg0: '#0f0420', bg1: '#1a0832', bg2: '#260d45', bg3: '#36145c', tx: '#ffe9f4', tx2: '#d9a6d8', tx3: '#a77aa8', acc: '#ff6a5a', on: '#1a0420', ok: '#5eead4', err: '#ff5a7a', R: 26, rb: 18, rs: 12,
      line: '1px solid #36145c', label: '#ff7ad0', battle: '#ff48c8', rest: '#7dd3fc', okFill: '#115e59', okInk: '#ccfbf1', btnFx: 'sun', navBg: '#0f0420', navCol: '#ff7ad0' }, roll: 'rgba(255,72,200,.05)' },
  { id: 'q-3x', name: 'Forge', desc: 'Molten metal: sprites and land run through a black-to-red-to-gold heat ramp, embers drifting over the stage, riveted iron HUD plates and a white-hot gradient attack button.',
    mode: 'grad', stops: [[0, [12, 6, 4]], [0.4, [150, 24, 10]], [0.7, [255, 110, 20]], [1, [255, 236, 160]]], sprMap: [0.95, 0.08], landMap: [0.5, 0],
    st: { bg: '#0d0806', sky: 'linear-gradient(#0d0806 40%, #2a0c04)', ground: '#140904', line: 'inset 0 2px 0 #ff6e14', scan: 0.12, vig: 'rgba(0,0,0,.7)', txt: '#ffeedd', rad: 28,
      overlay: 'radial-gradient(circle at 14% 30%, rgba(255,150,40,.9) 0 1px, transparent 1.6px), radial-gradient(circle at 42% 18%, rgba(255,200,80,.8) 0 1px, transparent 1.6px), radial-gradient(circle at 68% 40%, rgba(255,120,30,.9) 0 1.4px, transparent 2px), radial-gradient(circle at 88% 22%, rgba(255,180,60,.8) 0 1px, transparent 1.6px), radial-gradient(circle at 30% 52%, rgba(255,140,40,.7) 0 1px, transparent 1.6px)' },
    box: { background: 'linear-gradient(#2a2420, #1a1512)', borderRadius: 4, border: '1px solid #4a3e36', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08), 0 4px 12px rgba(0,0,0,.5)' }, boxTxt: '#ffeedd', boxSub: '#c9a88c', boxLv: '#ff9a3c', nameMono: true, upper: true, hp: 'linear-gradient(90deg, #e61e3c, #ff6e14, #ffcc44)', hpTrack: '#1a0c06', hpLab: '#ff6e14', xp: '#ffcc44', xpLab: '#ffcc44',
    chip: { padding: '4px 9px', borderRadius: 3, background: '#1a1512', border: '1px solid #4a3e36', color: '#ffeedd' },
    msg: { background: 'linear-gradient(#211b17, #140f0c)', borderRadius: 4, border: '1px solid #4a3e36', color: '#ffeedd' }, pre: ['◆', '#ff6e14', 1],
    dmg: '#ffcc44', dmgShadow: '0 0 12px #ff3c00', slash: '#ffb040', flash: '#ffcc44', wipe: '#0d0806', glow: false, zz: '#c9a88c', shadow: 'rgba(0,0,0,.6)', sprFilter: 'drop-shadow(0 0 6px rgba(255,90,20,.5))',
    title: { font: MAN, size: 46, weight: 800, track: '-0.04em', color: 'transparent', shadow: 'none', words: ['GAINS', 'QUEST'], clip: 'linear-gradient(#fff4c8, #ffb040 45%, #e61e3c)' }, lvCol: '#ff9a3c',
    P: { bg0: '#0a0706', bg1: '#16110e', bg2: '#221a15', bg3: '#33281f', tx: '#ffeedd', tx2: '#c9a88c', tx3: '#8f7562', acc: '#ff5a1f', on: '#1a0600', ok: '#a3e635', err: '#ff4d4d', R: 10, rb: 8, rs: 6,
      line: '1px solid #33281f', label: '#ff6e14', battle: '#ff5a1f', rest: '#ffcc44', okFill: '#3f5a12', okInk: '#ecfccb', btnFx: 'heat', navBg: '#0a0706', navCol: '#ff6e14' }, roll: 'rgba(255,90,20,.04)' },
  { id: 'q-3y', name: 'Terrarium', desc: 'A soft daylight greenhouse: moss-green sprites on pale sage, leafy land, rounded cream HUD cards, terracotta hits and a moss attack button.',
    mode: 'duo', spr: [[30, 58, 34], [150, 180, 120], 1.1], land: [[150, 182, 132], [232, 240, 222], 0.9], hit: [[196, 92, 58], [240, 170, 130]],
    st: { bg: '#eef3e6', sky: 'linear-gradient(#f6f9ef, #e2ecd6)', ground: '#d3e2c0', line: 'inset 0 2px 0 #4f7a3a', scan: 0, vig: 'rgba(79,122,58,.12)', txt: '#1e2e1a', rad: 28 },
    box: { background: '#fbfaf3', borderRadius: 16, boxShadow: '0 4px 14px rgba(40,70,30,.12)' }, boxTxt: '#1e2e1a', boxSub: '#5a6e50', boxLv: '#7a8a6e', hp: '#4f7a3a', hpTrack: '#e2ecd6', hpLab: '#c45c3a', xp: '#c9922e', xpLab: '#c9922e',
    chip: { padding: '5px 10px', borderRadius: 999, background: '#fbfaf3', color: '#1e2e1a', boxShadow: '0 2px 8px rgba(40,70,30,.12)' },
    msg: { background: '#fbfaf3', borderRadius: 18, color: '#1e2e1a', boxShadow: '0 4px 14px rgba(40,70,30,.12)' }, pre: ['✿', '#c45c3a', 1],
    dmg: '#c45c3a', dmgShadow: '2px 2px 0 #fbfaf3', slash: '#4f7a3a', flash: '#fbfaf3', wipe: '#4f7a3a', glow: false, zz: '#5a6e50', shadow: 'rgba(40,70,30,.18)',
    title: { font: SERIF, size: 44, weight: 700, track: '-0.02em', color: '#2f5226', shadow: '2px 2px 0 #fbfaf3', words: ['Gains', 'Quest'], italic: true }, lvCol: '#c45c3a',
    P: { bg0: '#f2f4ea', bg1: '#fbfaf3', bg2: '#e9eedd', bg3: '#d8e2c8', tx: '#1e2e1a', tx2: '#4a5e40', tx3: '#6e7f62', acc: '#3f6b2e', on: '#fbfaf3', ok: '#3f6b2e', err: '#b4472a', R: 28, rb: 20, rs: 14,
      shadow: '0 1px 2px rgba(30,46,26,.05), 0 10px 30px rgba(40,70,30,.08)', serifHead: true, label: '#c45c3a', battle: '#c45c3a', rest: '#c9922e', okFill: '#3f6b2e', okInk: '#fbfaf3', navBg: '#f2f4ea', navCol: '#3f6b2e' }, crt: 0 },
  { id: 'q-4a', name: 'Graphite', desc: 'Quiet and modern: sprites in slate greys on charcoal, hairline borders, flat grey HUD cards and one electric-lime accent saved for HP, hits and the attack button.',
    mode: 'duo', spr: [[40, 44, 50], [210, 214, 220], 0.9], land: [[22, 24, 28], [62, 66, 74], 1], hit: [[200, 255, 60], [240, 255, 190]],
    st: { bg: '#141518', sky: 'linear-gradient(#1c1e22, #141518)', ground: '#101114', line: 'inset 0 1px 0 #3a3d44', scan: 0, vig: 'rgba(0,0,0,.45)', txt: '#e8e9ec', rad: 28 },
    box: { background: '#1e2024', borderRadius: 10, border: '1px solid #2e3138' }, boxTxt: '#e8e9ec', boxSub: '#9a9ea8', boxLv: '#6e727c', hp: '#c8ff3c', hpTrack: '#2a2d33', hpLab: '#c8ff3c', xp: '#9a9ea8', xpLab: '#9a9ea8',
    chip: { padding: '5px 9px', borderRadius: 6, background: 'rgba(20,21,24,.85)', border: '1px solid #2e3138', color: '#e8e9ec' },
    msg: { background: '#1a1c20', borderRadius: 12, border: '1px solid #2e3138', color: '#e8e9ec' }, pre: ['—', '#c8ff3c', 1],
    dmg: '#c8ff3c', dmgShadow: '0 2px 0 #000', slash: '#c8ff3c', flash: '#e8e9ec', wipe: '#0c0d0f', glow: false, zz: '#9a9ea8', shadow: 'rgba(0,0,0,.55)',
    title: { font: MAN, size: 44, weight: 800, track: '-0.05em', color: '#e8e9ec', shadow: 'none', words: ['Gains', 'Quest'] }, lvCol: '#c8ff3c',
    P: { bg0: '#0f1012', bg1: '#18191c', bg2: '#212327', bg3: '#2e3138', tx: '#e8e9ec', tx2: '#9a9ea8', tx3: '#70747e', acc: '#c8ff3c', on: '#141518', ok: '#c8ff3c', err: '#ff6b6b', R: 22, rb: 14, rs: 10,
      line: '1px solid #26282d', label: '#9a9ea8', battle: '#c8ff3c', rest: '#9a9ea8', okFill: '#3a4a12', okInk: '#e6ffb0', navBg: '#0f1012', navCol: '#e8e9ec' }, crt: 0 },
  { id: 'q-4b', name: 'Midnight Ink', desc: 'A storybook at night: indigo sprites lit by a cream moon, a deep ink-blue sky with a moon disc, Georgia type throughout and warm parchment highlights for every action.',
    mode: 'duo', spr: [[14, 18, 48], [228, 214, 180], 1], land: [[10, 14, 38], [44, 52, 100], 1.1], hit: [[255, 236, 190], [255, 250, 230]],
    st: { bg: '#0b0f2a', sky: 'radial-gradient(circle at 78% 24%, #f3e6c4 0 16px, rgba(243,230,196,.18) 17px 40px, transparent 64px), linear-gradient(#141a44, #0b0f2a)', ground: '#080b20', line: 'inset 0 1.5px 0 #e4d6b4', scan: 0, vig: 'rgba(4,6,20,.7)', txt: '#f3ead6', rad: 28 },
    box: { background: '#121740', borderRadius: 6, border: '1px solid #e4d6b4', boxShadow: 'inset 0 0 0 3px #121740, inset 0 0 0 4px rgba(228,214,180,.3)' }, boxTxt: '#f3ead6', boxSub: '#b8b0a0', boxLv: '#8a88a8', hp: '#e4d6b4', hpTrack: '#1e2456', hpLab: '#e4d6b4', xp: '#8fa6ff', xpLab: '#8fa6ff',
    chip: { padding: '5px 9px', borderRadius: 4, background: 'rgba(11,15,42,.88)', border: '1px solid #e4d6b4', color: '#f3ead6' },
    msg: { background: '#0e1236', borderRadius: 6, border: '1px solid rgba(228,214,180,.6)', color: '#f3ead6', fontFamily: SERIF, fontStyle: 'italic', fontSize: 14 }, pre: ['☾', '#e4d6b4', 1],
    dmg: '#fff4d6', dmgShadow: '0 0 10px rgba(243,230,196,.6)', slash: '#e4d6b4', flash: '#f3e6c4', wipe: '#0b0f2a', glow: false, zz: '#b8b0a0', shadow: 'rgba(0,0,0,.6)',
    title: { font: SERIF, size: 46, weight: 700, track: '-0.02em', color: '#f3e6c4', shadow: '0 0 22px rgba(243,230,196,.35)', words: ['Gains', 'Quest'], italic: true }, lvCol: '#e4d6b4',
    P: { bg0: '#080b20', bg1: '#0f1334', bg2: '#171c46', bg3: '#232a5c', tx: '#f3ead6', tx2: '#b8b0a0', tx3: '#8a88a8', acc: '#e4d6b4', on: '#0b0f2a', ok: '#9be3b0', err: '#ff8a8a', R: 20, rb: 12, rs: 8,
      line: '1px solid #232a5c', serifHead: true, label: '#e4d6b4', battle: '#e4d6b4', rest: '#8fa6ff', okFill: '#1f4a36', okInk: '#d6f5e0', btnFx: 'gilt', navBg: '#080b20', navCol: '#e4d6b4' }, crt: 0 },
  { id: 'q-4c', name: 'Aurora', desc: 'A polar night: sprites mapped through a teal-to-green-to-violet aurora ramp, glowing bands across a black-green sky, frosted dark HUD cards and an aurora-green attack button.',
    mode: 'grad', stops: [[0, [4, 14, 20]], [0.4, [20, 110, 120]], [0.7, [80, 230, 150]], [1, [210, 190, 255]]], sprMap: [0.9, 0.1], landMap: [0.45, 0],
    st: { bg: '#030a0e', sky: 'radial-gradient(ellipse 120% 40% at 30% 18%, rgba(80,230,150,.35), transparent 70%), radial-gradient(ellipse 90% 30% at 75% 10%, rgba(170,120,255,.3), transparent 70%), linear-gradient(#061418, #030a0e)', ground: '#040e12', line: 'inset 0 2px 0 rgba(80,230,150,.7)', scan: 0, vig: 'rgba(0,4,6,.7)', txt: '#e2fbf0', rad: 28,
      overlay: 'radial-gradient(circle at 10% 40%, #fff 0 .8px, transparent 1.3px), radial-gradient(circle at 46% 30%, #fff 0 .8px, transparent 1.3px), radial-gradient(circle at 64% 46%, #fff 0 1px, transparent 1.5px), radial-gradient(circle at 90% 36%, #fff 0 .8px, transparent 1.3px)' },
    box: { background: 'rgba(8,28,34,.78)', borderRadius: 14, border: '1px solid rgba(80,230,150,.3)', boxShadow: '0 0 18px rgba(80,230,150,.12)' }, boxTxt: '#e2fbf0', boxSub: '#94c8b4', boxLv: '#b8a4ff', hp: 'linear-gradient(90deg, #22b8a8, #50e696, #c8b8ff)', hpTrack: 'rgba(80,230,150,.12)', hpLab: '#50e696', xp: '#b8a4ff', xpLab: '#b8a4ff',
    chip: { padding: '5px 10px', borderRadius: 999, background: 'rgba(8,28,34,.75)', border: '1px solid rgba(80,230,150,.3)', color: '#e2fbf0' },
    msg: { background: 'rgba(5,18,22,.88)', borderRadius: 14, border: '1px solid rgba(80,230,150,.28)', color: '#e2fbf0' }, pre: ['✧', '#50e696', 1],
    dmg: '#e2fbf0', dmgShadow: '0 0 12px #50e696', slash: '#50e696', flash: '#b8ffd8', wipe: '#030a0e', glow: false, zz: '#94c8b4', shadow: 'rgba(0,0,0,.6)', sprFilter: 'drop-shadow(0 0 5px rgba(80,230,150,.45))',
    title: { font: MAN, size: 46, weight: 800, track: '-0.05em', color: 'transparent', shadow: 'none', words: ['GAINS', 'QUEST'], clip: 'linear-gradient(100deg, #50e696, #8ae8d8 50%, #c8b8ff)' }, lvCol: '#b8a4ff',
    P: { bg0: '#030a0e', bg1: '#081518', bg2: '#0e2024', bg3: '#163036', tx: '#e2fbf0', tx2: '#94c8b4', tx3: '#64928a', acc: '#50e696', on: '#03140c', ok: '#50e696', err: '#ff7a8a', R: 26, rb: 18, rs: 12,
      line: '1px solid #163036', label: '#50e696', battle: '#50e696', rest: '#b8a4ff', okFill: '#14503a', okInk: '#d0fbe6', btnFx: 'neon', navBg: '#030a0e', navCol: '#50e696' }, crt: 0 },
];
// A skin's page background decides whether the app runs in light mode, the way
// a theme's `mode` does — no skin has to restate it.
const lumOf = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const merge = (t) => {
  const m = { ...BASE, ...t, st: { ...BASE.st, ...(t.st || {}) }, title: { ...BASE.title, ...(t.title || {}) }, P: { ...BASE.P, ...(t.P || {}) } };
  return { ...m, light: lumOf(m.P.bg0) > 0.5 };
};
export const SKINS = DEFS.map(merge);
export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

const rgbOf = (hx) => [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16));
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

// Per-mode colour functions: (luma 0..1) => [r,g,b]. Returns { spr, hit, land, mix }.
export function colourFns(t) {
  if (t.mode === 'duo') return { spr: (l) => lerp(t.spr[0], t.spr[1], Math.pow(l, t.spr[2])), hit: (l) => lerp(t.hit[0], t.hit[1], l), land: (l) => lerp(t.land[0], t.land[1], Math.pow(l, t.land[2])), mix: 0 };
  if (t.mode === 'pal4') { const q = (l, bias) => t.pal[Math.max(0, Math.min(3, Math.floor(l * 4 + bias)))]; const lm = t.landMap || [0.5, 0.5];
    return { spr: (l) => q(l, -0.3), hit: (l) => q(l, 1.6), land: (l) => q(l * lm[0] + lm[1], 0), mix: 0 }; }
  if (t.mode === 'grad') { const g = (l) => { const s = t.stops; for (let i = 1; i < s.length; i++) if (l <= s[i][0]) return lerp(s[i - 1][1], s[i][1], (l - s[i - 1][0]) / (s[i][0] - s[i - 1][0])); return s[s.length - 1][1]; };
    return { spr: (l) => g(l * t.sprMap[0] + t.sprMap[1]), hit: () => [255, 255, 255], land: (l) => g(l * t.landMap[0] + t.landMap[1]), mix: 0 }; }
  const rgb = rgbOf(t.tint);
  return { spr: (l) => { const k = 0.28 + 0.72 * Math.pow(l, 0.75); return rgb.map((c) => c * k); }, hit: (l) => { const k = 0.55 + 0.45 * Math.pow(l, 0.75); return [255 * k, 255 * k, 255 * k]; }, land: (l) => { const k = 0.04 + 0.62 * Math.pow(l, 1.2); return rgb.map((c) => c * k); }, mix: t.m };
}

export function buttonFx(P) {
  return P.btnFx === 'arcade' ? { boxShadow: `inset 0 -5px 0 ${mix(P.acc, 45, '#000')}, 0 0 22px ${mix(P.acc, 30)}` }
    : P.btnFx === 'offset' ? { boxShadow: '3px 3px 0 #c0392b' }
    : P.btnFx === 'neon' ? { boxShadow: `0 0 24px ${mix(P.acc, 45)}, inset 0 1px 0 rgba(255,255,255,.3)` }
    : P.btnFx === 'gilt' ? { background: 'linear-gradient(#fde68a, #fbbf24 55%, #d97706)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.6), 0 6px 18px rgba(251,191,36,.25)' }
    : P.btnFx === 'bitmap' ? { boxShadow: '4px 4px 0 #000', textTransform: 'uppercase', letterSpacing: '.06em' }
    : P.btnFx === 'round' ? { boxShadow: `0 3px 0 ${P.roundSh || '#5e1435'}` }
    : P.btnFx === 'comic' ? { border: '3px solid #111', boxShadow: '4px 4px 0 #111', textTransform: 'uppercase', letterSpacing: '.02em' }
    : P.btnFx === 'riso' ? { boxShadow: '3px 3px 0 #3255a4' }
    : P.btnFx === 'sun' ? { background: 'linear-gradient(90deg, #ff6a5a, #ff9a4a 55%, #ffd27a)', boxShadow: '0 6px 20px rgba(255,140,60,.35)' }
    : P.btnFx === 'heat' ? { background: 'linear-gradient(90deg, #e61e3c, #ff5a1f 50%, #ffaa00)', boxShadow: '0 0 22px rgba(255,90,31,.4)' } : {};
}

export const isSkin = (id) => typeof id === 'string' && id.startsWith('q-');
/** The head/name face for a skin's HUD and card headings. */
export const headFont = (t) => (t.P.serifHead ? SERIF : t.id === 'q-cur' ? MANQ : MAN);

const hexOf = (rgb) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
/** The picker's four swatches: page, card, sprite ink, accent. */
export const swatchesOf = (s) => [s.P.bg0, s.P.bg1, hexOf(colourFns(s).spr(0.65)), s.P.acc];
