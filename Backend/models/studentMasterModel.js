const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3/4 — Student Master CRUD + identity matching + mapping.
// Phase 10 — Student Academic Hierarchy: a student belongs to an academic context
// (Program + Academic Session + Semester), exactly like a course. The same context
// determines which students appear in which courses — the course does NOT own a
// separate copy of the student master.
// ─────────────────────────────────────────────────────────────────────────────

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

// Context-aware identity lookup: a registration/enrollment number is unique WITHIN a
// Program + Session context, but the same number may legitimately exist in an unrelated
// historical context (e.g. the same enrollment number pattern in BBA 2026-27 and BBA
// 2027-28 are distinct students). Never matched by name alone.
const findStudentInContext = async ({ registrationNumber, programId, sessionId }) => {
  if (!registrationNumber) return null;
  const [rows] = await pool.query(
    `SELECT * FROM students
     WHERE registration_number = ? AND academic_program_id = ? AND academic_session_id = ?
     LIMIT 1`,
    [String(registrationNumber).trim(), programId, sessionId],
  );
  return rows[0] || null;
};

// Create a student in the master with its academic context. Nullable academic FKs (3A) allow
// NULL = "unmapped"; we never invent semester/department. Returns insertId.
const createStudent = async ({ registrationNumber, rollNumber, name, email, phone, status, programId, sessionId, semester }) => {
  const [result] = await pool.query(
    `INSERT INTO students (registration_number, roll_number, roll_no, name, email, phone, status, academic_program_id, academic_session_id, semester)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [registrationNumber, rollNumber || null, rollNumber || null, name, email || null, phone || null, status || 'Active',
      programId || null, sessionId || null, semester ?? null],
  );
  const [inserted] = await pool.query('SELECT * FROM students WHERE id = ?', [result.insertId]);
  return { student: inserted[0], created: true };
};

// Update a student's identity/master/academic-context fields.
const updateStudent = async (id, { registrationNumber, rollNumber, name, email, phone, status, programId, sessionId, semester }) => {
  const sets = [];
  const values = [];
  if (registrationNumber !== undefined) { sets.push('registration_number = ?'); values.push(registrationNumber); }
  if (rollNumber !== undefined) { sets.push('roll_number = ?'); values.push(rollNumber); }
  if (rollNumber !== undefined) { sets.push('roll_no = ?'); values.push(rollNumber); }
  if (name !== undefined) { sets.push('name = ?'); values.push(name); }
  if (email !== undefined) { sets.push('email = ?'); values.push(email); }
  if (phone !== undefined) { sets.push('phone = ?'); values.push(phone); }
  if (status !== undefined) { sets.push('status = ?'); values.push(status); }
  if (programId !== undefined) { sets.push('academic_program_id = ?'); values.push(programId); }
  if (sessionId !== undefined) { sets.push('academic_session_id = ?'); values.push(sessionId); }
  if (semester !== undefined) { sets.push('semester = ?'); values.push(semester); }
  if (sets.length === 0) return false;
  values.push(id);
  const [result] = await pool.query(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`, values);
  return result.affectedRows > 0;
};

const getStudentById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM students WHERE id = ?', [id]);
  return rows[0] || null;
};

// Students belonging to an academic context (Program + Session + Semester).
// Used to auto-populate course enrollment — the SAME students appear in every course of
// their context, with no per-course student list to maintain.
const getStudentsByContext = async ({ programId, sessionId, semester }) => {
  if (!programId || !sessionId || semester === undefined || semester === null) return [];
  const [rows] = await pool.query(
    `SELECT st.*, p.name AS program_name, d.name AS department_name, d.school_id,
            s.name AS school_name, sess.name AS session_name
     FROM students st
     LEFT JOIN programs p ON p.id = st.academic_program_id
     LEFT JOIN departments d ON d.id = p.department_id
     LEFT JOIN schools s ON s.id = d.school_id
     LEFT JOIN academic_sessions sess ON sess.id = st.academic_session_id
     WHERE st.academic_program_id = ? AND st.academic_session_id = ? AND st.semester = ?
     ORDER BY st.registration_number ASC`,
    [programId, sessionId, semester],
  );
  return rows;
};

