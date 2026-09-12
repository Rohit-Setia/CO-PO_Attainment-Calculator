const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const parseInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const requiredDatabaseVariables = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingDatabaseVariables = requiredDatabaseVariables.filter((name) => process.env[name] === undefined);
if (missingDatabaseVariables.length > 0) {
  throw new Error(`Missing required database environment variables: ${missingDatabaseVariables.join(', ')}`);
}

const sslEnabled = parseBoolean(process.env.DB_SSL);
const connectionLimit = Math.max(2, parseInteger(process.env.DB_CONNECTION_LIMIT, 10));
const sslCaFile = process.env.DB_SSL_CA_FILE
  ? (path.isAbsolute(process.env.DB_SSL_CA_FILE)
    ? process.env.DB_SSL_CA_FILE
    : path.resolve(__dirname, '..', process.env.DB_SSL_CA_FILE))
  : undefined;
if (sslEnabled && sslCaFile && !fs.existsSync(sslCaFile)) {
  throw new Error(`DB_SSL_CA_FILE does not exist: ${sslCaFile}. Download the Aiven CA certificate and place it at this path.`);
}
const sslCa = sslCaFile
  ? fs.readFileSync(sslCaFile, 'utf8')
  : process.env.DB_SSL_CA;
const ssl = sslEnabled
  ? {
      rejectUnauthorized: parseBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, true),
      ...(sslCa ? { ca: sslCa } : {}),
    }
  : undefined;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInteger(process.env.DB_PORT, 3306),
  ssl,
  waitForConnections: true,
  connectionLimit,
  maxIdle: Math.min(connectionLimit, parseInteger(process.env.DB_MAX_IDLE, connectionLimit)),
  idleTimeout: parseInteger(process.env.DB_IDLE_TIMEOUT_MS, 60000),
  connectTimeout: parseInteger(process.env.DB_CONNECT_TIMEOUT_MS, 10000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  queueLimit: 0,
});

module.exports = pool;
