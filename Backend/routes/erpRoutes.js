const express = require('express');
const protect = require('../middlewares/authMiddleware');
const {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
  getSemesters,
  createSemester,
  updateSemester,
  getSubjects,
  createSubject,
  updateSubject,
  getClassrooms,
  createClassroom,
  updateClassroom,
  deleteClassroom,
  getStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  importStudents,
  getPOs,
  createPO,
  getPSOs,
  createPSO,
  getCOs,
  saveCOs,
  getCOPOMappings,
  saveCOPOMappings,
  getAssessments,
  createAssessment,
  loadGradingBoard,
  saveGradingMarks,
  getERPDashboardStats,
  getTeachers,
  getAttainmentHistory
} = require('../controllers/erpController');

const router = express.Router();

// Apply protect middleware to all ERP routes
router.use(protect);

// Dashboard
router.get('/dashboard-stats', getERPDashboardStats);

// Teachers
router.get('/teachers', getTeachers);

// Departments
router.get('/departments', getDepartments);
router.post('/departments', createDepartment);
router.put('/departments/:id', updateDepartment);
router.delete('/departments/:id', deleteDepartment);

// Programs
router.get('/programs', getPrograms);
router.post('/programs', createProgram);
router.put('/programs/:id', updateProgram);
router.delete('/programs/:id', deleteProgram);

// Semesters
router.get('/semesters', getSemesters);
router.post('/semesters', createSemester);
router.put('/semesters/:id', updateSemester);

// Subjects
router.get('/subjects', getSubjects);
router.post('/subjects', createSubject);
router.put('/subjects/:id', updateSubject);

// Classrooms
router.get('/classrooms', getClassrooms);
router.post('/classrooms', createClassroom);
router.put('/classrooms/:id', updateClassroom);
router.delete('/classrooms/:id', deleteClassroom);

// Students
router.get('/students', getStudents);
router.post('/students', createStudent);
router.put('/students/:id', updateStudent);
router.delete('/students/:id', deleteStudent);
router.post('/students/import', importStudents);

// OBE (Outcomes Mapping)
router.get('/obe/pos', getPOs);
router.post('/obe/pos', createPO);
router.get('/obe/psos', getPSOs);
router.post('/obe/psos', createPSO);
router.get('/obe/cos/:subject_id', getCOs);
router.post('/obe/cos', saveCOs);
router.get('/obe/mapping/:subject_id', getCOPOMappings);
router.post('/obe/mapping', saveCOPOMappings);

// Assessments
router.get('/assessments', getAssessments);
router.post('/assessments', createAssessment);

// Marks Grading Board
router.get('/marks/load', loadGradingBoard);
router.post('/marks/save', saveGradingMarks);

// Reports history
router.get('/reports/attainment', getAttainmentHistory);

module.exports = router;
