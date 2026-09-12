// ─────────────────────────────────────────────────────────────────────────────
// Password-reset test (HOD / Administrator ONLY).
//
// SELF-CONTAINED AND SAFE BY DESIGN: this script SPAWNS its own backend on a
// dedicated port with SMTP_ENABLED=false, so reset emails are only LOGGED and
// can NEVER actually be delivered (no bounce-backs to real mailboxes). It seeds
// temp accounts, exercises the live HTTP endpoints, inspects the DB directly,
// then always kills the server and deletes every row it created.
//
//   node test-password-reset.js
//
// Optional env: TEST_PORT (default 5099).
// ─────────────────────────────────────────────────────────────────────────────
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('./config/db');

const TEST_PORT = process.env.TEST_PORT || '5099';
const base = `http://localhost:${TEST_PORT}`;

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
const ts = Date.now();
const emailFor = (tag) => `pwreset-${tag}-${ts}@test.invalid`;

// Spawn a private backend instance with email delivery hard-disabled.
function startServer() {
  return spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: __dirname,
    env: {
      ...process.env,
      SMTP_ENABLED: 'false',            // never actually send/bounce emails
      PORT: TEST_PORT,
      PASSWORD_RESET_RATE_LIMIT: '1000', // the suite makes many reset calls from one IP
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForServer(child, timeoutMs = 40000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (child.exitCode !== null) throw new Error(`server exited early (code=${child.exitCode})`);
    try { await req('POST', '/api/auth/login', { body: { email: 'probe@x.in', password: 'nope' } }); return; }
    catch { /* not listening yet */ }
    if (Date.now() - start > timeoutMs) throw new Error('server did not become ready in time');
    await new Promise((r) => setTimeout(r, 500));
  }
}


function req(method, path, { body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request(base + path, {
      method, headers: { ...headers, ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null; try { json = JSON.parse(data); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const results = [];
let failed = 0;
const check = (label, cond, detail = '') => {
  results.push({ label, status: cond ? 'PASS' : 'FAIL', detail });
  if (!cond) failed += 1;
};

async function seedUser({ tag, role, active = 1, password = 'OldPass123' }) {
  const email = emailFor(tag);
  const hash = bcrypt.hashSync(password, 10);
  const [res] = await pool.query(
    'INSERT INTO teachers (name, email, password, role, is_active) VALUES (?, ?, ?, ?, ?)',
    [`PWReset ${role}`, email, hash, role, active],
  );
  return { id: res.insertId, email, role, password };
}

async function activeResetTokenCount(userId) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM password_reset_tokens WHERE user_id = ? AND purpose = 'password_reset' AND used_at IS NULL",
    [userId],
  );
  return Number(rows[0].n);
}

async function injectToken(userId, rawToken, { purpose = 'password_reset', expired = false } = {}) {
  const expiresAt = expired ? new Date(Date.now() - 60000) : new Date(Date.now() + 3600000);
  await pool.query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, purpose) VALUES (?, ?, ?, ?)',
    [userId, hashToken(rawToken), expiresAt, purpose],
  );
}

function printSummaryAndExit() {
  console.log('=== PASSWORD RESET TEST RESULTS ===');
  results.forEach((r) => console.log(`  ${r.status === 'PASS' ? '✓' : '✗'} ${r.label}${r.detail ? ` — ${r.detail}` : ''}`));
  console.log(`\nPassed: ${results.length - failed}, Failed: ${failed}`);
  console.log(failed === 0 ? 'ALL PASSWORD-RESET TESTS PASSED' : 'SOME PASSWORD-RESET TESTS FAILED');
  process.exit(failed > 0 ? 1 : 0);
}

(async () => {
  // ── Part A — email builder (unit, no server) ───────────────────────────────
  const { buildPasswordResetEmail, resetUrl } = require('./services/emailService');
  const rawTok = 'RAW-TOKEN-SECRET-abc123';
  const { subject, html } = buildPasswordResetEmail({ name: 'Alice Admin', email: 'a@x.in', resetToken: rawTok, expiresHours: 24 });
  check('Email subject correct', subject === 'Reset Your CT University OBE ERP Password', subject);
  check('Email contains reset link with mode=reset', html.includes('mode=reset') && html.includes(encodeURIComponent(rawTok)));
  check('Email does NOT leak password/hash/SMTP', !/\$2[aby]\$/.test(html) && !html.includes('SMTP'));
  check('resetUrl uses PASSWORD_RESET_URL base', typeof resetUrl(rawTok) === 'string' && resetUrl(rawTok).includes('/set-password'));

  // ── Part B — spawn a private, email-disabled backend and run live checks ───
  const child = startServer();
  const seeded = [];
  try {
    await waitForServer(child);
    check('Private test server started (SMTP disabled)', true, `port=${TEST_PORT}`);

  // Seed one account per role.
  const admin = await seedUser({ tag: 'admin', role: 'Admin' });
  const hod = await seedUser({ tag: 'hod', role: 'Moderator' });
  const teacher = await seedUser({ tag: 'teacher', role: 'Teacher' });
  const viewer = await seedUser({ tag: 'viewer', role: 'Viewer' });
  const exam = await seedUser({ tag: 'exam', role: 'Examination Team' });
  const schoolAdmin = await seedUser({ tag: 'school', role: 'School Admin' });
  const deptAdmin = await seedUser({ tag: 'dept', role: 'Department Admin' });
  seeded.push(admin, hod, teacher, viewer, exam, schoolAdmin, deptAdmin);

  // ── 1/2/7/8/10: forgot-password role gating (server-side) ──────────────────
  const fp = (email) => req('POST', '/api/auth/forgot-password', { body: { email } });
  const rAdmin = await fp(admin.email);
  check('Admin: forgot-password → 200 generic', rAdmin.status === 200 && rAdmin.json?.success, `status=${rAdmin.status}`);
  check('Admin: reset token created', await activeResetTokenCount(admin.id) === 1);

  const rHod = await fp(hod.email);
  check('HOD(Moderator): forgot-password → 200 generic', rHod.status === 200 && rHod.json?.success, `status=${rHod.status}`);
  check('HOD(Moderator): reset token created', await activeResetTokenCount(hod.id) === 1);

  for (const u of [teacher, viewer, exam, schoolAdmin, deptAdmin]) {
    const r = await fp(u.email);
    const n = await activeResetTokenCount(u.id);
    check(`${u.role}: forgot-password → 200 generic (no enumeration)`, r.status === 200 && r.json?.success, `status=${r.status}`);
    check(`${u.role}: NO reset token created (no email)`, n === 0, `count=${n}`);
  }
  const rUnknown = await fp(emailFor('ghost'));
  check('Unknown email → 200 generic', rUnknown.status === 200 && rUnknown.json?.success);

  // ── New request invalidates previous active tokens ─────────────────────────
  const [tokRows] = await pool.query(
    "SELECT token_hash FROM password_reset_tokens WHERE user_id = ? AND purpose='password_reset' ORDER BY id DESC LIMIT 1", [admin.id],
  );
  const firstHash = tokRows[0].token_hash;
  await fp(admin.email);
  const [afterRows] = await pool.query(
    "SELECT used_at FROM password_reset_tokens WHERE user_id = ? AND token_hash = ?", [admin.id, firstHash],
  );
  check('New request invalidates previous active token', afterRows[0] && afterRows[0].used_at != null);
  check('Still exactly one active reset token after re-request', await activeResetTokenCount(admin.id) === 1);

  // ── 5/6/14/15/16/17: full reset flow for Admin and HOD ─────────────────────
  for (const u of [admin, hod]) {
    const label = u.role === 'Admin' ? 'Admin' : 'HOD(Moderator)';
    const raw = crypto.randomBytes(32).toString('base64url');
    await injectToken(u.id, raw);
    const newPass = 'NewPass456';
    const rr = await req('POST', '/api/auth/reset-password', { body: { token: raw, password: newPass } });
    check(`${label}: reset with valid token → 200`, rr.status === 200 && rr.json?.success, `status=${rr.status}`);

    const loginNew = await req('POST', '/api/auth/login', { body: { email: u.email, password: newPass } });
    const loginOld = await req('POST', '/api/auth/login', { body: { email: u.email, password: u.password } });
    check(`${label}: NEW password works`, loginNew.status === 200 && loginNew.json?.success);
    check(`${label}: OLD password rejected`, loginOld.status === 401);

    const [row] = await pool.query('SELECT password FROM teachers WHERE id = ?', [u.id]);
    check(`${label}: password stored as bcrypt`, row[0].password.startsWith('$2'));

    const [byRaw] = await pool.query('SELECT id FROM password_reset_tokens WHERE token_hash = ?', [raw]);
    check(`${label}: raw token NOT stored (hash only)`, byRaw.length === 0);

    const reuse = await req('POST', '/api/auth/reset-password', { body: { token: raw, password: 'Another789' } });
    check(`${label}: used token cannot be reused`, reuse.status === 400, `status=${reuse.status}`);
  }

  // ── 11: expired token rejected ─────────────────────────────────────────────
  const expRaw = crypto.randomBytes(32).toString('base64url');
  await injectToken(admin.id, expRaw, { expired: true });
  const expRes = await req('POST', '/api/auth/reset-password', { body: { token: expRaw, password: 'Expired123' } });
  check('Expired token rejected', expRes.status === 400 && /expired/i.test((expRes.json && expRes.json.message) || ''), `status=${expRes.status}`);

  // ── 9: teacher cannot use the reset endpoint (even with a token) ───────────
  const teacherRaw = crypto.randomBytes(32).toString('base64url');
  await injectToken(teacher.id, teacherRaw);
  const teacherReset = await req('POST', '/api/auth/reset-password', { body: { token: teacherRaw, password: 'HackPass1' } });
  check('Teacher reset endpoint rejected (role gate)', teacherReset.status === 400, `status=${teacherReset.status}`);
  const [teacherPw] = await pool.query('SELECT password FROM teachers WHERE id = ?', [teacher.id]);
  check('Teacher password unchanged after rejected reset', await bcrypt.compare('OldPass123', teacherPw[0].password));

  // ── teacher SETUP token cannot be redeemed on the reset endpoint ───────────
  const setupRaw = crypto.randomBytes(32).toString('base64url');
  await injectToken(admin.id, setupRaw, { purpose: 'password_setup' });
  const setupOnReset = await req('POST', '/api/auth/reset-password', { body: { token: setupRaw, password: 'Cross123' } });
  check('password_setup token rejected by reset endpoint (purpose filter)', setupOnReset.status === 400, `status=${setupOnReset.status}`);

  // ── 19/20: existing logins unchanged ───────────────────────────────────────
  const freshTeacher = await seedUser({ tag: 'fresh', role: 'Teacher', password: 'Teach123' });
  seeded.push(freshTeacher);
  const tLogin = await req('POST', '/api/auth/login', { body: { email: freshTeacher.email, password: 'Teach123' } });
  check('Existing teacher login unchanged', tLogin.status === 200 && tLogin.json?.success);

  // ── audit rows recorded (safe events only) ─────────────────────────────────
  const [audit] = await pool.query(
    "SELECT action FROM admin_audit_log WHERE entity_type='teacher' AND entity_id IN (?) AND action LIKE 'PASSWORD_RESET%'",
    [[admin.id, hod.id, teacher.id]],
  );
  const actions = audit.map((a) => a.action);
  check('Audit recorded reset events', actions.includes('PASSWORD_RESET_REQUESTED') && actions.includes('PASSWORD_RESET_COMPLETED'), actions.join(','));
  const [leak] = await pool.query("SELECT COUNT(*) AS n FROM admin_audit_log WHERE details LIKE '%token_hash%' OR details LIKE '%NewPass456%'");
  check('Audit never logs raw token/password', Number(leak[0].n) === 0);

  } catch (e) {
    check('Server ran end-to-end without fatal error', false, e && e.message);
  } finally {
    // Always tear down the private server and delete every seeded row.
    try { child.kill(); } catch { /* ignore */ }
    for (const u of seeded) {
      try { await pool.query('DELETE FROM password_reset_tokens WHERE user_id = ?', [u.id]); } catch { /* ignore */ }
      try { await pool.query('DELETE FROM admin_audit_log WHERE entity_id = ? AND entity_type = ?', [u.id, 'teacher']); } catch { /* ignore */ }
      try { await pool.query('DELETE FROM teachers WHERE id = ?', [u.id]); } catch { /* ignore */ }
    }
    try { await pool.end(); } catch { /* ignore */ }
  }

  printSummaryAndExit();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });