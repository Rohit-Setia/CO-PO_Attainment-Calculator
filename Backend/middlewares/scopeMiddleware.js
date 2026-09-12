const pool = require('../config/db');

// PHASE 7 — scoped academic-structure authorization.
//
// Roles and what they may administer (Section 2/45 of the Phase 7 spec):
//   Admin              — full, unscoped access to every School/Department.
//   School Admin       — full access, but only within their own school_id.
//   Department Admin   — full access, but only within their own department_id.
//   anyone else        — no write access to academic structure (this deliberately
//                        excludes 'Examination Team', which the existing academicRoutes.js
//                        previously allowed — Phase 7 explicitly narrows that: Examination
//                        Team gets marks/students/reports access, not structure administration).
//
// `entityType` tells the middleware how to resolve "which School/Department does this
// request target" for each hierarchy level, since a Program's school isn't a column on
// Program — it has to be resolved via Department. Resolution always joins up to the real
// School/Department id; nothing is inferred from free text.
const resolveTargetScope = async (entityType, req) => {
  switch (entityType) {
    case 'school': {
      const id = req.params.id || req.body.id;
      if (!id) return { schoolId: null, departmentId: null }; // creating a school — see authorizeAcademicWrite
      const [[row]] = await pool.query('SELECT id AS school_id, NULL AS department_id FROM schools WHERE id = ?', [id]);
      return row ? { schoolId: row.school_id, departmentId: null } : null;
    }
    case 'department': {
      // On create, the target school is whatever schoolId the caller is trying to create into.
      // On update, resolve the department's actual current school (ignore any schoolId in the
      // body — you cannot re-parent a department into a different school via this check).
      const id = req.params.id;
      if (id) {
        const [[row]] = await pool.query('SELECT id AS department_id, school_id FROM departments WHERE id = ?', [id]);
        return row ? { schoolId: row.school_id, departmentId: row.department_id } : null;
      }
      const schoolId = req.body.schoolId;
      return { schoolId: schoolId || null, departmentId: null };
    }
    case 'branch': {
      const departmentId = req.body.departmentId;
      if (!departmentId) return { schoolId: null, departmentId: null };
      const [[row]] = await pool.query('SELECT school_id FROM departments WHERE id = ?', [departmentId]);
      return row ? { schoolId: row.school_id, departmentId: Number(departmentId) } : null;
    }
    case 'program': {
      const id = req.params.id;
      const departmentId = id ? null : req.body.departmentId;
      if (id) {
        const [[row]] = await pool.query(
          `SELECT p.department_id, d.school_id FROM programs p
           LEFT JOIN departments d ON d.id = p.department_id WHERE p.id = ?`,
          [id],
        );
        return row ? { schoolId: row.school_id, departmentId: row.department_id } : null;
      }
      if (!departmentId) return { schoolId: null, departmentId: null };
      const [[row]] = await pool.query('SELECT school_id FROM departments WHERE id = ?', [departmentId]);
      return row ? { schoolId: row.school_id, departmentId: Number(departmentId) } : null;
    }
    case 'class': {
      const id = req.params.id;
      const programId = id ? null : req.body.programId;
      if (id) {
        const [[row]] = await pool.query(
          `SELECT d.id AS department_id, d.school_id FROM academic_classes ac
           LEFT JOIN programs p ON p.id = ac.program_id
           LEFT JOIN departments d ON d.id = p.department_id WHERE ac.id = ?`,
          [id],
        );
        return row ? { schoolId: row.school_id, departmentId: row.department_id } : null;
      }
      if (!programId) return { schoolId: null, departmentId: null };
      const [[row]] = await pool.query(
        `SELECT d.id AS department_id, d.school_id FROM programs p
         LEFT JOIN departments d ON d.id = p.department_id WHERE p.id = ?`,
        [programId],
      );
      return row ? { schoolId: row.school_id, departmentId: row.department_id } : null;
    }
    case 'paper': {
      const id = req.params.id;
      if (!id) return { schoolId: null, departmentId: null };
      const [[row]] = await pool.query(
        `SELECT d.school_id, d.id AS department_id, qp.course_id FROM question_papers qp
         JOIN courses c ON c.id = qp.course_id
         LEFT JOIN programs p ON p.id = c.program_id
         LEFT JOIN departments d ON d.id = p.department_id WHERE qp.id = ?`,
        [id],
      );
      return row ? { schoolId: row.school_id, departmentId: row.department_id, courseId: row.course_id } : null;
    }
    case 'course': {
      const id = req.params.id || req.params.courseId || req.body.courseId;
      if (!id) return { schoolId: null, departmentId: null };
      const [[row]] = await pool.query(
        `SELECT d.school_id, d.id AS department_id FROM courses c
         LEFT JOIN programs p ON p.id = c.program_id
         LEFT JOIN departments d ON d.id = p.department_id WHERE c.id = ?`,
        [id],
      );
      return row ? { schoolId: row.school_id, departmentId: row.department_id } : null;
    }
    default:
      return { schoolId: null, departmentId: null };
  }
};

