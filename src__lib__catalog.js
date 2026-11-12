// Exercise library: 1,324 exercises (names, equipment, muscles, steps) from
// hasaneyldrm/exercises-dataset, MIT — see THIRD_PARTY.md. The animations are
// © Gym visual and are NOT in this repo: they load from jsDelivr at a pinned
// commit, shown with the attribution the dataset asks for.
const CDN = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/';
export const MEDIA_CREDIT = 'Animation © Gym visual — gymvisual.com';
export const gifUrl = (x) => `${CDN}videos/${x.id}-${x.m}.gif`;

// "Push-ups" and "push-up" are the same exercise: lowercase, punctuation to
// spaces, plurals off each longer word (crunches, flies/flyes → fly; "press"
// stays; "triceps"→"tricep" happens on both sides so it still matches), and
// "pull down" → "pulldown" the way the library spells it.
const singular = (w) => (w.length <= 2 || w.endsWith('ss') ? w
  : /(ch|sh|x|ss)es$/.test(w) ? w.slice(0, -2)
  : /[^aeiou]ies$|yes$/.test(w) ? w.slice(0, -3) + 'y'
  : w.endsWith('s') ? w.slice(0, -1) : w);
export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map(singular).join(' ')
  .replace(/\b(pull|push) down\b/g, '$1down');

