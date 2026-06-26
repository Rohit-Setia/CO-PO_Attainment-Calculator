import axiosClient from './axiosClient';

// Courses CRUD
export const fetchCourses = () => axiosClient.get('/courses');
export const createCourse = (payload) => axiosClient.post('/courses', payload);
export const deleteCourse = (id) => axiosClient.delete(`/courses/${id}`);

// Configurations & CO Descriptions
export const fetchCourseConfig = (id) => axiosClient.get(`/courses/${id}/config`);
export const saveCourseConfig = (id, payload) => axiosClient.post(`/courses/${id}/config`, payload);

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