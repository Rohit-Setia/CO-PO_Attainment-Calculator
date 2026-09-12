const pool = require('../config/db');
const { getActiveOutcomes, findOrCreateOutcomeByNumber, setOutcomeMaxForExamType } = require('./courseOutcomeModel');

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

// questionPaperId narrows the result to ONE paper set. A course+examType may now carry
// more than one active set (Set 1 for CSE-A, Set 2 for CSE-B), in which case question
// numbers repeat across sets and the caller MUST name the paper. Omitting it returns
// every active row for the course+examType — identical to the previous behaviour, and
// still correct for the single-paper courses that make up everything existing.
const getQuestionConfigs = async (courseId, examType, questionPaperId = undefined) => {
  const params = [courseId, examType];
  let paperClause = '';
  if (questionPaperId !== undefined && questionPaperId !== null && questionPaperId !== '') {
    paperClause = ' AND qc.question_paper_id = ?';
    params.push(questionPaperId);
  }
  const [rows] = await pool.query(
    `SELECT qc.*, co.co_number FROM question_configs qc
     JOIN course_outcomes co ON co.id = qc.co_id
     WHERE qc.course_id = ? AND qc.exam_type = ? AND qc.is_active = 1${paperClause}
     ORDER BY qc.question_number ASC`,
    params,
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

// Writes the question paper's own extracted/approved rows as the full active set for this
// course+examType — the paper is authoritative, so (unlike replaceQuestionConfigs) this does
// NOT validate against a pre-existing CO max; the caller (examination approval flow) is
// responsible for reconciling course_outcomes.max_internal/external from these same rows
// beforehand. CO numbers are resolved/created via findOrCreateOutcomeByNumber so a paper can
// reference a CO the course has never configured before. Archives (never deletes) any
// previously-active row not in the new set, same as replaceQuestionConfigs, so historical
// student_question_marks links are preserved when a paper is revised.
const applyPaperQuestions = async (courseId, examType, questionPaperId, questions) => {
  const submittedNumbers = [];
  for (const q of questions) {
    const outcome = await findOrCreateOutcomeByNumber(courseId, q.coNumber);
    submittedNumbers.push(q.questionNumber);
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO question_configs
        (course_id, exam_type, question_number, co_id, max_marks, is_active,
         question_paper_id, question_text, section, rbt_level, choice_group,
         question_label, co_source, rbt_source, marks_source)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE co_id = VALUES(co_id), max_marks = VALUES(max_marks), is_active = 1,
         question_paper_id = VALUES(question_paper_id), question_text = VALUES(question_text),
         section = VALUES(section), rbt_level = VALUES(rbt_level), choice_group = VALUES(choice_group),
         question_label = VALUES(question_label), co_source = VALUES(co_source),
         rbt_source = VALUES(rbt_source), marks_source = VALUES(marks_source)`,
      [courseId, examType, q.questionNumber, outcome.id, q.maxMarks,
        questionPaperId, q.questionText || null, q.section || null, q.rbtLevel || null, q.choiceGroup || null,
        q.questionLabel || null, q.coSource || null, q.rbtSource || null, q.marksSource || null],
    );
  }

  // Archive only what this paper supersedes: its OWN rows that dropped out of the new
  // set, plus any manually-entered rows for the course+examType (the approved paper
  // replaces hand-typed config, which is the pre-existing behaviour). Rows belonging to
  // a DIFFERENT paper are left alone — without this clause, uploading Set 2 for the same
  // course archived the whole of Set 1 and took CSE-A's CO mapping with it.
  if (submittedNumbers.length > 0) {
    const placeholders = submittedNumbers.map(() => '?').join(', ');
    await pool.query(
      `UPDATE question_configs SET is_active = 0
       WHERE course_id = ? AND exam_type = ?
         AND (question_paper_id IS NULL
              OR (question_paper_id = ? AND question_number NOT IN (${placeholders})))`,
      [courseId, examType, questionPaperId, ...submittedNumbers],
    );
  }

  // Reconcile each referenced CO's max for this exam component to the sum of its question
  // marks in THIS paper — the approved paper is authoritative, so the CO's configured max
  // must match what the paper actually offers, not a stale/manual prior value.
  const totalsByCoNumber = new Map();
  for (const q of questions) {
    totalsByCoNumber.set(q.coNumber, (totalsByCoNumber.get(q.coNumber) || 0) + Number(q.maxMarks));
  }
  for (const [coNumber, total] of totalsByCoNumber.entries()) {
    const outcome = await findOrCreateOutcomeByNumber(courseId, coNumber);
    // eslint-disable-next-line no-await-in-loop
    await setOutcomeMaxForExamType(outcome.id, examType, total);
  }
};

// True once this course+examType's active questions are sourced from an APPROVED question
// paper — at that point the Examination Cell's paper-review workflow is the sole authority
// over CO/max-marks/question-numbers, and the generic manual config endpoint must refuse to
// touch them (a plain Teacher gets course access via user_course_assignments purely to enter
// marks — see examinationRoutes.js's assignUserToCourse('Teacher') call — and must not be able
// to rewrite the paper's own question configuration through that access).
const isLockedByApprovedPaper = async (courseId, examType) => {
  const [[row]] = await pool.query(
    `SELECT qp.id FROM question_configs qc
     JOIN question_papers qp ON qp.id = qc.question_paper_id
     WHERE qc.course_id = ? AND qc.exam_type = ? AND qc.is_active = 1 AND qp.status = 'APPROVED'
     LIMIT 1`,
    [courseId, examType],
  );
  return !!row;
};

// Reviewer correction of a single already-extracted row (CO / RBT / text / marks). Distinct
// from replaceQuestionConfigs (which expects the teacher's full manual list every call) —
// paper review corrects one row at a time and must audit the before/after values, so the
// caller reads the row first, applies this, and logs the diff itself.
const updateQuestionConfigFields = async (id, { coNumber, maxMarks, questionText, rbtLevel }) => {
  const [[existing]] = await pool.query('SELECT * FROM question_configs WHERE id = ?', [id]);
  if (!existing) return null;

  const fields = [];
  const values = [];
  // A changed value is now the reviewer's, whatever the paper or a suggestion said.
  if (coNumber !== undefined) {
    const outcome = await findOrCreateOutcomeByNumber(existing.course_id, coNumber);
    fields.push('co_id = ?'); values.push(outcome.id);
    if (outcome.id !== existing.co_id) fields.push("co_source = 'manual'");
  }
  if (maxMarks !== undefined) {
    fields.push('max_marks = ?'); values.push(maxMarks);
    if (Number(maxMarks) !== Number(existing.max_marks)) fields.push("marks_source = 'manual'");
  }
  if (questionText !== undefined) { fields.push('question_text = ?'); values.push(questionText); }
  if (rbtLevel !== undefined) {
    fields.push('rbt_level = ?'); values.push(rbtLevel);
    if (rbtLevel !== existing.rbt_level) fields.push("rbt_source = 'manual'");
  }
  if (fields.length === 0) return existing;

  values.push(id);
  await pool.query(`UPDATE question_configs SET ${fields.join(', ')} WHERE id = ?`, values);
  const [[updated]] = await pool.query('SELECT * FROM question_configs WHERE id = ?', [id]);
  return updated;
};

module.exports = {
  MAX_QUESTIONS_PER_EXAM,
  createQuestionConfigTable,
  migrateLegacyQuestionConfigs,
  getQuestionConfigs,
  replaceQuestionConfigs,
  applyPaperQuestions,
  updateQuestionConfigFields,
  isLockedByApprovedPaper,
};
