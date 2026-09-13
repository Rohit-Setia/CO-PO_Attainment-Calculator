const pool = require('../config/db');
const { ensureColumn } = require('./universityModel');

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Teacher Management (bulk import + paginated directory + password).
// ─────────────────────────────────────────────────────────────────────────────

const createUsersTable = async (options = {}) => {
  const retries = options.retries ?? 5;
  const delayMs = options.delayMs ?? 2000;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      // Step 1: Create base teachers table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS teachers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(120) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
      `);

      // Step 2: Auto-migrate — add `role` column if missing
      const [roleCheck] = await pool.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teachers' AND COLUMN_NAME = 'role'
      `);
      if (roleCheck.length === 0) {
        await pool.query(`
          ALTER TABLE teachers
          ADD COLUMN role ENUM('Admin', 'Examination Team', 'Teacher', 'Viewer') NOT NULL DEFAULT 'Viewer'
        `);
      }

      // Step 3: Auto-migrate — add `is_active` column if missing
      const [activeCheck] = await pool.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teachers' AND COLUMN_NAME = 'is_active'
      `);
      if (activeCheck.length === 0) {
        await pool.query(`
          ALTER TABLE teachers
          ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT FALSE
        `);
      }

      return;
    } catch (err) {
      // If last attempt, rethrow with context
      if (attempt === retries) {
        const details = {
          message: err && err.message ? err.message : '',
          code: err && err.code ? err.code : undefined,
          errno: err && err.errno ? err.errno : undefined,
        };
        const e = new Error(`createUsersTable failed after ${retries} attempts: ${JSON.stringify(details)}`);
        e.original = err;
        throw e;
      }
      // otherwise wait and retry
      // eslint-disable-next-line no-await-in-loop
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
};

// PHASE 7 — additive role/scoping migration. Documented here rather than invented silently:
//   * Extends the existing `role` ENUM with two genuinely new values, 'School Admin' and
//     'Department Admin' — reusing the existing single `teachers.role` column rather than
//     creating a second roles table or a parallel representation. No existing value is
//     renamed/removed, so every current row (Admin/Examination Team/Teacher/Viewer) is
//     unaffected and keeps working exactly as before.
//   * Adds nullable `school_id` / `department_id` FKs so a School Admin / Department Admin
//     can be scoped to the one school/department they administer. NULL for every existing
//     user (including current Admins) — scope is only meaningful for the two new roles and
//     is never inferred.
const addRoleScopingColumns = async () => {
  await ensureColumn('teachers', 'school_id', 'INT DEFAULT NULL');
  await ensureColumn('teachers', 'department_id', 'INT DEFAULT NULL');

  const [[roleColumn]] = await pool.query(`
    SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teachers' AND COLUMN_NAME = 'role'
  `);
  // Extend ENUM whenever a new value is missing — checked individually so re-runs are safe.
  if (roleColumn && !roleColumn.COLUMN_TYPE.includes('School Admin')) {
    await pool.query(`
      ALTER TABLE teachers
      MODIFY COLUMN role ENUM('Admin', 'Examination Team', 'Teacher', 'Viewer', 'School Admin', 'Department Admin', 'Moderator')
      NOT NULL DEFAULT 'Viewer'
    `);
  } else if (roleColumn && !roleColumn.COLUMN_TYPE.includes('Moderator')) {
    // Already has School Admin / Department Admin — just add Moderator
    await pool.query(`
      ALTER TABLE teachers
      MODIFY COLUMN role ENUM('Admin', 'Examination Team', 'Teacher', 'Viewer', 'School Admin', 'Department Admin', 'Moderator')
      NOT NULL DEFAULT 'Viewer'
    `);
  }


  // FKs added only once the referenced tables exist (schools/departments are created by
  // createUniversityTables(), which server.js already runs before this function).
  const [fkRows] = await pool.query(`
    SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teachers' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  `);
  const existingFks = new Set(fkRows.map((r) => r.CONSTRAINT_NAME));
  if (!existingFks.has('fk_teachers_school')) {
    try {
      await pool.query('ALTER TABLE teachers ADD CONSTRAINT fk_teachers_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL');
    } catch { /* schools table not ready yet or FK already effectively present — safe to skip */ }
  }
  if (!existingFks.has('fk_teachers_department')) {
    try {
      await pool.query('ALTER TABLE teachers ADD CONSTRAINT fk_teachers_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL');
    } catch { /* same as above */ }
  }
};

const findUserByEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM teachers WHERE email = ?', [email]);
  return rows[0];
};

// New signups default to role='Viewer' and is_active=FALSE until Admin approves
const createUser = async ({ name, email, hashedPassword }) => {
  const [result] = await pool.query(
    "INSERT INTO teachers (name, email, password, role, is_active) VALUES (?, ?, ?, 'Viewer', FALSE)",
    [name, email, hashedPassword],
  );
  return result.insertId;
};

// Returns safe fields only — no password hash
const findUserById = async (id) => {
  const [rows] = await pool.query(
    `SELECT t.id, t.name, t.email, t.role, t.is_active, t.created_at, t.school_id, t.department_id,
            t.deleted_at, t.delete_reason,
            s.name AS school_name, d.name AS department_name
     FROM teachers t
     LEFT JOIN schools s ON s.id = t.school_id
     LEFT JOIN departments d ON d.id = t.department_id
     WHERE t.id = ?`,
    [id],
  );
  return rows[0];
};

// Admin: list all users — never expose password. Soft-deleted teacher accounts are
// excluded: they are managed from the Teacher Directory's Archived view, not here.
const getAllUsers = async () => {
  const [rows] = await pool.query(
    `SELECT t.id, t.name, t.email, t.role, t.is_active, t.created_at, t.school_id, t.department_id,
            s.name AS school_name, d.name AS department_name
     FROM teachers t
     LEFT JOIN schools s ON s.id = t.school_id
     LEFT JOIN departments d ON d.id = t.department_id
     WHERE t.deleted_at IS NULL
     ORDER BY t.created_at DESC`,
  );
  return rows;
};

