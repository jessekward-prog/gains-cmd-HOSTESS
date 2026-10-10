// Self-check for Quest Mode's rules — `node quest.check.mjs`.
// quest.js imports its siblings by their unfolded names, so copy them into that shape first.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dir = join(mkdtempSync(join(tmpdir(), 'quest-')), 'lib');
mkdirSync(dir);
for (const f of ['quest', 'focus', 'supersets', 'history']) copyFileSync(resolve(`src__lib__${f}.js`), join(dir, `${f}.js`));
const Q = await import(join(dir, 'quest.js'));
const { buildBlocks } = await import(join(dir, 'focus.js'));

const S = (w, r, done = true, extra = {}) => ({ weight: String(w), reps: String(r), completed: done, ...extra });
const ex = (name, sets, extra = {}) => ({ name, targetReps: '8-12', restSeconds: 90, sets, ...extra });

// Damage = kg × reps; bodyweight and assisted hit for a flat 60 kg (more
// counterweight on an assisted machine must never mean more damage).
assert.equal(Q.setDamage(ex('Bench', []), S(80, 10), 'normal'), 800);
assert.equal(Q.setDamage(ex('Push-ups', []), S(0, 20), 'normal'), 1200);
assert.equal(Q.setDamage(ex('Assisted pull-up', []), S(30, 8), 'normal'), Q.setDamage(ex('Assisted pull-up', []), S(10, 8), 'normal'));
assert.equal(Q.setDamage(ex('Treadmill', []), S(0, 0), 'cardio'), 1);

// Crit: beating the TOP of the rep range on a working set.
assert.equal(Q.topRep(ex('x', [])), 12);
assert.ok(Q.isCrit(ex('x', []), S(50, 13)));
assert.ok(!Q.isCrit(ex('x', []), S(50, 12)));
assert.ok(!Q.isCrit(ex('x', []), S(50, 15, true, { type: 'drop' })));

// A monster: HP = planned work, drained by sets done; 0 only once every set is done. Max uses the actual reps for done sets and the bottom of the range for the rest.
{
  const exs = [ex('Bench', [S(80, 10), S(80, 8, false), S(80, 8, false)])];
  const [b] = buildBlocks(exs);
  const m = Q.monsterOf(exs, b, 0);
  assert.equal(m.max, 800 + 640 + 640);
  assert.equal(m.hp, 1280);
  assert.equal(m.species, 'SLABFIEND');
  const big = [ex('Bench', [S(200, 30), S(80, 8, false)])];
  assert.equal(Q.monsterOf(big, buildBlocks(big)[0], 0).hp, 640); // a huge set can't overshoot: HP left = planned work left
  const all = [ex('Bench', [S(80, 10), S(80, 9)])];
  assert.equal(Q.monsterOf(all, buildBlocks(all)[0], 0).hp, 0);
}

// Session: XP only from beaten blocks (volume / 4 × pet bonus); timed sets flat.
{
  const exs = [
    ex('Bench', [S(80, 10), S(80, 10)]),                       // beaten: 1600 / 4 = 400
    ex('Row', [S(60, 13), S(60, 8, false)]),                   // not beaten yet, but 1 crit
    { name: 'Treadmill', type: 'cardio', sets: [{ type: 'cardio', completed: true, elapsedSec: 300 }] }, // 150
  ];
  const s = Q.questSession(exs, 1);
  assert.equal(s.xp, 400 + 150);
  assert.equal(s.crits, 1);
  assert.equal(s.vol, 1600 + 780);
  assert.equal(s.beaten, 2);
  assert.equal(Q.questSession(exs, 1.1).xp, Math.round(400 * 1.1) + Math.round(150 * 1.1));
}

// Levels: 1000 XP each; unlock text names what was crossed.
assert.deepEqual(Q.addXp(12, 900, 1250), { lvl: 14, xp: 150 });
assert.equal(Q.unlocks(12, 13), 'title "Plate Pusher" & Goblin pet & Iron border');
assert.equal(Q.lvTitle(14), 'Plate Pusher');
assert.equal(Q.tierOf(15)[1], 'SILVER');

// Committing a quest is idempotent per workout id, grants a pack, auto-equips a reached pet.
{
  const p0 = { ...Q.defProf(), lvl: 12, xp: 800, packs: 0 };
  const p1 = Q.commitQuest(p0, 'w1', { xp: 300, vol: 5000, crits: 2 });
  assert.deepEqual([p1.lvl, p1.xp, p1.quests, p1.vol, p1.crits, p1.packs, p1.pet], [13, 100, 1, 5000, 2, 1, 'goblin']);
  assert.equal(Q.commitQuest(p1, 'w1', { xp: 300, vol: 5000, crits: 2 }), p1);
  assert.equal(Q.xpMult(p1, p1.lvl), 1.05);
}

// Chest: a low roll lands Legendary (a chest-only legendary border, auto-equipped);
// a high roll is Common XP; an exhausted tier falls back a tier.
{
  const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
  const p = { ...Q.defProf(), lvl: 20, xp: 900 };
  const leg = Q.rollLoot(p, 0, seq(0.0, 0.0));
  assert.equal(leg.tier, 'LEGENDARY');
  assert.equal(leg.prof.border, 'holo');
  assert.ok(leg.prof.borders.includes('holo'));
  const com = Q.rollLoot(p, 0, seq(0.99, 0.99));
  assert.equal(com.tier, 'COMMON');
  assert.equal(com.label, '+400 XP');
  assert.deepEqual([com.prof.lvl, com.prof.xp], [21, 300]);
  const full = { ...p, borders: ['holo', 'void'] };
  assert.notEqual(Q.rollLoot(full, 0, seq(0.0, 0.0)).tier, 'LEGENDARY');
  assert.ok(Q.oddsOf(Q.luckOf(20)).l > Q.oddsOf(0).l); // crits raise the odds, capped
  assert.equal(Q.luckOf(20), 0.3);
}

