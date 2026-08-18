const pool = require('../config/db');

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
    'SELECT id, name, email, role, is_active, created_at FROM teachers WHERE id = ?',
    [id],
  );
  return rows[0];
};

// Admin: list all users — never expose password
const getAllUsers = async () => {
  const [rows] = await pool.query(
    'SELECT id, name, email, role, is_active, created_at FROM teachers ORDER BY created_at DESC',
  );
  return rows;
};

// Admin: update a user's role and/or active status
const updateUserRoleAndStatus = async (id, { role, is_active }) => {
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
  findUserByEmail,
  createUser,
  findUserById,
  getAllUsers,
  updateUserRoleAndStatus,
};
