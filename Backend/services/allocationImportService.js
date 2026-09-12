// ─────────────────────────────────────────────────────────────────────────────
// Examination allocation bulk import.
//
// The Examination Cell prepares ONE spreadsheet for a whole examination — one row
// per (subject × paper set × class) carrying that class's Paper Reviewer and Marks
// Evaluator — uploads it once, and the ERP creates every paper_assignments row.
// This replaces clicking "assign teacher" a few hundred times.
//
// Two-phase by design, mirroring services/teacherImportService.js:
//   validateAllocationWorkbook() → parse + resolve + categorize every row, write
//     nothing. This is what the "143 valid / 4 errors" preview renders.
//   importAllocations()          → re-validate, then write ONLY the valid rows,
//     inside one transaction.
// The preview never writes and the import never trusts the preview, so a stale
// preview (someone edited a course in between) cannot import a bad row.
//
// Resolution rules, in the order a row is checked:
//   Exam         → examinations by code, then name. The examination chosen in the UI
//                  wins; a row naming a different one is an error, never a silent
//                  cross-import.
//   Subject Code → courses.course_code, narrowed by Program/Semester when given.
//                  Ambiguity is an error naming the candidates, never a guess.
//   Class        → academic_classes by (program, semester, section), narrowed to the
//                  examination's academic session when it has one.
//   Paper Set    → an ALREADY-UPLOADED question paper for that examination + course.
//                  Papers are uploaded before allocation (the Examination Cell's own
//                  sequence), so a missing paper is a row error the Cell fixes by
//                  uploading it — not something this importer invents a stub for.
//   Teachers     → email first (the documented key), then employee ID, then an exact
//                  and UNIQUE name match.
// ─────────────────────────────────────────────────────────────────────────────
const pool = require('../config/db');
const { withTransaction } = require('../utils/transaction');
const {
  norm, readValue, findFirstHeaderRow, loadWorkbookRows, isEmptyRow,
} = require('../utils/workbookReader');
const { getExaminationById } = require('../models/examinationModel');

const COLUMN_ALIASES = {
  exam: ['exam', 'examination', 'examname', 'examcode', 'examinationname'],
  school: ['school', 'schoolname', 'faculty'],
  department: ['department', 'dept', 'departmentname', 'deptname'],
  program: ['program', 'programme', 'programname', 'programmename', 'programcode', 'course'],
  semester: ['semester', 'sem', 'semesterno', 'semno'],
  section: ['class', 'section', 'classsection', 'classname', 'sectionname', 'batch'],
  courseCode: ['subjectcode', 'coursecode', 'subcode', 'papercode', 'code'],
  subject: ['subject', 'subjectname', 'coursename', 'paper', 'papername'],
  paperSet: ['paperset', 'set', 'setno', 'setnumber', 'papersetno'],
  reviewer: ['paperreviewer', 'reviewer', 'questionpaperreviewer', 'paperchecker', 'checker', 'verifier'],
  evaluator: ['marksevaluator', 'evaluator', 'marksteacher', 'marksentry', 'marksentryteacher', 'examiner'],
  deadline: ['deadline', 'duedate', 'lastdate', 'targetdate'],
};

// The columns a row cannot be resolved without.
const REQUIRED_FIELDS = ['courseCode', 'section'];

const TEMPLATE_HEADERS = [
  'Exam', 'School', 'Department', 'Program', 'Semester', 'Class',
  'Subject Code', 'Subject', 'Paper Set', 'Paper Reviewer', 'Marks Evaluator', 'Deadline',
];

// ── Lookup tables, loaded once per validation run ────────────────────────────

const loadLookups = async () => {
  const [courses] = await pool.query(
    `SELECT c.id, c.course_code, c.subject_name, c.semester, c.academic_year, c.program_id,
            p.name AS program_name, p.code AS program_code
     FROM courses c LEFT JOIN programs p ON p.id = c.program_id`,
  );
  const [classes] = await pool.query(
    `SELECT ac.id, ac.program_id, ac.academic_session_id, ac.semester, ac.section, ac.status,
            p.name AS program_name, p.code AS program_code, sess.name AS session_name
     FROM academic_classes ac
     LEFT JOIN programs p ON p.id = ac.program_id
     LEFT JOIN academic_sessions sess ON sess.id = ac.academic_session_id`,
  );
  const [teachers] = await pool.query(
    'SELECT id, name, email, employee_id, role FROM teachers',
  );
  return { courses, classes, teachers };
};

// Papers are looked up per (examination, course) — one small query per distinct
// course in the sheet rather than one per row.
const loadPapersForCourses = async (examinationId, courseIds) => {
  if (courseIds.length === 0) return new Map();
  const placeholders = courseIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT id, course_id, exam_type, paper_set, status, examination_id
     FROM question_papers
     WHERE course_id IN (${placeholders}) AND (examination_id = ? OR examination_id IS NULL)
     ORDER BY version DESC`,
    [...courseIds, examinationId],
  );
  const byCourse = new Map();
  for (const row of rows) {
    if (!byCourse.has(row.course_id)) byCourse.set(row.course_id, []);
    byCourse.get(row.course_id).push(row);
  }
  return byCourse;
};

const loadExistingAssignments = async (paperIds) => {
  if (paperIds.length === 0) return [];
  const placeholders = paperIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT pa.question_paper_id, pa.class_id, pa.responsibility, pa.user_id, t.name, t.email
     FROM paper_assignments pa JOIN teachers t ON t.id = pa.user_id
     WHERE pa.question_paper_id IN (${placeholders})`,
    paperIds,
  );
  return rows;
};

// ── Per-field resolvers ──────────────────────────────────────────────────────

const resolveTeacher = (text, teachers) => {
  if (!text) return { teacher: null, reason: null };
  const key = norm(text);
  const byEmail = teachers.filter((t) => norm(t.email) === key);
  if (byEmail.length === 1) return { teacher: byEmail[0], reason: null };
  const byEmployeeId = teachers.filter((t) => t.employee_id && norm(t.employee_id) === key);
  if (byEmployeeId.length === 1) return { teacher: byEmployeeId[0], reason: null };
  const byName = teachers.filter((t) => norm(t.name) === key);
  if (byName.length === 1) return { teacher: byName[0], reason: null };
  if (byName.length > 1) {
    return { teacher: null, reason: `"${text}" matches ${byName.length} teachers by name — use their email address instead.` };
  }
  return { teacher: null, reason: `Teacher "${text}" was not found (checked email, employee ID and name).` };
};

const resolveCourse = (row, courses) => {
  const codeKey = norm(row.courseCode);
  let candidates = courses.filter((c) => norm(c.course_code) === codeKey);
  if (candidates.length === 0) {
    return { course: null, reason: `Subject code "${row.courseCode}" was not found.` };
  }
  if (candidates.length > 1 && row.program) {
    const progKey = norm(row.program);
    const narrowed = candidates.filter(
      (c) => norm(c.program_code) === progKey || norm(c.program_name) === progKey,
    );
    if (narrowed.length > 0) candidates = narrowed;
  }
  if (candidates.length > 1 && row.semester) {
    const narrowed = candidates.filter((c) => String(c.semester) === String(row.semester));
    if (narrowed.length > 0) candidates = narrowed;
  }
  if (candidates.length > 1) {
    const shown = candidates.slice(0, 3)
      .map((c) => `${c.subject_name} (Sem ${c.semester}, ${c.academic_year})`).join('; ');
    return {
      course: null,
      reason: `Subject code "${row.courseCode}" matches ${candidates.length} courses — ${shown}. Add a Program and Semester to identify one.`,
    };
  }
  return { course: candidates[0], reason: null };
};

