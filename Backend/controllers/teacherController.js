// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Teacher Management controller (Admin).
// Thin HTTP wrapper over teacherImportService + userModel + emailService.
// ─────────────────────────────────────────────────────────────────────────────
const {
  importTeachers,
  buildImportTemplateWorkbook,
  buildImportErrorWorkbook,
} = require('../services/teacherImportService');
const {
  findUserById,
  listTeachers,
  updateTeacherProfile,
  createPasswordSetupToken,
} = require('../models/userModel');
const { sendMail, buildCredentialEmail } = require('../services/emailService');
const { logAction, logActionInTransaction } = require('../models/adminAuditModel');
const { withTransaction } = require('../utils/transaction');
const {
  DELETABLE_ROLES,
  ACTIVE_PROBES,
  HISTORICAL_PROBES,
  runProbes,
  getTeacherAccount,
  getReassignmentTarget,
  reassignActiveWork,
  softDeleteTeacher,
  restoreTeacherAccount,
  invalidatePendingTokens,
} = require('../models/teacherDeletionModel');
const crypto = require('crypto');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const streamWorkbook = async (res, workbook, filename) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
};

// POST /api/admin/teachers/import — multipart field "file"
const importTeacherFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an Excel (.xlsx/.xls) or CSV file.' });
    }
    if (req.file.size > (Number(process.env.MAX_UPLOAD_MB) || 15) * 1024 * 1024) {
      return res.status(413).json({ success: false, message: `Uploaded file exceeds the ${process.env.MAX_UPLOAD_MB || 15} MB size limit.` });
    }

    const result = await importTeachers({ buffer: req.file.buffer, filename: req.file.originalname });

    if (result.headerError) {
      return res.status(400).json({ success: false, message: result.headerError });
    }

    await logAction({
      actorUserId: req.user.id,
      actorName: req.user.name || req.user.email,
      action: 'BULK_TEACHER_IMPORT',
      entityType: 'teachers',
      entityId: null,
      details: { total: result.summary.totalRecords, created: result.summary.created, errors: result.summary.errors.length },
    });

    const message = result.summary.created > 0
      ? `Imported ${result.summary.created} teacher(s).`
      : 'No new teachers were created. Review the summary for skipped records.';

    return res.json({
      success: true,
      message,
      data: {
        summary: result.summary,
        createdAccounts: result.created,
        emails: result.emails,
      },
    });
  } catch (err) {
    // Multer errors (LIMIT_FILE_SIZE / file filter) carry code/status from our middleware.
    const status = err.status || err.code === 'LIMIT_FILE_SIZE' ? 413 : undefined;
    if (status) return res.status(status).json({ success: false, message: err.message });
    return next(err);
  }
};

// GET /api/admin/teachers/import/template
const downloadImportTemplate = async (req, res, next) => {
  try {
    const workbook = await buildImportTemplateWorkbook();
    await streamWorkbook(res, workbook, 'teacher_import_template.xlsx');
  } catch (err) { next(err); }
};

// POST /api/admin/teachers/import/error-file — body { errors: [{ row, data, reason }] }
const downloadImportErrorFile = async (req, res, next) => {
  try {
    const { errors } = req.body;
    if (!Array.isArray(errors) || errors.length === 0) {
      return res.status(400).json({ success: false, message: 'No errors to export.' });
    }
    const workbook = await buildImportErrorWorkbook(errors);
    await streamWorkbook(res, workbook, 'teacher_import_errors.xlsx');
  } catch (err) { next(err); }
};
// GET /api/admin/teachers?page=&limit=&search=&departmentId=&status=active|deleted|all
const listTeacherDirectory = async (req, res, next) => {
  try {
    const { page, limit, search, departmentId, status } = req.query;
    const requested = String(status || 'active').toLowerCase();
    const safeStatus = ['active', 'deleted', 'all'].includes(requested) ? requested : 'active';
    const data = await listTeachers({
      page, limit,
      search: search || '',
      departmentId: departmentId || null,
      status: safeStatus,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// PUT /api/admin/teachers/:id
const updateTeacher = async (req, res, next) => {
  try {
    const existing = await findUserById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Teacher not found.' });
    if (existing.deleted_at) {
      return res.status(409).json({ success: false, code: 'ALREADY_DELETED', message: 'This teacher is deleted. Restore the account before editing it.' });
    }

    const { name, email, username, employeeId, designation, phone, departmentId, role, is_active } = req.body;
    const updated = await updateTeacherProfile(req.params.id, {
      name, email, username, employeeId, designation, phone, departmentId, role, is_active,
    });
    if (!updated) return res.status(400).json({ success: false, message: 'No changes were provided.' });

    await logAction({
      actorUserId: req.user.id,
      actorName: req.user.name || req.user.email,
      action: 'UPDATE_TEACHER',
      entityType: 'teachers',
      entityId: Number(req.params.id),
      details: { changed: Object.keys({ name, email, username, employeeId, designation, phone, departmentId, role, is_active }).filter((k) => req.body[k] !== undefined) },
    });

    res.json({ success: true, message: 'Teacher updated successfully.' });
  } catch (err) { next(err); }
};

// POST /api/admin/teachers/:id/resend-credential — regenerate setup token + email
const resendCredentialEmail = async (req, res, next) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Teacher not found.' });

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresHours = Number(process.env.PASSWORD_RESET_EXPIRY_HOURS || 24);
    await createPasswordSetupToken({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + expiresHours * 3600 * 1000),
      purpose: 'password_setup',
    });

    const { subject, html } = buildCredentialEmail({
      name: user.name,
      employeeId: user.employee_id,
      username: user.username,
      email: user.email,
      setupToken: token,
    });
    const mailResult = await sendMail({ to: user.email, subject, html });

    await logAction({
      actorUserId: req.user.id,
      actorName: req.user.name || req.user.email,
      action: 'RESEND_TEACHER_CREDENTIAL',
      entityType: 'teachers',
      entityId: user.id,
      details: { mode: mailResult.simulated ? 'simulated' : 'sent' },
    });

    return res.json({
      success: true,
      message: mailResult.simulated
        ? 'Credential email simulated (SMTP not enabled). See server log.'
        : `Credential email sent to ${user.email}.`,
      data: { sent: mailResult.sent, simulated: !!mailResult.simulated },
    });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────────────────────
// Teacher deletion (soft, non-destructive).
//
// A hard `DELETE FROM teachers` is impossible on this schema: 9 of the 11 foreign
// keys on teachers(id) are ON DELETE CASCADE and courses.teacher_id drags student
// marks, enrollments, COs, CO-PO mappings and question papers down with it. These
// handlers therefore stamp the account as deleted, deactivate it, and leave every
// academic reference intact. See models/teacherDeletionModel.js for the full note.
// ─────────────────────────────────────────────────────────────────────────────

// Carries an intended HTTP status out of withTransaction so the route can answer
// 403/404/409 without the transaction helper mistaking it for an unexpected failure.
const httpError = (status, message, code, data) => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.data = data;
  return err;
};

const parsePositiveInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const shapeTeacher = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  username: row.username,
  employeeId: row.employee_id,
  designation: row.designation,
  role: row.role,
  isActive: !!row.is_active,
  departmentName: row.department_name || null,
  schoolName: row.school_name || null,
  deletedAt: row.deleted_at,
  deletedBy: row.deleted_by,
  deleteReason: row.delete_reason,
});

