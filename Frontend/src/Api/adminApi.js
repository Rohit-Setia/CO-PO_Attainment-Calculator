import axiosClient from './axiosClient';

// ── Phase 1 — Teacher Management (Admin) ────────────────────────────────────
// Upload: multipart form with field "file" (.xlsx/.xls/.csv).
export const importTeachersFile = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return axiosClient.post('/admin/teachers/import', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const downloadTeacherImportTemplate = async () => {
  const res = await axiosClient.get('/admin/teachers/import/template', { responseType: 'blob' });
  return res.data;
};

// errors: [{ row, data: {employeeId, name, email, department, designation, phone}, reason }]
export const downloadTeacherImportErrors = async (errors) => {
  const res = await axiosClient.post('/admin/teachers/import/error-file', { errors }, { responseType: 'blob' });
  return res.data;
};

// params: { page, limit, search, departmentId, status: 'active' | 'deleted' | 'all' }
export const fetchTeachers = (params = {}) => axiosClient.get('/admin/teachers', { params });

export const updateTeacherRecord = (id, patch) => axiosClient.put(`/admin/teachers/${id}`, patch);

export const resendTeacherCredential = (id) => axiosClient.post(`/admin/teachers/${id}/resend-credential`);

// ── Delete Teacher (Admin only) ──────────────────────────────────────────────
// Soft deletion: the account is stamped and deactivated, every academic record
// it produced stays intact. All three endpoints are Admin-only server-side, so
// the UI must still gate them — but the server is the real boundary.

// Read-only dependency report. Never mutates, so it is safe to refetch whenever
// the confirmation dialog opens. Shape:
// { teacher, active: { items: [{key,label,count}], total }, historical: {...},
//   blockers, requiresReassignment, canDelete, reasons[] }
export const fetchTeacherDeletionImpact = (id) => axiosClient.get(`/admin/teachers/${id}/impact`);

// payload: { confirm: 'DELETE', reason?, reassignToId? }
// 409 ACTIVE_ASSIGNMENTS → data.blockers lists what still points at the teacher.
// 403 PRIVILEGED_ACCOUNT → the row is an Admin/HOD/Viewer-level account.
export const deleteTeacherRecord = (id, payload) => axiosClient.delete(`/admin/teachers/${id}`, { data: payload });

export const restoreTeacherRecord = (id) => axiosClient.post(`/admin/teachers/${id}/restore`);

// Public — password setup via emailed token (used by SetPasswordPage).
export const requestPasswordSetup = (email) => axiosClient.post('/auth/password-setup/request', { email });
export const confirmPasswordSetup = (token, password) => axiosClient.post('/auth/password-setup/confirm', { token, password });