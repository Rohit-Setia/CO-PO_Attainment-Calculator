const pool = require('../config/db');
const { ensureColumn } = require('./universityModel');

// PHASE 7 — additive. Courses previously had no lifecycle state; historical courses with
// marks must stay reportable, so this adds a soft-status field instead of enabling deletion.
const addCourseStatusColumn = async () => {
  await ensureColumn('courses', 'status', "ENUM('Active','Inactive','Archived') NOT NULL DEFAULT 'Active'");
};

const createCoursesTable = async () => {
  // 1. Create courses table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS courses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      teacher_id INT NOT NULL,
      school VARCHAR(100) NOT NULL,
      department VARCHAR(100) NOT NULL,
      subject_name VARCHAR(100) NOT NULL,
      course_code VARCHAR(50) NOT NULL,
      semester INT NOT NULL,
      academic_year VARCHAR(20) NOT NULL,
      num_cos INT DEFAULT 5,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // 2. Create co_descriptions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS co_descriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      course_id INT NOT NULL,
      co_number INT NOT NULL,
      description TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      UNIQUE KEY unique_course_co (course_id, co_number)
    ) ENGINE=InnoDB;
  `);
};

// 3. Create user-course assignment table (RBAC fine-grained access)
const createUserCourseAssignmentsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_course_assignments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      course_id INT NOT NULL,
      assigned_role ENUM('Teacher', 'Viewer') NOT NULL DEFAULT 'Teacher',
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES teachers(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_course (user_id, course_id)
    ) ENGINE=InnoDB;
  `);
};

/**
 * getCoursesByTeacher:
 * - Admin / Examination Team → see all courses in the system
 * - Teacher / Viewer → see only courses they created or are assigned to
 */
const getCoursesByTeacher = async (userId, userRole) => {
  if (userRole === 'Admin' || userRole === 'Examination Team') {
    const [rows] = await pool.query(
      'SELECT * FROM courses ORDER BY created_at DESC'
    );
    return rows;
  }
  // For Teachers and Viewers: owned courses UNION assigned courses
  const [rows] = await pool.query(`
    SELECT DISTINCT c.* FROM courses c
    LEFT JOIN user_course_assignments uca ON uca.course_id = c.id AND uca.user_id = ?
    WHERE c.teacher_id = ? OR uca.user_id = ?
    ORDER BY c.created_at DESC
  `, [userId, userId, userId]);
  return rows;
};

/**
 * getCourseById:
 * - Admin / Examination Team → can access any course
 * - Teacher / Viewer → must own or be assigned to the course
 */
const getCourseById = async (id, userId, userRole) => {
  if (userRole === 'Admin' || userRole === 'Examination Team') {
    const [rows] = await pool.query(
      'SELECT * FROM courses WHERE id = ?',
      [id]
    );
    return rows[0];
  }
  const [rows] = await pool.query(`
    SELECT DISTINCT c.* FROM courses c
    LEFT JOIN user_course_assignments uca ON uca.course_id = c.id AND uca.user_id = ?
    WHERE c.id = ? AND (c.teacher_id = ? OR uca.user_id = ?)
  `, [userId, id, userId, userId]);
  return rows[0];
};

const createCourse = async ({ teacherId, school, department, subjectName, courseCode, semester, academicYear, numCos }) => {
  const [result] = await pool.query(
    `INSERT INTO courses (teacher_id, school, department, subject_name, course_code, semester, academic_year, num_cos) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [teacherId, school, department, subjectName, courseCode, semester, academicYear, numCos]
  );
  return result.insertId;
};

/**
 * deleteCourse:
 * - Admin → can delete any course
 * - Teacher → can only delete courses they created (teacher_id)
 */
const deleteCourse = async (id, userId, userRole) => {
  if (userRole === 'Admin') {
    const [result] = await pool.query('DELETE FROM courses WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
  const [result] = await pool.query(
    'DELETE FROM courses WHERE id = ? AND teacher_id = ?',
    [id, userId]
  );
  return result.affectedRows > 0;
};

// Assign or update a user's role on a specific course
const assignUserToCourse = async (courseId, userId, assignedRole) => {
  await pool.query(`
    INSERT INTO user_course_assignments (user_id, course_id, assigned_role)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE assigned_role = VALUES(assigned_role)
  `, [userId, courseId, assignedRole]);
};

// Remove a user's assignment from a course
const removeUserFromCourse = async (courseId, userId) => {
  const [result] = await pool.query(
    'DELETE FROM user_course_assignments WHERE course_id = ? AND user_id = ?',
    [courseId, userId]
  );
  return result.affectedRows > 0;
};

// Get all users assigned to a specific course
const getAssignmentsForCourse = async (courseId) => {
  const [rows] = await pool.query(`
    SELECT t.id, t.name, t.email, t.role AS system_role, uca.assigned_role, uca.assigned_at
    FROM user_course_assignments uca
    JOIN teachers t ON t.id = uca.user_id
    WHERE uca.course_id = ?
    ORDER BY uca.assigned_at DESC
  `, [courseId]);
  return rows;
};

const getCoDescriptions = async (courseId) => {
  const [rows] = await pool.query(
    'SELECT * FROM co_descriptions WHERE course_id = ? ORDER BY co_number ASC',
    [courseId]
  );
  return rows;
};

const saveCoDescriptions = async (courseId, coDescriptions) => {
  // coDescriptions is an array: [{ co_number: 1, description: 'text' }, ...]
  for (const item of coDescriptions) {
    await pool.query(
      `INSERT INTO co_descriptions (course_id, co_number, description) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      [courseId, item.co_number, item.description]
    );
  }
};

module.exports = {
  createCoursesTable,
  addCourseStatusColumn,
  createUserCourseAssignmentsTable,
  getCoursesByTeacher,
  getCourseById,
  createCourse,
  deleteCourse,
  getCoDescriptions,
  saveCoDescriptions,
  assignUserToCourse,
  removeUserFromCourse,
  getAssignmentsForCourse,
};
