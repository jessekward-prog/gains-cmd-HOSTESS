// Self-check for Quest Mode's rules — `node quest.check.mjs`.
// quest.js imports its siblings by their unfolded names, so copy them into that shape first.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dir = join(mkdtempSync(join(tmpdir(), 'quest-')), 'lib');
mkdirSync(dir);
for (const f of ['quest', 'focus', 'supersets', 'history', 'skies', 'places', 'borders']) copyFileSync(resolve(`src__lib__${f}.js`), join(dir, `${f}.js`));
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
  const { SKIES } = await import(join(dir, 'skies.js'));
  const full = { ...p, borders: Q.BORDERS.map((b) => b[0]), skies: SKIES.filter((s) => s[2] === 3).map((s) => s[0]) };
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

// Weekly boss: offered only when due (48 h apart), two fights beat it, once per workout.
{
  const wk = '2026-10-05', t0 = Date.parse('2026-10-06T08:00:00Z');
  const p0 = { ...Q.defProf(), packs: 0, boss: { week: wk, region: 'chest', exercise: 'Dumbbell Bench Press', fights: [] } };
  assert.ok(Q.bossOfferable(p0.boss, wk, t0));
  assert.ok(!Q.bossOfferable(p0.boss, '2026-10-12', t0));                  // last week's boss
  assert.ok(!Q.bossOfferable({ ...p0.boss, exercise: null }, wk, t0));
  const p1 = Q.recordBossFight(p0, wk, 'w1', new Date(t0).toISOString());
  assert.equal(p1.boss.fights.length, 1); assert.equal(p1.packs, 0); assert.ok(!p1.bossBeat);
  assert.equal(Q.recordBossFight(p1, wk, 'w1'), p1);                          // same workout: no double count
  assert.ok(!Q.bossOfferable(p1.boss, wk, t0 + 47 * 3600e3));                 // not within 48 h
  assert.ok(Q.bossOfferable(p1.boss, wk, t0 + 48 * 3600e3));
  const p2 = Q.recordBossFight(p1, wk, 'w2', new Date(t0 + 50 * 3600e3).toISOString());
  assert.equal(p2.bossBeat, wk); assert.equal(p2.packs, 1);
  assert.equal(Q.bossNextAt(p2.boss), null); assert.ok(!Q.bossOfferable(p2.boss, wk, t0 + 200 * 3600e3));
  assert.equal(Q.recordBossFight(p2, wk, 'w3'), p2);                          // already beaten
}
console.log('boss checks passed');

// Combo XP: ×2 → 4, capped at ×5 → 10 per set; nothing below ×2.
{
  assert.equal(Q.comboXp(undefined), 0);
  assert.equal(Q.comboXp(1), 0);
  assert.equal(Q.comboXp(2), 4);
  assert.equal(Q.comboXp(9), 10);
  console.log('combo checks passed');
}

// The GO card's image flash: every frame it names is on disk, and the card's
// window is still derived from the run + hold rather than typed out again.
{
  const { readFileSync, existsSync } = await import('node:fs');
  const src = readFileSync('src__components__FocusWorkout.jsx', 'utf8');
  const seq = [...src.matchAll(/\['(\d\d-[a-z]+)', '[\d% ]+'\]/g)].map((m) => m[1]);
  assert.equal(seq.length, 10);
  for (const n of seq) assert.ok(existsSync(`quest/goflash/${n}.webp`), `missing frame ${n}`);
  // A literal here instead of GO_MS is how the frames and the card's lifetime
  // drift apart; GO_STEP and the window must both come off GO_RUN/GO_HOLD.
  assert.match(src, /goAt < GO_MS &&/);
  assert.match(src, /const GO_STEP = GO_RUN \/ GO_SEQ\.length;/);
  console.log('go-flash checks passed');
}

