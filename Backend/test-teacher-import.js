// Phase 1 regression test — Teacher bulk import + credential email + password setup.
// Run while the backend is listening on :5000 (starts its own data, cleans up after).
// Optional: set TEACHER_IMPORT_LOG=<server stdout file> to also test the
// password-setup confirm flow using the token from the simulated email.
const http = require('http');
require('dotenv').config();
const ExcelJS = require('exceljs');
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
        try { json = JSON.parse(data); } catch { /* binary */ }
        resolve({ status: res.statusCode, json, raw: data, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

async function uploadWorkbook(token, buffer, filename) {
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  const res = await fetch(`${base}/api/admin/teachers/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

let failed = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed += 1; };

(async () => {
  const stamp = Date.now().toString().slice(-6);
  const emails = [
    `import.a.${stamp}@test.local`,
    `import.b.${stamp}@test.local`,
    `import.c.${stamp}@test.local`,
  ];

  // 0. Ensure the test admin exists (self-contained, same pattern as test-api-regression.js)
  const bcrypt = require('bcryptjs');
  const pool0 = require('./config/db');
  const adminHash = bcrypt.hashSync('test123', 10);
  await pool0.query(
    "INSERT INTO teachers (name, email, password, role, is_active) VALUES ('ImportTest Admin', 'importtest-admin@ctuniversity.in', ?, 'Admin', 1) ON DUPLICATE KEY UPDATE role='Admin', is_active=1, password=VALUES(password)",
    [adminHash],
  );

  // 1. Admin login
  const login = await req('POST', '/api/auth/login', { body: { email: 'importtest-admin@ctuniversity.in', password: 'test123' } });
  const token = login.json?.data?.token || '';
  check('Admin login', login.status === 200 && token, `status=${login.status}`);

  // 2. Download the import template
  const tpl = await new Promise((resolve, reject) => {
    const r = http.request(`${base}/api/admin/teachers/import/template`, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], size: Buffer.concat(chunks).length }));
    });
    r.on('error', reject); r.end();
  });
  check('Import template downloads as xlsx', tpl.status === 200 && tpl.type.includes('spreadsheetml') && tpl.size > 500, `size=${tpl.size}`);

  // 3. Build a test import workbook: 3 valid, 1 duplicate-in-file, 1 invalid email,
  //    1 unknown-department, 1 DB-existing email (re-run categorization)
  const pool = require('./config/db');
  const [deptRows] = await pool.query('SELECT id, name FROM departments LIMIT 1');
  const deptName = deptRows.length ? deptRows[0].name : '';
  const [preExisting] = await pool.query("SELECT email FROM teachers WHERE role='Teacher' LIMIT 1");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Teachers');
  ws.addRow(['Employee ID', 'Teacher Name', 'Email', 'Department', 'Designation', 'Phone', 'Username']);
  ws.addRow([`EMP-${stamp}-A`, 'Import Test A', emails[0], deptName, 'Professor', '9000000001', '']);
  ws.addRow([`EMP-${stamp}-B`, 'Import Test B', emails[1], 'NoSuchDept', 'Lecturer', '9000000002', '']);
  ws.addRow([`EMP-${stamp}-C`, 'Import Test C', emails[2], deptName, '', '', '']);
  ws.addRow([`EMP-${stamp}-A`, 'Import Duplicate In File', emails[1], deptName, '', '', '']);
  ws.addRow([`EMP-${stamp}-X`, 'Import Invalid Email', 'not-an-email', deptName, '', '', '']);
  if (preExisting.length) {
    ws.addRow([`EMP-${stamp}-D`, 'Import Existing', preExisting[0].email, deptName, '', '', '']);
  }
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  // 4. Upload the import
  // Expected: created = A + C (2); invalid = B (unknown dept) + bad email (2);
  // duplicate-in-file = 1; DB-existing email = 1 (when a Teacher exists).
  const imp = await uploadWorkbook(token, buffer, `teachers-${stamp}.xlsx`);
  const s = imp.json?.data?.summary || {};
  check('Import accepted', imp.status === 200 && imp.json?.success, JSON.stringify(imp.json).slice(0, 200));
  check('2 teachers created', s.created === 2, `created=${s.created}`);
  check('Invalid rows rejected with reasons', s.invalid === 2 && (s.errors || []).some((e) => /not a valid email/i.test(e.reason || '')), `invalid=${s.invalid}`);
  check('In-file duplicate rejected', s.duplicate === 1, `duplicate=${s.duplicate}`);
  check('Unknown department rejected', (s.errors || []).some((e) => /department .* was not found/i.test(e.reason || '')), '');
  if (preExisting.length) check('DB-existing email categorized', s.alreadyExisting === 1, `alreadyExisting=${s.alreadyExisting}`);
  check('Emails dispatched (log-only mode)', imp.json?.data?.emails?.queued === 2 && imp.json?.data?.emails?.simulated === 2, JSON.stringify(imp.json?.data?.emails));
  // 5. Directory listing shows the created teachers with forced password change
  const list = await req('GET', `/api/admin/teachers?search=Import+Test&limit=50`, { token });
  const rows = list.json?.data?.rows || [];
  const a = rows.find((r) => r.email === emails[0]);
  check('Created teacher listed', list.status === 200 && rows.length >= 2, `count=${rows.length}`);
  check('Teacher fields populated', a && a.role === 'Teacher' && a.is_active === 1 && a.username && a.must_change_password === 1, JSON.stringify(a && { u: a.username, mcp: a.must_change_password }));
  check('Department resolved', a && (deptName === '' || a.department_name === deptName), a ? `dept=${a.department_name}` : '');

  // 6. Password-setup request (public, generic response)
  const setupReq = await req('POST', '/api/auth/password-setup/request', { body: { email: emails[0] } });
  check('Password-setup request OK', setupReq.status === 200 && /link has been sent/.test(setupReq.json?.message || ''), '');

  // 7. Extract the setup token from the simulated email (server stdout log) and confirm
  let tokenFromLog = null;
  if (process.env.TEACHER_IMPORT_LOG) {
    const fs = require('fs');
    const logText = fs.readFileSync(process.env.TEACHER_IMPORT_LOG, 'utf8');
    const matches = [...logText.matchAll(/set-password\?token=([A-Za-z0-9_\-]+)/g)];
    tokenFromLog = matches.length ? matches[matches.length - 1][1] : null;
  }
  if (tokenFromLog) {
    const confirm = await req('POST', '/api/auth/password-setup/confirm', { body: { token: tokenFromLog, password: `NewPass1${stamp}` } });
    check('Password-setup confirm OK', confirm.status === 200 && confirm.json?.success, JSON.stringify(confirm.json).slice(0, 120));

    const teacherLogin = await req('POST', '/api/auth/login', { body: { email: emails[0], password: `NewPass1${stamp}` } });
    check('Teacher logs in with new password', teacherLogin.status === 200 && teacherLogin.json?.data?.user?.role === 'Teacher', `status=${teacherLogin.status}`);
    check('must_change_password cleared after setup', teacherLogin.json?.data?.mustChangePassword === false, `mcp=${teacherLogin.json?.data?.mustChangePassword}`);

    const reuse = await req('POST', '/api/auth/password-setup/confirm', { body: { token: tokenFromLog, password: 'Another1x' } });
    check('Token reuse rejected', reuse.status === 400 && /already been used/i.test(reuse.json?.message || ''), `status=${reuse.status}`);

    // 7b. RBAC: a Teacher cannot import other teachers
    const tToken = teacherLogin.json?.data?.token || '';
    const forbidden = await uploadWorkbook(tToken, buffer, 'nope.xlsx');
    check('Teacher cannot import (403)', forbidden.status === 403, `status=${forbidden.status}`);
  } else {
    check('Password-setup confirm (token extraction)', false, 'TEACHER_IMPORT_LOG not provided — confirm flow untested');
  }

  // 8. Re-import the same file → all previously created are alreadyExisting (idempotent)
  const imp2 = await uploadWorkbook(token, buffer, `teachers-${stamp}-again.xlsx`);
  const s2 = imp2.json?.data?.summary || {};
  check('Re-import is idempotent (no new creates)', imp2.status === 200 && s2.created === 0, `created=${s2.created}`);

  // 9. Error-file download
  const errFile = await new Promise((resolve, reject) => {
    const payload = JSON.stringify({ errors: (imp.json?.data?.summary?.errors || []) });
    const r = http.request(`${base}/api/admin/teachers/import/error-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], size: Buffer.concat(chunks).length }));
    });
    r.on('error', reject); r.write(payload); r.end();
  });
  check('Error workbook downloads', errFile.status === 200 && errFile.type.includes('spreadsheetml'), `size=${errFile.size}`);

  // 10. Cleanup
  await pool.query('DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM (SELECT id FROM teachers WHERE email LIKE ?) x)', [`%.${stamp}@test.local`]);
  await pool.query('DELETE FROM teachers WHERE email LIKE ?', [`%.${stamp}@test.local`]);
  console.log(failed === 0 ? '\nALL TEACHER-IMPORT TESTS PASSED' : `\nFAILED: ${failed}`);
  await pool.end();
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });