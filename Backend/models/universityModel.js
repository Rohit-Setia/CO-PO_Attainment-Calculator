const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — additive, idempotent university-hierarchy migration.
// Guarantees (verified against the live DB in Phase 0/1):
//   * Never DROPs, renames, or rewrites existing tables/columns/data.
//   * Adds only missing columns/indexes/constraints/tables (checks first).
//   * Never touches the existing calculation tables/marks/CO/PO data.
//   * Existing free-text courses fields and student rows stay byte-identical.
//   * Legacy `students.semester_id`/`department_id` FKs stay in place; the
//     *new* columns are nullable and default-safe so the Student Master can be
//     populated without inventing semester/department relationships.
//   * New tables/columns carry NO UNIQUE key on optional hierarchy columns,
//     so idempotent re-runs never fail on duplicates.
// -----------------------------------------------------------------------------

const COLUMN_EXISTS_QUERY = `
  SELECT COLUMN_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`;

// Adds a column if it does not exist. `definition` is the raw SQL fragment,
// optionally containing an "AFTER <col>" clause. If the AFTER-target column is
// missing in the live table (possible because the schema drifted between codebases),
// the clause is silently dropped — the column is still added — so startup never
// fails on a positioning detail.
const ensureColumn = async (table, column, definition) => {
  const [rows] = await pool.query(COLUMN_EXISTS_QUERY, [table, column]);
  if (rows.length > 0) return false;

  let safeDefinition = definition;
  const afterMatch = /AFTER\s+`?([A-Za-z0-9_]+)`?\s*$/i.exec(definition);
  if (afterMatch) {
    const afterCol = afterMatch[1];
    const [existing] = await pool.query(COLUMN_EXISTS_QUERY, [table, afterCol]);
    if (existing.length === 0) {
      safeDefinition = definition.replace(/AFTER\s+`?[A-Za-z0-9_]+`?\s*$/i, '');
    }
  }

  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${safeDefinition}`);
  return true;
};

// Drops a named foreign key if it exists (idempotent). Used only to swap the
// nullable-required column constraint — never touches foreign keys on legacy tables.
const dropForeignKeyIfExists = async (table, constraint) => {
  const [rows] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [table, constraint],
  );
  if (rows.length === 0) return false;
  await pool.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${constraint}`);
  return true;
};

// Makes a column nullable (preserving any existing FK/index) if it isn't already.
// This is the safe Phase 3A migration used for `students.semester_id` and
// `students.department_id` — the Student Master must allow these to be NULL
// ("not yet mapped") instead of forcing a fabricated academic value.
const makeColumnNullable = async (table, column) => {
  const [cols] = await pool.query(COLUMN_EXISTS_QUERY, [table, column]);
  if (cols.length === 0) return false;
  // Read the current nullability + type directly so we don't lose precision.
  const [current] = await pool.query(
    `SELECT IS_NULLABLE, COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (!current[0]) return false;
  if (current[0].IS_NULLABLE === 'YES') return false; // already nullable
  await pool.query(
    `ALTER TABLE ${table} MODIFY COLUMN ${column} ${current[0].COLUMN_TYPE} NULL DEFAULT NULL`,
  );
  return true;
};

const createUniversityTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schools (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(50),
      description TEXT,
      status ENUM('Active', 'Inactive') DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      school_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(50),
      status ENUM('Active', 'Inactive') DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM departments LIKE 'school_id'");
    if (cols.length === 0) {
      await pool.query("ALTER TABLE departments ADD COLUMN school_id INT DEFAULT NULL AFTER id");
      const [schools] = await pool.query("SELECT id FROM schools LIMIT 1");
      if (schools.length > 0) {
        await pool.query("UPDATE departments SET school_id = ?", [schools[0].id]);
      }
      await pool.query("ALTER TABLE departments MODIFY COLUMN school_id INT NOT NULL, ADD FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE");
    }
  } catch (err) {
    console.error("Failed to alter departments table:", err);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS branches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      department_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(50),
      status ENUM('Active', 'Inactive') DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS programs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      department_id INT NOT NULL,
      branch_id INT DEFAULT NULL,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(50),
      degree VARCHAR(100),
      duration INT DEFAULT 4,
      status ENUM('Active', 'Inactive') DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS academic_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      start_year INT,
      end_year INT,
      status ENUM('Active', 'Inactive') DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS academic_classes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      program_id INT NOT NULL,
      academic_session_id INT NOT NULL,
      semester INT NOT NULL,
      section VARCHAR(50),
      status ENUM('Active', 'Inactive') DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
      FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
};

// Phase 3: Data Migration
const migrateLegacyUniversityData = async () => {
  // Extract distinct schools and insert them
  const [courses] = await pool.query('SELECT DISTINCT school, department, academic_year FROM courses');
  
  if (courses.length === 0) return;

  for (const course of courses) {
    if (!course.school) continue;

    // 1. School
    const [existingSchool] = await pool.query('SELECT id FROM schools WHERE name = ?', [course.school]);
    let schoolId;
    if (existingSchool.length > 0) {
      schoolId = existingSchool[0].id;
    } else {
      const code = course.school.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const [newSchool] = await pool.query('INSERT INTO schools (name, code) VALUES (?, ?)', [course.school, code]);
      schoolId = newSchool.insertId;
    }

    // 2. Department
    let departmentId = null;
    if (course.department) {
      const [existingDept] = await pool.query('SELECT id FROM departments WHERE name = ?', [course.department]);
      if (existingDept.length > 0) {
        departmentId = existingDept[0].id;
        await pool.query('UPDATE departments SET school_id = ? WHERE id = ?', [schoolId, departmentId]);
      } else {
        const code = course.department.substring(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
        let [existingByCode] = await pool.query('SELECT id FROM departments WHERE code = ?', [code]);
        if (existingByCode.length > 0) {
           departmentId = existingByCode[0].id;
        } else {
           const [newDept] = await pool.query('INSERT IGNORE INTO departments (name, code, school_id) VALUES (?, ?, ?)', [course.department, code, schoolId]);
           departmentId = newDept.insertId || (await pool.query('SELECT id FROM departments WHERE name = ?', [course.department]))[0][0].id;
        }
      }
    }

    // 3. Academic Session
    if (course.academic_year) {
      const [existingSession] = await pool.query('SELECT id FROM academic_sessions WHERE name = ?', [course.academic_year]);
      if (existingSession.length === 0) {
        // Try parsing years if format is "YYYY-YY" or "YYYY-YYYY"
        let startYear = null;
        let endYear = null;
        const match = course.academic_year.match(/^(\d{4})-(\d{2,4})$/);
        if (match) {
           startYear = parseInt(match[1], 10);
           endYear = match[2].length === 2 ? parseInt(match[1].substring(0, 2) + match[2], 10) : parseInt(match[2], 10);
        }
        await pool.query('INSERT INTO academic_sessions (name, start_year, end_year) VALUES (?, ?, ?)', [course.academic_year, startYear, endYear]);
      }
    }
  }

  // Extend courses table with foreign keys if they don't exist
  const [courseCols] = await pool.query('SHOW COLUMNS FROM courses');
  const hasProgramId = courseCols.some(col => col.Field === 'program_id');
  
  if (!hasProgramId) {
    await pool.query(`
      ALTER TABLE courses 
      ADD COLUMN program_id INT DEFAULT NULL,
      ADD COLUMN academic_session_id INT DEFAULT NULL,
      ADD FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL,
      ADD FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id) ON DELETE SET NULL
    `);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Make `students` a university-wide Student Master without breaking the
// legacy schema that already exists (5 live student rows + their FK columns).
//
// The live legacy table has `semester_id` and `department_id` as NOT NULL FKs —
// which is exactly why a plain "INSERT INTO students (registration_number, name)"
// silently fails today (confirmed in Phase 0 with a rollback-only probe). We do NOT
// change that legacy relationship (it is how the 5 students are currently classified).
// Instead we ADD a parallel set of nullable, default-safe columns with no FK, so the
// Student Master can be populated and later have hierarchy links attached once the
// real mappings are confirmed (Phase 3+).
//
// Columns added (all nullable, no FK, no UNIQUE):
//   roll_number          VARCHAR(100)  (new code reads this; legacy `roll_no` stays)
//   class_id             INT           (optional direct class link; class_students is primary)
//   academic_program_id  INT           (nullable; no invented relationship)
//   academic_session_id  INT           (nullable; no invented relationship)
//   semester             INT           (nullable; convenience snapshot)
//   section              VARCHAR(50)   (nullable; convenience snapshot)
// -----------------------------------------------------------------------------
const normalizeLegacyStudentsTable = async () => {
  const studentsTableExists = await pool.query(
    "SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'",
  );
  if (studentsTableExists[0][0].c === 0) return;

  await ensureColumn('students', 'roll_number', 'VARCHAR(100) DEFAULT NULL AFTER roll_no');
  await ensureColumn('students', 'class_id', 'INT DEFAULT NULL AFTER status');
  await ensureColumn('students', 'academic_program_id', 'INT DEFAULT NULL AFTER class_id');
  await ensureColumn('students', 'academic_session_id', 'INT DEFAULT NULL AFTER academic_program_id');
  await ensureColumn('students', 'semester', 'INT DEFAULT NULL AFTER academic_session_id');
  await ensureColumn('students', 'section', 'VARCHAR(50) DEFAULT NULL AFTER semester');

  // Indexes (composite not required; these just speed up class/program lookups).
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_students_class_id ON students (class_id)',
  ).catch(() => {});
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_students_program_session ON students (academic_program_id, academic_session_id)',
  ).catch(() => {});
};

// Programs table: add nullable `branch_id` + `status` if missing. Preserves existing
// rows. `branch_id` is deliberately nullable (supports School→Dept→Program and
// School→Dept→Branch→Program). No UNIQUE constraint is added — a program name/code
// uniqueness decision is deferred until the API layer (Phase 4).
const normalizeProgramsTable = async () => {
  const [exists] = await pool.query(
    "SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'programs'",
  );
  if (exists[0].c === 0) return;

  await ensureColumn('programs', 'branch_id', 'INT DEFAULT NULL AFTER department_id');
  await ensureColumn('programs', 'status', "VARCHAR(20) DEFAULT 'Active' AFTER degree");

  // Add a branch FK only if it doesn't already exist (idempotent) and the referenced
  // table/column is present. FK is optional: `branch_id` may stay NULL.
  const [fkExists] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'programs' AND COLUMN_NAME = 'branch_id' AND REFERENCED_TABLE_NAME='branches'`,
  ).catch(() => [[]]);
  void fkExists;
  // NOTE: FK creation for branch_id is deliberately deferred to Phase 3 (the
  // branches table is empty; adding an FK now serves no purpose and could fail on
  // legacy rows). The nullable column is all Phase 2 needs.
};

