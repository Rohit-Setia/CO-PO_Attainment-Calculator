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
  // Use set-based batch operations to avoid thousands of individual roundtrips
  // that cause socket resets (ECONNRESET) over cloud database connections.
  await pool.query(`
    INSERT IGNORE INTO students (registration_number, name)
    SELECT DISTINCT reg_no, COALESCE(NULLIF(name, ''), 'Unknown')
    FROM student_marks
    WHERE reg_no IS NOT NULL AND reg_no != ''
  `);

  await pool.query(`
    INSERT IGNORE INTO course_enrollments (course_id, student_id)
    SELECT DISTINCT sm.course_id, s.id
    FROM student_marks sm
    JOIN students s ON s.registration_number = sm.reg_no
    JOIN courses c ON c.id = sm.course_id
    WHERE sm.reg_no IS NOT NULL AND sm.reg_no != '' AND sm.course_id IS NOT NULL
  `);
};

module.exports = {
  createStudentTables,
  migrateLegacyStudentData,
};
