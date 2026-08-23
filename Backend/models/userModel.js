const pool = require('../config/db');
const { ensureColumn } = require('./universityModel');

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
  if (roleColumn && !roleColumn.COLUMN_TYPE.includes('School Admin')) {
    await pool.query(`
      ALTER TABLE teachers
      MODIFY COLUMN role ENUM('Admin', 'Examination Team', 'Teacher', 'Viewer', 'School Admin', 'Department Admin')
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
            s.name AS school_name, d.name AS department_name
     FROM teachers t
     LEFT JOIN schools s ON s.id = t.school_id
     LEFT JOIN departments d ON d.id = t.department_id
     WHERE t.id = ?`,
    [id],
  );
  return rows[0];
};

// Admin: list all users — never expose password
const getAllUsers = async () => {
  const [rows] = await pool.query(
    `SELECT t.id, t.name, t.email, t.role, t.is_active, t.created_at, t.school_id, t.department_id,
            s.name AS school_name, d.name AS department_name
     FROM teachers t
     LEFT JOIN schools s ON s.id = t.school_id
     LEFT JOIN departments d ON d.id = t.department_id
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

module.exports = {
  createUsersTable,
  addRoleScopingColumns,
  findUserByEmail,
  createUser,
  findUserById,
  getAllUsers,
  updateUserRoleAndStatus,
};
