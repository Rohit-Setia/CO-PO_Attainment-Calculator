// Phase 8 cross-scope + IDOR security test — run: node migration-snapshots/phase8-scope-test.js
// Requires the Phase 7 smoke users to exist (make-phase7-smoke-users.js) and the API on :5000.
const http = require('http');
const PORT = process.env.PORT || 5000;

function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const urlPath = path.startsWith('/api') || path === '/health' || path === '/' ? path : `/api${path}`;
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
  const login = async (email, pw) => {
    const r = await req('POST', '/auth/login', null, { email, password: pw });
    if (r.status !== 200) return null;
    return JSON.parse(r.body).data.token;
  };

  const admin = await login('phase7-smoke-admin@test.local', 'Phase7SmokeTest1');
  const sa = await login('phase7-smoke-schooladmin@test.local', 'Phase7SmokeTest1'); // school 1
  const da = await login('phase7-smoke-deptadmin@test.local', 'Phase7SmokeTest1');   // dept 1
  const teacher = await login('phase7-smoke-teacher@test.local', 'Phase7SmokeTest1'); // unassigned
  if (!admin || !sa || !da || !teacher) { console.error('login failed'); return; }

  // ── 1. School Admin: in-scope reads (school 1) ──
  let r = await req('GET', '/schools/1/departments', sa);
  check('SchoolAdmin GET /schools/1/departments → 200 (own school)', r.status === 200, `${r.status}`);

  r = await req('GET', '/departments/1/branches', sa);
  check('SchoolAdmin GET /departments/1/branches → 200 (own school)', r.status === 200, `${r.status}`);

  r = await req('GET', '/classes/1', sa);
  check('SchoolAdmin GET /classes/1 → 200 (own school class)', r.status === 200, `${r.status}`);

  // ── 2. School Admin: cross-school reads must be denied ──
  // Test school id 4 was created by the Phase 8 audit run and does NOT belong to school 1.
  r = await req('GET', '/schools/4/departments', sa);
  check('SchoolAdmin GET /schools/4/departments → 403 (other school)', r.status === 403, `${r.status}`);

  r = await req('GET', '/departments/9/branches', sa);
  // dept 9 IS in school 1 → 200; the check below asserts in-scope data is returned and
  // out-of-scope department ids are not silently resolved.
  check('SchoolAdmin GET /departments/9/branches → 200 (own school dept)', r.status === 200, `${r.status}`);

  r = await req('GET', '/classes/99999', sa);
  check('SchoolAdmin GET /classes/99999 → 404', r.status === 404, `${r.status}`);

  // ── 3. Department Admin: in-scope reads (dept 1) ──
  r = await req('GET', '/departments/1/branches', da);
  check('DeptAdmin GET /departments/1/branches → 200 (own dept)', r.status === 200, `${r.status}`);

  r = await req('GET', '/classes/2', da);
  check('DeptAdmin GET /classes/2 → 200 (own dept class)', r.status === 200, `${r.status}`);

  // ── 4. Department Admin: cross-scope reads must be denied ──
  r = await req('GET', '/schools/4/departments', da);
  check('DeptAdmin GET /schools/4/departments → 403 (other school)', r.status === 403, `${r.status}`);

  r = await req('GET', '/departments/9/branches', da);
  check('DeptAdmin GET /departments/9/branches → 403 (other dept)', r.status === 403, `${r.status}`);

  // ── 5. Teacher (no assignment): course access denied ──
  r = await req('GET', '/courses/1', teacher);
  check('Teacher GET /courses/1 → 403 (not owner/assigned)', r.status === 403, `${r.status}`);

  r = await req('GET', '/courses/1/marks', teacher);
  check('Teacher GET /courses/1/marks → 403 (not owner/assigned)', r.status === 403, `${r.status}`);

  r = await req('POST', '/courses/1/marks', teacher, { examType: 'MTT', entryMode: 'co', students: [] });
  check('Teacher POST /courses/1/marks → 403 (not owner/assigned)', r.status === 403, `${r.status}`);

  // ── 6. Student IDOR: unassigned teacher cannot read arbitrary students ──
  r = await req('GET', '/students/1', teacher);
  check('Teacher GET /students/1 → 403 (student not in their courses)', r.status === 403, `${r.status}`);

  r = await req('GET', '/students/1', admin);
  check('Admin GET /students/1 → 200 (any student)', r.status === 200, `${r.status}`);

  // ── 7. Viewer: POST must be forbidden ──
  const viewer = await login('phase7-smoke-viewer@test.local', 'Phase7SmokeTest1');
  r = await req('POST', '/courses', viewer, { school: 'X', department: 'Y', subjectName: 'Z', courseCode: 'C', semester: 1, academicYear: '2025' });
  check('Viewer POST /courses → 403', r.status === 403, `${r.status}`);

  r = await req('PUT', '/schools/1', viewer, { name: 'Hacked' });
  check('Viewer PUT /schools/1 → 403', r.status === 403, `${r.status}`);

  console.log(`\n=== Cross-Scope/IDOR Results: Pass ${pass}, Fail ${fail} ===`);
})();