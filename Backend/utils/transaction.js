// ─────────────────────────────────────────────────────────────────────────────
// Phase 0 — transaction helper.
//
// Single place that handles the "get connection → BEGIN → work → COMMIT → release"
// ceremony (and ROLLBACK on any failure) so feature code never has to remember the
// steps or leak a connection. Every multi-write operation added in later phases
// (assessment + questions + marks + results, mapping + recalc, etc.) MUST save
// through this helper so a mid-save failure rolls back cleanly.
// ─────────────────────────────────────────────────────────────────────────────
const pool = require('../config/db');

/**
 * Runs `work(conn)` inside a single DB transaction.
 *
 * - Acquires a dedicated connection from the pool.
 * - BEGINs, runs the work, COMMITs on success.
 * - ROLLBACKs and rethrows the original error on any failure.
 * - Always releases the connection back to the pool.
 *
 * `work` receives the connection and should pass it to every query it performs
 * (e.g. `conn.query(...)`) so all writes share one transaction. Pure read helpers
 * can keep using the module-level pool.
 *
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<unknown>} work
 * @returns {Promise<unknown>} whatever `work` resolves to
 */
const withTransaction = async (work) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rollbackErr) {
      // Preserve the original failure; surface the rollback problem server-side only.
      console.error('[transaction] rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = { withTransaction };