const pool = require('../config/db');

const createQuestionPaper = async ({
  courseId, examType, paperSet, maxMarks, durationMinutes,
  filePath, fileName, fileMime, fileSize, uploadedBy, version = 1,
}) => {
  const [result] = await pool.query(
    `INSERT INTO question_papers
      (course_id, exam_type, paper_set, version, max_marks, duration_minutes,
       file_path, file_name, file_mime, file_size, uploaded_by, status, extraction_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPLOADED', 'pending')`,
    [courseId, examType, paperSet || null, version, maxMarks || null, durationMinutes || null,
      filePath, fileName, fileMime || null, fileSize || null, uploadedBy],
  );
  return getQuestionPaperById(result.insertId);
};

const getQuestionPaperById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM question_papers WHERE id = ?', [id]);
  return rows[0] || null;
};

// Records the extraction outcome only. The paper stays UPLOADED either way: a successful
// extraction produces a review draft (reviewRequired), and the paper becomes EXTRACTED
// only when the Examination Cell confirms that draft (confirmMapping).
const setExtractionResult = async (id, { status, confidence, error, reviewRequired = false }) => {
  await pool.query(
    `UPDATE question_papers
     SET extraction_status = ?, extraction_confidence = ?, extraction_error = ?, mapping_review_required = ?
     WHERE id = ?`,
    [status, confidence || null, error || null, reviewRequired ? 1 : 0, id],
  );
};

// True while an extracted draft exists that nobody has confirmed yet. Papers uploaded
// before the review step existed have mapping_review_required = 0 and are never blocked.
// A rejected paper is closed — it is replaced by a re-upload, never confirmed.
const isAwaitingConfirmation = (paper) => Number(paper?.mapping_review_required) === 1
  && !paper.mapping_confirmed_at && paper.status !== 'REJECTED';

const saveExtractionDraft = async (paperId, draft, userId = null) => {
  await pool.query(
    `INSERT INTO question_paper_drafts (question_paper_id, draft_json, revision, updated_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE draft_json = VALUES(draft_json), revision = VALUES(revision), updated_by = VALUES(updated_by)`,
    [paperId, JSON.stringify(draft), draft.revision, userId],
  );
};

const getExtractionDraft = async (paperId) => {
  const [[row]] = await pool.query('SELECT draft_json FROM question_paper_drafts WHERE question_paper_id = ?', [paperId]);
  return row ? JSON.parse(row.draft_json) : null;
};

// Optimistic concurrency: writes only if nobody saved since expectedRevision was read.
// Returns false when the draft moved on, so the caller can answer 409.
const updateExtractionDraft = async (paperId, draft, userId, expectedRevision) => {
  const [result] = await pool.query(
    `UPDATE question_paper_drafts SET draft_json = ?, revision = ?, updated_by = ?
     WHERE question_paper_id = ? AND revision = ?`,
    [JSON.stringify(draft), draft.revision, userId, paperId, expectedRevision],
  );
  return result.affectedRows > 0;
};

// Conditional on mapping_confirmed_at IS NULL so a double-submitted confirmation is a
// no-op the second time. Returns true when this call did the confirming.
const confirmMapping = async (id, userId, { maxMarks, durationMinutes }) => {
  const [result] = await pool.query(
    `UPDATE question_papers
     SET mapping_confirmed_at = CURRENT_TIMESTAMP, mapping_confirmed_by = ?,
         max_marks = COALESCE(?, max_marks), duration_minutes = COALESCE(?, duration_minutes),
         status = CASE WHEN status = 'UPLOADED' THEN 'EXTRACTED' ELSE status END
     WHERE id = ? AND mapping_confirmed_at IS NULL`,
    [userId, maxMarks ?? null, durationMinutes ?? null, id],
  );
  return result.affectedRows > 0;
};

const updatePaperStatus = async (id, status, extra = {}) => {
  const fields = ['status = ?'];
  const values = [status];
  if (extra.rejectionReason !== undefined) { fields.push('rejection_reason = ?'); values.push(extra.rejectionReason); }
  if (extra.supersededById !== undefined) { fields.push('superseded_by_id = ?'); values.push(extra.supersededById); }
  values.push(id);
  await pool.query(`UPDATE question_papers SET ${fields.join(', ')} WHERE id = ?`, values);
  return getQuestionPaperById(id);
};

