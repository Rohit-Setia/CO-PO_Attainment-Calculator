const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/db');
const {
  findUserByEmail,
  createUser,
  findUserById,
  getAllUsers,
  updateUserRoleAndStatus,
  createPasswordSetupToken,
  findPasswordSetupTokenByHash,
  markPasswordSetupTokenUsed,
  updateUserPassword,
  createPasswordResetToken,
  findPasswordResetTokenByHash,
  invalidateActiveResetTokens,
  findUserRoleForReset,
} = require('../models/userModel');
const generateToken = require('../utils/generateToken');
const { sendMail, buildCredentialEmail, buildPasswordResetEmail } = require('../services/emailService');
const { logAction } = require('../models/adminAuditModel');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Roles eligible for self-service password reset. 'Admin' = Administrator;
// 'Moderator' is the project's documented HOS/HOD-level role (see roleMiddleware.js).
// Teacher, Viewer, Examination Team, School Admin and Department Admin are NOT eligible.
// This is enforced on the SERVER from the account's real DB role — never from the client.
const PASSWORD_RESET_ROLES = ['Admin', 'Moderator'];

const registerTeacher = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await createUser({ name, email, hashedPassword });

    // New users are inactive by default — Admin must approve them before they can log in
    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please wait for an Admin to activate your account.',
      data: { user: { id: userId, name, email } },
    });
  } catch (error) {
    return next(error);
  }
};

const loginTeacher = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Deleted Teacher Directory accounts are inactive too, but say so explicitly —
    // "pending approval" would send the user down the wrong path. Checked after the
    // password compare so this cannot be used to enumerate accounts.
    if (user.deleted_at) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deleted. Please contact an Administrator.',
      });
    }

    // Block inactive accounts — must be approved by Admin first
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending approval. Please contact an Administrator.',
      });
    }

    // Include role + academic scope in JWT so middlewares can check both without a DB hit.
    // school_id/department_id are null for every role except School Admin/Department Admin.
    const token = generateToken({
      id: user.id, email: user.email, role: user.role,
      school_id: user.school_id || null, department_id: user.department_id || null,
    });

    // Return only safe, non-sensitive fields to the client
    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          must_change_password: Boolean(user.must_change_password),
        },
        mustChangePassword: Boolean(user.must_change_password),
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getTeacherProfile = async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // findUserById already excludes password hash
    return res.json({
      success: true,
      message: 'Profile fetched successfully',
      data: user,
    });
  } catch (error) {
    return next(error);
  }
};

// Admin only: list all registered users
const listUsers = async (req, res, next) => {
  try {
    const users = await getAllUsers();
    return res.json({ success: true, data: users });
  } catch (error) {
    return next(error);
  }
};

// Admin only: update any user's role and/or active status and/or School/Department scope
// (only meaningful for School Admin / Department Admin — see userModel.addRoleScopingColumns).
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, is_active, school_id, department_id } = req.body;

    const validRoles = ['Admin', 'Examination Team', 'Teacher', 'Viewer', 'School Admin', 'Department Admin'];
    if (role !== undefined && !validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }
    if (role === 'School Admin' && !school_id) {
      return res.status(400).json({ success: false, message: 'school_id is required when assigning the School Admin role.' });
    }
    if (role === 'Department Admin' && !department_id) {
      return res.status(400).json({ success: false, message: 'department_id is required when assigning the Department Admin role.' });
    }

    const updated = await updateUserRoleAndStatus(id, { role, is_active, school_id, department_id });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found or no changes made.' });
    }

    return res.json({ success: true, message: 'User updated successfully.' });
  } catch (error) {
    return next(error);
  }
};
// ── Phase 1 — password-setup (bulk-import credential email) ──────────────────

// POST /api/auth/password-setup/request — body { email }
// Creates a fresh, time-limited password-setup token and emails the link.
// Response is intentionally generic to avoid account enumeration.
const requestPasswordSetup = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await findUserByEmail(email);
    if (user) {
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
      await sendMail({ to: user.email, subject, html });
    }
    return res.json({
      success: true,
      message: 'If that email exists in the system, a password-setup link has been sent.',
    });
  } catch (err) {
    return next(err);
  }
};

