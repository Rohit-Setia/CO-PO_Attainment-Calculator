import axiosClient from './axiosClient';

// ── University hierarchy (Phase 3/4) ───────────────────────────────────────
export const fetchSchools = () => axiosClient.get('/schools');
export const fetchDepartments = (schoolId) =>
  axiosClient.get('/departments', { params: schoolId ? { schoolId } : {} });
export const fetchPrograms = (departmentId) =>
  axiosClient.get('/programs', { params: departmentId ? { departmentId } : {} });
export const fetchSessions = () => axiosClient.get('/sessions');
export const fetchClasses = (filters = {}) =>
  axiosClient.get('/classes', { params: filters });
export const fetchClassStudents = (classId) => axiosClient.get(`/classes/${classId}/students`);
export const fetchBranches = (departmentId) =>
  axiosClient.get('/branches', { params: departmentId ? { departmentId } : {} });

// ── Academic Administration (Phase 7) — Schools/Departments/Branches/Programs/
// Sessions/Classes CRUD. Backend enforces Admin (unscoped) / School Admin (own school) /
// Department Admin (own department) — the frontend only hides actions the role can't take.
export const createSchool = (payload) => axiosClient.post('/schools', payload);
export const updateSchool = (id, payload) => axiosClient.put(`/schools/${id}`, payload);

export const createDepartment = (payload) => axiosClient.post('/departments', payload);
export const updateDepartment = (id, payload) => axiosClient.put(`/departments/${id}`, payload);

export const createBranch = (payload) => axiosClient.post('/branches', payload);

export const createProgram = (payload) => axiosClient.post('/programs', payload);
export const updateProgram = (id, payload) => axiosClient.put(`/programs/${id}`, payload);

export const createSession = (payload) => axiosClient.post('/sessions', payload);
export const updateSession = (id, payload) => axiosClient.put(`/sessions/${id}`, payload);

export const createClass = (payload) => axiosClient.post('/classes', payload);
export const updateClass = (id, payload) => axiosClient.put(`/classes/${id}`, payload);

// ── Student Master administration (Phase 7) ────────────────────────────────
export const fetchStudents = (filters = {}) => axiosClient.get('/students', { params: filters });
export const fetchStudent = (id) => axiosClient.get(`/students/${id}`);
export const createStudent = (payload) => axiosClient.post('/students', payload);
export const updateStudentRecord = (id, payload) => axiosClient.put(`/students/${id}`, payload);
export const mapStudentToClass = (id, payload) => axiosClient.post(`/students/${id}/map`, payload);

// ── Course administration (Phase 7) ────────────────────────────────────────
export const updateCourseStatus = (id, status) => axiosClient.put(`/courses/${id}/status`, { status });
export const assignFacultyToCourse = (id, payload) => axiosClient.post(`/courses/${id}/assign`, payload);
export const removeFacultyFromCourse = (id, userId) => axiosClient.delete(`/courses/${id}/assign/${userId}`);
export const fetchCourseAssignments = (id) => axiosClient.get(`/courses/${id}/assignments`);

// ── Course enrollment ──────────────────────────────────────────────────────
export const fetchCourseEnrollment = (courseId) => axiosClient.get(`/courses/${courseId}/enrollment`);
export const enrollClassInCourse = (courseId, classId) =>
  axiosClient.post(`/courses/${courseId}/enrollment`, { classId });
export const enrollStudentsInCourse = (courseId, studentIds) =>
  axiosClient.post(`/courses/${courseId}/enrollment`, { studentIds });
export const unenrollStudentFromCourse = (courseId, studentId) =>
  axiosClient.delete(`/courses/${courseId}/enrollment/${studentId}`);

// ── Student Academic Hierarchy (Phase 10) ──────────────────────────────────
// Students belong to the course's academic context (Program + Session + Semester).
// The Teacher uploads only student-specific data; the backend derives the context.
export const fetchCourseStudents = (courseId) => axiosClient.get(`/courses/${courseId}/students`);
export const uploadCourseStudents = (courseId, students) =>
  axiosClient.post(`/courses/${courseId}/students/upload`, { students });
export const syncCourseEnrollment = (courseId) =>
  axiosClient.post(`/courses/${courseId}/enrollment/sync-context`);

