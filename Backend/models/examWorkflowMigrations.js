// ─────────────────────────────────────────────────────────────────────────────
// Examination Cell / Question Paper workflow — versioned platform migrations.
// Follows the exact convention established in platformMigrations.js: additive only,
// gated by schema_migrations, information_schema-guarded so it is safe on a live,
// populated database.
// ─────────────────────────────────────────────────────────────────────────────
const pool = require('../config/db');
const { registerMigration } = require('../utils/migrationRunner');
const { ensureColumn } = require('./platformMigrations');

registerMigration('exam_question_papers_table', async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS question_papers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      course_id INT NOT NULL,
      exam_type ENUM('MTT', 'ETT') NOT NULL,
      paper_set VARCHAR(50) DEFAULT NULL,
      version INT NOT NULL DEFAULT 1,
      max_marks DECIMAL(6,2) DEFAULT NULL,
      duration_minutes INT DEFAULT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_mime VARCHAR(150) DEFAULT NULL,
      file_size INT DEFAULT NULL,
      extraction_status ENUM('pending','extracted','failed') NOT NULL DEFAULT 'pending',
      extraction_confidence ENUM('high','low') DEFAULT NULL,
      extraction_error TEXT DEFAULT NULL,
      status ENUM('UPLOADED','EXTRACTED','ASSIGNED_FOR_REVIEW','UNDER_REVIEW','VERIFIED','APPROVED','REJECTED')
        NOT NULL DEFAULT 'UPLOADED',
      rejection_reason TEXT DEFAULT NULL,
      uploaded_by INT NOT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      superseded_by_id INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES teachers(id) ON DELETE CASCADE,
      FOREIGN KEY (superseded_by_id) REFERENCES question_papers(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;
  `);
});

registerMigration('exam_question_configs_paper_columns', async () => {
  await ensureColumn('question_configs', 'question_paper_id', 'INT DEFAULT NULL');
  await ensureColumn('question_configs', 'question_text', 'TEXT DEFAULT NULL');
  await ensureColumn('question_configs', 'section', 'VARCHAR(10) DEFAULT NULL');
  await ensureColumn('question_configs', 'rbt_level', 'VARCHAR(30) DEFAULT NULL');
  await ensureColumn('question_configs', 'choice_group', 'VARCHAR(20) DEFAULT NULL');

  const [fks] = await pool.query(`
    SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'question_configs'
      AND REFERENCED_TABLE_NAME = 'question_papers'
  `);
  if (fks.length === 0) {
    await pool.query(`
      ALTER TABLE question_configs
      ADD CONSTRAINT fk_question_configs_paper
      FOREIGN KEY (question_paper_id) REFERENCES question_papers(id) ON DELETE SET NULL
    `);
  }
});

registerMigration('exam_paper_assignments_table', async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paper_assignments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      question_paper_id INT NOT NULL,
      course_id INT NOT NULL,
      user_id INT NOT NULL,
      responsibility ENUM('PAPER_REVIEWER','PAPER_VERIFIER','PAPER_APPROVER','MARKS_ENTRY','EVALUATOR','MODERATOR') NOT NULL,
      assigned_by INT NOT NULL,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deadline DATETIME DEFAULT NULL,
      status ENUM('PENDING','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'PENDING',
      FOREIGN KEY (question_paper_id) REFERENCES question_papers(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES teachers(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_by) REFERENCES teachers(id) ON DELETE CASCADE,
      UNIQUE KEY unique_paper_user_responsibility (question_paper_id, user_id, responsibility)
    ) ENGINE=InnoDB;
  `);
});

registerMigration('exam_marks_submissions_table', async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marks_submissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      question_paper_id INT NOT NULL,
      course_id INT NOT NULL,
      status ENUM('NOT_STARTED','IN_PROGRESS','SUBMITTED','UNDER_VERIFICATION','CORRECTION_REQUIRED','APPROVED','LOCKED','COMPLETED')
        NOT NULL DEFAULT 'NOT_STARTED',
      submitted_by INT DEFAULT NULL,
      submitted_at TIMESTAMP DEFAULT NULL,
      locked_at TIMESTAMP DEFAULT NULL,
      reopened_by INT DEFAULT NULL,
      reopen_reason TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (question_paper_id) REFERENCES question_papers(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (submitted_by) REFERENCES teachers(id) ON DELETE SET NULL,
      FOREIGN KEY (reopened_by) REFERENCES teachers(id) ON DELETE SET NULL,
      UNIQUE KEY unique_paper_submission (question_paper_id)
    ) ENGINE=InnoDB;
  `);
});

// Auto-Mapping Review: extraction now produces an editable draft (question_paper_drafts)
// that the Examination Cell confirms before anything is written to question_configs.
// mapping_review_required marks papers that went through this flow, so papers uploaded
// before it (review_required = 0) are never treated as awaiting confirmation. The
// *_source columns record where each published CO/RBT/marks value came from.
registerMigration('exam_paper_auto_mapping_review', async () => {
  await ensureColumn('question_papers', 'mapping_review_required', 'TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('question_papers', 'mapping_confirmed_at', 'TIMESTAMP NULL DEFAULT NULL');
  await ensureColumn('question_papers', 'mapping_confirmed_by', 'INT DEFAULT NULL');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS question_paper_drafts (
      question_paper_id INT PRIMARY KEY,
      draft_json LONGTEXT NOT NULL,
      revision INT NOT NULL DEFAULT 1,
      updated_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (question_paper_id) REFERENCES question_papers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
  await ensureColumn('question_configs', 'question_label', 'VARCHAR(20) DEFAULT NULL');
  await ensureColumn('question_configs', 'co_source', 'VARCHAR(20) DEFAULT NULL');
  await ensureColumn('question_configs', 'rbt_source', 'VARCHAR(20) DEFAULT NULL');
  await ensureColumn('question_configs', 'marks_source', 'VARCHAR(20) DEFAULT NULL');
});

registerMigration('exam_notifications_table', async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT DEFAULT NULL,
      related_entity_type VARCHAR(50) DEFAULT NULL,
      related_entity_id INT DEFAULT NULL,
      is_read BOOLEAN NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES teachers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
});