// Admin: update a user's role and/or active status and/or School/Department scope.
// scope fields are explicitly settable to null (e.g. demoting a School Admin back to
// Teacher should clear school_id) — undefined means "leave unchanged", null means "clear".
const updateUserRoleAndStatus = async (id, { role, is_active, school_id, department_id }) => {
  const fields = [];
  const values = [];

  if (role !== undefined) {
    fields.push('role = ?');
    values.push(role);
  }
  if (is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(is_active ? 1 : 0);
  }
  if (school_id !== undefined) {
    fields.push('school_id = ?');
    values.push(school_id);
  }
  if (department_id !== undefined) {
    fields.push('department_id = ?');
    values.push(department_id);
  }

  if (fields.length === 0) return false;

  values.push(id);
  const [result] = await pool.query(
    `UPDATE teachers SET ${fields.join(', ')} WHERE id = ?`,
    values,
  );
  return result.affectedRows > 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Teacher Management model functions.
// ─────────────────────────────────────────────────────────────────────────────

// Create a teacher account as part of a bulk import (or single manual add).
// Imported accounts are active immediately (no admin approval round-trip) and are
// forced to set their own password at first login.
const createTeacherFromImport = async ({
  name, email, hashedPassword, username, employeeId, designation, phone, departmentId,
}, conn) => {
  const db = conn || pool;
  const [result] = await db.query(
    `INSERT INTO teachers
       (name, email, password, role, is_active, username, employee_id, designation, phone, department_id, must_change_password)
     VALUES (?, ?, ?, 'Teacher', 1, ?, ?, ?, ?, ?, 1)`,
    [name, email, hashedPassword, username || null, employeeId || null, designation || null, phone || null, departmentId || null],
  );
  return result.insertId;
};

// Batch duplicate pre-check for an import batch. Returns a Set of emails already
// in the DB and a Set of employee_ids already in the DB (case-insensitive email).
// Also returns the subset that belongs to soft-deleted accounts: those rows still
// occupy the unique email / employee_id constraints, so an import cannot reuse them,
// but the operator deserves to know the difference between "live teacher" and
// "deleted teacher holding the identifier".
const bulkFindExistingTeacherIdentities = async ({ emails, employeeIds }, conn) => {
  const db = conn || pool;
  const existingEmails = new Set();
  const existingEmployeeIds = new Set();
  const deletedEmails = new Set();
  const deletedEmployeeIds = new Set();
  if (emails && emails.length > 0) {
    const placeholders = emails.map(() => '?').join(', ');
    const [rows] = await db.query(
      `SELECT LOWER(email) AS email, deleted_at FROM teachers WHERE LOWER(email) IN (${placeholders})`,
      emails.map((e) => String(e).toLowerCase()),
    );
    rows.forEach((r) => {
      existingEmails.add(r.email);
      if (r.deleted_at) deletedEmails.add(r.email);
    });
  }
  if (employeeIds && employeeIds.length > 0) {
    const placeholders = employeeIds.map(() => '?').join(', ');
    const [rows] = await db.query(
      `SELECT employee_id, deleted_at FROM teachers WHERE employee_id IN (${placeholders})`,
      employeeIds,
    );
    rows.forEach((r) => {
      if (!r.employee_id) return;
      const key = String(r.employee_id).toLowerCase();
      existingEmployeeIds.add(key);
      if (r.deleted_at) deletedEmployeeIds.add(key);
    });
  }
  return { existingEmails, existingEmployeeIds, deletedEmails, deletedEmployeeIds };
};

// Paginated, filterable teacher directory (Admin / academic-write roles).
// `status`: 'active' (default — hides soft-deleted accounts), 'deleted' (the archive
// view), or 'all'. Defaulting to active is what keeps a deleted teacher out of every
// existing caller without touching them.
const listTeachers = async ({ page = 1, limit = 20, search = '', departmentId = null, status = 'active' } = {}) => {
  const conditions = [];
  const params = [];
  if (status === 'active') conditions.push('t.deleted_at IS NULL');
  else if (status === 'deleted') conditions.push('t.deleted_at IS NOT NULL');
  if (search) {
    conditions.push('(t.name LIKE ? OR t.email LIKE ? OR t.username LIKE ? OR t.employee_id LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (departmentId) {
    conditions.push('t.department_id = ?');
    params.push(departmentId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM teachers t ${where}`,
    params,
  );
  const safeLimit = Math.min(Number(limit) || 20, 100);
  const pageNum = Math.max(Number(page) || 1, 1);
  const offset = (pageNum - 1) * safeLimit;
  const [rows] = await pool.query(
    `SELECT t.id, t.name, t.email, t.username, t.employee_id, t.designation, t.phone,
            t.role, t.is_active, t.department_id, t.must_change_password, t.created_at,
            t.deleted_at, t.delete_reason,
            d.name AS department_name
     FROM teachers t
     LEFT JOIN departments d ON d.id = t.department_id
     ${where}
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset],
  );
  return { rows, total, page: pageNum, limit: safeLimit };
};

// Set a user's password (first-login setup + admin reset). Clears the forced
// password-change flag. Never stores the plaintext — caller hashes first.
const updateUserPassword = async (id, hashedPassword, conn) => {
  const db = conn || pool;
  const [result] = await db.query(
    'UPDATE teachers SET password = ?, must_change_password = 0 WHERE id = ?',
    [hashedPassword, id],
  );
  return result.affectedRows > 0;
};

const createPasswordSetupToken = async ({ userId, tokenHash, expiresAt, purpose = 'password_setup' }, conn) => {
  const db = conn || pool;
  const [result] = await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, purpose)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), used_at = NULL, purpose = VALUES(purpose)`,
    [userId, tokenHash, expiresAt, purpose],
  );
  return result.insertId;
};

const findPasswordSetupTokenByHash = async (tokenHash) => {
  const [rows] = await pool.query(
    'SELECT * FROM password_reset_tokens WHERE token_hash = ? LIMIT 1',
    [tokenHash],
  );
  return rows[0] || null;
};

const markPasswordSetupTokenUsed = async (id, conn) => {
  const db = conn || pool;
  await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [id]);
};

// ─────────────────────────────────────────────────────────────────────────────
// Password RESET (HOD / Administrator only) — reuses the SAME password_reset_tokens
// table with purpose='password_reset'. These helpers are deliberately separate from
// the teacher 'password_setup' helpers above so the bulk-import first-login flow is
// never affected. All are `conn`-aware so they can run inside one transaction.
// ─────────────────────────────────────────────────────────────────────────────

// Mark every not-yet-used reset token for a user as used. Used both when a fresh
// reset is requested (invalidates previous active tokens) and when one is consumed
// (single-use + invalidates any siblings) — atomically within the caller's tx.
const invalidateActiveResetTokens = async (userId, conn) => {
  const db = conn || pool;
  const [result] = await db.query(
    "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND purpose = 'password_reset' AND used_at IS NULL",
    [userId],
  );
  return result.affectedRows;
};

// Insert a new reset token. Only the SHA-256 hash is ever stored (caller hashes).
const createPasswordResetToken = async ({ userId, tokenHash, expiresAt }, conn) => {
  const db = conn || pool;
  const [result] = await db.query(
    "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, purpose) VALUES (?, ?, ?, 'password_reset')",
    [userId, tokenHash, expiresAt],
  );
  return result.insertId;
};

// Look up a reset token by hash. Filtered to purpose='password_reset' so a teacher
// 'password_setup' token can never be redeemed here. When a `conn` is supplied the
// row is locked FOR UPDATE so two concurrent uses of the same token can't both pass
// the used/expiry checks.
const findPasswordResetTokenByHash = async (tokenHash, conn) => {
  const db = conn || pool;
  const sql = "SELECT * FROM password_reset_tokens WHERE token_hash = ? AND purpose = 'password_reset' LIMIT 1"
    + (conn ? ' FOR UPDATE' : '');
  const [rows] = await db.query(sql, [tokenHash]);
  return rows[0] || null;
};

// Minimal, safe account lookup by id (never selects the password hash) for the
// in-transaction role re-verification during reset.
const findUserRoleForReset = async (userId, conn) => {
  const db = conn || pool;
  const [rows] = await db.query(
    'SELECT id, name, email, role, is_active FROM teachers WHERE id = ? LIMIT 1',
    [userId],
  );
  return rows[0] || null;
};

// Admin edit of teacher profile/identity fields (Phase 1). Only provided fields
// change; `department_id` accepts null explicitly to clear the department link.
const updateTeacherProfile = async (id, {
  name, email, username, employeeId, designation, phone, departmentId, role, is_active,
}) => {
  const sets = [];
  const values = [];
  if (name !== undefined) { sets.push('name = ?'); values.push(name); }
  if (email !== undefined) { sets.push('email = ?'); values.push(email); }
  if (username !== undefined) { sets.push('username = ?'); values.push(username || null); }
  if (employeeId !== undefined) { sets.push('employee_id = ?'); values.push(employeeId || null); }
  if (designation !== undefined) { sets.push('designation = ?'); values.push(designation || null); }
  if (phone !== undefined) { sets.push('phone = ?'); values.push(phone || null); }
  if (departmentId !== undefined) { sets.push('department_id = ?'); values.push(departmentId || null); }
  if (role !== undefined) { sets.push('role = ?'); values.push(role); }
  if (is_active !== undefined) { sets.push('is_active = ?'); values.push(is_active ? 1 : 0); }
  if (sets.length === 0) return false;
  values.push(id);
  const [result] = await pool.query(`UPDATE teachers SET ${sets.join(', ')} WHERE id = ?`, values);
  return result.affectedRows > 0;
};

// Search active/available faculty users for autocomplete assignment
const searchFacultyUsers = async (query, limit = 10) => {
  const trimmed = (query || '').trim();
  if (!trimmed) return [];
  const searchTerm = `%${trimmed}%`;
  const [rows] = await pool.query(
    `SELECT t.id, t.name, t.email, t.role, t.employee_id, t.designation, d.name AS department_name
     FROM teachers t
     LEFT JOIN departments d ON d.id = t.department_id
     WHERE (t.name LIKE ? OR t.email LIKE ? OR t.employee_id LIKE ?)
     ORDER BY t.name ASC
     LIMIT ?`,
    [searchTerm, searchTerm, searchTerm, Number(limit)],
  );
  return rows;
};

module.exports = {
  createUsersTable,
  addRoleScopingColumns,
  findUserByEmail,
  createUser,
  findUserById,
  getAllUsers,
  updateUserRoleAndStatus,
  createTeacherFromImport,
  bulkFindExistingTeacherIdentities,
  listTeachers,
  updateUserPassword,
  createPasswordSetupToken,
  findPasswordSetupTokenByHash,
  markPasswordSetupTokenUsed,
  createPasswordResetToken,
  findPasswordResetTokenByHash,
  invalidateActiveResetTokens,
  findUserRoleForReset,
  updateTeacherProfile,
  searchFacultyUsers,
};
