const pool = require('../config/db');

const createUsersTable = async (options = {}) => {
  const retries = options.retries ?? 5;
  const delayMs = options.delayMs ?? 2000;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query(`
      CREATE TABLE IF NOT EXISTS teachers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(120) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
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

const createUser = async ({ name, email, hashedPassword }) => {
  const [result] = await pool.query(
    'INSERT INTO teachers (name, email, password) VALUES (?, ?, ?)',
    [name, email, hashedPassword],
  );
  return result.insertId;
};

const findUserById = async (id) => {
  const [rows] = await pool.query('SELECT id, name, email, created_at FROM teachers WHERE id = ?', [id]);
  return rows[0];
};

module.exports = {
  createUsersTable,
  findUserByEmail,
  createUser,
  findUserById,
};
