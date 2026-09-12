const pool = require('../config/db');

// One marks lifecycle per (question paper × CLASS). CSE-A and CSE-B may share Set 1
// but must submit, be verified and be locked independently, so every lookup below is
// keyed on both. class_id NULL is the pre-per-class grain ("this paper as a whole")
// and is still reachable via `<=>`, so submissions created before the migration —
// and papers with no class allocated at all — keep working unchanged.

const createForPaper = async (questionPaperId, courseId, classId = null) => {
  const cls = classId || null;
  const [existing] = await pool.query(
    'SELECT id FROM marks_submissions WHERE question_paper_id = ? AND class_id <=> ?',
    [questionPaperId, cls],
  );
  if (existing.length > 0) {
    await pool.query('UPDATE marks_submissions SET course_id = ? WHERE id = ?', [courseId, existing[0].id]);
  } else {
    await pool.query(
      `INSERT INTO marks_submissions (question_paper_id, course_id, class_id, status)
       VALUES (?, ?, ?, 'NOT_STARTED')`,
      [questionPaperId, courseId, cls],
    );
  }
  return getByPaperId(questionPaperId, cls);
};

// Creates one submission row per allocated class. Falls back to a single paper-level
// row when the paper has no class-scoped evaluator — which is exactly what approval
// did before per-class allocation existed.
const createForPaperClasses = async (questionPaperId, courseId, classIds = []) => {
  if (classIds.length === 0) return [await createForPaper(questionPaperId, courseId, null)];
  const created = [];
  for (const classId of classIds) {
    // eslint-disable-next-line no-await-in-loop
    created.push(await createForPaper(questionPaperId, courseId, classId));
  }
  return created;
};

const getByPaperId = async (questionPaperId, classId = null) => {
  const [rows] = await pool.query(
    'SELECT * FROM marks_submissions WHERE question_paper_id = ? AND class_id <=> ?',
    [questionPaperId, classId || null],
  );
  return rows[0] || null;
};

const listByPaperId = async (questionPaperId) => {
  const [rows] = await pool.query(
    `SELECT ms.*, ac.section,
            CONCAT_WS(' • ', COALESCE(prog.code, prog.name), CONCAT('Sem ', ac.semester), NULLIF(ac.section, '')) AS class_label,
            t.name AS submitted_by_name
     FROM marks_submissions ms
     LEFT JOIN academic_classes ac ON ac.id = ms.class_id
     LEFT JOIN programs prog ON prog.id = ac.program_id
     LEFT JOIN teachers t ON t.id = ms.submitted_by
     WHERE ms.question_paper_id = ?
     ORDER BY class_label ASC`,
    [questionPaperId],
  );
  return rows;
};

// Editing gate for the existing POST /courses/:id/marks endpoint, which predates
// per-class submissions and therefore cannot always name the section it is writing.
//   * with a classId → only that class's submission can freeze the write, so a locked
//     CSE-A never blocks CSE-B;
//   * without one → ANY locked submission on the paper freezes it. That is the
//     conservative reading, and it is what preserves the pre-per-class guarantee: the
//     caller can't prove which section these marks belong to, so it must not be able
//     to write past a lock by omitting the parameter.
const findBlockingSubmission = async (questionPaperId, classId = undefined) => {
  if (classId !== undefined && classId !== null && classId !== '') {
    const submission = await getByPaperId(questionPaperId, classId);
    return isLockedForEditing(submission) ? submission : null;
  }
  const rows = await listByPaperId(questionPaperId);
  return rows.find(isLockedForEditing) || null;
};

const markInProgress = async (questionPaperId, classId = null) => {
  await pool.query(
    `UPDATE marks_submissions SET status = 'IN_PROGRESS'
     WHERE question_paper_id = ? AND class_id <=> ? AND status = 'NOT_STARTED'`,
    [questionPaperId, classId || null],
  );
};

const submit = async (questionPaperId, userId, classId = null) => {
  await pool.query(
    `UPDATE marks_submissions SET status = 'SUBMITTED', submitted_by = ?, submitted_at = CURRENT_TIMESTAMP
     WHERE question_paper_id = ? AND class_id <=> ?`,
    [userId, questionPaperId, classId || null],
  );
  return getByPaperId(questionPaperId, classId);
};

const lock = async (questionPaperId, classId = null) => {
  await pool.query(
    `UPDATE marks_submissions SET status = 'LOCKED', locked_at = CURRENT_TIMESTAMP
     WHERE question_paper_id = ? AND class_id <=> ?`,
    [questionPaperId, classId || null],
  );
  return getByPaperId(questionPaperId, classId);
};

const reopen = async (questionPaperId, userId, reason, classId = null) => {
  await pool.query(
    `UPDATE marks_submissions SET status = 'CORRECTION_REQUIRED', reopened_by = ?, reopen_reason = ?
     WHERE question_paper_id = ? AND class_id <=> ?`,
    [userId, reason, questionPaperId, classId || null],
  );
  return getByPaperId(questionPaperId, classId);
};

const isLockedForEditing = (submission) => Boolean(submission)
  && ['SUBMITTED', 'UNDER_VERIFICATION', 'APPROVED', 'LOCKED', 'COMPLETED'].includes(submission.status);

module.exports = {
  createForPaper,
  createForPaperClasses,
  getByPaperId,
  listByPaperId,
  findBlockingSubmission,
  markInProgress,
  submit,
  lock,
  reopen,
  isLockedForEditing,
};
