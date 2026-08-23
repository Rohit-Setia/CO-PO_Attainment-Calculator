// Creates (or refreshes) clearly-marked temporary Phase 7 smoke-test accounts, one per role.
// DELETE after use: node migration-snapshots/remove-phase7-smoke-users.js
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

const USERS = [
  { name: 'PHASE7-SMOKE-ADMIN', email: 'phase7-smoke-admin@test.local', role: 'Admin' },
  { name: 'PHASE7-SMOKE-TEACHER', email: 'phase7-smoke-teacher@test.local', role: 'Teacher' },
  { name: 'PHASE7-SMOKE-VIEWER', email: 'phase7-smoke-viewer@test.local', role: 'Viewer' },
  { name: 'PHASE7-SMOKE-SCHOOLADMIN', email: 'phase7-smoke-schooladmin@test.local', role: 'School Admin', schoolId: 1 },
  { name: 'PHASE7-SMOKE-DEPTADMIN', email: 'phase7-smoke-deptadmin@test.local', role: 'Department Admin', departmentId: 1 },
];

(async () => {
  const hash = bcrypt.hashSync('Phase7SmokeTest1', 10);
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  for (const u of USERS) {
    // eslint-disable-next-line no-await-in-loop
    await c.query(
      'INSERT INTO teachers (name, email, password, role, is_active, school_id, department_id) VALUES (?, ?, ?, ?, TRUE, ?, ?) '
      + 'ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role), is_active = TRUE, school_id = VALUES(school_id), department_id = VALUES(department_id)',
      [u.name, u.email, hash, u.role, u.schoolId || null, u.departmentId || null],
    );
    console.log('ready:', u.email, u.role);
  }
  await c.end();
})();
