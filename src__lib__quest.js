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
    }
  }
  return Math.round((vol / 4 + timed * TIMED_XP) * mult);
}

/** The whole session so far: XP from beaten blocks, crits, real kg moved. */
export function questSession(exercises = [], mult = 1) {
  const blocks = buildBlocks(exercises);
  let xp = 0, crits = 0, vol = 0, beaten = 0;
  blocks.forEach((b) => {
    const m = monsterOf(exercises, b, 0);
    if (m.done) { xp += blockXp(exercises, b, mult); beaten++; }
    for (const i of b.indices) {
      const ex = exercises[i];
      if (isCardio(ex)) continue;
      for (const s of ex.sets || []) {
        if (!s.completed) continue;
        vol += num(s.weight) * num(s.reps);
        if (isCrit(ex, s)) crits++;
      }
    }
  });
  return { xp, crits, vol: Math.round(vol), beaten, total: blocks.length };
}

/**
 * Bank a finished quest into the profile — once per saved workout id, so a
 * re-render or reload of the summary can't award it twice. Grants the XP, a
 * card pack, and equips a newly reached level pet if none is equipped.
 */
export function commitQuest(prof, workoutId, session) {
  if (!workoutId || prof.lastQuest === workoutId) return prof;
  const { lvl, xp } = addXp(prof.lvl, prof.xp, session.xp);
  const p = { ...prof, lvl, xp, quests: prof.quests + 1, vol: prof.vol + session.vol, crits: prof.crits + session.crits, packs: (prof.packs || 0) + 1, lastQuest: workoutId };
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
