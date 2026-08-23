const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const protect = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { applyReadScope } = require('../middlewares/scopeMiddleware');
const { logAction } = require('../models/adminAuditModel');
const {
  getStudentsForClass, removeStudentFromClass, addManyStudentsToClass,
} = require('../models/academicModel');
const {
  createStudent, updateStudent, getStudentById, listStudents, mapStudentToClass, findStudentByAnyIdentifier,
} = require('../models/studentMasterModel');

// Phase 8 — server-side student read scoping (IDOR hardening). A caller must not gain access
// to a student merely by changing an id in the URL:
//   Admin / Examination Team  — any student.
//   School Admin              — students whose academic Program belongs to their School.
//   Department Admin          — students whose academic Program belongs to their Department.
//   Teacher / Viewer          — students enrolled in a course they own or are assigned to.
const canReadStudent = async (user, studentId) => {
  const { role } = user;
  if (role === 'Admin' || role === 'Examination Team') return true;

  if (role === 'School Admin') {
    if (!user.school_id) return false;
    const [[row]] = await pool.query(
      `SELECT 1 FROM students st
       LEFT JOIN programs p ON p.id = st.academic_program_id
       LEFT JOIN departments d ON d.id = p.department_id
       WHERE st.id = ? AND d.school_id = ? LIMIT 1`,
      [studentId, user.school_id],
    );
    return !!row;
  }

  if (role === 'Department Admin') {
    if (!user.department_id) return false;
    const [[row]] = await pool.query(
      `SELECT 1 FROM students st
       LEFT JOIN programs p ON p.id = st.academic_program_id
       WHERE st.id = ? AND p.department_id = ? LIMIT 1`,
      [studentId, user.department_id],
    );
    return !!row;
  }

  const [[row]] = await pool.query(
    `SELECT 1 FROM course_enrollments ce
     JOIN courses c ON c.id = ce.course_id
     LEFT JOIN user_course_assignments uca ON uca.course_id = c.id AND uca.user_id = ?
     WHERE ce.student_id = ? AND (c.teacher_id = ? OR uca.id IS NOT NULL) LIMIT 1`,
    [user.id, studentId, user.id],
  );
  return !!row;
};

// Phase 8 — read scoping for class-membership access (School/Department Admin only; other
// roles keep the existing open read because the course-enrollment workflow depends on it).
const isClassInScope = async (user, classId) => {
  const { role } = user;
  if (role !== 'School Admin' && role !== 'Department Admin') return true;
  const [[row]] = await pool.query(
    `SELECT d.school_id, p.department_id FROM academic_classes ac
     LEFT JOIN programs p ON p.id = ac.program_id
     LEFT JOIN departments d ON d.id = p.department_id
     WHERE ac.id = ?`,
    [classId],
  );
  if (!row) return null;
  if (role === 'School Admin') return Boolean(user.school_id && String(row.school_id) === String(user.school_id));
  return String(row.department_id) === String(user.department_id);
};

// A registration number/name that looks nothing like the real patterns in this system (short,
// all-letters, no digits) is flagged for an administrator's attention — never auto-corrected
// or auto-deleted (Section 18). Purely a display hint computed on read, not a stored field.
const looksLikePlaceholder = (student) => {
  const reg = (student.registration_number || '').trim();
  const name = (student.name || '').trim();
  const shortAllLetters = /^[A-Za-z]{1,4}$/.test(reg);
  const singleCharName = name.length <= 2;
  return shortAllLetters || singleCharName;
};