// authorizeAcademicWrite(entityType) — gates POST/PUT on Schools/Departments/Branches/
// Programs/Classes. Admin bypasses. School Admin / Department Admin must have a matching,
// non-null scope on their own account AND the resolved target must fall within it.
// A School Admin with no school_id assigned (mis-configured account) is refused, not
// silently treated as unscoped — scope is a hard ceiling, never a bypass.
const authorizeAcademicWrite = (entityType) => async (req, res, next) => {
  try {
    const { role } = req.user;
    // Admin and Moderator always have full, unscoped access to academic structure.
    // Moderator is the HOS/HOD-level role — they manage all schools/departments/programs
    // they are responsible for, without being pinned to a single scope FK.
    if (role === 'Admin' || role === 'Moderator') return next();

    if (role !== 'School Admin' && role !== 'Department Admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Only Admin, Moderator, School Admin, Department Admin can manage academic structure.' });
    }

    const target = await resolveTargetScope(entityType, req);
    if (target === null) {
      return res.status(404).json({ success: false, message: 'Target academic entity not found.' });
    }

    if (role === 'School Admin') {
      if (!req.user.school_id) {
        return res.status(403).json({ success: false, message: 'Forbidden: your account has no School assigned.' });
      }
      // Creating a school itself is University-Admin-only — School Admins manage within an
      // existing school, they don't create new ones.
      if (entityType === 'school') {
        return res.status(403).json({ success: false, message: 'Forbidden: only Admin can create/modify Schools.' });
      }
      if (String(target.schoolId) !== String(req.user.school_id)) {
        return res.status(403).json({ success: false, message: 'Forbidden: outside your School.' });
      }
      return next();
    }

    // Department Admin
    if (!req.user.department_id) {
      return res.status(403).json({ success: false, message: 'Forbidden: your account has no Department assigned.' });
    }
    if (entityType === 'school' || entityType === 'department') {
      return res.status(403).json({ success: false, message: 'Forbidden: only Admin/School Admin can manage Schools/Departments.' });
    }
    if (String(target.departmentId) !== String(req.user.department_id)) {
      return res.status(403).json({ success: false, message: 'Forbidden: outside your Department.' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

// authorizeExamWrite(entityType) — same scoping shape as authorizeAcademicWrite, but for
// examination/question-paper routes, where (unlike academic-structure admin) Examination
// Team legitimately has university-wide operational access alongside Admin/Moderator.
// School Admin / Department Admin are scoped to their own school/department exactly as above.
const authorizeExamWrite = (entityType) => async (req, res, next) => {
  try {
    const { role } = req.user;
    if (role === 'Admin' || role === 'Moderator' || role === 'Examination Team') return next();

    if (role !== 'School Admin' && role !== 'Department Admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Only Admin, Moderator, Examination Team, School Admin, Department Admin can manage examinations.' });
    }

    const target = await resolveTargetScope(entityType, req);
    if (target === null) {
      return res.status(404).json({ success: false, message: 'Target entity not found.' });
    }

    if (role === 'School Admin') {
      if (!req.user.school_id) {
        return res.status(403).json({ success: false, message: 'Forbidden: your account has no School assigned.' });
      }
      if (String(target.schoolId) !== String(req.user.school_id)) {
        return res.status(403).json({ success: false, message: 'Forbidden: outside your School.' });
      }
      return next();
    }

    if (!req.user.department_id) {
      return res.status(403).json({ success: false, message: 'Forbidden: your account has no Department assigned.' });
    }
    if (String(target.departmentId) !== String(req.user.department_id)) {
      return res.status(403).json({ success: false, message: 'Forbidden: outside your Department.' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

// Read-side scoping: narrows a caller-supplied filter object so a School/Department Admin's
// GET requests can never see rows outside their scope, regardless of query params they pass.
// Admin/Examination Team/Teacher/Viewer are returned unchanged (this only tightens, never
// loosens, whatever route-level RBAC already applies).
const applyReadScope = (user, filters = {}) => {
  // Moderator, Admin, and Examination Team get unscoped reads.
  if (user.role === 'Admin' || user.role === 'Moderator' || user.role === 'Examination Team') {
    return filters;
  }
  if (user.role === 'School Admin' && user.school_id) {
    return { ...filters, schoolId: user.school_id };
  }
  if (user.role === 'Department Admin' && user.department_id) {
    return { ...filters, departmentId: user.department_id };
  }
  return filters;
};

module.exports = { authorizeAcademicWrite, authorizeExamWrite, applyReadScope, resolveTargetScope };
