// Phase 8 duplicate-protection test — run: node migration-snapshots/phase8-duplicate-test.js
const http = require('http');
const PORT = process.env.PORT || 5000;

function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      { host: 'localhost', port: PORT, path: `/api${path}`, method,
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
  const l = await req('POST', '/auth/login', null, { email: 'phase7-smoke-admin@test.local', password: 'Phase7SmokeTest1' });
  if (l.status !== 200) { console.error('login failed:', l.status); process.exit(1); }
  const token = JSON.parse(l.body).data.token;

  // ── 1. Enroll the same student twice → no duplicate enrollment ──
  const enr = await req('GET', '/courses/2/enrollment', token);
  const students = JSON.parse(enr.body).data.students;
  const sid = students[0].id;
  const e1 = await req('POST', '/courses/2/enrollment', token, { studentIds: [sid] });
  const e2 = await req('POST', '/courses/2/enrollment', token, { studentIds: [sid] });
  const enr2 = await req('GET', '/courses/2/enrollment', token);
  const afterCount = JSON.parse(enr2.body).data.students.filter(s => s.id === sid).length;
  check('Enroll same student twice → 1 membership (no dup)', e1.status === 200 && e2.status === 200 && afterCount === 1, `count=${afterCount}`);

  // ── 2. Add same student to class twice → no duplicate membership ──
  const classStudents = await req('GET', '/classes/1/students', token);
  const roster = JSON.parse(classStudents.body).data;
  const csid = roster[0].id;
  const c1 = await req('POST', '/classes/1/students', token, { studentIds: [csid] });
  const c2 = await req('POST', '/classes/1/students', token, { studentIds: [csid] });
  const roster2 = await req('GET', '/classes/1/students', token);
  const rosterAfter = JSON.parse(roster2.body).data.filter(s => s.id === csid).length;
  check('Add same student to class twice → 1 membership (no dup)', c1.status === 200 && c2.status === 200 && rosterAfter === 1, `count=${rosterAfter}`);

  // ── 3. Create same registration number → rejected ──
  const reg = `P8DUP${Date.now() % 100000}`;
  const s1 = await req('POST', '/students', token, { registrationNumber: reg, name: 'Dup Test 1' });
  const s2 = await req('POST', '/students', token, { registrationNumber: reg, name: 'Dup Test 2' });
  check('Create same reg no twice → 201 then 409', s1.status === 201 && s2.status === 409, `${s1.status} then ${s2.status}`);

  // ── 4. Upload same Excel twice → no duplicate marks (upsert path) ──
  const outRes = await req('GET', '/courses/2/outcomes', token);
  const outcomes = JSON.parse(outRes.body).data;
  const firstCo = outcomes.find(o => o.co_number === 1);
  // Use ALL enrolled students so the missing-student guard does not block the import
  const rows = students.map((s, i) => ({ rowNumber: i + 2, regNo: s.registration_number, name: s.name, coMarks: { [firstCo.id]: 6 } }));
  const u1 = await req('POST', '/courses/2/marks/import', token, { examType: 'MTT', rows });
  const u2 = await req('POST', '/courses/2/marks/import', token, { examType: 'MTT', rows });
  const marks = await req('GET', '/courses/2/marks', token);
  const mttRows = JSON.parse(marks.body).data.mtt.filter(m => m.reg_no === students[1].registration_number);
  check('Upload same marks twice → single row', u1.status === 200 && u2.status === 200 && mttRows.length === 1, `u1=${u1.status} u2=${u2.status} rows=${mttRows.length}`);

  // ── 5. Clean up: remove the duplicate-test student created above ──
  const studList = await req('GET', '/students?search=' + reg, token);
  const created = (JSON.parse(studList.body).data || []).find(s => s.registration_number === reg);
  if (created) {
    // There is no hard DELETE student route; leave it marked Inactive instead.
    await req('PUT', `/students/${created.id}`, token, { status: 'Inactive' });
    console.log('  (test student marked Inactive for cleanup)');
  }

  // Restore the CO1 marks of ALL students back to snapshot values (post-phase2 snapshot)
  const snap = require('fs').readFileSync('migration-snapshots/post-phase2-snapshot.json', 'utf8');
  const snapRows = JSON.parse(snap).student_marks.rows.filter(r => r.course_id === 2 && r.exam_type === 'MTT');
  const snapByReg = {};
  snapRows.forEach(r => { snapByReg[r.reg_no] = parseFloat(r.co1); });
  const restoreRows = students.map((s, i) => ({
    rowNumber: i + 2, regNo: s.registration_number, name: s.name,
    coMarks: { [firstCo.id]: snapByReg[s.registration_number] ?? 7 },
  }));
  await req('POST', '/courses/2/marks/import', token, { examType: 'MTT', rows: restoreRows });

  console.log(`\n=== Duplicate Protection: Pass ${pass}, Fail ${fail} ===`);
})();