// ---------- Student Master ----------
// Section 14 — search/filter across Registration No, Name, Roll No, Program, Department,
// Session, Class, Status, server-side paginated. Section 2/45 — School Admin / Department
// Admin only ever see students within their own scope, regardless of what filters they pass.
router.get('/students', protect, async (req, res, next) => {
  try {
    const filters = applyReadScope(req.user, {
      search: req.query.search,
      status: req.query.status,
      programId: req.query.programId,
      sessionId: req.query.sessionId,
      classId: req.query.classId,
      departmentId: req.query.departmentId,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    const { rows, total, limit, offset } = await listStudents(filters);
    const data = rows.map((s) => ({ ...s, isPlaceholderSuspect: looksLikePlaceholder(s) }));
    res.json({ success: true, data, meta: { total, limit, offset } });
  } catch (err) { next(err); }
});

router.post('/students', protect, authorizeRoles('Admin', 'Examination Team', 'Teacher'), async (req, res, next) => {
  try {
    const { registrationNumber, rollNumber, name, email, status } = req.body;
    if (!registrationNumber || !name) {
      return res.status(400).json({ success: false, message: 'registrationNumber and name are required.' });
    }
    const existing = await findStudentByAnyIdentifier(registrationNumber);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A student with identifier "${registrationNumber}" already exists (id ${existing.id}).`,
        data: { student: existing },
      });
    }
    const { student, created } = await createStudent({ registrationNumber, rollNumber, name, email, status });
    if (created) {
      await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'create', entityType: 'student', entityId: student.id, details: { registrationNumber, name } });
    }
    res.status(created ? 201 : 200).json({
      success: true,
      message: created ? 'Student created.' : 'Student already exists (reused master).',
      data: { student },
    });
  } catch (err) { next(err); }
});

router.put('/students/:id', protect, authorizeRoles('Admin', 'Examination Team', 'Teacher'), async (req, res, next) => {
  try {
    const updated = await updateStudent(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Student not found.' });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'update', entityType: 'student', entityId: req.params.id, details: req.body });
    res.json({ success: true, message: 'Student updated.', data: { student: await getStudentById(req.params.id) } });
  } catch (err) { next(err); }
});

router.get('/students/:id', protect, async (req, res, next) => {
  try {
    const student = await getStudentById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    const allowed = await canReadStudent(req.user, req.params.id);
    if (!allowed) return res.status(403).json({ success: false, message: 'Forbidden: you cannot access this student.' });
    res.json({ success: true, data: student });
  } catch (err) { next(err); }
});

// Map a student into an academic class (Phase 3J workflow).
// Body: { classId, programId?, sessionId?, semester?, section? }
router.post('/students/:id/map', protect, authorizeRoles('Admin', 'Examination Team', 'Teacher'), async (req, res, next) => {
  try {
    const { classId, programId, sessionId, semester, section } = req.body;
    if (!classId) return res.status(400).json({ success: false, message: 'classId is required.' });
    const student = await mapStudentToClass({ studentId: req.params.id, classId, programId, sessionId, semester, section });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'map', entityType: 'student', entityId: req.params.id, details: { classId, programId, sessionId, semester, section } });
    res.json({ success: true, message: 'Student mapped to academic class.', data: { student } });
  } catch (err) { next(err); }
});

// ---------- Class Membership ----------
router.get('/classes/:id/students', protect, async (req, res, next) => {
  try {
    const inScope = await isClassInScope(req.user, req.params.id);
    if (inScope === null) return res.status(404).json({ success: false, message: 'Class not found.' });
    if (!inScope) return res.status(403).json({ success: false, message: 'Forbidden: outside your School/Department.' });
    const rows = await getStudentsForClass(req.params.id);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/classes/:id/students', protect, authorizeRoles('Admin', 'Examination Team', 'Teacher'), async (req, res, next) => {
  try {
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'studentIds array is required.' });
    }
    await addManyStudentsToClass(req.params.id, studentIds);
    res.json({ success: true, message: 'Students added to class.' });
  } catch (err) { next(err); }
});

router.delete('/classes/:id/students/:studentId', protect, authorizeRoles('Admin', 'Examination Team', 'Teacher'), async (req, res, next) => {
  try {
    const removed = await removeStudentFromClass(req.params.id, req.params.studentId);
    if (!removed) return res.status(404).json({ success: false, message: 'Student not in class.' });
    res.json({ success: true, message: 'Student removed from class.' });
  } catch (err) { next(err); }
});

module.exports = router;