const resolveClass = (row, classes, course, examination) => {
  const sectionKey = norm(row.section);
  let candidates = classes.filter((c) => norm(c.section) === sectionKey);
  if (candidates.length === 0) {
    return { klass: null, reason: `Class "${row.section}" was not found.` };
  }
  // A class belongs to a program; the course's own program is the strongest signal.
  if (course && course.program_id) {
    const narrowed = candidates.filter((c) => c.program_id === course.program_id);
    if (narrowed.length > 0) {
      candidates = narrowed;
    } else {
      return {
        klass: null,
        reason: `Class "${row.section}" does not belong to the program of subject "${row.courseCode}".`,
      };
    }
  }
  const semester = row.semester || (course && course.semester);
  if (semester) {
    const narrowed = candidates.filter((c) => String(c.semester) === String(semester));
    if (narrowed.length > 0) candidates = narrowed;
  }
  if (candidates.length > 1 && examination && examination.academic_session_id) {
    const narrowed = candidates.filter((c) => c.academic_session_id === examination.academic_session_id);
    if (narrowed.length > 0) candidates = narrowed;
  }
  if (candidates.length > 1) {
    const shown = candidates.slice(0, 3)
      .map((c) => `${c.program_code || c.program_name} Sem ${c.semester} (${c.session_name || 'no session'})`).join('; ');
    return {
      klass: null,
      reason: `Class "${row.section}" matches ${candidates.length} classes — ${shown}. Set the examination's academic session, or add a Semester column, to identify one.`,
    };
  }
  return { klass: candidates[0], reason: null };
};

const resolvePaper = (row, papers, examination) => {
  const forCourse = papers || [];
  if (forCourse.length === 0) {
    return { paper: null, reason: `No question paper has been uploaded for subject "${row.courseCode}" in this examination. Upload the paper first, then re-import this allocation.` };
  }
  const ofType = forCourse.filter((p) => p.exam_type === examination.exam_type);
  if (ofType.length === 0) {
    return { paper: null, reason: `No ${examination.exam_type} question paper exists for subject "${row.courseCode}" — the uploaded paper(s) are for a different exam component.` };
  }
  if (row.paperSet) {
    const setKey = norm(row.paperSet);
    const matched = ofType.filter((p) => norm(p.paper_set) === setKey);
    if (matched.length === 0) {
      const available = [...new Set(ofType.map((p) => p.paper_set || '(no set)'))].join(', ');
      return { paper: null, reason: `Paper set "${row.paperSet}" was not found for subject "${row.courseCode}" — available: ${available}.` };
    }
    return { paper: matched[0], reason: null };
  }
  // No Paper Set given: unambiguous only when the subject has exactly one paper.
  if (ofType.length > 1) {
    const available = [...new Set(ofType.map((p) => p.paper_set || '(no set)'))].join(', ');
    return { paper: null, reason: `Subject "${row.courseCode}" has ${ofType.length} question papers (${available}) — fill in the Paper Set column.` };
  }
  return { paper: ofType[0], reason: null };
};

// ── Validation ───────────────────────────────────────────────────────────────