const listQuestionPapers = async (filters = {}) => {
  const conditions = [];
  const params = [];
  if (filters.courseId) { conditions.push('qp.course_id = ?'); params.push(filters.courseId); }
  if (filters.examType) { conditions.push('qp.exam_type = ?'); params.push(filters.examType); }
  if (filters.status) { conditions.push('qp.status = ?'); params.push(filters.status); }
  if (filters.schoolId) { conditions.push('d.school_id = ?'); params.push(filters.schoolId); }
  if (filters.departmentId) { conditions.push('p.department_id = ?'); params.push(filters.departmentId); }
  if (filters.programId) { conditions.push('c.program_id = ?'); params.push(filters.programId); }
  if (filters.semester) { conditions.push('c.semester = ?'); params.push(filters.semester); }
  let joins = '';
  if (filters.assignedUserId) {
    joins = 'JOIN paper_assignments my_pa ON my_pa.question_paper_id = qp.id AND my_pa.user_id = ?';
    params.unshift(filters.assignedUserId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT DISTINCT qp.*, c.subject_name, c.course_code, c.semester, c.academic_year, c.program_id,
            p.name AS program_name, p.department_id, d.name AS department_name, d.school_id,
            s.name AS school_name,
            ms.status AS marks_status
     FROM question_papers qp
     JOIN courses c ON c.id = qp.course_id
     LEFT JOIN programs p ON p.id = c.program_id
     LEFT JOIN departments d ON d.id = p.department_id
     LEFT JOIN schools s ON s.id = d.school_id
     LEFT JOIN marks_submissions ms ON ms.question_paper_id = qp.id
     ${joins}
     ${where}
     ORDER BY qp.created_at DESC`,
    params,
  );
  return rows.map((row) => ({ ...row, awaiting_confirmation: isAwaitingConfirmation(row) }));
};

const getQuestionsForPaper = async (paperId) => {
  const [rows] = await pool.query(
    `SELECT qc.*, co.co_number FROM question_configs qc
     JOIN course_outcomes co ON co.id = qc.co_id
     WHERE qc.question_paper_id = ? AND qc.is_active = 1
     ORDER BY qc.question_number ASC`,
    [paperId],
  );
  return rows;
};

const getStats = async (scope = {}) => {
  const conditions = [];
  const params = [];
  if (scope.schoolId) { conditions.push('d.school_id = ?'); params.push(scope.schoolId); }
  if (scope.departmentId) { conditions.push('p.department_id = ?'); params.push(scope.departmentId); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [[counts]] = await pool.query(
    `SELECT
       COUNT(*) AS totalPapers,
       SUM(qp.status = 'ASSIGNED_FOR_REVIEW' OR qp.status = 'UNDER_REVIEW') AS pendingReview,
       SUM(qp.status = 'APPROVED') AS approved,
       SUM(qp.status = 'REJECTED') AS rejected,
       SUM(qp.mapping_review_required = 1 AND qp.mapping_confirmed_at IS NULL AND qp.status <> 'REJECTED') AS awaitingConfirmation
     FROM question_papers qp
     JOIN courses c ON c.id = qp.course_id
     LEFT JOIN programs p ON p.id = c.program_id
     LEFT JOIN departments d ON d.id = p.department_id
     ${where}`,
    params,
  );

  const [[marks]] = await pool.query(
    `SELECT
       SUM(ms.status IN ('NOT_STARTED','IN_PROGRESS')) AS marksPending,
       SUM(ms.status = 'SUBMITTED') AS marksSubmitted,
       SUM(ms.status = 'LOCKED') AS marksLocked,
       SUM(ms.status = 'COMPLETED') AS marksCompleted
     FROM marks_submissions ms
     JOIN question_papers qp ON qp.id = ms.question_paper_id
     JOIN courses c ON c.id = qp.course_id
     LEFT JOIN programs p ON p.id = c.program_id
     LEFT JOIN departments d ON d.id = p.department_id
     ${where}`,
    params,
  );

  const [[teachersAssigned]] = await pool.query(
    `SELECT COUNT(DISTINCT pa.user_id) AS teachersAssigned
     FROM paper_assignments pa
     JOIN question_papers qp ON qp.id = pa.question_paper_id
     JOIN courses c ON c.id = qp.course_id
     LEFT JOIN programs p ON p.id = c.program_id
     LEFT JOIN departments d ON d.id = p.department_id
     ${where}`,
    params,
  );

  return {
    totalExaminations: Number(counts.totalPapers) || 0,
    questionPapers: Number(counts.totalPapers) || 0,
    papersAwaitingConfirmation: Number(counts.awaitingConfirmation) || 0,
    papersPendingReview: Number(counts.pendingReview) || 0,
    papersApproved: Number(counts.approved) || 0,
    papersRejected: Number(counts.rejected) || 0,
    teachersAssigned: Number(teachersAssigned.teachersAssigned) || 0,
    marksPending: Number(marks.marksPending) || 0,
    marksSubmitted: Number(marks.marksSubmitted) || 0,
    marksLocked: Number(marks.marksLocked) || 0,
    completed: Number(marks.marksCompleted) || 0,
  };
};

module.exports = {
  createQuestionPaper,
  getQuestionPaperById,
  setExtractionResult,
  isAwaitingConfirmation,
  saveExtractionDraft,
  getExtractionDraft,
  updateExtractionDraft,
  confirmMapping,
  updatePaperStatus,
  listQuestionPapers,
  getQuestionsForPaper,
  getStats,
};
