const pool = require('../config/db');

// PHASE 7 — minimal audit mechanism (Section 31). No audit system existed before this;
// this is deliberately small: one append-only table, one write helper, one paginated read.
// Only sensitive administrative actions call logAction() — not every request.
const createAdminAuditTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      actor_user_id INT NOT NULL,
      actor_name VARCHAR(100),
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id INT,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_user_id) REFERENCES teachers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
};

// details is a plain object, stored as JSON text — never sensitive fields (passwords/tokens).
// Phase 8 hardening: audit logging is append-only and must never cause the primary operation
// to fail. A failed audit write is logged server-side and silently swallowed; the caller's
// business logic (student create, course update, etc.) proceeds regardless of audit success.
// This prevents a hard FK failure (e.g. actor_user_id missing from teachers) from becoming
// a 500 during the primary operation.
const logAction = async ({ actorUserId, actorName, action, entityType, entityId, details }) => {
  try {
    await pool.query(
      'INSERT INTO admin_audit_log (actor_user_id, actor_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [actorUserId, actorName || null, action, entityType, entityId || null, details ? JSON.stringify(details) : null],
    );
  } catch (err) {
    console.error('Audit log write failed (non-fatal):', err.message);
  }
};

// Same insert as logAction(), but on a caller-supplied transaction connection and
// WITHOUT the swallow-and-continue behaviour. Used by operations where the audit row
// is part of the atomic unit of work — e.g. teacher deletion, where an unaudited
// delete is worse than a failed one. A throw here rolls the whole transaction back.
const logActionInTransaction = async (conn, { actorUserId, actorName, action, entityType, entityId, details }) => {
  const [result] = await conn.query(
    'INSERT INTO admin_audit_log (actor_user_id, actor_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
    [actorUserId, actorName || null, action, entityType, entityId || null, details ? JSON.stringify(details) : null],
  );
  return result.insertId;
};

const getAuditLog = async ({ entityType, entityId, limit = 100 } = {}) => {
  const conditions = [];
  const params = [];
  if (entityType) { conditions.push('entity_type = ?'); params.push(entityType); }
  if (entityId) { conditions.push('entity_id = ?'); params.push(entityId); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT * FROM admin_audit_log ${where} ORDER BY created_at DESC LIMIT ?`,
    [...params, Number(limit)],
  );
  return rows;
};

module.exports = { createAdminAuditTable, logAction, logActionInTransaction, getAuditLog };
