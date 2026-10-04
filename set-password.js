// Admin tool: give an account a password (e.g. the old Google-only accounts,
// which can no longer be claimed through /auth/register).
//   DATABASE_URL=... node set-password.js <email> <new password>
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./db');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.error('usage: node set-password.js <email> <new password, min 8 chars>');
    process.exit(1);
  }
  await db.ready;
  const user = await db.getUserByEmailForAuth(email.toLowerCase());
  if (!user) {
    console.error('No user with email ' + email);
    process.exit(1);
  }
  await db.setPasswordHash(user.id, await bcrypt.hash(password, 12));
  console.log(`Password set for ${user.email} (${user.username}). They can log in now.`);
  process.exit(0);
})();
