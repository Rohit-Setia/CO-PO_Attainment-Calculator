// Removes the temporary Phase 7 smoke-test accounts (run after testing).
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  const [r] = await c.query("DELETE FROM teachers WHERE email LIKE '%@test.local' AND name LIKE 'PHASE7-SMOKE-%'");
  console.log('phase7 smoke users removed, affectedRows:', r.affectedRows);
  await c.end();
})();
