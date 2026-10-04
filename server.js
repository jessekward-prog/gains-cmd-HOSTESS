require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const bcrypt = require('bcrypt');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
// Env vars are the baseline; /api/lm (see below) can override each live from
// app_settings without a restart -- same pattern as macro-cmd's Local AI panel.
const ENV_LM_URL = (process.env.LM_STUDIO_URL || 'http://localhost:1235').replace(/\/+$/, '');
const ENV_LM_KEY = process.env.LM_STUDIO_API_KEY || '';
const ENV_LM_MODEL = process.env.LM_STUDIO_MODEL || ''; // unset = whatever the endpoint has loaded
const SYNC_SECRET = process.env.SYNC_SECRET || '';
let LM_URL = ENV_LM_URL;
let LM_KEY = ENV_LM_KEY;
let LM_MODEL = ENV_LM_MODEL;

async function getSetting(key) {
  try {
    const { rows } = await db.pool.query('SELECT value FROM app_settings WHERE key=$1', [key]);
    return rows[0]?.value;
  } catch { return undefined; }
}
async function setSetting(key, value) {
  if (value === '' || value == null) {
    await db.pool.query('DELETE FROM app_settings WHERE key=$1', [key]).catch(() => {});
  } else {
    await db.pool.query('INSERT INTO app_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [key, value]).catch(() => {});
  }
}
async function loadLmSettings() {
  LM_URL = ((await getSetting('lm_url')) || ENV_LM_URL).replace(/\/+$/, '');
  LM_KEY = (await getSetting('lm_api_key')) || ENV_LM_KEY;
  LM_MODEL = (await getSetting('lm_model')) || ENV_LM_MODEL;
}
// The AI link: Hostess (sync secret) or the unlocked owner may read or change it.
function adminOrSync(req, res, next) {
  if (SYNC_SECRET && req.headers['x-sync-secret'] === SYNC_SECRET) return next();
  if (req.isAuthenticated()) return next();
  res.status(403).json({ success: false, error: 'Admin only' });
}

// ponytail: in-memory, per process — resets on restart and the map only grows
// with distinct IPs, which is fine at family scale. Swap for a shared store if
// this ever runs as more than one instance.
const attempts = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.path + '|' + req.ip;
    const now = Date.now();
    const recent = (attempts.get(key) || []).filter(t => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ success: false, error: 'Too many attempts — try again in a few minutes' });
    }
    recent.push(now);
    attempts.set(key, recent);
    next();
  };
}

// Without JWT_SECRET, generate one once and keep it in app_settings so it
// survives restarts (a hardcoded fallback would let anyone forge sessions).
async function sessionSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  let secret = await getSetting('session_secret');
  if (!secret) {
    secret = require('crypto').randomBytes(32).toString('hex');
    await setSetting('session_secret', secret);
    console.log('🔑 JWT_SECRET not set — generated a session secret and stored it in app_settings');
  }
  return secret;
}


// LM Studio (OpenAI-compatible) — replaces Anthropic. `messages` items may use
// text content OR OpenAI parts (array of {type:'text'|'image_url'}) — see cardio-stats.
async function llmOnce(openaiMessages, maxTokens, temperature, timeoutMs, responseFormat) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(LM_URL + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(LM_KEY ? { Authorization: 'Bearer ' + LM_KEY } : {})
      },
      body: JSON.stringify({ ...(LM_MODEL && { model: LM_MODEL }), max_tokens: maxTokens, temperature, messages: openaiMessages, ...(responseFormat && { response_format: responseFormat }) }),
      signal: ctrl.signal
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error('LM Studio ' + r.status + ': ' + err.slice(0, 300));
    }
    const data = await r.json();
    const choice = data.choices[0];
    return { content: choice.message.content || '', finishReason: choice.finish_reason };
  } finally {
    clearTimeout(t);
  }
}

// Reasoning models spend a few hundred hidden "reasoning_content" tokens before
// the visible reply, so a reply can be cut off at max_tokens — empty, or JSON
// stopped mid-array. Any 'length' finish gets one retry with much more room.
// `schema` asks LM Studio for grammar-constrained JSON (response_format
// json_schema), which is what stops the malformed-JSON failures.
async function llm({ system, messages, maxTokens = 500, temperature = 0.7, timeoutMs = 90000, schema }) {
  const openaiMessages = [];
  if (system) openaiMessages.push({ role: 'system', content: system });
  for (const m of messages || []) openaiMessages.push(m);
  const format = schema && { type: 'json_schema', json_schema: { name: 'reply', strict: true, schema } };

  let result = await llmOnce(openaiMessages, maxTokens, temperature, timeoutMs, format);
  if (result.finishReason === 'length') {
    result = await llmOnce(openaiMessages, Math.max(maxTokens * 3, maxTokens + 2000), temperature, timeoutMs * 2, format);
  }
  return result.content;
}

// JSON schemas for the structured endpoints.
const str = { type: 'string' }, num = { type: 'number' }, int = { type: 'integer' }, bool = { type: 'boolean' };
const nullable = (t) => ({ anyOf: [t, { type: 'null' }] });
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const REMIX_EXERCISE = obj({
  name: str, sets: int, repRange: str, restSeconds: int, hasDrops: bool, numDrops: int,
  isBFR: bool, bfrSeconds: int, isInterval: bool, intervalWork: int, intervalRest: int, intervalTotal: int,
  supersetWith: nullable(str),
});
const SCHEMAS = {
  remix: obj({ exercises: { type: 'array', items: REMIX_EXERCISE }, changeDescription: str, shortLabel: str }),
  program: obj({ name: str, workouts: { type: 'array', items: obj({ name: str, exercises: { type: 'array', items: obj({ name: str, sets: int, repRange: str, restSeconds: int }) } }) } }),
  analysis: obj({ summary: str, insights: { type: 'array', items: str }, recommendation: str, highlights: str, notesSummary: nullable(str) }),
  cardio: obj({
    activityType: nullable(str), duration: nullable(str), activeCalories: nullable(num), totalCalories: nullable(num),
    avgHeartRate: nullable(num), maxHeartRate: nullable(num), distance: nullable(str), avgPace: nullable(str), source: nullable(str),
  }),
};

// Models drift on capitalisation/spacing ("Dumbbell curls" -> "Dumbbell Curls"),
// and progression credits exact names only — put the user's spelling back.
function restoreNames(exercises, originals) {
  const key = (n) => String(n || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const byKey = new Map((originals || []).map((o) => [key(o.name), o.name]));
  return exercises.map((ex) => (byKey.has(key(ex.name)) ? { ...ex, name: byKey.get(key(ex.name)) } : ex));
}

// Training Settings → Coaching Tone, applied to the coach, exercise notes and
// workout analysis.
const TONES = {
  encouraging: 'Tone: warm and encouraging — celebrate wins and keep motivation high.',
  tough: 'Tone: tough love — blunt and direct, no sugar-coating, push them to do better.',
  analytical: 'Tone: analytical — precise and data-focused; numbers over pep talk.',
  chill: 'Tone: chill and laid-back — relaxed, friendly, low pressure.',
};
async function coachTone(userId) {
  try {
    const s = await db.getSettings(userId);
    const a = typeof s.aggression_settings === 'string' ? JSON.parse(s.aggression_settings) : s.aggression_settings;
    return TONES[a?.coachingTone] || TONES.encouraging;
  } catch {
    return TONES.encouraging;
  }
}

const badRequest = (res, error) => res.status(400).json({ success: false, error });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Serve React frontend build (must come before root static)
app.use(express.static(path.join(__dirname, 'dist')));
// Serve specific root static files (timer sound, sw.js, manifest, icons)
app.use('/timer-sound.mp3', express.static(path.join(__dirname, 'timer-sound.mp3')));
app.get('/sw.js', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'sw.js'));
});
app.use('/manifest.json', express.static(path.join(__dirname, 'manifest.json')));
app.use('/icons', express.static(path.join(__dirname, 'icons')));
app.set('trust proxy', 1); // behind a reverse proxy (Hostess/Tailscale serve)
// Built in start() once the secret is known; requests only arrive after listen().
let sessionMiddleware;
app.use((req, res, next) => sessionMiddleware(req, res, next));
app.use(passport.initialize());
app.use(passport.session());

// ── PIN gate ──────────────────────────────────────────────────────────
// Single-user: the PIN is the only lock, set on first launch or preseeded
// with APP_PIN. Unlocking signs the session in as the one owner account — the
// oldest user, so an install that predates this keeps its data — created on
// first unlock if the database is empty. Every /api and /auth route needs it.
const pinDigest = (pin) => require('crypto').createHash('sha256').update(String(pin)).digest();
async function pinMatches(pin) {
  if (process.env.APP_PIN) return require('crypto').timingSafeEqual(pinDigest(pin), pinDigest(process.env.APP_PIN));
  const hash = await getSetting('pin_hash');
  return !!hash && bcrypt.compare(String(pin), hash);
}
async function ownerUser() {
  const { rows } = await db.pool.query('SELECT id, email, username FROM users ORDER BY id LIMIT 1');
  if (rows[0]) return rows[0];
  // No password login exists, so the stored hash is a placeholder nothing can match.
  return db.createUser('owner@gains.local', '!pin-only', '');
}
function unlock(req, res) {
  ownerUser()
    .then((owner) => req.login(owner, (err) => (err ? res.status(500).json({ success: false, error: 'Could not unlock' }) : res.json({ success: true }))))
    .catch((err) => res.status(500).json({ success: false, error: err.message }));
}
app.get('/api/pin', async (req, res) => {
  const set = !!process.env.APP_PIN || !!(await getSetting('pin_hash'));
  res.json({ success: true, set, unlocked: req.isAuthenticated() });
});
app.post('/api/pin/setup', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const pin = String(req.body?.pin || '');
  if (!/^\d{4,8}$/.test(pin)) return badRequest(res, 'PIN must be 4–8 digits');
  if (process.env.APP_PIN || await getSetting('pin_hash')) return res.status(409).json({ success: false, error: 'A PIN is already set' });
  await setSetting('pin_hash', await bcrypt.hash(pin, 10));
  unlock(req, res);
});
app.post('/api/pin/unlock', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  if (!(await pinMatches(req.body?.pin || ''))) return res.status(401).json({ success: false, error: 'Wrong PIN' });
  unlock(req, res);
});
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') && !req.path.startsWith('/auth/')) return next();
  if (req.isAuthenticated()) return next();
  if (SYNC_SECRET && req.headers['x-sync-secret'] === SYNC_SECRET) return next();
  res.status(401).json({ success: false, error: 'PIN required', pinRequired: true });
});

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await db.getUserById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ success: false, error: 'Not authenticated' });
}

app.get('/auth/logout', (req, res) => { 
  req.logout((err) => {
    if (err) console.error('Logout error:', err);
    req.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
      res.clearCookie('gainscmd.sid');
      res.redirect('/');
    });
  });
});
app.get('/api/auth/check', (req, res) => {
  res.json(req.isAuthenticated() ? { authenticated: true, user: req.user } : { authenticated: false });
});

