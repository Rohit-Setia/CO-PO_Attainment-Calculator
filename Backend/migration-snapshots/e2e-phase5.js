// Phase 5 E2E test — Marks Excel generation + import pipeline (run against a live backend).
// Usage: node migration-snapshots/e2e-phase5.js [baseUrl]
// Mints a test JWT from the server's own secret (test-only; never used in production flows).
require('dotenv').config();
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const http = require('http');

const base = (process.argv[2] || 'http://localhost:5050').replace(/\/$/, '');
const token = jwt.sign({ id: 1, role: 'Admin' }, process.env.JWT_SECRET, { expiresIn: '10m' });
const COURSE_ID = 2; // 3467 — SE, 25 enrolled students
const results = [];
let pass = 0, fail = 0;

function req(method, path, { body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const headers = { Authorization: `Bearer ${token}` };
    let payload = null;
    if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (raw) return resolve({ status: res.statusCode, buf, contentType: res.headers['content-type'] || '' });
        let json = null;
        try { json = JSON.parse(buf.toString('utf8')); } catch { /* noop */ }
        resolve({ status: res.statusCode, json });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function check(name, cond, detail = '') {
  results.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
  cond ? pass += 1 : fail += 1;
}

(async () => {
  // ── Test 1: Download marks template ──
  const dl = await req('GET', `/api/courses/${COURSE_ID}/marks-template?examType=MTT`, { raw: true });
  check('T1: template downloads', dl.status === 200 && dl.buf.length > 1000, `${dl.status}, ${dl.buf.length} bytes`);
  check('T2: xlsx content-type', dl.contentType.includes('spreadsheetml') || dl.contentType.includes('octet-stream'), dl.contentType);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(dl.buf);
  const ws = wb.getWorksheet('Marks Entry');
  check('T3: Marks Entry sheet exists', !!ws);

  // Locate header row & CO columns
  let headerRow = null; let regCol = -1; let nameCol = -1; const coCols = {};
  ws.eachRow((row, rn) => {
    const vals = row.values;
    const regIdx = vals.findIndex((v) => typeof v === 'string' && /registration/i.test(v));
    if (regIdx > 0 && !headerRow) {
      headerRow = rn; regCol = regIdx;
      nameCol = vals.findIndex((v) => typeof v === 'string' && /student name|name/i.test(v));
      vals.forEach((v, i) => {
        const m = typeof v === 'string' ? v.match(/^CO(\d+)/i) : null;
        if (m) coCols[i] = `CO${m[1]}`;
      });
    }
  });
  check('T4: header row with Registration No found', !!headerRow, `row ${headerRow}`);

  const students = [];
  ws.eachRow((row, rn) => {
    if (headerRow && rn > headerRow) {
      const reg = row.getCell(regCol).text;
      if (reg) students.push({ reg, name: row.getCell(nameCol).text, rowNumber: rn });
    }
  });
  check('T5: 25 enrolled students in template', students.length === 25, `found ${students.length}`);
  check('T6: CO columns generated from course config', Object.keys(coCols).length >= 5, JSON.stringify(Object.values(coCols)));
  check('T7: registration numbers match master format', students.every((s) => /^2026CSE\d{3}$/.test(s.reg)), students[0]?.reg);
  const configRes = await req('GET', `/api/courses/${COURSE_ID}/config`);
  const outcomes = configRes.json?.data?.outcomes?.filter((o) => o.is_active !== false) || [];
  const firstCoId = outcomes[0]?.id;

  // Existing MTT marks for student 2026CSE001
  const marksRes = await req('GET', `/api/courses/${COURSE_ID}/marks`);
  const mttExisting = marksRes.json?.data?.mtt?.find((m) => m.reg_no === '2026CSE001');
  const existingVal = mttExisting?.coMarks?.[String(firstCoId)];

  // ── T8: preview with full valid sheet
  // NOTE: always deep-copy coMarks — shallow copies share the marks object and
  // mutations in later cases would leak back into rowsUnchanged.
  const cloneRows = (rows) => rows.map((r) => ({ ...r, coMarks: { ...r.coMarks } }));
  const rowsUnchanged = students.map((s) => ({
    rowNumber: s.rowNumber, regNo: s.reg, name: s.name,
    coMarks: { [firstCoId]: existingVal ?? 5 },
  }));
  const pv = await req('POST', `/api/courses/${COURSE_ID}/marks/import-preview`, { body: { examType: 'MTT', rows: rowsUnchanged } });
  check('T8: preview accepts full valid sheet', pv.status === 200 && pv.json?.data?.validCount === 25,
    pv.json?.data ? `valid=${pv.json.data.validCount} errors=${pv.json.data.errorCount}` : `status ${pv.status}`);
  // ── T9–T12: validation errors ──
  const rowsInvalid = cloneRows(rowsUnchanged);
  rowsInvalid[10].coMarks[firstCoId] = 999;
  const pvBad = await req('POST', `/api/courses/${COURSE_ID}/marks/import-preview`, { body: { examType: 'MTT', rows: rowsInvalid } });
  const badErr = pvBad.json?.data?.errors?.[0];
  check('T9: mark above max rejected', pvBad.status === 200 && pvBad.json?.data?.errorCount === 1 &&
    /maximum/i.test(badErr?.problem || ''), badErr?.problem);

  const rowsNeg = cloneRows(rowsUnchanged);
  rowsNeg[3].coMarks[firstCoId] = -5;
  const pvNeg = await req('POST', `/api/courses/${COURSE_ID}/marks/import-preview`, { body: { examType: 'MTT', rows: rowsNeg } });
  check('T10: negative mark rejected', pvNeg.json?.data?.errorCount === 1 && /negative|at least|0/i.test(pvNeg.json?.data?.errors?.[0]?.problem || ''),
    pvNeg.json?.data?.errors?.[0]?.problem);

  const rowsDup = cloneRows(rowsUnchanged);
  rowsDup.push({ ...rowsDup[0], coMarks: { ...rowsDup[0].coMarks }, rowNumber: 99 });
  const pvDup = await req('POST', `/api/courses/${COURSE_ID}/marks/import-preview`, { body: { examType: 'MTT', rows: rowsDup } });
  check('T11: duplicate reg no flagged', pvDup.json?.data?.errors?.some((e) => /duplicate/i.test(e.problem || '')),
    pvDup.json?.data?.errors?.find((e) => /duplicate/i.test(e.problem || ''))?.problem);

  const rowsUnknown = cloneRows(rowsUnchanged);
  rowsUnknown[0] = { ...rowsUnknown[0], regNo: '2026CSE099' };
  const pvUnk = await req('POST', `/api/courses/${COURSE_ID}/marks/import-preview`, { body: { examType: 'MTT', rows: rowsUnknown } });
  check('T12: unknown student rejected (no auto-create)', pvUnk.json?.data?.errors?.some((e) => /not enrolled|unknown|not found/i.test(e.problem || '')),
    pvUnk.json?.data?.errors?.find((e) => /not enrolled|unknown|not found/i.test(e.problem || ''))?.problem);
  // ── T13: missing student → blocked unless acknowledged
  const rowsMissing = rowsUnchanged.slice(0, 24); // drop 1 of 25
  const impMissing = await req('POST', `/api/courses/${COURSE_ID}/marks/import`, { body: { examType: 'MTT', rows: rowsMissing } });
  check('T13a: missing student blocks save', impMissing.status === 400 && /missing/i.test(impMissing.json?.message || ''), impMissing.json?.message);
  const impMissingAck = await req('POST', `/api/courses/${COURSE_ID}/marks/import`, { body: { examType: 'MTT', rows: rowsMissing, acknowledgeMissing: true } });
  check('T13b: acknowledged missing saves remaining', impMissingAck.status === 200, impMissingAck.json?.message);

  // ── T14: real edit → import updates without duplicating
  const newVal = (parseFloat(existingVal) || 0) === 7 ? 8 : 7;
  const rowsEdit = rowsUnchanged.map((r, i) => (i === 0 ? { ...r, coMarks: { [firstCoId]: newVal } } : { ...r }));
  const imp = await req('POST', `/api/courses/${COURSE_ID}/marks/import`, { body: { examType: 'MTT', rows: rowsEdit } });
  check('T14a: import succeeds with update counts', imp.status === 200 && (imp.json?.data?.updated ?? 0) >= 1, imp.json?.message);

  const marksAfter = await req('GET', `/api/courses/${COURSE_ID}/marks`);
  const after = marksAfter.json?.data?.mtt?.find((m) => m.reg_no === '2026CSE001');
  check('T14b: updated value visible online', parseFloat(after?.coMarks?.[String(firstCoId)]) === newVal, `CO now ${after?.coMarks?.[String(firstCoId)]}`);

  // ── T15: re-download contains the new value (online ↔ excel round-trip)
  const dl2 = await req('GET', `/api/courses/${COURSE_ID}/marks-template?examType=MTT`, { raw: true });
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(dl2.buf);
  const ws2 = wb2.getWorksheet('Marks Entry');
  let foundNew = false;
  ws2.eachRow((row) => {
    if (headerRow && row.getCell(regCol).text === '2026CSE001') {
      const firstCoCell = Object.keys(coCols)[0];
      const cell = row.getCell(parseInt(firstCoCell, 10));
      const cellVal = cell.result ?? cell.value ?? cell.text;
      foundNew = parseFloat(cellVal) === newVal;
    }
  });
  check('T15: re-download reflects imported mark', foundNew);

  // ── T16: wrong-course protection — DSA-only student (AAA) is not enrolled in SE
  const pvWrong = await req('POST', `/api/courses/${COURSE_ID}/marks/import-preview`,
    { body: { examType: 'MTT', rows: [{ rowNumber: 2, regNo: 'AAA', name: 'B', coMarks: { [firstCoId]: 5 } }] } });
  check('T16: other-course student rejected', pvWrong.json?.data?.errors?.some((e) => /not enrolled|unknown|not found/i.test(e.problem || '')));

  // ── T17: attainment engine still runs on the same data
  const att = await req('GET', `/api/courses/${COURSE_ID}/attainment`);
  check('T17: CO attainment calculation works', att.status === 200 && att.json?.data !== undefined,
    att.json?.data ? `keys=${Object.keys(att.json.data).slice(0, 4).join(',')}` : `status ${att.status}`);

  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR:', e.message); process.exit(1); });




