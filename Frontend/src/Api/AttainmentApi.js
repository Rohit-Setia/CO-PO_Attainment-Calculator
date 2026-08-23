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

// ── Course enrollment ──────────────────────────────────────────────────────
export const fetchCourseEnrollment = (courseId) => axiosClient.get(`/courses/${courseId}/enrollment`);
export const enrollClassInCourse = (courseId, classId) =>
  axiosClient.post(`/courses/${courseId}/enrollment`, { classId });
export const enrollStudentsInCourse = (courseId, studentIds) =>
  axiosClient.post(`/courses/${courseId}/enrollment`, { studentIds });
export const unenrollStudentFromCourse = (courseId, studentId) =>
  axiosClient.delete(`/courses/${courseId}/enrollment/${studentId}`);

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