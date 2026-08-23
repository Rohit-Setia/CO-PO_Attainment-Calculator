// Phase 11 — Marks Entry auto-loads students from the academic context (no Excel needed).
// Usage: node migration-snapshots/phase11-marks-autoload-test.js
const http = require('http');
const mysql = require('mysql2/promise');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const PORT = process.env.PORT || 5000;

function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const urlPath = path.startsWith('/api') || path === '/health' ? path : `/api${path}`;
    const r = http.request(
      { host: 'localhost', port: PORT, path: urlPath, method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}) },
      (resp) => { let buf = ''; resp.on('data', (c) => { buf += c; }); resp.on('end', () => resolve({ status: resp.statusCode, body: buf })); },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

let pass = 0; let fail = 0;
function check(label, ok, detail) {
  if (ok) { pass += 1; console.log(`  PASS: ${label}`); }
  else { fail += 1; console.error(`  FAIL: ${label} — ${detail}`); }
}

(async () => {
  const token = jwt.sign({ id: 1, role: 'Admin' }, process.env.JWT_SECRET, { expiresIn: '30m' });
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });

  // Baseline for regression
  const [baseline] = await db.query(`SELECT
    (SELECT COUNT(*) FROM students) AS students,
    (SELECT COUNT(*) FROM course_enrollments) AS enrollments,
    (SELECT COUNT(*) FROM student_marks) AS marks,
    (SELECT COUNT(*) FROM student_co_marks) AS co_marks,
    (SELECT COUNT(*) FROM courses) AS courses`);

  // Clean previous runs
  await db.query("DELETE FROM students WHERE registration_number LIKE 'P11%'");
  await db.query("DELETE FROM courses WHERE course_code LIKE 'P11-%'");
  await db.query("DELETE FROM programs WHERE code LIKE 'P11-%'");
  await db.query("DELETE FROM academic_sessions WHERE name LIKE 'P11-%'");
  await db.query("DELETE FROM course_enrollments WHERE course_id NOT IN (SELECT id FROM courses)");
  await db.query("DELETE FROM student_marks WHERE course_id NOT IN (SELECT id FROM courses)");

  // ── Setup: BBA (3yr) program under real dept 12 + session + course ──
  const [pBba] = await db.query("INSERT INTO programs (department_id, name, code, degree, duration, status) VALUES (12, 'PHASE11-BBA', 'P11-BBA', 'BBA', 3, 'Active')");
  const [sess] = await db.query("INSERT INTO academic_sessions (name, start_year, end_year) VALUES ('P11-2026-2027', 2026, 2027)");
  const courseRes = await req('POST', '/courses', token, {
    programId: pBba.insertId, sessionId: sess.insertId,
    subjectName: 'P11 Management Principles', courseCode: 'P11-MGT101', semester: 1, numCos: 4,
  });
  check('BBA course created', courseRes.status === 201, `${courseRes.status}`);
  const courseId = JSON.parse(courseRes.body).data.id;

  // ── Upload 25 students (like the real BBA Semester 1) ──
  const studentsPayload = Array.from({ length: 25 }, (_, i) => ({
    rowNumber: i + 2,
    enrollmentNo: `P11-${String(72312229 + i)}`,
    rollNo: String(i + 1),
    name: `P11 Student ${i + 1}`,
    email: `p11.${i + 1}@test.local`,
    phone: `90000000${String(i + 1).padStart(2, '0')}`,
  }));
  const up = await req('POST', `/courses/${courseId}/students/upload`, token, { students: studentsPayload });
  check('25 students uploaded once', up.status === 200 && JSON.parse(up.body).data.created === 25, `${up.status} ${up.body.slice(0, 140)}`);

  // ── KEY TEST 1: GET /marks returns ALL 25 students with EMPTY marks (no Excel needed) ──
  const m1 = await req('GET', `/courses/${courseId}/marks`, token);
  const m1Data = JSON.parse(m1.body).data;
  check('Marks endpoint auto-loads all 25 students', m1Data.mtt.length === 25, `mtt=${m1Data.mtt.length}`);
  check('Students have empty coMarks initially', m1Data.mtt.every((s) => Object.keys(s.coMarks).length === 0 && !s.hasSavedMarks),
    `first=${JSON.stringify(m1Data.mtt[0]?.coMarks)}`);
  check('Roster students carry studentId from Student Master', m1Data.mtt.every((s) => s.studentId),
    `first studentId=${m1Data.mtt[0]?.studentId}`);

  // ── KEY TEST 2: Save marks online → student_id stored ──
  const outRes = await req('GET', `/courses/${courseId}/outcomes`, token);
  const outcomes = JSON.parse(outRes.body).data;
  const saveRows = m1Data.mtt.map((s, i) => ({
    name: s.name, roll: s.reg_no,
    coMarks: Object.fromEntries(outcomes.map((co, ci) => [co.id, ((i + ci) % 10) + 1])),
  }));
  const sv = await req('POST', `/courses/${courseId}/marks`, token, { examType: 'MTT', entryMode: 'co', students: saveRows });
  check('Save marks online → 200', sv.status === 200, `${sv.status} ${sv.body.slice(0, 120)}`);
  const [dbMarks] = await db.query('SELECT student_id, reg_no FROM student_marks WHERE course_id = ? AND exam_type = "MTT"', [courseId]);
  check('All saved marks have student_id FK', dbMarks.length === 25 && dbMarks.every((r) => r.student_id), `rows=${dbMarks.length} nulls=${dbMarks.filter(r => !r.student_id).length}`);

  // ── KEY TEST 3: Marks reload with existing values prefilled ──
  const m2 = await req('GET', `/courses/${courseId}/marks`, token);
  const m2Data = JSON.parse(m2.body).data;
  check('Reload keeps 25 students', m2Data.mtt.length === 25, `mtt=${m2Data.mtt.length}`);
  check('Existing marks prefilled (hasSavedMarks=true)', m2Data.mtt.filter((s) => s.hasSavedMarks).length === 25,
    `saved=${m2Data.mtt.filter((s) => s.hasSavedMarks).length}`);
  check('Prefilled CO marks match saved values',
    m2Data.mtt.every((s) => Object.keys(s.coMarks).length === outcomes.length),
    `first=${JSON.stringify(m2Data.mtt[0]?.coMarks)}`);

  // ── KEY TEST 4: Edit one mark + re-save → NO duplicates (upsert) ──
  const edited = saveRows.map((r, i) => (i === 0 ? { ...r, coMarks: { ...r.coMarks, [outcomes[0].id]: 9 } } : r));
  const sv2 = await req('POST', `/courses/${courseId}/marks`, token, { examType: 'MTT', entryMode: 'co', students: edited });
  check('Edit + re-save → 200', sv2.status === 200, `${sv2.status}`);
  const [countAfter] = await db.query('SELECT COUNT(*) AS c FROM student_marks WHERE course_id = ? AND exam_type = "MTT"', [courseId]);
  check('No duplicate marks rows after re-save', Number(countAfter[0].c) === 25, `count=${countAfter[0].c}`);
  const m3 = await req('GET', `/courses/${courseId}/marks`, token);
  const m3Data = JSON.parse(m3.body).data;
  check('Edited value persisted (CO1=9 for student 1)', parseFloat(m3Data.mtt[0].coMarks[outcomes[0].id]) === 9,
    `got ${m3Data.mtt[0].coMarks[outcomes[0].id]}`);

  // ── KEY TEST 5: Excel import still works (optional, updates existing) ──
  const firstCo = outcomes[0];
  const impRows = m3Data.mtt.slice(0, 5).map((s, i) => ({
    rowNumber: i + 2, regNo: s.reg_no, name: s.name, coMarks: { [firstCo.id]: 6 + i },
  }));
  const pv = await req('POST', `/courses/${courseId}/marks/import-preview`, token, { examType: 'MTT', rows: impRows });
  check('Excel import preview valid (5 matched)', pv.status === 200 && JSON.parse(pv.body).data.validCount === 5, `${pv.status} ${pv.body.slice(0, 120)}`);
  const cf = await req('POST', `/courses/${courseId}/marks/import`, token, { examType: 'MTT', rows: impRows, acknowledgeMissing: true });
  check('Excel import confirm → 200', cf.status === 200, `${cf.status} ${cf.body.slice(0, 120)}`);
  const m4 = await req('GET', `/courses/${courseId}/marks`, token);
  const m4Data = JSON.parse(m4.body).data;
  check('Excel-imported marks visible online', parseFloat(m4Data.mtt[0].coMarks[firstCo.id]) === 6, `got ${m4Data.mtt[0].coMarks[firstCo.id]}`);

  // ── KEY TEST 6: empty context → clear message data (no phantom students) ──
  // A CSE course with no students → marks roster empty
  const [pCse] = await db.query("INSERT INTO programs (department_id, name, code, degree, duration, status) VALUES (1, 'PHASE11-BTECH', 'P11-BTECH', 'B.Tech', 4, 'Active')");
  const cseRes = await req('POST', '/courses', token, {
    programId: pCse.insertId, sessionId: sess.insertId,
    subjectName: 'P11 Programming', courseCode: 'P11-CS101', semester: 1, numCos: 3,
  });
  const cseId = JSON.parse(cseRes.body).data.id;
  const mEmpty = await req('GET', `/courses/${cseId}/marks`, token);
  check('Course with no students → empty roster (not fake rows)', JSON.parse(mEmpty.body).data.mtt.length === 0, `mtt=${JSON.parse(mEmpty.body).data.mtt.length}`);

  // ── KEY TEST 7: cross-context isolation (BBA students not in CSE course) ──
  const cseImport = await req('POST', `/courses/${cseId}/marks/import-preview`, token, {
    examType: 'MTT',
    rows: [{ rowNumber: 2, regNo: m4Data.mtt[0].reg_no, name: m4Data.mtt[0].name, coMarks: { [firstCo.id]: 5 } }],
  });
  check('BBA student rejected from CSE course import', JSON.parse(cseImport.body).data.errorCount === 1, `${cseImport.body.slice(0, 120)}`);

  // ── Regression: existing data untouched ──
  const att1 = await req('GET', '/courses/1/attainment', token);
  const att2 = await req('GET', '/courses/2/attainment', token);
  check('Course 1 attainment unchanged (2.22)', JSON.parse(att1.body).data.overallCourseAttainment === 2.22, `got ${JSON.parse(att1.body).data.overallCourseAttainment}`);
  check('Course 2 attainment unchanged (2.5)', JSON.parse(att2.body).data.overallCourseAttainment === 2.5, `got ${JSON.parse(att2.body).data.overallCourseAttainment}`);
  const [after] = await db.query(`SELECT
    (SELECT COUNT(*) FROM students WHERE registration_number NOT LIKE 'P11%') AS students,
    (SELECT COUNT(*) FROM course_enrollments WHERE course_id NOT IN (SELECT id FROM courses WHERE course_code LIKE 'P11-%')) AS enrollments,
    (SELECT COUNT(*) FROM student_marks WHERE course_id NOT IN (SELECT id FROM courses WHERE course_code LIKE 'P11-%')) AS marks,
    (SELECT COUNT(*) FROM student_co_marks WHERE student_mark_id IN (SELECT id FROM student_marks WHERE course_id NOT IN (SELECT id FROM courses WHERE course_code LIKE 'P11-%'))) AS co_marks,
    (SELECT COUNT(*) FROM courses WHERE course_code NOT LIKE 'P11-%') AS courses`);
  check('Existing students intact', Number(after[0].students) === Number(baseline[0].students), `${after[0].students} vs ${baseline[0].students}`);
  check('Existing marks intact', Number(after[0].marks) === Number(baseline[0].marks), `${after[0].marks} vs ${baseline[0].marks}`);
  check('Existing CO marks intact', Number(after[0].co_marks) === Number(baseline[0].co_marks), `${after[0].co_marks} vs ${baseline[0].co_marks}`);

  // ── Cleanup ──
  await db.query("DELETE FROM students WHERE registration_number LIKE 'P11%'");
  await db.query("DELETE FROM course_enrollments WHERE course_id IN (SELECT id FROM courses WHERE course_code LIKE 'P11-%')");
  await db.query("DELETE FROM student_marks WHERE course_id IN (SELECT id FROM courses WHERE course_code LIKE 'P11-%')");
  await db.query("DELETE FROM courses WHERE course_code LIKE 'P11-%'");
  await db.query("DELETE FROM programs WHERE code LIKE 'P11-%'");
  await db.query("DELETE FROM academic_sessions WHERE name LIKE 'P11-%'");
  await db.end();
  console.log('Cleanup complete.');

  console.log(`\n=== Phase 11 Marks Auto-Load: Pass ${pass}, Fail ${fail} ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR:', e.message); process.exit(1); });