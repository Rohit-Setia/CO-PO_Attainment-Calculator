require('dotenv').config();
const pool = require('./config/db');

async function main() {
  console.log('=== DATA PRESERVATION TEST ===\n');

  // Always create our own throwaway, timestamped test course — never reuse or touch
  // whatever course happens to be first in the table. Reusing an arbitrary existing
  // course meant the DELETE FROM student_marks calls below (lines that used to run
  // both before and after the test) could wipe out real production marks data.
  const stamp = Date.now();
  console.log(`Creating throwaway test course (stamp=${stamp})...`);
  const [result] = await pool.query(
    `INSERT INTO courses (teacher_id, course_code, subject_name, school, department, semester, academic_year, num_cos)
     VALUES (1, ?, ?, 'Test School', 'Test Dept', 1, '2025-2026', 3)`,
    [`TEST-${stamp}`, `Data Preservation Test Course ${stamp}`]
  );
  const courseId = result.insertId;
  // Seed default COs
  for (let i = 1; i <= 3; i++) {
    await pool.query(
      `INSERT INTO course_outcomes (course_id, co_number, description, max_internal, max_external)
       VALUES (?, ?, ?, ?, ?)`,
      [courseId, i, `CO${i}`, 10, 20]
    );
  }
  // Seed default config
  const { saveConfig } = require('./models/mappingModel');
  await saveConfig(courseId, {
    threshold_percent_internal: 40, threshold_percent_external: 40,
    level1_criteria_internal: 50, level2_criteria_internal: 60, level3_criteria_internal: 70,
    level1_criteria_external: 50, level2_criteria_external: 60, level3_criteria_external: 70,
    total_max_internal: 30, total_max_external: 60,
    internal_weight: 30, external_weight: 70,
  });
  const [configRow] = await pool.query('SELECT * FROM course_configs WHERE course_id = ?', [courseId]);
  console.log(`Created course ${courseId} with config:`, configRow ? 'OK' : 'FAIL');

  // Get outcomes for this course
  const [outcomes] = await pool.query(
    'SELECT * FROM course_outcomes WHERE course_id = ? AND is_active = 1 ORDER BY co_number',
    [courseId]
  );
  console.log(`Course has ${outcomes.length} COs:`, outcomes.map(o => `CO${o.co_number} (max_int=${o.max_internal}, max_ext=${o.max_external})`).join(', '));

  let pass = false;
  let matchPass = false;
  try {
  // 3. Insert 5 students with marks
  const testStudents = [
    { regNo: 'REG001', name: 'Student A', marks: [8, 7, 6] },
    { regNo: 'REG002', name: 'Student B', marks: [7, 6, 5] },
    { regNo: 'REG003', name: 'Student C', marks: [9, 8, 7] },
    { regNo: 'REG004', name: 'Student D', marks: [6, 5, 4] },
    { regNo: 'REG005', name: 'Student E', marks: [5, 4, 3] },
  ];

  const { saveStudentMark, saveStudentCoMarks } = require('./models/marksModel');

  for (const s of testStudents) {
    const smId = await saveStudentMark({
      courseId,
      name: s.name,
      regNo: s.regNo,
      examType: 'MTT',
      totalMarks: s.marks.reduce((a, b) => a + b, 0),
      questionMarks: null,
    });
    await saveStudentCoMarks(smId, outcomes.map((co, i) => ({
      co_id: co.id,
      marks: s.marks[i] || 0,
    })));
  }
  console.log('\n✓ Inserted 5 test students with MTT marks');

  // Verify initial state
  const [initialMarks] = await pool.query(
    'SELECT reg_no, total_marks, id FROM student_marks WHERE course_id = ? AND exam_type = ? ORDER BY reg_no',
    [courseId, 'MTT']
  );
  console.log('\nInitial marks:');
  for (const row of initialMarks) {
    const [cos] = await pool.query(
      'SELECT co_id, marks FROM student_co_marks WHERE student_mark_id = ? ORDER BY co_id',
      [row.id]
    );
    const coStr = cos.map(c => `CO${c.co_id}=${c.marks}`).join(', ');
    console.log(`  ${row.reg_no}: total=${row.total_marks}, ${coStr}`);
  }

  // 4. CRITICAL TEST: Save only Student B (REG002) with modified marks
  console.log('\n--- CRITICAL TEST: Save only Student B with modified marks ---');
  const studentB = { name: 'Student B', roll: 'REG002', coMarks: {} };
  studentB.coMarks[outcomes[0].id] = 10; // Change CO1 from 7 to 10
  studentB.coMarks[outcomes[1].id] = '';  // Blank — should preserve existing value
  studentB.coMarks[outcomes[2].id] = '';  // Blank — should preserve existing value

  // Use the exact same save logic as the new route handler
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const regNo = 'REG002';
    const isBlank = (v) => v === '' || v === null || v === undefined;

    const provided = [];
    for (const [coIdStr, mark] of Object.entries(studentB.coMarks || {})) {
      if (isBlank(mark)) continue;
      const co = outcomes.find(o => String(o.id) === String(coIdStr));
      if (!co) continue;
      provided.push({ co, marks: Number(mark) });
    }

    const studentMarkId = await saveStudentMark({
      courseId,
      name: studentB.name || '',
      regNo,
      examType: 'MTT',
      totalMarks: 0,
      questionMarks: null,
    }, connection);

    if (provided.length > 0) {
      await saveStudentCoMarks(
        studentMarkId,
        provided.map(p => ({ co_id: p.co.id, marks: p.marks })),
        connection,
      );
    }

    // Merge existing CO marks with the newly provided ones
    const { getCoMarksForStudentMark } = require('./models/marksModel');
    const mergedCoMarks = await getCoMarksForStudentMark(studentMarkId, connection);
    provided.forEach(p => { mergedCoMarks[p.co.id] = p.marks; });
    const coMarksToSave = outcomes.map(o => ({ co_id: o.id, marks: mergedCoMarks[o.id] ?? 0 }));
    const totalMarks = coMarksToSave.reduce((sum, c) => sum + Number(c.marks || 0), 0);

    const legacyCoValues = {};
    coMarksToSave.forEach(c => {
      if (c.co_id <= 6) legacyCoValues[`co${c.co_id}`] = c.marks;
    });

    await saveStudentMark({
      courseId,
      name: studentB.name || '',
      regNo,
      examType: 'MTT',
      ...legacyCoValues,
      totalMarks,
      questionMarks: null,
    }, connection);

    await connection.commit();
    console.log('✓ Saved Student B (REG002) with CO1=10, others blank (preserved)');
  } catch (err) {
    await connection.rollback();
    console.error('SAVE FAILED:', err);
    throw err;
  } finally {
    connection.release();
  }

  // 5. Verify all 5 students still exist
  const [afterMarks] = await pool.query(
    'SELECT reg_no, name, total_marks, id FROM student_marks WHERE course_id = ? AND exam_type = ? ORDER BY reg_no',
    [courseId, 'MTT']
  );
  console.log('\n--- VERIFICATION ---');
  console.log(`Students in DB: ${afterMarks.length} (expected: 5)`);
  pass = afterMarks.length === 5;
  console.log(`${pass ? '✓ PASS' : '✗ FAIL'}: All 5 students preserved`);

  for (const row of afterMarks) {
    const [cos] = await pool.query(
      'SELECT scm.co_id, scm.marks, co.co_number FROM student_co_marks scm JOIN course_outcomes co ON co.id = scm.co_id WHERE scm.student_mark_id = ? ORDER BY co.co_number',
      [row.id]
    );
    const coStr = cos.map(c => `CO${c.co_number}=${c.marks}`).join(', ');
    const expected = row.reg_no === 'REG002' ? 'CO1=10 (changed), CO2=6 (preserved), CO3=5 (preserved)' : '(unchanged)';
    console.log(`  ${row.reg_no}: ${row.name} total=${row.total_marks} [${coStr}] ← ${expected}`);
  }

  // 6. Verify Student B's CO1 changed from 7 to 10
  const [bMarks] = await pool.query(
    'SELECT sm.id FROM student_marks sm WHERE sm.course_id = ? AND sm.reg_no = ? AND sm.exam_type = ?',
    [courseId, 'REG002', 'MTT']
  );
  const [bCo] = await pool.query(
    'SELECT scm.marks, co.co_number FROM student_co_marks scm JOIN course_outcomes co ON co.id = scm.co_id WHERE scm.student_mark_id = ? AND co.co_number = 1',
    [bMarks[0].id]
  );
  const bCo1 = bCo.length > 0 ? parseFloat(bCo[0].marks) : null;
  matchPass = bCo1 === 10;
  console.log(`${matchPass ? '✓ PASS' : '✗ FAIL'}: Student B CO1 = ${bCo1} (expected: 10)`);
  } finally {
    // Cleanup: this course/outcomes/config/marks were created fresh by this run above,
    // so it is always safe to delete all of it here — runs even if an assertion above
    // threw, so a failed run never leaks a throwaway course into the shared database.
    try { await pool.query('DELETE FROM student_marks WHERE course_id = ?', [courseId]); } catch { /* ignore */ }
    try { await pool.query('DELETE FROM question_configs WHERE course_id = ?', [courseId]); } catch { /* no question configs */ }
    try { await pool.query('DELETE FROM co_po_values WHERE co_id IN (SELECT id FROM course_outcomes WHERE course_id = ?)', [courseId]); } catch { /* no co-po values */ }
    try { await pool.query('DELETE FROM course_outcomes WHERE course_id = ?', [courseId]); } catch { /* FK-protected — leave seeded COs */ }
    try { await pool.query('DELETE FROM course_configs WHERE course_id = ?', [courseId]); } catch { /* no config */ }
    try { await pool.query('DELETE FROM courses WHERE id = ?', [courseId]); } catch { /* leave course */ }
    console.log('\n✓ Test data cleaned up');
  }

  console.log(`\n=== OVERALL: ${pass && matchPass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'} ===`);
  process.exit(pass && matchPass ? 0 : 1);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});