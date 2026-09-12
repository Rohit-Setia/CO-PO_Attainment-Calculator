const http = require('http');
require('dotenv').config();
const base = 'http://localhost:5000';

function req(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request(base + path, {
      method,
      headers: { ...headers, ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { }
        resolve({ status: res.statusCode, json, raw: data.slice(0, 500) });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

(async () => {
  let failed = 0;
  const check = (label, ok, detail) => { console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

  const login = await req('POST', '/api/auth/login', { body: { email: 'apitest2@ctuniversity.in', password: 'test123' } });
  const token = login.json?.data?.token || login.json?.token || '';
  check('Login', login.status === 200, 'got token');

  // Get course 1 outcomes for question config
  const cfg = await req('GET', '/api/courses/1/config', { token });
  const outcomes = cfg.json?.data?.outcomes || [];
  check('Course 1 config', outcomes.length > 0, `${outcomes.length} COs`);

  // Save question config for MTT: 2 questions mapped to CO1 (total 10 marks, fits max 10), 1 mapped to CO2
  const qBody = {
    examType: 'MTT',
    questions: [
      { question_number: 1, co_id: outcomes[0].id, max_marks: 5 },
      { question_number: 2, co_id: outcomes[0].id, max_marks: 5 },
      { question_number: 3, co_id: outcomes[1].id, max_marks: 10 },
    ],
  };
  const qSave = await req('POST', '/api/courses/1/questions', { token, body: qBody });
  check('Save question config', qSave.status === 200, qSave.json?.message);

  // Get saved question configs to get their IDs
  const qs = await req('GET', '/api/courses/1/questions?examType=MTT', { token });
  const questions = qs.json?.data || [];
  check('Question config loaded', questions.length === 3, `${questions.length} questions`);

  // Save question marks for one student (question-mode) — marks must be ≤ each question's max
  const qMarksBody = {
    examType: 'MTT',
    entryMode: 'question',
    students: [{
      name: 'QuestionTest Student',
      roll: 'QT001',
      questionMarks: {
        [questions[0].id]: 4,  // Q1 max 5
        [questions[1].id]: 3,  // Q2 max 5
        [questions[2].id]: 8,  // Q3 max 10
      },
    }],
  };
  const qSave2 = await req('POST', '/api/courses/1/marks', { token, body: qMarksBody });
  check('Save question marks (create)', qSave2.status === 200, qSave2.json?.message);

  // Verify saved marks — CO1 should be 4+3=7, CO2 should be 8
  const marks = await req('GET', '/api/courses/1/marks', { token });
  const mtt = marks.json?.data?.mtt || [];
  const qt = mtt.find((s) => s.reg_no === 'QT001');
  check('Student exists after question-mode save', !!qt, JSON.stringify(qt));
  if (qt) {
    check('CO1 from question marks (4+3=7)', qt.coMarks[outcomes[0].id] === 7, `got ${qt.coMarks[outcomes[0].id]}`);
    check('CO2 from question marks (8)', qt.coMarks[outcomes[1].id] === 8, `got ${qt.coMarks[outcomes[1].id]}`);
  }

  // Save again with only one question changed (blank others preserved)
  const qMarksBody2 = {
    examType: 'MTT',
    entryMode: 'question',
    students: [{
      name: 'QuestionTest Student',
      roll: 'QT001',
      questionMarks: {
        [questions[0].id]: 5, // change Q1 from 4 to 5
        [questions[1].id]: '', // blank — should preserve existing 3
        // Q3 not sent — should preserve existing 8
      },
    }],
  };
  const qSave3 = await req('POST', '/api/courses/1/marks', { token, body: qMarksBody2 });
  check('Save question marks (partial update)', qSave3.status === 200, qSave3.json?.message);

  const marks2 = await req('GET', '/api/courses/1/marks', { token });
  const mtt2 = marks2.json?.data?.mtt || [];
  const qt2 = mtt2.find((s) => s.reg_no === 'QT001');
  if (qt2) {
    // CO1 = Q1(5) + Q2(3) = 8, CO2 = Q3(8) = 8
    check('CO1 after partial update (5+3=8)', qt2.coMarks[outcomes[0].id] === 8, `got ${qt2.coMarks[outcomes[0].id]}`);
    check('CO2 preserved (8)', qt2.coMarks[outcomes[1].id] === 8, `got ${qt2.coMarks[outcomes[1].id]}`);
  }

  // Cleanup: delete test marks and restore the original 5-question MTT config (Q1-5 → CO1)
  const pool = require('./config/db');
  await pool.query("DELETE FROM student_marks WHERE reg_no IN ('QT001') AND course_id=1");
  await pool.query("DELETE FROM question_configs WHERE course_id=1 AND exam_type='MTT'");
  const co1 = outcomes.find((o) => o.co_number === 1) || outcomes[0];
  for (let i = 1; i <= 5; i++) {
    await pool.query("INSERT INTO question_configs (course_id, exam_type, question_number, co_id, max_marks) VALUES (1, 'MTT', ?, ?, 10)", [i, co1.id]);
  }
  check('Test data cleaned up + original config restored', true, '');

  console.log(`\nQuestion-mode: ${failed === 0 ? 'ALL PASSED' : failed + ' FAILED'}`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });