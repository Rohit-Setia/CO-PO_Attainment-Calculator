// Removes the temporary Phase 4 smoke-test admin account (run after testing).
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  const [r] = await c.query("DELETE FROM teachers WHERE email = 'phase4-smoke@test.local' AND name = 'PHASE4-SMOKE-TEMP'");
  console.log('temp smoke user removed, affectedRows:', r.affectedRows);
  await c.end();
})();
