// ─────────────────────────────────────────────────────────────────────────────
// Phase 0 — platform migrations registered with the versioned migration runner.
//
// Everything here is ADDITIVE and idempotent:
//   * index creation only (no drops, no renames, no data rewrites);
//   * each migration is gated by the `schema_migrations` table (utils/migrationRunner)
//     AND defensively checks INFORMATION_SCHEMA before altering;
//   * safe to run on a live, populated database.
//
// Future phases append new registrations in this file (or in phase-specific files
// that require it) — always additive, always gated.
// ─────────────────────────────────────────────────────────────────────────────
const pool = require('../config/db');
const { registerMigration } = require('../utils/migrationRunner');

// Portable, idempotent index creation (works on MySQL 8 and MariaDB, unlike
// `CREATE INDEX IF NOT EXISTS`). Returns true if the index was added, false if it
// already exists.
const ensureIndex = async (table, indexName, columnsSql) => {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, indexName],
  );
  if (rows.length > 0) return false;
  await pool.query(`ALTER TABLE ${table} ADD INDEX ${indexName} (${columnsSql})`);
  return true;
};

// Highest-traffic context lookup: "all students of a Program + Session + Semester".
// Used by getStudentsByContext / enrollStudentInAllContextCourses / marks roster.
registerMigration('phase0_index_students_context', async () => {
  await ensureIndex('students', 'ix_students_context', 'academic_program_id, academic_session_id, semester');
});

// student_marks rows are frequently looked up by the linked Student Master id
// (backfill + delete-by-student + drill-down joins). No FK/index exists on this
// column today (it is a plain INT), so add one.
registerMigration('phase0_index_student_marks_student', async () => {
  await ensureIndex('student_marks', 'ix_student_marks_student', 'student_id');
});

module.exports = { ensureIndex };