const validateAllocationWorkbook = async ({ buffer, filename, examinationId }) => {
  const examination = await getExaminationById(examinationId);
  if (!examination) {
    throw Object.assign(new Error('Examination not found.'), { status: 404 });
  }

  const grid = await loadWorkbookRows({ buffer, filename });
  const header = findFirstHeaderRow(grid, COLUMN_ALIASES);
  if (!header) {
    return {
      examination,
      headerError: 'Could not detect an allocation header row. The sheet needs at least a Subject Code and a Class column — download the template to see the expected headers.',
      rows: [], summary: { totalRows: 0, validRows: 0, errorRows: 0, alreadyExisting: 0 },
    };
  }
  const { mapping, index: headerRowIdx } = header;
  const missingRequired = REQUIRED_FIELDS.filter((f) => !mapping[f]);
  if (missingRequired.length > 0) {
    const labels = { courseCode: 'Subject Code', section: 'Class' };
    return {
      examination,
      headerError: `The sheet is missing required column(s): ${missingRequired.map((f) => labels[f] || f).join(', ')}.`,
      rows: [], summary: { totalRows: 0, validRows: 0, errorRows: 0, alreadyExisting: 0 },
    };
  }

  const { courses, classes, teachers } = await loadLookups();

  // Pass 1 — read the cells.
  const parsed = [];
  for (let i = headerRowIdx + 1; i < grid.length; i += 1) {
    const raw = grid[i];
    if (isEmptyRow(raw)) continue;
    parsed.push({
      rowNumber: i + 1,
      data: Object.fromEntries(
        Object.keys(COLUMN_ALIASES).map((field) => [field, readValue(raw, mapping[field] || [])]),
      ),
    });
  }

  // Pass 2 — resolve course/class/teachers, so the papers query knows which courses to load.
  const staged = parsed.map(({ rowNumber, data }) => {
    const reasons = [];

    if (data.exam) {
      const named = norm(data.exam);
      if (named !== norm(examination.code) && named !== norm(examination.name)) {
        reasons.push(`Row is for examination "${data.exam}", but this import targets "${examination.name}".`);
      }
    }
    if (!data.courseCode) reasons.push('Subject Code is missing.');
    if (!data.section) reasons.push('Class is missing.');
    if (!data.reviewer && !data.evaluator) {
      reasons.push('Row has neither a Paper Reviewer nor a Marks Evaluator — nothing to allocate.');
    }

    const { course, reason: courseReason } = data.courseCode
      ? resolveCourse(data, courses) : { course: null, reason: null };
    if (courseReason) reasons.push(courseReason);

    const { klass, reason: classReason } = data.section && !courseReason
      ? resolveClass(data, classes, course, examination) : { klass: null, reason: null };
    if (classReason) reasons.push(classReason);

    const { teacher: reviewer, reason: reviewerReason } = resolveTeacher(data.reviewer, teachers);
    if (reviewerReason) reasons.push(`Paper Reviewer: ${reviewerReason}`);
    const { teacher: evaluator, reason: evaluatorReason } = resolveTeacher(data.evaluator, teachers);
    if (evaluatorReason) reasons.push(`Marks Evaluator: ${evaluatorReason}`);

    return { rowNumber, data, reasons, course, klass, reviewer, evaluator, paper: null };
  });

  // Pass 3 — resolve the question paper for each row.
  const courseIds = [...new Set(staged.map((r) => r.course && r.course.id).filter(Boolean))];
  const papersByCourse = await loadPapersForCourses(examination.id, courseIds);
  for (const row of staged) {
    if (!row.course || row.reasons.length > 0) continue;
    const { paper, reason } = resolvePaper(row.data, papersByCourse.get(row.course.id), examination);
    if (reason) row.reasons.push(reason); else row.paper = paper;
  }

  // Pass 4 — duplicates within the file, and conflicts with what is already allocated.
  const paperIds = [...new Set(staged.map((r) => r.paper && r.paper.id).filter(Boolean))];
  const existing = await loadExistingAssignments(paperIds);
  const existingKey = new Map(
    existing.map((a) => [`${a.question_paper_id}|${a.class_id}|${a.responsibility}`, a]),
  );

  const seenInFile = new Map();
  for (const row of staged) {
    if (row.reasons.length > 0 || !row.paper || !row.klass) continue;
    const pairs = [
      ['PAPER_REVIEWER', row.reviewer],
      ['MARKS_ENTRY', row.evaluator],
    ].filter(([, teacher]) => teacher);

    row.allocations = [];
    for (const [responsibility, teacher] of pairs) {
      const key = `${row.paper.id}|${row.klass.id}|${responsibility}`;
      const label = responsibility === 'PAPER_REVIEWER' ? 'Paper Reviewer' : 'Marks Evaluator';

      const priorRow = seenInFile.get(key);
      if (priorRow !== undefined) {
        row.reasons.push(`Duplicate ${label} allocation — the same subject, paper set and class already appears on row ${priorRow}.`);
        continue;
      }
      seenInFile.set(key, row.rowNumber);

      const already = existingKey.get(key);
      if (already && already.user_id === teacher.id) {
        row.allocations.push({ responsibility, teacher, state: 'unchanged' });
      } else if (already) {
        row.reasons.push(`${label} for this class is already allocated to ${already.name} (${already.email}). Remove that allocation first if you mean to replace it.`);
      } else {
        row.allocations.push({ responsibility, teacher, state: 'new' });
      }
    }
  }

  // Categorize.
  const rows = staged.map((row) => {
    let outcome = 'create';
    if (row.reasons.length > 0) outcome = 'invalid';
    else if (!row.allocations || row.allocations.length === 0) outcome = 'invalid';
    else if (row.allocations.every((a) => a.state === 'unchanged')) outcome = 'alreadyExisting';
    if (outcome === 'invalid' && row.reasons.length === 0) {
      row.reasons.push('Row resolved to no allocation.');
    }
    return {
      rowNumber: row.rowNumber,
      data: row.data,
      outcome,
      reasons: row.reasons,
      resolved: {
        courseId: row.course ? row.course.id : null,
        subjectName: row.course ? row.course.subject_name : null,
        classId: row.klass ? row.klass.id : null,
        classLabel: row.klass ? `${row.klass.program_code || row.klass.program_name} • Sem ${row.klass.semester} • ${row.klass.section}` : null,
        questionPaperId: row.paper ? row.paper.id : null,
        paperSet: row.paper ? row.paper.paper_set : null,
        paperStatus: row.paper ? row.paper.status : null,
        reviewer: row.reviewer ? { id: row.reviewer.id, name: row.reviewer.name, email: row.reviewer.email } : null,
        evaluator: row.evaluator ? { id: row.evaluator.id, name: row.evaluator.name, email: row.evaluator.email } : null,
      },
      allocations: (row.allocations || []).map((a) => ({
        responsibility: a.responsibility, userId: a.teacher.id, state: a.state, deadline: row.data.deadline || null,
      })),
    };
  });

  const summary = {
    totalRows: rows.length,
    validRows: rows.filter((r) => r.outcome === 'create').length,
    errorRows: rows.filter((r) => r.outcome === 'invalid').length,
    alreadyExisting: rows.filter((r) => r.outcome === 'alreadyExisting').length,
    assignmentsToCreate: rows
      .filter((r) => r.outcome === 'create')
      .reduce((n, r) => n + r.allocations.filter((a) => a.state === 'new').length, 0),
  };

  return { examination, headerError: null, rows, summary };
};

// ── Import ───────────────────────────────────────────────────────────────────

// Re-validates from the uploaded bytes and writes ONLY the rows that come back
// valid — the preview is never trusted as an instruction, so a course, class or
// paper that changed since the preview was rendered cannot slip through.
//
// Everything below runs on `conn` inside one transaction: a failure part-way
// through a 350-row sheet leaves no half-applied allocation behind. Notifications
// and emails are deliberately raised AFTER the commit, by the caller, so a mail
// outage can never roll back an allocation that is already correct.
const importAllocations = async ({ buffer, filename, examinationId, importedBy }) => {
  const validation = await validateAllocationWorkbook({ buffer, filename, examinationId });
  if (validation.headerError) {
    throw Object.assign(new Error(validation.headerError), { status: 400 });
  }

  const toImport = validation.rows.filter((r) => r.outcome === 'create');
  const notifications = [];

  const written = await withTransaction(async (conn) => {
    let assignmentsCreated = 0;
    const touchedPapers = new Set();
    const enrolledPairs = new Set();

    for (const row of toImport) {
      const { courseId, classId, questionPaperId } = row.resolved;

      for (const allocation of row.allocations) {
        if (allocation.state !== 'new') continue;
        // NULL-safe upsert, same shape as paperAssignmentModel.assignResponsibility —
        // written against `conn` here so it joins this transaction.
        const [existing] = await conn.query(
          `SELECT id FROM paper_assignments
           WHERE question_paper_id = ? AND user_id = ? AND responsibility = ? AND class_id <=> ?
           LIMIT 1`,
          [questionPaperId, allocation.userId, allocation.responsibility, classId],
        );
        if (existing.length > 0) {
          await conn.query(
            'UPDATE paper_assignments SET deadline = ?, assigned_by = ?, course_id = ?, assigned_at = CURRENT_TIMESTAMP WHERE id = ?',
            [allocation.deadline || null, importedBy, courseId, existing[0].id],
          );
        } else {
          await conn.query(
            `INSERT INTO paper_assignments
               (question_paper_id, course_id, user_id, responsibility, assigned_by, deadline, class_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [questionPaperId, courseId, allocation.userId, allocation.responsibility,
              importedBy, allocation.deadline || null, classId],
          );
          assignmentsCreated += 1;
        }

        // A marks evaluator acts through the EXISTING marks endpoints, which are gated
        // by user_course_assignments — grant that here so the allocation is usable
        // without a second, separate grant (mirrors the single-assignment route).
        if (allocation.responsibility === 'MARKS_ENTRY') {
          await conn.query(
            `INSERT INTO user_course_assignments (user_id, course_id, assigned_role)
             VALUES (?, ?, 'Teacher')
             ON DUPLICATE KEY UPDATE assigned_role = VALUES(assigned_role)`,
            [allocation.userId, courseId],
          );
        }

        notifications.push({
          userId: allocation.userId,
          responsibility: allocation.responsibility,
          questionPaperId,
          subjectName: row.resolved.subjectName,
          classLabel: row.resolved.classLabel,
        });
      }

      // The allocated class must actually be enrolled in the course, or the evaluator
      // opens the paper to an empty roster. Set-based rather than one INSERT per
      // student, and idempotent via the (course_id, student_id) unique key.
      const pairKey = `${classId}|${courseId}`;
      if (!enrolledPairs.has(pairKey)) {
        enrolledPairs.add(pairKey);
        await conn.query(
          `INSERT IGNORE INTO course_enrollments (course_id, student_id)
           SELECT ?, cs.student_id FROM class_students cs WHERE cs.class_id = ?`,
          [courseId, classId],
        );
      }

      touchedPapers.add(questionPaperId);
    }

    // Papers that were sitting unassigned move into the review queue, and every paper
    // touched by this sheet is attached to the examination it was allocated under.
    for (const paperId of touchedPapers) {
      await conn.query(
        `UPDATE question_papers SET examination_id = COALESCE(examination_id, ?),
           status = CASE WHEN status IN ('UPLOADED', 'EXTRACTED') THEN 'ASSIGNED_FOR_REVIEW' ELSE status END
         WHERE id = ?`,
        [examinationId, paperId],
      );
    }

    const errors = validation.rows
      .filter((r) => r.outcome === 'invalid')
      .map((r) => ({ row: r.rowNumber, reasons: r.reasons, data: r.data }));

    await conn.query(
      `INSERT INTO allocation_imports
         (examination_id, file_name, total_rows, valid_rows, error_rows, imported_rows,
          assignments_created, errors_json, imported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [examinationId, filename, validation.summary.totalRows, validation.summary.validRows,
        validation.summary.errorRows, toImport.length, assignmentsCreated,
        errors.length ? JSON.stringify(errors) : null, importedBy],
    );

    return { assignmentsCreated, papersTouched: touchedPapers.size, classesEnrolled: enrolledPairs.size };
  });

  return {
    examination: validation.examination,
    summary: { ...validation.summary, importedRows: toImport.length, ...written },
    rows: validation.rows,
    notifications,
  };
};

module.exports = {
  validateAllocationWorkbook, importAllocations, COLUMN_ALIASES, TEMPLATE_HEADERS,
};
