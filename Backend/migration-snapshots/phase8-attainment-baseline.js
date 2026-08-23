// Phase 8 — capture CO/PO attainment baseline for regression comparison.
// Run BEFORE and AFTER Phase 8 tests; outputs must be identical when data is unchanged.
// Usage: node migration-snapshots/phase8-attainment-baseline.js [outputFile]
const http = require('http');
const fs = require('fs');
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

(async () => {
  const l = await req('POST', '/auth/login', null, { email: 'phase7-smoke-admin@test.local', password: 'Phase7SmokeTest1' });
  if (l.status !== 200) { console.error('login failed:', l.status); process.exit(1); }
  const token = JSON.parse(l.body).data.token;

  const courses = JSON.parse((await req('GET', '/courses', token)).body).data;
  const baseline = { capturedAt: new Date().toISOString(), courses: [] };

  for (const c of courses) {
    const ar = await req('GET', `/courses/${c.id}/attainment`, token);
    const att = ar.status === 200 ? JSON.parse(ar.body).data : null;
    baseline.courses.push({
      courseId: c.id,
      courseCode: c.course_code,
      status: ar.status,
      overallCourseAttainment: att ? att.overallCourseAttainment : null,
      mttAttainment: att ? att.mttAttainment : null,
      ettAttainment: att ? att.ettAttainment : null,
      combinedCO: att ? att.combinedCO : null,
      poResults: att ? att.poResults : null,
    });
    console.log(`course ${c.id} (${c.course_code}): overall=${att ? att.overallCourseAttainment : 'n/a'} (status ${ar.status})`);
  }

  const out = process.argv[2] || 'migration-snapshots/phase8-attainment-baseline.json';
  fs.writeFileSync(out, JSON.stringify(baseline, null, 2));
  console.log(`Baseline written to ${out} (${baseline.courses.length} courses)`);
})();