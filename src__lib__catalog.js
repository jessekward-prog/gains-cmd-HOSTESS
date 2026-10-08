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
  const byId = {}, byName = {};
  list.forEach((x) => { byId[x.id] = x; byName[norm(x.n)] ??= x; });
  return { list, byId, byName };
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

// Library candidates for a name, best first, to shortlist for the picker / AI.
// ponytail: plain token overlap over all 1,324 entries per name — fine for a
// few hundred names; index by token if this ever runs per keystroke on big lists.
export function candidates(name, cat, n = 8) {
  const q = new Set(norm(name).split(' ').filter(Boolean));
  if (!q.size) return [];
  return cat.list
    .map((x) => {
      const t = norm(x.n).split(' ');
      const hit = t.filter((w) => q.has(w)).length;
      return { x, score: hit / (q.size + t.length - hit) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.x.n.length - b.x.n.length)
    .slice(0, n)
    .map((r) => r.x);
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
    if (!(t >= since) || t > now) return;
    const exs = typeof w.exercises === 'string' ? JSON.parse(w.exercises) : w.exercises;
    Object.entries(sessionMuscles(exs, links, cat).sets).forEach(([r, v]) => { out[r] = (out[r] || 0) + v; });
  });
  return out;
}
