const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const protect = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { authorizeAcademicWrite, applyReadScope } = require('../middlewares/scopeMiddleware');
const { logAction } = require('../models/adminAuditModel');
const {
  getAllSchools, createSchool, updateSchool,
  getDepartmentsBySchool, createDepartment, updateDepartment,
  getBranchesByDepartment, createBranch,
  getProgramsByDepartment, getProgramByIdWithContext, createProgram, updateProgram,
  getAllSessions, createSession, updateSession,
  getClasses, getClassById, createClass, updateClass,
} = require('../models/academicModel');
const {
  getProgramOutcomes, createProgramOutcome, updateProgramOutcome, deleteProgramOutcome, bulkUpsertProgramOutcomes,
} = require('../models/programOutcomeModel');

// ---------- Schools ----------
// Always unscoped — every authenticated user can see the list of Schools (needed for basic
// navigation/filters); write access is what's actually scoped (see authorizeAcademicWrite).
router.get('/schools', protect, async (req, res, next) => {
  try { res.json({ success: true, data: await getAllSchools() }); }
  catch (err) { next(err); }
});

router.post('/schools', protect, authorizeAcademicWrite('school'), async (req, res, next) => {
  try {
    const { name, code, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'School name is required.' });
    const id = await createSchool({ name, code, description });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'create', entityType: 'school', entityId: id, details: { name, code } });
    res.status(201).json({ success: true, message: 'School created.', data: { id } });
  } catch (err) { next(err); }
});

router.put('/schools/:id', protect, authorizeAcademicWrite('school'), async (req, res, next) => {
  try {
    const updated = await updateSchool(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'School not found.' });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'update', entityType: 'school', entityId: req.params.id, details: req.body });
    res.json({ success: true, message: 'School updated.' });
  } catch (err) { next(err); }
});

// ---------- Departments ----------
router.get('/departments', protect, async (req, res, next) => {
  try {
    const scoped = applyReadScope(req.user, { schoolId: req.query.schoolId });
    res.json({ success: true, data: await getDepartmentsBySchool(scoped.schoolId, scoped.departmentId) });
  } catch (err) { next(err); }
});

// Scoped read: School Admins may only list departments of their own School; Department
// Admins only their own Department's School. Other roles see the school's departments
// (needed for navigation/filters). Never trust client-supplied schoolId for scoped roles.
router.get('/schools/:id/departments', protect, async (req, res, next) => {
  try {
    const { role } = req.user;
    if (role === 'School Admin') {
      if (!req.user.school_id || String(req.user.school_id) !== String(req.params.id)) {
        return res.status(403).json({ success: false, message: 'Forbidden: outside your School.' });
      }
    }
    if (role === 'Department Admin') {
      if (!req.user.department_id) {
        return res.status(403).json({ success: false, message: 'Forbidden: your account has no Department assigned.' });
      }
      const [[dept]] = await pool.query('SELECT school_id FROM departments WHERE id = ?', [req.user.department_id]);
      if (!dept || String(dept.school_id) !== String(req.params.id)) {
        return res.status(403).json({ success: false, message: 'Forbidden: outside your School.' });
      }
    }
    const rows = await getDepartmentsBySchool(req.params.id);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/departments', protect, authorizeAcademicWrite('department'), async (req, res, next) => {
  try {
    const { schoolId, name, code, hod } = req.body;
    if (!schoolId || !name) return res.status(400).json({ success: false, message: 'schoolId and name are required.' });
    const id = await createDepartment({ schoolId, name, code, hod });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'create', entityType: 'department', entityId: id, details: { schoolId, name, code } });
    res.status(201).json({ success: true, message: 'Department created.', data: { id } });
  } catch (err) { next(err); }
});

router.put('/departments/:id', protect, authorizeAcademicWrite('department'), async (req, res, next) => {
  try {
    const updated = await updateDepartment(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Department not found.' });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'update', entityType: 'department', entityId: req.params.id, details: req.body });
    res.json({ success: true, message: 'Department updated.' });
  } catch (err) { next(err); }
});

// ---------- Branches ----------
// School Admins see only branches inside their own School (departmentId is narrowed
// server-side); Department Admins only branches of their own Department.
router.get('/branches', protect, async (req, res, next) => {
  try {
    const scoped = applyReadScope(req.user, {
      departmentId: req.query.departmentId,
      schoolId: req.query.schoolId,
    });
    const rows = await getBranchesByDepartment(scoped.departmentId, scoped.schoolId);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// Scoped read: School Admins may only read branches of Departments inside their School;
// Department Admins only their own Department. Other roles read unscoped.
router.get('/departments/:id/branches', protect, async (req, res, next) => {
  try {
    const { role } = req.user;
    const [[dept]] = await pool.query('SELECT school_id FROM departments WHERE id = ?', [req.params.id]);
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found.' });
    if (role === 'School Admin') {
      if (!req.user.school_id || String(req.user.school_id) !== String(dept.school_id)) {
        return res.status(403).json({ success: false, message: 'Forbidden: outside your School.' });
      }
    }
    if (role === 'Department Admin') {
      if (String(req.user.department_id) !== String(req.params.id)) {
        return res.status(403).json({ success: false, message: 'Forbidden: outside your Department.' });
      }
    }
    const rows = await getBranchesByDepartment(req.params.id);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/branches', protect, authorizeAcademicWrite('branch'), async (req, res, next) => {
  try {
    const { departmentId, name, code } = req.body;
    if (!departmentId || !name) return res.status(400).json({ success: false, message: 'departmentId and name are required.' });
    const id = await createBranch({ departmentId, name, code });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'create', entityType: 'branch', entityId: id, details: { departmentId, name, code } });
    res.status(201).json({ success: true, message: 'Branch created.', data: { id } });
  } catch (err) { next(err); }
});

// ---------- Programs ----------
router.get('/programs', protect, async (req, res, next) => {
  try {
    const scoped = applyReadScope(req.user, { departmentId: req.query.departmentId });
    res.json({ success: true, data: await getProgramsByDepartment(scoped.departmentId, scoped.schoolId) });
  } catch (err) { next(err); }
});

router.post('/programs', protect, authorizeAcademicWrite('program'), async (req, res, next) => {
  try {
    const { departmentId, branchId, name, code, degree, duration } = req.body;
    if (!departmentId || !name) return res.status(400).json({ success: false, message: 'departmentId and name are required.' });
    const id = await createProgram({ departmentId, branchId, name, code, degree, duration });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'create', entityType: 'program', entityId: id, details: { departmentId, branchId, name, code } });
    res.status(201).json({ success: true, message: 'Program created.', data: { id } });
  } catch (err) { next(err); }
});

router.put('/programs/:id', protect, authorizeAcademicWrite('program'), async (req, res, next) => {
  try {
    const updated = await updateProgram(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Program not found.' });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'update', entityType: 'program', entityId: req.params.id, details: req.body });
    res.json({ success: true, message: 'Program updated.' });
  } catch (err) { next(err); }
});

// ---------- Program Outcomes (PEO / PO / PSO) ----------
// Phase 12 — Program-level OBE outcome ownership. The Program owns its PEOs/POs/PSOs
// (definitions, descriptions, numbering, active status). Reads are available to all
// authenticated roles (needed by the articulation matrix and attainment views); writes are
// restricted to the same academic-write roles that manage the program itself — never a
// teacher-only feature.
router.get('/programs/:id/outcomes', protect, async (req, res, next) => {
  try {
    const programId = req.params.id;
    const program = await getProgramByIdWithContext(programId);
    if (!program) return res.status(404).json({ success: false, message: 'Program not found.' });
    const rows = await getProgramOutcomes(programId, req.query.type);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// Bulk upsert by type — body: { type: 'PEO'|'PO'|'PSO', outcomes: [{ code, title, description, displayOrder, isActive }] }
router.put('/programs/:id/outcomes', protect, authorizeAcademicWrite('program'), async (req, res, next) => {
  try {
    const { type, outcomes } = req.body;
    if (!['PEO', 'PO', 'PSO'].includes(type)) {
      return res.status(400).json({ success: false, message: 'type must be PEO, PO or PSO.' });
    }
    if (!Array.isArray(outcomes)) {
      return res.status(400).json({ success: false, message: 'outcomes must be an array.' });
    }
    const written = await bulkUpsertProgramOutcomes(req.params.id, type, outcomes);
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'update', entityType: 'program_outcomes', entityId: req.params.id, details: { type, count: written } });
    res.json({ success: true, message: `${written} ${type} definition(s) saved.`, data: { written } });
  } catch (err) { next(err); }
});

// Single outcome create — body: { type, code, title?, description?, displayOrder?, isActive? }
router.post('/programs/:id/outcomes', protect, authorizeAcademicWrite('program'), async (req, res, next) => {
  try {
    const { type, code, title, description, displayOrder, isActive } = req.body;
    if (!['PEO', 'PO', 'PSO'].includes(type)) {
      return res.status(400).json({ success: false, message: 'type must be PEO, PO or PSO.' });
    }
    if (!code) return res.status(400).json({ success: false, message: 'code is required (e.g. PO4).' });
    const row = await createProgramOutcome({ programId: req.params.id, type, code, title, description, displayOrder, isActive });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'create', entityType: 'program_outcome', entityId: row.id, details: { type, code } });
    res.status(201).json({ success: true, message: `${code} created.`, data: row });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: `An outcome with code "${req.body.code}" already exists for this program.` });
    }
    next(err);
  }
});

// Update a single outcome — body: any of { code, title, description, displayOrder, isActive }
router.put('/programs/:id/outcomes/:outcomeId', protect, authorizeAcademicWrite('program'), async (req, res, next) => {
  try {
    const row = await updateProgramOutcome(req.params.outcomeId, req.body);
    if (!row) return res.status(404).json({ success: false, message: 'Outcome not found.' });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'update', entityType: 'program_outcome', entityId: row.id, details: req.body });
    res.json({ success: true, message: `${row.code} updated.`, data: row });
  } catch (err) { next(err); }
});

router.delete('/programs/:id/outcomes/:outcomeId', protect, authorizeAcademicWrite('program'), async (req, res, next) => {
  try {
    const removed = await deleteProgramOutcome(req.params.outcomeId);
    if (!removed) return res.status(404).json({ success: false, message: 'Outcome not found.' });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'delete', entityType: 'program_outcome', entityId: req.params.outcomeId, details: {} });
    res.json({ success: true, message: 'Outcome removed.' });
  } catch (err) { next(err); }
});

// ---------- Academic Sessions ----------
// University-wide (calendar-level) infrastructure — not School/Department-scoped, so these
// stay Admin-only, matching Phase 7 Section 11 (no School/Department mention there at all).
router.get('/sessions', protect, async (req, res, next) => {
  try { res.json({ success: true, data: await getAllSessions() }); }
  catch (err) { next(err); }
});

router.post('/sessions', protect, authorizeRoles('Admin', 'Moderator'), async (req, res, next) => {
  try {
    const { name, startYear, endYear } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Session name is required.' });
    const id = await createSession({ name, startYear, endYear });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'create', entityType: 'session', entityId: id, details: { name, startYear, endYear } });
    res.status(201).json({ success: true, message: 'Session created.', data: { id } });
  } catch (err) { next(err); }
});

router.put('/sessions/:id', protect, authorizeRoles('Admin', 'Moderator'), async (req, res, next) => {
  try {
    const updated = await updateSession(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Session not found.' });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'update', entityType: 'session', entityId: req.params.id, details: req.body });
    res.json({ success: true, message: 'Session updated.' });
  } catch (err) { next(err); }
});

// ---------- Academic Classes ----------
router.get('/classes', protect, async (req, res, next) => {
  try {
    const filters = applyReadScope(req.user, {
      programId: req.query.programId,
      sessionId: req.query.sessionId,
      semester: req.query.semester,
      section: req.query.section,
    });
    res.json({ success: true, data: await getClasses(filters) });
  } catch (err) { next(err); }
});

// Scoped read: School Admins may only view classes of their School; Department Admins only
// classes of their Department. Other roles read unscoped (class context for navigation).
router.get('/classes/:id', protect, async (req, res, next) => {
  try {
    const cls = await getClassById(req.params.id);
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found.' });
    const { role } = req.user;
    if (role === 'School Admin' || role === 'Department Admin') {
      const [[row]] = await pool.query(
        `SELECT d.school_id, p.department_id FROM academic_classes ac
         LEFT JOIN programs p ON p.id = ac.program_id
         LEFT JOIN departments d ON d.id = p.department_id WHERE ac.id = ?`,
        [req.params.id],
      );
      if (!row) return res.status(404).json({ success: false, message: 'Class not found.' });
      if (role === 'School Admin' && (!req.user.school_id || String(row.school_id) !== String(req.user.school_id))) {
        return res.status(403).json({ success: false, message: 'Forbidden: outside your School.' });
      }
      if (role === 'Department Admin' && String(row.department_id) !== String(req.user.department_id)) {
        return res.status(403).json({ success: false, message: 'Forbidden: outside your Department.' });
      }
    }
    res.json({ success: true, data: cls });
  } catch (err) { next(err); }
});

router.post('/classes', protect, authorizeAcademicWrite('class'), async (req, res, next) => {
  try {
    const { programId, sessionId, semester, section } = req.body;
    if (!programId || !sessionId || !semester) {
      return res.status(400).json({ success: false, message: 'programId, sessionId and semester are required.' });
    }
    const id = await createClass({ programId, sessionId, semester, section });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'create', entityType: 'class', entityId: id, details: { programId, sessionId, semester, section } });
    res.status(201).json({ success: true, message: 'Academic class created.', data: { id } });
  } catch (err) { next(err); }
});

router.put('/classes/:id', protect, authorizeAcademicWrite('class'), async (req, res, next) => {
  try {
    const updated = await updateClass(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Class not found.' });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'update', entityType: 'class', entityId: req.params.id, details: req.body });
    res.json({ success: true, message: 'Class updated.' });
  } catch (err) { next(err); }
});

module.exports = router;
