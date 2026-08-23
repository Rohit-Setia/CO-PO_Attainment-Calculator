// Phase 4 API smoke test — run: node migration-snapshots/api-smoke-test.js
const http = require('http');

const PORT = process.env.PORT || 5050;
const BASE_EMAIL = process.argv[2] || 'phase4-smoke@test.local';
const BASE_PW = process.argv[3] || 'Phase4SmokeTest1';

function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        host: 'localhost', port: PORT, path: `/api${path}`, method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
      },
      (resp) => {
        let buf = '';
        resp.on('data', (c) => { buf += c; });
        resp.on('end', () => resolve({ status: resp.statusCode, body: buf }));
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const l = await req('POST', '/auth/login', null, { email: BASE_EMAIL, password: BASE_PW });
  console.log('login:', l.status);
  if (l.status !== 200) { console.log(l.body.slice(0, 300)); return; }
  const t = (JSON.parse(l.body).data || {}).token;

  for (const p of ['/schools', '/departments?schoolId=1', '/programs?departmentId=1', '/sessions', '/classes']) {
    const r = await req('GET', p, t);
    console.log(p, '->', r.status, r.body.replace(/\s+/g, ' ').slice(0, 150));
  }
  for (const p of ['/classes/1/students', '/courses/2/enrollment', '/courses/2/marks', '/courses/2/attainment']) {
    const r = await req('GET', p, t);
    console.log(p, '->', r.status, r.body.replace(/\s+/g, ' ').slice(0, 110));
  }
})();
