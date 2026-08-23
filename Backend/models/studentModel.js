const pool = require('../config/db');

const createStudentTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id INT AUTO_INCREMENT PRIMARY KEY,
      registration_number VARCHAR(100) NOT NULL UNIQUE,
      roll_number VARCHAR(100),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      status ENUM('Active', 'Graduated', 'Withdrawn', 'Inactive') DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS class_students (
      id INT AUTO_INCREMENT PRIMARY KEY,
      class_id INT NOT NULL,
      student_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES academic_classes(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      UNIQUE KEY unique_class_student (class_id, student_id)
    ) ENGINE=InnoDB;
  `);

  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM students LIKE 'reg_no'");
    if (cols.length > 0) {
      await pool.query("ALTER TABLE students RENAME COLUMN reg_no TO registration_number");
    }
  } catch (err) {
    console.error("Failed to alter students table:", err);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS course_enrollments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      course_id INT NOT NULL,
      student_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      UNIQUE KEY unique_course_student (course_id, student_id)
    ) ENGINE=InnoDB;
  `);
};

// Phase 3: Data Migration for Students
const migrateLegacyStudentData = async () => {
  // We need to carefully migrate students from student_marks so we don't duplicate them.
  // We use reg_no as the stable identifier for registration_number.
  
  const [marks] = await pool.query('SELECT DISTINCT name, reg_no FROM student_marks WHERE reg_no IS NOT NULL AND reg_no != ""');
  
  for (const mark of marks) {
    const [existingStudent] = await pool.query('SELECT id FROM students WHERE registration_number = ?', [mark.reg_no]);
    if (existingStudent.length === 0) {
      await pool.query('INSERT IGNORE INTO students (registration_number, name) VALUES (?, ?)', [mark.reg_no, mark.name || 'Unknown']);
    }
  }

  // Next, we can try to build course enrollments based on student_marks presence
  const [allMarks] = await pool.query('SELECT DISTINCT course_id, reg_no FROM student_marks WHERE reg_no IS NOT NULL AND reg_no != ""');
  for (const mark of allMarks) {
    const [student] = await pool.query('SELECT id FROM students WHERE registration_number = ?', [mark.reg_no]);
    if (student.length > 0) {
       await pool.query('INSERT IGNORE INTO course_enrollments (course_id, student_id) VALUES (?, ?)', [mark.course_id, student[0].id]);
    }
  }
};

module.exports = {
  createStudentTables,
  migrateLegacyStudentData,
};
