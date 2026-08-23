// Read-only state capture for data-preservation safety. Does NOT mutate anything.
// Usage: node migration-snapshots/capture-snapshot.js [output-file.json] [db-name]
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const outFile = process.argv[2] || 'pre-phase2-snapshot.json';
const dbName = process.argv[3] || 'teacher_auth';

(async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'ctuser',
      password: process.env.DB_PASSWORD || 'ctpass',
      database: dbName,
    });

    const out = { captured_at: new Date().toISOString(), database: dbName };

    const dataTables = [
      'teachers', 'schools', 'departments', 'branches', 'programs',
      'academic_sessions', 'academic_classes', 'students', 'class_students',
      'course_enrollments', 'courses', 'course_outcomes', 'co_po_values',
      'question_configs', 'student_marks', 'student_co_marks', 'student_question_marks',
    ];
    for (const table of dataTables) {
      const [rows] = await connection.query(`SELECT * FROM ${table}`);
      out[table] = { count: rows.length, rows };
    }

    const colTables = ['students', 'departments', 'programs', 'branches', 'academic_classes', 'courses'];
    for (const table of colTables) {
      const [cols] = await connection.query(`SHOW COLUMNS FROM ${table}`);
      out[`${table}_columns`] = cols.map((x) => ({
        Field: x.Field, Type: x.Type, Null: x.Null, Key: x.Key, Default: x.Default,
      }));
    }

    const [fks] = await connection.query(
      `SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
       ORDER BY TABLE_NAME, COLUMN_NAME`,
    );
    out.foreign_keys = fks;
    out.table_counts = {};
    for (const table of dataTables) out.table_counts[table] = out[table].count;

    const dir = path.join(__dirname);
    fs.writeFileSync(path.join(dir, outFile), JSON.stringify(out, null, 2), 'utf8');
    console.log('Snapshot written:', path.join(dir, outFile));
    console.log('Key counts:', JSON.stringify(out.table_counts));
    console.log('students:', out.students.count, 'student_marks:', out.student_marks.count);
  } catch (err) {
    console.error('Snapshot failed:', err.message);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
})();