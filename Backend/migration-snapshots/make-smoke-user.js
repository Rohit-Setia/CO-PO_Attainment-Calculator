// Creates (or refreshes) the clearly-marked temporary Phase 4 smoke-test admin account.
// DELETE after use: node migration-snapshots/remove-smoke-user.js
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const hash = bcrypt.hashSync('Phase4SmokeTest1', 10);
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await c.query(
    "INSERT INTO teachers (name, email, password, role, is_active) VALUES ('PHASE4-SMOKE-TEMP', 'phase4-smoke@test.local', ?, 'Admin', TRUE) "
    + 'ON DUPLICATE KEY UPDATE password = VALUES(password), is_active = TRUE',
    [hash],
  );
  console.log('temp smoke user ready: phase4-smoke@test.local');
  await c.end();
})();
