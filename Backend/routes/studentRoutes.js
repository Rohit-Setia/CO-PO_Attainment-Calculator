const express = require('express');
const router = express.Router();
const protect = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const {
  getStudentsForClass, removeStudentFromClass, addManyStudentsToClass,
} = require('../models/academicModel');
const {
  createStudent, updateStudent, getStudentById, listStudents, mapStudentToClass, findStudentByAnyIdentifier,
} = require('../models/studentMasterModel');

// ---------- Student Master ----------
router.get('/students', protect, async (req, res, next) => {
  try {
    const data = await listStudents({
      search: req.query.search,
      status: req.query.status,
      limit: req.query.limit,
    });
    res.json({ success: true, data });
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