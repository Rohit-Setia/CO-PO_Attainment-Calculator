const pool = require('../config/db');
const { getActiveOutcomes } = require('./courseOutcomeModel');

const MAX_QUESTIONS_PER_EXAM = 50;

const createQuestionConfigTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS question_configs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      course_id INT NOT NULL,
      exam_type ENUM('MTT', 'ETT') NOT NULL,
      question_number INT NOT NULL,
      co_id INT NOT NULL,
      max_marks DECIMAL(6,2) NOT NULL DEFAULT 10,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (co_id) REFERENCES course_outcomes(id) ON DELETE CASCADE,
      UNIQUE KEY unique_course_exam_qnum (course_id, exam_type, question_number)
    ) ENGINE=InnoDB;
  `);

  try {
    const [fks] = await pool.query(`
      SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'question_configs'
        AND REFERENCED_TABLE_NAME = 'course_outcomes' AND DELETE_RULE != 'CASCADE'
    `);
    for (const fk of fks) {
      await pool.query(`ALTER TABLE question_configs DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
      await pool.query('ALTER TABLE question_configs ADD FOREIGN KEY (co_id) REFERENCES course_outcomes(id) ON DELETE CASCADE');
    }
  } catch (err) {
    // Ignore if not present
  }
};

// One-time, idempotent: parses the legacy JSON blob (course_configs.questions_config_internal /
// _external — [{id, label, co: 'co3', maxMarks}]) into real rows, resolving each question's old
// `co: 'coN'` string to the matching course_outcomes.id for that course. Requires
// migrateLegacyCoursesToOutcomes() to have already run. Skipped per course+examType if rows
// already exist there.
const migrateLegacyQuestionConfigs = async () => {
  const [courses] = await pool.query('SELECT id FROM courses');

  for (const course of courses) {
    const outcomes = await getActiveOutcomes(course.id);
    if (outcomes.length === 0) continue; // nothing to resolve co strings against
    const outcomeByNumber = new Map(outcomes.map((o) => [o.co_number, o.id]));

    const [configRows] = await pool.query('SELECT * FROM course_configs WHERE course_id = ?', [course.id]);
    const config = configRows[0];
    if (!config) continue;

    for (const examType of ['MTT', 'ETT']) {
      const [existing] = await pool.query(
        'SELECT COUNT(*) as count FROM question_configs WHERE course_id = ? AND exam_type = ?',
        [course.id, examType],
      );
      if (existing[0].count > 0) continue; // already migrated

      const rawJson = examType === 'MTT' ? config.questions_config_internal : config.questions_config_external;
      if (!rawJson) continue;

      let questions;
      try {
        questions = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
      } catch {
        continue; // malformed legacy JSON — nothing safe to migrate
      }
      if (!Array.isArray(questions)) continue;

      for (const q of questions) {
        const coNumber = parseInt(String(q.co).replace(/[^0-9]/g, ''), 10);
        const coId = outcomeByNumber.get(coNumber);
        if (!coId) continue; // legacy question pointed at a CO that no longer resolves — skip, don't guess
        await pool.query(
          `INSERT IGNORE INTO question_configs (course_id, exam_type, question_number, co_id, max_marks)
           VALUES (?, ?, ?, ?, ?)`,
          [course.id, examType, q.id, coId, q.maxMarks || 10],
        );
      }
    }
  }
};

const getQuestionConfigs = async (courseId, examType) => {
  const [rows] = await pool.query(
    `SELECT qc.*, co.co_number FROM question_configs qc
     JOIN course_outcomes co ON co.id = qc.co_id
     WHERE qc.course_id = ? AND qc.exam_type = ? AND qc.is_active = 1
     ORDER BY qc.question_number ASC`,
    [courseId, examType],
  );
  return rows;
};

// Teacher submits the full desired question list for one exam component. This upserts by
// (course_id, exam_type, question_number) so editing a question's CO/max marks keeps the same
// question_config_id — and therefore keeps every existing student_question_marks row linked.
// Any previously-active question_number NOT present in the new list is archived (is_active=0),
// never hard-deleted, so historical marks entered against it are preserved.
const replaceQuestionConfigs = async (courseId, examType, questions) => {
  if (questions.length > MAX_QUESTIONS_PER_EXAM) {
    const err = new Error(`A single exam component cannot have more than ${MAX_QUESTIONS_PER_EXAM} questions.`);
    err.status = 400;
    throw err;
  }

  const submittedNumbers = questions.map((q) => q.question_number);

  for (const q of questions) {
    await pool.query(
      `INSERT INTO question_configs (course_id, exam_type, question_number, co_id, max_marks, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE co_id = VALUES(co_id), max_marks = VALUES(max_marks), is_active = 1`,
      [courseId, examType, q.question_number, q.co_id, q.max_marks],
    );
  }

  if (submittedNumbers.length > 0) {
    const placeholders = submittedNumbers.map(() => '?').join(', ');
    await pool.query(
      `UPDATE question_configs SET is_active = 0
       WHERE course_id = ? AND exam_type = ? AND question_number NOT IN (${placeholders})`,
      [courseId, examType, ...submittedNumbers],
    );
  } else {
    await pool.query(
      'UPDATE question_configs SET is_active = 0 WHERE course_id = ? AND exam_type = ?',
      [courseId, examType],
    );
  }
};

module.exports = {
  MAX_QUESTIONS_PER_EXAM,
  createQuestionConfigTable,
  migrateLegacyQuestionConfigs,
  getQuestionConfigs,
  replaceQuestionConfigs,
};
