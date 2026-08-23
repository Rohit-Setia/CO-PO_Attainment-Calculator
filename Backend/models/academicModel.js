const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3/4 — University hierarchy + Student Master + Class/Enrollment model.
// All functions prevent duplication and preserve historical data.
// -----------------------------------------------------------------------------

// ---------- Schools ----------
const getAllSchools = async () => {
  const [rows] = await pool.query('SELECT * FROM schools ORDER BY name ASC');
  return rows;
};

const createSchool = async ({ name, code, description }) => {
  const [result] = await pool.query(
    'INSERT INTO schools (name, code, description, status) VALUES (?, ?, ?, ?)',
    [name, code || null, description || null, 'Active'],
  );
  return result.insertId;
};

const updateSchool = async (id, { name, code, description, status }) => {
  const sets = [];
  const values = [];
  if (name !== undefined) { sets.push('name = ?'); values.push(name); }
  if (code !== undefined) { sets.push('code = ?'); values.push(code); }
  if (description !== undefined) { sets.push('description = ?'); values.push(description); }
  if (status !== undefined) { sets.push('status = ?'); values.push(status); }
  if (sets.length === 0) return false;
  values.push(id);
  const [result] = await pool.query(`UPDATE schools SET ${sets.join(', ')} WHERE id = ?`, values);
  return result.affectedRows > 0;
};

