// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Teacher Management routes (Admin namespace).
//
// RBAC:
//   * GET (directory/template) — Admin + HOD-level roles (Moderator / School
//     Admin / Department Admin) so HODs can browse faculty.
//   * POST/PUT (import, edits, credential resend) — Admin only for now; the
//     per-scope variance is a deliberate future phase (department-admin scoping).
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const protect = require('../middlewares/authMiddleware');
const { authorizeRoles, MODERATOR_ROLES } = require('../middlewares/roleMiddleware');
const { upload } = require('../middlewares/upload');
const {
  importTeacherFile,
  downloadImportTemplate,
  downloadImportErrorFile,
  listTeacherDirectory,
  updateTeacher,
  resendCredentialEmail,
  getTeacherDeletionImpact,
  deleteTeacher,
  restoreTeacher,
} = require('../controllers/teacherController');

// Bulk import (multipart: field name "file"). Returns the import summary and skips
// error rows with reasons; errors can be downloaded via the error-file endpoint.
router.post(
  '/teachers/import',
  protect,
  authorizeRoles('Admin'),
  upload.single('file'),
  importTeacherFile,
);

// Fresh blank import template.
router.get('/teachers/import/template', protect, authorizeRoles(...MODERATOR_ROLES), downloadImportTemplate);

// Error workbook for a previously returned errors[] list.
router.post('/teachers/import/error-file', protect, authorizeRoles(...MODERATOR_ROLES), downloadImportErrorFile);

// Paginated/filterable teacher directory.
router.get('/teachers', protect, authorizeRoles(...MODERATOR_ROLES), listTeacherDirectory);

// Edit a teacher's profile/role/department.
router.put('/teachers/:id', protect, authorizeRoles('Admin'), updateTeacher);

// Regenerate the password-setup token + credential email for a teacher.
router.post('/teachers/:id/resend-credential', protect, authorizeRoles('Admin'), resendCredentialEmail);

// ── Deletion ──────────────────────────────────────────────────────────────────
// Admin only — deliberately NOT MODERATOR_ROLES. HODs and School/Department Admins
// browse the directory but cannot remove accounts from it.
//
// Read-only dependency report used to populate the confirmation dialog. It never
// mutates anything, so it is safe to call on every dialog open.
router.get('/teachers/:id/impact', protect, authorizeRoles('Admin'), getTeacherDeletionImpact);

// Soft delete. Body: { confirm: 'DELETE', reason?, reassignToId? }.
// Returns 409 ACTIVE_ASSIGNMENTS when live work still points at the teacher and no
// reassignToId was supplied; 403 PRIVILEGED_ACCOUNT for non-Teacher/Viewer rows.
router.delete('/teachers/:id', protect, authorizeRoles('Admin'), deleteTeacher);

// Reverse a soft delete. Reassignment performed at delete time is not undone.
router.post('/teachers/:id/restore', protect, authorizeRoles('Admin'), restoreTeacher);

module.exports = router;