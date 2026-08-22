import axiosClient from './axiosClient';

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