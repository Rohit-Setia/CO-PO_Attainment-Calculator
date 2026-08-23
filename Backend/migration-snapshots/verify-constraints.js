const mysql = require('mysql2/promise');

// Verify no duplicate indices/constraints remain after multiple migration runs.
(async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost', user: 'ctuser', password: 'ctpass', database: 'teacher_auth',
    });

    for (const table of ['students', 'programs', 'departments', 'courses']) {
      const [indices] = await connection.query('SHOW INDEX FROM ' + table);
      const uniqueNames = new Set(indices.map((i) => i.Key_name));
      console.log(`${table} indices (${uniqueNames.size}):`, [...uniqueNames].join(', '));
    }

    const [fks] = await connection.query(
      `SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
         AND TABLE_NAME IN ('students','programs','departments','courses')
       ORDER BY TABLE_NAME, COLUMN_NAME`,
    );
    console.log('FKs:');
    fks.forEach((f) => console.log(' ', f.TABLE_NAME + '.' + f.COLUMN_NAME, '[' + f.CONSTRAINT_NAME + ']'));
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
})();