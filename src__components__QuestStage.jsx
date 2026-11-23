import { useEffect, useRef, useState } from 'react';
import useQuestSprites from '../hooks/useQuestSprites';
import { revealing } from '../lib/reveal';
import Ticker from './Ticker';
import { TINTS, SIZES, PETS, heroOf, ASSET, BOSS_SPRITES, landsOf, titleCase } from '../lib/quest';
import { BASE, headFont } from '../lib/questSkins';
import { useTheme } from '../context/ThemeContext';
import BattleGround from '../quest/ground/BattleGround';
import { getGround } from '../quest/ground/registry';
import { requestGround, peekGround, keyOf } from '../quest/ground/cache';
import { hexToRGB } from '../quest/ground/blit';
import { MINI_CARD_W } from '../lib/fit';

const MONO = "'DM Mono', var(--font-mono), monospace";
// With no skin picked the stage runs on BASE, which IS what it drew before: the
// Scene tint still chooses the ink, and amber keeps its 10% of the source colour.
const mixOf = (hex, theme) => (theme === 'cyberpunk' ? 0.75 : hex === TINTS.amber[1] ? 0.1 : 0);
const BLANK = 'none';
const DT = 100; // one animation frame, as in the handoff (DT = 0.1s)
// .g-root kills CSS animation under reduced motion; the ground canvas ticks in JS,
// so it has to check for itself.
const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function useFrame() {
  const [f, setF] = useState(0);
  useEffect(() => { const id = setInterval(() => { if (!revealing()) setF((n) => n + 1); }, DT); return () => clearInterval(id); }, []);
  return f;
}

// Typewriter, one character at a time on its own animation frame (the stage's
// 100 ms clock would jump 4–5 characters at this speed), pausing after
// punctuation so a line reads in phrases. A line that arrives mid-type waits
// until the current one is typed and readable; only the newest waiting line is
// kept, so the box never falls more than one line behind the workout.
const CPS = 45;
const pauseAfter = (c, nx) => ('.!?'.includes(c) && nx !== '.' && nx !== '”' ? 260 : c === '…' ? 320 : ',:—'.includes(c) ? 120 : 0);
const charMs = (s, i) => 1000 / CPS + pauseAfter(s[i], s[i + 1]);
const typeMs = (s) => [...s].reduce((a, _, i) => a + charMs(s, i), 0);
const holdMs = (s) => (s ? Math.min(1500, Math.max(700, s.split(' ').length * 200)) : 0);
function shownChars(s, el) {
  if (el < 0 || !s) return 0;
  let n = 1, acc = 0;
  for (let i = 0; i < s.length - 1 && (acc += charMs(s, i)) <= el; i++) n++;
  return n;
}
function Typed({ text, delay = 0, cursor = true, cursorCol = '#ff2222' }) {
  const r = useRef(null);
  if (!r.current) r.current = { cur: text, start: performance.now() + delay, next: null };
  const [out, setOut] = useState({ s: '', done: !text });
  useEffect(() => {
    const x = r.current;
    x.next = text === x.cur ? null : text;
    let raf;
    const step = () => {
      const now = performance.now();
      if (x.next !== null && now >= x.start + typeMs(x.cur) + holdMs(x.cur)) { x.cur = x.next; x.next = null; x.start = now; }
      const n = shownChars(x.cur, now - x.start), done = n >= x.cur.length;
      setOut((o) => (o.s === x.cur.slice(0, n) && o.done === done ? o : { s: x.cur.slice(0, n), done }));
      if (!done || x.next !== null) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text]);
  return <>{out.s}{cursor && <span className={out.done ? 'animate-cursor-blink' : ''} style={{ display: 'inline-block', width: '.55em', height: '1.05em', verticalAlign: -2, marginLeft: 1, background: cursorCol }} />}</>;
}

// HP and XP count to a new value instead of jumping. A new `key` (another
// monster, a level up) jumps straight there, so it never counts across them.
function useRoll(v, key, ms = 650) {
  const r = useRef({ from: v, to: v, at: 0, key });
  const val = () => { const k = Math.min(1, (Date.now() - r.current.at) / ms); return r.current.from + (r.current.to - r.current.from) * (1 - (1 - k) ** 3); };
  if (r.current.key !== key) r.current = { from: v, to: v, at: 0, key };
  else if (r.current.to !== v) r.current = { from: val(), to: v, at: Date.now(), key };
  return Math.round(val());
}

/**
 * The quest scene (340px stage). Everything it shows comes from props; it only
 * keeps its own animation clock. `phase` is title | walk | encounter | battle |
 * attack | rest | victory, or boss (the weekly boss's offer: it strides in and faces the
 * hero) | banish (offer declined: a pulse throws it off); `start` is when that phase began (ms epoch, 0 = long ago),
 * so the stage times its own entrances and hits on its 100ms clock.
 *
 * monster: monsterOf() result · hit: { dmg, crit } for the attack float ·
 * area: index into LANDS · lvl/xp: shown on the hero box · msg: dialogue line.
 * taunt: { text, at } — the monster's line, played once as a full-stage cut-in.
 */
const clamp01 = (v) => Math.min(1, Math.max(0, v));
// How each hero fights, from their attack animation: blades swing, the archer
// shoots, casters cast. Timed sets charge a special for everyone.
const STYLE = { huntress2: 'archer', wizard: 'caster', ewizard: 'caster', ewizard2: 'caster', ewizard3: 'caster' };
const LEAP = [168, -92]; // a blade's jump towards the monster, px (clears the hero box)
// Fixed sky positions for stars and fireflies (so they don't jump each render).
const STARS = Array.from({ length: 14 }, (_, i) => [(i * 37 + 11) % 100, (i * 23 + 5) % 42, i % 3]);
// The weekly boss (one of BOSS_SPRITES, by week): drawn in its own colours, not the tint.
const BOSS_BODY = 120; // px tall; a usual monster is ~100
const bossSrc = (k, a, i) => `url(${ASSET}sprites/boss_${k}_${a}_${i}.png)`;
const bossLoaded = new Set();
export const preloadBoss = (k) => {
  if (bossLoaded.has(k)) return; bossLoaded.add(k);
  Object.entries(BOSS_SPRITES[k].n).forEach(([a, n]) => { for (let i = 0; i < n; i++) { const im = new Image(); im.src = `${ASSET}sprites/boss_${k}_${a}_${i}.png`; } });
};
export const BANISH_MS = 1700;
const PULSE_AT = 0.3, PULSE_HIT = 0.6; // s into a banish: the pulse leaves the hero, then reaches the boss
const MOTES = [[18, 38], [57, 30], [83, 46]]; // three dust specks, start positions (%)
// Cut-in speed streaks: [top %, thickness px, dash length px, seconds per loop].
const STREAKS = Array.from({ length: 16 }, (_, i) => [(i * 37 + 3) % 100, 1 + (i % 3), 120 + ((i * 53) % 160), 1 + ((i * 7) % 5) * 0.25]);
const CRT_FPS = 6; // the cut-in moves in steps, like old hardware, not at the display's 60/120 Hz
// Static: SVG noise, re-positioned every frame.
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
// A sprite frame's opaque bounds (source px), measured once per image, so the
// close-up can frame the body rather than the frame's empty margins.
const BOXES = new Map();
function opaqueBox(bg) {
  const src = /^url\((.*)\)$/.exec(bg || '')?.[1];
  if (!src) return null;
  if (!BOXES.has(src)) {
    BOXES.set(src, null);
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let l = c.width, r = -1, t = c.height, b = -1;
      for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++) if (d[(y * c.width + i) * 4 + 3] > 8) { l = Math.min(l, i); r = Math.max(r, i); t = Math.min(t, y); b = Math.max(b, y); }
      if (r >= 0) BOXES.set(src, { x: l, y: t, w: r - l + 1, h: b - t + 1, W: c.width, H: c.height });
    };
    im.src = src;
  }
  return BOXES.get(src);
}
const SEEDS = Array.from({ length: 10 }, (_, i) => [(i * 41 + 9) % 100, (i * 27 + 13) % 100, i % 3]);