const deleteSchool = async (id) => {
  const [result] = await pool.query('DELETE FROM schools WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

// ---------- Departments ----------
const getDepartmentsBySchool = async (schoolId) => {
  if (schoolId) {
    const [rows] = await pool.query('SELECT * FROM departments WHERE school_id = ? ORDER BY name ASC', [schoolId]);
    return rows;
  }
  const [rows] = await pool.query('SELECT * FROM departments ORDER BY name ASC');
  return rows;
};

const createDepartment = async ({ schoolId, name, code, hod }) => {
  const [result] = await pool.query(
    'INSERT INTO departments (school_id, name, code, hod, status) VALUES (?, ?, ?, ?, ?)',
    [schoolId, name, code || null, hod || null, 'Active'],
  );
  return result.insertId;
};

const updateDepartment = async (id, { name, code, hod, status }) => {
  const sets = [];
  const values = [];
  if (name !== undefined) { sets.push('name = ?'); values.push(name); }
  if (code !== undefined) { sets.push('code = ?'); values.push(code); }
  if (hod !== undefined) { sets.push('hod = ?'); values.push(hod); }
  if (status !== undefined) { sets.push('status = ?'); values.push(status); }
  if (sets.length === 0) return false;
  values.push(id);
  const [result] = await pool.query(`UPDATE departments SET ${sets.join(', ')} WHERE id = ?`, values);
  return result.affectedRows > 0;
};

// ---------- Branches (optional) ----------
const getBranchesByDepartment = async (departmentId) => {
  if (departmentId) {
    const [rows] = await pool.query('SELECT * FROM branches WHERE department_id = ? ORDER BY name ASC', [departmentId]);
    return rows;
  }
  const [rows] = await pool.query('SELECT * FROM branches ORDER BY name ASC');
  return rows;
};

const createBranch = async ({ departmentId, name, code }) => {
  const [result] = await pool.query(
    'INSERT INTO branches (department_id, name, code, status) VALUES (?, ?, ?, ?)',
    [departmentId, name, code || null, 'Active'],
  );
  return result.insertId;
};

// ---------- Programs ----------
const getProgramsByDepartment = async (departmentId) => {
  if (departmentId) {
    const [rows] = await pool.query('SELECT * FROM programs WHERE department_id = ? ORDER BY name ASC', [departmentId]);
    return rows;
  }
  const [rows] = await pool.query('SELECT * FROM programs ORDER BY name ASC');
  return rows;
};

const createProgram = async ({ departmentId, branchId, name, code, degree, duration }) => {
  const [result] = await pool.query(
    `INSERT INTO programs (department_id, branch_id, name, code, degree, duration, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [departmentId, branchId || null, name, code || null, degree || null, duration || 4, 'Active'],
  );
  return result.insertId;
};

const updateProgram = async (id, { departmentId, branchId, name, code, degree, duration, status }) => {
  const sets = [];
  const values = [];
  if (departmentId !== undefined) { sets.push('department_id = ?'); values.push(departmentId); }
  if (branchId !== undefined) { sets.push('branch_id = ?'); values.push(branchId); }
  if (name !== undefined) { sets.push('name = ?'); values.push(name); }
  if (code !== undefined) { sets.push('code = ?'); values.push(code); }
  if (degree !== undefined) { sets.push('degree = ?'); values.push(degree); }
  if (duration !== undefined) { sets.push('duration = ?'); values.push(duration); }
  if (status !== undefined) { sets.push('status = ?'); values.push(status); }
  if (sets.length === 0) return false;
  values.push(id);
  const [result] = await pool.query(`UPDATE programs SET ${sets.join(', ')} WHERE id = ?`, values);
  return result.affectedRows > 0;
};

// ---------- Academic Sessions ----------
const getAllSessions = async () => {
  const [rows] = await pool.query('SELECT * FROM academic_sessions ORDER BY start_year DESC, name ASC');
  return rows;
};

const createSession = async ({ name, startYear, endYear }) => {
  const [result] = await pool.query(
    'INSERT INTO academic_sessions (name, start_year, end_year, status) VALUES (?, ?, ?, ?)',
    [name, startYear || null, endYear || null, 'Active'],
  );
  return result.insertId;
};

const updateSession = async (id, { name, startYear, endYear, status }) => {
  const sets = [];
  const values = [];
  if (name !== undefined) { sets.push('name = ?'); values.push(name); }
  if (startYear !== undefined) { sets.push('start_year = ?'); values.push(startYear); }
  if (endYear !== undefined) { sets.push('end_year = ?'); values.push(endYear); }
  if (status !== undefined) { sets.push('status = ?'); values.push(status); }
  if (sets.length === 0) return false;
  values.push(id);
  const [result] = await pool.query(`UPDATE academic_sessions SET ${sets.join(', ')} WHERE id = ?`, values);
  return result.affectedRows > 0;
};

// ---------- Academic Classes ----------
const getClasses = async (filters = {}) => {
  const conditions = [];
  const params = [];
  if (filters.programId) { conditions.push('ac.program_id = ?'); params.push(filters.programId); }
  if (filters.sessionId) { conditions.push('ac.academic_session_id = ?'); params.push(filters.sessionId); }
  if (filters.semester) { conditions.push('ac.semester = ?'); params.push(filters.semester); }
  if (filters.section) { conditions.push('ac.section = ?'); params.push(filters.section); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT ac.*, p.name AS program_name, p.code AS program_code, p.department_id,
            d.name AS department_name, d.school_id, s.name AS school_name,
            sess.name AS session_name,
            (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = ac.id) AS student_count,
            (SELECT COUNT(DISTINCT ce.student_id) FROM course_enrollments ce
               JOIN courses c ON c.id = ce.course_id WHERE c.program_id = ac.program_id
               AND (c.academic_session_id = ac.academic_session_id OR (c.academic_session_id IS NULL AND ac.academic_session_id IS NULL))) AS enroll_count
     FROM academic_classes ac
     LEFT JOIN programs p ON p.id = ac.program_id
     LEFT JOIN departments d ON d.id = p.department_id
     LEFT JOIN schools s ON s.id = d.school_id
     LEFT JOIN academic_sessions sess ON sess.id = ac.academic_session_id
     ${where}
     ORDER BY s.name ASC, d.name ASC, p.name ASC, ac.semester ASC, ac.section ASC`,
    params,
  );
  return rows;
};

const getClassById = async (classId) => {
  const [rows] = await pool.query('SELECT * FROM academic_classes WHERE id = ?', [classId]);
  return rows[0] || null;
};

const createClass = async ({ programId, sessionId, semester, section }) => {
  const [result] = await pool.query(
    'INSERT INTO academic_classes (program_id, academic_session_id, semester, section, status) VALUES (?, ?, ?, ?, ?)',
    [programId, sessionId, semester, section || null, 'Active'],
  );
  return result.insertId;
};

const updateClass = async (id, { programId, sessionId, semester, section, status }) => {
  const sets = [];
  const values = [];
  if (programId !== undefined) { sets.push('program_id = ?'); values.push(programId); }
  if (sessionId !== undefined) { sets.push('academic_session_id = ?'); values.push(sessionId); }
  if (semester !== undefined) { sets.push('semester = ?'); values.push(semester); }
  if (section !== undefined) { sets.push('section = ?'); values.push(section); }
  if (status !== undefined) { sets.push('status = ?'); values.push(status); }
  if (sets.length === 0) return false;
  values.push(id);
  const [result] = await pool.query(`UPDATE academic_classes SET ${sets.join(', ')} WHERE id = ?`, values);
  return result.affectedRows > 0;
};

module.exports = {
  getAllSchools, createSchool, updateSchool, deleteSchool,
  getDepartmentsBySchool, createDepartment, updateDepartment,
  getBranchesByDepartment, createBranch,
  getProgramsByDepartment, createProgram, updateProgram,
  getAllSessions, createSession, updateSession,
  getClasses, getClassById, createClass, updateClass,
};
// ---------- Class Students (Student ↔ Class) ----------
const getStudentsForClass = async (classId) => {
  const [rows] = await pool.query(
    `SELECT st.id, st.registration_number, st.roll_number, st.roll_no, st.name, st.email, st.status
     FROM class_students cs
     JOIN students st ON st.id = cs.student_id
     WHERE cs.class_id = ?
     ORDER BY st.registration_number ASC`,
    [classId],
  );
  return rows;
};

const addStudentToClass = async (classId, studentId) => {
  await pool.query(
    'INSERT IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)',
    [classId, studentId],
  );
  return true;
};

const removeStudentFromClass = async (classId, studentId) => {
  const [result] = await pool.query(
    'DELETE FROM class_students WHERE class_id = ? AND student_id = ?',
    [classId, studentId],
  );
  return result.affectedRows > 0;
};

const addManyStudentsToClass = async (classId, studentIds) => {
  for (const sid of studentIds) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query('INSERT IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)', [classId, sid]);
  }
  return true;
};

module.exports = {
  getAllSchools, createSchool, updateSchool, deleteSchool,
  getDepartmentsBySchool, createDepartment, updateDepartment,
  getBranchesByDepartment, createBranch,
  getProgramsByDepartment, createProgram, updateProgram,
  getAllSessions, createSession, updateSession,
  getClasses, getClassById, createClass, updateClass,
  getStudentsForClass, addStudentToClass, removeStudentFromClass, addManyStudentsToClass,
};
// ---------- Course Enrollment ----------
const getEnrolledStudentsForCourse = async (courseId) => {
  const [rows] = await pool.query(
    `SELECT st.id, st.registration_number, st.roll_number, st.roll_no, st.univ_roll_no, st.name, st.email, st.status
     FROM course_enrollments ce
     JOIN students st ON st.id = ce.student_id
     WHERE ce.course_id = ?
     ORDER BY st.registration_number ASC`,
    [courseId],
  );
  return rows;
};

const enrollStudentInCourse = async (courseId, studentId) => {
  await pool.query(
    'INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES (?, ?)',
    [courseId, studentId],
  );
  return true;
};

const unenrollStudentFromCourse = async (courseId, studentId) => {
  const [result] = await pool.query(
    'DELETE FROM course_enrollments WHERE course_id = ? AND student_id = ?',
    [courseId, studentId],
  );
  return result.affectedRows > 0;
};

const enrollManyStudentsInCourse = async (courseId, studentIds) => {
  for (const sid of studentIds) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query('INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [courseId, sid]);
  }
  return true;
};

// Enroll the entire class membership into a course (safe, de-duplicated).
const enrollEntireClassInCourse = async (classId, courseId) => {
  const students = await getStudentsForClass(classId);
  await enrollManyStudentsInCourse(courseId, students.map((s) => s.id));
  return students.length;
};

// ---------- Course ↔ Hierarchy context ----------
// Resolves School/Department/Program/Academic Session names for one or more courses via
// courses.program_id / courses.academic_session_id. Used for breadcrumb display wherever a
// course is shown — the single place this join is written, reused by both the per-course
// attainment page and the dashboard aggregation so the two never drift apart.
const getCourseHierarchyContext = async (courseIds) => {
  if (!Array.isArray(courseIds) || courseIds.length === 0) return new Map();
  const placeholders = courseIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT c.id AS course_id, c.program_id, c.academic_session_id,
            p.name AS program_name, d.id AS department_id, d.name AS department_name, d.code AS department_code,
            s.id AS school_id, s.name AS school_name, sess.name AS session_name
     FROM courses c
     LEFT JOIN programs p ON p.id = c.program_id
     LEFT JOIN departments d ON d.id = p.department_id
     LEFT JOIN schools s ON s.id = d.school_id
     LEFT JOIN academic_sessions sess ON sess.id = c.academic_session_id
     WHERE c.id IN (${placeholders})`,
    courseIds,
  );
  return new Map(rows.map((r) => [r.course_id, r]));
};

module.exports = {
  getAllSchools, createSchool, updateSchool, deleteSchool,
  getDepartmentsBySchool, createDepartment, updateDepartment,
  getBranchesByDepartment, createBranch,
  getProgramsByDepartment, createProgram, updateProgram,
  getAllSessions, createSession, updateSession,
  getClasses, getClassById, createClass, updateClass,
  getStudentsForClass, addStudentToClass, removeStudentFromClass, addManyStudentsToClass,
  getEnrolledStudentsForCourse, enrollStudentInCourse, unenrollStudentFromCourse, enrollManyStudentsInCourse,
  enrollEntireClassInCourse,
  getCourseHierarchyContext,
};