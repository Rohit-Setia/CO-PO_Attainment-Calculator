const express = require('express');
const router = express.Router();
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