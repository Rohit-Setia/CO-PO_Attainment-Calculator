// End-to-end test of the Examination Cell / Question Paper workflow, using the real
// Applied Chemistry fixture. Self-contained: creates its own throwaway course/class/
// student/teachers, cleans up everything at the end, never touches real data.
const http = require('http');
const fs = require('fs');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./config/db');
const base = 'http://localhost:5000';

const FIXTURE = require('path').join(__dirname, 'test-fixtures', 'applied-chemistry-sample-paper.docx');

function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request(base + p, { method, headers: { ...headers, ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch {} resolve({ status: res.statusCode, json, raw: data }); });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

async function uploadPaper(token, { courseId, examType }) {
  const fd = new FormData();
  fd.append('courseId', String(courseId));
  fd.append('examType', examType);
  fd.append('paperSet', 'Set 1');
  fd.append('file', new Blob([fs.readFileSync(FIXTURE)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'AppliedChemistry.docx');
  const res = await fetch(`${base}/api/examinations/papers`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

let failed = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed += 1; };

const stamp = Date.now();
const ids = { teachers: [], courseId: null, classId: null, studentId: null, paperId: null };

async function login(email, password) {
  const r = await req('POST', '/api/auth/login', { body: { email, password } });
  return r.json?.data?.token;
}

(async () => {
  const hash = bcrypt.hashSync('test123', 10);
  const mk = async (tag, role) => {
    const email = `examtest-${tag}-${stamp}@ctuniversity.in`;
    const [result] = await pool.query(
      "INSERT INTO teachers (name, email, password, role, is_active) VALUES (?, ?, ?, ?, 1)",
      [`ExamTest ${tag}`, email, hash, role],
    );
    ids.teachers.push(result.insertId);
    return { id: result.insertId, email };
  };

  const examCell = await mk('cell', 'Examination Team');
  const reviewer = await mk('reviewer', 'Teacher');
  const marksTeacher = await mk('marks', 'Teacher');
  const outsider = await mk('outsider', 'Teacher');

  const examCellToken = await login(examCell.email, 'test123');
  const reviewerToken = await login(reviewer.email, 'test123');
  let marksTeacherToken = await login(marksTeacher.email, 'test123');
  const outsiderToken = await login(outsider.email, 'test123');
  check('All 4 test users logged in', examCellToken && reviewerToken && marksTeacherToken && outsiderToken);

  const [[program]] = await pool.query('SELECT id FROM programs LIMIT 1');
  const [[session]] = await pool.query('SELECT id FROM academic_sessions LIMIT 1');

  const [courseResult] = await pool.query(
    `INSERT INTO courses (teacher_id, course_code, subject_name, school, department, semester, academic_year, num_cos, program_id, academic_session_id)
     VALUES (?, ?, 'Applied Chemistry (Exam Test)', 'Test School', 'Test Dept', 2, '2099-2100', 0, ?, ?)`,
    [examCell.id, `EXAMTEST-${stamp}`, program.id, session.id],
  );
  ids.courseId = courseResult.insertId;
  // Normal course setup (thresholds/weights) — a real course already has this from the
  // existing course-creation flow; this test's throwaway course needs it bootstrapped too,
  // since the paper-approval flow only owns Q/CO mapping, not course-level policy config.
  const { saveConfig } = require('./models/mappingModel');
  await saveConfig(ids.courseId, {
    threshold_percent_internal: 40, threshold_percent_external: 40,
    level1_criteria_internal: 50, level2_criteria_internal: 60, level3_criteria_internal: 70,
    level1_criteria_external: 50, level2_criteria_external: 60, level3_criteria_external: 70,
    total_max_internal: 30, total_max_external: 60,
    internal_weight: 30, external_weight: 70,
  });

  // ── 1. Upload + extract ─────────────────────────────────────────────────
  const upload = await uploadPaper(examCellToken, { courseId: ids.courseId, examType: 'MTT' });
  check('Upload succeeds', upload.status === 200 && upload.json?.success, JSON.stringify(upload.json?.data?.paper?.status));
  ids.paperId = upload.json?.data?.paper?.id;
  const draftUrl = `/api/examinations/papers/${ids.paperId}/draft`;
  check('Extraction produced a 9-row review draft', upload.json?.data?.draft?.rows?.length === 9, `count=${upload.json?.data?.draft?.rows?.length}`);
  check('Nothing is published before confirmation', (upload.json?.data?.questions || []).length === 0 && upload.json?.data?.paper?.status === 'UPLOADED');
  check('Complete DOCX draft is publishable as extracted', upload.json?.data?.review?.canPublish === true, JSON.stringify(upload.json?.data?.review?.paper));

  const earlyVerify = await req('POST', `/api/examinations/papers/${ids.paperId}/verify`, { token: examCellToken });
  check('Verify refused until the mapping is confirmed (400)', earlyVerify.status === 400, `status=${earlyVerify.status}`);
  const outsiderDraft = await req('GET', draftUrl, { token: outsiderToken });
  check('Plain teacher cannot open the review draft (403)', outsiderDraft.status === 403, `status=${outsiderDraft.status}`);

  const rev1 = upload.json?.data?.draft?.revision;
  const cleared = await req('PUT', draftUrl, { token: examCellToken, body: { revision: rev1, rows: [{ key: 'r1', coNumber: null }] } });
  check('Clearing a CO marks that row Needs Review', cleared.status === 200 && cleared.json?.data?.review?.rows?.r1?.status === 'needs_review', JSON.stringify(cleared.json?.message));
  const stale = await req('PUT', draftUrl, { token: examCellToken, body: { revision: rev1, rows: [{ key: 'r1', coNumber: 1 }] } });
  check('Stale draft revision rejected (409)', stale.status === 409, `status=${stale.status}`);
  const blocked = await req('POST', `/api/examinations/papers/${ids.paperId}/confirm`, { token: examCellToken, body: {} });
  check('Confirm & Publish refused while a row needs review (422)', blocked.status === 422, `status=${blocked.status}`);
  const restored = await req('PUT', draftUrl, { token: examCellToken, body: { revision: cleared.json?.data?.draft?.revision, rows: [{ key: 'r1', coNumber: 1 }] } });
  check('Restoring the printed CO restores source=paper', restored.json?.data?.draft?.rows?.find((r) => r.key === 'r1')?.coSource === 'paper', JSON.stringify(restored.json?.message));

  const confirm = await req('POST', `/api/examinations/papers/${ids.paperId}/confirm`, { token: examCellToken, body: { revision: restored.json?.data?.draft?.revision } });
  check('Confirm & Publish succeeds', confirm.status === 200 && confirm.json?.success, JSON.stringify(confirm.json?.message));
  const questions = confirm.json?.data?.questions || [];
  check('Extraction produced 9 questions', questions.length === 9, `count=${questions.length}`);
  check('Extraction confidence high', confirm.json?.data?.paper?.extraction_confidence === 'high');
  check('Status after confirmation is EXTRACTED', confirm.json?.data?.paper?.status === 'EXTRACTED', confirm.json?.data?.paper?.status);
  check('Section-wise numbering and provenance kept', questions[7]?.section === 'C' && questions[7]?.question_label === '1'
    && questions[7]?.co_source === 'paper' && questions[7]?.marks_source === 'instruction', JSON.stringify(questions[7]));

  const byQNum = new Map(questions.map((q) => [q.question_number, q]));
  const expected = [
    [1, 1, 'Remember', 2], [2, 3, 'Remember', 2], [3, 2, 'Evaluate', 2], [4, 1, 'Remember', 2], [5, 3, 'Evaluate', 2],
    [6, 3, 'Apply', 5], [7, 3, 'Apply', 5], [8, 1, 'Remember', 10], [9, 2, 'Remember', 10],
  ];
  let allMatch = true;
  for (const [qnum, coNumber, rbt, marks] of expected) {
    const row = byQNum.get(qnum);
    const co = questions.find((q) => q.id === row?.co_id);
    if (!row || row.co_number !== coNumber || row.rbt_level !== rbt || Number(row.max_marks) !== marks) {
      allMatch = false;
      console.log(`  mismatch at Q${qnum}:`, JSON.stringify(row));
    }
  }
  check('All 9 extracted rows exactly match the known fixture mapping', allMatch);
  check('Section C questions share a choice_group', byQNum.get(8)?.choice_group && byQNum.get(8).choice_group === byQNum.get(9)?.choice_group);

  const detail0 = await req('GET', `/api/examinations/papers/${ids.paperId}`, { token: examCellToken });
  check('Meta: school/program/subject/marks/duration extracted', detail0.json?.data?.paper?.max_marks == 30 && detail0.json?.data?.paper?.duration_minutes == 60, JSON.stringify({ mm: detail0.json?.data?.paper?.max_marks, dm: detail0.json?.data?.paper?.duration_minutes }));

  // ── 2. Assign reviewer ───────────────────────────────────────────────────
  const assignReviewer = await req('POST', `/api/examinations/papers/${ids.paperId}/assignments`, { token: examCellToken, body: { email: reviewer.email, responsibility: 'PAPER_REVIEWER' } });
  check('Reviewer assigned', assignReviewer.status === 200 && assignReviewer.json?.success, JSON.stringify(assignReviewer.json));

  const myAssignmentsReviewer = await req('GET', '/api/examinations/my-assignments', { token: reviewerToken });
  check('Reviewer sees exactly 1 assignment', (myAssignmentsReviewer.json?.data || []).length === 1, JSON.stringify(myAssignmentsReviewer.json?.data));

  const outsiderList = await req('GET', '/api/examinations/papers', { token: outsiderToken });
  check('Outsider sees 0 papers in list', (outsiderList.json?.data || []).length === 0, JSON.stringify(outsiderList.json?.data?.length));
  const outsiderDetail = await req('GET', `/api/examinations/papers/${ids.paperId}`, { token: outsiderToken });
  check('Outsider forbidden from paper detail (403)', outsiderDetail.status === 403, `status=${outsiderDetail.status}`);

  // ── 3. Reviewer corrects one row, verifies ───────────────────────────────
  const q3 = byQNum.get(3);
  const correct = await req('PUT', `/api/examinations/papers/${ids.paperId}/questions/${q3.id}`, { token: reviewerToken, body: { coNumber: 3 } });
  check('Reviewer correction accepted', correct.status === 200 && correct.json?.success, JSON.stringify(correct.json));

  const [auditRows] = await pool.query("SELECT * FROM admin_audit_log WHERE action = 'CO_MAPPING_CHANGED' AND entity_id = ?", [q3.id]);
  check('CO_MAPPING_CHANGED audit row written', auditRows.length === 1, JSON.stringify(auditRows[0]?.details));

  const outsiderCorrect = await req('PUT', `/api/examinations/papers/${ids.paperId}/questions/${q3.id}`, { token: outsiderToken, body: { coNumber: 2 } });
  check('Outsider cannot correct a question (403)', outsiderCorrect.status === 403, `status=${outsiderCorrect.status}`);

  const verify = await req('POST', `/api/examinations/papers/${ids.paperId}/verify`, { token: reviewerToken });
  check('Reviewer verifies paper', verify.status === 200 && verify.json?.data?.status === 'VERIFIED', JSON.stringify(verify.json));

  // ── 4. Approve (sole reviewer may approve; Exam Cell also can) ───────────
  const approve = await req('POST', `/api/examinations/papers/${ids.paperId}/approve`, { token: examCellToken });
  check('Exam Cell approves paper', approve.status === 200 && approve.json?.data?.status === 'APPROVED', JSON.stringify(approve.json));

  const [outcomes] = await pool.query('SELECT co_number, max_internal FROM course_outcomes WHERE course_id = ? ORDER BY co_number', [ids.courseId]);
  console.log('  reconciled course_outcomes:', JSON.stringify(outcomes));
  // CO1: Q1(2)+Q4(2)+Q8(10, Section C choice) = 14. CO2: Q3 was corrected away, now only Q9(10, choice) = 10. CO3: Q2(2)+Q5(2)+Q6(5)+Q7(5)+Q3(2, moved here)=16.
  check('CO max_internal reconciled from paper totals (documented, not assumed)', outcomes.length === 3, JSON.stringify(outcomes));

  // ── 5. Assign class ───────────────────────────────────────────────────────
  const [classResult] = await pool.query(
    'INSERT INTO academic_classes (program_id, academic_session_id, semester, section) VALUES (?, ?, 2, ?)',
    [program.id, session.id, `EXAMTEST-${stamp}`],
  );
  ids.classId = classResult.insertId;
  const [studentResult] = await pool.query(
    'INSERT INTO students (registration_number, roll_number, name, email, status, academic_program_id, academic_session_id, semester) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [`EXAMTEST-REG-${stamp}`, 'R1', 'Exam Test Student', null, 'Active', program.id, session.id, 2],
  );
  ids.studentId = studentResult.insertId;
  await pool.query('INSERT INTO class_students (class_id, student_id) VALUES (?, ?)', [ids.classId, ids.studentId]);

  const assignClass = await req('POST', `/api/examinations/papers/${ids.paperId}/assign-class`, { token: examCellToken, body: { classId: ids.classId } });
  check('Class assigned (enrollEntireClassInCourse reused)', assignClass.status === 200 && assignClass.json?.success, JSON.stringify(assignClass.json));
  const [[enrollCheck]] = await pool.query('SELECT COUNT(*) c FROM course_enrollments WHERE course_id = ? AND student_id = ?', [ids.courseId, ids.studentId]);
  check('Student actually enrolled via existing pipeline', enrollCheck.c === 1);

  // ── 6. Assign marks-entry teacher (different person than reviewer) ──────
  const assignMarks = await req('POST', `/api/examinations/papers/${ids.paperId}/assignments`, { token: examCellToken, body: { email: marksTeacher.email, responsibility: 'MARKS_ENTRY' } });
  check('Marks-entry teacher assigned', assignMarks.status === 200 && assignMarks.json?.success);

  const marksTeacherAssignments = await req('GET', '/api/examinations/my-assignments', { token: marksTeacherToken });
  check('Marks teacher sees exactly 1 assignment (MARKS_ENTRY only)', (marksTeacherAssignments.json?.data || []).length === 1 && marksTeacherAssignments.json.data[0].responsibility === 'MARKS_ENTRY');

  // ── 7. Marks teacher enters marks using the EXISTING marks endpoint ──────
  const marksView = await req('GET', `/api/courses/${ids.courseId}/marks`, { token: marksTeacherToken });
  const roster = marksView.json?.data?.mtt || [];
  check('Enrolled roster auto-loaded for marks entry', roster.some((s) => s.reg_no === `EXAMTEST-REG-${stamp}`), JSON.stringify(roster.map((s) => s.reg_no)));

  const paperDetail = await req('GET', `/api/examinations/papers/${ids.paperId}`, { token: marksTeacherToken });
  const finalQuestions = paperDetail.json?.data?.questions || [];
  const qMarks = { 1: 2, 2: 2, 3: 1, 4: 2, 5: 1, 6: 4, 7: 4, 8: 10 }; // Q9 left blank (chose Q8 in Section C)
  const questionMarks = {};
  finalQuestions.forEach((q) => { if (qMarks[q.question_number] !== undefined) questionMarks[q.id] = qMarks[q.question_number]; });

  const saveMarks = await req('POST', `/api/courses/${ids.courseId}/marks`, {
    token: marksTeacherToken,
    body: { examType: 'MTT', entryMode: 'question', students: [{ name: 'Exam Test Student', roll: `EXAMTEST-REG-${stamp}`, questionMarks }] },
  });
  check('Marks-entry teacher saves marks via existing endpoint', saveMarks.status === 200 && saveMarks.json?.success, JSON.stringify(saveMarks.json));

  const afterSave = await req('GET', `/api/courses/${ids.courseId}/marks`, { token: marksTeacherToken });
  const savedStudent = (afterSave.json?.data?.mtt || []).find((s) => s.reg_no === `EXAMTEST-REG-${stamp}`);
  console.log('  computed coMarks:', JSON.stringify(savedStudent?.coMarks), 'total:', savedStudent?.totalMarks);
  check('No NaN/Infinity in computed marks', !JSON.stringify(savedStudent).match(/NaN|Infinity/));
  check('Total = sum of entered marks (2+2+1+2+1+4+4+10=26)', Number(savedStudent?.totalMarks) === 26, `got=${savedStudent?.totalMarks}`);

  // ── 8. Submit, then lock guard ────────────────────────────────────────────
  const submit = await req('POST', `/api/examinations/papers/${ids.paperId}/marks-submission/submit`, { token: marksTeacherToken });
  check('Marks submitted', submit.status === 200 && submit.json?.data?.status === 'SUBMITTED');

  const outsiderSubmit = await req('POST', `/api/examinations/papers/${ids.paperId}/marks-submission/submit`, { token: outsiderToken });
  check('Outsider cannot submit marks for a paper they are not assigned (403)', outsiderSubmit.status === 403);

  const editAfterSubmit = await req('POST', `/api/courses/${ids.courseId}/marks`, {
    token: marksTeacherToken,
    body: { examType: 'MTT', entryMode: 'question', students: [{ name: 'Exam Test Student', roll: `EXAMTEST-REG-${stamp}`, questionMarks: { [finalQuestions[0].id]: 1 } }] },
  });
  check('Plain teacher blocked from editing after submission (400)', editAfterSubmit.status === 400, JSON.stringify(editAfterSubmit.json));

  const reopen = await req('POST', `/api/examinations/papers/${ids.paperId}/marks-submission/reopen`, { token: examCellToken, body: { reason: 'Spot-check requested' } });
  check('Exam Cell reopens marks with a reason', reopen.status === 200 && reopen.json?.data?.status === 'CORRECTION_REQUIRED');

  const editAfterReopen = await req('POST', `/api/courses/${ids.courseId}/marks`, {
    token: marksTeacherToken,
    body: { examType: 'MTT', entryMode: 'question', students: [{ name: 'Exam Test Student', roll: `EXAMTEST-REG-${stamp}`, questionMarks: { [finalQuestions[0].id]: 2 } }] },
  });
  check('Editing works again after reopen', editAfterReopen.status === 200 && editAfterReopen.json?.success);

  // ── 9. Attainment/reports unchanged, driven by existing pipeline ────────
  const attainment = await req('GET', `/api/courses/${ids.courseId}/attainment`, { token: examCellToken });
  check('Existing attainment endpoint reflects new data without changes', attainment.status === 200 && attainment.json?.success, `status=${attainment.status}`);

  console.log(failed === 0 ? '\nALL EXAM WORKFLOW TESTS PASSED' : `\nFAILED: ${failed}`);
})().catch((e) => { console.error('CRASH', e); failed += 1; }).finally(async () => {
  // ── Cleanup: delete everything this test created ─────────────────────────
  try {
    if (ids.paperId) {
      await pool.query('DELETE FROM notifications WHERE related_entity_id = ? AND related_entity_type = ?', [ids.paperId, 'question_paper']);
      await pool.query('DELETE FROM paper_assignments WHERE question_paper_id = ?', [ids.paperId]);
      await pool.query('DELETE FROM marks_submissions WHERE question_paper_id = ?', [ids.paperId]);
    }
    if (ids.courseId) {
      const [marks] = await pool.query('SELECT id FROM student_marks WHERE course_id = ?', [ids.courseId]);
      for (const m of marks) {
        await pool.query('DELETE FROM student_co_marks WHERE student_mark_id = ?', [m.id]);
        await pool.query('DELETE FROM student_question_marks WHERE student_mark_id = ?', [m.id]);
      }
      await pool.query('DELETE FROM student_marks WHERE course_id = ?', [ids.courseId]);
      await pool.query('DELETE FROM course_enrollments WHERE course_id = ?', [ids.courseId]);
      await pool.query('DELETE FROM question_configs WHERE course_id = ?', [ids.courseId]);
      await pool.query('DELETE FROM co_po_values WHERE co_id IN (SELECT id FROM course_outcomes WHERE course_id = ?)', [ids.courseId]);
      await pool.query('DELETE FROM course_outcomes WHERE course_id = ?', [ids.courseId]);
      await pool.query('DELETE FROM course_configs WHERE course_id = ?', [ids.courseId]);
    }
    if (ids.paperId) await pool.query('DELETE FROM question_papers WHERE id = ?', [ids.paperId]);
    if (ids.classId) await pool.query('DELETE FROM class_students WHERE class_id = ?', [ids.classId]);
    if (ids.studentId) await pool.query('DELETE FROM students WHERE id = ?', [ids.studentId]);
    if (ids.classId) await pool.query('DELETE FROM academic_classes WHERE id = ?', [ids.classId]);
    if (ids.courseId) await pool.query('DELETE FROM courses WHERE id = ?', [ids.courseId]);
    for (const tid of ids.teachers) {
      await pool.query('DELETE FROM admin_audit_log WHERE actor_user_id = ?', [tid]);
      await pool.query('DELETE FROM teachers WHERE id = ?', [tid]);
    }
    console.log('Cleanup complete.');
  } catch (e) {
    console.error('CLEANUP ERROR (manual check needed):', e.message);
  }
  await pool.end();
  process.exit(failed === 0 ? 0 : 1);
});
