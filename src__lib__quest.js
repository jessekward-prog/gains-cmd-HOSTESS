// Quest Mode: the Focus workout reskinned as an on-rails pixel monster battler
// (Claude Design handoff "Quest Mode"). Each block is a monster, each logged set
// an attack, rest is the monster catching its breath, the walk between
// encounters is the rest timer. Pure rules and data only — no React — so
// quest.check.mjs can run them. Everything about a session is DERIVED from the
// workout's own sets (HP, damage, XP, crits), so nothing extra is stored while
// training and a reload can't double-count. The profile only changes at the
// finish, keyed to the saved workout id.
import { num, isAssisted, buildBlocks, isCardio } from './focus.js';

export const ASSET = '/quest/';
const R = String.raw;
export const TROPHY = [R`   .-------.   `, R`  _|       |_  `, R` ( |  ***  | ) `, R`  '|       |'  `, R`    \     /    `, R`     '. .'     `, R`      | |      `, R`    .-' '-.    `, R`    '-----'    `].join('\n');

// ── Scene data (verbatim from the handoff) ──────────────────────────
// [sprite key, display scale]; frame sizes in px.
export const MONS = [['big_demon', 3], ['ogre', 3], ['big_zombie', 3], ['chort', 4], ['swampy', 5]];
export const MON_NAMES = { big_demon: 'SLABFIEND', ogre: 'SKYOGRE', big_zombie: 'GRAVELORD', chort: 'WINGIMP', swampy: 'ROPESLIME' };
export const SIZES = { big_demon: [32, 36], ogre: [32, 32], big_zombie: [32, 34], chort: [16, 24], swampy: [16, 16] };
export const LANDS = [
  { name: 'The Meadow', layers: [['bg', 0], ['mountain-far', 0.1], ['mountains', 0.25]] },
  { name: 'Pine Forest', layers: [['bg', 0], ['mountains', 0.2], ['trees', 0.5], ['foreground-trees', 0.9]] },
  { name: 'High Ridge', layers: [['bg', 0], ['mountain-far', 0.15], ['mountains', 0.35]], dim: 0.75 },
  { name: 'The Dark Wood', layers: [['trees', 0.4], ['foreground-trees', 0.9]], dim: 0.55 },
  { name: 'The Iron Dungeon', strip: true },
];
export const TINTS = { amber: ['Phosphor amber', '#ff9a3c'], green: ['Matrix green', '#33ff33'], cyan: ['Ice cyan', '#00bcd4'], red: ['Default red', '#ff2222'] };
// name: [key, w, h, {idle,run,atk frames}, body-centre x, walk scale, battle scale]
export const HEROES = {
  Warlord: ['warrior', 114, 59, { idle: 10, run: 8, atk: 7 }, 66, 1.4, 1.9],
  Samurai: ['samurai', 120, 69, { idle: 8, run: 8, atk: 6 }, 25, 1.3, 1.8],
  Ronin: ['ronin', 112, 66, { idle: 4, run: 8, atk: 4 }, 26, 1.4, 2],
  Brawler: ['brawler', 125, 80, { idle: 10, run: 8, atk: 7 }, 67, 1.2, 1.6],
  'Fallen king': ['king', 99, 68, { idle: 8, run: 8, atk: 4 }, 45, 1.3, 1.8],
  'Old king': ['oldking', 141, 82, { idle: 6, run: 8, atk: 6 }, 60, 1, 1.4],
  Sellsword: ['mwarrior2', 96, 55, { idle: 8, run: 8, atk: 4 }, 41, 1.6, 2.2],
  'Iron guard': ['mwarrior3', 106, 49, { idle: 10, run: 6, atk: 4 }, 50, 1.6, 2.2],
  Huntress: ['huntress', 87, 65, { idle: 8, run: 8, atk: 5 }, 38, 1.6, 2.2],
  Archer: ['huntress2', 48, 45, { idle: 10, run: 8, atk: 6 }, 18, 1.6, 2.2],
  Wizard: ['wizard', 167, 136, { idle: 6, run: 8, atk: 8 }, 66, 0.9, 1.3],
  Warlock: ['ewizard', 94, 69, { idle: 8, run: 8, atk: 8 }, 25, 1.4, 1.9],
  Sorcerer: ['ewizard2', 162, 141, { idle: 8, run: 8, atk: 8 }, 62, 0.8, 1.1],
  Hexblade: ['ewizard3', 88, 66, { idle: 10, run: 8, atk: 13 }, 25, 1.5, 2.1],
  Knight: ['knight', 16, 28, { idle: 4, run: 4, atk: 0 }, 8, 2, 3],
};
export const heroOf = (name) => HEROES[name] || HEROES.Warlord;

