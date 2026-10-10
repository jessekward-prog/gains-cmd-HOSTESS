const { Pool, types } = require('pg');
const session = require('express-session');

// Return DATE columns as plain 'YYYY-MM-DD'. pg's default turns them into a
// midnight Date in the *server's* timezone, which shifts every workout a day
// once serialised to JSON on any non-UTC host.
types.setTypeParser(1082, v => v);

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /sslmode=disable/i.test(process.env.DATABASE_URL || '')
    ? false
    : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});

// Auto-create tables on startup
async function initializeTables() {
  const client = await pool.connect();
  try {
    console.log('🔧 Checking database tables...');
    
    // Check if tables exist
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'users'
    `);

    // Base tables first — the migrations below reference users(id), and on a
    // fresh database they used to run before it existed and fail silently.
    if (result.rows.length === 0) {
      console.log('📦 Creating database tables...');
      
      // Create all tables
      await client.query(`
        -- Users table
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          username VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP
        );

        -- User settings table
        CREATE TABLE user_settings (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          app_name VARCHAR(100) DEFAULT 'AI Gains',
          icon VARCHAR(10) DEFAULT '💪',
          theme_mode VARCHAR(20) DEFAULT 'dark',
          theme_color VARCHAR(50) DEFAULT 'red',
          aggression_settings JSONB DEFAULT '{"trainingFrequency": 3, "progressionSpeed": 12, "upperIncrement": 2.5, "lowerIncrement": 5, "coachingTone": "encouraging"}',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id)
        );

        -- Programs table
        CREATE TABLE programs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          workouts JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Workout history table
        CREATE TABLE workout_history (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          program_name VARCHAR(255),
          workout_name VARCHAR(255),
          date DATE NOT NULL,
          exercises JSONB NOT NULL,
          duration INTEGER,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Chat history table
        CREATE TABLE chat_history (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Exercise notes history
        CREATE TABLE exercise_notes (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          exercise_name VARCHAR(255) NOT NULL,
          exercise_target VARCHAR(255),
          role VARCHAR(20) NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Active workout state
        CREATE TABLE active_workouts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          workout_data JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id)
        );

        -- Exercise recovery status
        CREATE TABLE exercise_recovery (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          exercise_name VARCHAR(255) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          note TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, exercise_name)
        );

        -- Workout share codes
        CREATE TABLE workout_shares (
          id SERIAL PRIMARY KEY,
          code VARCHAR(8) UNIQUE NOT NULL,
          owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          workout_data JSONB NOT NULL,
          workout_name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NOT NULL
        );

        -- Create indexes
        CREATE INDEX idx_users_email ON users(email);
        CREATE INDEX idx_programs_user_id ON programs(user_id);
        CREATE INDEX idx_workout_history_user_id ON workout_history(user_id);
        CREATE INDEX idx_workout_history_date ON workout_history(date DESC);
        CREATE INDEX idx_chat_history_user_id ON chat_history(user_id, created_at DESC);
        CREATE INDEX idx_exercise_notes_user_id ON exercise_notes(user_id, created_at DESC);
        CREATE INDEX idx_exercise_notes_exercise ON exercise_notes(user_id, exercise_name);
        CREATE INDEX idx_active_workouts_user_id ON active_workouts(user_id);
        CREATE INDEX idx_exercise_recovery_user ON exercise_recovery(user_id, exercise_name);
        CREATE INDEX idx_workout_shares_code ON workout_shares(code);
      `);
      
      console.log('✅ Database tables created successfully!');
    } else {
      console.log('✅ Database tables already exist');
    }
    
    // Always run column migrations (safe to run multiple times)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_phrase_hash VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
    `).catch(() => {}); // Ignore if already exist

    // Always run recovery_status migration (safe to run multiple times)
    await client.query(`
      CREATE TABLE IF NOT EXISTS exercise_recovery (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        exercise_name VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        note TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, exercise_name)
      );
      CREATE INDEX IF NOT EXISTS idx_exercise_recovery_user ON exercise_recovery(user_id, exercise_name);
    `).catch(() => {});

    // App-level (not per-user) key/value settings -- currently just the linked
    // local AI (lm_url, lm_api_key, lm_model), settable live via /api/lm.
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `).catch(() => {});

    // Login sessions — kept in Postgres so a redeploy doesn't log everyone out
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess JSONB NOT NULL,
        expire TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
    `).catch(() => {});

    // Chat history migration (safe to run multiple times)
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id, created_at DESC);
    `).catch(() => {});

    // Workout share codes migration (safe to run multiple times)
    await client.query(`
      CREATE TABLE IF NOT EXISTS workout_shares (
        id SERIAL PRIMARY KEY,
        code VARCHAR(8) UNIQUE NOT NULL,
        owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        workout_data JSONB NOT NULL,
        workout_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workout_shares_code ON workout_shares(code);
    `).catch(() => {});


    // After creation so it also lands on a brand-new database.
    await client.query('ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS appearance JSONB');
    await client.query('ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS exercise_links JSONB');
    // Quest Mode: profile + vault in one small column; Forge art (images) in its own table.
    await client.query('ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS quest JSONB');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quest_art (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        slot INTEGER NOT NULL,
        data JSONB NOT NULL,
        PRIMARY KEY (user_id, slot)
      )`);
  } catch (error) {
    console.error('❌ Error initializing tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Call initialization. Exported so the server can wait for tables before it
// reads app_settings or accepts logins.
const ready = initializeTables().catch(err => {
  console.error('Failed to initialize database:', err);
});

// express-session store on the sessions table.
function settle(promise, cb, map) {
  promise.then(r => cb && cb(null, map ? map(r) : undefined), err => cb && cb(err));
}
class PgSessionStore extends session.Store {
  get(sid, cb) {
    settle(pool.query('SELECT sess FROM sessions WHERE sid = $1 AND expire > NOW()', [sid]), cb, r => r.rows[0]?.sess || null);
  }
  set(sid, sess, cb) {
    const expire = new Date(sess.cookie?.expires || Date.now() + 86400000);
    settle(pool.query(
      `INSERT INTO sessions (sid, sess, expire) VALUES ($1, $2, $3)
       ON CONFLICT (sid) DO UPDATE SET sess = $2, expire = $3`,
      [sid, sess, expire]
    ), cb);
  }
  destroy(sid, cb) {
    settle(pool.query('DELETE FROM sessions WHERE sid = $1', [sid]), cb);
  }
  touch(sid, sess, cb) {
    const expire = new Date(sess.cookie?.expires || Date.now() + 86400000);
    settle(pool.query('UPDATE sessions SET expire = $2 WHERE sid = $1', [sid, expire]), cb);
  }
}
setInterval(() => pool.query('DELETE FROM sessions WHERE expire < NOW()').catch(() => {}), 3600000).unref();

// User authentication functions
async function createUser(email, passwordHash, username) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const userResult = await client.query(
      'INSERT INTO users (email, password_hash, username) VALUES ($1, $2, $3) RETURNING id, email, username, created_at',
      [email, passwordHash, username]
    );
    
    const userId = userResult.rows[0].id;
    
    await client.query(
      'INSERT INTO user_settings (user_id) VALUES ($1)',
      [userId]
    );
    
    await client.query('COMMIT');
    return userResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}



// Get user by ID (for session deserialization)
async function getUserById(id) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, email, username FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

// Create user from Google OAuth

// Program functions
async function getPrograms(userId) {
  const result = await pool.query(
    'SELECT id, name, workouts, created_at FROM programs WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

async function createProgram(userId, name, workouts) {
  const result = await pool.query(
    'INSERT INTO programs (user_id, name, workouts) VALUES ($1, $2, $3) RETURNING id, name, workouts, created_at',
    [userId, name, JSON.stringify(workouts)]
  );
  return result.rows[0];
}

async function deleteProgram(userId, programId) {
  const result = await pool.query(
    'DELETE FROM programs WHERE id = $1 AND user_id = $2 RETURNING id',
    [programId, userId]
  );
  return result.rowCount > 0;
}

async function updateProgram(userId, programId, name, workouts) {
  const result = await pool.query(
    'UPDATE programs SET name = $1, workouts = $2 WHERE id = $3 AND user_id = $4 RETURNING id',
    [name, JSON.stringify(workouts), programId, userId]
  );
  return result.rows[0];
}

// Workout history functions
async function getWorkoutHistory(userId, startDate = null, endDate = null) {
  let query = 'SELECT id, program_name, workout_name, date, exercises, duration, notes, created_at FROM workout_history WHERE user_id = $1';
  const params = [userId];
  
  if (startDate && endDate) {
    query += ' AND date BETWEEN $2 AND $3';
    params.push(startDate, endDate);
  }
  
  query += ' ORDER BY date DESC';
  
  const result = await pool.query(query, params);
  return result.rows;
}

async function saveWorkout(userId, programName, workoutName, date, exercises, duration, notes) {
  const result = await pool.query(
    'INSERT INTO workout_history (user_id, program_name, workout_name, date, exercises, duration, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [userId, programName, workoutName, date, JSON.stringify(exercises), duration, notes]
  );
  return result.rows[0];
}

async function updateWorkout(userId, workoutId, programName, workoutName, date, exercises, duration, notes) {
  const result = await pool.query(
    `UPDATE workout_history SET program_name = $3, workout_name = $4, date = $5, exercises = $6, duration = $7, notes = $8
     WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, workoutId, programName, workoutName, date, JSON.stringify(exercises), duration, notes]
  );
  return result.rows[0];
}

async function updateWorkoutNotes(userId, workoutId, notes) {
  await pool.query('UPDATE workout_history SET notes = $3 WHERE user_id = $1 AND id = $2', [userId, workoutId, notes]);
}

async function deleteWorkoutById(userId, workoutId) {
  const result = await pool.query(
    'DELETE FROM workout_history WHERE user_id = $1 AND id = $2',
    [userId, workoutId]
  );
  return result.rowCount > 0;
}

// Settings functions
async function getSettings(userId) {
  const result = await pool.query(
    'SELECT app_name, icon, theme_mode, theme_color, aggression_settings, appearance, exercise_links, quest FROM user_settings WHERE user_id = $1',
    [userId]
  );
  
  if (result.rows.length === 0) {
    await pool.query(
      'INSERT INTO user_settings (user_id) VALUES ($1)',
      [userId]
    );
    return {
      app_name: 'AI Gains',
      icon: '💪',
      theme_mode: 'dark',
      theme_color: 'red',
      aggression_settings: {
        trainingFrequency: 3,
        progressionSpeed: 12,
        upperIncrement: 2.5,
        lowerIncrement: 5,
        coachingTone: 'encouraging'
      }
    };
  }
  
  return result.rows[0];
}

async function updateAppearance(userId, appearance) {
  await pool.query(
    'UPDATE user_settings SET appearance = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
    [JSON.stringify(appearance), userId]
  );
}

async function updateExerciseLinks(userId, links) {
  await pool.query(
    'UPDATE user_settings SET exercise_links = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
    [JSON.stringify(links), userId]
  );
}

async function updateQuest(userId, quest) {
  await pool.query(
    'UPDATE user_settings SET quest = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
    [JSON.stringify(quest), userId]
  );
}

async function getQuestArt(userId) {
  const { rows } = await pool.query('SELECT slot, data FROM quest_art WHERE user_id = $1', [userId]);
  return Object.fromEntries(rows.map((r) => [r.slot, r.data]));
}

async function setQuestArt(userId, slot, data) {
  await pool.query(
    'INSERT INTO quest_art (user_id, slot, data) VALUES ($1, $2, $3) ON CONFLICT (user_id, slot) DO UPDATE SET data = $3',
    [userId, slot, JSON.stringify(data)]
  );
}

async function deleteQuestArt(userId, slot) {
  await pool.query('DELETE FROM quest_art WHERE user_id = $1 AND slot = $2', [userId, slot]);
}

async function updateAggressionSettings(userId, aggressionSettings) {
  await pool.query(
    'UPDATE user_settings SET aggression_settings = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
    [JSON.stringify(aggressionSettings), userId]
  );
}

// Chat history functions
async function getChatHistory(userId, limit = 50) {
  const result = await pool.query(
    'SELECT role, content, created_at FROM chat_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );
  return result.rows.reverse();
}

async function saveChatMessage(userId, role, content) {
  await pool.query(
    'INSERT INTO chat_history (user_id, role, content) VALUES ($1, $2, $3)',
    [userId, role, content]
  );
}

async function clearChatHistory(userId) {
  await pool.query(
    'DELETE FROM chat_history WHERE user_id = $1',
    [userId]
  );
}

// Exercise notes functions
async function saveExerciseNote(userId, exerciseName, exerciseTarget, role, content) {
  await pool.query(
    'INSERT INTO exercise_notes (user_id, exercise_name, exercise_target, role, content) VALUES ($1, $2, $3, $4, $5)',
    [userId, exerciseName, exerciseTarget, role, content]
  );
}

// Active workout state
async function getActiveWorkout(userId) {
  const result = await pool.query(
    'SELECT workout_data FROM active_workouts WHERE user_id = $1',
    [userId]
  );
  return result.rows.length > 0 ? result.rows[0].workout_data : null;
}

async function saveActiveWorkout(userId, workoutData) {
  await pool.query(
    `INSERT INTO active_workouts (user_id, workout_data, updated_at) 
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) 
     DO UPDATE SET workout_data = $2, updated_at = CURRENT_TIMESTAMP`,
    [userId, JSON.stringify(workoutData)]
  );
}

async function clearActiveWorkout(userId) {
  await pool.query(
    'DELETE FROM active_workouts WHERE user_id = $1',
    [userId]
  );
}

// Recovery status functions
async function getRecoveryStatus(userId, exerciseName) {
  const result = await pool.query(
    'SELECT status, note, updated_at FROM exercise_recovery WHERE user_id = $1 AND exercise_name = $2',
    [userId, exerciseName]
  );
  return result.rows[0] || null;
}

async function getActiveRecoveryNotes(userId) {
  const result = await pool.query(
    "SELECT exercise_name, note, updated_at FROM exercise_recovery WHERE user_id = $1 AND status = 'active'",
    [userId]
  );
  return result.rows;
}

async function setRecoveryStatus(userId, exerciseName, status, note = '') {
  await pool.query(
    `INSERT INTO exercise_recovery (user_id, exercise_name, status, note, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, exercise_name)
     DO UPDATE SET status = $3, note = $4, updated_at = CURRENT_TIMESTAMP`,
    [userId, exerciseName, status, note]
  );
}




// Workout share functions
function generateShareCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/1/0 confusion
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function createWorkoutShare(ownerUserId, workoutData, workoutName) {
  let code;
  let attempts = 0;
  while (attempts < 10) {
    code = generateShareCode();
    try {
      const result = await pool.query(
        `INSERT INTO workout_shares (code, owner_user_id, workout_data, workout_name, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')
         RETURNING code, workout_name, expires_at`,
        [code, ownerUserId, JSON.stringify(workoutData), workoutName]
      );
      return result.rows[0];
    } catch (e) {
      if (e.code === '23505') { attempts++; continue; } // unique violation, retry
      throw e;
    }
  }
  throw new Error('Could not generate unique share code');
}

async function getWorkoutShare(code) {
  await pool.query(`DELETE FROM workout_shares WHERE expires_at < NOW()`).catch(() => {});
  const result = await pool.query(
    `SELECT code, owner_user_id, workout_data, workout_name, expires_at FROM workout_shares WHERE code = $1`,
    [code.toUpperCase()]
  );
  return result.rows[0] || null;
}

module.exports = {
  pool,
  ready,
  PgSessionStore,
  createUser,
  getUserById,
  getPrograms,
  createProgram,
  deleteProgram,
  updateProgram,
  getWorkoutHistory,
  saveWorkout,
  deleteWorkoutById,
  updateWorkout,
  updateWorkoutNotes,
  getSettings,
  updateAggressionSettings,
  updateAppearance,
  updateExerciseLinks,
  updateQuest,
  getQuestArt,
  setQuestArt,
  deleteQuestArt,
  getChatHistory,
  saveChatMessage,
  clearChatHistory,
  saveExerciseNote,
  getActiveWorkout,
  saveActiveWorkout,
  clearActiveWorkout,
  getRecoveryStatus,
  setRecoveryStatus,
  getActiveRecoveryNotes,
  createWorkoutShare,
  getWorkoutShare,
};