// POST /api/auth/password-setup/confirm — body { token, password }
// Validates the one-time token (hash, expiry, usage) and sets the password.
// The token is marked used immediately (a stolen link can only be used once).
const confirmPasswordSetup = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and password are required.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return res.status(400).json({ success: false, message: 'Password must contain at least one letter and one number.' });
    }

    const record = await findPasswordSetupTokenByHash(hashToken(token));
    if (!record) {
      return res.status(400).json({ success: false, message: 'Invalid or expired password-setup link.' });
    }
    if (record.used_at) {
      return res.status(400).json({ success: false, message: 'This password-setup link has already been used.' });
    }
    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'This password-setup link has expired. Please request a new one.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await updateUserPassword(record.user_id, hashedPassword);
    await markPasswordSetupTokenUsed(record.id);

    return res.json({ success: true, message: 'Password set successfully. You can now log in.' });
  } catch (err) {
    return next(err);
  }
};

// ── HOD / Administrator self-service password reset ──────────────────────────
// ONLY 'Admin' (Administrator) and 'Moderator' (HOD) accounts are eligible.
// Teachers and every other role are silently rejected — no token, no email, no
// account change. Eligibility is decided from the account's REAL role in the DB.

// POST /api/auth/forgot-password — body { email }
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await findUserByEmail(email);

    // Same generic response whether the account is missing, ineligible, or inactive —
    // this prevents account enumeration. Only eligible active Admin/HOD accounts get a
    // token + email; every other case is a deliberate no-op.
    const generic = {
      success: true,
      message: 'If that email belongs to an authorized Administrator or HOD account, a password reset link has been sent.',
    };
    if (!user || !PASSWORD_RESET_ROLES.includes(user.role) || !user.is_active) {
      return res.json(generic);
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresHours = Number(process.env.PASSWORD_RESET_EXPIRY_HOURS || 24);
    const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // A new request invalidates any previous active reset tokens for this account.
      await invalidateActiveResetTokens(user.id, conn);
      await createPasswordResetToken({ userId: user.id, tokenHash: hashToken(token), expiresAt }, conn);
      await conn.commit();
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }

    // Best-effort email. sendMail never throws (it logs in disabled mode) and never
    // returns the token to the client; the raw token exists only in this email/URL.
    const { subject, html } = buildPasswordResetEmail({
      name: user.name, email: user.email, resetToken: token, expiresHours,
    });
    await sendMail({ to: user.email, subject, html });

    await logAction({
      actorUserId: user.id, actorName: user.name, action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'teacher', entityId: user.id, details: { role: user.role },
    });

    return res.json(generic);
  } catch (err) {
    return next(err);
  }
};

// POST /api/auth/reset-password — body { token, password }
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and password are required.' });
    }
    if (String(password).length < 6 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters and contain a letter and a number.' });
    }

    const tokenHash = hashToken(token);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const record = await findPasswordResetTokenByHash(tokenHash, conn); // locks the row
      if (!record) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Invalid or expired password reset link.' });
      }
      if (record.used_at) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'This password reset link has already been used.' });
      }
      if (new Date(record.expires_at).getTime() < Date.now()) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'This password reset link has expired. Please request a new one.' });
      }

      // Defense in depth: re-check the account's ACTUAL role from the DB inside the tx.
      const account = await findUserRoleForReset(record.user_id, conn);
      if (!account || !PASSWORD_RESET_ROLES.includes(account.role)) {
        await conn.rollback();
        await logAction({
          actorUserId: record.user_id, actorName: account ? account.name : null, action: 'PASSWORD_RESET_FAILED',
          entityType: 'teacher', entityId: record.user_id, details: { reason: 'role_not_eligible', role: account ? account.role : null },
        });
        return res.status(400).json({ success: false, message: 'This reset link is not valid for this account.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await updateUserPassword(record.user_id, hashedPassword, conn);
      // Marks this token used AND invalidates any other active reset tokens atomically.
      await invalidateActiveResetTokens(record.user_id, conn);
      await conn.commit();

      await logAction({
        actorUserId: record.user_id, actorName: account.name, action: 'PASSWORD_RESET_COMPLETED',
        entityType: 'teacher', entityId: record.user_id, details: { role: account.role },
      });

      return res.json({ success: true, message: 'Your password has been reset successfully.' });
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  registerTeacher,
  loginTeacher,
  getTeacherProfile,
  listUsers,
  updateUser,
  requestPasswordSetup,
  confirmPasswordSetup,
  forgotPassword,
  resetPassword,
};