// Each area's own weather, faint (20%) and behind the characters.
function LandFx({ kind, now }) {
  const dot = (key, style) => <div key={key} className="absolute pointer-events-none" style={style} />;
  if (kind === 'petals') return SEEDS.slice(0, 6).map(([x, y, k], i) => dot(i, {
    left: `${((x + now / (350 + k * 90)) % 110) - 5}%`, top: `${10 + ((y * 0.6 + Math.sin(now / 1500 + i) * 5) % 60)}%`,
    width: 3, height: 3, background: '#ffe4f0', transform: `rotate(${(now / 20 + i * 50) % 360}deg)` }));
  if (kind === 'needles') return SEEDS.slice(0, 7).map(([x, y, k], i) => dot(i, {
    left: `${x + Math.sin(now / 800 + i) * 3}%`, top: `${((y + now / (110 - k * 15)) % 110) - 5}%`,
    width: 6, height: 2, background: '#a8d79a', transform: `rotate(${(now / 12 + i * 40) % 360}deg)` }));
  if (kind === 'snow') return SEEDS.map(([x, y, k], i) => dot(i, {
    left: `${(x + now / 160) % 100}%`, top: `${((y + now / (70 - k * 12)) % 110) - 5}%`, width: k ? 2 : 3, height: k ? 2 : 3, background: '#fff' }));
  if (kind === 'mist') return [0, 1].map((i) => dot(i, {
    left: `${((now / 260 + i * 70) % 170) - 70}%`, top: `${48 + i * 12}%`, width: '75%', height: 36,
    background: 'radial-gradient(ellipse at center, rgba(205,215,225,1), transparent 70%)' }));
  if (kind === 'drips') return [
    dot('torch', { left: -40, top: -30, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,170,80,1), transparent 65%)', opacity: 0.85 + 0.15 * Math.sin(now / 140) * Math.sin(now / 370) }),
    ...[[22, 0], [61, 1.2], [84, 2.3]].map(([x, off], i) => {
      const c = ((now / 1000 + off) % 3.5) / 0.7; // falls in the first 0.7 s of each 3.5 s
      return c < 1 && dot(`d${i}`, { left: `${x}%`, top: `${4 + c * 62}%`, width: 2, height: 6, background: '#bfe3ff' });
    }),
  ];
  return null;
}

/**
 * The skin tokens and the sprite jobs the stage draws with. Exported because
 * the recolour has to be able to run before this screen exists: the cache is
 * keyed on exactly these, so warming it elsewhere is a hit here, not a second
 * bake. `K` is the active skin's tokens; `theme` is the reskin (which sprite
 * set and lands), which a skin never changes, so it always comes from the profile.
 */
export function stageArt({ theme = 'fantasy', hero, pet: petKey, tint = 'amber', monster = null } = {}, questSkin = null) {
  const hex = TINTS[tint]?.[1] || TINTS.amber[1];
  const K = questSkin ? { ...questSkin, theme } : { ...BASE, theme, tint: hex, m: mixOf(hex, theme) };
  const [hk, , , hn] = heroOf(hero, theme);
  const pet = PETS.find((p) => p[0] === petKey);
  const jobs = [
    ...['idle', 'run', 'atk'].filter((a) => hn[a]).map((a) => [`${hk}_${a}`, hn[a]]),
    ...(monster ? [[monster.sprite, 4]] : []),
    ...(pet ? [[`pet_${pet[0]}`, 4]] : []),
    ['chort', 4], ['swampy', 4], // the gauntlet's minions — always loaded, so starting cardio never blanks the stage
  ];
  return { K, jobs };
}

