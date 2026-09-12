const pool = require('../config/db');

// Allocation grain is (question paper × user × responsibility × CLASS). class_id NULL
// means the responsibility is held over the paper itself rather than one section's
// scripts — that is what a PAPER_REVIEWER usually is, and what every assignment
// created before the per-class migration means.
//
// The upsert below is a NULL-safe find-then-write rather than ON DUPLICATE KEY,
// because MySQL treats NULLs as distinct in a UNIQUE key: a paper-level (class_id
// NULL) row would be inserted again on every re-import instead of matching itself.
// `<=>` is the NULL-safe equality operator, so one code path handles both grains.

// Class label used everywhere a class is shown ("B.Tech CSE • Sem 2 • CSE-A").
const CLASS_LABEL_SQL = `
  CONCAT_WS(' • ',
    COALESCE(prog.code, prog.name),
    CONCAT('Sem ', ac.semester),
    NULLIF(ac.section, '')
  )`;

const CLASS_JOIN_SQL = `
  LEFT JOIN academic_classes ac ON ac.id = pa.class_id
  LEFT JOIN programs prog ON prog.id = ac.program_id`;

const assignResponsibility = async ({
  questionPaperId, courseId, userId, responsibility, assignedBy, deadline, classId,
}) => {
  const cls = classId || null;
  const [existing] = await pool.query(
    `SELECT id FROM paper_assignments
     WHERE question_paper_id = ? AND user_id = ? AND responsibility = ? AND class_id <=> ?
     LIMIT 1`,
    [questionPaperId, userId, responsibility, cls],
  );

  if (existing.length > 0) {
    await pool.query(
      `UPDATE paper_assignments
       SET deadline = ?, assigned_by = ?, course_id = ?, assigned_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [deadline || null, assignedBy, courseId, existing[0].id],
    );
    const [rows] = await pool.query('SELECT * FROM paper_assignments WHERE id = ?', [existing[0].id]);
    return { assignment: rows[0], created: false };
  }

  const [result] = await pool.query(
    `INSERT INTO paper_assignments
       (question_paper_id, course_id, user_id, responsibility, assigned_by, deadline, class_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [questionPaperId, courseId, userId, responsibility, assignedBy, deadline || null, cls],
  );
  const [rows] = await pool.query('SELECT * FROM paper_assignments WHERE id = ?', [result.insertId]);
  return { assignment: rows[0], created: true };
};

const removeAssignment = async (assignmentId) => {
  const [result] = await pool.query('DELETE FROM paper_assignments WHERE id = ?', [assignmentId]);
  return result.affectedRows > 0;
};

const getAssignmentsForPaper = async (questionPaperId) => {
  const [rows] = await pool.query(
    `SELECT pa.*, t.name, t.email, t.role AS system_role,
            ac.section, ac.semester AS class_semester, ${CLASS_LABEL_SQL} AS class_label
     FROM paper_assignments pa
     JOIN teachers t ON t.id = pa.user_id
     ${CLASS_JOIN_SQL}
     WHERE pa.question_paper_id = ?
     ORDER BY pa.responsibility ASC, class_label ASC`,
    [questionPaperId],
  );
  return rows;
};

const findAssignment = async (questionPaperId, userId, responsibility, classId = null) => {
  const [rows] = await pool.query(
    `SELECT * FROM paper_assignments
     WHERE question_paper_id = ? AND user_id = ? AND responsibility = ? AND class_id <=> ?`,
    [questionPaperId, userId, responsibility, classId],
  );
  return rows[0] || null;
};

// Holding a responsibility on ANY class of the paper is enough to act on the paper
// itself (open it, review a question). Class-scoped actions — marks entry, submit —
// additionally check getClassesForUserOnPaper below.
const isAssignedAnyOf = async (questionPaperId, userId, responsibilities) => {
  const placeholders = responsibilities.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT id FROM paper_assignments
     WHERE question_paper_id = ? AND user_id = ? AND responsibility IN (${placeholders}) LIMIT 1`,
    [questionPaperId, userId, ...responsibilities],
  );
  return rows.length > 0;
};

// Which classes this user may enter/submit marks for on this paper. A paper-level
// (class_id NULL) MARKS_ENTRY assignment means "every class on this paper", which is
// how pre-per-class assignments keep working.
const getClassesForUserOnPaper = async (questionPaperId, userId, responsibilities) => {
  const placeholders = responsibilities.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT class_id FROM paper_assignments
     WHERE question_paper_id = ? AND user_id = ? AND responsibility IN (${placeholders})`,
    [questionPaperId, userId, ...responsibilities],
  );
  const classIds = rows.map((r) => r.class_id);
  return { allClasses: classIds.includes(null), classIds: classIds.filter((c) => c !== null) };
};

// Every distinct class allocated on a paper — the set marks_submissions rows are
// created for when the paper is approved.
const getAllocatedClassesForPaper = async (questionPaperId) => {
  const [rows] = await pool.query(
    `SELECT DISTINCT pa.class_id, ${CLASS_LABEL_SQL} AS class_label
     FROM paper_assignments pa
     ${CLASS_JOIN_SQL}
     WHERE pa.question_paper_id = ? AND pa.class_id IS NOT NULL
       AND pa.responsibility IN ('MARKS_ENTRY', 'EVALUATOR')`,
    [questionPaperId],
  );
  return rows;
};

// Every responsibility assigned on a paper, so "is there a separate approver?" can be decided.
const countDistinctReviewers = async (questionPaperId) => {
  const [rows] = await pool.query(
    "SELECT COUNT(DISTINCT user_id) AS c FROM paper_assignments WHERE question_paper_id = ? AND responsibility IN ('PAPER_REVIEWER','PAPER_APPROVER')",
    [questionPaperId],
  );
  return Number(rows[0].c);
};

// "My Assigned Examinations" — every responsibility this user holds, across all papers.
// The marks_submissions join is NULL-safe on class so a class-scoped evaluator sees
// their own class's marks status, not another section's.
const getAssignmentsForUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT pa.*, qp.status AS paper_status, qp.exam_type, qp.paper_set, qp.course_id,
            c.subject_name, c.course_code, c.semester, c.academic_year,
            ac.section, ${CLASS_LABEL_SQL} AS class_label,
            e.id AS examination_id, e.name AS examination_name,
            ms.status AS marks_status
     FROM paper_assignments pa
     JOIN question_papers qp ON qp.id = pa.question_paper_id
     JOIN courses c ON c.id = qp.course_id
     ${CLASS_JOIN_SQL}
     LEFT JOIN examinations e ON e.id = qp.examination_id
     LEFT JOIN marks_submissions ms
       ON ms.question_paper_id = qp.id AND ms.class_id <=> pa.class_id
     WHERE pa.user_id = ?
     ORDER BY pa.assigned_at DESC`,
    [userId],
  );
  return rows;
};

module.exports = {
  assignResponsibility,
  removeAssignment,
  getAssignmentsForPaper,
  findAssignment,
  isAssignedAnyOf,
  getClassesForUserOnPaper,
  getAllocatedClassesForPaper,
  countDistinctReviewers,
  getAssignmentsForUser,
};