export const titleCase = (s) => s.replace(/(^|[\s(/-])([a-z])/g, (m, p, c) => p + c.toUpperCase());

export function indexCatalog(list) {
  const byId = {}, byName = {}, df = {};
  const toks = list.map((x) => {
    byId[x.id] = x; byName[norm(x.n)] ??= x;
    const t = norm(x.n).split(' ').filter(Boolean);
    new Set(t).forEach((w) => { df[w] = (df[w] || 0) + 1; });
    return t;
  });
  return { list, byId, byName, toks, idf: (w) => Math.log(list.length / ((df[w] || 0) + 1)) };
}

let loading;
export const loadCatalog = () => (loading ??= import('./catalog.json').then((m) => indexCatalog(m.default)));

// links: { [userName]: id | '' } from settings. '' = the user said "no match".
// Unlinked names still match when they are a library name (picked from the
// autocomplete, or typed the same way).
export function resolve(name, links, cat) {
  if (!cat || !name) return null;
  if (links && name in links) return cat.byId[links[name]] || null;
  return cat.byName[norm(name)] || null;
}

// Equipment the user might type, as the dataset's own `eq` value.
const EQ_OF = {
  barbell: 'barbell', dumbbell: 'dumbbell', db: 'dumbbell', cable: 'cable', kettlebell: 'kettlebell', kb: 'kettlebell',
  machine: 'leverage machine', lever: 'leverage machine', leverage: 'leverage machine', smith: 'smith machine',
  sled: 'sled machine', band: 'band', ez: 'ez barbell', assisted: 'assisted', rope: 'rope', roller: 'roller',
  bodyweight: 'body weight', trap: 'trap bar',
};
// When the name says no equipment, the plainest kit is the likelier answer, and
// it breaks the ties that used to hand "bench press" to *band* bench press.
const EQ_RANK = ['barbell', 'dumbbell', 'cable', 'leverage machine', 'body weight', 'smith machine',
  'ez barbell', 'kettlebell', 'sled machine', 'weighted', 'band', 'assisted'];
const eqRank = (e) => { const i = EQ_RANK.indexOf(e); return i < 0 ? 99 : i; };
const UNILATERAL = new Set(['one', 'single', 'alternate', 'alternating']);

// How much of the typed name a library entry accounts for, 0–1. Words are IDF
// weighted, so the movement ("fly") outweighs the body part ("chest") and
// "chest fly" can no longer tie with "chest dip". Words the entry adds and the
// name didn't ask for cost 0.6 of their weight — enough that a precise long
// name still beats a short wrong one, not so much that every variant is
// disqualified. Then: wrong equipment halves it, a unilateral variant nobody
// asked for takes 20% off, and the plainest kit wins what's left.
function scored(name, cat, n) {
  const q = [...new Set(norm(name).split(' ').filter(Boolean))];
  if (!q.length) return [];
  const qw = q.reduce((a, w) => a + cat.idf(w), 0);
  const want = q.map((w) => EQ_OF[w]).find(Boolean) || null;
  const oneSided = q.some((w) => UNILATERAL.has(w));
  return cat.list
    .map((x, i) => {
      const t = cat.toks[i], ts = new Set(t);
      const hit = q.filter((w) => ts.has(w)).reduce((a, w) => a + cat.idf(w), 0);
      if (!hit) return { x, score: 0 };
      const extra = t.filter((w) => !q.includes(w)).reduce((a, w) => a + cat.idf(w), 0);
      let score = hit / (qw + 0.6 * extra);
      score *= want ? (x.eq === want ? 1 : 0.5) : 1 - Math.min(eqRank(x.eq), 12) * 0.012;
      if (!oneSided && t.some((w) => UNILATERAL.has(w))) score *= 0.8;
      return { x, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || eqRank(a.x.eq) - eqRank(b.x.eq) || a.x.n.length - b.x.n.length)
    .slice(0, n);
}

// Library candidates for a name, best first, to shortlist for the picker / AI.
// ponytail: still a plain scan of all 1,324 entries per name — fine for a few
// hundred names; index by token if this ever runs per keystroke on big lists.
export function candidates(name, cat, n = 8) {
  return cat ? scored(name, cat, n).map((r) => r.x) : [];
}

// Below this, the best guess is more likely to be the wrong movement than the
// right one (measured over ~45 hand-typed names), and a blank frame beats a
// chest dip where the user asked for a chest fly.
export const MATCH_MIN = 0.42;

// The entry to *show* for a name with nobody watching: the user's own link, an
// exact library name, or a fuzzy guess that clears MATCH_MIN. Null means show
// nothing — the ExerciseInfo picker is still how a name gets pinned by hand.
export function guess(name, links, cat) {
  if (!cat || !name) return null;
  if (links && name in links) return cat.byId[links[name]] || null;
  const exact = cat.byName[norm(name)];
  if (exact) return exact;
  const [top] = scored(name, cat, 1);
  return top && top.score >= MATCH_MIN ? top.x : null;
}

// Dataset muscle words → body-map regions (MuscleMap's names). Words with no
// drawable region (cardiovascular system, hip flexors, ankles…) map to nothing.
const REGION = {
  triceps: 'triceps', shoulders: 'deltoids', delts: 'deltoids', deltoids: 'deltoids', 'rear deltoids': 'deltoids',
  biceps: 'biceps', brachialis: 'biceps', hamstrings: 'hamstring',
  forearms: 'forearm', wrists: 'forearm', 'wrist flexors': 'forearm', 'wrist extensors': 'forearm', 'grip muscles': 'forearm',
  glutes: 'gluteal', abductors: 'gluteal', calves: 'calves', soleus: 'calves',
  abs: 'abs', core: 'abs', abdominals: 'abs', 'lower abs': 'abs', obliques: 'obliques',
  quadriceps: 'quadriceps', quads: 'quadriceps', pectorals: 'chest', chest: 'chest', 'upper chest': 'chest',
  'upper back': 'upperBack', lats: 'upperBack', 'latissimus dorsi': 'upperBack', back: 'upperBack',
  'lower back': 'lowerBack', spine: 'lowerBack', rhomboids: 'rhomboids',
  traps: 'trapezius', trapezius: 'trapezius', 'levator scapulae': 'trapezius',
  adductors: 'adductors', 'inner thighs': 'adductors', groin: 'adductors',
  'rotator cuff': 'rotatorCuff', 'serratus anterior': 'serratus', shins: 'tibialis',
};
export const REGION_LABEL = {
  abs: 'Abs', adductors: 'Adductors', biceps: 'Biceps', calves: 'Calves', chest: 'Chest', deltoids: 'Shoulders',
  forearm: 'Forearms', gluteal: 'Glutes', hamstring: 'Hamstrings', lowerBack: 'Lower back', obliques: 'Obliques',
  quadriceps: 'Quads', rhomboids: 'Rhomboids', rotatorCuff: 'Rotator cuff', serratus: 'Serratus',
  tibialis: 'Shins', trapezius: 'Traps', triceps: 'Triceps', upperBack: 'Upper back / lats',
};

// { region: weight } for one library exercise: target 1, secondaries ½.
export function regionsOf(x) {
  const out = {};
  if (!x) return out;
  x.s.forEach((m) => { const r = REGION[m]; if (r) out[r] = Math.max(out[r] || 0, 0.5); });
  const t = REGION[x.t];
  if (t) out[t] = 1;
  return out;
}

// Sets per region for one session's exercises: each completed set counts 1 for
// the target and ½ for each secondary. `unmatched` lists names with sets that
// have no library match (and weren't marked "not in library").
export function sessionMuscles(exercises, links, cat) {
  const sets = {}, unmatched = [];
  (exercises || []).forEach((e) => {
    const done = (e?.sets || []).filter((s) => s.completed).length;
    if (!done) return;
    const x = resolve(e.name, links, cat);
    if (!x) { if (!(e.name in (links || {}))) unmatched.push(e.name); return; }
    Object.entries(regionsOf(x)).forEach(([r, k]) => { sets[r] = (sets[r] || 0) + done * k; });
  });
  return { sets, unmatched };
}

// The same over every session in the last `days`.
export function muscleSets(history, links, cat, days = 7, now = Date.now()) {
  const since = now - days * 86400000;
  const out = {};
  (history || []).forEach((w) => {
    const t = Date.parse(String(w.date).split('T')[0] + 'T12:00:00');
    // A date counts as its noon, so "today" must not be cut off before 12pm.
    if (!(t >= since) || t > now + 86400000) return;
    const exs = typeof w.exercises === 'string' ? JSON.parse(w.exercises) : w.exercises;
    Object.entries(sessionMuscles(exs, links, cat).sets).forEach(([r, v]) => { out[r] = (out[r] || 0) + v; });
  });
  return out;
}

/** The exercise you've done the most sets of with `region` as its main target (or null).
 *  `only` (a Set of names) limits it — e.g. to exercises still in your programs. */
export function topExerciseFor(history, links, cat, region, only = null) {
  const counts = {};
  (history || []).forEach((w) => {
    const exs = typeof w.exercises === 'string' ? JSON.parse(w.exercises) : w.exercises;
    (exs || []).forEach((e) => {
      const done = (e?.sets || []).filter((s) => s.completed).length;
      if (done && (!only || only.has(e.name)) && regionsOf(resolve(e.name, links, cat))[region] === 1) counts[e.name] = (counts[e.name] || 0) + done;
    });
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
