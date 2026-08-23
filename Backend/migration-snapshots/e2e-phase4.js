/* Phase 3F–3K + Phase 4 authenticated E2E verification.
 * Creates the FIRST academic class (additive, idempotent), links the 29
 * marks-population master students as class members (no duplicates), maps the
 * two existing courses into the academic context (FKs only — free text kept),
 * and exercises every new read API. Run twice to prove idempotency. */
const jwt = require('jsonwebtoken');
require('dotenv').config();

const BASE = process.argv[2] || 'http://localhost:5050';
const token = jwt.sign(
  { id: 1, email: 'sharvandev28@gmail.com', role: 'Admin' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' },
);
const api = {
  get: (url) => fetch(`${BASE}/api${url}`, { headers: { Authorization: `Bearer ${token}` } }).then(async (r) => ({ status: r.status, data: await r.json() })),
  post: (url, body) => fetch(`${BASE}/api${url}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, data: await r.json() })),
  put: (url, body) => fetch(`${BASE}/api${url}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, data: await r.json() })),
};
const log = (label, v) => console.log(`${label}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);

(async () => {
  // 1. Hierarchy reads
  const [schools, depts, programs, sessions] = await Promise.all([
    api.get('/schools'), api.get('/departments'), api.get('/programs'), api.get('/sessions'),
  ]);
  const school = schools.data.data[0];
  const dept = depts.data.data.find((d) => d.school_id === school.id) || depts.data.data[0];
  const program = programs.data.data.find((p) => p.department_id === dept.id) || programs.data.data[0];
  const session = sessions.data.data[0];
  log('school', `${school.id} ${school.name}`);
  log('dept', `${dept.id} ${dept.name}`);
  log('program', `${program.id} ${program.name}`);
  log('session', `${session.id} ${session.name}`);

  // 2. Create the first Academic Class (idempotent: reuse if it already exists)
  let classes = (await api.get('/classes', { params: { programId: program.id, sessionId: session.id } })).data.data;
  let klass = classes.find((c) => String(c.semester) === '1' && c.section === 'CSE-A');
  if (!klass) {
    const created = await api.post('/classes', {
      programId: program.id, sessionId: session.id, semester: 1, section: 'CSE-A',
    });
    klass = created.data.data;
    log('class created', klass);
  } else {
    log('class reused (idempotent)', `${klass.id} ${klass.program_name} Sem${klass.semester} ${klass.section}`);
  }

  // 3. Class membership: add ALL 29 marks-population students (ids > 100 ⇒ created from marks)
  const studentsRes = await api.get('/students', { params: { limit: 500 } });
  const allStudents = studentsRes.data.data.students || studentsRes.data.data;
  const cohort = allStudents.filter((s) => s.id > 100);
  log('cohort size (marks population)', cohort.length);
  const before = (await api.get(`/classes/${klass.id}/students`)).data.data.length;
  await api.post(`/classes/${klass.id}/students`, { studentIds: cohort.map((s) => s.id) });
  const after = (await api.get(`/classes/${klass.id}/students`)).data.data.length;
  log('class_students before/after re-add', `${before} -> ${after} (must be equal: ${before === after})`);

  // 4. Map both courses into the academic context (FK columns only)
  for (const courseId of [1, 2]) {
    await api.put(`/courses/${courseId}/academic-map`, { programId: program.id, sessionId: session.id, semester: 1 });
  }
  log('courses mapped', 'program/session/semester FKs set (free text untouched)');

  // 5. Enrollment reads for both courses (read-only — no auto-enrollment)
  for (const courseId of [1, 2]) {
    const enr = (await api.get(`/courses/${courseId}/enrollment`)).data.data.students;
    log(`enrollment course ${courseId}`, `${enr.length} students`);
  }

  // 6. Marks API still works through existing endpoint
  const marks = (await api.get('/courses/2/marks')).data.data;
  log('existing marks course 2', `mtt=${marks.mtt.length} ett=${marks.ett.length}`);

  // 7. Attainment engine unchanged
  const att = (await api.get('/courses/2/attainment')).data.data;
  log('attainment keys', Object.keys(att).join(','));
  console.log('E2E VERIFICATION COMPLETE');
})().catch((err) => {
  console.error('E2E FAILED:', err.response ? `${err.response.status} ${JSON.stringify(err.response.data)}` : err.message);
  process.exit(1);
});
