const pool = require('../config/db');

const createMarksTable = async () => {
  // 1. Drop conflicting legacy table if it lacks question_marks
  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM student_marks');
    const hasLegacyColumns = cols.some(col => col.Field === 'student_id' || col.Field === 'assessment_id');
    const hasQuestionMarksCol = cols.some(col => col.Field === 'question_marks');
    if (hasLegacyColumns || !hasQuestionMarksCol) {
      console.log('Dropping legacy/outdated student_marks table...');
      await pool.query('DROP TABLE IF EXISTS student_marks');
    }
  } catch (err) {
    // Table doesn't exist yet, which is fine
  }

  // 2. Create new student_marks table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_marks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      course_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      reg_no VARCHAR(50) NOT NULL,
      exam_type ENUM('MTT', 'ETT') NOT NULL,
      co1 DECIMAL(5,2) DEFAULT 0.00,
      co2 DECIMAL(5,2) DEFAULT 0.00,
      co3 DECIMAL(5,2) DEFAULT 0.00,
      co4 DECIMAL(5,2) DEFAULT 0.00,
      co5 DECIMAL(5,2) DEFAULT 0.00,
      co6 DECIMAL(5,2) DEFAULT 0.00,
      total_marks DECIMAL(6,2) DEFAULT 0.00,
      question_marks TEXT,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      UNIQUE KEY unique_student_exam (course_id, reg_no, exam_type)
    ) ENGINE=InnoDB;
  `);
};

const getMarksByCourse = async (courseId, examType) => {
  let query = 'SELECT * FROM student_marks WHERE course_id = ?';
  const params = [courseId];
  
  if (examType) {
    query += ' AND exam_type = ?';
    params.push(examType);
  }
  
  query += ' ORDER BY reg_no ASC';
  const [rows] = await pool.query(query, params);
  return rows;
};

const saveStudentMark = async ({ courseId, name, regNo, examType, co1, co2, co3, co4, co5, co6, totalMarks, questionMarks }) => {
  const query = `
    INSERT INTO student_marks 
      (course_id, name, reg_no, exam_type, co1, co2, co3, co4, co5, co6, total_marks, question_marks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      co1 = VALUES(co1),
      co2 = VALUES(co2),
      co3 = VALUES(co3),
      co4 = VALUES(co4),
      co5 = VALUES(co5),
      co6 = VALUES(co6),
      total_marks = VALUES(total_marks),
      question_marks = VALUES(question_marks)
  `;

  await pool.query(query, [
    courseId,
    name,
    regNo,
    examType,
    co1 || 0,
    co2 || 0,
    co3 || 0,
    co4 || 0,
    co5 || 0,
    co6 || 0,
    totalMarks || 0,
    questionMarks || null,
  ]);
};

const deleteMarksByCourse = async (courseId, examType) => {
  let query = 'DELETE FROM student_marks WHERE course_id = ?';
  const params = [courseId];
  if (examType) {
    query += ' AND exam_type = ?';
    params.push(examType);
  }
  await pool.query(query, params);
};

module.exports = {
  createMarksTable,
  getMarksByCourse,
  saveStudentMark,
  deleteMarksByCourse,
};
