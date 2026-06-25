require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const calculate = require('./routes/calculate');
const excelRouter = require('./routes/excelExport');
const authRouter = require('./routes/authRoutes');
const errorHandler = require('./middlewares/errorMiddleware');
const { createUsersTable } = require('./models/userModel');
const { initDatabase } = require('./config/dbInit');
const pool = require('./config/db');

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      const allowed = new Set([
        process.env.CLIENT_URL || 'http://localhost:5173',
        'http://localhost:5173',
        'http://localhost:5174',
      ]);
      if (allowed.has(origin)) return callback(null, true);
      return callback(new Error('CORS policy: This origin is not allowed'));
    },
  }),
);
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

const erpRouter = require('./routes/erpRoutes');

app.use('/api', calculate);
app.use('/api', excelRouter);
app.use('/api', authRouter);
app.use('/api/erp', erpRouter);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Check for possible config mismatches (Postgres URL while code uses MySQL)
if (process.env.DATABASE_URL) {
  console.warn('Warning: DATABASE_URL is set but this server expects MySQL (mysql2).');
}

const createDatabaseIfNotExists = async () => {
  const dbName = process.env.DB_NAME || 'teacher_auth';
  const tempPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0,
  });

  try {
    await tempPool.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Database "${dbName}" is ready`);
  } finally {
    await tempPool.end();
  }
};

const startServer = async () => {
  try {
    await createDatabaseIfNotExists();
    // quick DB sanity check
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('Database connection test failed:');
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  }

  try {
    await initDatabase();
    app.listen(PORT, () => console.log('Server running on', PORT));
  } catch (error) {
    console.error('Failed to initialize database tables:');
    console.error(error && error.stack ? error.stack : error);
    if (error && error.original) {
      console.error('Original error:');
      console.error(error.original && error.original.stack ? error.original.stack : error.original);
    }
    process.exit(1);
  }
};

startServer();
