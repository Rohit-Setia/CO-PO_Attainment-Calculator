// ─────────────────────────────────────────────────────────────────────────────
// Examination campaigns — "End Term Examination – December 2026".
//
// One row groups every question paper and every allocation belonging to a single
// examination, so the Examination Cell can track and report per exam instead of
// per individual paper. The allocation spreadsheet's `Exam` column resolves here
// (by code first, then by name) — see services/allocationImportService.js.
// ─────────────────────────────────────────────────────────────────────────────
const pool = require('../config/db');

const SELECT_WITH_COUNTS = `
  SELECT e.*, sess.name AS session_name,
         (SELECT COUNT(*) FROM question_papers qp WHERE qp.examination_id = e.id) AS paper_count,
         (SELECT COUNT(*) FROM paper_assignments pa
            JOIN question_papers qp2 ON qp2.id = pa.question_paper_id
           WHERE qp2.examination_id = e.id) AS assignment_count
  FROM examinations e
  LEFT JOIN academic_sessions sess ON sess.id = e.academic_session_id`;

const listExaminations = async ({ status, examType, academicSessionId } = {}) => {
  const where = [];
  const params = [];
  if (status) { where.push('e.status = ?'); params.push(status); }
  if (examType) { where.push('e.exam_type = ?'); params.push(examType); }
  if (academicSessionId) { where.push('e.academic_session_id = ?'); params.push(academicSessionId); }
  const [rows] = await pool.query(
    `${SELECT_WITH_COUNTS} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.created_at DESC`,
    params,
  );
  return rows;
};

const getExaminationById = async (id) => {
  const [rows] = await pool.query(`${SELECT_WITH_COUNTS} WHERE e.id = ?`, [id]);
  return rows[0] || null;
};

// Resolves the spreadsheet's free-text `Exam` cell. Code is the exact-match key the
// Examination Cell is told to use in the template; name is accepted as a fallback so a
// sheet typed by hand ("End Term Examination December 2026") still resolves.
const findExaminationByCodeOrName = async (text) => {
  if (!text) return null;
  const [rows] = await pool.query(
    `SELECT * FROM examinations
     WHERE LOWER(TRIM(code)) = LOWER(TRIM(?)) OR LOWER(TRIM(name)) = LOWER(TRIM(?))
     ORDER BY (LOWER(TRIM(code)) = LOWER(TRIM(?))) DESC LIMIT 1`,
    [text, text, text],
  );
  return rows[0] || null;
};

const createExamination = async ({
  name, code, examType, academicSessionId, startDate, endDate, status, createdBy,
}) => {
  const [result] = await pool.query(
    `INSERT INTO examinations (name, code, exam_type, academic_session_id, start_date, end_date, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, code || null, examType, academicSessionId || null, startDate || null, endDate || null,
      status || 'DRAFT', createdBy],
  );
  return getExaminationById(result.insertId);
};

const UPDATABLE = {
  name: 'name', code: 'code', examType: 'exam_type', academicSessionId: 'academic_session_id',
  startDate: 'start_date', endDate: 'end_date', status: 'status',
};

const updateExamination = async (id, patch) => {
  const fields = [];
  const values = [];
  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (patch[key] !== undefined) { fields.push(`${column} = ?`); values.push(patch[key] || null); }
  }
  if (fields.length === 0) return getExaminationById(id);
  values.push(id);
  await pool.query(`UPDATE examinations SET ${fields.join(', ')} WHERE id = ?`, values);
  return getExaminationById(id);
};

// Per-examination progress for the Examination Cell dashboard: how far every paper in
// the campaign has moved through review, and how far every allocated class has moved
// through marks entry. One query per grain rather than one per paper.
const getExaminationProgress = async (examinationId) => {
  const [[papers]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status IN ('UPLOADED','EXTRACTED')) AS unassigned,
            SUM(status IN ('ASSIGNED_FOR_REVIEW','UNDER_REVIEW')) AS in_review,
            SUM(status = 'VERIFIED') AS verified,
            SUM(status = 'APPROVED') AS approved,
            SUM(status = 'REJECTED') AS rejected
     FROM question_papers WHERE examination_id = ?`,
    [examinationId],
  );
  const [[marks]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(ms.status IN ('NOT_STARTED','IN_PROGRESS')) AS pending,
            SUM(ms.status = 'SUBMITTED') AS submitted,
            SUM(ms.status = 'CORRECTION_REQUIRED') AS correction_required,
            SUM(ms.status IN ('APPROVED','LOCKED','COMPLETED')) AS finalized
     FROM marks_submissions ms
     JOIN question_papers qp ON qp.id = ms.question_paper_id
     WHERE qp.examination_id = ?`,
    [examinationId],
  );
  return { papers, marks };
};

module.exports = {
  listExaminations,
  getExaminationById,
  findExaminationByCodeOrName,
  createExamination,
  updateExamination,
  getExaminationProgress,
};
