import axiosClient from './axiosClient';

export const signUpTeacher = (payload) => axiosClient.post('/auth/signup', payload);
export const loginTeacher = (payload) => axiosClient.post('/auth/login', payload);
export const fetchDashboard = () => axiosClient.get('/auth/dashboard');