// ── Progression (verbatim) ──────────────────────────────────────────
// [key, name, unlock level (0 = chest only), frame height]
export const PETS = [['goblin', 'Goblin', 13, 16], ['imp', 'Imp', 15, 16], ['skelet', 'Skelly', 18, 16], ['tiny_zombie', 'Grub', 21, 16], ['muddy', 'Mudling', 25, 16],
  ['ice_zombie', 'Frostbite', 0, 16], ['orc_shaman', 'Shaman', 0, 20], ['necro', 'Hexling', 0, 20]];
export const LV_TITLES = [[1, 'Gym Rookie'], [10, 'Iron Squire'], [13, 'Plate Pusher'], [16, 'Barbell Knight'], [20, 'Rack Warden'], [25, 'Iron Baron'], [30, 'Titan of the Bar'], [40, 'Gains Eternal']];
export const EPITHETS = ['the Unbroken', 'of the Iron Hall', 'Plate-Eater', 'the Relentless', 'Chalk-Handed', 'of a Thousand Reps', 'the Spotless', 'Rackbreaker'];
export const TIERS = [[0, 'BRONZE', '#c08457'], [15, 'SILVER', '#c9ced6'], [25, 'GOLD', '#fbbf24'], [35, 'MYTHIC', '#ff2222']];
export const RARITY = [['COMMON', '#999999'], ['RARE', '#60a5fa'], ['EPIC', '#c084fc'], ['LEGENDARY', '#fbbf24']];
export const REEL = ['+250 XP', 'Goblin', 'the Unbroken', 'Holo border', 'Shaman', '+400 XP', 'Rackbreaker', 'Void border', 'Frostbite', '+150 XP', 'Chalk-Handed'];
// [key, name, rarity 0-3, unlock level (0 = free, -1 = chest only)]
export const BORDERS = [['plain', 'Plain', 0, 0], ['iron', 'Iron', 0, 13], ['bone', 'Bone', 0, 16], ['silver', 'Silver', 1, 18], ['cobalt', 'Cobalt', 1, 22], ['chain', 'Chainlink', 1, -1],
  ['gold', 'Gold', 2, 25], ['phantom', 'Phantom', 2, 30], ['venom', 'Venom', 2, -1], ['inferno', 'Inferno', 3, 35], ['holo', 'Holo', 3, -1], ['void', 'Void', 3, -1]];
/** [background, thickness px, glow] for a border at animation frame f (100ms each). */
export const borderCss = (k, f = 0) => ({
  plain: ['#3a3a3a', 2, 'transparent'], iron: ['#6b7079', 2, 'transparent'], bone: ['#d9d2bf', 2, 'transparent'],
  silver: ['linear-gradient(180deg, #ffffff 0 12%, #c9ced6 12% 70%, #7d838c 70%)', 4, 'transparent'],
  cobalt: ['linear-gradient(180deg, #8fb0ff 0 12%, #1838ff 12% 70%, #0a1a7a 70%)', 4, 'rgba(24,56,255,.2)'],
  chain: ['repeating-linear-gradient(45deg, #c9ced6 0 4px, #3b4047 4px 8px)', 4, 'transparent'],
  gold: ['linear-gradient(180deg, #fff3b0 0 12%, #fbbf24 12% 70%, #b7791f 70%)', 5, 'rgba(251,191,36,.3)'],
  phantom: [`linear-gradient(${f * 4}deg, #c084fc, #2a0a52 50%, #c084fc)`, 5, 'rgba(192,132,252,.35)'],
  venom: [`linear-gradient(${f * 4}deg, #6dff3a, #0b3d12 50%, #6dff3a)`, 5, 'rgba(109,255,58,.3)'],
  inferno: [`conic-gradient(from ${f * 12}deg, #8a0f0f, #ff2222, #ff7a1a, #fbbf24, #ff7a1a, #ff2222, #8a0f0f)`, 6, 'rgba(255,90,30,.45)'],
  holo: [`conic-gradient(from ${f * 9}deg, #ff5ea8, #fbbf24, #6dff3a, #3aa0ff, #c084fc, #ff5ea8)`, 6, 'rgba(192,132,252,.4)'],
  void: [`conic-gradient(from ${-f * 6}deg, #050505, #7c3aed, #050505, #00e5ff, #050505)`, 6, 'rgba(124,58,237,.45)'],
}[k] || ['#3a3a3a', 2, 'transparent']);

