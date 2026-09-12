const http = require('http');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const base = 'http://localhost:5000';

function req(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request(base + path, {
      method,
      headers: { ...headers, ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* keep null */ }
        resolve({ status: res.statusCode, json, raw: data.slice(0, 500), headers: res.headers });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

let token = '';
const results = [];
let failed = 0;
const check = (label, condition, detail = '') => {
  results.push({ label, status: condition ? 'PASS' : 'FAIL', detail });
  if (!condition) failed += 1;
};

(async () => {
  // Ensure the test admin user exists (self-contained)
  const pool = require('./config/db');
  const hash = bcrypt.hashSync('test123', 10);
  await pool.query(
    "INSERT INTO teachers (name, email, password, role, is_active) VALUES ('APITest','apitest@ctuniversity.in',?, 'Admin', 1) ON DUPLICATE KEY UPDATE role='Admin', is_active=1, password=VALUES(password)",
    [hash],
  );

  // 1. Login
  const login = await req('POST', '/api/auth/login', { body: { email: 'apitest@ctuniversity.in', password: 'test123' } });
  check('Login (admin)', login.status === 200 && login.json?.success, JSON.stringify(login.json).slice(0, 150));
  token = login.json?.data?.token || login.json?.token || '';

  // 2. Unauthenticated access should fail
  const noAuth = await req('GET', '/api/courses');
  check('Unauthenticated /courses → 401', noAuth.status === 401, `status=${noAuth.status}`);

  // 3. Fetch courses (scoped list)
  const courses = await req('GET', '/api/courses', { token });
  check('GET /api/courses', courses.status === 200 && courses.json?.success, `status=${courses.status} count=${courses.json?.data?.length}`);

  // 4. Fetch config for course 1 (existing course from earlier test data cleanup may or may not exist)
  const cfg = await req('GET', '/api/courses/1/config', { token });
  check('GET /api/courses/1/config', cfg.status === 200 || cfg.status === 404, `status=${cfg.status}`);

  if (cfg.status === 200) {
    const courseOutcomes = cfg.json?.data?.outcomes || [];
    check('Config returns outcomes', courseOutcomes.length > 0, `outcomes=${courseOutcomes.length}`);

    // 5. Fetch marks
    const marks = await req('GET', '/api/courses/1/marks', { token });
    check('GET /api/courses/1/marks', marks.status === 200 && marks.json?.success, `status=${marks.status}`);

    // 6. Fetch attainment
    const att = await req('GET', '/api/courses/1/attainment', { token });
    check('GET /api/courses/1/attainment', att.status === 200 && att.json?.success, `status=${att.status}`);
    check('Attainment has data shape', att.json?.data && typeof att.json.data.overallCourseAttainment === 'number', `overall=${att.json?.data?.overallCourseAttainment}`);

    // 7. CO-PO mapping
    const mapping = await req('GET', '/api/courses/1/mapping', { token });
    check('GET /api/courses/1/mapping', mapping.status === 200 && mapping.json?.success, `status=${mapping.status}`);

    // 8. Question config
    const qs = await req('GET', '/api/courses/1/questions?examType=MTT', { token });
    check('GET /api/courses/1/questions', qs.status === 200 && qs.json?.success, `status=${qs.status}`);

    // 9. Marks save (UPSERT path) — save one student, verify other students preserved
    const coIds = courseOutcomes.map((c) => c.id);
    const saveBody = {
      examType: 'MTT',
      entryMode: 'co',
      students: [{
        name: 'API Test Student',
        roll: 'APITEST001',
        coMarks: Object.fromEntries(coIds.map((cid, i) => [cid, i === 0 ? 8 : 5])),
      }],
    };
    const saveRes = await req('POST', '/api/courses/1/marks', { token, body: saveBody });
    check('POST /api/courses/1/marks (create student)', saveRes.status === 200 && saveRes.json?.success, `status=${saveRes.status} ${saveRes.raw}`);

    // Save again with only one changed CO (blank others) — must preserve previous values
    const save2 = await req('POST', '/api/courses/1/marks', {
      token,
      body: {
        examType: 'MTT',
        entryMode: 'co',
        students: [{
          name: 'API Test Student',
          roll: 'APITEST001',
          coMarks: Object.fromEntries(coIds.map((cid, i) => [cid, i === 0 ? 10 : ''])),
        }],
      },
    });
    check('POST marks (update partial, blanks preserved)', save2.status === 200 && save2.json?.success, `status=${save2.status}`);

    const marksAfter = await req('GET', '/api/courses/1/marks', { token });
    const mtt = marksAfter.json?.data?.mtt || [];
    const testStudent = mtt.find((s) => String(s.reg_no) === 'APITEST001');
    check('Student still exists after partial save', Boolean(testStudent), JSON.stringify(testStudent));
    if (testStudent) {
      const firstCo = coIds[0];
      check('First CO updated to 10', testStudent.coMarks[firstCo] === 10, `got ${testStudent.coMarks[firstCo]}`);
      const secondCo = coIds[1];
      check('Second CO preserved at 5', testStudent.coMarks[secondCo] === 5, `got ${testStudent.coMarks[secondCo]}`);
    }

    // 10. Excel template download (MTT)
    const tpl = await req('GET', '/api/courses/1/marks-template?examType=MTT', { token });
    const tplBytes = Buffer.byteLength(tpl.raw, 'utf8');
    check('GET marks-template returns xlsx', tpl.status === 200 && tpl.headers['content-type']?.includes('spreadsheet'), `status=${tpl.status} type=${tpl.headers['content-type']} size=${tplBytes}`);

    // 11. Excel export (full report)
    const exp = await req('GET', '/api/courses/1/export-excel', { token });
    check('GET export-excel returns xlsx', exp.status === 200 && exp.headers['content-type']?.includes('spreadsheet'), `status=${exp.status} type=${exp.headers['content-type']}`);

    // 12. JSON export
    const jexp = await req('GET', '/api/courses/1/export-json', { token });
    check('GET export-json', jexp.status === 200 && jexp.json?.success, `status=${jexp.status}`);

    // 13. Enrollments
    const enroll = await req('GET', '/api/courses/1/enrollment', { token });
    check('GET enrollment', enroll.status === 200 && enroll.json?.success, `status=${enroll.status}`);

    // 14. Cleanup test student
    await req('DELETE', `/api/courses/1/marks`, { token }); // no-op, just to avoid dangling
    // remove via direct approach — DELETE endpoint doesn't exist; use DB cleanup in a later step
  }

  // 15. Program OBE dashboard (use a program id if available)
  const programs = await req('GET', '/api/programs', { token });
  if (programs.status === 200 && programs.json?.data?.length) {
    const pid = programs.json.data[0].id;
    const obe = await req('GET', `/api/programs/${pid}/obe/dashboard`, { token });
    check('Program OBE dashboard', obe.status === 200 && obe.json?.success, `status=${obe.status}`);
    const att2 = await req('GET', `/api/programs/${pid}/obe/co-attainment`, { token });
    check('Program CO attainment', att2.status === 200 && att2.json?.success, `status=${att2.status}`);
    const report = await req('GET', `/api/programs/${pid}/obe/report?format=json`, { token });
    check('OBE report (json)', report.status === 200 && report.json?.success, `status=${report.status}`);
  } else {
    check('Program OBE dashboard (no programs, skip)', true, 'no programs found');
  }

  // 16. Excel import preview (invalid row → preview reports error, no crash)
  const badImport = await req('POST', '/api/courses/1/marks/import-preview', {
    token,
    body: { examType: 'MTT', rows: [{ regNo: 'NOTINENROLLED', name: 'X', coMarks: {} }] },
  });
  check('Import preview flags unknown student', badImport.status === 200 && badImport.json?.data?.errorCount > 0, `status=${badImport.status} errors=${badImport.json?.data?.errorCount}`);

  // 17. Logout / auth validation
  const badToken = await req('GET', '/api/courses', { token: 'invalid.token.here' });
  check('Invalid token → 401', badToken.status === 401, `status=${badToken.status}`);

  // Summary
  console.log('=== API REGRESSION TEST RESULTS ===');
  results.forEach((r) => {
    console.log(`  ${r.status === 'PASS' ? '✓' : '✗'} ${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
  });
  console.log(`\nPassed: ${results.length - failed}, Failed: ${failed}`);
  console.log(failed === 0 ? 'ALL API TESTS PASSED' : 'SOME API TESTS FAILED');

  // Cleanup test user and test student
  try { await pool.query("DELETE FROM teachers WHERE email='apitest@ctuniversity.in'"); } catch { /* ignore */ }
  try { await pool.query("DELETE FROM student_marks WHERE reg_no IN ('APITEST001') AND course_id=1"); } catch { /* ignore */ }
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });