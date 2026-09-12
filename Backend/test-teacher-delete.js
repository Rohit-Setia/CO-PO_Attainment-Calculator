// ─────────────────────────────────────────────────────────────────────────────
// Teacher Directory deletion — regression test.
//
//   node test-teacher-delete.js
//
// Exercises the real controller/model/transaction code paths directly with mock
// req/res, so it does not depend on the HTTP server being restarted. Everything it
// creates is stamped with a unique suffix and hard-deleted in the finally block;
// no real academic data is touched.
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./config/db');

const {
  getTeacherDeletionImpact,
  deleteTeacher,
  restoreTeacher,
  listTeacherDirectory,
} = require('./controllers/teacherController');
const { loginTeacher } = require('./controllers/authController');
const { reassignActiveWork, getTeacherAccount } = require('./models/teacherDeletionModel');
const { withTransaction } = require('./utils/transaction');
const authorizeRoles = require('./middlewares/roleMiddleware').authorizeRoles;

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
};

// Minimal express res double: records the status + body and chains like res.status().json().
const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};
const call = async (handler, { params = {}, body = {}, query = {}, user }) => {
  const res = mockRes();
  const errs = [];
  await handler({ params, body, query, user }, res, (e) => errs.push(e));
  if (errs.length) throw errs[0];
  return { status: res.statusCode, json: res.body };
};

const stamp = Date.now().toString().slice(-7);
const mk = (tag) => `del.${tag}.${stamp}@test.local`;
const ids = { admin: null, admin2: null, t1: null, t2: null, t3: null, course: null, audit: null };
const pwHash = bcrypt.hashSync('test123', 10);

const insertTeacher = async (name, email, role) => {
  const [r] = await pool.query(
    'INSERT INTO teachers (name, email, password, role, is_active) VALUES (?, ?, ?, ?, 1)',
    [name, email, pwHash, role],
  );
  return r.insertId;
};