// A fresh hero. The prototype starts at Lv 12 for its demo; real heroes start at 1.
export const defProf = () => ({
  hero: 'Warlord', lvl: 1, xp: 0, quests: 0, vol: 0, crits: 0, pet: null, chestPets: [], epithets: [], epithet: null,
  border: 'plain', borders: [], packs: 1, lastQuest: null, lastChest: null,
});
export const withDefaults = (p) => ({ ...defProf(), ...(p || {}) });
export const lvTitle = (l) => LV_TITLES.filter((t) => l >= t[0]).pop()[1];
export const tierOf = (l) => TIERS.filter((t) => l >= t[0]).pop();
export const ownsPet = (prof, lvl, p) => (p[2] ? lvl >= p[2] : prof.chestPets.includes(p[0]));
export const ownsBorder = (prof, lvl, b) => b[3] === 0 || (b[3] > 0 && lvl >= b[3]) || (prof.borders || []).includes(b[0]);
export const equippedBorder = (prof, lvl) => BORDERS.find((b) => b[0] === prof.border && ownsBorder(prof, lvl, b)) || BORDERS[0];
export function xpMult(prof, lvl) {
  const p = PETS.find((x) => x[0] === prof.pet);
  return 1 + (p && ownsPet(prof, lvl, p) ? (p[2] ? 0.05 : 0.1) : 0);
}
/** Level + leftover XP after adding `gain` (1000 XP per level). */
export function addXp(lvl, xp, gain) {
  let l = lvl, x = xp + gain;
  while (x >= 1000) { x -= 1000; l++; }
  return { lvl: l, xp: x };
}
/** What crossing from level a to b unlocks, as readable text ('' for nothing). */
export function unlocks(a, b) {
  return [
    ...LV_TITLES.filter((t) => t[0] > a && t[0] <= b).map((t) => `title "${t[1]}"`),
    ...PETS.filter((p) => p[2] > a && p[2] <= b).map((p) => `${p[1]} pet`),
    ...BORDERS.filter((x) => x[3] > a && x[3] <= b).map((x) => `${x[1]} border`),
  ].join(' & ');
}

// ── Combat, derived from the real sets ──────────────────────────────
// Bodyweight (0 kg) and assisted lifts hit for a flat 60 kg: on an assisted
// machine more counterweight is EASIER, so it must never mean more damage.
export const FLAT_LOAD = 60;
export const loadOf = (name, weight) => (isAssisted(name) || num(weight) <= 0 ? FLAT_LOAD : num(weight));
export const topRep = (ex) => Math.max(...(String(ex.targetReps || ex.repRange || '').match(/\d+/g) || ['8']).map(Number));
const lowRep = (ex) => parseInt(String(ex.targetReps || ex.repRange || '').match(/\d+/)?.[0]) || 8;
const timedBlock = (kind) => kind === 'cardio' || kind === 'interval' || kind === 'bfr';
export const TIMED_XP = 150; // per completed timed set (cardio, interval, BFR): there's no kg × reps

/** Damage of one completed set; timed sets are one hit each. */
export function setDamage(ex, s, kind) {
  if (timedBlock(kind)) return 1;
  return Math.round(loadOf(ex.name, s.weight) * (num(s.reps) || 0));
}
/** Beat the top of the rep range on a working set → crit ("It's super effective!"). */
export const isCrit = (ex, s) => s.type !== 'drop' && s.reps !== 'failure' && num(s.reps) > topRep(ex);

/** A block as a monster: max HP = the planned work, HP left after the sets done so far. */
export function monsterOf(exercises, block, bi) {
  const [sprite, scale] = MONS[bi % MONS.length];
  const timed = timedBlock(block.kind);
  let max = 0, dealt = 0, done = true;
  for (const i of block.indices) {
    const ex = exercises[i];
    for (const s of ex.sets || []) {
      max += timed ? 1 : Math.round(loadOf(ex.name, s.weight) * (s.completed ? num(s.reps) || lowRep(ex) : lowRep(ex)));
      if (s.completed) dealt += setDamage(ex, s, block.kind); else done = false;
    }
  }
  const lead = exercises[block.indices[0]];
  return {
    sprite, scale, timed, max, done,
    hp: done ? 0 : Math.max(1, max - dealt),
    name: (lead?.name || '').toUpperCase(),
    species: MON_NAMES[sprite],
    lv: Math.round(num(lead?.sets?.[0]?.weight)) || lowRep(lead || {}),
  };
}

/** XP a block is worth once beaten: volume / 4 × pet bonus (timed sets: flat). */
export function blockXp(exercises, block, mult = 1) {
  let vol = 0, timed = 0;
  for (const i of block.indices) {
    const ex = exercises[i];
    for (const s of ex.sets || []) {
      if (!s.completed) continue;
      if (timedBlock(block.kind)) timed++;
      else vol += loadOf(ex.name, s.weight) * num(s.reps);
      vol += eventBonus(ex, s, block.kind).xp * 4; // event bonus, in the same units
    }
  }
  return Math.round((vol / 4 + timed * TIMED_XP) * mult);
}

/** The whole session so far: XP from beaten blocks, crits, real kg moved. */
export function questSession(exercises = [], mult = 1) {
  const blocks = buildBlocks(exercises);
  let xp = 0, crits = 0, vol = 0, beaten = 0, packs = 0;
  blocks.forEach((b) => {
    const m = monsterOf(exercises, b, 0);
    if (m.done) { xp += blockXp(exercises, b, mult); beaten++; }
    for (const i of b.indices) {
      const ex = exercises[i];
      if (isCardio(ex)) continue;
      for (const s of ex.sets || []) {
        if (!s.completed) continue;
        vol += num(s.weight) * num(s.reps);
        const bonus = eventBonus(ex, s, b.kind);
        if (isCrit(ex, s) || bonus.crit) crits++;
        packs += bonus.pack;
      }
    }
  });
  return { xp, crits, vol: Math.round(vol), beaten, total: blocks.length, packs };
}

/**
 * Bank a finished quest into the profile — once per saved workout id, so a
 * re-render or reload of the summary can't award it twice. Grants the XP, a
 * card pack, and equips a newly reached level pet if none is equipped.
 */
export function commitQuest(prof, workoutId, session) {
  if (!workoutId || prof.lastQuest === workoutId) return prof;
  const { lvl, xp } = addXp(prof.lvl, prof.xp, session.xp);
  const p = { ...prof, lvl, xp, quests: prof.quests + 1, vol: prof.vol + session.vol, crits: prof.crits + session.crits, packs: (prof.packs || 0) + 1 + (session.packs || 0), lastQuest: workoutId };
  if (!p.pet) { const np = PETS.find((x) => x[2] && x[2] > prof.lvl && x[2] <= lvl); if (np) p.pet = np[0]; }
  return p;
}

// ── Loot chest ──────────────────────────────────────────────────────
export const luckOf = (crits) => Math.min(0.3, crits * 0.03);
export const oddsOf = (luck) => ({ l: 0.03 + luck * 0.15, e: 0.12 + luck * 0.35, r: 0.25 + luck * 0.5 });

/**
 * Roll the chest. Common: +150–400 XP. Rare: epithet or chest-only Rare border.
 * Epic: chest pet or Epic border. Legendary: Legendary border. An exhausted pool
 * falls back a tier; drops auto-equip. `rand` is injectable for the check.
 */
export function rollLoot(prof, crits, rand = Math.random) {
  const o = oddsOf(luckOf(crits));
  const r = rand();
  let tier = r < o.l ? 3 : r < o.l + o.e ? 2 : r < o.l + o.e + o.r ? 1 : 0;
  const p = { ...prof, chestPets: prof.chestPets.slice(), epithets: prof.epithets.slice(), borders: (prof.borders || []).slice() };
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const chestB = (rr) => BORDERS.filter((b) => b[2] === rr && b[3] === -1 && !p.borders.includes(b[0])).map((b) => ({ b }));
  const pools = [[], [...EPITHETS.filter((e) => !p.epithets.includes(e)).map((e) => ({ ep: e })), ...chestB(1)],
    [...PETS.filter((x) => !x[2] && !p.chestPets.includes(x[0])).map((x) => ({ pet: x })), ...chestB(2)], chestB(3)];
  while (tier > 0 && !pools[tier].length) tier--;
  let loot;
  if (tier === 0) {
    const g = 150 + Math.floor(rand() * 6) * 50;
    Object.assign(p, addXp(p.lvl, p.xp, g));
    loot = { label: `+${g} XP`, sub: 'A pouch of raw experience' };
  } else {
    const c = pick(pools[tier]);
    if (c.b) { p.borders.push(c.b[0]); p.border = c.b[0]; loot = { label: `${c.b[1]} border`, sub: 'New frame for your hero card' }; }
    else if (c.pet) { p.chestPets.push(c.pet[0]); p.pet = c.pet[0]; loot = { label: c.pet[1], sub: 'New pet · +10% XP while equipped', pet: c.pet[0], h: c.pet[3] }; }
    else { p.epithets.push(c.ep); p.epithet = c.ep; loot = { label: c.ep, sub: 'New epithet for your title' }; }
  }
  return { ...loot, tier: RARITY[tier][0], color: RARITY[tier][1], prof: p };
}

/**
 * Finish a quest in one step: bank its XP + pack, then roll the chest — both
 * keyed to `key`, so calling it again for the same quest changes nothing. The
 * drop is remembered (lastLoot) so the summary can show it later.
 */
export function clearQuest(prof, key, session, rand = Math.random) {
  if (!key || prof.lastChest === key) return prof;
  const banked = commitQuest(prof, key, session);
  const loot = rollLoot(banked, session.crits, rand);
  const { prof: after, ...shown } = loot;
  return { ...after, lastChest: key, lastLoot: shown };
}

// ── Card customising (the Forge) ────────────────────────────────────
// Each copy of a card you own is one customise, so duplicates are worth
// having. What a customise may change rises with rarity.
export const FORGE_RIGHTS = {
  C: { pal: true, style: false, name: false, img: false },
  R: { pal: true, style: true, name: false, img: false },
  E: { pal: true, style: true, name: true, img: false },
  L: { pal: true, style: true, name: true, img: true },
};
export const RIGHTS_LABEL = { pal: 'COMMON+', style: 'RARE+', name: 'EPIC+', img: 'LEGENDARY' };
export const editsLeft = (vault, id) => Math.max(0, (vault.owned?.[id] || 0) - (vault.edits?.[id] || 0));

// ── Random events ───────────────────────────────────────────────────
// Little twists to mix a session up — never harder, never riskier: an event
// only ever keeps the weight or LOWERS it (pct), never goes to failure, never
// adds load. Code decides when and what; the AI only words them. Rolled from a
// seed per quest + block (a reload never rerolls), at most one per block and
// MAX_EVENTS per quest, only on plain blocks, and always optional.
// `where`: which working set. `pct`: weight × pct for that set. `reps`/`plusReps`:
// the rep target it asks for. `timed`: seconds of steady reps instead of a rep
// target. `xp`: XP multiplier when done. `crit` / `pack`: rewards. `rest`: +s rest.
// `light`: like pct, needs a real external load to be lighter (see eligibility).
export const EVENTS = {
  shield: { title: 'SHIELD UP', color: '#60a5fa', where: 'last', w: 3, xp: 2, crit: true, pct: 0.5, timed: 45,
    act: 'Half the weight: steady, controlled reps for 45 seconds instead of the set. Then log how many you did.' },
  enraged: { title: 'ENRAGED', color: '#ef4444', where: 'any', w: 2, xp: 1.5, pct: 0.7, plusReps: 3,
    act: 'Drop to 70% and go for 3 extra reps — only if they come easy.' },
  slow: { title: 'SLOW CURSE', color: '#c084fc', where: 'any', w: 2, xp: 1.5, pct: 0.8, act: 'Drop to 80% and lower every rep over 3 seconds.' },
  paused: { title: 'PAUSED BLOW', color: '#f59e0b', where: 'any', w: 2, xp: 1.5, pct: 0.8, act: 'Drop to 80% and pause for 1 second at the bottom of each rep.' },
  mirror: { title: 'MIRROR MATCH', color: '#22d3ee', where: 'any', w: 2, xp: 2, needsLast: true, act: 'Match last session: {last}. No more than that.' },
  goblin: { title: 'TREASURE GOBLIN', color: '#fbbf24', where: 'any', w: 2, pack: 1, act: 'Reach {top} reps if it feels good and it drops a card pack. Stop early any time.' },
  weak: { title: 'WEAK POINT', color: '#22c55e', where: 'last', w: 2, xp: 1.5, crit: true, pct: 0.6, reps: 15, act: 'A pump set: 60% weight, 15 smooth reps.' },
  spring: { title: 'HEALING SPRING', color: '#34d399', where: 'any', w: 1, rest: 30, act: 'Take 30 s extra rest after this set, on the house.' },
  ambush: { title: 'AMBUSH', color: '#fb923c', where: 'last', w: 1, xp: 1.5, light: true, bonusSet: { pct: 0.6, reps: 10 },
    act: 'Accept for a light finisher after this set: 60% weight, 10 easy reps.' },
  blessing: { title: 'BLESSING', color: '#e879f9', where: 'any', w: 2, crit: true, act: 'Do the set exactly as planned. The gods grant you a free crit.' },
};
export const EVENT_CHANCE = 0.12; // per eligible block
export const MAX_EVENTS = 2;

/** Deterministic 0–1 from a string (FNV-1a), so the same quest always rolls the same. */
export function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/** Top weight per past session for an exact exercise name, newest first. */
export function topWeights(history = [], name) {
  const out = [];
  for (const w of history) {
    let exs = w.exercises;
    if (typeof exs === 'string') { try { exs = JSON.parse(exs); } catch { exs = []; } }
    const ex = (exs || []).find((e) => e?.name === name);
    const ws = (ex?.sets || []).filter((s) => s.completed && s.type !== 'drop').map((s) => num(s.weight));
    if (ws.length) out.push(Math.max(...ws));
  }
  return out;
}

const workingSets = (ex) => (ex.sets || []).map((s, i) => [s, i]).filter(([s]) => s.type !== 'drop');
/** "Lighter" only makes sense with a real external load: not bodyweight (0), and
 *  never on assisted machines, where less weight means less help (harder). */
export const canLighten = (ex) => !isAssisted(ex.name) && workingSets(ex).some(([s]) => num(s.weight) > 0);

/**
 * The quest's events: { [blockIndex]: { k, si } } — si = the set index it lands on.
 * `force` (dev/testing) puts that event on the first eligible block.
 */
export function planEvents(exercises, key, history = [], force = null) {
  const blocks = buildBlocks(exercises);
  const plan = {};
  let n = 0;
  blocks.forEach((b, bi) => {
    if (n >= MAX_EVENTS || b.kind !== 'normal' || b.indices.length !== 1) return;
    if (!force && seeded(`${key}|${bi}|roll`) >= EVENT_CHANCE) return;
    const ex = exercises[b.indices[0]];
    const ws = workingSets(ex);
    if (!ws.length) return;
    const hasLast = topWeights(history, ex.name).length > 0, light = canLighten(ex);
    const opts = Object.entries(EVENTS).filter(([, e]) => (!e.needsLast || hasLast) && (!(e.pct || e.light) || light));
    let k;
    if (force && EVENTS[force] && opts.some(([x]) => x === force)) k = force;
    else {
      const total = opts.reduce((a, [, e]) => a + e.w, 0);
      let r = seeded(`${key}|${bi}|pick`) * total;
      k = opts.find(([, e]) => (r -= e.w) < 0)?.[0] || opts[0][0];
    }
    const e = EVENTS[k];
    const si = e.where === 'last' ? ws[ws.length - 1][1] : ws[Math.floor(seeded(`${key}|${bi}|set`) * ws.length)][1];
    plan[bi] = { k, si };
    n++;
    force = null;
  });
  return plan;
}

const half = (x) => Math.round(x * 2) / 2; // nearest 0.5 kg
/** The weight an event asks for: the same, or lighter (pct), never heavier. */
export function eventLoad(ex, s, k) {
  const e = EVENTS[k];
  const w = num(s.weight);
  if (!e?.pct || !canLighten(ex)) return w;
  return Math.min(w, half(w * e.pct));
}

/** Did a completed, accepted event set do what was asked? `last` = { lw, lr } from history. */
export function eventDone(k, ex, s, last) {
  const reps = num(s.reps), w = num(s.weight);
  if (!s.completed) return false;
  if (k === 'goblin') return reps >= topRep(ex);
  if (k === 'mirror') {
    if (!last || last.lw == null) return false;
    const same = isAssisted(ex.name) ? w <= last.lw : w >= last.lw;
    return same && reps >= last.lr;
  }
  return reps > 0; // the rest are about doing it, and they're on your honour
}

/** Extra XP, crits and packs a set's accepted event earned (read back from s.qe). */
export function eventBonus(ex, s, kind) {
  const q = s.qe;
  if (!q || q.st !== 'accepted' || !q.ok) return { xp: 0, crit: 0, pack: 0 };
  const e = EVENTS[q.k] || {};
  const base = timedBlock(kind) ? TIMED_XP : (loadOf(ex.name, s.weight) * num(s.reps)) / 4;
  return { xp: Math.round(base * ((e.xp || 1) - 1)), crit: e.crit ? 1 : 0, pack: e.pack || 0 };
}

// Fallback wording (the AI writes fresh lines when it can).
export const EVENT_LINES = {
  shield: ['The beast hides behind a shield. Wear it down with a flurry!', 'A rune-shield flares. Chip at it, again and again.', 'Steel raised! Quick light blows will crack it.'],
  enraged: ['It charges in a rage! Meet it with quick, light strikes.', 'Enraged, it lunges. Stay nimble.', 'Fury makes it reckless. Out-pace it.'],
  slow: ['A slow curse settles on your bones.', 'Time thickens like tar.', 'The air turns to syrup.'],
  paused: ['It braces at the bottom. Hold your ground.', 'Strike, pause, strike again.', 'Patience is the blade.'],
  mirror: ['Your own reflection steps out to fight.', 'A mirror-twin copies your last battle.', 'Can you match your past self?'],
  goblin: ['A treasure goblin darts past, pack in hand!', 'Gold glints behind the monster.', 'Something shiny is running away.'],
  weak: ['A crack opens in its armour. Many light blows will widen it.', 'You spot a weak point!', 'Its guard drops. Pepper it with strikes.'],
  spring: ['A healing spring bubbles nearby.', 'Cool water. Catch your breath.', 'The spring restores you.'],
  ambush: ['A small foe leaps from the shadows!', 'A straggler attacks. Brush it aside.', 'One more wave, a weak one.'],
  blessing: ['The gods smile on you today.', 'A warm light fills the hall.', 'Fortune favours this blow.'],
};
export const VICTORY_LINES = ['{name} crumbles under {kg} kg!', '{kg} kg moved. {name} is no more.', '{name} falls. The halls echo with {kg} kg of iron.',
  'Your {sets} blows were too much for {name}.', '{name} drops its guard and its dignity.', 'Victory over {name}!'];
export const REST_LINES = ['Breathe. The next blow lands harder rested.', 'Shake it out. Your grip will thank you.', 'Sip water, steady your stance.',
  'The monster circles. Rest while it does.', 'Reset your setup before you strike again.'];
/** Fill a victory template — only {name} {kg} {sets} survive; anything else is dropped. */
export const fillLine = (tpl, v) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : ''));

// ── Weekly boss: your most-neglected muscle ─────────────────────────
export const BOSS_REGIONS = ['chest', 'upperBack', 'deltoids', 'quadriceps', 'hamstring', 'gluteal', 'biceps', 'triceps', 'abs'];
/** Monday-based week key, e.g. '2026-10-05'. */
export function weekKey(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** The region with the fewest sets over the last 14 days (ties: list order). */
export function pickBossRegion(sets14) {
  return BOSS_REGIONS.reduce((best, r) => ((sets14[r] || 0) < (sets14[best] || 0) ? r : best), BOSS_REGIONS[0]);
}
// Plain-word muscle names (for the AI prompt and the panel) and fallback boss names.
export const BOSS_WORDS = { chest: 'chest', upperBack: 'upper back and lats', deltoids: 'shoulders', quadriceps: 'quads', hamstring: 'hamstrings',
  gluteal: 'glutes', biceps: 'biceps', triceps: 'triceps', abs: 'abs' };
export const BOSS_NAMES = { chest: 'The Breastplate Golem', upperBack: 'The Lat Wraith', deltoids: 'The Shoulder Harpy', quadriceps: 'The Thigh Titan',
  hamstring: 'The Hamstring Hydra', gluteal: 'The Glute Colossus', biceps: 'The Curl Kraken', triceps: 'The Tricep Troll', abs: 'The Core Basilisk' };

// ── Weekly boss fights ──────────────────────────────────────────────
// The boss is beaten in BOSS_GROUPS fights of BOSS_GROUP_SETS sets, offered as
// an optional finale at the end of any workout — never two fights within 48 h.
export const BOSS_GROUPS = 2;
export const BOSS_GROUP_SETS = 4;
export const BOSS_GAP_MS = 48 * 3600 * 1000;
// When you've no history for the boss muscle: a simple, safe pick from the library.
export const BOSS_DEFAULT_EXERCISE = { chest: 'Dumbbell Bench Press', upperBack: 'Cable Seated Row', deltoids: 'Dumbbell Lateral Raise',
  quadriceps: 'Lever Leg Extension', hamstring: 'Lever Lying Leg Curl', gluteal: 'Barbell Glute Bridge', biceps: 'Dumbbell Biceps Curl',
  triceps: 'Cable Pushdown', abs: 'Cable Kneeling Crunch' };
const fightsOf = (boss) => boss?.fights || [];
/** When the next fight may be offered (ms epoch), or null if the boss is done. */
export function bossNextAt(boss) {
  const f = fightsOf(boss);
  if (f.length >= BOSS_GROUPS) return null;
  const last = f.length ? Math.max(...f.map((x) => Date.parse(x.at))) : 0;
  return last ? last + BOSS_GAP_MS : 0;
}
/** Can this week's boss be offered right now? */
export function bossOfferable(boss, wk, now = Date.now()) {
  if (!boss || boss.week !== wk || !boss.exercise) return false;
  const next = bossNextAt(boss);
  return next !== null && now >= next;
}
/** Record a won fight — once per workout `key`. The last fight beats the boss: +1 pack. */
export function recordBossFight(prof, wk, key, at = new Date().toISOString()) {
  const b = prof.boss;
  if (!b || b.week !== wk || fightsOf(b).some((x) => x.key === key) || fightsOf(b).length >= BOSS_GROUPS) return prof;
  const fights = [...fightsOf(b), { key, at }];
  const beaten = fights.length >= BOSS_GROUPS;
  return { ...prof, boss: { ...b, fights }, ...(beaten ? { bossBeat: wk, packs: (prof.packs || 0) + 1 } : {}) };
}
