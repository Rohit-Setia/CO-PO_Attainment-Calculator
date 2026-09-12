// ─────────────────────────────────────────────────────────────────────────────
// Allocation import — validation tests.
//
// Unlike the other test-*.js scripts here, this one needs NO database: it stubs
// config/db's pool.query with an in-memory fixture, so the row-resolution rules
// (course, class, paper set, teacher, duplicate and conflict detection) can be
// exercised deterministically. Run with:  node test-allocation-import.js
//
// The fixture is the user's own example: Applied Chemistry, one ETT paper set,
// two sections of B.Tech CSE with DIFFERENT reviewers and DIFFERENT evaluators.
// ─────────────────────────────────────────────────────────────────────────────
process.env.DB_HOST = process.env.DB_HOST || 'stub';
process.env.DB_NAME = process.env.DB_NAME || 'stub';
process.env.DB_USER = process.env.DB_USER || 'stub';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'stub';

const ExcelJS = require('exceljs');
const pool = require('./config/db');

// ── Fixture ──────────────────────────────────────────────────────────────────
const FIXTURE = {
  examinations: [{
    id: 1, name: 'End Term Examination – December 2026', code: 'ETT2026',
    exam_type: 'ETT', academic_session_id: 7, status: 'ACTIVE', session_name: '2026-27',
  }],
  courses: [
    { id: 10, course_code: '25BTAL12C01', subject_name: 'Applied Chemistry', semester: 2, academic_year: '2026-27', program_id: 3, program_name: 'B.Tech CSE', program_code: 'BTCSE' },
    { id: 11, course_code: 'MGT101', subject_name: 'Management', semester: 1, academic_year: '2026-27', program_id: 4, program_name: 'BBA', program_code: 'BBA' },
  ],
  classes: [
    { id: 100, program_id: 3, academic_session_id: 7, semester: 2, section: 'CSE-A', status: 'Active', program_name: 'B.Tech CSE', program_code: 'BTCSE', session_name: '2026-27' },
    { id: 101, program_id: 3, academic_session_id: 7, semester: 2, section: 'CSE-B', status: 'Active', program_name: 'B.Tech CSE', program_code: 'BTCSE', session_name: '2026-27' },
    { id: 102, program_id: 4, academic_session_id: 7, semester: 1, section: 'BBA-A', status: 'Active', program_name: 'BBA', program_code: 'BBA', session_name: '2026-27' },
  ],
  teachers: [
    { id: 201, name: 'Teacher A', email: 'a@ctu.in', employee_id: 'EMP-A', role: 'Teacher' },
    { id: 202, name: 'Teacher B', email: 'b@ctu.in', employee_id: 'EMP-B', role: 'Teacher' },
    { id: 203, name: 'Teacher C', email: 'c@ctu.in', employee_id: 'EMP-C', role: 'Teacher' },
    { id: 204, name: 'Teacher D', email: 'd@ctu.in', employee_id: 'EMP-D', role: 'Teacher' },
  ],
  papers: [
    { id: 500, course_id: 10, exam_type: 'ETT', paper_set: 'Set 1', status: 'UPLOADED', examination_id: 1 },
  ],
  assignments: [],
};

// Routes each query the service issues to the right slice of the fixture.
pool.query = async (sql, params = []) => {
  const q = String(sql);
  if (q.includes('FROM examinations e')) {
    return [FIXTURE.examinations.filter((e) => e.id === Number(params[0]))];
  }
  if (q.includes('FROM courses c LEFT JOIN programs')) return [FIXTURE.courses];
  if (q.includes('FROM academic_classes ac')) return [FIXTURE.classes];
  if (q.includes('FROM teachers')) return [FIXTURE.teachers];
  if (q.includes('FROM question_papers')) {
    const courseIds = params.slice(0, params.length - 1).map(Number);
    return [FIXTURE.papers.filter((p) => courseIds.includes(p.course_id))];
  }
  if (q.includes('FROM paper_assignments pa JOIN teachers')) {
    const ids = params.map(Number);
    return [FIXTURE.assignments.filter((a) => ids.includes(a.question_paper_id))];
  }
  throw new Error(`Unstubbed query: ${q.slice(0, 90)}`);
};

const { validateAllocationWorkbook } = require('./services/allocationImportService');

// ── Helpers ──────────────────────────────────────────────────────────────────
const HEADERS = ['Exam', 'School', 'Department', 'Program', 'Semester', 'Class',
  'Subject Code', 'Subject', 'Paper Set', 'Paper Reviewer', 'Marks Evaluator', 'Deadline'];

const buildSheet = async (rows) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Allocation');
  ws.addRow(HEADERS);
  rows.forEach((r) => ws.addRow(r));
  return wb.xlsx.writeBuffer();
};