// GET /api/admin/teachers/:id/impact — read-only dependency report.
const getTeacherDeletionImpact = async (req, res, next) => {
  try {
    const teacherId = parsePositiveInt(req.params.id);
    if (!teacherId) return res.status(400).json({ success: false, message: 'A valid teacher id is required.' });

    const target = await getTeacherAccount(teacherId);
    if (!target) return res.status(404).json({ success: false, message: 'Teacher not found.' });

    const active = await runProbes(ACTIVE_PROBES, teacherId);
    const historical = await runProbes(HISTORICAL_PROBES, teacherId);
    const blockers = active.items.filter((i) => i.count > 0);

    const reasons = [];
    if (target.deleted_at) reasons.push('This account has already been deleted.');
    if (!DELETABLE_ROLES.includes(target.role)) {
      reasons.push(`Only Teacher and Viewer accounts can be deleted here. This account is a ${target.role}.`);
    }
    if (blockers.length > 0) {
      reasons.push('Active assignments must be reassigned to another teacher first.');
    }

    return res.json({
      success: true,
      data: {
        teacher: shapeTeacher(target),
        active,
        historical,
        blockers,
        requiresReassignment: blockers.length > 0 && !target.deleted_at,
        canDelete: reasons.length === 0,
        reasons,
      },
    });
  } catch (err) { next(err); }
};
// DELETE /api/admin/teachers/:id — body { confirm: 'DELETE', reason?, reassignToId? }
const deleteTeacher = async (req, res, next) => {
  try {
    const teacherId = parsePositiveInt(req.params.id);
    if (!teacherId) return res.status(400).json({ success: false, message: 'A valid teacher id is required.' });

    const { confirm, reason, reassignToId } = req.body || {};
    if (typeof confirm !== 'string' || confirm.trim() !== 'DELETE') {
      return res.status(400).json({
        success: false,
        code: 'CONFIRMATION_REQUIRED',
        message: 'Type DELETE in the confirmation field to proceed.',
      });
    }
    if (teacherId === Number(req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    }
    if (typeof reason === 'string' && reason.trim().length > 255) {
      return res.status(400).json({ success: false, message: 'Reason must be 255 characters or fewer.' });
    }
    const trimmedReason = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 255) : null;

    const reassignTargetId = reassignToId === undefined || reassignToId === null || reassignToId === ''
      ? null
      : parsePositiveInt(reassignToId);
    if (reassignToId && !reassignTargetId) {
      return res.status(400).json({ success: false, message: 'The reassignment target is not a valid account.' });
    }
    if (reassignTargetId === teacherId) {
      return res.status(400).json({ success: false, message: 'A teacher cannot be reassigned to themselves.' });
    }

    const outcome = await withTransaction(async (conn) => {
      // Row lock: a second concurrent delete sees deleted_at already set and 409s.
      const target = await getTeacherAccount(teacherId, conn, { forUpdate: true });
      if (!target) throw httpError(404, 'Teacher not found.');
      if (target.deleted_at) throw httpError(409, 'This teacher has already been deleted.', 'ALREADY_DELETED');
      if (!DELETABLE_ROLES.includes(target.role)) {
        throw httpError(403, `Only Teacher and Viewer accounts can be deleted here. This account is a ${target.role}.`, 'PRIVILEGED_ACCOUNT');
      }

      const active = await runProbes(ACTIVE_PROBES, teacherId, conn);
      const blockers = active.items.filter((i) => i.count > 0);

      let reassignment = null;
      if (blockers.length > 0) {
        if (!reassignTargetId) {
          throw httpError(409, 'This teacher still holds active assignments. Reassign them to another teacher to continue.', 'ACTIVE_ASSIGNMENTS', { blockers });
        }
        const successor = await getReassignmentTarget(reassignTargetId, conn, { forUpdate: true });
        if (!successor) throw httpError(400, 'The reassignment target account does not exist.');
        if (successor.deleted_at) throw httpError(400, 'The reassignment target account is itself deleted.');
        if (!successor.is_active) throw httpError(400, 'The reassignment target account is inactive and cannot take on work.');
        reassignment = await reassignActiveWork({ fromUserId: teacherId, toUserId: reassignTargetId }, conn);
        reassignment.to = { id: successor.id, name: successor.name, email: successor.email };
      }

      // Snapshot the preserved footprint after any reassignment, so the audit row
      // records exactly what this delete left behind.
      const historical = await runProbes(HISTORICAL_PROBES, teacherId, conn);

      const deleted = await softDeleteTeacher({ teacherId, actorUserId: req.user.id, reason: trimmedReason }, conn);
      if (!deleted) throw httpError(409, 'This teacher has already been deleted.', 'ALREADY_DELETED');

      const tokensInvalidated = await invalidatePendingTokens(teacherId, conn);

      const auditId = await logActionInTransaction(conn, {
        actorUserId: req.user.id,
        actorName: req.user.name || req.user.email,
        action: 'DELETE_TEACHER',
        entityType: 'teachers',
        entityId: teacherId,
        details: {
          targetEmail: target.email,
          targetRole: target.role,
          reason: trimmedReason,
          mode: 'soft-delete',
          reassignment,
          preservedHistory: historical.items,
          tokensInvalidated,
        },
      });

      return { target, historical, reassignment, tokensInvalidated, auditId };
    });

    return res.json({
      success: true,
      message: `${outcome.target.name} has been removed from the Teacher Directory. All academic history was preserved.`,
      data: {
        teacher: shapeTeacher(outcome.target),
        reassignment: outcome.reassignment,
        preserved: outcome.historical,
        tokensInvalidated: outcome.tokensInvalidated,
        auditId: outcome.auditId,
      },
    });
  } catch (err) {
    if (err && err.status) {
      return res.status(err.status).json({ success: false, message: err.message, code: err.code, data: err.data });
    }
    return next(err);
  }
};



// POST /api/admin/teachers/:id/restore — reverses a soft delete. Reassignment done at
// delete time is NOT undone: the work has already moved on, and pulling it back would
// be more surprising than helpful.
const restoreTeacher = async (req, res, next) => {
  try {
    const teacherId = parsePositiveInt(req.params.id);
    if (!teacherId) return res.status(400).json({ success: false, message: 'A valid teacher id is required.' });

    const outcome = await withTransaction(async (conn) => {
      const target = await getTeacherAccount(teacherId, conn, { forUpdate: true });
      if (!target) throw httpError(404, 'Teacher not found.');
      if (!target.deleted_at) throw httpError(409, 'This teacher is not deleted.', 'NOT_DELETED');

      const restored = await restoreTeacherAccount(teacherId, conn);
      if (!restored) throw httpError(409, 'This teacher is not deleted.', 'NOT_DELETED');

      const auditId = await logActionInTransaction(conn, {
        actorUserId: req.user.id,
        actorName: req.user.name || req.user.email,
        action: 'RESTORE_TEACHER',
        entityType: 'teachers',
        entityId: teacherId,
        details: { targetEmail: target.email, previouslyDeletedAt: target.deleted_at },
      });

      return { target, auditId };
    });

    return res.json({
      success: true,
      message: `${outcome.target.name} has been restored to the Teacher Directory.`,
      data: { teacher: { id: outcome.target.id, name: outcome.target.name }, auditId: outcome.auditId },
    });
  } catch (err) {
    if (err && err.status) {
      return res.status(err.status).json({ success: false, message: err.message, code: err.code, data: err.data });
    }
    return next(err);
  }
};


module.exports = {
  importTeacherFile,
  downloadImportTemplate,
  downloadImportErrorFile,
  listTeacherDirectory,
  updateTeacher,
  resendCredentialEmail,
  getTeacherDeletionImpact,
  deleteTeacher,
  restoreTeacher,
};
