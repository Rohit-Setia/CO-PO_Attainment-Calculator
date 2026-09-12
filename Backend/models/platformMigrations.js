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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Teacher Management platform migrations.
// Everything is ADDITIVE and idempotent (gated by schema_migrations AND guarded
// with information_schema checks). No existing teacher row is rewritten.
// ─────────────────────────────────────────────────────────────────────────────

// Unique-index variant of ensureIndex (same information_schema gate). Failure is
// contained per-index: pre-existing duplicate values in the live DB simply skip
// the constraint instead of breaking startup (mirrors addPhase7DuplicatePrevention).
const ensureUniqueIndex = async (table, indexName, columnsSql) => {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, indexName],
  );
  if (rows.length > 0) return false;
  await pool.query(`ALTER TABLE ${table} ADD UNIQUE KEY ${indexName} (${columnsSql})`);
  return true;
};

const ensureColumn = async (table, column, definition) => {
  const [rows] = await pool.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column],
  );
  if (rows.length > 0) return false;
  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
};

// Additional teacher identity/profile fields required by the bulk-import workflow
// (#1/#2): Employee ID, Username, Designation, Phone, and the first-login flag.
// All nullable/defaulted except must_change_password, so existing rows are untouched.
registerMigration('phase1_teacher_profile_columns', async () => {
  await ensureColumn('teachers', 'username', 'VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL');
  await ensureColumn('teachers', 'employee_id', 'VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL');
  await ensureColumn('teachers', 'designation', 'VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL');
  await ensureColumn('teachers', 'phone', 'VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL');
  await ensureColumn('teachers', 'must_change_password', 'TINYINT(1) NOT NULL DEFAULT 0');
});

// Unique usernames / employee ids where the live data has no collision already.
registerMigration('phase1_teacher_unique_identity', async () => {
  try { await ensureUniqueIndex('teachers', 'uniq_teacher_username', 'username'); } catch (err) {
    console.warn('[phase1_teacher_unique_identity] username unique index skipped:', err.message);
  }
  try { await ensureUniqueIndex('teachers', 'uniq_teacher_employee_id', 'employee_id'); } catch (err) {
    console.warn('[phase1_teacher_unique_identity] employee_id unique index skipped:', err.message);
  }
});

// One-time password-setup tokens. Only the SHA-256 hash of the random token is
// stored — the plaintext token is shown to the user exactly once, in the email /
// setup URL, and never persisted. purpose distinguishes initial setup (bulk import)
// from later manual resets.
registerMigration('phase1_password_reset_tokens', async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME DEFAULT NULL,
      purpose ENUM('password_setup', 'password_reset') NOT NULL DEFAULT 'password_setup',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES teachers(id) ON DELETE CASCADE,
      UNIQUE KEY uniq_token_hash (token_hash)
    ) ENGINE=InnoDB
  `);
});

// Teacher Directory deletion (soft delete). `teachers.id` is referenced by 11 foreign
// keys, 9 of them ON DELETE CASCADE — including courses.teacher_id, which is itself the
// cascade parent for student_marks, course_enrollments, course_outcomes, co_po_mappings
// and question_configs. A hard delete would therefore wipe out the academic history of
// every course the teacher ever owned, so deletion is represented as metadata instead:
//   deleted_at            — NULL means "live"; a timestamp means "deleted".
//   deleted_by            — the Admin account that performed it (no FK: the actor must
//                           survive the deletion and must never cascade away itself).
//   delete_reason         — free text captured in the confirmation dialog.
//   deleted_prior_active  — the is_active value to reinstate if the row is restored.
// All nullable/defaulted, so existing rows are untouched and every current read path
// keeps working unchanged.
registerMigration('phase1_teacher_soft_delete_columns', async () => {
  await ensureColumn('teachers', 'deleted_at', 'DATETIME DEFAULT NULL');
  await ensureColumn('teachers', 'deleted_by', 'INT DEFAULT NULL');
  await ensureColumn('teachers', 'delete_reason', 'VARCHAR(255) DEFAULT NULL');
  await ensureColumn('teachers', 'deleted_prior_active', 'TINYINT(1) DEFAULT NULL');
  await ensureIndex('teachers', 'ix_teachers_deleted_at', 'deleted_at');
});


module.exports = { ensureIndex, ensureUniqueIndex, ensureColumn };