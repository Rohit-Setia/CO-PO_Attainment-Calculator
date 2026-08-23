// Phase 8 API security audit — run: node migration-snapshots/phase8-audit.js
const http = require('http');
const PORT = process.env.PORT || 5000;

function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const urlPath = path.startsWith('/api') || path === '/health' || path === '/' ? path : `/api${path}`;
    const r = http.request(
      { host: 'localhost', port: PORT, path: urlPath, method,
        headers: Object.assign(
          { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          token ? { Authorization: `Bearer ${token}` } : {},
        ),
      },
      (resp) => { let buf = ''; resp.on('data', (c) => { buf += c; }); resp.on('end', () => resolve({ status: resp.statusCode, body: buf })); },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const RESULT = { pass: 0, fail: 0, results: [] };
function check(label, ok, detail) {
  RESULT.results.push({ label, ok, detail });
  if (ok) RESULT.pass += 1; else { RESULT.fail += 1; console.error(`  FAIL: ${label} — ${detail}`); }
}
function ok(label) { check(label, true, 'passed'); }
function fail(label, detail) { check(label, false, detail); }

(async () => {
  // 1. Health check
  const h = await req('GET', '/health', null);
  check('GET /health → 200', h.status === 200, `${h.status}`);
  const hb = JSON.parse(h.body);
  check('GET /health status ok', hb.status === 'ok', hb.detail || 'ok');

  // 2. Auth: 401 for protected endpoints without token
  for (const p of ['/courses', '/students', '/dashboard/summary', '/schools', '/sessions', '/classes']) {
    const r = await req('GET', p, null);
    check(`GET ${p} (no token) → 401`, r.status === 401, `${r.status}`);
  }

  // 3. Auth: 400 for invalid login
  for (const body of [{ email: 'x', password: '' }, { email: 'x@y', password: 'short' }]) {
    const r = await req('POST', '/auth/login', null, body);
    check(`POST /auth/login (${body.email}) → 400`, r.status === 400, `${r.status}`);
  }
  for (const body of [{ name: 'T', email: 'x@y', password: 'abc' }, { name: 'Test', email: 'x', password: 'Abc123' }]) {
    const r = await req('POST', '/auth/signup', null, body);
    check(`POST /auth/signup (${body.name}) → 400`, r.status === 400, `${r.status}`);
  }

  // 4. Login as Admin, School Admin, Department Admin, Teacher
  const logins = [
    { label: 'Admin', email: 'phase7-smoke-admin@test.local', pw: 'Phase7SmokeTest1' },
    { label: 'SchoolAdmin', email: 'phase7-smoke-schooladmin@test.local', pw: 'Phase7SmokeTest1' },
    { label: 'DeptAdmin', email: 'phase7-smoke-deptadmin@test.local', pw: 'Phase7SmokeTest1' },
    { label: 'Teacher', email: 'phase7-smoke-teacher@test.local', pw: 'Phase7SmokeTest1' },
    { label: 'Viewer', email: 'phase7-smoke-viewer@test.local', pw: 'Phase7SmokeTest1' },
  ];
  const tokens = {};

  for (const l of logins) {
    const r = await req('POST', '/auth/login', null, { email: l.email, password: l.pw });
    check(`${l.label} login`, r.status === 200, `${r.status}`);
    if (r.status === 200) tokens[l.label] = JSON.parse(r.body).data.token;
  }

  if (!tokens.Admin) { console.error('Admin login failed — aborting deeper tests'); printSummary(); return; }

  // 5. Admin: full read access
  const schools = await req('GET', '/schools', tokens.Admin);
  check('GET /schools (Admin)', schools.status === 200, `${schools.status}`);
  const schoolsBody = JSON.parse(schools.body);
  check('GET /schools has data', (schoolsBody.data || []).length > 0, `count=${schoolsBody.data.length}`);

  const courses = await req('GET', '/courses', tokens.Admin);
  check('GET /courses (Admin)', courses.status === 200, `${courses.status}`);
  const coursesBody = JSON.parse(courses.body);
  const courseIds = (coursesBody.data || []).map(c => c.id);
  ok(`Admin sees ${courseIds.length} courses`);

  const dash = await req('GET', '/dashboard/summary', tokens.Admin);
  check('GET /dashboard/summary (Admin)', dash.status === 200, `${dash.status}`);
  const students = await req('GET', '/students', tokens.Admin);
  check('GET /students (Admin)', students.status === 200, `${students.status}`);

  const profile = await req('GET', '/auth/dashboard', tokens.Admin);
  check('GET /auth/dashboard (Admin)', profile.status === 200, `${profile.status}`);

  const sessions = await req('GET', '/sessions', tokens.Admin);
  check('GET /sessions (Admin)', sessions.status === 200, `${sessions.status}`);
  const classes = await req('GET', '/classes', tokens.Admin);
  check('GET /classes (Admin)', classes.status === 200, `${classes.status}`);

  // 6. Admin: course sub-resources
  if (courseIds.length > 0) {
    const cid = courseIds[0];
    for (const ep of [`/courses/${cid}/marks`, `/courses/${cid}/outcomes`, `/courses/${cid}/config`, `/courses/${cid}/attainment`, `/courses/${cid}/enrollment`, `/courses/${cid}/marks-template`]) {
      const r = await req('GET', ep, tokens.Admin);
      check(`GET ${ep} (Admin)`, r.status === 200, `${r.status}`);
    }
  }

  // 7. IDOR: malformed IDs → 400
  for (const p of ['/courses/abc', '/students/abc', '/classes/abc']) {
    const r = await req('GET', p, tokens.Admin);
    check(`GET ${p} → 400`, r.status === 400, `${r.status}`);
  }

  // 8. IDOR: nonexistent resources → 404
  for (const p of ['/courses/999999', '/students/999999', '/classes/999999']) {
    const r = await req('GET', p, tokens.Admin);
    check(`GET ${p} → 404`, r.status === 404, `${r.status}`);
  }

  // 9. Invalid input: POST endpoints
  const badCourse = await req('POST', '/courses', tokens.Admin, {});
  check('POST /courses empty → 400', badCourse.status === 400, `${badCourse.status}`);

  if (courseIds.length > 0) {
    const cid = courseIds[0];
    const badMarks = await req('POST', `/courses/${cid}/marks`, tokens.Admin, { examType: 'INVALID', entryMode: 'co', students: [] });
    check('POST /marks invalid examType → 400', badMarks.status === 400, `${badMarks.status}`);
    const badOut = await req('POST', `/courses/${cid}/outcomes`, tokens.Admin, {});
    check('POST /outcomes empty → 400', badOut.status === 400, `${badOut.status}`);
  }

  // 10. Role-gated: Admin-only endpoints
  for (const label of ['SchoolAdmin', 'DeptAdmin', 'Teacher', 'Viewer']) {
    if (tokens[label]) {
      const r = await req('GET', '/auth/admin/users', tokens[label]);
      check(`GET /auth/admin/users (${label}) → 403`, r.status === 403, `${r.status}`);
    }
  }

  // 11. Role-gated: Academic structure write → Teacher/Viewer 403
  for (const label of ['Teacher', 'Viewer']) {
    if (tokens[label]) {
      const r = await req('POST', '/schools', tokens[label], { name: 'Test', code: 'T' });
      check(`POST /schools (${label}) → 403`, r.status === 403, `${r.status}`);
    }
  }

  // 12. Role-gated: Session management → Admin only
  for (const label of ['SchoolAdmin', 'DeptAdmin', 'Teacher', 'Viewer']) {
    if (tokens[label]) {
      const r = await req('POST', '/sessions', tokens[label], { name: 'Test', startYear: 2025, endYear: 2026 });
      check(`POST /sessions (${label}) → 403`, r.status === 403, `${r.status}`);
    }
  }

  // 13. School Admin: scoped reads
  if (tokens.SchoolAdmin) {
    const saCourses = await req('GET', '/courses', tokens.SchoolAdmin);
    check('GET /courses (SchoolAdmin)', saCourses.status === 200, `${saCourses.status}`);
    const saDepts = await req('GET', '/departments', tokens.SchoolAdmin);
    check('GET /departments (SchoolAdmin)', saDepts.status === 200, `${saDepts.status}`);
    const saBranches = await req('GET', '/branches', tokens.SchoolAdmin);
    check('GET /branches (SchoolAdmin)', saBranches.status === 200, `${saBranches.status}`);
  }

  // 14. Department Admin: scoped reads
  if (tokens.DeptAdmin) {
    const daCourses = await req('GET', '/courses', tokens.DeptAdmin);
    check('GET /courses (DeptAdmin)', daCourses.status === 200, `${daCourses.status}`);
    const daDepts = await req('GET', '/departments', tokens.DeptAdmin);
    check('GET /departments (DeptAdmin)', daDepts.status === 200, `${daDepts.status}`);
  }

  // 15. Teacher: own courses
  if (tokens.Teacher) {
    const tCourses = await req('GET', '/courses', tokens.Teacher);
    check('GET /courses (Teacher)', tCourses.status === 200, `${tCourses.status}`);
    const tProfile = await req('GET', '/auth/dashboard', tokens.Teacher);
    check('GET /auth/dashboard (Teacher)', tProfile.status === 200, `${tProfile.status}`);
  }

  // 16. Viewer: read-only
  if (tokens.Viewer) {
    const vCourses = await req('GET', '/courses', tokens.Viewer);
    check('GET /courses (Viewer)', vCourses.status === 200, `${vCourses.status}`);
    // Viewer cannot write
    const vDel = courseIds.length > 0 ? await req('DELETE', `/courses/${courseIds[0]}`, tokens.Viewer) : null;
    if (vDel) check('DELETE /courses/:id (Viewer) → 403', vDel.status === 403, `${vDel.status}`);
  }

  // 17. Create then deactivate a test school (unique code per run — duplicate codes are
  // expected to be rejected with 400 by the existing duplicate protection)
  const code = `P8${Date.now() % 100000}`;
  const newSchool = await req('POST', '/schools', tokens.Admin, { name: `Phase8-Test-School-${code}`, code });
  check('POST /schools (Admin) → 201', newSchool.status === 201, `${newSchool.status}`);
  const newSchoolId = newSchool.status === 201 ? (JSON.parse(newSchool.body).data || {}).id : null;
  if (newSchoolId) {
    const deact = await req('PUT', `/schools/${newSchoolId}`, tokens.Admin, { status: 'Inactive' });
    check('PUT /schools/:id deactivate', deact.status === 200, `${deact.status}`);
  }

  printSummary();
})();

function printSummary() {
  console.log(`\n=== Phase 8 API Audit Summary ===`);
  console.log(`Pass: ${RESULT.pass}, Fail: ${RESULT.fail}`);
  RESULT.results.forEach(r => console.log(`  ${r.ok ? 'PASS' : 'FAIL'}: ${r.label}`));
}