// ── Program Outcomes (PEO / PO / PSO) — Phase 12 ───────────────────────────
// The Program owns its outcome definitions; the articulation matrix and attainment
// views read them dynamically. Writes are restricted to academic-administration roles.
export const fetchProgramOutcomes = (programId, type) =>
  axiosClient.get(`/programs/${programId}/outcomes`, { params: type ? { type } : {} });
export const saveProgramOutcomesBulk = (programId, type, outcomes) =>
  axiosClient.put(`/programs/${programId}/outcomes`, { type, outcomes });
export const createProgramOutcome = (programId, outcome) =>
  axiosClient.post(`/programs/${programId}/outcomes`, outcome);
export const updateProgramOutcome = (programId, outcomeId, patch) =>
  axiosClient.put(`/programs/${programId}/outcomes/${outcomeId}`, patch);
export const deleteProgramOutcome = (programId, outcomeId) =>
  axiosClient.delete(`/programs/${programId}/outcomes/${outcomeId}`);

// ── Course academic mapping (Phase 3K) ─────────────────────────────────────
export const mapCourseAcademicContext = (courseId, payload) =>
  axiosClient.put(`/courses/${courseId}/academic-map`, payload);

// Aggregate dashboard view across every accessible course. Optional hierarchy filters
// (schoolId/departmentId/programId/sessionId/semester) narrow the same RBAC-scoped course
// set — omitting them all reproduces the original unfiltered university-wide summary.
export const fetchDashboardSummary = (filters = {}) => {
  const params = {};
  if (filters.schoolId) params.schoolId = filters.schoolId;
  if (filters.departmentId) params.departmentId = filters.departmentId;
  if (filters.programId) params.programId = filters.programId;
  if (filters.sessionId) params.sessionId = filters.sessionId;
  if (filters.semester && filters.semester !== 'all') params.semester = filters.semester;
  return axiosClient.get('/dashboard/summary', { params });
};

// Section/Class-level dashboard: real roster + real enrolled-course attainment, reusing the
// same aggregation service and calculation engine as fetchDashboardSummary.
export const fetchClassDashboard = (classId) => axiosClient.get(`/dashboard/class/${classId}`);

// Courses CRUD
export const fetchCourses = () => axiosClient.get('/courses');
export const createCourse = (payload) => axiosClient.post('/courses', payload);
export const deleteCourse = (id) => axiosClient.delete(`/courses/${id}`);

// Configurations (thresholds/weights) — CO list itself lives under /outcomes
export const fetchCourseConfig = (id) => axiosClient.get(`/courses/${id}/config`);
export const saveCourseConfig = (id, payload) => axiosClient.post(`/courses/${id}/config`, payload);

// Course Outcomes — dynamic add/edit/archive, teacher-controlled
export const addCourseOutcome = (id, payload) => axiosClient.post(`/courses/${id}/outcomes`, payload);
export const updateCourseOutcome = (id, coId, payload) => axiosClient.put(`/courses/${id}/outcomes/${coId}`, payload);
export const archiveCourseOutcome = (id, coId) => axiosClient.delete(`/courses/${id}/outcomes/${coId}`);

// Question Paper Configuration — dynamic question count + teacher-controlled question->CO mapping
export const fetchQuestionConfig = (id, examType) => axiosClient.get(`/courses/${id}/questions`, { params: { examType } });
export const saveQuestionConfig = (id, payload) => axiosClient.post(`/courses/${id}/questions`, payload);

// Mappings Matrix
export const fetchCourseMapping = (id) => axiosClient.get(`/courses/${id}/mapping`);
export const saveCourseMapping = (id, payload) => axiosClient.post(`/courses/${id}/mapping`, payload);

// Student Marks Upload & Retrieval
export const fetchCourseMarks = (id) => axiosClient.get(`/courses/${id}/marks`);
export const saveCourseMarks = (id, payload) => axiosClient.post(`/courses/${id}/marks`, payload);

// Attainment Calculations
export const fetchCourseAttainment = (id) => axiosClient.get(`/courses/${id}/attainment`);

// Download Excel File
export const downloadCourseExcel = async (id) => {
  const res = await axiosClient.get(`/courses/${id}/export-excel`, { responseType: 'blob' });
  return res.data;
};

