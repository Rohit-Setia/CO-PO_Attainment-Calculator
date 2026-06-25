import axiosClient from './axiosClient';

// ERP Dashboard Stats
export const fetchERPDashboardStats = () => axiosClient.get('/erp/dashboard-stats');

// Teachers
export const fetchTeachers = () => axiosClient.get('/erp/teachers');

// Departments
export const fetchDepartments = () => axiosClient.get('/erp/departments');
export const createDepartment = (payload) => axiosClient.post('/erp/departments', payload);
export const updateDepartment = (id, payload) => axiosClient.put(`/erp/departments/${id}`, payload);
export const deleteDepartment = (id) => axiosClient.delete(`/erp/departments/${id}`);

// Programs
export const fetchPrograms = () => axiosClient.get('/erp/programs');
export const createProgram = (payload) => axiosClient.post('/erp/programs', payload);
export const updateProgram = (id, payload) => axiosClient.put(`/erp/programs/${id}`, payload);
export const deleteProgram = (id) => axiosClient.delete(`/erp/programs/${id}`);

// Semesters
export const fetchSemesters = () => axiosClient.get('/erp/semesters');
export const createSemester = (payload) => axiosClient.post('/erp/semesters', payload);
export const updateSemester = (id, payload) => axiosClient.put(`/erp/semesters/${id}`, payload);

// Subjects
export const fetchSubjects = () => axiosClient.get('/erp/subjects');
export const createSubject = (payload) => axiosClient.post('/erp/subjects', payload);
export const updateSubject = (id, payload) => axiosClient.put(`/erp/subjects/${id}`, payload);

// Classrooms
export const fetchClassrooms = () => axiosClient.get('/erp/classrooms');
export const createClassroom = (payload) => axiosClient.post('/erp/classrooms', payload);
export const updateClassroom = (id, payload) => axiosClient.put(`/erp/classrooms/${id}`, payload);
export const deleteClassroom = (id) => axiosClient.delete(`/erp/classrooms/${id}`);

// Students
export const fetchStudents = (params) => axiosClient.get('/erp/students', { params });
export const createStudent = (payload) => axiosClient.post('/erp/students', payload);
export const updateStudent = (id, payload) => axiosClient.put(`/erp/students/${id}`, payload);
export const deleteStudent = (id) => axiosClient.delete(`/erp/students/${id}`);
export const importStudents = (payload) => axiosClient.post('/erp/students/import', payload);

// OBE Outcomes
export const fetchPOs = () => axiosClient.get('/erp/obe/pos');
export const createPO = (payload) => axiosClient.post('/erp/obe/pos', payload);
export const fetchPSOs = () => axiosClient.get('/erp/obe/psos');
export const createPSO = (payload) => axiosClient.post('/erp/obe/psos', payload);
export const fetchCOs = (subjectId) => axiosClient.get(`/erp/obe/cos/${subjectId}`);
export const saveCOs = (payload) => axiosClient.post('/erp/obe/cos', payload);
export const fetchCOPOMappings = (subjectId) => axiosClient.get(`/erp/obe/mapping/${subjectId}`);
export const saveCOPOMappings = (payload) => axiosClient.post('/erp/obe/mapping', payload);

// Assessments
export const fetchAssessments = (classroom_id, subject_id) => 
  axiosClient.get('/erp/assessments', { params: { classroom_id, subject_id } });
export const createAssessment = (payload) => axiosClient.post('/erp/assessments', payload);

// Grading
export const fetchGradingBoard = (classroom_id, assessment_id) =>
  axiosClient.get('/erp/marks/load', { params: { classroom_id, assessment_id } });
export const saveGradingMarks = (payload) => axiosClient.post('/erp/marks/save', payload);
export const triggerDBAttainmentCalculation = (payload) => axiosClient.post('/calculate', payload);
export const fetchAttainmentHistory = (subject_id, classroom_id) =>
  axiosClient.get('/erp/reports/attainment', { params: { subject_id, classroom_id } });