// Quest skins: the generated CSS in index.css still matches the token module.
// `node quest.check.mjs --write-skin-css` rewrites it. The variable blocks are
// what carries a skin into the app chrome, so a skin added without them looks
// like Phosphor everywhere but the stage — silently.
{
  const { readFileSync, writeFileSync } = await import('node:fs');
  copyFileSync(resolve('src__lib__questSkins.js'), join(dir, 'questSkins.js'));
  const K = await import(join(dir, 'questSkins.js'));
  const { skinCss } = await import(resolve('questSkinsCss.mjs'));
  const want = skinCss(K);
  const path = 'src__index.css';
  const css = readFileSync(path, 'utf8');
  const re = /\/\* QUEST-SKINS:BEGIN \*\/\n[\s\S]*?\/\* QUEST-SKINS:END \*\//;
  assert.ok(re.test(css), 'index.css is missing the QUEST-SKINS markers');
  const bodyOf = (t) => re.exec(t)[0].split('\n').slice(1, -1).join('\n');
  if (process.argv.includes('--write-skin-css')) {
    writeFileSync(path, css.replace(re, `/* QUEST-SKINS:BEGIN */\n${want}\n/* QUEST-SKINS:END */`));
    console.log('skin css written');
  } else {
    assert.equal(bodyOf(css), want, 'index.css skin CSS is stale — run `node quest.check.mjs --write-skin-css`');
  }
  // Every skin the picker can reach has to be namespaced, or it collides with
  // an app theme id in ThemeContext.
  for (const s of K.SKINS) assert.ok(K.isSkin(s.id), `skin id ${s.id} is not namespaced`);
  assert.equal(new Set(K.SKINS.map((s) => s.id)).size, K.SKINS.length, 'duplicate skin id');
  // BASE is what the stage draws with no skin picked, so it has to stay equal
  // to the values QuestStage used to carry inline.
  assert.equal(K.BASE.st.bg, '#0e0e0e');
  assert.equal(K.BASE.st.sky, '#050505');
  assert.equal(K.BASE.st.ground, '#070604');
  assert.equal(K.BASE.st.rad, 28);
  assert.equal(K.BASE.st.scan, 0.28);
  assert.equal(K.BASE.hp, 'classic');
  assert.deepEqual(K.BASE.pre, ['>', '#ff2222', 0.7]);
  const f = K.colourFns({ ...K.BASE, tint: '#ff9a3c' });
  assert.deepEqual(f.spr(0.5).map(Math.round), [181, 109, 42]); // the old tint ramp, unchanged
  console.log('quest skin checks passed');
}

// ── Rep tracker opt-in ────────────────────────────────────────────
// The gate that silently recorded nothing on 2026-11-05: a quest ran with the
// sensor paired, and because the prompt had never been answered in that page
// life nothing was armed. A linked sensor now records.
{
  const arm = (o) => Q.repArm({ stored: null, questKey: '100', alpha: false, answered: false, linked: false, ...o });
  // Never asked: a linked sensor records, an unlinked one has nothing to record.
  assert.deepEqual(arm({ linked: true }), { arm: true });
  assert.deepEqual(arm({}), {});
  // Armed earlier, then the page reloaded — the answer outlives the BLE link.
  assert.deepEqual(arm({ stored: '100' }), { arm: true });
  assert.deepEqual(arm({ stored: '100', linked: true }), { arm: true });
  // Declined at the prompt, or paused: auto-arm must never overturn either.
  assert.deepEqual(arm({ stored: '!100', linked: true }), {});
  assert.deepEqual(arm({ stored: '~100', linked: true }), {});
  // Recording on: remember it against the quest.
  assert.deepEqual(arm({ alpha: true }), { store: '100' });
  // Switching recording off in a quest that had it keeps the tracker in play;
  // saying no at the prompt (nothing stored for this quest) takes it out.
  assert.deepEqual(arm({ answered: true, stored: '100' }), { store: '~100' });
  assert.deepEqual(arm({ answered: true }), { store: '!100' });
  assert.deepEqual(arm({ answered: true, stored: '!99' }), { store: '!100' });
  // Another quest's answer says nothing about this one.
  assert.deepEqual(arm({ stored: '99', linked: true }), { arm: true });
  assert.deepEqual(arm({ stored: '~99', linked: true }), { arm: true });
  assert.deepEqual(arm({ stored: '!99' }), {});
  // In play — what keeps the control on screen — covers armed and paused, and
  // outlives a reload. A decline does not, so the quest keeps its BATTLE tag.
  assert.equal(Q.repAnswered('100', '100'), true);
  assert.equal(Q.repAnswered('~100', '100'), true);
  assert.equal(Q.repAnswered('!100', '100'), false);
  assert.equal(Q.repAnswered('~99', '100'), false);
  assert.equal(Q.repAnswered(null, '100'), false);
  assert.equal(Q.repAnswered('100', null), false);
  console.log('rep tracker opt-in checks passed');
}