export default function QuestStage({ phase, start = 0, aura = null, monster, hit, area = 0, heroName = 'Warlord', petKey = null, lvl, xp, tint = 'amber', scanlines = true, msg = '', title, card, theme = 'fantasy',
  fx = {}, charge = null, react = null, lastStand = false, dozing = false, dayK = 0, combo = 0, rest = null, gauntlet = null, gauntletEx = false, chase = null, taunt = null, scale = 1 }) {
  const frame = useFrame();
  const t = start ? Math.max(0, (Date.now() - start) / 1000) : 9;
  const [wf, setWf] = useState(0);
  const walking = phase === 'walk' || phase === 'title';
  useEffect(() => { if (walking || gauntlet === 'run') setWf((w) => w + 1); }, [frame]); // eslint-disable-line react-hooks/exhaustive-deps

  const { questSkin } = useTheme() || {};
  const { K, jobs } = stageArt({ theme, hero: heroName, pet: petKey, tint, monster }, questSkin);
  const ST = K.st;
  const LANDS = landsOf(theme);
  const [hk, hw, hh, hn, hcx, hws, hbs] = heroOf(heroName, theme);
  const pet = PETS.find((p) => p[0] === petKey);
  const { sprites, lands, strip } = useQuestSprites(K, jobs);

  const isBattle = ['battle', 'attack', 'rest', 'victory'].includes(phase);
  const gy = phase === 'title' ? 50 : 0; // the title screen's ground sits 50px lower
  const land = LANDS[Math.min(area, LANDS.length - 1)];
  const glow = K.sprFilter || (K.glow ? `drop-shadow(0 0 6px ${K.tint}88)` : 'none');
  // The colour of anything the hero throws: arcs, arrows, orbs, runes, speed lines.
  const fxCol = K.slash || K.tint;

  // encounter: shake → "!" → strobe → bar wipe in; battle entry: bars wipe out, monster slides in
  let flashOp = 0, wipe = 0;
  if (phase === 'encounter') {
    if (t >= 0.9 && t < 1.7) flashOp = Math.floor(t * 10) % 2 ? 0.9 : 0;
    if (t >= 1.7) wipe = Math.min(1, (t - 1.7) / 0.7);
  }
  const entryT = phase === 'battle' ? t : 9;
  if (isBattle && entryT < 0.5) wipe = 1 - entryT / 0.5;
  const ent = Math.min(1, Math.max(0, (entryT - 0.2) / 0.6));
  const shake = phase === 'encounter' && t < 0.9 ? `translateX(${frame % 2 ? 3 : -3}px)` : 'none';

  const now = Date.now();
  // ── Attack: one strike, or one per set in a drop chain; the pet strikes on a tag-team.
  const strikes = phase === 'attack' && hit ? Math.max(1, hit.chain || 1) : 0;
  const t0 = (j) => (strikes > 1 ? 0.15 + j * 0.45 : 0);
  const curStrike = strikes > 1 ? Math.min(strikes - 1, Math.max(0, Math.floor((t - 0.15) / 0.45))) : 0;
  const tt = strikes ? t - t0(curStrike) : 9;
  const lunge = (x) => (x < 0 ? 0 : x < 0.25 ? (x / 0.25) * 34 : x < 0.6 ? 34 * (1 - (x - 0.25) / 0.35) : 0);
  const impacting = strikes > 0 && Array.from({ length: strikes }, (_, j) => t - t0(j)).some((x) => x >= 0.3 && x < 0.9);
  const byPet = !!(hit?.by === 'pet' && pet);

  let monX = (1 - ent) * 240, monY = 0, monOp = 1, hitFlash = false;
  if (phase === 'battle') monY = frame % (dozing ? 24 : 12) < (dozing ? 12 : 6) ? 0 : 1;
  if (impacting) { monX += frame % 2 ? 6 : -6; hitFlash = frame % 2 === 1; }
  const camp = !!(fx.camp && phase === 'rest' && rest);
  if (phase === 'rest') { monY = frame % 16 < 8 ? 0 : 2; if (camp) monX += Math.sin(frame / 9) * 12; } // paces, keeping its distance
  // The chase: the monster flees right as the gauntlet begins (facing away), is
  // gone while its minions come, then reappears over the last 15% and closes in.
  const fleeT = chase ? (now - chase.from) / 1000 : 9;
  const closing = !!(chase && chase.k != null && chase.k >= 0.85);
  let monFlip = false;
  if (gauntlet) {
    if (fleeT < 2) { monX += Math.pow(fleeT / 2, 1.6) * 260; monFlip = true; monY = frame % 2 ? -2 : 0; } // turns, then bolts
    else if (closing) monX += (1 - (chase.k - 0.85) / 0.15) * 220;
    else monOp = 0;
  }
  if (phase === 'victory') {
    if (monster?.boss && (BOSS_SPRITES[monster.boss] || BOSS_SPRITES.dslime).n.death) { monOp = t < 2.1 ? 1 : Math.max(0, 1 - (t - 2.1) / 0.6); } // the death animation plays out first
    else { const k = Math.min(1, t / 0.8); monY = k * 46; monOp = 1 - k; }
  }
  // Reacting to a stepper tap: flinch (shake + "!?") or laugh (bounce + "HA!").
  const rt = react ? (now - react.at) / 1000 : 9;
  const reacting = fx.react && rt < 1.2 && (phase === 'battle' || phase === 'rest');
  if (reacting && react.kind === 'flinch' && rt < 0.4) monX += frame % 2 ? 5 : -5;
  if (reacting && react.kind === 'laugh' && rt < 0.8) monY -= Math.abs(Math.sin(rt * 16)) * 6;
  let heroX = (1 - ent) * -200;
  const style = STYLE[hk] || 'melee';
  const move = !hit ? null : byPet ? 'pet' : hit.special ? `special-${style}` : style;
  // A blade leaps in (run frames), swings at the top (attack frames), drops back.
  // A drop chain leaps once and swings per strike before coming back.
  const lastT = strikes ? t0(strikes - 1) : 0;
  const leapK = move === 'melee' ? (t < 0.22 ? t / 0.22 : t < lastT + 0.55 ? 1 : t < lastT + 0.9 ? 1 - (t - lastT - 0.55) / 0.35 : 0) : 0;
  const swingT = move === 'melee' ? tt - 0.22 : tt; // where the attack frames are, per strike
  let heroY = 0;
  if (phase === 'attack') {
    if (move === 'melee') { heroX += LEAP[0] * leapK; heroY = LEAP[1] * leapK - Math.sin(leapK * Math.PI) * 10; }
    else if (move !== 'pet' && move !== 'archer') heroX += lunge(tt);
  }
  const heroBack = move === 'melee' && t >= lastT + 0.55 && leapK > 0; // facing home on the way back
  let petDash = byPet ? (tt < 0.25 ? (tt / 0.25) * 150 : tt < 0.6 ? 150 * (1 - (tt - 0.25) / 0.35) : 0) : 0;

  // ── Rest at camp: the pet wanders off and back; the hero stands for the last 3 s.
  const restP = camp && rest.total ? clamp01(1 - rest.left / rest.total) : 0;
  const ready = camp && rest.left <= 3;
  const petOut = camp ? (restP < 0.4 ? (restP / 0.4) * 110 : restP < 0.8 ? 110 * (1 - (restP - 0.4) / 0.4) : 0) : 0;
  const petBack = camp && restP >= 0.4 && restP < 0.8;
  // ── Victory loot: a gem drops where the monster fell; the pet (or hero) fetches it.
  const loot = !!(fx.loot && phase === 'victory');
  const gemT = loot ? t : 0;
  // The gem lands on open ground mid-stage (clear of the hero box); the pet runs ~150px to it.
  if (loot && pet) petDash = gemT < 1.4 ? 0 : gemT < 2.0 ? ((gemT - 1.4) / 0.6) * 150 : gemT < 2.4 ? 150 : gemT < 3.4 ? 150 * (1 - (gemT - 2.4)) : 0;
  const breath = fx.ambient ? 1 + 0.018 * Math.sin(frame / 5) : 1;
  const stomp = lastStand && phase === 'battle' && (now / 1000) % 2.4 < 0.15;
  const prShake = hit?.pr && phase === 'attack' && t >= 0.3 && t < 0.6;
  const chargeK = charge ? clamp01((now - charge.from) / charge.dur) : 0;

  const S = (key) => sprites[key];
  const frameOf = (key, i, white) => { const s = S(key); return s ? ((white ? s.hit : s.tint)[i] || s.tint[0] || BLANK) : BLANK; };
  const heroWalk = walking ? frameOf(`${hk}_run`, wf % hn.run) : frameOf(`${hk}_idle`, Math.floor(frame / 1.2) % hn.idle);
  // ── Gauntlet (cardio running / an interval's work): small monsters charge in
  // every 2.4 s; a blade cuts them down on contact, the archer and casters shoot
  // them mid-way. An interval's rest: the hero crouches, nothing comes.
  const GP = 2.4, GT = 1.5;
  const killPct = style === 'melee' ? 34 : 58;
  // Melee heroes vary the gauntlet kill so the run isn't one slash on a loop:
  // a standing slash, a leap over the minion with a downward cut, or a dash out
  // to meet it further away. Keyed to the minion index, so each one is stable.
  // Ranged heroes keep their mid-air shot.
  const gMove = (i) => (style === 'melee' ? ['slash', 'leap', 'dash', 'spin'][i % 4] : 'shot');
  let gAtk = -1, minion = null, gSpin = 0;
  if (gauntlet === 'run' && phase === 'battle' && fleeT >= 2 && !closing) {
    const sec = now / 1000, i = Math.floor(sec / GP), a = sec - i * GP;
    const gm = gMove(i), mx = gm === 'dash' ? 50 : killPct;
    if (a < GT + 0.35) minion = { i, a, gm, mx, x: 100 - (100 - mx) * Math.min(1, a / GT), dead: a >= GT };
    const act = clamp01((a - (GT - 0.4)) / 0.7); // 0 before the move, 1 after it lands
    if (gm === 'leap') {
      gAtk = a >= GT - 0.45 && a < GT + 0.2 ? clamp01((a - (GT - 0.45)) / 0.65) : -1; // aerial slash across the arc
      heroY += -Math.sin(act * Math.PI) * 66;
      heroX += Math.sin(act * Math.PI) * 24;
    } else {
      if (a >= GT - 0.3 && a < GT + 0.05) gAtk = (a - (GT - 0.3)) / 0.35;
      if (gm === 'dash') heroX += (act < 0.5 ? act / 0.5 : 1 - (act - 0.5) / 0.5) * 120; // out and back
      if (gm === 'spin') gSpin = act * 360; // one full whirl as it connects
    }
  }
  const bk = BOSS_SPRITES[monster?.boss] ? monster.boss : monster?.boss ? 'dslime' : null;
  const isBoss = !!bk, bs = bk && BOSS_SPRITES[bk];
  // ── The weekly boss on the road: offered, or thrown off by the pulse.
  const standing = isBoss && (phase === 'boss' || phase === 'banish' || phase === 'encounter');
  const bt = phase === 'banish' ? t - PULSE_HIT : -1; // s since the pulse struck it
  const bossIn = phase === 'boss' ? 1 - (1 - clamp01(t / 0.9)) ** 3 : 1;
  const standX = (1 - bossIn) * 280 + (bt > 0 ? Math.min(1, bt / 0.15) * 26 + clamp01((bt - 0.15) / 0.75) ** 2 * 320 : 0);
  const standOp = bt > 0.2 ? 1 - clamp01((bt - 0.2) / 0.7) : 1;
  const jolt = !reducedMotion && ((phase === 'boss' && t >= 0.8 && t < 1.1) || (bt >= 0 && bt < 0.3));
  const casting = phase === 'banish' && t < 0.7 && hn.atk;
  const heroRoad = casting ? frameOf(`${hk}_atk`, Math.min(hn.atk - 1, Math.floor((t / 0.7) * hn.atk))) : heroWalk;
  const heroBattle = phase === 'attack' && !byPet && move === 'melee' && leapK > 0 && (swingT < 0 || swingT >= 0.33)
    ? frameOf(`${hk}_run`, frame % hn.run)
    : phase === 'attack' && !byPet && swingT >= 0 && swingT < (move === 'melee' ? 0.33 : 0.7)
    ? (hn.atk ? frameOf(`${hk}_atk`, Math.min(hn.atk - 1, Math.floor((swingT / (move === 'melee' ? 0.33 : 0.7)) * hn.atk))) : frameOf(`${hk}_run`, frame % hn.run))
    : frameOf(`${hk}_idle`, Math.floor(frame / 1.2) % hn.idle, phase === 'victory');
  const heroFrame = gauntlet === 'run' && phase === 'battle'
    ? (gAtk >= 0 && hn.atk ? frameOf(`${hk}_atk`, Math.min(hn.atk - 1, Math.floor(gAtk * hn.atk))) : frameOf(`${hk}_run`, wf % hn.run))
    : heroBattle;
  const monSrc = monster ? frameOf(monster.sprite, Math.floor(frame / (phase === 'rest' ? 4 : 2)) % 4, hitFlash) : BLANK;
  useEffect(() => { if (bk) preloadBoss(bk); }, [bk]);
  // When a monster first appears it waits 2 s, then plays its attack once, just
  // for show. Only the bosses have attack frames.
  const appear = useRef({ id: null, at: 0 });
  const monId = monster ? `${monster.name}|${monster.max}` : null;
  if (monId && phase === 'battle' && appear.current.id !== monId) appear.current = { id: monId, at: now - t * 1000 };
  const sinceIn = monId && appear.current.id === monId ? (now - appear.current.at) / 1000 - 2 : -1;
  // Boss: idle, that one attack, hit frames when struck (or a flash), and its
  // full death (2 s) before it fades.
  let bossFrame = null, bossFlash = false;
  if (bs) {
    const { n } = bs;
    if (phase === 'victory') bossFrame = n.death ? bossSrc(bk, 'death', Math.min(n.death - 1, Math.floor((t / 2) * n.death))) : bossSrc(bk, 'idle', 0);
    else if (impacting) { bossFrame = n.hit ? bossSrc(bk, 'hit', frame % n.hit) : bossSrc(bk, 'idle', 0); bossFlash = !n.hit && frame % 2 === 1; }
    else if (bt >= 0) { bossFrame = n.hit ? bossSrc(bk, 'hit', frame % n.hit) : bossSrc(bk, 'idle', 0); bossFlash = frame % 2 === 1 && bt < 0.5; }
    else if (phase === 'boss' && t >= 1.4 && t - 1.4 < n.atk * 0.1) bossFrame = bossSrc(bk, 'atk', Math.floor((t - 1.4) / 0.1));
    else if (phase === 'battle' && sinceIn >= 0 && sinceIn < n.atk * 0.1) bossFrame = bossSrc(bk, 'atk', Math.floor(sinceIn / 0.1));
    else bossFrame = bossSrc(bk, 'idle', Math.floor(frame / (dozing ? 3 : 1.5)) % n.idle);
  }
  const bScale = bs ? BOSS_BODY / bs.body : 1, bossW = bs ? Math.round(bs.w * bScale) : 0, bossH = bs ? Math.round(bs.h * bScale) : 0;
  const bossDrop = bs ? Math.round((bs.h - (bs.foot ?? bs.h)) * bScale) : 0; // below its feet: a hoverer's fall on death
  const petSrc = pet ? frameOf(`pet_${pet[0]}`, Math.floor(frame / 2) % 4) : BLANK;
  const petH = pet ? pet[3] : 16;
  const hpFrac = monster && monster.max ? monster.hp / monster.max : 0;
  const hpShown = useRoll(monster ? Math.round(monster.hp) : 0, monId);
  const xpShown = useRoll(xp, lvl);
  const dk = Math.max(0, t - 0.3);
  // ── Taunt cut-in: speed lines, the monster in close-up, its line typed out.
  const tauntT = taunt ? (now - taunt.at) / 1000 : 99;
  const tauntDur = taunt ? Math.min(5, Math.max(3.2, 0.3 + taunt.text.length / 45 + 1.8)) : 0;
  const cutIn = !!(taunt && monster && tauntT >= 0 && tauntT < tauntDur);
  // A still close-up (old games never animated the portrait): the body 320px wide, head at the top.
  const cSrc = cutIn ? (isBoss ? bossSrc(bk, 'idle', 0) : frameOf(monster.sprite, 0)) : BLANK;
  const cBox = cutIn ? opaqueBox(cSrc) : null;
  const ck = cBox ? 320 / cBox.w : 0;

  const layers = land.strip
    ? [{ img: strip || BLANK, size: '1536px 352px', pos: `${-wf * 6}px 0px`, op: 1 }]
    : land.layers.map(([n, sp]) => ({ img: lands?.[n] || BLANK, size: 'auto 290px', pos: `${-wf * 6 * sp}px ${gy - 40}px`, op: land.dim || 1 }));
  const box = { ...K.box, color: K.boxTxt };
  const nameStyle = K.nameMono
    ? { font: `500 12px ${MONO}`, letterSpacing: '.12em', textTransform: 'uppercase' }
    : { fontFamily: headFont(K), fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em' };
  const lvStyle = { fontSize: 10, color: K.boxLv };
  const subStyle = { marginTop: 4, fontSize: 11, color: K.boxSub, fontVariantNumeric: 'tabular-nums' };

  // The canvas battle ground. null everywhere means "render exactly what renders
  // today", which covers gauntlet, cyberpunk, unported areas and a bake that
  // isn't finished yet.
  // gauntletEx, not just gauntlet: a cardio/interval exercise is gauntlet-style
  // for its whole battle, even in the moments before its timer starts.
  // The canvas ground tints one baked luma field with one colour, so it only
  // works for a skin whose sprites are one colour too. A duo / pal4 / grad skin
  // maps luma to colours that no single tint can stand in for — those fall back
  // to the parallax layers, which go through the same colourFns the sprites do,
  // and to st.sky / st.ground / st.line / st.overlay, which is the ground the
  // skin tokens were drawn against.
  const ground = theme === 'fantasy' && !gauntlet && !gauntletEx && K.mode === 'tint'
    ? getGround(theme, Math.min(area, LANDS.length - 1)) : null;
  const gKey = ground ? keyOf(theme, ground.id, isBoss) : null;

  // Bake during walk, both variants, so the first encounter already has one.
  useEffect(() => {
    if (!ground) return;
    requestGround(theme, ground, false);
    if (ground.hasBoss !== false) requestGround(theme, ground, true);
  }, [theme, area]); // eslint-disable-line react-hooks/exhaustive-deps

  // Latched at battle entry: a battle never swaps its ground mid-fight.
  //
  // The latch only re-evaluates when `start` changes, so a gauntlet beginning on
  // the same `start` as the normal battle before it used to inherit on:true while
  // `ground` had become null — and the markup below reads ground.cover. That null
  // dereference crashed the whole stage when you started intervals. groundOn now
  // requires `ground` itself, so it can never be true without one.
  const latch = useRef({ start: null, on: false });
  if (isBattle && ground && latch.current.start !== start) latch.current = { start, on: !!peekGround(gKey) };
  if (!isBattle || !ground) latch.current = { start: null, on: false };
  const groundOn = !!ground && isBattle && latch.current.on;

  // Option D's restaging. The canvas camera puts the hero's feet at (86, 276)
  // and the monster's at (306, 148); without this they stand at (70, 266) and
  // (322, 130) — the monster 6px under the horizon, i.e. at depth 25, drawn four
  // times bigger than that depth allows. Scale is deliberately NOT touched: at
  // z 6.33 the existing 3x IS the honest size, so every attack FX keeps reading.
  const gHX = groundOn ? 16 : 0, gHY = groundOn ? 10 : 0;   // hero: right and down
  // The monster read small once it was standing at its true depth. Scale is a
  // multiplier on each monster's own (3x..5x), applied from the group's bottom
  // edge, so feet stay on y 148 and every FX anchored to the group still lines up.
  const gMS = groundOn ? 1.18 : 1;
  const gMX = groundOn ? 16 : 0, gMY = groundOn ? 18 : 0;   // monster: left and down

  // A HUD bar: ten blocks, a hatched outline, or the plain track it has today.
  const bar = (frac, col, hg) => (K.seg ? (
    <div className="flex-1 flex" style={{ gap: 2 }}>
      {Array.from({ length: 10 }, (_, i) => <span key={i} className="flex-1" style={{ height: hg + 2, background: i < Math.ceil(frac * 10) ? col : K.segOff }} />)}
    </div>
  ) : (
    <div className="flex-1 overflow-hidden" style={{ height: hg, background: K.hpTrack, borderRadius: K.hatch ? 0 : hg / 2, border: K.hatch ? `1.5px solid ${K.boxTxt}` : 'none' }}>
      <div className="h-full" style={{ width: `${frac * 100}%`, background: K.hatch ? `repeating-linear-gradient(45deg, ${col} 0 2px, transparent 2px 4px)` : col, transition: 'width .5s cubic-bezier(.2,1,.3,1), background .3s' }} />
    </div>
  ));
  const hpCol = K.hp === 'classic' ? (hpFrac > 0.5 ? '#22c55e' : hpFrac > 0.2 ? '#f59e0b' : '#ef4444') : K.hp;

  // On a short screen the whole stage scales down as one piece (lib/fit
  // stageScale), so the controls under it stay on screen. Inside, nothing
  // changes: the scene is still laid out 340 tall, just wider by 1/k so it still
  // fills the width once scaled. The wrapper is always there, so a change of
  // scale never remounts the scene.
  const k = Math.min(1, Math.max(0.5, Number(scale) || 1));
  // Its text panels shrink by √k rather than k, so they stay readable while the
  // scene gets small. Each grows back from the corner it's pinned to; the
  // message box only gets bigger type (its box keeps its height, so it doesn't
  // ride up over the hero).
  const tk = 1 / Math.sqrt(k);
  const grow = (origin) => (k < 1 ? { transform: `scale(${tk})`, transformOrigin: origin } : null);
  return (
    // z-index 2 keeps the stage above the page's own layers.
    // The stage stays 340 under a bezel too (the handoff shrank it to 316 to
    // keep the outer box the same): at 316 the message box rides up over the
    // hero on the title screen, and a skin is not supposed to move the scene.
    <div className="relative flex-shrink-0" style={{ height: 340 * k, zIndex: 2 }}>
    <div className="absolute left-0 top-0 overflow-hidden" style={{ width: `${100 / k}%`, height: 340, transform: k < 1 ? `scale(${k})` : undefined, transformOrigin: '0 0', background: ST.bg, borderRadius: ST.rad, border: ST.border, fontFamily: MONO, color: ST.txt }}>
      {/* zIndex 0 makes this a stacking context permanently (today it only is one
          while the shake transform is set), so nothing inside it — the canvas
          included — can ever paint above a later sibling. No visual change. */}
      <div data-ascii="skip" className="absolute inset-0" style={{ zIndex: 0, background: ST.sky, transform: prShake ? `translate(${frame % 2 ? 6 : -6}px, ${frame % 2 ? -3 : 3}px)` : stomp ? 'translateY(3px)' : jolt ? `translateX(${frame % 2 ? 3 : -3}px)` : shake }}>
        {!(groundOn && ground.cover === 'full') && layers.map((l, i) => (
          <div key={i} className="absolute inset-0" style={{ backgroundImage: l.img, backgroundSize: l.size, backgroundRepeat: 'repeat-x', backgroundPosition: l.pos, imageRendering: 'pixelated', opacity: l.op, transition: 'background-position .1s linear' }} />
        ))}
        {!groundOn && !land.strip && <div className="absolute left-0 right-0 bottom-0" style={{ top: 204 + gy, background: ST.ground, boxShadow: ST.line || `inset 0 2px 0 ${K.tint}` }} />}
        {groundOn && <BattleGround renderer={ground} bakeKey={gKey} accentRGB={hexToRGB(K.tint)} reducedMotion={reducedMotion} />}
      </div>
      {fx.weather && land.fx && <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: 0.2 }}><LandFx kind={land.fx} now={now} /></div>}
      {/* Day → night over the session: dusk glow on the horizon, then night and faint stars.
          Outdoors only — the dungeon has no sky. */}
      {dayK > 0 && !land.strip && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(to bottom, rgba(14,18,48,${0.55 * dayK}) 0%, rgba(30,18,44,${0.3 * dayK}) 50%, rgba(255,120,40,${0.14 * Math.sin(Math.PI * Math.min(1, dayK * 1.6))}) 60%, transparent 68%)` }} />
      )}
      {dayK > 0.55 && !land.strip && STARS.map(([x, y, k], i) => (
        <div key={i} className="absolute pointer-events-none" style={{ left: `${x}%`, top: `${y}%`, width: 1, height: 1, background: '#fff', opacity: 0.5 * (dayK - 0.55) * 2.2 * (0.5 + 0.5 * Math.sin(frame / (4 + k) + i)) }} />
      ))}
      {/* Birds now and then */}
      {fx.ambient && phase !== 'encounter' && ((now / 1000) % 22) < 7 && [0, 1, 2].map((i) => {
        const c = ((now / 1000) % 22) / 7;
        return (
          <svg key={i} className="absolute pointer-events-none" width="10" height="5" viewBox="0 0 10 5" style={{ left: `${-8 + c * 116 - i * 4}%`, top: `${12 + i * 3 + Math.sin(c * 12 + i) * 1.5}%` }}>
            <path d={frame % 6 < 3 ? 'M0 1 L5 4 L10 1' : 'M0 3 L5 2 L10 3'} stroke="rgba(0,0,0,.75)" strokeWidth="1.5" fill="none" />
          </svg>
        );
      })}
      {ST.overlay && <div className="absolute inset-0 pointer-events-none" style={{ background: ST.overlay }} />}
      {ST.vig && <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 60%, transparent 45%, ${ST.vig} 100%)` }} />}

      {(phase === 'walk' || phase === 'title' || phase === 'boss' || phase === 'banish') && (
        <div className="absolute z-[5]" style={{ top: 14, left: 14, font: `500 10px ${MONO}`, letterSpacing: '.14em', ...K.chip, ...grow('0 0') }}>
          AREA {Math.min(area, LANDS.length - 1) + 1} · {land.name.toUpperCase()}
        </div>
      )}
      {phase === 'title' && title && (
        // The left half, but never under the hero card (MINI_CARD_W, 14 px in
        // from the right) on a narrow stage. The words shrink to the width left
        // rather than run under it: ~3.4em is the widest skin's "QUEST".
        <div className="absolute z-[5] text-center pointer-events-none" style={{ top: 56, left: 0, width: `min(52%, calc(100% - ${MINI_CARD_W} - 22px))`, containerType: 'inline-size' }}>
          <div style={{ fontFamily: K.title.font, fontSize: `min(${K.title.size}px, 29cqw)`, fontWeight: K.title.weight, fontStyle: K.title.italic ? 'italic' : 'normal', letterSpacing: K.title.track, lineHeight: 0.95, color: K.title.color, textShadow: K.title.shadow,
            ...(K.title.clip ? { backgroundImage: K.title.clip, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))' } : {}) }}>{K.title.words[0]}<br />{K.title.words[1]}</div>
          <div className="inline-block max-w-full" style={{ marginTop: 10, font: `500 10px ${MONO}`, letterSpacing: '.14em', textWrap: 'balance', ...K.chip, color: questSkin ? K.lvCol : title.color }}>{title.line}</div>
        </div>
      )}
      {/* The card draws its own dithered art on a clock of its own — the glyph
          grid would just freeze a frame of it. */}
      {phase === 'title' && <span data-ascii="skip">{card}</span>}

      {(phase === 'walk' || phase === 'title' || phase === 'encounter' || phase === 'boss' || phase === 'banish') && (
        <>
          <div data-ascii="skip" className="absolute" style={{ left: 62, top: 200 + gy, width: 44, height: 10, borderRadius: '50%', background: K.shadow }} />
          {pet && <div data-ascii="skip" className="absolute" style={{ left: 18, top: 206 + gy - petH * 2.4 + (walking && wf % 4 < 2 ? -3 : 0), width: 16 * 2.4, height: petH * 2.4, backgroundImage: petSrc, backgroundSize: '100% 100%', imageRendering: 'pixelated', filter: glow }} />}
          <div data-ascii="skip" className="absolute" style={{ left: 84 - hcx * hws, top: 206 + gy - hh * hws, width: hw * hws, height: hh * hws, backgroundImage: heroRoad, backgroundSize: '100% 100%', imageRendering: 'pixelated', filter: glow }} />
          {phase === 'encounter' && t < 1.7 && <div className="absolute" style={{ left: 70, top: 186 - hh * hws, background: K.P.battle, color: '#fff', font: `500 12px ${MONO}`, padding: '1px 6px', borderRadius: 4 }}>!</div>}
        </>
      )}

      {standing && (
        <div className="absolute flex flex-col items-center pointer-events-none" style={{ top: 206 - bossH + bossDrop, right: 0, transform: `translateX(${standX}px) rotate(${bt > 0 && !reducedMotion ? Math.min(14, bt * 22) : 0}deg)`, opacity: standOp, transition: 'transform .1s linear, opacity .1s linear' }}>
          <div style={{ backgroundImage: bossFrame, backgroundSize: '100% 100%', width: bossW, height: bossH, imageRendering: 'pixelated', transform: `scaleY(${breath})`, transformOrigin: 'bottom',
            filter: `drop-shadow(0 0 ${8 + (frame % 10 < 5 ? 4 : 0)}px ${bs.glow})${bossFlash ? ' brightness(2.2)' : ''}` }} />
          <div style={{ width: 160, height: 14, marginTop: -8 - bossDrop, borderRadius: '50%', background: K.shadow, zIndex: -1 }} />
        </div>
      )}
      {/* The banishing pulse: light gathers at the hero, then rings of it sweep the stage. */}
      {phase === 'banish' && (
        <>
          {t < PULSE_AT && <div className="absolute pointer-events-none rounded-full" style={{ left: 84, top: 160, width: 8 + t * 80, height: 8 + t * 80, transform: 'translate(-50%, -50%)', background: '#fff', boxShadow: `0 0 16px ${fxCol}, 0 0 32px ${fxCol}` }} />}
          {[0, 0.12, 0.24].map((d) => {
            const q = (t - PULSE_AT - d) / 0.8;
            if (q <= 0 || q >= 1) return null;
            const size = 30 + q * 1100;
            return <div key={d} className="absolute pointer-events-none rounded-full" style={{ left: 84, top: 160, width: size, height: size, transform: 'translate(-50%, -50%)', border: `${d ? 2 : 5}px solid ${d ? fxCol : '#fff'}`, boxShadow: `0 0 18px ${fxCol}, inset 0 0 18px ${fxCol}`, opacity: 1 - q, transition: 'width .1s linear, height .1s linear, opacity .1s linear' }} />;
          })}
          {!reducedMotion && t >= PULSE_AT && t < PULSE_AT + 0.3 && <div className="absolute inset-0 pointer-events-none" style={{ background: fxCol, opacity: 0.35 * (1 - (t - PULSE_AT) / 0.3) }} />}
          {bt > 0.2 && SEEDS.map(([x, y, n], i) => (
            <div key={i} className="absolute pointer-events-none" style={{ right: 30 + x * 1.3, top: 190 - y - (bt - 0.2) * 50 * (1 + n / 2), width: 3, height: 3, background: i % 3 ? fxCol : '#fff', boxShadow: `0 0 6px ${fxCol}`, opacity: Math.max(0, 1 - (bt - 0.2) / 0.9), transition: 'top .1s linear' }} />
          ))}
        </>
      )}

      {isBattle && monster && (
        <>
          <div className="absolute" style={{ top: 14, left: 14, width: 172, padding: '10px 12px', ...box, opacity: ent, zIndex: isBoss ? 3 : undefined, ...grow('0 0') }}>
            <div className="flex justify-between items-baseline gap-1.5">
              <Ticker retype style={nameStyle}>{isBoss ? monster.name : titleCase(monster.species)}</Ticker>
              <span className="flex-shrink-0" style={lvStyle}>Lv{monster.lv}</span>
            </div>
            <div className="flex items-center gap-1.5" style={{ marginTop: 7 }}>
              <span style={{ fontSize: 9, fontWeight: 500, color: K.hpLab, letterSpacing: '.08em' }}>HP</span>
              {bar(hpFrac, hpCol, 6)}
            </div>
            <div className="text-right" style={subStyle}>
              {hpShown.toLocaleString()} / {monster.max.toLocaleString()}
            </div>
          </div>

          <div className="absolute flex flex-col items-center" style={{ top: (isBoss ? 136 - bossH - 4 + bossDrop : 18) + gMY, right: (isBoss ? 0 : 12) + gMX, transform: `translate(${monX}px, ${monY}px)${monFlip === isBoss ? ' scaleX(-1)' : ''}`, opacity: monOp }}>
            {isBoss ? (
              <div className="flex items-end justify-center" style={{ height: bossH + 4 }}>
                <div style={{ backgroundImage: bossFrame, backgroundSize: '100% 100%', width: bossW, height: bossH, imageRendering: 'pixelated', transform: `scaleY(${breath})`, transformOrigin: 'bottom',
                  filter: `drop-shadow(0 0 ${8 + (frame % 10 < 5 ? 4 : 0)}px ${bs.glow})${dozing ? ' brightness(0.7)' : ''}${bossFlash ? ' brightness(2.2)' : ''}` }} />
              </div>
            ) : (
            <div className="flex items-end justify-center" style={{ height: 112, paddingRight: 8 }}>
              <div style={{ backgroundImage: monSrc, backgroundSize: '100% 100%', width: SIZES[monster.sprite][0] * monster.scale * gMS, height: SIZES[monster.sprite][1] * monster.scale * gMS, imageRendering: 'pixelated', transform: `scaleY(${breath})`, transformOrigin: 'bottom', filter: aura ? `drop-shadow(0 0 ${6 + (frame % 10 < 5 ? 4 : 0)}px ${aura}) drop-shadow(0 0 2px ${aura})` : `${glow} brightness(${phase === 'rest' || dozing ? 0.7 : 1})` }} />
            </div>
            )}
            <div style={{ width: isBoss ? (groundOn ? 120 : 160) : (groundOn ? 52 : 96), height: groundOn ? 9 : 14, marginTop: -6 - bossDrop, borderRadius: '50%', background: K.shadow }} />
          </div>
          {reacting && (
            <div className="absolute pointer-events-none" style={{ top: 22 + gMY, right: 96 + gMX, padding: '2px 7px', borderRadius: 8, background: ST.txt, color: ST.sky, font: `700 12px ${MONO}`, transform: `scale(${Math.min(1, rt * 6)})`, opacity: rt > 0.9 ? 1 - (rt - 0.9) / 0.3 : 1 }}>
              {react.kind === 'flinch' ? '!?' : 'HA!'}
            </div>
          )}
          {dozing && [0, 1, 2].map((i) => {
            const z = ((now / 1000 + i * 0.8) % 2.4) / 2.4;
            return <div key={i} className="absolute pointer-events-none" style={{ top: 40 - z * 34 + gMY, right: 70 - z * 14 - i * 6 + gMX, font: `700 ${10 + i * 3}px ${MONO}`, color: K.zz, opacity: 1 - z }}>z</div>;
          })}

          {phase === 'attack' && t >= 0.3 && hit && strikes === 1 && K.stamp && (
            <div className="absolute pointer-events-none" style={{ top: 44 + gMY, right: 50 + gMX, padding: '2px 10px', border: '2.5px solid #c0392b', borderRadius: 6, color: '#c0392b', fontFamily: headFont(K), fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums', animation: 'qs-stamp .35s cubic-bezier(.2,1.4,.4,1) both', opacity: Math.max(0, 1 - Math.max(0, dk - 0.9) / 0.4) }}>−{hit.dmg.toLocaleString()}</div>
          )}
          {phase === 'attack' && t >= 0.3 && hit && strikes === 1 && !K.stamp && (
            <div className="absolute text-center pointer-events-none" style={{ top: 46 + gMY, right: 64 + gMX, transform: `translateY(${-dk * 40}px)`, opacity: Math.max(0, 1 - dk / 1.2) }}>
              <div style={{ font: `500 22px ${MONO}`, color: hit.pr ? '#fbbf24' : K.dmg, textShadow: K.dmgShadow, fontVariantNumeric: 'tabular-nums' }}>−{hit.dmg.toLocaleString()}</div>
              {(hit.crit || hit.sneak) && <div style={{ font: `500 9px ${MONO}`, letterSpacing: '.14em', color: '#fbbf24' }}>{hit.sneak ? 'SNEAK ATTACK' : 'SUPER EFFECTIVE'}</div>}
            </div>
          )}
          {strikes > 1 && hit.parts && hit.parts.map((v, j) => {
            const d = t - t0(j) - 0.3;
            return d >= 0 && d < 1.2 && (
              <div key={j} className="absolute pointer-events-none" style={{ top: 40 + j * 14 + gMY, right: 56 + j * 16 + gMX, transform: `translateY(${-d * 36}px)`, opacity: 1 - d / 1.2, font: `500 ${20 - j * 2}px ${MONO}`, color: K.dmg, textShadow: K.dmgShadow, fontVariantNumeric: 'tabular-nums' }}>−{v.toLocaleString()}</div>
            );
          })}
          {/* The attack, per strike: a blade's slash, an arrow, or a cast orb — or, after a
              timed set, a special (sword beam, charged arrow, big orb). Then the impact. */}
          {strikes > 0 && Array.from({ length: strikes }, (_, j) => {
            const x = t - t0(j);
            const col = hit.pr ? '#fbbf24' : hit.crit ? '#ffd27a' : fxCol;
            const glowCol = (c, r) => `0 0 ${r}px ${c}, 0 0 ${r / 2}px ${c}`;
            const from = byPet ? [16, 72] : [24, 64], to = [80, 24];
            const at = (k) => ({ left: `${from[0] + (to[0] - from[0]) * k}%`, top: `${from[1] + (to[1] - from[1]) * k - Math.sin(k * Math.PI) * 8}%` });
            const impact = (x0, size) => {
              if (x < x0 || x >= x0 + 0.37) return null;
              const k = (x - x0) / 0.37;
              return <div key={`i${j}`} className="absolute pointer-events-none rounded-full" style={{ left: `${to[0]}%`, top: `${to[1]}%`, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, border: `3px solid ${col}`, transform: `scale(${1 + k * 2.2})`, opacity: 1 - k, boxShadow: `0 0 14px ${col}` }} />;
            };
            // A crescent: the slash on the monster, or (moving) a sword beam.
            const crescent = (key, pos, size, rot, op = 1) => (
              <div key={key} className="absolute pointer-events-none rounded-full" style={{ ...pos, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, border: `${Math.max(3, size / 12)}px solid transparent`, borderTopColor: col, borderRightColor: col, transform: `rotate(${rot}deg)`, opacity: op, filter: K.glow ? `drop-shadow(0 0 6px ${col})` : 'none' }} />
            );
            if (move === 'melee' || move === 'pet') {
              const sx = x - (move === 'melee' ? 0.26 : 0.2);
              if (sx < 0 || sx >= 0.42) return null;
              const k = sx / 0.42, size = move === 'pet' ? 52 : 96 + (hit.crit ? 16 : 0);
              return crescent(`s${j}`, { left: `${to[0] - 6}%`, top: `${to[1] + 10}%` }, size, -120 + Math.min(1, k * 1.6) * 200, k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
            }
            if (move === 'archer' || move === 'special-archer') {
              const big = move === 'special-archer', fly = big ? 0.3 : 0.18, x0 = 0.28;
              if (x >= x0 && x < x0 + fly) {
                const k = (x - x0) / fly;
                return [0, ...(big ? [1, 2, 3] : [])].map((tr) => {
                  const kk = Math.max(0, k - tr * 0.07);
                  return (
                    <div key={`a${j}-${tr}`} className="absolute pointer-events-none" style={{ ...at(kk), width: big ? 30 : 22, height: big ? 4 : 2, marginLeft: -11, background: tr ? `${col}66` : big ? '#fff' : '#e8e2d0', transform: 'rotate(-34deg)', boxShadow: big ? glowCol(col, 10) : 'none', opacity: 1 - tr * 0.25 }} />
                  );
                });
              }
              return impact(x0 + fly, big ? 30 : 16);
            }
            if (move === 'special-melee') {
              if (x >= 0.1 && x < 0.42) { const k = (x - 0.1) / 0.32; return [0, 1, 2].map((tr) => crescent(`b${j}-${tr}`, at(Math.max(0, k - tr * 0.1)), 54 - tr * 10, 30, 1 - tr * 0.3)); }
              return impact(0.42, 40);
            }
            // caster (and a caster's special: bigger, from the charge)
            const xo = x - 0.05;
            const size = (strikes > 1 ? 10 : 12 + 18 * (hit.power ?? 1)) + (hit.crit ? 6 : 0) + (move === 'special-caster' ? 10 : 0);
            if (xo >= 0 && xo < 0.28) {
              const k = xo / 0.28;
              return [0, 1, 2].map((tr) => {
                const kk = Math.max(0, k - tr * 0.08);
                return <div key={`o${j}-${tr}`} className="absolute pointer-events-none rounded-full" style={{ ...at(kk), width: size * (1 - tr * 0.3), height: size * (1 - tr * 0.3), marginLeft: -size / 2, marginTop: -size / 2, background: tr ? `${col}88` : '#fff', boxShadow: glowCol(col, size), opacity: 1 - tr * 0.3 }} />;
              });
            }
            return impact(0.33, size * 2);
          })}
          {hit?.pr && phase === 'attack' && t >= 0.35 && t < 1.5 && (
            <div className="absolute left-0 right-0 text-center pointer-events-none" style={{ top: 118, zIndex: 15 }}>
              <span style={{ display: 'inline-block', ...K.chip, padding: '4px 12px', color: '#fbbf24', font: `700 16px ${MONO}`, letterSpacing: '.2em', transform: `scale(${Math.min(1, (t - 0.35) * 5)})`, boxShadow: '0 0 18px rgba(251,191,36,.5)' }}>NEW RECORD</span>
            </div>
          )}
          {/* Victory loot: a gem bounces down where the monster fell */}
          {loot && gemT >= 0.8 && gemT < (pet ? 2.0 : 2.0) && (() => {
            const fall = clamp01((gemT - 0.8) / 0.4), toHero = !pet && gemT >= 1.4 ? clamp01((gemT - 1.4) / 0.6) : 0;
            return <div className="absolute pointer-events-none" style={{ left: `${75 - fall * 29 - toHero * 22}%`, top: `${26 + fall * 36 - Math.abs(Math.sin(fall * Math.PI * 2)) * (1 - fall) * 10}%`, width: 10, height: 10, transform: 'rotate(45deg)', background: '#7ee8ff', boxShadow: '0 0 10px #7ee8ff' }} />;
          })()}
          {loot && gemT >= 2.0 && gemT < 2.8 && (
            <div className="absolute pointer-events-none" style={{ left: pet ? '42%' : '20%', top: `${56 - (gemT - 2.0) * 20}%`, font: `700 11px ${MONO}`, color: '#7ee8ff', opacity: 1 - (gemT - 2.0) / 0.8 }}>+LOOT</div>
          )}

          {charge && phase === 'battle' && (style === 'caster' || charge.timed) && (
            <>
              {/* The rune circle under the hero grows as the set goes on (its own switch) */}
              {fx.ring && <div className="absolute pointer-events-none rounded-full" style={{ left: 70 - (36 + 18 * chargeK), bottom: 66, width: 72 + 36 * chargeK, height: 14 + 6 * chargeK, border: `2px solid ${fxCol}`, opacity: 0.25 + 0.75 * chargeK * (chargeK >= 1 ? 0.75 + 0.25 * Math.sin(frame / 2) : 1), boxShadow: `0 0 ${6 + 14 * chargeK}px ${fxCol}, inset 0 0 ${4 + 8 * chargeK}px ${fxCol}` }} />}
              {Array.from({ length: Math.round(2 + 8 * chargeK) }, (_, i) => {
                const q = ((frame + i * 7) % 20) / 20;
                return <div key={i} className="absolute pointer-events-none" style={{ left: 68 + Math.sin(i * 2.3) * 28, bottom: 76 + q * 64, width: 3, height: 3, background: chargeK >= 1 ? '#fff' : fxCol, boxShadow: `0 0 5px ${fxCol}`, opacity: (1 - q) * (0.3 + 0.7 * chargeK) }} />;
              })}
            </>
          )}
          {pet && <div className="absolute" style={{ left: 4 + gHX, bottom: 74 - gHY, width: 16 * 2.4, height: petH * 2.4, backgroundImage: petSrc, backgroundSize: '100% 100%', imageRendering: 'pixelated', filter: glow, transform: `translateX(${heroX + petOut + petDash}px)${petBack || (loot && gemT >= 2.4) ? ' scaleX(-1)' : ''} scaleY(${breath})`, transformOrigin: 'bottom' }} />}
          {camp && restP >= 0.8 && restP < 0.9 && pet && <div className="absolute pointer-events-none" style={{ left: 22, bottom: 74 + petH * 2.4, font: `700 12px ${MONO}`, color: '#ffd27a', opacity: frame % 4 < 2 ? 1 : 0.4 }}>✦</div>}
          {minion && (() => {
            const odd = minion.i % 2, key = odd ? 'swampy' : 'chort', h = (odd ? 16 : 24) * 2.6, w = 16 * 2.6, da = minion.a - GT;
            const leaping = minion.gm === 'leap', spinning = minion.gm === 'spin';
            const slashing = style === 'melee' && minion.a >= GT - 0.28 && minion.a < GT + 0.2;
            const sk = (minion.a - (GT - 0.28)) / 0.48; // slash sweep 0→1
            const crescentRot = (leaping ? 60 : -120) + Math.min(1, sk * 1.6) * 200;
            const crescentOp = sk < 0.6 ? 1 : Math.max(0, 1 - (sk - 0.6) / 0.4);
            return (
              <>
                {(!minion.dead || da < 0.12) && (
                  <div className="absolute pointer-events-none" style={{ left: `${minion.x}%`, bottom: 74, width: w, height: h, marginLeft: -w / 2, backgroundImage: frameOf(key, Math.floor(frame / 1.5) % 4, minion.dead), backgroundSize: '100% 100%', imageRendering: 'pixelated', filter: glow, transform: 'scaleX(-1)' }} />
                )}
                {slashing && (
                  <div className="absolute pointer-events-none rounded-full" style={{ left: `${minion.mx}%`, bottom: 74 + (leaping ? 56 : 24), width: 74, height: 74, marginLeft: -37, border: '6px solid transparent', borderTopColor: fxCol, borderRightColor: fxCol, transform: `rotate(${crescentRot}deg)`, opacity: crescentOp, filter: `drop-shadow(0 0 6px ${fxCol})` }} />
                )}
                {slashing && spinning && (
                  // a second arc 180° round → a whirling full ring of steel
                  <div className="absolute pointer-events-none rounded-full" style={{ left: `${minion.mx}%`, bottom: 74 + 24, width: 74, height: 74, marginLeft: -37, border: '6px solid transparent', borderTopColor: fxCol, borderRightColor: fxCol, transform: `rotate(${crescentRot + 180}deg)`, opacity: crescentOp, filter: `drop-shadow(0 0 6px ${fxCol})` }} />
                )}
                {style !== 'melee' && minion.a >= GT - 0.2 && minion.a < GT && (
                  <div className="absolute pointer-events-none rounded-full" style={{ left: `${24 + (minion.mx - 24) * ((minion.a - (GT - 0.2)) / 0.2)}%`, bottom: 74 + h / 2, width: 8, height: 8, marginLeft: -4, background: '#fff', boxShadow: `0 0 8px ${fxCol}` }} />
                )}
                {minion.dead && (
                  <div className="absolute pointer-events-none rounded-full" style={{ left: `${minion.mx}%`, bottom: 74 + h / 2 + (leaping ? 10 : -14), width: 28, height: 28, marginLeft: -14, border: `3px solid ${fxCol}`, transform: `scale(${1 + da * 6})`, opacity: Math.max(0, 1 - da / 0.35) }} />
                )}
              </>
            );
          })()}
          <div className="absolute" style={{ left: 32 + gHX + (groundOn ? 2 : 0), bottom: 74 - gHY, width: groundOn ? 72 : 76, height: 14, marginBottom: -6, borderRadius: '50%', background: K.shadow, transform: `translateX(${heroX}px)` }} />
          <div className="absolute" style={{ left: 70 + gHX - hcx * hbs, bottom: 74 - gHY, transform: `translate(${heroX}px, ${heroY}px)${heroBack ? ' scaleX(-1)' : ''}${gSpin ? ` rotate(${gSpin}deg)` : ''}` }}>
            <div style={{ backgroundImage: heroFrame, backgroundSize: '100% 100%', width: hw * hbs, height: hh * hbs, imageRendering: 'pixelated', transformOrigin: 'bottom',
              transform: (camp && !ready) || gauntlet === 'rest' ? 'scaleY(0.86)' : `scaleY(${breath})`,
              filter: chargeK > 0 && phase === 'battle' && (style === 'caster' || charge?.timed) ? `${glow} drop-shadow(0 0 ${4 + 10 * chargeK}px ${fxCol})` : glow }} />
          </div>
          {ready && <div className="absolute pointer-events-none" style={{ left: 86 + gHX, bottom: 74 - gHY + hh * hbs - 6, font: `700 14px ${MONO}`, color: ST.txt, textShadow: `0 0 8px ${fxCol}`, opacity: frame % 4 < 2 ? 1 : 0.3 }}>✦</div>}
          {/* Dust motes: three barely-there 1px specks (6%) drifting slowly. */}
          {fx.ambient && MOTES.map(([x, y], i) => (
            <div key={i} className="absolute pointer-events-none" style={{ left: `${x + Math.sin(now / 9000 + i * 2) * 6}%`, top: `${y + Math.cos(now / 11000 + i) * 4}%`, width: 1, height: 1, background: '#fff', opacity: 0.06 }} />
          ))}
          {combo >= 2 && (phase === 'battle' || phase === 'attack' || phase === 'rest') && (
            <div className="absolute pointer-events-none" style={{ right: 14, bottom: 160, ...K.chip, padding: '3px 8px', color: '#fbbf24', font: `700 10px ${MONO}`, letterSpacing: '.14em' }}>COMBO ×{combo}</div>
          )}

          <div className="absolute" style={{ right: 14, bottom: 82, width: 150, padding: '10px 12px', ...box, ...grow('100% 100%') }}>
            <div className="flex justify-between items-baseline">
              <span style={nameStyle}>{heroName}</span>
              <span style={lvStyle}>Lv{lvl}</span>
            </div>
            <div className="flex items-center gap-1.5" style={{ marginTop: 7 }}>
              <span style={{ fontSize: 9, fontWeight: 500, color: K.xpLab, letterSpacing: '.08em' }}>XP</span>
              {bar(xp / 1000, K.xp, 4)}
            </div>
            <div className="text-right" style={subStyle}>{xpShown} / 1000</div>
          </div>
        </>
      )}

      <div className="absolute inset-0 pointer-events-none" style={{ background: K.flash, opacity: flashOp }} />
      {wipe > 0 && Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="absolute pointer-events-none" style={{ top: `${i * 12.5}%`, height: '12.6%', width: `${wipe * 100}%`, ...(i % 2 ? { right: 0 } : { left: 0 }), background: K.wipe }} />
      ))}
      {cutIn && (
        <div key={taunt.at} className="absolute inset-0 z-20 pointer-events-none overflow-hidden" style={{ background: '#050505', translate: frame % 17 === 0 ? '4px 0' : frame % 29 === 0 ? '-3px 1px' : 'none', animation: `qt-in .28s cubic-bezier(.2,1,.3,1) both, qt-out .3s ease-in ${tauntDur - 0.3}s forwards` }}>
          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 72% 38%, ${fxCol}55, transparent 70%)` }} />
          {/* Concentration lines on the monster, jittering every frame */}
          <div className="absolute inset-0" style={{ background: `repeating-conic-gradient(from ${(Math.floor(frame / 3) % 3) * 4}deg at 72% 38%, ${fxCol}40 0deg 1.5deg, transparent 1.5deg 6deg)`, WebkitMaskImage: 'radial-gradient(circle at 72% 38%, transparent 30%, #000 75%)', maskImage: 'radial-gradient(circle at 72% 38%, transparent 30%, #000 75%)' }} />
          {STREAKS.map(([y, th, len, sp], i) => (
            <div key={i} className="absolute left-0 right-0" style={{ top: `${y}%`, height: th, '--len': `${len * 2}px`, backgroundImage: `linear-gradient(90deg, transparent, ${i % 4 ? fxCol : '#fff'} 50%, transparent)`, backgroundSize: `${len}px 100%`, backgroundRepeat: 'no-repeat', backgroundPositionX: 0, opacity: i % 4 ? 0.55 : 0.8, animation: `qt-speed ${sp}s steps(${Math.round(sp * CRT_FPS)}) ${-i * 0.27}s infinite` }} />
          ))}
          {cBox && <div className="absolute" style={{ left: '60%', marginLeft: -(cBox.x + cBox.w / 2) * ck, top: 18 - (cBox.y + (isBoss ? cBox.h * 0.25 : 0)) * ck, /* a boss's flames/horns rise well above its face */ width: cBox.W * ck, height: cBox.H * ck, backgroundImage: cSrc, backgroundSize: '100% 100%', imageRendering: 'pixelated',
            filter: `drop-shadow(3px 0 0 rgba(255,40,40,.45)) drop-shadow(-3px 0 0 rgba(40,200,255,.4)) drop-shadow(0 0 10px ${isBoss ? bs.glow : fxCol}) contrast(1.15)`, animation: 'qt-mon .45s cubic-bezier(.2,1.3,.4,1) both' }} />}
          <div className="absolute left-0 right-0 bottom-0" style={{ height: 128, background: '#050505', clipPath: 'polygon(0 22%, 100% 0, 100% 100%, 0 100%)', animation: 'qt-plate .3s .1s cubic-bezier(.2,1,.3,1) both' }}>
            <div className="absolute left-0 right-0" style={{ top: 0, height: 128, background: `linear-gradient(${fxCol}, ${fxCol}) 0 0 / 100% 3px no-repeat`, clipPath: 'polygon(0 22%, 100% 0, 100% 2.4%, 0 24.4%)' }} />
            <div className="absolute" style={{ left: 16, right: 16, top: 36 }}>
              <div style={{ font: `700 10px ${MONO}`, letterSpacing: '.2em', color: isBoss ? bs.glow : fxCol }}>{(isBoss ? monster.name : monster.species).toUpperCase()} ▸</div>
              <div style={{ marginTop: 6, fontFamily: "'Manrope', var(--font-display), sans-serif", fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, color: '#fff', textShadow: `.75px 0 0 rgba(255,40,40,.5), -.75px 0 0 rgba(40,200,255,.45), 0 0 10px ${fxCol}66`, textWrap: 'pretty' }}>
                <Typed text={`“${taunt.text}”`} delay={300} cursor={false} />
              </div>
            </div>
          </div>
          {/* The tube: grain, a rolling bright band, the RGB phosphor mask, a heavy vignette. */}
          <div className="absolute inset-0" style={{ backgroundImage: GRAIN, backgroundPosition: `${(Math.floor(frame / 2) * 37) % 160}px ${(Math.floor(frame / 2) * 61) % 160}px`, opacity: 0.22, mixBlendMode: 'overlay' }} />
          <div className="absolute left-0 right-0" style={{ height: 70, top: `${((Math.floor(frame / 2) % 15) / 15) * 130 - 30}%`, background: 'linear-gradient(transparent, rgba(255,255,255,.07), transparent)' }} />
          <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(90deg, rgba(255,0,0,.07) 0 1px, rgba(0,255,0,.05) 1px 2px, rgba(0,80,255,.07) 2px 3px)', mixBlendMode: 'screen' }} />
          <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 44px 12px rgba(0,0,0,.8)', background: 'radial-gradient(ellipse at center, transparent 62%, rgba(0,0,0,.45) 100%)' }} />
        </div>
      )}

      <div className="absolute z-10 flex gap-1.5 items-start" style={{ left: 12, right: 12, bottom: 12, minHeight: 52, padding: '10px 14px', font: `500 ${+(13 * tk).toFixed(2)}px/1.45 ${MONO}`, ...K.msg }}>
        <span className="flex-shrink-0" style={{ color: K.pre[1], opacity: K.pre[2] }}>{K.pre[0]}</span>
        <span className="flex-1 min-w-0" style={{ textWrap: 'pretty' }}><Typed text={msg} cursorCol={K.pre[1]} /></span>
      </div>

      {scanlines && ST.scan > 0 && <div className="absolute inset-0 z-30 pointer-events-none" style={{ background: `repeating-linear-gradient(0deg, rgba(0,0,0,${ST.scan}) 0px, rgba(0,0,0,${ST.scan}) 1px, transparent 1px, transparent 3px)` }} />}
    </div>
    </div>
  );
}