let passed = 0;
let failed = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed += 1; console.log(`  PASS  ${label}`); } else {
    failed += 1;
    console.log(`  FAIL  ${label}\n          expected ${JSON.stringify(expected)}\n          actual   ${JSON.stringify(actual)}`);
  }
};
const reasonsOf = (result, rowNumber) => {
  const row = result.rows.find((r) => r.rowNumber === rowNumber);
  return row ? row.reasons.join(' | ') : '(row missing)';
};

// ── Tests ────────────────────────────────────────────────────────────────────
const run = async () => {
  // 1. The headline case: one paper, two sections, four different teachers.
  console.log('\n1. Same paper set → two classes → different reviewers and evaluators');
  let buffer = await buildSheet([
    ['ETT2026', 'Engineering', 'CSE', 'B.Tech CSE', 2, 'CSE-A', '25BTAL12C01', 'Applied Chemistry', 'Set 1', 'a@ctu.in', 'b@ctu.in', ''],
    ['ETT2026', 'Engineering', 'CSE', 'B.Tech CSE', 2, 'CSE-B', '25BTAL12C01', 'Applied Chemistry', 'Set 1', 'c@ctu.in', 'd@ctu.in', ''],
  ]);
  let result = await validateAllocationWorkbook({ buffer, filename: 'a.xlsx', examinationId: 1 });
  check('2 rows, both valid', [result.summary.totalRows, result.summary.validRows, result.summary.errorRows], [2, 2, 0]);
  check('4 assignments to create', result.summary.assignmentsToCreate, 4);
  check('CSE-A resolved to class 100', result.rows[0].resolved.classId, 100);
  check('CSE-B resolved to class 101', result.rows[1].resolved.classId, 101);
  check('reviewer and evaluator are separate rows',
    result.rows[0].allocations.map((a) => `${a.responsibility}:${a.userId}`),
    ['PAPER_REVIEWER:201', 'MARKS_ENTRY:202']);

  // 2. Every per-row failure the Examination Cell will actually hit.
  console.log('\n2. Per-row errors');
  buffer = await buildSheet([
    ['ETT2026', '', '', 'B.Tech CSE', 2, 'CSE-A', '25BTAL12C01', 'Applied Chemistry', 'Set 1', 'nobody@ctu.in', 'b@ctu.in', ''],
    ['ETT2026', '', '', 'B.Tech CSE', 2, 'CSE-A', 'DOESNOTEXIST', 'Ghost Subject', 'Set 1', 'a@ctu.in', 'b@ctu.in', ''],
    ['ETT2026', '', '', 'B.Tech CSE', 2, 'BBA-A', '25BTAL12C01', 'Applied Chemistry', 'Set 1', 'a@ctu.in', 'b@ctu.in', ''],
    ['ETT2026', '', '', 'B.Tech CSE', 2, 'CSE-A', '25BTAL12C01', 'Applied Chemistry', 'Set 9', 'a@ctu.in', 'b@ctu.in', ''],
    ['ETT2026', '', '', 'BBA', 1, 'BBA-A', 'MGT101', 'Management', 'Set 2', 'a@ctu.in', 'b@ctu.in', ''],
    ['SOME OTHER EXAM', '', '', 'B.Tech CSE', 2, 'CSE-B', '25BTAL12C01', 'Applied Chemistry', 'Set 1', 'a@ctu.in', 'b@ctu.in', ''],
  ]);
  result = await validateAllocationWorkbook({ buffer, filename: 'b.xlsx', examinationId: 1 });
  check('all 6 rows rejected', [result.summary.totalRows, result.summary.errorRows], [6, 6]);
  console.log(`     row 2 → ${reasonsOf(result, 2)}`);
  console.log(`     row 3 → ${reasonsOf(result, 3)}`);
  console.log(`     row 4 → ${reasonsOf(result, 4)}`);
  console.log(`     row 5 → ${reasonsOf(result, 5)}`);
  console.log(`     row 6 → ${reasonsOf(result, 6)}`);
  console.log(`     row 7 → ${reasonsOf(result, 7)}`);
  check('unknown teacher named', reasonsOf(result, 2).includes('was not found'), true);
  check('unknown subject named', reasonsOf(result, 3).includes('Subject code "DOESNOTEXIST"'), true);
  check('class/program mismatch caught', reasonsOf(result, 4).includes('does not belong to the program'), true);
  check('unknown paper set lists what exists', reasonsOf(result, 5).includes('available: Set 1'), true);
  check('subject with no uploaded paper caught', reasonsOf(result, 6).includes('No question paper has been uploaded'), true);
  check('row for a different examination refused', reasonsOf(result, 7).includes('this import targets'), true);

  // 3. Duplicate rows inside one file.
  console.log('\n3. Duplicate allocation within the file');
  buffer = await buildSheet([
    ['ETT2026', '', '', 'B.Tech CSE', 2, 'CSE-A', '25BTAL12C01', 'Applied Chemistry', 'Set 1', 'a@ctu.in', 'b@ctu.in', ''],
    ['ETT2026', '', '', 'B.Tech CSE', 2, 'CSE-A', '25BTAL12C01', 'Applied Chemistry', 'Set 1', 'c@ctu.in', 'd@ctu.in', ''],
  ]);
  result = await validateAllocationWorkbook({ buffer, filename: 'c.xlsx', examinationId: 1 });
  check('first row valid, second rejected', [result.rows[0].outcome, result.rows[1].outcome], ['create', 'invalid']);
  check('duplicate names the earlier row', reasonsOf(result, 3).includes('already appears on row 2'), true);

  // 4. Conflict with an allocation already in the database.
  console.log('\n4. Conflict with an existing allocation');
  FIXTURE.assignments = [
    { question_paper_id: 500, class_id: 100, responsibility: 'MARKS_ENTRY', user_id: 202, name: 'Teacher B', email: 'b@ctu.in' },
  ];
  buffer = await buildSheet([
    ['ETT2026', '', '', 'B.Tech CSE', 2, 'CSE-A', '25BTAL12C01', 'Applied Chemistry', 'Set 1', 'a@ctu.in', 'b@ctu.in', ''],
    ['ETT2026', '', '', 'B.Tech CSE', 2, 'CSE-B', '25BTAL12C01', 'Applied Chemistry', 'Set 1', 'c@ctu.in', 'b@ctu.in', ''],
  ]);
  result = await validateAllocationWorkbook({ buffer, filename: 'd.xlsx', examinationId: 1 });
  check('re-importing an identical allocation only creates the missing one',
    result.summary.assignmentsToCreate, 3);
  check('row with only unchanged+new is still importable', result.rows[0].outcome, 'create');

  FIXTURE.assignments = [
    { question_paper_id: 500, class_id: 100, responsibility: 'MARKS_ENTRY', user_id: 204, name: 'Teacher D', email: 'd@ctu.in' },
  ];
  result = await validateAllocationWorkbook({ buffer, filename: 'd2.xlsx', examinationId: 1 });
  check('reallocating to a different teacher is refused, not silent', result.rows[0].outcome, 'invalid');
  check('conflict names the current holder', reasonsOf(result, 2).includes('Teacher D'), true);
  FIXTURE.assignments = [];

  // 5. Column aliasing and lookup by employee id / name.
  console.log('\n5. Header aliases and alternate teacher keys');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Some Institutional Title Row']);
  ws.addRow(['Examination', 'Programme', 'Sem', 'Section', 'Course Code', 'Set No', 'Reviewer', 'Examiner']);
  ws.addRow(['ETT2026', 'B.Tech CSE', 2, 'CSE-A', '25BTAL12C01', 'Set 1', 'EMP-A', 'Teacher B']);
  result = await validateAllocationWorkbook({
    buffer: await wb.xlsx.writeBuffer(), filename: 'e.xlsx', examinationId: 1,
  });
  check('header found below a title band, aliases matched', result.summary.validRows, 1);
  check('employee id resolves the reviewer', result.rows[0].resolved.reviewer.id, 201);
  check('exact unique name resolves the evaluator', result.rows[0].resolved.evaluator.id, 202);

  // 6. Only one of the two responsibilities filled in.
  console.log('\n6. Partial rows');
  buffer = await buildSheet([
    ['ETT2026', '', '', 'B.Tech CSE', 2, 'CSE-A', '25BTAL12C01', 'Applied Chemistry', 'Set 1', 'a@ctu.in', '', ''],
    ['ETT2026', '', '', 'B.Tech CSE', 2, 'CSE-B', '25BTAL12C01', 'Applied Chemistry', 'Set 1', '', 'd@ctu.in', ''],
    ['ETT2026', '', '', 'B.Tech CSE', 2, 'CSE-A', '25BTAL12C01', 'Applied Chemistry', 'Set 1', '', '', ''],
  ]);
  result = await validateAllocationWorkbook({ buffer, filename: 'f.xlsx', examinationId: 1 });
  check('reviewer-only and evaluator-only rows are valid',
    [result.rows[0].outcome, result.rows[1].outcome], ['create', 'create']);
  check('a row allocating nobody is rejected', result.rows[2].outcome, 'invalid');

  // 7. A sheet that isn't an allocation sheet at all.
  console.log('\n7. Wrong file');
  const bad = new ExcelJS.Workbook();
  bad.addWorksheet('X').addRow(['Student Name', 'Roll No', 'Marks']);
  result = await validateAllocationWorkbook({
    buffer: await bad.xlsx.writeBuffer(), filename: 'g.xlsx', examinationId: 1,
  });
  check('header error rather than a crash', Boolean(result.headerError), true);
  console.log(`     → ${result.headerError}`);

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((err) => { console.error('\nHarness error:', err); process.exit(1); });
