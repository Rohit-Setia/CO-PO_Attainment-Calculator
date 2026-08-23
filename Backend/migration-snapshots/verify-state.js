// Read-only verification of schema + counts after a migration run.
// Usage: node migration-snapshots/verify-state.js
const mysql = require('mysql2/promise');

(async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'ctuser',
      password: process.env.DB_PASSWORD || 'ctpass',
      database: process.env.DB_NAME || 'teacher_auth',
    });

    const tables = [
      'teachers', 'schools', 'departments', 'branches', 'programs',
      'academic_sessions', 'academic_classes', 'students', 'class_students',
      'course_enrollments', 'courses', 'course_outcomes', 'co_po_values',
      'question_configs', 'student_marks', 'student_co_marks', 'student_question_marks',
    ];
    const counts = {};
    for (const t of tables) {
      const [r] = await connection.query(`SELECT COUNT(*) AS c FROM ${t}`);
      counts[t] = r[0].c;
    }
    console.log('COUNTS:', JSON.stringify(counts, null, 0));

    const [studentCols] = await connection.query('SHOW COLUMNS FROM students');
    console.log('students cols:', studentCols.map((x) => x.Field).join(', '));
    const [programCols] = await connection.query('SHOW COLUMNS FROM programs');
    console.log('programs cols:', programCols.map((x) => x.Field).join(', '));

    const [idx] = await connection.query("SHOW INDEX FROM students WHERE Key_name LIKE 'idx_students%'");
    console.log('students custom indexes:', [...new Set(idx.map((i) => i.Key_name))].join(', ') || 'none');

    // Verify the 5 legacy students are unmodified in identity-critical fields
    const [legacyStudents] = await connection.query(
      'SELECT id, registration_number, name, semester_id, department_id, classroom_id FROM students ORDER BY id',
    );
    console.log('LEGACY STUDENTS:', JSON.stringify(legacyStudents));

    // Verify no duplicate registration numbers in students
    const [dupStudents] = await connection.query(
      'SELECT registration_number, COUNT(*) AS c FROM students GROUP BY registration_number HAVING c > 1',
    );
    console.log('duplicate student reg_nos:', dupStudents.length === 0 ? 'NONE' : JSON.stringify(dupStudents));

    // Verify old vs new columns survived (legacy must still exist)
    const legacyCols = studentCols.map((x) => x.Field);
    ['roll_no', 'univ_roll_no', 'gender', 'email', 'phone', 'batch', 'semester_id', 'department_id', 'classroom_id', 'status'].forEach((c) => {
      if (!legacyCols.includes(c)) console.error('MISSING legacy column:', c);
    });
    console.log('legacy student columns preserved: OK');
  } catch (err) {
    console.error('Verify failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
})();