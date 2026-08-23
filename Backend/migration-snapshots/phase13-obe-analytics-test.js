// Phase 13 — Program OBE Analytics & Reporting acceptance tests.
// Usage: node migration-snapshots/phase13-obe-analytics-test.js
//
// Spawns its own server on PORT (default 5000), runs the full program-OBE pipeline
// against the REAL BBA program (id 3) and MGT101 course (id 17), then shuts the
// server down. Preserves the 2.22 / 2.5 course-attainment regression.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 5000;
const ROOT = path.join(__dirname, '..');

function req(method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const p = urlPath.startsWith('/api') || urlPath === '/health' ? urlPath : `/api${urlPath}`;
    const r = http.request(
      { host: 'localhost', port: PORT, path: p, method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}) },
      (resp) => {
        const chunks = [];
        resp.on('data', (c) => chunks.push(c));
        resp.on('end', () => resolve({ status: resp.statusCode, body: Buffer.concat(chunks).toString('utf8'), raw: Buffer.concat(chunks) }));
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function startServer() {
  return spawn(process.execPath, ['server.js'], { cwd: ROOT, detached: false, stdio: ['ignore', 'ignore', 'pipe'] });
}

let pass = 0; let fail = 0;
function check(label, ok, detail) {
  if (ok) { pass += 1; console.log(`  PASS: ${label}`); }
  else { fail += 1; console.error(`  FAIL: ${label} — ${detail}`); }
}

let child = null;
(async () => {
  child = startServer();
  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((res) => setTimeout(res, 800));
    try {
      const probe = await req('GET', '/health');
      if (probe.status === 200) { ready = true; break; }
    } catch { /* server not up yet */ }
  }
  if (!ready) { console.error('TEST ERROR: server did not start.'); child.kill('SIGTERM'); process.exit(1); }
  console.log('server ready — running Phase 13 OBE analytics tests...');
const admin = jwt.sign({ id: 1, role: 'Admin' }, process.env.JWT_SECRET, { expiresIn: '30m' });
  const teacher = jwt.sign({ id: 7, role: 'Teacher' }, process.env.JWT_SECRET, { expiresIn: '30m' });
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });

  console.log('\n── 1. Core regression (unchanged validation engine) ──');
  const a1 = await req('GET', '/courses/1/attainment', admin);
  const a2 = await req('GET', '/courses/2/attainment', admin);
  check('Course 1 attainment is exactly 2.22', JSON.parse(a1.body).data?.overallCourseAttainment === 2.22,
    `got ${JSON.parse(a1.body).data?.overallCourseAttainment}`);
  check('Course 2 attainment is exactly 2.5', JSON.parse(a2.body).data?.overallCourseAttainment === 2.5,
    `got ${JSON.parse(a2.body).data?.overallCourseAttainment}`);

  console.log('\n── 2. BBA program OBE dashboard (program 3) ──');
  const dash = await req('GET', '/programs/3/obe/dashboard', admin);
  const dd = JSON.parse(dash.body).data || {};
  check('Dashboard → 200', dash.status === 200, `status=${dash.status}`);
  check('Dashboard program is BBA', dd.program?.code === 'BBA-GEN' || (dd.program?.name || '').includes('Business Administration'),
    `got ${JSON.stringify(dd.program)}`);
  check('Outcome version seeded (current)', dd.outcomeVersion?.label === 'current', `got ${JSON.stringify(dd.outcomeVersion)}`);
  check('CO attainment rows include MGT101', (dd.coAttainment || []).some((r) => r.courseCode === 'MGT101'),
    `courses=${(dd.coAttainment || []).map((r) => r.courseCode).join(', ')}`);
  check('Heatmap columns include POs and PSOs', (dd.heatmap?.columns?.PO || []).length >= 1 && (dd.heatmap?.columns?.PSO || []).length >= 1,
    `PO=${dd.heatmap?.columns?.PO?.length} PSO=${dd.heatmap?.columns?.PSO?.length}`);
  check('Achievement summary present', Boolean(dd.achievementSummary?.PO && dd.achievementSummary?.PSO),
    JSON.stringify(dd.achievementSummary || {}));
  check('Validation list present', Array.isArray(dd.validation), `len=${dd.validation?.length}`);
  const mdt = (dd.coAttainment || []).find((r) => r.courseCode === 'MGT101');
  check('MGT101 CO1 has >= 25 assessed students', (mdt?.cos?.[0]?.studentsAssessed || 0) >= 25,
    JSON.stringify(mdt?.cos?.[0]));
  const crossContam = (dd.coAttainment || []).some((r) =>
    ['B.TECH', 'CSE', 'BTECH-CSE'].some((s) => ((r.subjectName || '') + (r.courseCode || '')).toUpperCase().includes(s.toUpperCase())));
  check('BBA dashboard does NOT include B.Tech/CSE courses (cross-program isolation)', !crossContam,
    JSON.stringify((dd.coAttainment || []).map((r) => r.courseCode)));

  console.log('\n── 3. Focused endpoints ──');
  const po = await req('GET', '/programs/3/obe/po-attainment', admin);
  const poD = JSON.parse(po.body).data || {};
  check('PO attainment returns 12 POs', (poD.poAttainment || []).length === 12, `len=${poD.poAttainment?.length}`);
  const pso = await req('GET', '/programs/3/obe/pso-attainment', admin);
  check('PSO attainment returns 3 PSOs', (JSON.parse(pso.body).data?.psoAttainment || []).length === 3,
    `len=${JSON.parse(pso.body).data?.psoAttainment?.length}`);
  const coF = await req('GET', '/programs/3/obe/co-attainment', admin);
  check('CO endpoint returns attainment', JSON.parse(coF.body).data?.coAttainment?.length >= 1, '');
  const val = await req('GET', '/programs/3/obe/validation', admin);
  check('Validation endpoint returns issues', Array.isArray(JSON.parse(val.body).data?.validation), '');
  const contrib = await req('GET', '/programs/3/obe/course-contributions?po=PO1', admin);
  check('Course contributions endpoint returns courses', contrib.status === 200 && Array.isArray(JSON.parse(contrib.body).data?.courses),
    `${contrib.status} ${contrib.body.slice(0, 120)}`);
  const drill = await req('GET', '/programs/3/obe/course/17/co/1/students', admin);
  const drillD = JSON.parse(drill.body).data || {};
  check('CO drill-down returns MTT marks (>=25)', drill.status === 200 && Array.isArray(drillD?.mtt) && drillD.mtt.length >= 25,
    `mtt=${drillD?.mtt?.length} ett=${drillD?.ett?.length}`);

  console.log('\n── 4. Report export formats ──');
  const jsonRep = await req('GET', '/programs/3/obe/report?format=json', admin);
  check('Report JSON → 200', jsonRep.status === 200, `${jsonRep.status}`);
  const csvRep = await req('GET', '/programs/3/obe/report?format=csv', admin);
  check('Report CSV → 200', csvRep.status === 200, `${csvRep.status}`);
  check('CSV contains PO rows', /^PO,/.test(csvRep.body.split('\r\n').find((l) => /^PO,/.test(l)) || ''), '');
  const xlRep = await req('GET', '/programs/3/obe/report?format=excel', admin);
  check('Report Excel → 200 + xlsx bytes', xlRep.status === 200 && xlRep.raw.length > 1000, `len=${xlRep.raw.length}`);
  const htmlRep = await req('GET', '/programs/3/obe/report?format=pdf', admin);
  check('Report PDF (printable HTML) → 200 + <html>', htmlRep.status === 200 && /<html>/i.test(htmlRep.body), `${htmlRep.status}`);

  console.log('\n── 5. Outcome versions (administrative write) ──');
  const vList = await req('GET', '/programs/3/obe/outcome-versions', admin);
  const versions = JSON.parse(vList.body).data;
  check('Version list has the seeded "current"', (versions || []).some((v) => v.label === 'current'),
    JSON.stringify((versions || []).map((v) => v.label)));
  check('Teacher CANNOT create an outcome version (403)',
    (await req('POST', '/programs/3/obe/outcome-versions', teacher, { label: 'x' })).status === 403, '');

  console.log('\n── 6. Improvement / action plans ──');
  const planCreate = await req('POST', '/programs/3/obe/action-plans', admin, {
    outcomeCode: 'PO3', issue: 'Low attainment in analytical problem solving.',
    correctiveAction: 'Introduce case-study based assignments.', responsibleFaculty: 'Course Coordinator',
    status: 'Planned', sessionId: 2, semester: 1,
  });
  check('Create action plan → 201', planCreate.status === 201, `${planCreate.status} ${planCreate.body.slice(0, 120)}`);
  const planId = JSON.parse(planCreate.body).data?.id;
  const plans = await req('GET', '/programs/3/obe/action-plans', admin);
  check('Action plans listed', (JSON.parse(plans.body).data || []).some((p) => p.id === planId), '');
  const upd = await req('PUT', `/programs/3/obe/action-plans/${planId}`, admin, { status: 'In Progress' });
  check('Update action plan → 200', upd.status === 200, `${upd.status}`);
  check('Teacher CANNOT create action plan (403)', (await req('POST', '/programs/3/obe/action-plans', teacher, { outcomeCode: 'PO1' })).status === 403, '');
  const del = await req('DELETE', `/programs/3/obe/action-plans/${planId}`, admin);
  check('Delete action plan → 200', del.status === 200, `${del.status}`);
  const plansAfter = await req('GET', '/programs/3/obe/action-plans', admin);
  check('Action plan removed', !(JSON.parse(plansAfter.body).data || []).some((p) => p.id === planId), '');

  console.log('\n── 7. Filtering (semester scope) ──');
  const sem = await req('GET', '/programs/3/obe/dashboard?semester=1', admin);
  const semD = JSON.parse(sem.body).data || {};
  check('Semester-filtered dashboard returns only semester-1 courses',
    (semD.coAttainment || []).every((r) => r.semester === 1),
    JSON.stringify((semD.coAttainment || []).map((r) => `sem${r.semester}`)));

  console.log('\n── 8. Historical outcome-version snapshot ──');
  // Move PO1 to a distinct historical version with its own description, verify a
  // version-scoped report shows THAT description (not the current one), then restore.
  const poList = await req('GET', '/programs/3/outcomes?type=PO', admin);
  const po1 = JSON.parse(poList.body).data[0];
  await req('PUT', `/programs/3/outcomes/${po1.id}`, admin, { versionLabel: '__phase13_hist', description: 'Historical PO1 snapshot text' });
  const histDash = await req('GET', '/programs/3/obe/dashboard?versionLabel=__phase13_hist', admin);
  const histD = JSON.parse(histDash.body).data || {};
  const histPo1 = (histD.poAttainment || []).find((p) => p.code === 'PO1');
  check('Version-scoped report uses the HISTORICAL PO1 description',
    histPo1?.description === 'Historical PO1 snapshot text',
    `got ${JSON.stringify(histPo1?.description)}`);
  const curDash = await req('GET', '/programs/3/obe/dashboard', admin);
  const curD = JSON.parse(curDash.body).data || {};
  check('Current-version report no longer lists the moved PO1 (version isolation)',
    !(curD.poAttainment || []).some((p) => p.code === 'PO1'),
    JSON.stringify((curD.poAttainment || []).map((p) => p.code)));
  // restore
  await db.query("UPDATE program_outcomes SET version_label = 'current', description = NULL WHERE id = ?", [po1.id]);
  const restoredDash = await req('GET', '/programs/3/obe/dashboard', admin);
  check('PO1 restored to current version',
    ((JSON.parse(restoredDash.body).data || {}).poAttainment || []).some((p) => p.code === 'PO1'), '');

  await db.end();
  child.kill('SIGTERM');
  console.log(`\n=== Phase 13 OBE Analytics: Pass ${pass}, Fail ${fail} ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('TEST ERROR:', e && e.stack ? e.stack : e);
  try { if (child) child.kill('SIGTERM'); } catch {}
  process.exit(1);
});