// ─────────────────────────────────────────────────────────────────────────────
// Phase 0 — versioned, append-only migration runner.
//
// The pre-existing startup chain (server.js) creates/adds legacy tables idempotently
// via INFORMATION_SCHEMA checks on every boot. That works, but every new feature
// phase adds more startup steps to that chain. This runner gives future phases a
// single, durable, ordered gate:
//
//   * one `schema_migrations` table records each applied migration (name + timestamp);
//   * `registerMigration(name, up)` appends a migration to the pending registry;
//   * `runPendingMigrations()` executes ONLY migrations not yet recorded, in
//     registration order, and records each one in the SAME database — so a crash or
//     redeploy never re-runs an already-applied migration, and a partially applied
//     migration aborts startup loudly (ROLLBACK-free by design: each migration up()
//     MUST itself be written idempotently as a belt-and-braces guarantee).
//
// This is purely additive. Existing per-boot idempotent calls in server.js stay as
// they are — they are already safe to run on every start.
// ─────────────────────────────────────────────────────────────────────────────
const pool = require('../config/db');

const MIGRATIONS_TABLE = 'schema_migrations';
const MIGRATION_LOCK_NAME = 'ct_university_obe_schema_migrations';

const createMigrationsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
};

const registry = [];

// Register a named, idempotent `up()` function for later execution.
const registerMigration = (name, up) => {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Migration name is required.');
  }
  if (typeof up !== 'function') {
    throw new Error(`Migration "${name}" needs an up() function.`);
  }
  registry.push({ name: name.trim(), up });
  return { name: name.trim() };
};

const getAppliedNames = async () => {
  const [rows] = await pool.query(`SELECT name FROM ${MIGRATIONS_TABLE}`);
  return new Set(rows.map((r) => r.name));
};

// Runs every registered migration that has not been applied yet, in registration
// order, and records each successful application atomically with the work itself
// NOT AUTO-TRANSACTED (some migrations do DDL that MySQL cannot run inside a
// transaction). Returns [{ name, status }].
const runPendingMigrations = async () => {
  const connection = await pool.getConnection();
  let lockAcquired = false;
  try {
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 60) AS acquired', [MIGRATION_LOCK_NAME]);
    lockAcquired = lockRows[0]?.acquired === 1;
    if (!lockAcquired) throw new Error('Timed out waiting for another backend to finish database migrations.');

    await createMigrationsTable();
    const applied = await getAppliedNames();
    const results = [];

    for (const { name, up } of registry) {
      if (applied.has(name)) continue;
      try {
        // eslint-disable-next-line no-await-in-loop -- migrations are strictly sequential by design
        await up();
        // eslint-disable-next-line no-await-in-loop
        await pool.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?)`, [name]);
        results.push({ name, status: 'applied' });
      } catch (err) {
        const e = new Error(`Migration "${name}" failed: ${(err && err.message) || err}`);
        e.original = err;
        throw e;
      }
    }
    return results;
  } finally {
    if (lockAcquired) {
      try {
        await connection.query('SELECT RELEASE_LOCK(?)', [MIGRATION_LOCK_NAME]);
      } catch (err) {
        console.error('[migration] failed to release migration lock:', err.message);
      }
    }
    connection.release();
  }
};

module.exports = { registerMigration, runPendingMigrations, createMigrationsTable };