// Protected API Routes
// AI link (app_settings table, live-overridable — see loadLmSettings). Single
// provider (LM Studio) — no `anthropic` block, unlike macro-cmd which supports
// both; Hostess's ai-link sync treats an absent `anthropic` key as "this app
// has no Claude option" and skips offering one, rather than showing a toggle
// that wouldn't do anything here.
app.get('/api/lm', adminOrSync, async (req, res) => {
  await loadLmSettings();
  const out = {
    provider: 'local',
    local: { url: LM_URL, model: LM_MODEL, apiKeySet: !!LM_KEY, models: [] },
    // Tells a syncing caller (Hostess) which env vars this response covers --
    // no Claude/Anthropic key here since this app has no Claude option to manage.
    managedEnv: ['LM_STUDIO_URL', 'LM_STUDIO_API_KEY', 'LM_STUDIO_MODEL'],
  };
  if (!LM_URL) return res.json(out);
  try {
    const r = await fetch(`${LM_URL}/v1/models`, {
      headers: LM_KEY ? { Authorization: `Bearer ${LM_KEY}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`endpoint returned ${r.status}`);
    const data = await r.json();
    out.local.models = (data.data || []).map(m => m.id).filter(Boolean);
  } catch (err) {
    out.local.error = err.message;
  }
  res.json(out);
});

app.put('/api/lm', adminOrSync, async (req, res) => {
  const { url, apiKey, model } = req.body || {};
  if (typeof url === 'string') await setSetting('lm_url', url.trim().replace(/\/+$/, ''));
  if (typeof apiKey === 'string') await setSetting('lm_api_key', apiKey.trim());
  if (typeof model === 'string') await setSetting('lm_model', model.trim());
  await loadLmSettings();
  res.json({ provider: 'local', local: { url: LM_URL, model: LM_MODEL, apiKeySet: !!LM_KEY } });
});

app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const settings = await db.getSettings(req.user.id);
    res.json({ success: true, theme: { appName: settings.app_name, icon: settings.icon, mode: settings.theme_mode, color: settings.theme_color }, aggressionSettings: settings.aggression_settings, appearance: settings.appearance || null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Theme/font/layout, mirrored from the client's localStorage (AppearanceSync)
app.post('/api/appearance', requireAuth, async (req, res) => {
  try {
    const { appearance } = req.body || {};
    if (!appearance || typeof appearance.values !== 'object' || !Number.isFinite(appearance.at)) return badRequest(res, 'appearance {at, values} required');
    await db.updateAppearance(req.user.id, appearance);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/aggression', requireAuth, async (req, res) => {
  try {
    await db.updateAggressionSettings(req.user.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/chat-history', requireAuth, async (req, res) => {
  try {
    const messages = await db.getChatHistory(req.user.id);
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/chat-history', requireAuth, async (req, res) => {
  try {
    await db.clearChatHistory(req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/programs', requireAuth, async (req, res) => {
  try {
    const programs = await db.getPrograms(req.user.id);
    res.json({ success: true, programs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/programs', requireAuth, async (req, res) => {
  try {
    const { name, workouts } = req.body;
    const program = await db.createProgram(req.user.id, name, workouts);
    res.json({ success: true, program });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/programs/:id', requireAuth, async (req, res) => {
  try {
    console.log('DELETE /api/programs/' + req.params.id + ' called for user:', req.user.id);
    await db.deleteProgram(req.user.id, req.params.id);
    console.log('db.deleteProgram completed successfully');
    res.json({ success: true });
  } catch (error) {
    console.error('DELETE error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/programs/:id', requireAuth, async (req, res) => {
  try {
    const { name, workouts } = req.body;
    await db.updateProgram(req.user.id, req.params.id, name, workouts);
    res.json({ success: true });
  } catch (error) {
    console.error('PUT program error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/workout-history', requireAuth, async (req, res) => {
  try {
    const history = await db.getWorkoutHistory(req.user.id);
    res.json({ success: true, workouts: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/workout-history/:id', requireAuth, async (req, res) => {
  try {
    const workoutId = req.params.id;
    await db.deleteWorkoutById(req.user.id, workoutId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/workout-history/:id', requireAuth, async (req, res) => {
  try {
    const { programName, workoutName, date, exercises, duration, notes } = req.body;
    const workout = await db.updateWorkout(req.user.id, req.params.id, programName, workoutName, date, exercises, duration, notes);
    if (!workout) return res.status(404).json({ success: false, error: 'Workout not found' });
    res.json({ success: true, workout });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Order matters: "leg curl" must match lowerIsolated before the bare "curl"
// in upperIsolated catches it. upperCompound is the fallthrough.
// Level Up / Snooze checkpoints share workout_history but aren't sessions.
function isMarker(w) {
  return w.program_name === 'LEVEL_UP_MILESTONE' || w.program_name === 'SNOOZE_MILESTONE';
}

function classifyExercise(exerciseName) {
  const name = exerciseName || '';
  if (/squat|deadlift|lunge|leg press|hip thrust|clean|snatch|step up|sled/i.test(name)) return 'lowerCompound';
  if (/leg curl|leg extension|hamstring curl|calf raise|calf press|hip abduction|hip adduction|glute kick|nordic/i.test(name)) return 'lowerIsolated';
  if (/curl|lateral raise|front raise|fly|pushdown|tricep extension|skull crusher|shrug|rear delt|pec deck|pullover/i.test(name)) return 'upperIsolated';
  return 'upperCompound';
}

const MUSCLE_GROUP_LABELS = {
  lowerCompound: 'Legs (squats, deadlifts, lunges, leg press, hip thrust, etc.)',
  lowerIsolated: 'Legs - isolation (leg curl, leg extension, calf raise, etc.)',
  upperIsolated: 'Arms/Shoulders - isolation (curls, lateral raises, pushdowns, etc.)',
  upperCompound: 'Chest/Back/Shoulders - compound (bench, OHP, rows, pull-ups, etc.)'
};

// Small local models can't reliably count or do date math over a raw text
// dump of history — they hallucinate session counts and dates with total
// confidence. Compute frequency/gap/progression facts here so the model
// only has to narrate numbers we already know are correct.
function buildMuscleGroupStats(history) {
  const now = new Date();
  const byGroup = {};
  history.forEach(w => {
    let exercises = [];
    try { exercises = typeof w.exercises === 'string' ? JSON.parse(w.exercises) : w.exercises; } catch (e) {}
    (exercises || []).forEach(ex => {
      if (!ex || !ex.name) return;
      const group = classifyExercise(ex.name);
      const workingSet = (ex.sets || []).find(s => s && s.type !== 'drop') || (ex.sets && ex.sets[0]);
      const weight = parseFloat(workingSet && workingSet.weight != null ? workingSet.weight : ex.weight);
      (byGroup[group] = byGroup[group] || []).push({ date: new Date(w.date), name: ex.name, weight: isNaN(weight) ? null : weight });
    });
  });

  return Object.keys(MUSCLE_GROUP_LABELS).map(group => {
    const entries = byGroup[group];
    if (!entries || !entries.length) return null;

    const sessionDates = [...new Set(entries.map(e => e.date.toDateString()))]
      .map(d => new Date(d))
      .sort((a, b) => a - b);
    const thisMonthCount = sessionDates.filter(d => d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()).length;
    const lastDate = sessionDates[sessionDates.length - 1];
    const daysSinceLast = Math.round((now - lastDate) / 86400000);
    let avgGapDays = null;
    if (sessionDates.length > 1) {
      const gaps = sessionDates.slice(1).map((d, i) => (d - sessionDates[i]) / 86400000);
      avgGapDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    }

    const byExercise = {};
    entries.forEach(e => {
      if (e.weight == null) return;
      (byExercise[e.name] = byExercise[e.name] || []).push(e);
    });
    const trends = Object.entries(byExercise)
      .map(([name, arr]) => {
        if (arr.length < 2) return null;
        arr.sort((a, b) => a.date - b.date);
        const first = arr[0].weight, last = arr[arr.length - 1].weight;
        if (first === last) return null;
        return `${name}: ${first}kg -> ${last}kg`;
      })
      .filter(Boolean);

    return {
      label: MUSCLE_GROUP_LABELS[group],
      totalSessions: sessionDates.length,
      thisMonthCount,
      lastDate: lastDate.toLocaleDateString(),
      daysSinceLast,
      avgGapDays,
      trends
    };
  }).filter(Boolean);
}

app.post('/api/generate-recommendations', requireAuth, async (req, res) => {
  try {
    const trainingSettings = req.body.trainingSettings || {};
    const progressionSpeed = parseInt(trainingSettings.progressionSpeed) || 9;
    
    // Get ALL workout history
    const history = await db.getWorkoutHistory(req.user.id);
    
    // FIX #1: Filter out Level Up / Snooze markers before anything else
    const realWorkouts = history.filter(w => !isMarker(w));
    
    if (realWorkouts.length === 0) {
      return res.json({ success: false, error: 'No workout history found. Complete some workouts first!' });
    }

    // LEVEL UP FIX: Parse milestone records so we know the latest
    // accepted weight per exercise. These DON'T count as training sessions
    // (they're not in realWorkouts), but they DO override the detected
    // "current weight" when a milestone is newer than the last real
    // session — so the engine stops recommending the same progression
    // repeatedly until the user actually trains at the new weight.
    // History is ORDER BY date DESC, so the first milestone per exercise wins.
    const milestoneWeight = {};  // exerciseName -> { weight: number, date: string }
    history
      .filter(w => w.program_name === 'LEVEL_UP_MILESTONE')
      .forEach(m => {
        let exs = [];
        try { exs = typeof m.exercises === 'string' ? JSON.parse(m.exercises) : m.exercises; }
        catch { exs = []; }
        (exs || []).forEach(ex => {
          if (!ex || !ex.name) return;
          if (milestoneWeight[ex.name]) return; // already have newer one
          const firstSet = (ex.sets || [])[0];
          if (!firstSet || firstSet.weight === undefined || firstSet.weight === null || firstSet.weight === '') return;
          const w = parseFloat(firstSet.weight);
          // Accept 0 — assisted exercises legitimately graduate to 0 (full bodyweight).
          if (isNaN(w) || w < 0) return;
          milestoneWeight[ex.name] = { weight: w, date: m.date };
        });
      });

    // Parse SNOOZE_MILESTONE records — notes format: SNOOZE:exerciseName:weight:count
    // History is ORDER BY date DESC so the first record per exercise is the most recent.
    const snoozeInfo = {}; // exerciseName -> { date, weight, count }
    history
      .filter(w => w.program_name === 'SNOOZE_MILESTONE')
      .forEach(m => {
        if (!m.notes) return;
        const parts = m.notes.split(':');
        if (parts[0] !== 'SNOOZE' || !parts[1]) return;
        const name = parts[1];
        if (snoozeInfo[name]) return;
        snoozeInfo[name] = { date: m.date, weight: parseFloat(parts[2]) || 0, count: parseInt(parts[3]) || 3 };
      });

    // Track the most recent REAL session date per exercise so we can
    // compare against milestones below.
    const lastRealDate = {};
    
    // Parse exercises for all real workouts
    const workoutData = realWorkouts.map(w => {
      let exercises = [];
      try {
        exercises = typeof w.exercises === 'string' ? JSON.parse(w.exercises) : w.exercises;
      } catch (e) {
        console.error('Failed to parse exercises:', e);
      }
      return {
        date: w.date,
        program: w.program_name,
        workout: w.workout_name,
        exercises: exercises || []
      };
    });
    
    // FIX #2: Deterministic point counting - NO AI involved
    // Mirrors client-side getProgressionDots() logic exactly
    
    // Step 1: Find the current weight for each exercise (most recent first)
    const exerciseCurrentWeight = {};
    workoutData.forEach(w => {
      if (!w.exercises) return;
      w.exercises.forEach(ex => {
        if (!ex || !ex.name) return;
        if (exerciseCurrentWeight[ex.name] !== undefined) return; // already found most recent
        // Use the first non-drop set's weight as the working weight for progression tracking
        const workingSet = (ex.sets || []).find(s => s && s.type !== 'drop') || (ex.sets && ex.sets[0]);
        const weightRaw = workingSet ? workingSet.weight : undefined;
        const weight = parseFloat(weightRaw);
        const isAssisted = /assisted|counterbalance/i.test(ex.name);
        // Allow 0 for assisted exercises (graduated to full bodyweight).
        if (!isNaN(weight) && (weight > 0 || (weight === 0 && isAssisted))) {
          exerciseCurrentWeight[ex.name] = weight;
          lastRealDate[ex.name] = w.date;
        }
      });
    });

    // LEVEL UP FIX: A milestone promotes the detected current weight ONLY
    // if the milestone is strictly newer than the most recent real session
    // for that exercise. If the user has trained the exercise AFTER
    // accepting a Level Up — even as a deload — the real session wins.
    // Exception: if there's no real session at all for this exercise, the
    // milestone is the only signal we have, so it wins.
    Object.keys(milestoneWeight).forEach(name => {
      const m = milestoneWeight[name];
      const sessionWeight = exerciseCurrentWeight[name];
      const sessionDate = lastRealDate[name];
      if (sessionWeight === undefined) {
        // No real session for this exercise — trust the milestone.
        exerciseCurrentWeight[name] = m.weight;
        return;
      }
      // Dates are ISO strings (YYYY-MM-DD) so string comparison is valid.
      // Use >= so a milestone accepted on the same day as the session
      // (the typical case — recommendation fires after the 9th session,
      // user accepts right after) still wins.
      if (m.date >= sessionDate) {
        exerciseCurrentWeight[name] = m.weight;
      }
    });
    
    // Step 2: Count points per exercise AT their current weight
    const exercisePoints = {};
    
    workoutData.forEach(workout => {
      if (!workout.exercises) return;
      
      workout.exercises.forEach(ex => {
        if (!ex || !ex.name) return;
        
        const currentWeight = exerciseCurrentWeight[ex.name];
        if (currentWeight === undefined) return;
        
        // FIX #3: Match by weight, same as client-side getProgressionDots
        const exWeight = parseFloat(ex.sets && ex.sets[0] ? ex.sets[0].weight : 0) || 0;
        if (exWeight !== currentWeight) return;

        // Snooze filter: only count sessions strictly after the snooze date
        const snooze = snoozeInfo[ex.name];
        if (snooze && Math.abs(snooze.weight - currentWeight) < 0.01) {
          if (workout.date <= snooze.date) return;
        }
        
        // For drop sets: only score the non-drop (main) sets for progression
        // Drop sets use the first/heaviest weight — drops are technique, not the working weight
        const mainSets = (ex.sets || []).filter(s => s && s.completed && s.type !== 'drop');
        const completedSets = mainSets.length > 0 ? mainSets : (ex.sets || []).filter(s => s && s.completed);
        if (completedSets.length === 0) return;
        
        // Parse rep range
        const repRange = ex.repRange || ex.targetReps || '8-12';
        let minReps, maxReps;
        
        if (repRange === 'timer') {
          exercisePoints[ex.name] = (exercisePoints[ex.name] || 0) + 1;
          return;
        }
        
        if (typeof repRange === 'string' && repRange.includes('-')) {
          const parts = repRange.split('-').map(n => parseInt(n));
          minReps = parts[0];
          maxReps = parts[1];
        } else if (typeof repRange === 'string' && repRange.includes('+')) {
          minReps = parseInt(repRange);
          maxReps = 999;
        } else {
          minReps = maxReps = parseInt(repRange);
        }
        
        // Check if ALL main completed sets are within range
        // For supersets: each exercise is scored independently by name (already the case)
        const allWithinRange = completedSets.every(set => {
          const reps = parseInt(set.reps);
          return !isNaN(reps) && reps >= minReps && reps <= maxReps;
        });
        
        if (allWithinRange) {
          exercisePoints[ex.name] = (exercisePoints[ex.name] || 0) + 1;
        }
      });
    });
    
    console.log('📊 Deterministic Exercise Points:', exercisePoints);
    
    // Step 3: Build recommendations, nearProgression, earlyProgress
    const recommendations = [];
    const nearProgression = [];
    const earlyProgress = [];

    // Exercises where lower weight = more resistance (e.g. assisted machines).
    // Progress means reducing the assistance, so the increment is subtracted.
    function isAssistedExercise(name) {
      return /assisted|counterbalance/i.test(name);
    }

    function getIncrement(exerciseName) {
      switch (classifyExercise(exerciseName)) {
        case 'lowerCompound': return parseFloat(trainingSettings.lowerCompoundIncrement || trainingSettings.lowerIncrement || 5);
        case 'lowerIsolated': return parseFloat(trainingSettings.lowerIsolatedIncrement || trainingSettings.lowerIncrement || 5);
        case 'upperIsolated': return parseFloat(trainingSettings.upperIsolatedIncrement || trainingSettings.upperIncrement || 2.5);
        default: return parseFloat(trainingSettings.upperCompoundIncrement || trainingSettings.upperIncrement || 5);
      }
    }

    Object.keys(exercisePoints).forEach(exerciseName => {
      const points = exercisePoints[exerciseName];
      const currentWeightNum = exerciseCurrentWeight[exerciseName] || 0;
      const currentWeight = String(currentWeightNum);
      const increment = getIncrement(exerciseName);
      const assisted = isAssistedExercise(exerciseName);
      // Assisted exercises at 0 have graduated off the machine — further
      // "Level Up" is meaningless, so skip them entirely.
      if (assisted && currentWeightNum === 0) return;
      // Assisted exercises progress by reducing assistance weight; floor at 0
      const nextWeightNum = assisted
        ? Math.max(0, currentWeightNum - increment)
        : currentWeightNum + increment;
      const nextWeight = String(nextWeightNum);

      // Active snooze: use the snooze count as the threshold instead of progressionSpeed.
      // Points have already been filtered to only count sessions after the snooze date.
      const snooze = snoozeInfo[exerciseName];
      const snoozeActive = snooze && Math.abs(snooze.weight - currentWeightNum) < 0.01;
      const threshold = snoozeActive ? snooze.count : progressionSpeed;
      // Scale the "near" band proportionally so it feels consistent regardless of threshold
      const nearThreshold = Math.max(2, Math.floor(threshold * 0.4));

      if (points >= threshold) {
        recommendations.push({
          exercise: exerciseName,
          currentWeight,
          newWeight: nextWeight,
          assisted,
          reason: 'Completed ' + points + ' out of ' + threshold + ' workouts at ' + currentWeight + 'kg with all sets in rep range'
        });
      } else if (points >= nearThreshold) {
        nearProgression.push({
          exercise: exerciseName,
          currentPoints: points,
          pointsNeeded: threshold,
          currentWeight,
          nextWeight,
          assisted,
        });
      } else if (points >= 1) {
        // One-off exercises from long ago (a camping trip, an old program)
        // clutter this tier forever. Hide ones not done in the 8 weeks before
        // the user's latest session — relative to that, not today, so a
        // break from training doesn't empty the page.
        const latest = new Date(realWorkouts[0].date);
        if (lastRealDate[exerciseName] && (latest - new Date(lastRealDate[exerciseName])) > 56 * 86400000) return;
        earlyProgress.push({
          exercise: exerciseName,
          currentPoints: points,
          pointsNeeded: threshold,
          currentWeight,
          nextWeight,
          assisted,
        });
      }
    });
    
    console.log('✅ Recommendations:', recommendations.length);
    console.log('🔥 Near Progression:', nearProgression.length);
    console.log('⚪ Early Progress:', earlyProgress.length);
    
    // Step 4: Progress summary. Built from the data we already have — this used
    // to be a Claude call, but naming the exercises reads as well as the model
    // did and costs nothing.
    const nameList = (list) => {
      const names = list.map(r => r.exercise);
      return names.length > 3
        ? names.slice(0, 3).join(', ') + ' and ' + (names.length - 3) + ' more'
        : names.join(', ');
    };

    let progressSummary = realWorkouts.length + ' workout' + (realWorkouts.length === 1 ? '' : 's') + ' logged. ';
    if (recommendations.length > 0) {
      progressSummary += 'Ready to go up on ' + nameList(recommendations) + '. ';
    }
    if (nearProgression.length > 0) {
      progressSummary += 'Close behind: ' + nameList(nearProgression) + '. ';
    }
    progressSummary += recommendations.length > 0
      ? 'Go get them.'
      : 'Keep chipping away — the next increase is coming.';
    
    res.json({
      success: true,
      recommendations,
      progressSummary,
      nearProgression,
      earlyProgress
    });
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


app.post('/api/analyze-workout', requireAuth, async (req, res) => {
  try {
    const { programName, workoutName, startTime, endTime, localDate, exercises, cardioStats } = req.body;
    
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = Math.round((end - start) / 60000);
    const date = localDate || new Date(endTime).toISOString().split('T')[0];
    
    let notes = '⏳ AI_ANALYSIS_PENDING';
    
    if (cardioStats) {
      let cardioNote = '\n\n📱 Cardio Data';
      if (cardioStats.activityType) cardioNote += '\nActivity: ' + cardioStats.activityType;
      if (cardioStats.duration) cardioNote += '\nDuration: ' + cardioStats.duration;
      if (cardioStats.activeCalories) cardioNote += '\nActive Cal: ' + cardioStats.activeCalories;
      if (cardioStats.totalCalories) cardioNote += '\nTotal Cal: ' + cardioStats.totalCalories;
      if (cardioStats.avgHeartRate) cardioNote += '\nAvg HR: ' + cardioStats.avgHeartRate + ' bpm';
      if (cardioStats.maxHeartRate) cardioNote += '\nMax HR: ' + cardioStats.maxHeartRate + ' bpm';
      if (cardioStats.distance) cardioNote += '\nDistance: ' + cardioStats.distance;
      if (cardioStats.avgPace) cardioNote += '\nAvg Pace: ' + cardioStats.avgPace;
      if (cardioStats.source) cardioNote += '\nSource: ' + cardioStats.source;
      notes += cardioNote;
    }
    
    const savedWorkout = await db.saveWorkout(req.user.id, programName, workoutName, date, exercises, duration, notes);
    res.json({ success: true, workoutId: savedWorkout.id });
    
    analyzeWorkoutAsync(req.user.id, savedWorkout.id, programName, workoutName, date, duration, exercises, cardioStats).catch(err => {
      console.error('Background AI analysis error:', err);
      // Don't leave the workout showing "pending" forever.
      db.updateWorkoutNotes(req.user.id, savedWorkout.id, notes.replace('⏳ AI_ANALYSIS_PENDING', '').trim()).catch(() => {});
    });
    
  } catch (error) {
    console.error('Workout save error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function analyzeWorkoutAsync(userId, workoutId, programName, workoutName, date, duration, exercises, cardioStats) {
  let workoutSummary = `Program: ${programName}\nWorkout: ${workoutName}\nDuration: ${duration} minutes\n\nExercises:\n`;

  const exerciseNotesLog = [];

  if (exercises && Array.isArray(exercises)) {
    exercises.forEach((ex, i) => {
      if (!ex) return;
      workoutSummary += `\n${i + 1}. ${ex.name || 'Unknown Exercise'}\n`;
      const repRange = ex.repRange || ex.targetReps || 'Not specified';
      const targetSets = ex.targetSets || 'Not specified';
      const restTime = ex.restSeconds ? `${Math.floor(ex.restSeconds / 60)}m ${ex.restSeconds % 60}s` : 'Not specified';
      workoutSummary += `   Target: ${targetSets} sets × ${repRange} reps | Rest: ${restTime}\n`;
      if (ex.sets && Array.isArray(ex.sets)) {
        workoutSummary += `   Completed:\n`;
        ex.sets.forEach((set, j) => {
          if (set && set.completed) {
            workoutSummary += `     Set ${j + 1}: ${set.reps || 0} reps @ ${set.weight || 0} kg\n`;
          }
        });
      }
      if (ex.notes && Array.isArray(ex.notes) && ex.notes.length > 0) {
        const userNotes = ex.notes.filter(n => n.role === 'user').map(n => n.content).join(' | ');
        if (userNotes) exerciseNotesLog.push(`${ex.name}: ${userNotes}`);
      }
    });
  }
  
  if (cardioStats) {
    workoutSummary += '\n\nCardio Data (from smartwatch upload):';
    if (cardioStats.activityType) workoutSummary += '\nActivity: ' + cardioStats.activityType;
    if (cardioStats.duration) workoutSummary += '\nDuration: ' + cardioStats.duration;
    if (cardioStats.activeCalories) workoutSummary += '\nActive Cal: ' + cardioStats.activeCalories;
    if (cardioStats.totalCalories) workoutSummary += '\nTotal Cal: ' + cardioStats.totalCalories;
    if (cardioStats.avgHeartRate) workoutSummary += '\nAvg HR: ' + cardioStats.avgHeartRate + ' bpm';
    if (cardioStats.maxHeartRate) workoutSummary += '\nMax HR: ' + cardioStats.maxHeartRate + ' bpm';
    if (cardioStats.distance) workoutSummary += '\nDistance: ' + cardioStats.distance;
    if (cardioStats.avgPace) workoutSummary += '\nAvg Pace: ' + cardioStats.avgPace;
    if (cardioStats.source) workoutSummary += '\nSource: ' + cardioStats.source;
  }

  const notesContext = exerciseNotesLog.length > 0
    ? `\n\nIN-WORKOUT NOTES (user's own observations during the session):\n${exerciseNotesLog.join('\n')}`
    : '';

  const prompt = `Analyze this completed workout and return ONLY a JSON object (no markdown formatting):

${workoutSummary}${notesContext}

Return this exact structure:
{
  "summary": "Brief 1-2 sentence workout summary",
  "insights": ["insight 1", "insight 2", "insight 3"],
  "recommendation": "One specific recommendation for next workout (do NOT suggest increasing or decreasing weight — there is a separate progression system for that)",
  "highlights": "One impressive achievement",
  "notesSummary": "If in-workout notes were provided, write 1-2 sentences summarising the key themes from the user's notes (e.g. what felt good, what was hard, any cues that helped). If no notes were provided, return null."
}

${await coachTone(userId)}

IMPORTANT: Never recommend weight changes (increasing or decreasing). Weight progression is handled by a separate automated system. Focus recommendations on form, tempo, volume, rest times, exercise variety, or recovery instead.`;

  const aiAnalysis = JSON.parse(await llm({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1200,
    temperature: 0.3,
    timeoutMs: 180000,
    schema: SCHEMAS.analysis
  }));
  
  if (aiAnalysis.summary && aiAnalysis.highlights) {
    let updatedNotes = `${aiAnalysis.summary}\n\nHighlight: ${aiAnalysis.highlights}${aiAnalysis.recommendation ? '\n\nRecommendation: ' + aiAnalysis.recommendation : ''}${aiAnalysis.notesSummary ? '\n\n💬 Notes: ' + aiAnalysis.notesSummary : ''}`;
    
    if (cardioStats) {
      let cardioNote = '\n\n📱 Cardio Data';
      if (cardioStats.activityType) cardioNote += '\nActivity: ' + cardioStats.activityType;
      if (cardioStats.duration) cardioNote += '\nDuration: ' + cardioStats.duration;
      if (cardioStats.activeCalories) cardioNote += '\nActive Cal: ' + cardioStats.activeCalories;
      if (cardioStats.totalCalories) cardioNote += '\nTotal Cal: ' + cardioStats.totalCalories;
      if (cardioStats.avgHeartRate) cardioNote += '\nAvg HR: ' + cardioStats.avgHeartRate + ' bpm';
      if (cardioStats.maxHeartRate) cardioNote += '\nMax HR: ' + cardioStats.maxHeartRate + ' bpm';
      if (cardioStats.distance) cardioNote += '\nDistance: ' + cardioStats.distance;
      if (cardioStats.avgPace) cardioNote += '\nAvg Pace: ' + cardioStats.avgPace;
      if (cardioStats.source) cardioNote += '\nSource: ' + cardioStats.source;
      updatedNotes += cardioNote;
    }
    
    await db.updateWorkoutNotes(userId, workoutId, updatedNotes);
  } else {
    throw new Error('AI analysis missing summary/highlights');
  }
}

// Extract cardio stats from smartwatch screenshot
app.post('/api/extract-cardio-stats', requireAuth, async (req, res) => {
  try {
    const { imageData, mediaType } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    const dataUrl = 'data:' + (mediaType || 'image/png') + ';base64,' + imageData;
    const raw = await llm({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `Extract workout/fitness stats from this image (smartwatch, fitness app, or gym machine display).

Return ONLY a JSON object, use null for anything not visible:
{
  "activityType": "e.g. Treadmill, Rowing, Elliptical, Walk, Run, Cycling, HIIT",
  "duration": "time exactly as shown, e.g. 07:36 or 0:21:52 or 15 min",
  "activeCalories": 96,
  "totalCalories": 124,
  "avgHeartRate": 112,
  "maxHeartRate": null,
  "distance": null,
  "avgPace": null,
  "source": "device or brand if visible"
}

Rules:
- If a machine shows a single Cal/kcal number, put it in BOTH activeCalories and totalCalories.
- Infer activityType from the machine if not explicit.
- Use null instead of empty strings.
No markdown, no explanation, JSON only.` },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }],
      maxTokens: 1200,
      temperature: 0.1,
      timeoutMs: 120000,
      schema: SCHEMAS.cardio
    });
    const stats = JSON.parse(raw);
    
    // Image is never stored — only the extracted stats are returned
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Cardio stats extraction error:', error);
    res.status(500).json({ success: false, error: 'Failed to extract stats from image' });
  }
});

app.post('/api/workout', requireAuth, async (req, res) => {
  try {
    const { programName, workoutName, date, exercises, duration, notes } = req.body;
    const workout = await db.saveWorkout(req.user.id, programName, workoutName, date, exercises, duration, notes);
    res.json({ success: true, workout });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Recovery keywords — if any appear in a note, prompt user to flag as recovery note
// Whole words only — substring matching made "rest" fire on "interesting"
// and "pull" on every pull-up note. Training-normal words (rest, failed,
// weak, struggled) are left out: they describe a hard set, not an injury.
const RECOVERY_KEYWORDS = [
  'tight','tightness','sore','soreness','pain','painful','ache','aching','achy',
  'strain','strained','pulled','tweak','tweaked','hurt','hurts','hurting',
  'pinch','pinching','pinched','sharp','tender','swollen','stiff','stiffness',
  'injury','injured','recovering','rehab','physio','inflammation','inflamed'
];
const RECOVERY_RE = new RegExp('\\b(' + RECOVERY_KEYWORDS.join('|') + ')\\b', 'i');

function containsRecoveryKeyword(text) {
  return RECOVERY_RE.test(text);
}

app.post('/api/exercise-notes', requireAuth, async (req, res) => {
  try {
    const { exerciseName, exerciseTarget, message, history } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: 'No message provided' });
    }

    const isRecoveryFlagged = containsRecoveryKeyword(message);

    const conversationMessages = (history || [])
      .slice(-10)
      .map(n => ({
        role: n.role === 'assistant' ? 'assistant' : 'user',
        content: n.content
      }));

    conversationMessages.push({
      role: 'user',
      content: `Exercise: ${exerciseName}${exerciseTarget ? ' (' + exerciseTarget + ')' : ''}\n\n${message}`
    });

    const systemPrompt = isRecoveryFlagged
      ? 'You are a concise fitness coach. The user has mentioned something that sounds like a potential recovery concern. You MUST always start your response with "Noted." — no exceptions. Briefly acknowledge what they said, then ask: "This sounds like it could affect your next session — would you like to save this as a recovery note so I can check in with you next time?" Plain text only — no markdown, no bullet points, no asterisks. 2-3 sentences max.'
      : 'You are a concise fitness coach helping a user mid-workout. The user is logging notes about their exercises. You MUST always start your response with "Noted." — no exceptions. After that, give one short practical thought if relevant, then close with: "Feel free to keep chatting here if you need — recovery, form, anything." Plain text only — no markdown, no bullet points, no asterisks. 2-3 sentences max.';

    const aiResponse = await llm({
      system: systemPrompt + ' ' + await coachTone(req.user.id),
      messages: conversationMessages,
      maxTokens: 300
    });

    await db.saveExerciseNote(req.user.id, exerciseName, exerciseTarget, 'user', message);
    await db.saveExerciseNote(req.user.id, exerciseName, exerciseTarget, 'assistant', aiResponse);

    res.json({ success: true, response: aiResponse, isRecoveryFlagged });
  } catch (error) {
    console.error('Exercise notes error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// All exercises with an active recovery note, for the workout screen
app.get('/api/recovery-notes', requireAuth, async (req, res) => {
  try {
    res.json({ success: true, notes: await db.getActiveRecoveryNotes(req.user.id) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get recovery status for an exercise
app.get('/api/recovery-status/:exerciseName', requireAuth, async (req, res) => {
  try {
    const status = await db.getRecoveryStatus(req.user.id, decodeURIComponent(req.params.exerciseName));
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Set recovery status for an exercise
app.post('/api/recovery-status', requireAuth, async (req, res) => {
  try {
    const { exerciseName, status, note } = req.body;
    // status: 'active' | 'recovered' | 'easy'
    await db.setRecoveryStatus(req.user.id, exerciseName, status, note || '');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/active-workout', requireAuth, async (req, res) => {
  try {
    const workout = await db.getActiveWorkout(req.user.id);
    res.json({ success: true, workout });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/active-workout', requireAuth, async (req, res) => {
  try {
    await db.saveActiveWorkout(req.user.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/active-workout', requireAuth, async (req, res) => {
  try {
    await db.clearActiveWorkout(req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || !messages.length || messages[messages.length - 1].role !== 'user' || typeof messages[messages.length - 1].content !== 'string') {
      return badRequest(res, 'messages must end with a user message');
    }

    // Get user's workout context
    const programs = await db.getPrograms(req.user.id);
    const history = (await db.getWorkoutHistory(req.user.id)).filter(w => !isMarker(w));
    const recentWorkouts = history.slice(0, 30);

    const groupStats = buildMuscleGroupStats(history);

    // Build system prompt with user's data
    const systemPrompt = `You are an AI fitness coach for "${req.user.username}" in the AI Gains app.

TODAY'S DATE: ${new Date().toLocaleDateString()}

THEIR PROGRAMS (${programs.length} total):
${programs.map(p => {
  const workouts = typeof p.workouts === 'string' ? JSON.parse(p.workouts) : p.workouts;
  return `- ${p.name}: ${(workouts || []).length} workouts`;
}).join('\n')}

TRAINING FREQUENCY & PROGRESSION BY MUSCLE GROUP (pre-computed — these are the correct counts, dates and gaps; do not recount or recalculate them yourself, and don't state a number that isn't listed here):
${groupStats.length ? groupStats.map(g => {
  const gapLine = g.avgGapDays != null ? `average ${g.avgGapDays} days between sessions` : 'not enough sessions yet to average a gap';
  const trendLine = g.trends.length ? `Weight trend: ${g.trends.join('; ')}` : 'No repeated exercise yet to show a weight trend';
  return `- ${g.label}\n  ${g.thisMonthCount} session(s) this month, ${g.totalSessions} logged total, last on ${g.lastDate} (${g.daysSinceLast} days ago), ${gapLine}.\n  ${trendLine}`;
}).join('\n') : '- No workout history logged yet for any muscle group.'}

RECENT WORKOUT HISTORY (Last ${recentWorkouts.length}), for extra context only — use the pre-computed section above for any counts, dates, or gaps, not this list:
${recentWorkouts.map(w => {
  const date = new Date(w.date).toLocaleDateString();
  let exercises = [];
  try { exercises = typeof w.exercises === 'string' ? JSON.parse(w.exercises) : w.exercises; } catch (e) {}
  const exerciseList = (exercises || []).filter(ex => ex && ex.name).map(ex => ex.name).join(', ');
  return `- ${date}: ${w.workout_name} (${w.program_name}) - ${w.duration}min${exerciseList ? '\n  Exercises: ' + exerciseList : ''}${w.notes ? '\n  Notes: ' + w.notes : ''}`;
}).join('\n')}

When asked how often they train a muscle group, or whether they're progressing, answer from the pre-computed section. If the average gap for that muscle group is noticeably more than about 7 days, say so directly as something to improve — even if session count and weight progression look good, don't soften it into a "let me know if you want" offer. Most people fully recover a muscle group within about a week, so a longer gap is a real training frequency issue worth naming, not just an optional tweak.

${await coachTone(req.user.id)}

Be helpful and knowledgeable. Reference their actual data when relevant. Use short paragraphs with blank lines between them for readability. Do NOT use markdown formatting like #, **, *, or bullet points. Write in plain conversational text only.`;

    const text = await llm({
      system: systemPrompt,
      messages: messages.slice(-10).filter((_, i, arr) => i > 0 || _.role === 'user'),
      maxTokens: 800
    });
    // Persist the exchange so the conversation survives leaving the tab.
    await db.saveChatMessage(req.user.id, 'user', messages[messages.length - 1].content);
    await db.saveChatMessage(req.user.id, 'assistant', text);
    res.json({ success: true, response: text });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/wizard-init', requireAuth, async (req, res) => {
  try {
    const { programSummary } = req.body;
    
    const prompt = `You are a fitness coach. Based on these program details:

${programSummary}

Generate a simple list of 8 exercises - one exercise per major muscle group. Don't organize by workout days yet, just list the core exercises.

Format your response exactly like this:

"Ok, this will be a good place to start. Here are the 8 core exercises I'm recommending:

1. [Exercise name] (with [equipment type]) for your [Muscle group]
2. [Exercise name] (with [equipment type]) for your [Muscle group]
3. [Exercise name] (with [equipment type]) for your [Muscle group]
4. [Exercise name] (with [equipment type]) for your [Muscle group]
5. [Exercise name] (with [equipment type]) for your [Muscle group]
6. [Exercise name] (with [equipment type]) for your [Muscle group]
7. [Exercise name] (with [equipment type]) for your [Muscle group]
8. [Exercise name] (with [equipment type]) for your [Muscle group]

Would you like to replace any of these exercises? Or would you like me to add variations so you can alternate exercises on different workout days?"

Example format:
"Barbell Bench Press (with barbell) for your chest"
"Romanian Deadlifts (with barbell) for your hamstrings"
"Lat Pulldowns (with cable machine) for your back"

Cover these 8 muscle groups: Chest, Back, Quads, Hamstrings, Shoulders, Biceps, Triceps, Core

Keep it simple and beginner-friendly. Always specify the equipment type in parentheses.`;

    const text = await llm({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 500
    });
    res.json({ success: true, response: text });
  } catch (error) {
    console.error('Wizard init error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/wizard-chat', requireAuth, async (req, res) => {
  try {
    const { message, history, programSummary } = req.body;
    if (!message) return badRequest(res, 'No message provided');

    const systemPrompt = `You are helping create a workout program. The user is in step 5 - the AI refinement chat.

PROGRAM SO FAR:
${programSummary}

Help them refine the program by:
- Suggesting equipment alternatives
- Recommending exercise swaps
- Adjusting volume/intensity
- Answering questions about the program

Keep responses brief (2-3 sentences) and actionable.`;

    const messages = [
      ...(history || []).slice(-6), // Last 6 messages for context, with safety check
      { role: 'user', content: message }
    ];

    const text = await llm({
      system: systemPrompt,
      messages: messages,
      maxTokens: 500
    });
    res.json({ success: true, response: text });
  } catch (error) {
    console.error('Wizard chat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/generate-program', requireAuth, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !description) return badRequest(res, 'name and description required');

    const systemPrompt = `You are a fitness program generator. You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no preamble, no backticks.

The JSON must follow this EXACT structure:
{
  "name": "Program Name",
  "workouts": [
    {
      "name": "Day 1 - Workout Name",
      "exercises": [
        {
          "name": "Exercise Name",
          "sets": 4,
          "repRange": "8-12",
          "restSeconds": 90
        }
      ]
    }
  ]
}

RULES:
- Each workout should have 4-7 exercises
- sets must be a number (3-5)
- repRange must be a string like "8-12", "5-8", "12-15", etc.
- restSeconds must be a number (60, 90, 120, etc.)
- Use common exercise names
- Your response must start with { and end with }`;

    const program = JSON.parse(await llm({
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Create a program called "' + name + '" with these requirements:\n\n' + description }],
      maxTokens: 4000,
      temperature: 0.4,
      timeoutMs: 180000,
      schema: SCHEMAS.program
    }));
    
    // Validate structure
    if (!program.name) program.name = name;
    if (!program.workouts || !Array.isArray(program.workouts)) {
      return res.status(500).json({ success: false, error: 'AI returned invalid program structure' });
    }
    
    // Ensure each exercise has required fields
    program.workouts.forEach(workout => {
      if (!workout.exercises) workout.exercises = [];
      workout.exercises.forEach(ex => {
        ex.sets = parseInt(ex.sets) || 4;
        ex.repRange = ex.repRange || ex.reps || '8-12';
        ex.restSeconds = parseInt(ex.restSeconds || ex.rest) || 90;
      });
    });

    // Keep the model's day names (a Push/Pull/Legs split is three different
    // workouts, not variations of the first) — only de-duplicate repeats.
    const seen = {};
    program.workouts.forEach((w) => {
      const base = (w.name || name).trim();
      seen[base] = (seen[base] || 0) + 1;
      w.name = seen[base] > 1 ? `${base} (${seen[base]})` : base;
    });
    
    res.json({ success: true, program });
  } catch (error) {
    console.error('Generate program error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


app.post('/api/remix-workout', requireAuth, async (req, res) => {
  try {
    const { workout, instruction, mode } = req.body;
    if (!workout || !instruction || !mode) {
      return res.status(400).json({ success: false, error: 'Missing workout, instruction, or mode' });
    }

    const origExerciseMap = {};
    (workout.exercises || []).forEach(ex => { origExerciseMap[ex.name] = ex; });

    const exerciseSummary = (workout.exercises || []).map((ex, i) => {
      if (ex.isInterval) {
        return `${i + 1}. ${ex.name} — INTERVAL: ${ex.intervalWork}s on / ${ex.intervalRest}s off, ${ex.sets} round(s), ${ex.intervalTotal}s total [TIME-BASED — do NOT change sets, repRange, intervalWork, intervalRest, or intervalTotal]`;
      }
      const special = [];
      if (ex.hasDrops) special.push(`drop sets (${ex.numDrops || 1} per set)`);
      if (ex.isBFR) special.push(`BFR ${ex.bfrSeconds || 45}s`);
      if (ex.supersetWith) special.push(`superset with ${ex.supersetWith}`);
      return `${i + 1}. ${ex.name} — ${ex.sets} sets × ${ex.repRange} reps, ${ex.restSeconds}s rest${special.length ? ' [' + special.join(', ') + ']' : ''}`;
    }).join('\n');

    const trimSystemPrompt = `You are an expert personal trainer AI. You will receive an existing workout and a focus instruction. Your job is to rebalance the workout volume to emphasise the requested muscle group — WITHOUT adding or removing any exercises and WITHOUT substituting any exercise names.

RULES FOR TRIM MODE:
1. Keep EVERY exercise. The exercise list must be identical in names and count.
2. Increase sets (and optionally shift repRange toward 8-12 hypertrophy) for exercises that target the focus muscle group.
3. Reduce sets on exercises that do NOT target the focus muscle to compensate, keeping total workout time roughly 60 minutes.
4. Minimum 1 set per exercise. Do not drop any exercise to 0 sets.
5. You may reorder exercises to place focus exercises first.
6. You may adjust restSeconds slightly (±15s) if needed to manage time.
7. Preserve all special set flags (hasDrops, isBFR, isInterval, supersetWith) — only change counts/ranges.
8. For isInterval exercises: return sets, repRange, intervalWork, intervalRest, and intervalTotal EXACTLY as given — these are time-based and must not be touched.
9. Return ONLY valid JSON. No markdown, no explanation, no backticks.

JSON schema:
{
  "exercises": [
    {
      "name": "string — MUST match an existing exercise name exactly",
      "sets": number,
      "repRange": "string e.g. 8-12",
      "restSeconds": number,
      "hasDrops": boolean,
      "numDrops": number,
      "isBFR": boolean,
      "bfrSeconds": number,
      "isInterval": boolean,
      "intervalWork": number,
      "intervalRest": number,
      "intervalTotal": number,
      "supersetWith": "string or null"
    }
  ],
  "changeDescription": "1-2 sentence plain-English summary of what changed and why",
  "shortLabel": "2-4 word label for the change, e.g. Bicep focus"
}`;

    const swapSystemPrompt = `You are an expert personal trainer AI. You will receive an existing workout and a focus instruction. Your job is to replace exercises that overlap with the focus muscle group (i.e. they work it only as a secondary/stabilising muscle) with exercises that target it more directly.

RULES FOR SWAP MODE:
1. Keep the EXACT same number of exercises.
2. Do NOT replace exercises that are already directly targeting the focus muscle — only replace those where the focus muscle is secondary.
3. For exercises being swapped out: choose a replacement that primarily targets the focus muscle and fits naturally in that position (e.g. similar movement pattern, similar equipment).
4. Keep sets, repRange, and restSeconds from the original for replaced exercises — you may bump repRange to 8-12 for hypertrophy focus.
5. You may reorder so focus exercises come first.
6. Preserve special set flags for exercises that are NOT being replaced.
7. For isInterval exercises: return sets, repRange, intervalWork, intervalRest, and intervalTotal EXACTLY as given — these are time-based and must not be touched.
8. Return ONLY valid JSON. No markdown, no explanation, no backticks.

JSON schema:
{
  "exercises": [
    {
      "name": "string",
      "sets": number,
      "repRange": "string e.g. 8-12",
      "restSeconds": number,
      "hasDrops": boolean,
      "numDrops": number,
      "isBFR": boolean,
      "bfrSeconds": number,
      "isInterval": boolean,
      "intervalWork": number,
      "intervalRest": number,
      "intervalTotal": number,
      "supersetWith": "string or null"
    }
  ],
  "changeDescription": "1-2 sentence plain-English summary of what changed and why",
  "shortLabel": "2-4 word label for the change, e.g. Rear delt focus"
}`;

    // "edit": the user's instruction is literal ("remove seated row and legs",
    // "add face pulls") — neither trim nor swap can remove or add exercises.
    const editSystemPrompt = `You are an expert personal trainer AI. You will receive an existing workout and an instruction. Apply the instruction literally.

RULES FOR EDIT MODE:
1. Remove, add, or replace exercises exactly as the instruction asks. Change nothing the instruction doesn't mention.
2. Exercises you keep must keep their exact name, sets, repRange, restSeconds and special set flags.
3. New exercises: choose sensible sets (3), repRange ("8-12") and restSeconds (90) unless the instruction says otherwise; all special flags false/0, supersetWith null.
4. If the instruction is about time ("make it 40 minutes"), cut sets and rest first, then exercises, and say so in changeDescription.
5. Return ONLY valid JSON.

JSON schema: same exercise fields as given — name, sets, repRange, restSeconds, hasDrops, numDrops, isBFR, bfrSeconds, isInterval, intervalWork, intervalRest, intervalTotal, supersetWith — plus "changeDescription" (1-2 sentences) and "shortLabel" (2-4 words, e.g. "No legs, 40 min").`;

    const userPrompt = `Workout name: "${workout.name}"

Current exercises:
${exerciseSummary}

User instruction: "${instruction}"

Return the remixed workout JSON now.`;

    const parsed = JSON.parse(await llm({
      system: { trim: trimSystemPrompt, swap: swapSystemPrompt, edit: editSystemPrompt }[mode] || swapSystemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 2000,
      temperature: 0.3,
      timeoutMs: 120000,
      schema: SCHEMAS.remix
    }));
    if (!Array.isArray(parsed.exercises) || parsed.exercises.length === 0) {
      return res.status(500).json({ success: false, error: 'AI returned empty exercise list' });
    }

    // Safety net: restore original values for interval exercises regardless of what AI returned
    parsed.exercises = restoreNames(parsed.exercises, workout.exercises).map(ex => {
      const orig = origExerciseMap[ex.name];
      if (ex.isInterval && orig) {
        return { ...ex, sets: orig.sets, repRange: orig.repRange, intervalWork: orig.intervalWork, intervalRest: orig.intervalRest, intervalTotal: orig.intervalTotal };
      }
      return ex;
    });

    res.json({ success: true, exercises: parsed.exercises, changeDescription: parsed.changeDescription || '', shortLabel: (parsed.shortLabel || '').slice(0, 40) });
  } catch (e) {
    console.error('remix-workout error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// --- WORKOUT SHARING ---

app.post('/api/workouts/share', requireAuth, async (req, res) => {
  try {
    const { workoutData, workoutName } = req.body;
    if (!workoutData || !workoutName) {
      return res.status(400).json({ success: false, error: 'Missing workoutData or workoutName' });
    }
    const share = await db.createWorkoutShare(req.user.id, workoutData, workoutName);
    res.json({ success: true, code: share.code, expiresAt: share.expires_at });
  } catch (e) {
    console.error('Share workout error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/share/:code', async (req, res) => {
  try {
    const share = await db.getWorkoutShare(req.params.code);
    if (!share) return res.status(404).json({ success: false, error: 'Share code not found or expired' });
    res.json({ success: true, workoutName: share.workout_name, exerciseCount: (share.workout_data?.exercises || []).length, expiresAt: share.expires_at });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/share/:code/import', requireAuth, async (req, res) => {
  try {
    const share = await db.getWorkoutShare(req.params.code);
    if (!share) return res.status(404).json({ success: false, error: 'Share code not found or expired' });
    res.json({ success: true, workout: share.workout_data, workoutName: share.workout_name });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// --- REACT FRONTEND ---
// SPA fallback — any non-API route serves the React app (Express v5 syntax)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    return next();
  }
  if (req.method === 'GET' && req.accepts('html')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
  next();
});
// --- END REACT FRONTEND ---

let server;
async function start() {
  await db.ready;
  await loadLmSettings();
  sessionMiddleware = session({
    store: new db.PgSessionStore(),
    secret: await sessionSecret(),
    name: 'gainscmd.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.COOKIE_SECURE === 'true',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    }
  });
  server = app.listen(PORT, () => {
    console.log('');
    console.log('💪 AI GAINS SERVER');
    console.log(`✅ Server running on port ${PORT}`);
    console.log('');
  });
}
start();

// Node running as PID 1 gets no default signal disposition from the kernel, so
// without this SIGTERM is dropped: the platform waits out its grace period and
// then SIGKILLs us mid-write. Close cleanly instead.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    if (!server) process.exit(0);
    server.close(() => process.exit(0));
    // Don't let a hung keep-alive connection outlast the grace period.
    setTimeout(() => process.exit(0), 4000).unref();
  });
}