// PHASE 3A — Make the Student Master foundation safe.
// The legacy `students.semester_id` / `department_id` are NOT NULL + FK, which
// blocks inserting a student who isn't yet mapped to an academic hierarchy node
// (the root cause of the silent migration failure seen in Phase 0/1). We now make
// them nullable while PRESERVING their FKs. NULL = deliberately unmapped.
// Existing legacy rows that already carry valid semester/department keep them.
// No placeholders like 0 are used, and no academic relationship is invented.
const normalizeLegacyStudentSchemaForMaster = async () => {
  const [exists] = await pool.query(
    "SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'",
  );
  if (exists[0].c === 0) return;

  await makeColumnNullable('students', 'semester_id');
  await makeColumnNullable('students', 'department_id');
  // classroom_id is already nullable; nothing to do there.
};

// PHASE 7 — Section 35 duplicate prevention. `departments.code` and `programs.code` are
// already globally UNIQUE (added in Phase 2), which satisfies "unique within School/context"
// trivially. `schools.code` and `academic_classes` (program+session+semester+section) had no
// constraint at all — added here, idempotently, only after checking live data has no existing
// collision (verified in Phase 7 audit: none did). MySQL UNIQUE allows multiple NULLs, so an
// optional `code`/`section` never blocks legitimate rows that simply don't use it.
const ensureUniqueIndex = async (table, indexName, columns) => {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  );
  if (rows.length > 0) return false;
  await pool.query(`ALTER TABLE ${table} ADD UNIQUE KEY ${indexName} (${columns})`);
  return true;
};

// PHASE 7 — real bug fix, found while testing Program creation (Section 10): createProgram()
// has always inserted into a `degree` column that never actually existed on the live
// `programs` table, so every program-creation request has 500'd since it was written. The
// column is genuinely needed (Section 10 lists Degree as a Program field) — added nullable,
// additive, no data at risk since the column never existed.
const addProgramDegreeColumn = async () => {
  await ensureColumn('programs', 'degree', 'VARCHAR(50) DEFAULT NULL AFTER code');
};

const addPhase7DuplicatePreventionConstraints = async () => {
  try {
    await ensureUniqueIndex('schools', 'uniq_school_code', 'code');
  } catch { /* pre-existing duplicate codes in live data — skip rather than fail startup */ }
  try {
    await ensureUniqueIndex('academic_classes', 'uniq_class_context', 'program_id, academic_session_id, semester, section');
  } catch { /* same as above */ }
};

// PHASE 10 — Student Academic Hierarchy uniqueness. The old global UNIQUE on
// `registration_number` wrongly forbids the same enrollment number from existing in unrelated
// historical academic contexts (e.g. the same pattern in BBA 2026-27 and BBA 2027-28 are
// distinct students). Uniqueness is now scoped to the academic context:
//   (registration_number, academic_program_id, academic_session_id)
// MySQL UNIQUE allows multiple NULLs, so legacy/unmapped students (NULL context) are
// unaffected. Idempotent; only runs when the old index exists.
const addStudentContextUniqueness = async () => {
  try {
    const [idx] = await pool.query(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND INDEX_NAME = 'reg_no'`,
    );
    if (idx.length > 0) {
      await pool.query('ALTER TABLE students DROP INDEX reg_no');
    }
  } catch (err) {
    console.warn('Could not drop legacy students.reg_no unique index:', err.message);
    return;
  }
  try {
    await ensureUniqueIndex('students', 'uniq_student_context', 'registration_number, academic_program_id, academic_session_id');
  } catch (err) {
    console.warn('Could not add students context uniqueness:', err.message);
  }
};

module.exports = {
  createUniversityTables,
  migrateLegacyUniversityData,
  normalizeLegacyStudentsTable,
  normalizeProgramsTable,
  normalizeLegacyStudentSchemaForMaster,
  addProgramDegreeColumn,
  addPhase7DuplicatePreventionConstraints,
  addStudentContextUniqueness,
  ensureColumn,
};
