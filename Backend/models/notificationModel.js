const pool = require('../config/db');

// Non-fatal by design, matching adminAuditModel.logAction — a notification failure must
// never break the primary operation (paper upload, assignment, marks submission, etc.).
const notify = async ({ userId, type, title, message, relatedEntityType, relatedEntityId }) => {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, type, title, message || null, relatedEntityType || null, relatedEntityId || null],
    );
  } catch (err) {
    console.error('Notification write failed (non-fatal):', err.message);
  }
};

const getForUser = async (userId, { limit = 50, unreadOnly = false } = {}) => {
  const where = unreadOnly ? 'WHERE user_id = ? AND is_read = 0' : 'WHERE user_id = ?';
  const [rows] = await pool.query(
    `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ?`,
    [userId, Number(limit)],
  );
  return rows;
};

const markRead = async (id, userId) => {
  const [result] = await pool.query(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [id, userId],
  );
  return result.affectedRows > 0;
};

module.exports = { notify, getForUser, markRead };
