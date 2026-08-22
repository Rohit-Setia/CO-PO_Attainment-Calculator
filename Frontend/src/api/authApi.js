import axiosClient from './axiosClient';

export const signUpTeacher = (payload) => axiosClient.post('/auth/signup', payload);
export const loginTeacher = (payload) => axiosClient.post('/auth/login', payload);
export const fetchDashboard = () => axiosClient.get('/auth/dashboard');

// Admin-only user management
export const fetchAllUsers = () => axiosClient.get('/auth/admin/users');
export const updateUserRoleStatus = (userId, patch) => axiosClient.put(`/auth/admin/users/${userId}`, patch);
