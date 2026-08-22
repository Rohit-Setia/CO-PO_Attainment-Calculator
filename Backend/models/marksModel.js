const pool = require('../config/db');
const { getActiveOutcomes } = require('./courseOutcomeModel');

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

  const [result] = await pool.query(query, [
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

  // Reliable because every current caller deletes-then-reinserts (marks save) or inserts into a
  // brand-new course (JSON import) — this is always a genuine INSERT, never the UPDATE branch.
  if (result.insertId) return result.insertId;
  const [rows] = await pool.query(
    'SELECT id FROM student_marks WHERE course_id = ? AND reg_no = ? AND exam_type = ?',
    [courseId, regNo, examType],
  );
  return rows[0]?.id;
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
      FOREIGN KEY (co_id) REFERENCES course_outcomes(id),
      UNIQUE KEY unique_mark_co (student_mark_id, co_id)
    ) ENGINE=InnoDB;
  `);
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
const saveStudentCoMarks = async (studentMarkId, coMarksArray) => {
  for (const { co_id, marks } of coMarksArray) {
    await pool.query(
      `INSERT INTO student_co_marks (student_mark_id, co_id, marks) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE marks = VALUES(marks)`,
      [studentMarkId, co_id, marks || 0],
    );
  }
};

// questionMarksArray: [{ question_config_id, marks }]
const saveStudentQuestionMarks = async (studentMarkId, questionMarksArray) => {
  for (const { question_config_id, marks } of questionMarksArray) {
    await pool.query(
      `INSERT INTO student_question_marks (student_mark_id, question_config_id, marks) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE marks = VALUES(marks)`,
      [studentMarkId, question_config_id, marks || 0],
    );
  }
};

module.exports = {
  createMarksTable,
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
};
