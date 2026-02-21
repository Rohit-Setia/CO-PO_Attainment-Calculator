const pool = require('../config/db');

const createUsersTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teachers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(120) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
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