{
  // A favourite's picture: its own card while owned, else an owned card by place; never an unowned one.
  const v = { owned: { 2: 1, 39: 2, 7: 0 } };
  assert.equal(Q.favCardId({ card: 2 }, 0, v), 2);
  assert.equal(Q.favCardId({ card: 7 }, 0, v), 39);
  assert.equal(Q.favCardId({}, 1, v), 2);
  assert.equal(Q.favCardId({}, 2, v), 39);
  assert.equal(Q.favCardId({ card: 5 }, 0, { owned: {} }), null);
  console.log('favourite picture checks passed');
}

{
  // Skies: Epic and Legendary chests only, never twice. Places: every one bakes, the daily walk covers them all.
  const { SKIES } = await import(join(dir, 'skies.js'));
  const { PLACES, bakePlace, placeOf, PW, PH } = await import(join(dir, 'places.js'));
  assert.equal(SKIES.length, 10); assert.deepEqual(PLACES.map((p) => p[0]), ['dunes', 'ember', 'graves', 'cavern']);
  assert.ok(SKIES.every((s) => s[2] === 2 || s[2] === 3));
  const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
  const p = { ...Q.defProf(), lvl: 20 };
  const won = Q.rollLoot(p, 0, seq(0, 0.999));
  assert.deepEqual([won.tier, won.sky, won.prof.sky, won.prof.skies], ['LEGENDARY', 'signal', 'signal', ['signal']]);
  assert.notEqual(Q.rollLoot(won.prof, 0, seq(0, 0.999)).sky, 'signal');
  for (const [k] of PLACES) { const ls = bakePlace(k); assert.equal(ls.length, 4); assert.ok(ls[0].A.every((a) => a === 1), `${k} sky has no holes`); assert.equal(ls[0].L.length, PW * PH); }
  assert.equal(new Set(Array.from({ length: 5 }, (_, d) => placeOf('daily', d))).size, 5);
  assert.equal(placeOf('frost', 0), 'meadow'); // a place that was removed falls back to travelling
  assert.equal(placeOf('ember', 3), 'ember'); assert.equal(placeOf(undefined, 0), 'meadow');
  console.log('scene checks passed');
}

{
  // Pixel borders: unique, all drawable, every rarity wins from its own chest, commons only sometimes.
  const { FX, grid } = await import(join(dir, 'borders.js'));
  const keys = Q.BORDERS.map((b) => b[0]), names = Q.BORDERS.map((b) => b[1]);
  assert.equal(Object.keys(FX).length, 52);
  assert.equal(new Set(keys).size, keys.length); assert.equal(new Set(names).size, names.length);
  for (const k of Object.keys(FX)) assert.ok(grid(k, 0).some(Boolean), k);
  const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
  const c = Q.rollLoot(Q.defProf(), 0, seq(0.99, 0.1, 0));
  assert.equal(c.tier, 'COMMON'); assert.equal(FX[c.prof.border].rarity, 0); assert.ok(c.prof.borders.includes(c.prof.border));
  const own = { ...Q.defProf(), borders: keys };
  assert.match(Q.rollLoot(own, 0, seq(0.99, 0.1, 0)).label, /XP$/); // none left to win
  console.log('border checks passed');
}
