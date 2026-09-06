const pool = require('../config/db');
const { getActiveOutcomes } = require('./courseOutcomeModel');

const createMarksTable = async () => {
  // 1. Drop conflicting legacy table if it has the Phase-2-era schema. The discriminator is
  // `assessment_id` ONLY — the current normalized table carries a `student_id` column
  // (Phase 10/11, marks reference the Student Master) but NEVER `assessment_id`, so checking
  // both would wrongly flag the live table as legacy and attempt a destructive drop on every
  // startup. The drop is also FK-guarded (student_co_marks references student_marks), so a
  // mis-triggered drop fails safely — but it must not be attempted at all.
  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM student_marks');
    const hasLegacyColumns = cols.some(col => col.Field === 'assessment_id');
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
      student_id INT DEFAULT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      UNIQUE KEY unique_student_exam (course_id, reg_no, exam_type)
    ) ENGINE=InnoDB;
  `);
};

// Phase 10 — additive migration: a student_id FK column on the existing student_marks table
// so marks reference the actual Student Master record (stable ID, not just reg_no text).
// Backfill existing rows by matching reg_no to students in the course's academic context.
// Idempotent — only runs if the column is missing.
const addStudentIdToMarks = async () => {
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM student_marks LIKE 'student_id'");
    if (cols.length === 0) {
      await pool.query('ALTER TABLE student_marks ADD COLUMN student_id INT DEFAULT NULL AFTER question_marks');
    }
    // Backfill pass 1: match reg_no ↔ students.registration_number within the same course's
    // program/session context (context-linked students — unambiguous).
    const [ctxResult] = await pool.query(
      `UPDATE student_marks sm
       JOIN courses c ON c.id = sm.course_id
       JOIN students st ON st.registration_number = sm.reg_no
        AND st.academic_program_id = c.program_id
        AND st.academic_session_id = c.academic_session_id
       SET sm.student_id = st.id
       WHERE sm.student_id IS NULL`,
    );
    // Backfill pass 2: remaining rows matched by reg_no alone, but ONLY to legacy student
    // records that are not context-linked (NULL program/session). With the old global UNIQUE
    // on registration_number such a match is unambiguous; context-linked students were
    // already handled in pass 1.
    const [legacyResult] = await pool.query(
      `UPDATE student_marks sm
       JOIN students st ON st.registration_number = sm.reg_no
        AND st.academic_program_id IS NULL
        AND st.academic_session_id IS NULL
       SET sm.student_id = st.id
       WHERE sm.student_id IS NULL`,
    );
    const total = Number(ctxResult.affectedRows) + Number(legacyResult.affectedRows);
    if (total > 0) console.log(`Backfilled ${total} student_marks rows with student_id`);
  } catch (err) {
    console.warn('Could not add student_id column to student_marks:', err.message);
  }
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

const saveStudentMark = async ({ courseId, name, regNo, examType, co1, co2, co3, co4, co5, co6, totalMarks, questionMarks, studentId }, conn) => {
  const db = conn || pool;
  const query = `
    INSERT INTO student_marks 
      (course_id, name, reg_no, exam_type, co1, co2, co3, co4, co5, co6, total_marks, question_marks, student_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      co1 = VALUES(co1),
      co2 = VALUES(co2),
      co3 = VALUES(co3),
      co4 = VALUES(co4),
      co5 = VALUES(co5),
      co6 = VALUES(co6),
      total_marks = VALUES(total_marks),
      question_marks = VALUES(question_marks),
      student_id = VALUES(student_id)
  `;

  const [result] = await db.query(query, [
    courseId,
    name,
    regNo,
    examType,
    co1 ?? 0,
    co2 ?? 0,
    co3 ?? 0,
    co4 ?? 0,
    co5 ?? 0,
    co6 ?? 0,
    totalMarks ?? 0,
    questionMarks ?? null,
    studentId ?? null,
  ]);

  // True INSERT on first write; otherwise the ON DUPLICATE KEY UPDATE branch ran, so fetch the
  // id of the existing row keyed by (course_id, reg_no, exam_type). Never deletes-then-inserts.
  if (result.insertId) return result.insertId;
  const [rows] = await db.query(
    'SELECT id FROM student_marks WHERE course_id = ? AND reg_no = ? AND exam_type = ?',
    [courseId, regNo, examType],
  );
  return rows[0]?.id;
};

// Looks up an existing marks row for a course+reg_no+exam_type without creating anything.
const getStudentMarkRow = async (courseId, regNo, examType, conn) => {
  const db = conn || pool;
  const [rows] = await db.query(
    'SELECT * FROM student_marks WHERE course_id = ? AND reg_no = ? AND exam_type = ? LIMIT 1',
    [courseId, regNo, examType],
  );
  return rows[0] || null;
};

// Fetch one student row's CO marks: { [co_id]: marks }
const getCoMarksForStudentMark = async (studentMarkId, conn) => {
  const db = conn || pool;
  const [rows] = await db.query(
    'SELECT co_id, marks FROM student_co_marks WHERE student_mark_id = ?',
    [studentMarkId],
  );
  const byCo = {};
  rows.forEach((r) => { byCo[r.co_id] = parseFloat(r.marks); });
  return byCo;
};

// Fetch one student row's question marks: { [question_config_id]: marks }
const getQuestionMarksForStudentMark = async (studentMarkId, conn) => {
  const db = conn || pool;
  const [rows] = await db.query(
    'SELECT question_config_id, marks FROM student_question_marks WHERE student_mark_id = ?',
    [studentMarkId],
  );
  const byQuestion = {};
  rows.forEach((r) => { byQuestion[r.question_config_id] = parseFloat(r.marks); });
  return byQuestion;
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
// NOTE: deleteMarksByCourse is intentionally NOT wired into the marks save flow anymore —
// saving student marks now UPSERTs (see courseRoutes.js POST /courses/:id/marks) so that
// submitting one student's marks never deletes other students' rows. The helper remains
// exported for explicit administrative cleanups only.

// ── Normalized per-student CO / question marks (dynamic CO & question count) ────────────────
// student_marks.co1..co6 and .question_marks (JSON) are the legacy fixed-width/blob storage.
// These tables replace them as the source of truth going forward, without touching the old
// columns — they stay in place, unused, so nothing already stored is at risk.

const createStudentCoMarksTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_co_marks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_mark_id INT NOT NULL,
      co_id INT NOT NULL,
      marks DECIMAL(6,2) NOT NULL DEFAULT 0,
      FOREIGN KEY (student_mark_id) REFERENCES student_marks(id) ON DELETE CASCADE,
      FOREIGN KEY (co_id) REFERENCES course_outcomes(id) ON DELETE CASCADE,
      UNIQUE KEY unique_mark_co (student_mark_id, co_id)
    ) ENGINE=InnoDB;
  `);

  try {
    const [fks] = await pool.query(`
      SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'student_co_marks'
        AND REFERENCED_TABLE_NAME = 'course_outcomes' AND DELETE_RULE != 'CASCADE'
    `);
    for (const fk of fks) {
      await pool.query(`ALTER TABLE student_co_marks DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
      await pool.query('ALTER TABLE student_co_marks ADD FOREIGN KEY (co_id) REFERENCES course_outcomes(id) ON DELETE CASCADE');
    }
  } catch (err) {
    // Ignore if not present
  }
};

const createStudentQuestionMarksTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_question_marks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_mark_id INT NOT NULL,
      question_config_id INT NOT NULL,
      marks DECIMAL(6,2) NOT NULL DEFAULT 0,
      FOREIGN KEY (student_mark_id) REFERENCES student_marks(id) ON DELETE CASCADE,
      FOREIGN KEY (question_config_id) REFERENCES question_configs(id) ON DELETE CASCADE,
      UNIQUE KEY unique_mark_question (student_mark_id, question_config_id)
    ) ENGINE=InnoDB;
  `);
};

// One-time, idempotent: migrates each student_marks row's legacy co1..co6 columns into
// student_co_marks, and its question_marks JSON blob into student_question_marks (matched to
// question_configs by question_number — legacy question `id`s were always assigned sequentially
// 1..N by the frontend, so `id` and `question_number` are the same value by construction).
const migrateLegacyStudentMarks = async () => {
  const [courses] = await pool.query('SELECT id FROM courses');

  for (const course of courses) {
    const outcomes = await getActiveOutcomes(course.id);
    if (outcomes.length === 0) continue;
    const outcomeByNumber = new Map(outcomes.map((o) => [o.co_number, o.id]));

    const [questionConfigs] = await pool.query(
      'SELECT id, exam_type, question_number FROM question_configs WHERE course_id = ?',
      [course.id],
    );
    const qcByExamAndNumber = new Map(questionConfigs.map((q) => [`${q.exam_type}:${q.question_number}`, q.id]));

    const [marks] = await pool.query('SELECT * FROM student_marks WHERE course_id = ?', [course.id]);

    for (const mark of marks) {
      const [existingCo] = await pool.query(
        'SELECT COUNT(*) as count FROM student_co_marks WHERE student_mark_id = ?',
        [mark.id],
      );
      if (existingCo[0].count === 0) {
        for (const [coNumber, coId] of outcomeByNumber.entries()) {
          const value = mark[`co${coNumber}`];
          if (value === undefined || value === null) continue;
          await pool.query(
            'INSERT IGNORE INTO student_co_marks (student_mark_id, co_id, marks) VALUES (?, ?, ?)',
            [mark.id, coId, value],
          );
        }
      }

      const [existingQ] = await pool.query(
        'SELECT COUNT(*) as count FROM student_question_marks WHERE student_mark_id = ?',
        [mark.id],
      );
      if (existingQ[0].count === 0 && mark.question_marks) {
        let parsed;
        try {
          parsed = JSON.parse(mark.question_marks);
        } catch {
          parsed = null;
        }
        if (parsed && typeof parsed === 'object') {
          for (const [qId, qMark] of Object.entries(parsed)) {
            const qcId = qcByExamAndNumber.get(`${mark.exam_type}:${qId}`);
            if (!qcId) continue;
            await pool.query(
              'INSERT IGNORE INTO student_question_marks (student_mark_id, question_config_id, marks) VALUES (?, ?, ?)',
              [mark.id, qcId, qMark],
            );
          }
        }
      }
    }
  }
};

// Batch-fetch CO marks for every student row in one course+examType — { [student_mark_id]: { [co_id]: marks } }
const getCoMarksForCourse = async (courseId, examType) => {
  const [rows] = await pool.query(
    `SELECT scm.student_mark_id, scm.co_id, scm.marks
     FROM student_co_marks scm
     JOIN student_marks sm ON sm.id = scm.student_mark_id
     WHERE sm.course_id = ? AND sm.exam_type = ?`,
    [courseId, examType],
  );
  const byStudent = new Map();
  rows.forEach((r) => {
    if (!byStudent.has(r.student_mark_id)) byStudent.set(r.student_mark_id, {});
    byStudent.get(r.student_mark_id)[r.co_id] = parseFloat(r.marks);
  });
  return byStudent;
};

// Batch-fetch question marks for every student row in one course+examType —
// { [student_mark_id]: { [question_config_id]: marks } }
const getQuestionMarksForCourse = async (courseId, examType) => {
  const [rows] = await pool.query(
    `SELECT sqm.student_mark_id, sqm.question_config_id, sqm.marks
     FROM student_question_marks sqm
     JOIN student_marks sm ON sm.id = sqm.student_mark_id
     WHERE sm.course_id = ? AND sm.exam_type = ?`,
    [courseId, examType],
  );
  const byStudent = new Map();
  rows.forEach((r) => {
    if (!byStudent.has(r.student_mark_id)) byStudent.set(r.student_mark_id, {});
    byStudent.get(r.student_mark_id)[r.question_config_id] = parseFloat(r.marks);
  });
  return byStudent;
};

// coMarksArray: [{ co_id, marks }]
const saveStudentCoMarks = async (studentMarkId, coMarksArray, conn) => {
  const db = conn || pool;
  for (const { co_id, marks } of coMarksArray) {
    await db.query(
      `INSERT INTO student_co_marks (student_mark_id, co_id, marks) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE marks = VALUES(marks)`,
      [studentMarkId, co_id, marks ?? 0],
    );
  }
};

// questionMarksArray: [{ question_config_id, marks }]
const saveStudentQuestionMarks = async (studentMarkId, questionMarksArray, conn) => {
  const db = conn || pool;
  for (const { question_config_id, marks } of questionMarksArray) {
    await db.query(
      `INSERT INTO student_question_marks (student_mark_id, question_config_id, marks) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE marks = VALUES(marks)`,
      [studentMarkId, question_config_id, marks ?? 0],
    );
  }
};

module.exports = {
  createMarksTable,
  addStudentIdToMarks,
  getMarksByCourse,
  saveStudentMark,
  deleteMarksByCourse,
  createStudentCoMarksTable,
  createStudentQuestionMarksTable,
  migrateLegacyStudentMarks,
  getCoMarksForCourse,
  getQuestionMarksForCourse,
  saveStudentCoMarks,
  saveStudentQuestionMarks,
  getStudentMarkRow,
  getCoMarksForStudentMark,
  getQuestionMarksForStudentMark,
};
