const pool = require('../config/db');

// Practical ceiling, not an architectural one — raise this if a course genuinely needs more.
const MAX_COS_PER_COURSE = 30;

const createCourseOutcomeTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS course_outcomes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      course_id INT NOT NULL,
      co_number INT NOT NULL,
      description TEXT,
      max_internal DECIMAL(6,2) NOT NULL DEFAULT 10,
      max_external DECIMAL(6,2) NOT NULL DEFAULT 20,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      UNIQUE KEY unique_course_co_number (course_id, co_number)
    ) ENGINE=InnoDB;
  `);
};

// One-time, idempotent: copies each pre-existing course's CO descriptions (from co_descriptions)
// and CO max marks (from course_configs.co{N}_max_internal/external, capped at the old CO1-6
// columns) into course_outcomes. Skipped per-course if that course already has outcome rows —
// safe to call on every startup. Never touches or drops the legacy columns/tables.
const migrateLegacyCoursesToOutcomes = async () => {
  const [courses] = await pool.query('SELECT id, num_cos FROM courses');

  for (const course of courses) {
    const [existing] = await pool.query(
      'SELECT COUNT(*) as count FROM course_outcomes WHERE course_id = ?',
      [course.id],
    );
    if (existing[0].count > 0) continue; // already migrated

    const [descriptions] = await pool.query(
      'SELECT co_number, description FROM co_descriptions WHERE course_id = ? ORDER BY co_number',
      [course.id],
    );
    const [configRows] = await pool.query('SELECT * FROM course_configs WHERE course_id = ?', [course.id]);
    const config = configRows[0] || {};

    const numCos = course.num_cos || descriptions.length || 5;
    const descByNumber = new Map(descriptions.map((d) => [d.co_number, d.description]));

    for (let coNumber = 1; coNumber <= numCos; coNumber += 1) {
      await pool.query(
        `INSERT INTO course_outcomes (course_id, co_number, description, max_internal, max_external)
         VALUES (?, ?, ?, ?, ?)`,
        [
          course.id,
          coNumber,
          descByNumber.get(coNumber) || `Course Outcome ${coNumber}`,
          config[`co${coNumber}_max_internal`] ?? 10,
          config[`co${coNumber}_max_external`] ?? 20,
        ],
      );
    }
  }
};

const getActiveOutcomes = async (courseId) => {
  const [rows] = await pool.query(
    'SELECT * FROM course_outcomes WHERE course_id = ? AND is_active = 1 ORDER BY co_number ASC',
    [courseId],
  );
  return rows;
};

const getOutcomeById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM course_outcomes WHERE id = ?', [id]);
  return rows[0] || null;
};

const addCourseOutcome = async (courseId, { description, max_internal, max_external }) => {
  const [countRows] = await pool.query(
    'SELECT COUNT(*) as count FROM course_outcomes WHERE course_id = ?',
    [courseId],
  );
  if (countRows[0].count >= MAX_COS_PER_COURSE) {
    const err = new Error(`A course cannot have more than ${MAX_COS_PER_COURSE} Course Outcomes.`);
    err.status = 400;
    throw err;
  }

  // Next CO number is always MAX(ever used)+1 — never reused, even if earlier COs were archived,
  // so historical mappings/marks/reports referencing "CO3" always mean the same CO.
  const [maxRows] = await pool.query(
    'SELECT COALESCE(MAX(co_number), 0) as maxNumber FROM course_outcomes WHERE course_id = ?',
    [courseId],
  );
  const nextNumber = maxRows[0].maxNumber + 1;

  const [result] = await pool.query(
    `INSERT INTO course_outcomes (course_id, co_number, description, max_internal, max_external)
     VALUES (?, ?, ?, ?, ?)`,
    [courseId, nextNumber, description || `Course Outcome ${nextNumber}`, max_internal ?? 10, max_external ?? 20],
  );
  return getOutcomeById(result.insertId);
};

const updateCourseOutcome = async (id, { description, max_internal, max_external }) => {
  const fields = [];
  const values = [];
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (max_internal !== undefined) { fields.push('max_internal = ?'); values.push(max_internal); }
  if (max_external !== undefined) { fields.push('max_external = ?'); values.push(max_external); }
  if (fields.length === 0) return false;

  values.push(id);
  const [result] = await pool.query(`UPDATE course_outcomes SET ${fields.join(', ')} WHERE id = ?`, values);
  return result.affectedRows > 0;
};

// Archive, never hard-delete — a CO may already be referenced by question configs, marks,
// mappings, and attainment history. Archived COs drop out of active dropdowns/calculations
// but every historical row that points at them stays intact.
const archiveCourseOutcome = async (id) => {
  const [result] = await pool.query('UPDATE course_outcomes SET is_active = 0 WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

const reactivateCourseOutcome = async (id) => {
  const [result] = await pool.query('UPDATE course_outcomes SET is_active = 1 WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

module.exports = {
  MAX_COS_PER_COURSE,
  createCourseOutcomeTables,
  migrateLegacyCoursesToOutcomes,
  getActiveOutcomes,
  getOutcomeById,
  addCourseOutcome,
  updateCourseOutcome,
  archiveCourseOutcome,
  reactivateCourseOutcome,
};
