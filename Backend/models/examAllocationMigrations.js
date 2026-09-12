// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Examination campaigns + per-class allocation.
//
// The Examination Cell allocates work with ONE spreadsheet whose grain is
// (examination × subject × paper set × CLASS): the same paper goes to CSE-A and
// CSE-B with different reviewers and different evaluators. The Phase 4 tables were
// keyed per-paper only, so this adds the missing class dimension plus the campaign
// object the sheet's `Exam` column resolves against.
//
// Same rules as every migration before it: additive, idempotent,
// information_schema-guarded, safe on a live populated database. The three
// UNIQUE-key swaps below always ADD the finer key before DROPping the coarser one,
// and each finer key is a strict superset of the coarser one's columns — so no
// existing row can violate it and no window exists with neither key in place.
// ─────────────────────────────────────────────────────────────────────────────
const pool = require('../config/db');
const { registerMigration } = require('../utils/migrationRunner');
const { ensureColumn, ensureIndex, ensureUniqueIndex } = require('./platformMigrations');

// Idempotent index drop — the half of a key swap that ensureUniqueIndex can't express.
const dropIndexIfExists = async (table, indexName) => {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, indexName],
  );
  if (rows.length === 0) return false;
  await pool.query(`ALTER TABLE ${table} DROP INDEX ${indexName}`);
  return true;
};

// Idempotent FK creation, matched by (table, column, referenced table) rather than by
// constraint name, so a re-run never adds a second constraint under an auto-generated name.
const ensureForeignKey = async (table, column, refTable, refColumn, onDelete) => {
  const [rows] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
       AND REFERENCED_TABLE_NAME = ? LIMIT 1`,
    [table, column, refTable],
  );
  if (rows.length > 0) return false;
  await pool.query(
    `ALTER TABLE ${table} ADD FOREIGN KEY (${column}) REFERENCES ${refTable}(${refColumn}) ON DELETE ${onDelete}`,
  );
  return true;
};

// The campaign object — "End Term Examination – December 2026". Question papers and
// every allocation row belong to one, which is what makes per-exam progress tracking
// ("147 rows, 143 valid") and a per-exam Examination Cell dashboard possible at all.
registerMigration('exam_examinations_table', async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS examinations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(50) DEFAULT NULL,
      exam_type ENUM('MTT', 'ETT') NOT NULL,
      academic_session_id INT DEFAULT NULL,
      start_date DATE DEFAULT NULL,
      end_date DATE DEFAULT NULL,
      status ENUM('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
      created_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES teachers(id) ON DELETE CASCADE,
      UNIQUE KEY uniq_examination_code (code)
    ) ENGINE=InnoDB;
  `);
});

// A paper now belongs to a campaign. Nullable: every paper uploaded before this
// migration keeps working exactly as it did, simply unattached to any examination.
registerMigration('exam_question_papers_examination_column', async () => {
  await ensureColumn('question_papers', 'examination_id', 'INT DEFAULT NULL');
  await ensureForeignKey('question_papers', 'examination_id', 'examinations', 'id', 'SET NULL');
  await ensureIndex('question_papers', 'ix_question_papers_examination', 'examination_id, course_id');
});

// Allocation grain: WHICH CLASS this responsibility is held for. NULL means
// paper-level — a reviewer checking the paper itself rather than a section's scripts —
// which is exactly what every pre-existing paper_assignments row means, so none of
// them change meaning.
registerMigration('exam_paper_assignments_class_column', async () => {
  await ensureColumn('paper_assignments', 'class_id', 'INT DEFAULT NULL');
  await ensureForeignKey('paper_assignments', 'class_id', 'academic_classes', 'id', 'CASCADE');
  await ensureUniqueIndex(
    'paper_assignments', 'uniq_paper_user_resp_class',
    'question_paper_id, user_id, responsibility, class_id',
  );
  await dropIndexIfExists('paper_assignments', 'unique_paper_user_responsibility');
  await ensureIndex('paper_assignments', 'ix_paper_assignments_class', 'class_id, responsibility');
});

// One marks lifecycle PER CLASS, not per paper — CSE-A and CSE-B sharing Set 1 must
// submit, verify and lock independently. NULL class_id preserves the pre-existing
// one-row-per-paper submissions created before this migration.
registerMigration('exam_marks_submissions_class_column', async () => {
  await ensureColumn('marks_submissions', 'class_id', 'INT DEFAULT NULL');
  await ensureForeignKey('marks_submissions', 'class_id', 'academic_classes', 'id', 'CASCADE');
  await ensureUniqueIndex('marks_submissions', 'uniq_paper_class_submission', 'question_paper_id, class_id');
  await dropIndexIfExists('marks_submissions', 'unique_paper_submission');
});

// Two paper sets for ONE course + exam_type could not coexist: question_configs was
// UNIQUE(course_id, exam_type, question_number), so Set 2's Q1 upserted straight over
// Set 1's Q1 and applyPaperQuestions then archived the remainder of Set 1. The
// generated paper_key (0 for manually-entered rows) widens that key by paper WITHOUT
// breaking the manual flow's ON DUPLICATE KEY upsert — every manual row shares
// paper_key = 0, so replaceQuestionConfigs still matches its own previous row.
//
// WHY VIRTUAL AND NOT STORED: MySQL 8.4 refuses
//   ALTER TABLE question_configs ADD COLUMN paper_key INT GENERATED ALWAYS AS
//     (COALESCE(question_paper_id, 0)) STORED
// with ER_CANNOT_ADD_FOREIGN ("Cannot add foreign key constraint"). A STORED generated
// column forces a full table rebuild, and the rebuild cannot re-establish
// fk_question_configs_paper on the very column the generated column derives from —
// the restriction is bidirectional (dropping the FK lets the column through, but then
// the FK can no longer be re-added). Turning foreign_key_checks off does not help.
// A VIRTUAL column needs no rebuild and coexists with the FK. It is still indexable,
// and the UNIQUE key below is materialised, so duplicate detection and
// ON DUPLICATE KEY UPDATE behave identically — verified against this schema.
registerMigration('exam_question_configs_paper_key', async () => {
  await ensureColumn(
    'question_configs', 'paper_key',
    'INT GENERATED ALWAYS AS (COALESCE(question_paper_id, 0)) VIRTUAL',
  );
  await ensureUniqueIndex(
    'question_configs', 'uniq_course_exam_qnum_paper',
    'course_id, exam_type, question_number, paper_key',
  );
  await dropIndexIfExists('question_configs', 'unique_course_exam_qnum');
});

// One row per uploaded allocation spreadsheet, so the Examination Cell can see who
// imported what, when, and which rows were rejected — the errors_json payload is the
// same per-row error list the preview showed before the import was confirmed.
registerMigration('exam_allocation_imports_table', async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS allocation_imports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      examination_id INT DEFAULT NULL,
      file_name VARCHAR(255) NOT NULL,
      total_rows INT NOT NULL DEFAULT 0,
      valid_rows INT NOT NULL DEFAULT 0,
      error_rows INT NOT NULL DEFAULT 0,
      imported_rows INT NOT NULL DEFAULT 0,
      assignments_created INT NOT NULL DEFAULT 0,
      errors_json LONGTEXT DEFAULT NULL,
      imported_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (examination_id) REFERENCES examinations(id) ON DELETE SET NULL,
      FOREIGN KEY (imported_by) REFERENCES teachers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
});

module.exports = { dropIndexIfExists, ensureForeignKey };
