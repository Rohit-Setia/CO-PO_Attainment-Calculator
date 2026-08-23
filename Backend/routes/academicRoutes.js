const express = require('express');
const router = express.Router();
const protect = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const {
  getAllSchools, createSchool, updateSchool,
  getDepartmentsBySchool, createDepartment, updateDepartment,
  getBranchesByDepartment, createBranch,
  getProgramsByDepartment, createProgram, updateProgram,
  getAllSessions, createSession, updateSession,
  getClasses, getClassById, createClass, updateClass,
} = require('../models/academicModel');
const {
  createStudent, updateStudent, getStudentById, listStudents, mapStudentToClass, findStudentByAnyIdentifier,
} = require('../models/studentMasterModel');

// ---------- Schools ----------
router.get('/schools', protect, async (req, res, next) => {
  try { res.json({ success: true, data: await getAllSchools() }); }
  catch (err) { next(err); }
});

router.post('/schools', protect, authorizeRoles('Admin', 'Examination Team'), async (req, res, next) => {
  try {
    const { name, code, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'School name is required.' });
    const id = await createSchool({ name, code, description });
    res.status(201).json({ success: true, message: 'School created.', data: { id } });
  } catch (err) { next(err); }
});

router.put('/schools/:id', protect, authorizeRoles('Admin', 'Examination Team'), async (req, res, next) => {
  try {
    const updated = await updateSchool(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'School not found.' });
    res.json({ success: true, message: 'School updated.' });
  } catch (err) { next(err); }
});

// ---------- Departments ----------
router.get('/departments', protect, async (req, res, next) => {
  try { res.json({ success: true, data: await getDepartmentsBySchool(req.query.schoolId) }); }
  catch (err) { next(err); }
});

router.get('/schools/:id/departments', protect, async (req, res, next) => {
  try {
    const rows = await getDepartmentsBySchool(req.params.id);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/departments', protect, authorizeRoles('Admin', 'Examination Team'), async (req, res, next) => {
  try {
    const { schoolId, name, code, hod } = req.body;
    if (!schoolId || !name) return res.status(400).json({ success: false, message: 'schoolId and name are required.' });
    const id = await createDepartment({ schoolId, name, code, hod });
    res.status(201).json({ success: true, message: 'Department created.', data: { id } });
  } catch (err) { next(err); }
});

router.put('/departments/:id', protect, authorizeRoles('Admin', 'Examination Team'), async (req, res, next) => {
  try {
    const updated = await updateDepartment(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Department not found.' });
    res.json({ success: true, message: 'Department updated.' });
  } catch (err) { next(err); }
});

// ---------- Branches ----------
router.get('/departments/:id/branches', protect, async (req, res, next) => {
  try {
    const rows = await getBranchesByDepartment(req.params.id);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/branches', protect, authorizeRoles('Admin', 'Examination Team'), async (req, res, next) => {
  try {
    const { departmentId, name, code } = req.body;
    if (!departmentId || !name) return res.status(400).json({ success: false, message: 'departmentId and name are required.' });
    const id = await createBranch({ departmentId, name, code });
    res.status(201).json({ success: true, message: 'Branch created.', data: { id } });
  } catch (err) { next(err); }
});

// ---------- Programs ----------
router.get('/programs', protect, async (req, res, next) => {
  try { res.json({ success: true, data: await getProgramsByDepartment(req.query.departmentId) }); }
  catch (err) { next(err); }
});

router.post('/programs', protect, authorizeRoles('Admin', 'Examination Team'), async (req, res, next) => {
  try {
    const { departmentId, branchId, name, code, degree, duration } = req.body;
    if (!departmentId || !name) return res.status(400).json({ success: false, message: 'departmentId and name are required.' });
    const id = await createProgram({ departmentId, branchId, name, code, degree, duration });
    res.status(201).json({ success: true, message: 'Program created.', data: { id } });
  } catch (err) { next(err); }
});

router.put('/programs/:id', protect, authorizeRoles('Admin', 'Examination Team'), async (req, res, next) => {
  try {
    const updated = await updateProgram(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Program not found.' });
    res.json({ success: true, message: 'Program updated.' });
  } catch (err) { next(err); }
});

// ---------- Academic Sessions ----------
router.get('/sessions', protect, async (req, res, next) => {
  try { res.json({ success: true, data: await getAllSessions() }); }
  catch (err) { next(err); }
});

router.post('/sessions', protect, authorizeRoles('Admin', 'Examination Team'), async (req, res, next) => {
  try {
    const { name, startYear, endYear } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Session name is required.' });
    const id = await createSession({ name, startYear, endYear });
    res.status(201).json({ success: true, message: 'Session created.', data: { id } });
  } catch (err) { next(err); }
});

router.put('/sessions/:id', protect, authorizeRoles('Admin', 'Examination Team'), async (req, res, next) => {
  try {
    const updated = await updateSession(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Session not found.' });
    res.json({ success: true, message: 'Session updated.' });
  } catch (err) { next(err); }
});

// ---------- Academic Classes ----------
router.get('/classes', protect, async (req, res, next) => {
  try {
    const filters = {
      programId: req.query.programId,
      sessionId: req.query.sessionId,
      semester: req.query.semester,
      section: req.query.section,
    };
    res.json({ success: true, data: await getClasses(filters) });
  } catch (err) { next(err); }
});

router.get('/classes/:id', protect, async (req, res, next) => {
  try {
    const cls = await getClassById(req.params.id);
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found.' });
    res.json({ success: true, data: cls });
  } catch (err) { next(err); }
});

router.post('/classes', protect, authorizeRoles('Admin', 'Examination Team'), async (req, res, next) => {
  try {
    const { programId, sessionId, semester, section } = req.body;
    if (!programId || !sessionId || !semester) {
      return res.status(400).json({ success: false, message: 'programId, sessionId and semester are required.' });
    }
    const id = await createClass({ programId, sessionId, semester, section });
    res.status(201).json({ success: true, message: 'Academic class created.', data: { id } });
  } catch (err) { next(err); }
});

router.put('/classes/:id', protect, authorizeRoles('Admin', 'Examination Team'), async (req, res, next) => {
  try {
    const updated = await updateClass(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Class not found.' });
    res.json({ success: true, message: 'Class updated.' });
  } catch (err) { next(err); }
});

module.exports = router;