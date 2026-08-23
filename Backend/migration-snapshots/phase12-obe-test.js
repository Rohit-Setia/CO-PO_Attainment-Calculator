// Phase 12 — Program Outcome Management (OBE) acceptance tests.
// Usage: node migration-snapshots/phase12-obe-test.js
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
  const teacherToken = jwt.sign({ id: 7, role: 'Teacher' }, process.env.JWT_SECRET, { expiresIn: '30m' });
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });

  // ── 1. Every program has seeded PO/PSO definitions (generic, not hardcoded to one program) ──
  const [programs] = await db.query('SELECT id FROM programs');
  let allSeeded = true;
  for (const p of programs) {
    const [[poCount]] = await db.query("SELECT COUNT(*) AS c FROM program_outcomes WHERE program_id = ? AND type = 'PO'", [p.id]);
    const [[psoCount]] = await db.query("SELECT COUNT(*) AS c FROM program_outcomes WHERE program_id = ? AND type = 'PSO'", [p.id]);
    if (poCount < 1 || psoCount < 1) allSeeded = false;
  }
  check(`All ${programs.length} programs have seeded PO/PSO definitions`, allSeeded, '');

  // ── 2. GET /programs/:id/outcomes — BBA (program 3) ──
  const poRes = await req('GET', '/programs/3/outcomes?type=PO', token);
  check('GET BBA POs → 200 with 12 rows', poRes.status === 200 && JSON.parse(poRes.body).data.length === 12, `${poRes.status} len=${JSON.parse(poRes.body).data.length}`);
  const psoRes = await req('GET', '/programs/3/outcomes?type=PSO', token);
  check('GET BBA PSOs → 3 rows', psoRes.status === 200 && JSON.parse(psoRes.body).data.length === 3, `${psoRes.status}`);
  const peoRes = await req('GET', '/programs/3/outcomes?type=PEO', token);
  check('GET BBA PEOs → 200 (0 seeded initially)', peoRes.status === 200, `${peoRes.status}`);

  // ── 3. Different programs can have different PO definitions ──
  const bbaPo1 = JSON.parse(poRes.body).data[0];
  const csePo1Res = await req('GET', '/programs/1/outcomes?type=PO', token);
  const csePo1 = JSON.parse(csePo1Res.body).data[0];
  check('BBA and B.Tech are separate outcome rows (different program_id)', bbaPo1.program_id === 3 && csePo1.program_id === 1,
    `bba=${bbaPo1.program_id} cse=${csePo1.program_id}`);

  // ── 4. Update PO1 description for BBA (program-specific, no effect on other programs) ──
  const upd = await req('PUT', `/programs/3/outcomes/${bbaPo1.id}`, token, {
    title: 'Apply knowledge of management fundamentals',
    description: 'Students will demonstrate foundational management knowledge and skills.',
  });
  check('PUT update PO1 title+description → 200', upd.status === 200, `${upd.status} ${upd.body.slice(0, 120)}`);
  const poAfter = await req('GET', '/programs/3/outcomes?type=PO', token);
  const updatedBba = JSON.parse(poAfter.body).data.find((o) => o.id === bbaPo1.id);
  check('Updated title persists', updatedBba.title === 'Apply knowledge of management fundamentals', `got ${updatedBba.title}`);
  const cseAfter = await req('GET', '/programs/1/outcomes?type=PO', token);
  const csePo1After = JSON.parse(cseAfter.body).data[0];
  check('B.Tech PO1 untouched (still no title)', !csePo1After.title, `got ${csePo1After.title}`);

  // ── 5. Add a PEO for BBA ──
  const addPeo = await req('POST', '/programs/3/outcomes', token, {
    type: 'PEO', code: 'PEO1', title: 'Successful professional career', description: 'Graduates pursue successful professional careers.',
  });
  check('POST PEO1 → 201', addPeo.status === 201, `${addPeo.status} ${addPeo.body.slice(0, 120)}`);
  const peoAfter = await req('GET', '/programs/3/outcomes?type=PEO', token);
  check('PEO1 listed', JSON.parse(peoAfter.body).data.some((o) => o.code === 'PEO1' && o.title === 'Successful professional career'), JSON.stringify(JSON.parse(peoAfter.body).data));

  // ── 6. Duplicate outcome code rejected ──
  const dup = await req('POST', '/programs/3/outcomes', token, { type: 'PO', code: 'PO1' });
  check('Duplicate PO1 → 409', dup.status === 409, `${dup.status} ${dup.body.slice(0, 100)}`);

  // ── 7. Teacher cannot modify program outcomes (permission boundary) ──
  const tUpd = await req('PUT', `/programs/3/outcomes/${bbaPo1.id}`, teacherToken, { title: 'Hacked' });
  check('Teacher PUT program outcome → 403', tUpd.status === 403, `${tUpd.status}`);
  const tAdd = await req('POST', '/programs/3/outcomes', teacherToken, { type: 'PO', code: 'PO99' });
  check('Teacher POST program outcome → 403', tAdd.status === 403, `${tAdd.status}`);
  const tGet = await req('GET', '/programs/3/outcomes?type=PO', teacherToken);
  check('Teacher can READ program outcomes (view-only)', tGet.status === 200, `${tGet.status}`);

  // ── 8. Deactivate an outcome → hidden from course context, stored data intact ──
  const bbaPo2 = JSON.parse(poAfter.body).data.find((o) => o.code === 'PO2');
  const deact2 = await req('PUT', `/programs/3/outcomes/${bbaPo2.id}`, token, { isActive: false });
  check('Deactivate BBA PO2 → 200', deact2.status === 200, `${deact2.status}`);
  const poFinal = await req('GET', '/programs/3/outcomes?type=PO', token);
  const po2Final = JSON.parse(poFinal.body).data.find((o) => o.id === bbaPo2.id);
  check('PO2 is_active = 0', po2Final.is_active === 0, `is_active=${po2Final.is_active}`);
  // re-activate for cleanliness
  await req('PUT', `/programs/3/outcomes/${bbaPo2.id}`, token, { isActive: true });

  // ── 9. Mapping endpoint carries programOutcomes for the course's program ──
  const m = await req('GET', '/courses/17/mapping', token);
  const mData = JSON.parse(m.body).data;
  check('Mapping response includes programOutcomes', Boolean(mData.programOutcomes), JSON.stringify(Object.keys(mData.programOutcomes || {})));
  check('programOutcomes.PO has 12 entries (BBA)', mData.programOutcomes?.PO?.length === 12, `len=${mData.programOutcomes?.PO?.length}`);
  check('programOutcomes.PSO has 3 entries', mData.programOutcomes?.PSO?.length === 3, `len=${mData.programOutcomes?.PSO?.length}`);
  check('Program PO1 title flows to course context', mData.programOutcomes?.PO?.[0]?.title === 'Apply knowledge of management fundamentals', `got ${mData.programOutcomes?.PO?.[0]?.title}`);

  // ── 10. Mapping round-trip still works (save + reload + persistence) ──
  const [coRows] = await db.query('SELECT id, co_number FROM course_outcomes WHERE course_id = 17 AND is_active = 1 ORDER BY co_number');
  const byNumber = new Map(coRows.map((r) => [r.co_number, r.id]));
  const payload = { values: [{ co_id: byNumber.get(1), po1: 3, po2: 2 }] };
  const sv = await req('POST', '/courses/17/mapping', token, payload);
  check('POST course mapping → 200', sv.status === 200, `${sv.status}`);
  const m2 = await req('GET', '/courses/17/mapping', token);
  const row1 = JSON.parse(m2.body).data.values.find((v) => v.co_id === byNumber.get(1));
  check('Mapping persists (CO1→PO1=3)', row1.po1 === 3 && row1.po2 === 2, `po1=${row1.po1} po2=${row1.po2}`);
  // clean up the test mapping
  await db.query(`INSERT INTO co_po_values (co_id, po1, po2) VALUES (?, 0, 0) ON DUPLICATE KEY UPDATE po1 = 0, po2 = 0`, [byNumber.get(1)]);
  await db.query('DELETE FROM co_po_values WHERE co_id = ? AND po1 = 0 AND po2 = 0 AND po3 = 0 AND po4 = 0 AND po5 = 0 AND po6 = 0 AND po7 = 0 AND po8 = 0 AND po9 = 0 AND po10 = 0 AND po11 = 0 AND po12 = 0 AND pso1 = 0 AND pso2 = 0 AND pso3 = 0', [byNumber.get(1)]);

  // ── 11. Attainment regression ──
  const a1 = await req('GET', '/courses/1/attainment', token);
  const a2 = await req('GET', '/courses/2/attainment', token);
  check('Course 1 attainment unchanged (2.22)', JSON.parse(a1.body).data.overallCourseAttainment === 2.22, `got ${JSON.parse(a1.body).data.overallCourseAttainment}`);
  check('Course 2 attainment unchanged (2.5)', JSON.parse(a2.body).data.overallCourseAttainment === 2.5, `got ${JSON.parse(a2.body).data.overallCourseAttainment}`);

  // ── 12. Cleanup: remove test PEO, restore PO1 title/description, remove PO1/P02 zero rows ──
  await db.query("DELETE FROM program_outcomes WHERE program_id = 3 AND type = 'PEO' AND code = 'PEO1'");
  await db.query('UPDATE program_outcomes SET title = NULL, description = NULL WHERE id = ?', [bbaPo1.id]);
  const [peoLeft] = await db.query("SELECT COUNT(*) AS c FROM program_outcomes WHERE program_id = 3 AND type = 'PEO'");
  check('Cleanup: test PEO removed', Number(peoLeft[0].c) === 0, `c=${peoLeft[0].c}`);
  const [po1Check] = await db.query('SELECT title, description FROM program_outcomes WHERE id = ?', [bbaPo1.id]);
  check('Cleanup: PO1 title/description restored to null', po1Check[0].title === null && po1Check[0].description === null, JSON.stringify(po1Check[0]));

  await db.end();
  console.log(`\n=== Phase 12 OBE: Pass ${pass}, Fail ${fail} ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR:', e.message); process.exit(1); });