import axiosClient from './axiosClient';

// ── Question paper upload / extraction ──────────────────────────────────────
export const uploadQuestionPaper = (file, { courseId, examType, paperSet }) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('courseId', courseId);
  fd.append('examType', examType);
  if (paperSet) fd.append('paperSet', paperSet);
  return axiosClient.post('/examinations/papers', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// filters: { courseId, examType, status, programId, semester, schoolId, departmentId }
export const fetchQuestionPapers = (filters = {}) => axiosClient.get('/examinations/papers', { params: filters });
export const fetchQuestionPaperDetail = (paperId) => axiosClient.get(`/examinations/papers/${paperId}`);

// ── My assignments (Teacher "My Assigned Examinations") ─────────────────────
export const fetchMyExamAssignments = () => axiosClient.get('/examinations/my-assignments');

// ── Assignments (reviewer / approver / marks-entry) ──────────────────────────
export const assignPaperResponsibility = (paperId, payload) =>
  axiosClient.post(`/examinations/papers/${paperId}/assignments`, payload);
export const removePaperAssignment = (paperId, assignmentId) =>
  axiosClient.delete(`/examinations/papers/${paperId}/assignments/${assignmentId}`);
export const assignClassToPaper = (paperId, classId) =>
  axiosClient.post(`/examinations/papers/${paperId}/assign-class`, { classId });

// ── Review / correction / workflow transitions ───────────────────────────────
export const correctPaperQuestion = (paperId, questionConfigId, payload) =>
  axiosClient.put(`/examinations/papers/${paperId}/questions/${questionConfigId}`, payload);
export const verifyPaper = (paperId) => axiosClient.post(`/examinations/papers/${paperId}/verify`);
export const approvePaper = (paperId) => axiosClient.post(`/examinations/papers/${paperId}/approve`);
export const rejectPaper = (paperId, reason) => axiosClient.post(`/examinations/papers/${paperId}/reject`, { reason });
// Supersedes a REJECTED paper with a corrected re-upload — creates a new versioned
// paper row (extraction runs again) and links the old one to it via superseded_by_id.
export const reuploadPaper = (paperId, file) => {
  const fd = new FormData();
  fd.append('file', file);
  return axiosClient.post(`/examinations/papers/${paperId}/reupload`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// ── Auto-Mapping Review (extraction draft → Confirm & Publish) ──────────────
// Returns { paper, draft, review, course, ai }. `review` holds the server's verdicts
// (row status, issues, canPublish) — the screen renders them, it does not recompute them.
export const fetchPaperDraft = (paperId) => axiosClient.get(`/examinations/papers/${paperId}/draft`);
// payload: { revision, meta?: { maxMarks, durationMinutes }, rows: [{ key, ...editable fields }] }
export const savePaperDraft = (paperId, payload) => axiosClient.put(`/examinations/papers/${paperId}/draft`, payload);
// engine 'ai' falls back to keyword suggestions when AI is not configured or fails.
export const suggestPaperMapping = (paperId, engine = 'ai') =>
  axiosClient.post(`/examinations/papers/${paperId}/draft/suggest`, { engine });
export const confirmPaperMapping = (paperId, revision) =>
  axiosClient.post(`/examinations/papers/${paperId}/confirm`, { revision });

// ── Marks submission lifecycle ────────────────────────────────────────────────
// classId scopes the action to one section. Omit it only for a paper with no
// class-scoped evaluator — with classes allocated, each section submits and locks
// on its own.
export const submitPaperMarks = (paperId, classId = null) =>
  axiosClient.post(`/examinations/papers/${paperId}/marks-submission/submit`, { classId });
export const lockPaperMarks = (paperId, classId = null) =>
  axiosClient.post(`/examinations/papers/${paperId}/marks-submission/lock`, { classId });
export const reopenPaperMarks = (paperId, reason, classId = null) =>
  axiosClient.post(`/examinations/papers/${paperId}/marks-submission/reopen`, { reason, classId });

// ── Examination campaigns ─────────────────────────────────────────────────────
export const fetchExaminations = (params = {}) => axiosClient.get('/examinations', { params });
export const fetchExamination = (id) => axiosClient.get(`/examinations/${id}`);
export const createExamination = (payload) => axiosClient.post('/examinations', payload);
export const updateExamination = (id, patch) => axiosClient.patch(`/examinations/${id}`, patch);

// ── Bulk teacher allocation ───────────────────────────────────────────────────
// Template → preview → import. The preview writes nothing; the import re-validates
// the same file server-side and writes only the rows that are still valid.
export const downloadAllocationTemplate = async (examinationId) => {
  const res = await axiosClient.get(`/examinations/${examinationId}/allocation-template`, { responseType: 'blob' });
  return res.data;
};

const allocationFormData = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return fd;
};

export const previewAllocation = (examinationId, file) =>
  axiosClient.post(`/examinations/${examinationId}/allocation/preview`, allocationFormData(file), {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const importAllocation = (examinationId, file) =>
  axiosClient.post(`/examinations/${examinationId}/allocation/import`, allocationFormData(file), {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

// rows: the preview's rows[] — only the invalid ones are written to the workbook.
export const downloadAllocationErrors = async (examinationId, rows) => {
  const res = await axiosClient.post(
    `/examinations/${examinationId}/allocation/error-file`, { rows }, { responseType: 'blob' },
  );
  return res.data;
};

// ── Dashboard stats ────────────────────────────────────────────────────────────
export const fetchExaminationStats = () => axiosClient.get('/examinations/stats');

// ── Notifications ──────────────────────────────────────────────────────────────
export const fetchNotifications = (unreadOnly = false) =>
  axiosClient.get('/notifications', { params: unreadOnly ? { unreadOnly: 'true' } : {} });
export const markNotificationRead = (id) => axiosClient.patch(`/notifications/${id}/read`);
