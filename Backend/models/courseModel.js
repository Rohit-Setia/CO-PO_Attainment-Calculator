const pool = require('../config/db');

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

const getCoursesByTeacher = async (teacherId) => {
  const [rows] = await pool.query(
    'SELECT * FROM courses WHERE teacher_id = ? ORDER BY created_at DESC',
    [teacherId]
  );
  return rows;
};

const getCourseById = async (id, teacherId) => {
  const [rows] = await pool.query(
    'SELECT * FROM courses WHERE id = ? AND teacher_id = ?',
    [id, teacherId]
  );
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

const deleteCourse = async (id, teacherId) => {
  const [result] = await pool.query(
    'DELETE FROM courses WHERE id = ? AND teacher_id = ?',
    [id, teacherId]
  );
  return result.affectedRows > 0;
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
  getCoursesByTeacher,
  getCourseById,
  createCourse,
  deleteCourse,
  getCoDescriptions,
  saveCoDescriptions,
};
