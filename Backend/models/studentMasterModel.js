const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3/4 — Student Master CRUD + identity matching + mapping.
//
// Identity matching priority (Phase 3D):
//   1. Exact registration_number
//   2. Existing university roll number (univ_roll_no)
//   3. Existing roll number (roll_no OR roll_number)
//   4. Explicit administrator confirmation
// Never name-only automerge.
// -----------------------------------------------------------------------------

// Helper: normalize an identifier for comparison (trim + lowercase).
const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());

const findStudentByAnyIdentifier = async (value) => {
  if (!value) return null;
  const v = String(value).trim();
  const [rows] = await pool.query(
    `SELECT * FROM students
     WHERE registration_number = ?
        OR univ_roll_no = ?
        OR roll_no = ?
        OR roll_number = ?
     LIMIT 1`,
    [v, v, v, v],
  );
  return rows[0] || null;
};

// Create a student in the master. Nullable academic FKs (3A) allow NULL =
// "unmapped"; we never invent semester/department. Returns insertId.
const createStudent = async ({ registrationNumber, rollNumber, name, email, status }) => {
  const existing = await findStudentByAnyIdentifier(registrationNumber);
  if (existing) return { student: existing, created: false };

  const [result] = await pool.query(
    `INSERT INTO students (registration_number, roll_number, name, email, status)
     VALUES (?, ?, ?, ?, ?)`,
    [registrationNumber, rollNumber || null, name, email || null, status || 'Active'],
  );
  const [inserted] = await pool.query('SELECT * FROM students WHERE id = ?', [result.insertId]);
  return { student: inserted[0], created: true };
};

// Update a student's identity/master fields.
const updateStudent = async (id, { registrationNumber, rollNumber, name, email, status }) => {
  const sets = [];
  const values = [];
  if (registrationNumber !== undefined) { sets.push('registration_number = ?'); values.push(registrationNumber); }
  if (rollNumber !== undefined) { sets.push('roll_number = ?'); values.push(rollNumber); }
  if (name !== undefined) { sets.push('name = ?'); values.push(name); }
  if (email !== undefined) { sets.push('email = ?'); values.push(email); }
  if (status !== undefined) { sets.push('status = ?'); values.push(status); }
  if (sets.length === 0) return false;
  values.push(id);
  const [result] = await pool.query(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`, values);
  return result.affectedRows > 0;
};

const getStudentById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM students WHERE id = ?', [id]);
  return rows[0] || null;
};

const listStudents = async (filters = {}) => {
  const conditions = [];
  const params = [];
  if (filters.search) {
    const q = `%${filters.search}%`;
    conditions.push('(st.registration_number LIKE ? OR st.name LIKE ? OR st.roll_number LIKE ? OR st.roll_no LIKE ?)');
    params.push(q, q, q, q);
  }
  if (filters.status) { conditions.push('st.status = ?'); params.push(filters.status); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const limitClause = filters.limit ? `LIMIT ${Number(filters.limit)}` : '';

  const [rows] = await pool.query(
    `SELECT st.*,
            p.name AS program_name, p.id AS academic_program_id_fk,
            sess.name AS session_name,
            (SELECT GROUP_CONCAT(DISTINCT ce.course_id) FROM course_enrollments ce WHERE ce.student_id = st.id) AS enrolled_course_ids,
            (SELECT GROUP_CONCAT(DISTINCT cs.class_id) FROM class_students cs WHERE cs.student_id = st.id) AS class_ids
     FROM students st
     LEFT JOIN programs p ON p.id = st.academic_program_id
     LEFT JOIN academic_sessions sess ON sess.id = st.academic_session_id
     ${where}
     ORDER BY st.registration_number ASC
     ${limitClause}`,
    params,
  );
  return rows;
};

// Mark a student as mapped to a class (writes student snapshot fields + class_students).
const mapStudentToClass = async ({ studentId, classId, programId, sessionId, semester, section }) => {
  const student = await getStudentById(studentId);
  if (!student) throw Object.assign(new Error('Student not found'), { status: 404 });

  const sets = [];
  const values = [];
  if (programId !== undefined) { sets.push('academic_program_id = ?'); values.push(programId); }
  if (sessionId !== undefined) { sets.push('academic_session_id = ?'); values.push(sessionId); }
  if (semester !== undefined) { sets.push('semester = ?'); values.push(semester); }
  if (section !== undefined) { sets.push('section = ?'); values.push(section); }
  if (classId !== undefined) { sets.push('class_id = ?'); values.push(classId); }
  if (sets.length > 0) {
    values.push(studentId);
    await pool.query(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`, values);
  }

  // Link student to class (de-duplicated) so it can be found through the hierarchy.
  if (classId) await pool.query('INSERT IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)', [classId, studentId]);

  return getStudentById(studentId);
};

// Reusable academic-mapping helper used by the course/class pages.
const mapStudentToAcademic = mapStudentToClass;

module.exports = {
  findStudentByAnyIdentifier,
  createStudent,
  updateStudent,
  getStudentById,
  listStudents,
  mapStudentToClass,
  mapStudentToAcademic,
  norm,
};