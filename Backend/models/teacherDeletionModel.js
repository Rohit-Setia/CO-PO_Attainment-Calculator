// ─────────────────────────────────────────────────────────────────────────────
// Teacher Directory — safe (non-destructive) deletion support.
//
// WHY THIS IS A SOFT DELETE AND NOTHING ELSE
// The live schema has 11 foreign keys pointing at `teachers(id)` and 9 of them are
// `ON DELETE CASCADE`:
//
//   courses.teacher_id                 CASCADE   ← the killer
//   question_papers.uploaded_by        CASCADE
//   examinations.created_by            CASCADE
//   admin_audit_log.actor_user_id      CASCADE   ← destroys the audit trail
//   paper_assignments.user_id          CASCADE
//   paper_assignments.assigned_by      CASCADE
//   user_course_assignments.user_id    CASCADE
//   notifications.user_id              CASCADE
//   password_reset_tokens.user_id      CASCADE
//   marks_submissions.submitted_by     SET NULL
//   marks_submissions.reopened_by      SET NULL
//
// `courses` is itself a cascade parent for student_marks, course_enrollments,
// course_outcomes, co_po_mappings, co_descriptions, course_configs,
// question_configs and marks_submissions. A single `DELETE FROM teachers WHERE id=?`
// would therefore erase every course that teacher ever owned together with all of
// the student marks and CO attainment history hanging off them — silently and
// irrecoverably.
//
// So deletion here means: mark the account deleted, deactivate it (login is already
// blocked for `is_active = 0` in authController.login), drop it out of the active
// directory, and invalidate any outstanding credential tokens. Every academic row
// keeps pointing at the teacher so historical attainment reports stay reproducible.
// ─────────────────────────────────────────────────────────────────────────────
const pool = require('../config/db');

// The Teacher Directory owns ordinary faculty accounts. Admin / Moderator (HOD/HOS) /
// School Admin / Department Admin / Examination Team are privileged identities that
// must never be removable through this screen — they are managed in the Admin Panel.
const DELETABLE_ROLES = Object.freeze(['Teacher', 'Viewer']);

const sumCounts = (items) => items.reduce((acc, i) => acc + i.count, 0);

// Runs a probe set against one connection (or the pool when `db` is omitted) and
// returns [{ key, label, count }]. Probes run sequentially on purpose: inside a
// transaction a connection can only execute one statement at a time.
const runProbes = async (probes, teacherId, db = pool) => {
  const items = [];
  for (const probe of probes) {
    // eslint-disable-next-line no-await-in-loop -- see note above
    const [rows] = await db.query(probe.sql, [teacherId]);
    items.push({ key: probe.key, label: probe.label, count: Number(rows[0]?.cnt || 0) });
  }
  return { items, total: sumCounts(items) };
};

// Full account row for the deletion flow. `forUpdate` takes the row lock that makes
// the delete/restore race safe (two admins clicking Delete at once).
const getTeacherAccount = async (id, db = pool, { forUpdate = false } = {}) => {
  const [rows] = await db.query(
    `SELECT t.id, t.name, t.email, t.username, t.employee_id, t.designation, t.role,
            t.is_active, t.created_at, t.department_id, t.school_id,
            t.deleted_at, t.deleted_by, t.delete_reason, t.deleted_prior_active,
            d.name AS department_name, s.name AS school_name
       FROM teachers t
       LEFT JOIN departments d ON d.id = t.department_id
       LEFT JOIN schools s ON s.id = t.school_id
      WHERE t.id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] || null;
};

// A reassignment target must be a live, non-deleted account that is not the one being
// deleted. Role is deliberately not restricted beyond that, so an Admin can hand work
// to a Moderator/HOD covering the department.
const getReassignmentTarget = async (id, db = pool, { forUpdate = false } = {}) => {
  const [rows] = await db.query(
    `SELECT id, name, email, role, is_active, deleted_at
       FROM teachers
      WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] || null;
};

// ── Dependency probes ────────────────────────────────────────────────────────
// ACTIVE probes are live work. Any non-zero count BLOCKS deletion unless the admin
// supplies a reassignment target. HISTORICAL probes are the preserved academic
// record: they are reported so the admin can see exactly what a hard delete would
// have destroyed, and snapshotted into the audit row — but never modified.
const ACTIVE_PROBES = Object.freeze([
  {
    key: 'activeCourses',
    label: 'Active courses owned',
    sql: "SELECT COUNT(*) AS cnt FROM courses WHERE teacher_id = ? AND status = 'Active'",
  },
  {
    key: 'courseAssignments',
    label: 'Active course teaching assignments',
    sql: `SELECT COUNT(*) AS cnt FROM user_course_assignments uca
            JOIN courses c ON c.id = uca.course_id
           WHERE uca.user_id = ? AND c.status = 'Active'`,
  },
  {
    key: 'openPaperResponsibilities',
    label: 'Open question-paper responsibilities',
    sql: "SELECT COUNT(*) AS cnt FROM paper_assignments WHERE user_id = ? AND status <> 'COMPLETED'",
  },
  {
    key: 'openExaminations',
    label: 'Draft / active examinations created',
    sql: "SELECT COUNT(*) AS cnt FROM examinations WHERE created_by = ? AND status IN ('DRAFT', 'ACTIVE')",
  },
  {
    key: 'unapprovedPapers',
    label: 'Question papers awaiting approval',
    sql: "SELECT COUNT(*) AS cnt FROM question_papers WHERE uploaded_by = ? AND status NOT IN ('APPROVED', 'REJECTED')",
  },
  {
    key: 'openMarksSubmissions',
    label: 'Marks submissions not yet completed',
    sql: `SELECT COUNT(*) AS cnt FROM marks_submissions
           WHERE submitted_by = ? AND status NOT IN ('COMPLETED', 'LOCKED', 'APPROVED')`,
  },
]);

const HISTORICAL_PROBES = Object.freeze([
  {
    key: 'coursesOwned',
    label: 'Courses owned (all statuses)',
    sql: 'SELECT COUNT(*) AS cnt FROM courses WHERE teacher_id = ?',
  },
  {
    key: 'studentMarks',
    label: 'Student mark rows on their courses',
    sql: `SELECT COUNT(*) AS cnt FROM student_marks sm
            JOIN courses c ON c.id = sm.course_id
           WHERE c.teacher_id = ?`,
  },
  {
    key: 'enrollments',
    label: 'Student enrollments on their courses',
    sql: `SELECT COUNT(*) AS cnt FROM course_enrollments ce
            JOIN courses c ON c.id = ce.course_id
           WHERE c.teacher_id = ?`,
  },
  {
    key: 'courseOutcomes',
    label: 'Course outcomes (COs) defined',
    sql: `SELECT COUNT(*) AS cnt FROM course_outcomes co
            JOIN courses c ON c.id = co.course_id
           WHERE c.teacher_id = ?`,
  },
  {
    key: 'coPoMappings',
    label: 'CO-PO mappings',
    sql: `SELECT COUNT(*) AS cnt FROM co_po_mappings m
            JOIN courses c ON c.id = m.course_id
           WHERE c.teacher_id = ?`,
  },
  {
    key: 'questionConfigs',
    label: 'Question configurations',
    sql: `SELECT COUNT(*) AS cnt FROM question_configs qc
            JOIN courses c ON c.id = qc.course_id
           WHERE c.teacher_id = ?`,
  },
  {
    key: 'questionPapers',
    label: 'Question papers uploaded',
    sql: 'SELECT COUNT(*) AS cnt FROM question_papers WHERE uploaded_by = ?',
  },
  {
    key: 'marksSubmissions',
    label: 'Marks submission cycles',
    sql: `SELECT COUNT(*) AS cnt FROM marks_submissions ms
            JOIN courses c ON c.id = ms.course_id
           WHERE c.teacher_id = ?`,
  },
  {
    key: 'examinations',
    label: 'Examinations created',
    sql: 'SELECT COUNT(*) AS cnt FROM examinations WHERE created_by = ?',
  },
  {
    key: 'auditEntries',
    label: 'Audit-log entries authored',
    sql: 'SELECT COUNT(*) AS cnt FROM admin_audit_log WHERE actor_user_id = ?',
  },
  {
    key: 'notifications',
    label: 'Notifications received',
    sql: 'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ?',
  },
]);


// ── Mutations (always called inside withTransaction) ─────────────────────────
// Moves the *live* pointers off the teacher about to be deleted. Historical pointers
// (question_papers.uploaded_by, examinations.created_by, admin_audit_log.actor_user_id,
// paper_assignments.assigned_by) are deliberately left alone — rewriting them would
// falsify the academic record.
//
// user_course_assignments is UNIQUE(user_id, course_id) and paper_assignments is
// UNIQUE(question_paper_id, user_id, responsibility, class_id), so a plain UPDATE can
// fail with ER_DUP_ENTRY when the target already holds the same assignment. Those rows
// are redundant duplicates of work the target already owns, so they are dropped first.
const reassignActiveWork = async ({ fromUserId, toUserId }, db = pool) => {
  const counts = { courses: 0, courseAssignments: 0, paperAssignments: 0, duplicateRowsDropped: 0 };

  const [courses] = await db.query('UPDATE courses SET teacher_id = ? WHERE teacher_id = ?', [toUserId, fromUserId]);
  counts.courses = courses.affectedRows;

  const [dupUca] = await db.query(
    `DELETE uca FROM user_course_assignments uca
       JOIN user_course_assignments dup
         ON dup.course_id = uca.course_id AND dup.user_id = ?
      WHERE uca.user_id = ?`,
    [toUserId, fromUserId],
  );
  counts.duplicateRowsDropped += dupUca.affectedRows;

  const [uca] = await db.query('UPDATE user_course_assignments SET user_id = ? WHERE user_id = ?', [toUserId, fromUserId]);
  counts.courseAssignments = uca.affectedRows;

  const [dupPa] = await db.query(
    `DELETE pa FROM paper_assignments pa
       JOIN paper_assignments dup
         ON dup.question_paper_id = pa.question_paper_id
        AND dup.responsibility = pa.responsibility
        AND dup.class_id <=> pa.class_id
        AND dup.user_id = ?
      WHERE pa.user_id = ?`,
    [toUserId, fromUserId],
  );
  counts.duplicateRowsDropped += dupPa.affectedRows;

  const [pa] = await db.query('UPDATE paper_assignments SET user_id = ? WHERE user_id = ?', [toUserId, fromUserId]);
  counts.paperAssignments = pa.affectedRows;

  return counts;
};

// Soft delete: deactivate + stamp the deletion metadata. Guarded on
// `deleted_at IS NULL` so a concurrent second delete cannot re-stamp the row.
const softDeleteTeacher = async ({ teacherId, actorUserId, reason }, db = pool) => {
  const [result] = await db.query(
    `UPDATE teachers
        SET deleted_prior_active = is_active,
            is_active = 0,
            deleted_at = NOW(),
            deleted_by = ?,
            delete_reason = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [actorUserId, reason || null, teacherId],
  );
  return result.affectedRows > 0;
};

// Restore reverses the stamp and returns the account to whatever active state it had
// before it was deleted.
const restoreTeacherAccount = async (teacherId, db = pool) => {
  const [result] = await db.query(
    `UPDATE teachers
        SET is_active = COALESCE(deleted_prior_active, 1),
            deleted_at = NULL,
            deleted_by = NULL,
            delete_reason = NULL,
            deleted_prior_active = NULL
      WHERE id = ? AND deleted_at IS NOT NULL`,
    [teacherId],
  );
  return result.affectedRows > 0;
};

// Outstanding password-setup / reset links for a deleted account must stop working.
// Rows are marked used rather than deleted so the credential lifecycle stays auditable.
const invalidatePendingTokens = async (teacherId, db = pool) => {
  const [result] = await db.query(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
    [teacherId],
  );
  return result.affectedRows;
};

module.exports = {
  DELETABLE_ROLES,
  ACTIVE_PROBES,
  HISTORICAL_PROBES,
  runProbes,
  getTeacherAccount,
  getReassignmentTarget,
  reassignActiveWork,
  softDeleteTeacher,
  restoreTeacherAccount,
  invalidatePendingTokens,
};

