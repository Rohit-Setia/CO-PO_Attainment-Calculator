// Phase 8 — data integrity + row-count snapshot for before/after comparison.
// Usage: node migration-snapshots/phase8-db-snapshot.js [outputFile]
const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

const TABLES = [
  'students', 'class_students', 'course_enrollments', 'student_marks', 'student_co_marks',
  'courses', 'course_outcomes', 'co_po_values', 'question_configs', 'schools', 'departments',
  'branches', 'programs', 'academic_sessions', 'academic_classes', 'teachers', 'admin_audit_log',
  'user_course_assignments', 'student_question_marks', 'course_configs',
];

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  const snapshot = { capturedAt: new Date().toISOString(), counts: {} };
  for (const t of TABLES) {
    // eslint-disable-next-line no-await-in-loop
    const [rows] = await c.query(`SELECT COUNT(*) AS count FROM \`${t}\``);
    snapshot.counts[t] = rows[0].count;
  }
  const [uniq] = await c.query('SELECT COUNT(DISTINCT registration_number) AS uniq FROM students');
  snapshot.counts.unique_registration_numbers = uniq[0].uniq;
  await c.end();

  const out = process.argv[2] || 'migration-snapshots/phase8-db-snapshot.json';
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2));
  console.log('Snapshot written:', out);
  Object.entries(snapshot.counts).forEach(([t, n]) => console.log(`  ${t}: ${n}`));
})();