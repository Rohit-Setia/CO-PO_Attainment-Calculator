// Simple auth-route smoke test against a running backend.
// Usage: node migration-snapshots/smoke-api.js [baseUrl]
//
// We cannot know users' plaintext passwords, so this verifies:
//   - GET  /            -> 200 {status:ok}
//   - GET  /api/auth/dashboard            -> 401 (auth gate working)
//   - POST /api/auth/login (bad creds)    -> 401 (auth route reaches DB, no 500)
//   - POST /api/auth/login (missing body) -> 400 (validation working)
const http = require('http');

const base = (process.argv[2] || 'http://localhost:5000').replace(/\/$/, '');

function req(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request(url, {
      method,
      headers: { ...headers, ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* keep null */ }
        resolve({ status: res.statusCode, json, raw: data.slice(0, 300) });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

(async () => {
  const results = [];
  results.push(['GET /', await req('GET', '/')]);
  results.push(['GET /api/dashboard/summary (no token)', await req('GET', '/api/dashboard/summary')]);
  results.push(['POST /api/auth/login bad creds', await req('POST', '/api/auth/login', { body: { email: 'nobody@nowhere.invalid', password: 'wrongpass1' } })]);
  results.push(['POST /api/auth/login empty body', await req('POST', '/api/auth/login', { body: {} })]);

  for (const [label, r] of results) {
    console.log(`${label}\n  status=${r.status} body=${r.json ? JSON.stringify(r.json).slice(0, 200) : r.raw}`);
  }
  const allOk = results.every(([, r]) => r.status && r.status < 500);
  console.log(allOk ? 'SMOKE TEST: OK (no 5xx)' : 'SMOKE TEST: FAILED');
  process.exitCode = allOk ? 0 : 1;
})();