// Course JSON Snapshot Export / Import
export const exportCourseJson  = (id)         => axiosClient.get(`/courses/${id}/export-json`);
export const importCourseJson  = (courseData) => axiosClient.post('/courses/import-json', { courseData });

// ── Marks Excel (Phase 5) — template download + validated import ──────────
// Template is generated server-side from Course Enrollment (source of truth).
export const downloadMarksTemplate = async (courseId, examType) => {
  const res = await axiosClient.get(`/courses/${courseId}/marks-template`, {
    params: { examType },
    responseType: 'blob',
  });
  return res;
};
// Step 2/3 of import — validate + preview. Nothing is written to the database.
export const previewMarksImport = (courseId, payload) =>
  axiosClient.post(`/courses/${courseId}/marks/import-preview`, payload);
// Step 4 — teacher confirmed. Saves through the existing marks pipeline (upsert — no duplicates).
export const confirmMarksImport = (courseId, payload) =>
  axiosClient.post(`/courses/${courseId}/marks/import`, payload);

// ── Program OBE Analytics & Reporting (Phase 13) ───────────────────────────
// The backend is the single authoritative calculation source — these helpers only
// fetch aggregated results (dashboard / attainment / validation / reports).
const obeParams = (filters = {}) => {
  const params = {};
  if (filters.sessionId || filters.batchId) params.sessionId = filters.sessionId || filters.batchId;
  if (filters.semester && filters.semester !== 'all') params.semester = filters.semester;
  if (filters.versionLabel) params.versionLabel = filters.versionLabel;
  return params;
};

export const fetchProgramOBEDashboard = (programId, filters) =>
  axiosClient.get(`/programs/${programId}/obe/dashboard`, { params: obeParams(filters) });
export const fetchProgramCOAttainment = (programId, filters) =>
  axiosClient.get(`/programs/${programId}/obe/co-attainment`, { params: obeParams(filters) });
export const fetchProgramPOAttainment = (programId, filters) =>
  axiosClient.get(`/programs/${programId}/obe/po-attainment`, { params: obeParams(filters) });
export const fetchProgramPSOAttainment = (programId, filters) =>
  axiosClient.get(`/programs/${programId}/obe/pso-attainment`, { params: obeParams(filters) });
export const fetchOutcomeCourseContributions = (programId, outcomeCode, filters) =>
  axiosClient.get(`/programs/${programId}/obe/course-contributions`, {
    params: { ...obeParams(filters), [outcomeCode.toUpperCase().startsWith('PSO') ? 'pso' : 'po']: outcomeCode },
  });
export const fetchProgramOBEValidation = (programId, filters) =>
  axiosClient.get(`/programs/${programId}/obe/validation`, { params: obeParams(filters) });
export const fetchCODrilldownStudents = (programId, courseId, coNumber) =>
  axiosClient.get(`/programs/${programId}/obe/course/${courseId}/co/${coNumber}/students`);

// Improvement / action plans — historical continuous-improvement records.
export const fetchActionPlans = (programId, filters) =>
  axiosClient.get(`/programs/${programId}/obe/action-plans`, { params: obeParams(filters) });
export const createActionPlanRecord = (programId, payload) =>
  axiosClient.post(`/programs/${programId}/obe/action-plans`, payload);
export const updateActionPlanRecord = (programId, planId, patch) =>
  axiosClient.put(`/programs/${programId}/obe/action-plans/${planId}`, patch);
export const deleteActionPlanRecord = (programId, planId) =>
  axiosClient.delete(`/programs/${programId}/obe/action-plans/${planId}`);

// Outcome versions — program curriculum outcome versioning.
export const fetchOutcomeVersions = (programId) =>
  axiosClient.get(`/programs/${programId}/obe/outcome-versions`);
export const createOutcomeVersionRecord = (programId, payload) =>
  axiosClient.post(`/programs/${programId}/obe/outcome-versions`, payload);

// Report export — format: json | excel | csv | pdf(printable HTML).
export const downloadOBEReport = async (programId, filters, format) => {
  const res = await axiosClient.get(`/programs/${programId}/obe/report`, {
    params: { ...obeParams(filters), format },
    responseType: format === 'json' ? 'json' : 'blob',
  });
  return res.data;
};