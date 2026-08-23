// Phase 10 — Student Academic Hierarchy acceptance tests (Tests A–G).
// Usage: node migration-snapshots/phase10-student-hierarchy-test.js
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

  // ── Baseline counts for regression (Test G) ──
  const [baseline] = await db.query(`SELECT
    (SELECT COUNT(*) FROM students) AS students,
    (SELECT COUNT(*) FROM course_enrollments) AS enrollments,
    (SELECT COUNT(*) FROM student_marks) AS marks,
    (SELECT COUNT(*) FROM student_co_marks) AS co_marks,
    (SELECT COUNT(*) FROM courses) AS courses,
    (SELECT COUNT(*) FROM class_students) AS class_students`);

  // ── Clean previous test runs ──
  await db.query("DELETE FROM students WHERE registration_number LIKE 'P10%'");
  await db.query("DELETE FROM courses WHERE course_code LIKE 'P10-%'");
  await db.query("DELETE FROM programs WHERE code LIKE 'P10-%'");
  await db.query("DELETE FROM academic_sessions WHERE name LIKE 'P10-%'");
  await db.query("DELETE FROM course_enrollments WHERE course_id NOT IN (SELECT id FROM courses)");
  await db.query("DELETE FROM student_marks WHERE course_id NOT IN (SELECT id FROM courses)");

  // ── Setup: real departments from the Admin-configured hierarchy ──
  // dept 12 = Business Administration (school 7 Management Studies)
  // dept 1 = Computer Science & Engineering (school 1 Engineering)
  const [deptBba] = await db.query("SELECT id FROM departments WHERE id = 12");
  const [deptCse] = await db.query("SELECT id FROM departments WHERE id = 1");
  if (!deptBba.length || !deptCse.length) { console.error('Expected real departments 12/1 missing'); process.exit(1); }

  // Test programs: BBA (3yr → 6 sem) and B.Tech CSE (4yr → 8 sem) — same duration rules as real data
  const [pBba] = await db.query("INSERT INTO programs (department_id, name, code, degree, duration, status) VALUES (?, 'PHASE10-BBA', 'P10-BBA', 'BBA', 3, 'Active')", [12]);
  const [pCse] = await db.query("INSERT INTO programs (department_id, name, code, degree, duration, status) VALUES (?, 'PHASE10-BTECH', 'P10-BTECH', 'B.Tech', 4, 'Active')", [1]);
  const [s1] = await db.query("INSERT INTO academic_sessions (name, start_year, end_year) VALUES ('P10-2026-2027', 2026, 2027)");
  const sessionId = s1.insertId;

  // ── 3 BBA Semester-1 courses + 1 CSE Semester-1 course ──
  const mkCourse = (pid, code, name) => req('POST', '/courses', token, { programId: pid, sessionId, subjectName: name, courseCode: code, semester: 1, numCos: 5 });
  const c1 = await mkCourse(pBba.insertId, 'P10-MGT101', 'P10 Principles of Management');
  const c2 = await mkCourse(pBba.insertId, 'P10-MGT102', 'P10 Business Economics');
  const c3 = await mkCourse(pBba.insertId, 'P10-MGT103', 'P10 Business Communication');
  const c4 = await mkCourse(pCse.insertId, 'P10-CS101', 'P10 Programming Fundamentals');
  check('3 BBA courses + 1 CSE course created', c1.status === 201 && c2.status === 201 && c3.status === 201 && c4.status === 201,
    `${c1.status} ${c2.status} ${c3.status} ${c4.status}`);
  const bbaCourseIds = [JSON.parse(c1.body).data.id, JSON.parse(c2.body).data.id, JSON.parse(c3.body).data.id];
  const cseCourseId = JSON.parse(c4.body).data.id;

  // ── Test A/D: upload students ONCE on the first BBA course ──
  const uploadBba = await req('POST', `/courses/${bbaCourseIds[0]}/students/upload`, token, {
    students: [
      { rowNumber: 2, enrollmentNo: 'P10-BBA001', rollNo: '101', name: 'Sam Kumar', email: 'sam@test.local', phone: '111' },
      { rowNumber: 3, enrollmentNo: 'P10-BBA002', rollNo: '102', name: 'Rahul Sharma', email: 'rahul@test.local', phone: '222' },
      { rowNumber: 4, enrollmentNo: 'P10-BBA003', rollNo: '103', name: 'Aman Kumar', email: 'aman@test.local', phone: '333' },
    ],
  });
  check('Upload 3 BBA students once → 200 (3 created)', uploadBba.status === 200 && JSON.parse(uploadBba.body).data.created === 3,
    `${uploadBba.status} ${uploadBba.body.slice(0, 160)}`);

  // ── Test D: same students appear in ALL 3 BBA courses ──
  for (const cid of bbaCourseIds) {
    const r = await req('GET', `/courses/${cid}/students`, token);
    const names = JSON.parse(r.body).data.map((s) => s.name);
    check(`Course ${cid} has all 3 BBA students`, names.length === 3 && names.includes('Sam Kumar') && names.includes('Rahul Sharma') && names.includes('Aman Kumar'),
      JSON.stringify(names));
  }

  // ── Test A: BBA students do NOT appear in the CSE course (cross-program isolation) ──
  const cseStudents = await req('GET', `/courses/${cseCourseId}/students`, token);
  check('CSE course has NO BBA students', JSON.parse(cseStudents.body).data.length === 0,
    `count=${JSON.parse(cseStudents.body).data.length}`);

  // ── Test F: cross-program security — BBA students not accessible through CSE course ──
  const cseMarksImport = await req('POST', `/courses/${cseCourseId}/marks/import-preview`, token, {
    examType: 'MTT',
    rows: [{ rowNumber: 2, regNo: 'P10-BBA001', name: 'Sam Kumar', coMarks: {} }],
  });
  check('BBA student rejected from CSE course marks import', cseMarksImport.status === 200 && JSON.parse(cseMarksImport.body).data.errorCount === 1,
    `${cseMarksImport.status} ${cseMarksImport.body.slice(0, 160)}`);

  // ── Test B: upload CSE students on the CSE course ──
  const uploadCse = await req('POST', `/courses/${cseCourseId}/students/upload`, token, {
    students: [
      { rowNumber: 2, enrollmentNo: 'P10-CSE001', rollNo: '201', name: 'Priya Singh', email: 'priya@test.local', phone: '444' },
      { rowNumber: 3, enrollmentNo: 'P10-CSE002', rollNo: '202', name: 'Rohan Gupta', email: 'rohan@test.local', phone: '555' },
    ],
  });
  check('Upload 2 CSE students → 200 (2 created)', uploadCse.status === 200 && JSON.parse(uploadCse.body).data.created === 2,
    `${uploadCse.status} ${uploadCse.body.slice(0, 160)}`);
  const cseAfter = await req('GET', `/courses/${cseCourseId}/students`, token);
  check('CSE course has only CSE students', JSON.parse(cseAfter.body).data.length === 2 &&
    JSON.parse(cseAfter.body).data.every((s) => s.registration_number.startsWith('P10-CSE')),
    JSON.stringify(JSON.parse(cseAfter.body).data.map((s) => s.registration_number)));
  const bbaAfter = await req('GET', `/courses/${bbaCourseIds[0]}/students`, token);
  check('BBA course unchanged (no CSE students leaked)', JSON.parse(bbaAfter.body).data.length === 3 &&
    JSON.parse(bbaAfter.body).data.every((s) => s.registration_number.startsWith('P10-BBA')),
    JSON.stringify(JSON.parse(bbaAfter.body).data.map((s) => s.registration_number)));

  // ── Test C: same student NAME in BBA and CSE — distinguished by context ──
  const uploadSameName = await req('POST', `/courses/${cseCourseId}/students/upload`, token, {
    students: [{ rowNumber: 2, enrollmentNo: 'P10-CSE003', rollNo: '203', name: 'Sam Kumar', email: 'sam.cse@test.local', phone: '666' }],
  });
  check('CSE "Sam Kumar" (different enrollment) created', uploadSameName.status === 200 && JSON.parse(uploadSameName.body).data.created === 1,
    `${uploadSameName.status} ${uploadSameName.body.slice(0, 160)}`);
  const bbaList = await req('GET', '/students?search=Sam%20Kumar&programId=' + pBba.insertId, token);
  const cseList = await req('GET', '/students?search=Sam%20Kumar&programId=' + pCse.insertId, token);
  const bbaSam = JSON.parse(bbaList.body).data.filter((s) => s.name === 'Sam Kumar');
  const cseSam = JSON.parse(cseList.body).data.filter((s) => s.name === 'Sam Kumar');
  check('Two distinct "Sam Kumar" records (BBA vs CSE)', bbaSam.length === 1 && cseSam.length === 1 && bbaSam[0].id !== cseSam[0].id,
    `bba=${bbaSam.map(s => s.registration_number).join()} cse=${cseSam.map(s => s.registration_number).join()}`);

  // ── Test E: invalid semester rejected (BBA 3yr → Sem 7) ──
  const badSem = await req('POST', '/students', token, {
    registrationNumber: 'P10-BBA999', name: 'Invalid Sem', programId: pBba.insertId, sessionId, semester: 7,
  });
  check('BBA Sem 7 student rejected → 400', badSem.status === 400 && /Sem 1 to Sem 6/i.test(badSem.body), `${badSem.status} ${badSem.body.slice(0, 160)}`);
  const badSem2 = await req('POST', `/courses/${bbaCourseIds[0]}/students/upload`, token, {
    students: [{ rowNumber: 2, enrollmentNo: 'P10-BBA888', name: 'Bad Sem Upload', semester: 7 }],
  });
  check('Upload endpoint rejects out-of-context semester', badSem2.status === 200, `${badSem2.status}`);

  // ── Auto-sync: enrollment table now contains context students ──
  const enr = await req('GET', `/courses/${bbaCourseIds[1]}/enrollment`, token);
  check('BBA course enrollment auto-synced from context', JSON.parse(enr.body).data.students.length >= 3,
    `count=${JSON.parse(enr.body).data.students.length}`);

  // ── Marks flow works with context students (preview) ──
  const outRes = await req('GET', `/courses/${bbaCourseIds[0]}/outcomes`, token);
  const firstCo = JSON.parse(outRes.body).data.find((o) => o.co_number === 1);
  const pv = await req('POST', `/courses/${bbaCourseIds[0]}/marks/import-preview`, token, {
    examType: 'MTT',
    rows: [
      { rowNumber: 2, regNo: 'P10-BBA001', name: 'Sam Kumar', coMarks: { [firstCo.id]: 7 } },
      { rowNumber: 3, regNo: 'P10-BBA002', name: 'Rahul Sharma', coMarks: { [firstCo.id]: 8 } },
      { rowNumber: 4, regNo: 'P10-BBA003', name: 'Aman Kumar', coMarks: { [firstCo.id]: 9 } },
    ],
  });
  check('Marks preview accepts context students (3 valid)', pv.status === 200 && JSON.parse(pv.body).data.validCount === 3,
    `${pv.status} ${pv.body.slice(0, 160)}`);

  // ── Test G: existing data regression — counts unchanged by test data ──
  const [after] = await db.query(`SELECT
    (SELECT COUNT(*) FROM students WHERE registration_number NOT LIKE 'P10%') AS students,
    (SELECT COUNT(*) FROM student_marks) AS marks,
    (SELECT COUNT(*) FROM student_co_marks) AS co_marks,
    (SELECT COUNT(*) FROM courses WHERE course_code NOT LIKE 'P10-%') AS courses,
    (SELECT COUNT(*) FROM class_students) AS class_students`);
  check('Existing students intact', Number(after[0].students) === Number(baseline[0].students), `${after[0].students} vs ${baseline[0].students}`);
  check('Existing marks intact', Number(after[0].marks) === Number(baseline[0].marks), `${after[0].marks} vs ${baseline[0].marks}`);
  check('Existing CO marks intact', Number(after[0].co_marks) === Number(baseline[0].co_marks), `${after[0].co_marks} vs ${baseline[0].co_marks}`);
  check('Existing courses intact', Number(after[0].courses) === Number(baseline[0].courses), `${after[0].courses} vs ${baseline[0].courses}`);
  check('Class memberships intact', Number(after[0].class_students) === Number(baseline[0].class_students), `${after[0].class_students} vs ${baseline[0].class_students}`);

  // ── Attainment regression (existing courses unchanged) ──
  const att1 = await req('GET', '/courses/1/attainment', token);
  const att2 = await req('GET', '/courses/2/attainment', token);
  check('Course 1 attainment unchanged (2.22)', JSON.parse(att1.body).data.overallCourseAttainment === 2.22,
    `got ${JSON.parse(att1.body).data.overallCourseAttainment}`);
  check('Course 2 attainment unchanged (2.5)', JSON.parse(att2.body).data.overallCourseAttainment === 2.5,
    `got ${JSON.parse(att2.body).data.overallCourseAttainment}`);

  // ── Cleanup ──
  await db.query("DELETE FROM students WHERE registration_number LIKE 'P10%'");
  await db.query("DELETE FROM course_enrollments WHERE course_id IN (SELECT id FROM courses WHERE course_code LIKE 'P10-%')");
  await db.query("DELETE FROM courses WHERE course_code LIKE 'P10-%'");
  await db.query("DELETE FROM programs WHERE code LIKE 'P10-%'");
  await db.query("DELETE FROM academic_sessions WHERE name LIKE 'P10-%'");
  await db.query("DELETE FROM course_enrollments WHERE course_id NOT IN (SELECT id FROM courses)");
  await db.end();
  console.log('Cleanup complete.');

  console.log(`\n=== Phase 10 Student Hierarchy: Pass ${pass}, Fail ${fail} ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR:', e.message); process.exit(1); });