console.log('quest checks passed');

// Clearing a quest banks + rolls once per key, and remembers the drop.
{
  const p0 = { ...Q.defProf(), lvl: 5, xp: 0, packs: 0 };
  const s = { xp: 500, vol: 2000, crits: 1 };
  const p1 = Q.clearQuest(p0, 'k1', s, () => 0.99);
  assert.equal(p1.lastQuest, 'k1'); assert.equal(p1.lastChest, 'k1');
  assert.equal(p1.packs, 1);
  assert.equal(p1.lastLoot.tier, 'COMMON');
  assert.equal(Q.clearQuest(p1, 'k1', s, () => 0.0), p1);
}
console.log('clear checks passed');

// Customising: one edit per copy owned; rarity gates what can change.
{
  const v = { owned: { 1: 2, 2: 1 }, edits: { 1: 1, 2: 1 } };
  assert.equal(Q.editsLeft(v, 1), 1);
  assert.equal(Q.editsLeft(v, 2), 0);
  assert.equal(Q.editsLeft(v, 3), 0);
  assert.deepEqual(Object.keys(Q.FORGE_RIGHTS.C).filter((k) => Q.FORGE_RIGHTS.C[k]), ['pal']);
  assert.ok(Q.FORGE_RIGHTS.L.img && !Q.FORGE_RIGHTS.E.img);
}
console.log('forge checks passed');

// Events: deterministic per quest, capped, only on plain blocks.
{
  const S2 = (w, r, done = false, extra = {}) => ({ weight: String(w), reps: String(r), completed: done, ...extra });
  const exs = Array.from({ length: 30 }, (_, i) => ex(`Lift ${i}`, [S2(50, 8), S2(50, 8), S2(50, 8)]));
  const a = Q.planEvents(exs, 'quest-A'), b = Q.planEvents(exs, 'quest-A');
  assert.deepEqual(a, b);                                   // same quest → same events
  assert.ok(Object.keys(a).length <= Q.MAX_EVENTS);
  const many = Array.from({ length: 40 }, (_, k) => Object.keys(Q.planEvents(exs, `q${k}`)).length);
  assert.ok(many.some((n) => n > 0) && many.some((n) => n === 0)); // rare, not never
  // Safety: an event never makes a set heavier, and lightening needs a real
  // external load (never assisted — less counterweight is harder — or bodyweight).
  for (const [k, e] of Object.entries(Q.EVENTS)) {
    assert.ok(!('load' in e) && !('toFailure' in e), `${k} must not add load or go to failure`);
    assert.ok(Q.eventLoad(ex('Bench', []), S2(80, 8), k) <= 80, `${k} heavier`);
    assert.equal(Q.eventLoad(ex('Assisted pull-up', [S2(30, 8)]), S2(30, 8), k), 30, `${k} changed an assisted load`);
  }
  assert.equal(Q.eventLoad(ex('Bench', [S2(80, 8)]), S2(80, 8), 'shield'), 40);
  assert.equal(Q.eventLoad(ex('Bench', [S2(55, 8)]), S2(55, 8), 'slow'), 44);
  for (let k = 0; k < 60; k++) { // assisted / bodyweight lifts only ever get load-neutral events
    for (const name of ['Assisted pull-up', 'Push-ups']) {
      const w = name === 'Push-ups' ? 0 : 30;
      const plan = Q.planEvents([ex(name, [S2(w, 8), S2(w, 8)])], `s${k}`);
      for (const ev of Object.values(plan)) assert.ok(!Q.EVENTS[ev.k].pct && !Q.EVENTS[ev.k].light, `${name} got ${ev.k}`);
    }
  }
  assert.deepEqual(Object.keys(Q.planEvents([ex('Assisted pull-up', [S2(30, 8)])], 'k', [], 'shield')), ['0']);
  assert.notEqual(Q.planEvents([ex('Assisted pull-up', [S2(30, 8)])], 'k', [], 'shield')[0].k, 'shield');
  // success + bonus read back from the set
  assert.ok(Q.eventDone('goblin', ex('x', []), S2(50, 12, true)));
  assert.ok(!Q.eventDone('goblin', ex('x', []), S2(50, 11, true)));
  assert.ok(Q.eventDone('mirror', ex('Assisted dip', []), S2(25, 8, true), { lw: 30, lr: 8 }));
  const done = S2(80, 10, true, { qe: { k: 'shield', st: 'accepted', ok: true } });
  assert.deepEqual(Q.eventBonus(ex('Bench', []), done, 'normal'), { xp: 200, crit: 1, pack: 0 });
  const sess = Q.questSession([ex('Bench', [done, S2(80, 8, true, { qe: { k: 'goblin', st: 'accepted', ok: true } })])], 1);
  assert.equal(sess.packs, 1); assert.equal(sess.crits, 1);
  assert.equal(sess.xp, Math.round((800 + 640) / 4 + 200));
}
assert.equal(Q.fillLine('{name} took {kg} kg {evil}', { name: 'Ogre', kg: 500 }), 'Ogre took 500 kg ');
assert.equal(Q.weekKey(new Date(2026, 9, 11)), '2026-10-05'); // a Sunday → its Monday
assert.equal(Q.pickBossRegion({ chest: 9, upperBack: 4, deltoids: 0 }), 'deltoids'); // fewest; ties go to list order
assert.equal(Q.pickBossRegion({ chest: 9, upperBack: 4, deltoids: 3, quadriceps: 2, hamstring: 2, gluteal: 5, biceps: 6, triceps: 7, abs: 8 }), 'quadriceps');
console.log('event checks passed');