(async () => {
  // ── Fixtures ────────────────────────────────────────────────────────────────
  ids.admin = await insertTeacher('DelTest Admin', mk('admin'), 'Admin');
  ids.admin2 = await insertTeacher('DelTest Admin2', mk('admin2'), 'Admin');
  ids.t1 = await insertTeacher('DelTest Victim', mk('victim'), 'Teacher');
  ids.t2 = await insertTeacher('DelTest Successor', mk('successor'), 'Teacher');
  // t3 owns nothing at all — used to prove a clean teacher deletes with no reassignment.
  ids.t3 = await insertTeacher('DelTest Clean', mk('clean'), 'Teacher');

  const [deptRows] = await pool.query('SELECT id, name FROM departments LIMIT 1');
  const deptName = deptRows.length ? deptRows[0].name : 'TestDept';
  const [courseRes] = await pool.query(
    `INSERT INTO courses (teacher_id, school, department, subject_name, course_code, semester, academic_year, status)
     VALUES (?, 'Test School', ?, 'Deletion Probe Course', ?, 1, '2025-26', 'Active')`,
    [ids.t1, deptName, `DEL${stamp}`],
  );
  ids.course = courseRes.insertId;

  // Historical footprint owned by t1: an audit entry + a notification.
  const [auditRes] = await pool.query(
    `INSERT INTO admin_audit_log (actor_user_id, actor_name, action, entity_type, entity_id, details)
     VALUES (?, 'DelTest Victim', 'SEED_HISTORY', 'courses', ?, 'seed')`,
    [ids.t1, ids.course],
  );
  ids.audit = auditRes.insertId;
  await pool.query(
    "INSERT INTO notifications (user_id, type, title) VALUES (?, 'info', 'Historical notification')",
    [ids.t1],
  );

  const admin = { id: ids.admin, email: mk('admin'), name: 'DelTest Admin', role: 'Admin' };
  const teacherActor = { id: ids.t2, email: mk('successor'), name: 'DelTest Successor', role: 'Teacher' };

  console.log('\n── impact report ───────────────────────────────────────────────────────────');
  const impact = await call(getTeacherDeletionImpact, { params: { id: ids.t1 }, user: admin });
  check('impact endpoint returns 200', impact.status === 200, `status=${impact.status}`);
  check('impact reports the active course as a blocker',
    impact.json.data.blockers.some((b) => b.key === 'activeCourses' && b.count === 1),
    JSON.stringify(impact.json.data.blockers.map((b) => `${b.key}=${b.count}`)));
  check('impact counts preserved history (audit + notification)',
    impact.json.data.historical.items.some((h) => h.key === 'auditEntries' && h.count >= 1)
    && impact.json.data.historical.items.some((h) => h.key === 'notifications' && h.count === 1),
    JSON.stringify(impact.json.data.historical.items.map((h) => `${h.key}=${h.count}`)));
  check('impact refuses delete while active work exists', impact.json.data.canDelete === false);
  check('impact flags requiresReassignment', impact.json.data.requiresReassignment === true);

  const missing = await call(getTeacherDeletionImpact, { params: { id: 99999999 }, user: admin });
  check('impact on unknown id is 404', missing.status === 404, `status=${missing.status}`);

  console.log('\n── authorization ───────────────────────────────────────────────────────────');
  const guard = await new Promise((resolve) => {
    const res = mockRes();
    let settled = false;
    authorizeRoles('Admin')({ user: teacherActor }, res, () => { settled = true; resolve('next'); });
    setTimeout(() => { if (!settled) resolve({ status: res.statusCode, json: res.body }); }, 50);
  });
  check('authorizeRoles("Admin") rejects a Teacher principal', guard !== 'next' && guard.status === 403,
    JSON.stringify(guard.json || guard));

  const priv = await call(deleteTeacher, { params: { id: ids.admin2 }, body: { confirm: 'DELETE' }, user: admin });
  check('admin cannot delete another admin (403 PRIVILEGED_ACCOUNT)',
    priv.status === 403 && priv.json.code === 'PRIVILEGED_ACCOUNT', `status=${priv.status} code=${priv.json.code}`);

  const self = await call(deleteTeacher, { params: { id: ids.admin }, body: { confirm: 'DELETE' }, user: admin });
  check('admin cannot delete their own account', self.status === 400, `status=${self.status}`);

  const noConfirm = await call(deleteTeacher, { params: { id: ids.t1 }, body: {}, user: admin });
  check('missing DELETE confirmation is refused',
    noConfirm.status === 400 && noConfirm.json.code === 'CONFIRMATION_REQUIRED', `status=${noConfirm.status}`);

  const notFound = await call(deleteTeacher, { params: { id: 99999999 }, body: { confirm: 'DELETE' }, user: admin });
  check('unknown teacher id is 404', notFound.status === 404, `status=${notFound.status}`);

  console.log('\n── active-assignment guard ─────────────────────────────────────────────────');
  const blocked = await call(deleteTeacher, { params: { id: ids.t1 }, body: { confirm: 'DELETE' }, user: admin });
  check('delete blocked by active assignments (409 ACTIVE_ASSIGNMENTS)',
    blocked.status === 409 && blocked.json.code === 'ACTIVE_ASSIGNMENTS', `status=${blocked.status}`);
  check('blocker list is returned to the client', Array.isArray(blocked.json.data?.blockers));
  const [untouched] = await pool.query('SELECT teacher_id FROM courses WHERE id = ?', [ids.course]);
  check('blocked delete changed nothing', untouched[0].teacher_id === ids.t1);
  const [t1StillLive] = await pool.query('SELECT deleted_at FROM teachers WHERE id = ?', [ids.t1]);
  check('blocked delete left the account live', t1StillLive[0].deleted_at === null);

  console.log('\n── transaction rollback ────────────────────────────────────────────────────');
  let boom = null;
  try {
    await withTransaction(async (conn) => {
      await reassignActiveWork({ fromUserId: ids.t1, toUserId: ids.t2 }, conn);
      throw new Error('forced failure after reassignment');
    });
  } catch (e) { boom = e; }
  const [afterRollback] = await pool.query('SELECT teacher_id FROM courses WHERE id = ?', [ids.course]);
  check('reassignment inside a failed transaction rolls back',
    !!boom && afterRollback[0].teacher_id === ids.t1, `course.teacher_id=${afterRollback[0].teacher_id}`);


  console.log('\n── delete with reassignment ────────────────────────────────────────────────');
  const del = await call(deleteTeacher, {
    params: { id: ids.t1 },
    body: { confirm: 'DELETE', reason: 'Left the institution', reassignToId: ids.t2 },
    user: admin,
  });
  check('delete succeeds when active work is reassigned', del.status === 200 && del.json.success,
    `status=${del.status} ${JSON.stringify(del.json?.message)}`);
  check('reassignment moved the course', del.json.data?.reassignment?.courses === 1,
    JSON.stringify(del.json.data?.reassignment));
  const [moved] = await pool.query('SELECT teacher_id FROM courses WHERE id = ?', [ids.course]);
  check('course now owned by the successor', moved[0].teacher_id === ids.t2);

  const t1 = await getTeacherAccount(ids.t1);
  check('teacher stamped as deleted', !!t1.deleted_at && t1.deleted_by === ids.admin);
  check('delete reason persisted', t1.delete_reason === 'Left the institution');
  check('account deactivated (login blocked)', t1.is_active === 0);
  check('prior active state captured for restore', Number(t1.deleted_prior_active) === 1);

  const [hist] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM courses WHERE id = ?) AS c,
            (SELECT COUNT(*) FROM admin_audit_log WHERE id = ?) AS a,
            (SELECT COUNT(*) FROM notifications WHERE user_id = ?) AS n`,
    [ids.course, ids.audit, ids.t1],
  );
  check('historical academic rows preserved', hist[0].c === 1 && hist[0].a === 1 && hist[0].n === 1,
    JSON.stringify(hist[0]));

  const [auditRow] = await pool.query(
    "SELECT * FROM admin_audit_log WHERE action = 'DELETE_TEACHER' AND entity_id = ? ORDER BY id DESC LIMIT 1",
    [ids.t1],
  );
  check('DELETE_TEACHER audit row written', auditRow.length === 1 && auditRow[0].actor_user_id === ids.admin);
  const details = auditRow.length ? JSON.parse(auditRow[0].details) : {};
  check('audit row snapshots preserved history + reassignment',
    Array.isArray(details.preservedHistory) && !!details.reassignment, JSON.stringify(details).slice(0, 140));

  const again = await call(deleteTeacher, { params: { id: ids.t1 }, body: { confirm: 'DELETE' }, user: admin });
  check('second delete is idempotent-blocked (409 ALREADY_DELETED)',
    again.status === 409 && again.json.code === 'ALREADY_DELETED', `status=${again.status}`);

  console.log('\n── login + directory visibility ────────────────────────────────────────────');
  const loginRes = await call(loginTeacher, { body: { email: mk('victim'), password: 'test123' } });
  check('deleted teacher cannot log in', loginRes.status === 403 && /deleted/i.test(loginRes.json.message || ''),
    `status=${loginRes.status} msg=${loginRes.json?.message}`);

  const activeList = await call(listTeacherDirectory, { query: { search: stamp, limit: 50 }, user: admin });
  check('deleted teacher hidden from active directory',
    !activeList.json.data.rows.some((r) => r.id === ids.t1)
    && activeList.json.data.rows.some((r) => r.id === ids.t2),
    `rows=${activeList.json.data.rows.map((r) => r.id).join(',')}`);
  const archivedList = await call(listTeacherDirectory, {
    query: { search: stamp, status: 'deleted', limit: 50 }, user: admin,
  });
  check('deleted teacher visible in Archived view with its reason',
    archivedList.json.data.rows.length === 1
    && archivedList.json.data.rows[0].id === ids.t1
    && archivedList.json.data.rows[0].delete_reason === 'Left the institution',
    `rows=${JSON.stringify(archivedList.json.data.rows.map((r) => `${r.id}:${r.delete_reason}`))}`);

  console.log('\n── restore ─────────────────────────────────────────────────────────────────');
  const restored = await call(restoreTeacher, { params: { id: ids.t1 }, user: admin });
  check('restore succeeds', restored.status === 200 && restored.json.success, `status=${restored.status}`);
  const t1After = await getTeacherAccount(ids.t1);
  check('restore clears the deletion stamp', t1After.deleted_at === null && t1After.delete_reason === null);
  check('restore reinstates the prior active state', Number(t1After.is_active) === 1);
  const notDeleted = await call(restoreTeacher, { params: { id: ids.t1 }, user: admin });
  check('restoring a live account is 409 NOT_DELETED', notDeleted.status === 409, `status=${notDeleted.status}`);

  console.log('\n── clean teacher + import uniqueness ───────────────────────────────────────');
  const cleanImpact = await call(getTeacherDeletionImpact, { params: { id: ids.t3 }, user: admin });
  check('teacher with no records at all is deletable without reassignment',
    cleanImpact.status === 200 && cleanImpact.json.data.canDelete === true
    && cleanImpact.json.data.requiresReassignment === false,
    `canDelete=${cleanImpact.json.data?.canDelete}`);
  const del3 = await call(deleteTeacher, { params: { id: ids.t3 }, body: { confirm: 'DELETE' }, user: admin });
  check('clean teacher deletes with no reassignToId', del3.status === 200, `status=${del3.status}`);
  check('clean delete reports no reassignment', del3.json.data?.reassignment === null);
  const { bulkFindExistingTeacherIdentities } = require('./models/userModel');
  const ident = await bulkFindExistingTeacherIdentities({ emails: [mk('clean')], employeeIds: [] });
  check('import pre-check flags the identifier as held by a deleted account',
    ident.existingEmails.has(mk('clean')) && ident.deletedEmails.has(mk('clean')));

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
})()
  .catch((err) => { failed += 1; console.error('\n✗ test harness error:', err.stack || err.message); })
  .finally(async () => {
    // Hard-clean only the rows this file created.
    try {
      const all = [ids.t1, ids.t2, ids.t3];
      await pool.query('DELETE FROM notifications WHERE user_id IN (?, ?, ?)', all);
      await pool.query(
        'DELETE FROM admin_audit_log WHERE actor_user_id IN (?, ?, ?) OR (entity_type = ? AND entity_id IN (?, ?, ?))',
        [...all, 'teachers', ...all],
      );
      await pool.query('DELETE FROM user_course_assignments WHERE user_id IN (?, ?, ?)', all);
      await pool.query('DELETE FROM courses WHERE id = ?', [ids.course]);
      await pool.query('DELETE FROM teachers WHERE id IN (?, ?, ?, ?, ?)', [...all, ids.admin, ids.admin2]);
      console.log('cleanup done');
    } catch (e) { console.error('cleanup failed:', e.message); }
    await pool.end();
    process.exit(failed === 0 ? 0 : 1);
  });