// Enroll students into every course sharing the same academic context, so one upload makes
// the students available in all applicable subjects (MGT101/MGT102/MGT103 …) at once.
//   - with a studentId: enrolls that one student into all context courses.
//   - without a studentId: enrolls ALL students of the context into all context courses.
// Idempotent (INSERT IGNORE) — never removes existing enrollments.
const enrollStudentInAllContextCourses = async ({ studentId, programId, sessionId, semester }) => {
  if (!programId || !sessionId || semester === undefined || semester === null) return 0;
  let result;
  if (studentId) {
    [result] = await pool.query(
      `INSERT IGNORE INTO course_enrollments (course_id, student_id)
       SELECT c.id, ? FROM courses c
       WHERE c.program_id = ? AND c.academic_session_id = ?
         AND c.semester = ? AND c.status != 'Archived'`,
      [studentId, programId, sessionId, semester],
    );
  } else {
    [result] = await pool.query(
      `INSERT IGNORE INTO course_enrollments (course_id, student_id)
       SELECT c.id, st.id FROM courses c
       JOIN students st ON st.academic_program_id = c.program_id
        AND st.academic_session_id = c.academic_session_id
        AND st.semester = c.semester
       WHERE c.program_id = ? AND c.academic_session_id = ?
         AND c.semester = ? AND c.status != 'Archived'`,
      [programId, sessionId, semester],
    );
  }
  return result.affectedRows;
};

// Section 14/2 — search + server-side filtering/pagination, and read-scoping for
// School Admin / Department Admin (schoolId/departmentId narrow via the same
// program -> department -> school join used everywhere else in the hierarchy).
const listStudents = async (filters = {}) => {
  const conditions = [];
  const params = [];
  if (filters.search) {
    const q = `%${filters.search}%`;
    conditions.push('(st.registration_number LIKE ? OR st.name LIKE ? OR st.roll_number LIKE ? OR st.roll_no LIKE ?)');
    params.push(q, q, q, q);
  }
  if (filters.status) { conditions.push('st.status = ?'); params.push(filters.status); }
  if (filters.programId) { conditions.push('st.academic_program_id = ?'); params.push(filters.programId); }
  if (filters.sessionId) { conditions.push('st.academic_session_id = ?'); params.push(filters.sessionId); }
  if (filters.semester) { conditions.push('st.semester = ?'); params.push(filters.semester); }
  if (filters.classId) { conditions.push('st.class_id = ?'); params.push(filters.classId); }
  if (filters.departmentId) { conditions.push('p.department_id = ?'); params.push(filters.departmentId); }
  if (filters.schoolId) { conditions.push('d.school_id = ?'); params.push(filters.schoolId); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const limit = filters.limit ? Number(filters.limit) : 50;
  const offset = filters.offset ? Number(filters.offset) : 0;

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM students st
     LEFT JOIN programs p ON p.id = st.academic_program_id
     LEFT JOIN departments d ON d.id = p.department_id
     ${where}`,
    params,
  );

  const [rows] = await pool.query(
    `SELECT st.*,
            p.name AS program_name, p.id AS academic_program_id_fk,
            d.name AS department_name, d.school_id,
            sess.name AS session_name,
            (SELECT GROUP_CONCAT(DISTINCT ce.course_id) FROM course_enrollments ce WHERE ce.student_id = st.id) AS enrolled_course_ids,
            (SELECT GROUP_CONCAT(DISTINCT cs.class_id) FROM class_students cs WHERE cs.student_id = st.id) AS class_ids
     FROM students st
     LEFT JOIN programs p ON p.id = st.academic_program_id
     LEFT JOIN departments d ON d.id = p.department_id
     LEFT JOIN academic_sessions sess ON sess.id = st.academic_session_id
     ${where}
     ORDER BY st.registration_number ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return { rows, total, limit, offset };
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
  findStudentInContext,
  createStudent,
  updateStudent,
  getStudentById,
  listStudents,
  getStudentsByContext,
  enrollStudentInAllContextCourses,
  mapStudentToClass,
  mapStudentToAcademic,
  norm,
};