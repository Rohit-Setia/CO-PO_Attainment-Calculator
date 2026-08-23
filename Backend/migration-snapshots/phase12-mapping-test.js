// Phase 12 — CO-PO Articulation Matrix round-trip test.
// Usage: node migration-snapshots/phase12-mapping-test.js
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

  // Snapshot existing mappings for regression restore
  const [before] = await db.query('SELECT * FROM co_po_values WHERE co_id IN (SELECT id FROM course_outcomes WHERE course_id = 17)');
  const [beforeCourses] = await db.query('SELECT co_id, po1, po2, po3 FROM co_po_values WHERE co_id IN (SELECT id FROM course_outcomes WHERE course_id IN (1,2))');

  // ── 1. GET mapping for real BBA course (17) — real co_ids, 5 CO rows ──
  const m1 = await req('GET', '/courses/17/mapping', token);
  const m1Data = JSON.parse(m1.body).data;
  check('GET mapping → 200', m1.status === 200, `${m1.status}`);
  check('5 CO rows (CO1-CO5) returned', m1Data.values.length === 5, `len=${m1Data.values.length}`);
  check('Every row has a real co_id', m1Data.values.every((v) => v.co_id), `co_ids=${m1Data.values.map(v => v.co_id).join(',')}`);
  check('Rows include po1..po12 + pso1..pso3 keys', Object.keys(m1Data.values[0]).filter(k => /^po\d+$|^pso\d+$/.test(k)).length === 15,
    `cols=${Object.keys(m1Data.values[0]).filter(k => /^po\d+$|^pso\d+$/.test(k)).join(',')}`);

  // ── 2. Save mappings: CO1→PO1=3, PO2=2; CO2→PO1=1; CO3→PSO1=3 ──
  const [coRows] = await db.query('SELECT id, co_number FROM course_outcomes WHERE course_id = 17 AND is_active = 1 ORDER BY co_number');
  const byNumber = new Map(coRows.map((r) => [r.co_number, r.id]));
  const payload = {
    values: [
      { co_id: byNumber.get(1), po1: 3, po2: 2 },
      { co_id: byNumber.get(2), po1: 1 },
      { co_id: byNumber.get(3), pso1: 3 },
    ],
  };
  const sv = await req('POST', '/courses/17/mapping', token, payload);
  check('POST save mappings → 200', sv.status === 200, `${sv.status} ${sv.body.slice(0, 150)}`);

  // ── 3. Reload — values persist ──
  const m2 = await req('GET', '/courses/17/mapping', token);
  const m2Data = JSON.parse(m2.body).data;
  const row1 = m2Data.values.find((v) => v.co_id === byNumber.get(1));
  const row2 = m2Data.values.find((v) => v.co_id === byNumber.get(2));
  const row3 = m2Data.values.find((v) => v.co_id === byNumber.get(3));
  check('Saved mappings survive reload (CO1→PO1=3, PO2=2)', row1.po1 === 3 && row1.po2 === 2, `po1=${row1.po1} po2=${row1.po2}`);
  check('CO2→PO1=1 persists', row2.po1 === 1, `po1=${row2.po1}`);
  check('CO3→PSO1=3 persists', row3.pso1 === 3, `pso1=${row3.pso1}`);
  check('Unmapped cells stay 0', row1.po3 === 0 && row2.po2 === 0, `po3=${row1.po3} po2=${row2.po2}`);

  // ── 4. Averages computed correctly (ignore 0/unmapped) ──
  check('avg_po1 = (3+1)/2 = 2.00', m2Data.averages.avg_po1 === 2, `got ${m2Data.averages.avg_po1}`);
  check('avg_po2 = 2.00', m2Data.averages.avg_po2 === 2, `got ${m2Data.averages.avg_po2}`);
  check('avg_po3 = 0 (all unmapped)', m2Data.averages.avg_po3 === 0, `got ${m2Data.averages.avg_po3}`);
  check('avg_pso1 = 3.00', m2Data.averages.avg_pso1 === 3, `got ${m2Data.averages.avg_pso1}`);

  // ── 5. Database rows actually written ──
  const [dbRows] = await db.query('SELECT po1, po2, pso1 FROM co_po_values WHERE co_id = ?', [byNumber.get(1)]);
  check('DB row CO1: po1=3, po2=2', dbRows[0].po1 === 3 && dbRows[0].po2 === 2, JSON.stringify(dbRows[0]));

  // ── 6. Existing courses 1 & 2 mappings unaffected (regression) ──
  const [afterCourses] = await db.query('SELECT co_id, po1, po2, po3 FROM co_po_values WHERE co_id IN (SELECT id FROM course_outcomes WHERE course_id IN (1,2))');
  check('Existing course mappings unchanged', JSON.stringify(afterCourses) === JSON.stringify(beforeCourses),
    `before=${JSON.stringify(beforeCourses).slice(0, 120)} after=${JSON.stringify(afterCourses).slice(0, 120)}`);

  // ── 7. Attainment regression unchanged ──
  const att1 = await req('GET', '/courses/1/attainment', token);
  const att2 = await req('GET', '/courses/2/attainment', token);
  check('Course 1 attainment unchanged (2.22)', JSON.parse(att1.body).data.overallCourseAttainment === 2.22, `got ${JSON.parse(att1.body).data.overallCourseAttainment}`);
  check('Course 2 attainment unchanged (2.5)', JSON.parse(att2.body).data.overallCourseAttainment === 2.5, `got ${JSON.parse(att2.body).data.overallCourseAttainment}`);

  // ── 8. Save empty values (all zeros) → clean state ──
  const zeroPayload = { values: coRows.map((r) => ({ co_id: r.id, po1: 0, po2: 0, po3: 0, po4: 0, po5: 0, po6: 0, po7: 0, po8: 0, po9: 0, po10: 0, po11: 0, po12: 0, pso1: 0, pso2: 0, pso3: 0 })) };
  await req('POST', '/courses/17/mapping', token, zeroPayload);
  const m3 = await req('GET', '/courses/17/mapping', token);
  const m3Data = JSON.parse(m3.body).data;
  check('Reset to zeros → all 0, co_ids still real', m3Data.values.every((v) => v.co_id && v.po1 === 0 && v.pso1 === 0), `co_ids=${m3Data.values.map(v => v.co_id).join(',')}`);
  check('Averages reset to 0', m3Data.averages.avg_po1 === 0 && m3Data.averages.avg_pso1 === 0, `avg_po1=${m3Data.averages.avg_po1}`);

  // ── 9. Restore original mapping state for course 17 ──
  if (before.length > 0) {
    for (const row of before) {
      const cols = Object.keys(row).filter((k) => /^po\d+$|^pso\d+$/.test(k));
      await db.query(
        `INSERT INTO co_po_values (co_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${cols.map((k) => `${k} = VALUES(${k})`).join(', ')}`,
        [row.co_id, ...cols.map((k) => row[k])],
      );
    }
    console.log('  (course 17 mappings restored to prior state)');
  }

  await db.end();
  console.log(`\n=== Phase 12 Mapping Matrix: Pass ${pass}, Fail ${fail} ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR:', e.message); process.exit(1); });