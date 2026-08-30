const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const protect = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { applyReadScope } = require('../middlewares/scopeMiddleware');
const { logAction } = require('../models/adminAuditModel');
const {
  getStudentsForClass, removeStudentFromClass, addManyStudentsToClass,
} = require('../models/academicModel');
const {
  createStudent, updateStudent, getStudentById, listStudents, mapStudentToClass,
  findStudentByAnyIdentifier, findStudentInContext, getStudentsByContext,
  enrollStudentInAllContextCourses, deleteStudentById,
} = require('../models/studentMasterModel');
const { getCourseById } = require('../models/courseModel');
const { getProgramByIdWithContext } = require('../models/academicModel');

// Phase 10 — validates a student academic context (Program + Session + Semester):
//   - the Program must exist
//   - the Session must exist
//   - the semester must be within 1 → program.total_semesters (duration × 2, never hardcoded)
// Returns { ok, error } — never trusts client-supplied school/department names; those are
// always derived from the Program's own Department → School relationship.
const validateStudentContext = async ({ programId, sessionId, semester }) => {
  if (!programId) return { ok: false, error: 'programId is required for a student academic context.' };
  const program = await getProgramByIdWithContext(programId);
  if (!program) return { ok: false, error: 'The selected Program does not exist.' };
  if (!sessionId) return { ok: false, error: 'sessionId is required for a student academic context.' };
  const [[session]] = await pool.query('SELECT id FROM academic_sessions WHERE id = ?', [sessionId]);
  if (!session) return { ok: false, error: 'The selected Academic Session does not exist.' };
  const sem = Number(semester);
  if (!Number.isFinite(sem) || sem < 1 || sem > Number(program.total_semesters)) {
    return {
      ok: false,
      error: `Semester ${sem} is invalid for ${program.name} (${program.duration} year(s) = ${program.total_semesters} semesters). Valid range: Sem 1 to Sem ${program.total_semesters}.`,
    };
  }
  return { ok: true, program, semester: sem };
};

// Phase 8 — server-side student read scoping (IDOR hardening). A caller must not gain access
// to a student merely by changing an id in the URL:
//   Admin / Examination Team  — any student.
//   School Admin              — students whose academic Program belongs to their School.
//   Department Admin          — students whose academic Program belongs to their Department.
//   Teacher / Viewer          — students enrolled in a course they own or are assigned to.
const canReadStudent = async (user, studentId) => {
  const { role } = user;
  if (role === 'Admin' || role === 'Examination Team') return true;

  if (role === 'School Admin') {
    if (!user.school_id) return false;
    const [[row]] = await pool.query(
      `SELECT 1 FROM students st
       LEFT JOIN programs p ON p.id = st.academic_program_id
       LEFT JOIN departments d ON d.id = p.department_id
       WHERE st.id = ? AND d.school_id = ? LIMIT 1`,
      [studentId, user.school_id],
    );
    return !!row;
  }

  if (role === 'Department Admin') {
    if (!user.department_id) return false;
    const [[row]] = await pool.query(
      `SELECT 1 FROM students st
       LEFT JOIN programs p ON p.id = st.academic_program_id
       WHERE st.id = ? AND p.department_id = ? LIMIT 1`,
      [studentId, user.department_id],
    );
    return !!row;
  }

  const [[row]] = await pool.query(
    `SELECT 1 FROM course_enrollments ce
     JOIN courses c ON c.id = ce.course_id
     LEFT JOIN user_course_assignments uca ON uca.course_id = c.id AND uca.user_id = ?
     WHERE ce.student_id = ? AND (c.teacher_id = ? OR uca.id IS NOT NULL) LIMIT 1`,
    [user.id, studentId, user.id],
  );
  return !!row;
};

// Phase 8 — read scoping for class-membership access (School/Department Admin only; other
// roles keep the existing open read because the course-enrollment workflow depends on it).
const isClassInScope = async (user, classId) => {
  const { role } = user;
  if (role !== 'School Admin' && role !== 'Department Admin') return true;
  const [[row]] = await pool.query(
    `SELECT d.school_id, p.department_id FROM academic_classes ac
     LEFT JOIN programs p ON p.id = ac.program_id
     LEFT JOIN departments d ON d.id = p.department_id
     WHERE ac.id = ?`,
    [classId],
  );
  if (!row) return null;
  if (role === 'School Admin') return Boolean(user.school_id && String(row.school_id) === String(user.school_id));
  return String(row.department_id) === String(user.department_id);
};

// A registration number/name that looks nothing like the real patterns in this system (short,
// all-letters, no digits) is flagged for an administrator's attention — never auto-corrected
// or auto-deleted (Section 18). Purely a display hint computed on read, not a stored field.
const looksLikePlaceholder = (student) => {
  const reg = (student.registration_number || '').trim();
  const name = (student.name || '').trim();
  const shortAllLetters = /^[A-Za-z]{1,4}$/.test(reg);
  const singleCharName = name.length <= 2;
  return shortAllLetters || singleCharName;
};

// ---------- Student Master ----------
// Section 14 — search/filter across Registration No, Name, Roll No, Program, Department,
// Session, Semester, Class, Status, server-side paginated. Section 2/45 — School Admin /
// Department Admin only ever see students within their own scope.
router.get('/students', protect, async (req, res, next) => {
  try {
    const filters = applyReadScope(req.user, {
      search: req.query.search,
      status: req.query.status,
      programId: req.query.programId,
      sessionId: req.query.sessionId,
      semester: req.query.semester,
      classId: req.query.classId,
      departmentId: req.query.departmentId,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    const { rows, total, limit, offset } = await listStudents(filters);
    const data = rows.map((s) => ({ ...s, isPlaceholderSuspect: looksLikePlaceholder(s) }));
    res.json({ success: true, data, meta: { total, limit, offset } });
  } catch (err) { next(err); }
});

// Phase 10 — create a student with its academic context. The Student belongs to a Program +
// Session + Semester (exactly like a Course). The same academic context determines which
// courses the student automatically appears in — no per-course student list duplication.
router.post('/students', protect, authorizeRoles('Admin', 'Moderator', 'Examination Team', 'Teacher'), async (req, res, next) => {
  try {
    const { registrationNumber, rollNumber, name, email, phone, status, programId, sessionId, semester } = req.body;
    if (!registrationNumber || !name) {
      return res.status(400).json({ success: false, message: 'registrationNumber and name are required.' });
    }

    // Validate the academic context if provided (programId, sessionId, semester)
    let validatedContext = null;
    if (programId && sessionId && semester !== undefined && semester !== null && semester !== '') {
      const v = await validateStudentContext({ programId, sessionId, semester });
      if (!v.ok) return res.status(400).json({ success: false, message: v.error });
      validatedContext = v;
    }

    // Context-aware duplicate check: same registration_number within the same Program+Session
    // is a duplicate; same registration_number in a different historical context is allowed.
    if (validatedContext) {
      const existing = await findStudentInContext({ registrationNumber, programId, sessionId });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `A student with enrollment number "${registrationNumber}" already exists in this Program + Academic Year.`,
          data: { student: existing },
        });
      }
    } else {
      const existing = await findStudentByAnyIdentifier(registrationNumber);
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `A student with identifier "${registrationNumber}" already exists (id ${existing.id}).`,
          data: { student: existing },
        });
      }
    }

    const { student, created } = await createStudent({
      registrationNumber, rollNumber, name, email, phone, status,
      programId: validatedContext?.program?.id || programId || null,
      sessionId: sessionId || null,
      semester: validatedContext?.semester ?? semester ?? null,
    });
    if (created && validatedContext) {
      // Enroll into every course matching this academic context
      await enrollStudentInAllContextCourses({
        studentId: student.id, programId: validatedContext.program.id,
        sessionId, semester: validatedContext.semester,
      });
      await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'create', entityType: 'student', entityId: student.id, details: { registrationNumber, name, programId, sessionId, semester } });
    } else if (created) {
      await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'create', entityType: 'student', entityId: student.id, details: { registrationNumber, name } });
    }
    res.status(created ? 201 : 200).json({
      success: true,
      message: created ? 'Student created.' : 'Student already exists (reused master).',
      data: { student },
    });
  } catch (err) { next(err); }
});

router.put('/students/:id', protect, authorizeRoles('Admin', 'Moderator', 'Examination Team', 'Teacher'), async (req, res, next) => {
  try {
    const { registrationNumber, rollNumber, name, email, phone, status, programId, sessionId, semester } = req.body;
    if (programId || sessionId || (semester !== undefined && semester !== null && semester !== '')) {
      const v = await validateStudentContext({
        programId: programId || undefined,
        sessionId: sessionId || undefined,
        semester: semester ?? undefined,
      });
      if (!v.ok) return res.status(400).json({ success: false, message: v.error });
    }
    const updated = await updateStudent(req.params.id, { registrationNumber, rollNumber, name, email, phone, status, programId, sessionId, semester });
    if (!updated) return res.status(404).json({ success: false, message: 'Student not found.' });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'update', entityType: 'student', entityId: req.params.id, details: req.body });
    res.json({ success: true, message: 'Student updated.', data: { student: await getStudentById(req.params.id) } });
  } catch (err) { next(err); }
});

router.get('/students/:id', protect, async (req, res, next) => {
  try {
    const student = await getStudentById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    const allowed = await canReadStudent(req.user, req.params.id);
    if (!allowed) return res.status(403).json({ success: false, message: 'Forbidden: you cannot access this student.' });
    res.json({ success: true, data: student });
  } catch (err) { next(err); }
});

// Phase 10 — Course Student Upload & Context Sync
// ────────────────────────────────────────────────────────────────────────────────
// These endpoints follow the principle: Course → Program → Session → Semester →
// Students. The Teacher never enters School, Department, Program, Session, or
// Semester; the backend derives the full academic context from the assigned course.

// GET /api/courses/:id/enrollment — list enrolled students (auto-syncs from context)
// Already exists in courseRoutes.js — we add context-sync on the enrollment GET route.
// The POST /api/courses/:id/enrollment/sync-context is here for explicit sync.

// POST /api/courses/:id/enrollment/sync-context — enroll all students belonging to the
// course's academic context (Program + Session + Semester) into this course.
// Idempotent (INSERT IGNORE) — never removes existing enrollments.
router.post('/courses/:id/enrollment/sync-context', protect, async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.id, req.user.id, req.user.role);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });
    if (!course.program_id || !course.academic_session_id || !course.semester) {
      return res.status(400).json({ success: false, message: 'Course has no academic context (Program/Session/Semester). Link it to the hierarchy first.' });
    }
    const program = await getProgramByIdWithContext(course.program_id);
    if (!program) return res.status(400).json({ success: false, message: 'The linked Program no longer exists.' });
    const students = await getStudentsByContext({ programId: course.program_id, sessionId: course.academic_session_id, semester: course.semester });
    const enrolled = await enrollStudentInAllContextCourses({ studentId: null, programId: course.program_id, sessionId: course.academic_session_id, semester: course.semester });
    res.json({
      success: true,
      message: `${students.length} context student(s) synced into this course (${enrolled} new enrollments).`,
      data: { totalStudents: students.length, newEnrollments: enrolled, students },
    });
  } catch (err) { next(err); }
});

// GET /api/courses/:id/students — fetch students belonging to this course's academic
// context (Program + Session + Semester). Unlike GET /api/courses/:id/enrollment, this
// resolves dynamically from the context rather than the course_enrollments table, so
// students added/uploaded once for the context appear in every course automatically.
// Falls back to the enrollment table for legacy courses without a hierarchy link.
router.get('/courses/:id/students', protect, async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.id, req.user.id, req.user.role);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });

    if (course.program_id && course.academic_session_id && course.semester) {
      // Context-based resolution: students whose academic context matches the course.
      // First ensure they are enrolled (additive, idempotent) so the existing marks/
      // enrollment flows also find them.
      await enrollStudentInAllContextCourses({
        studentId: null, programId: course.program_id,
        sessionId: course.academic_session_id, semester: course.semester,
      });
      const students = await getStudentsByContext({
        programId: course.program_id, sessionId: course.academic_session_id,
        semester: course.semester,
      });
      return res.json({ success: true, data: students, context: true });
    }
    // Fallback to enrollment table for legacy courses
    const { getEnrolledStudentsForCourse } = require('../models/academicModel');
    const students = await getEnrolledStudentsForCourse(course.id);
    res.json({ success: true, data: students, context: false });
  } catch (err) { next(err); }
});

// POST /api/courses/:id/students/upload — bulk upload students into the course's
// academic context. The Teacher provides only student-specific data:
//   { students: [{ enrollmentNo, rollNo, name, email, phone }] }
// The backend derives School, Department, Program, Session, Semester from the course.
// Students are created/updated in the Student Master and enrolled into ALL courses
// sharing the same context — no per-course duplicate upload needed.
router.post('/courses/:id/students/upload', protect, async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.id, req.user.id, req.user.role);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });
    if (!course.program_id || !course.academic_session_id || !course.semester) {
      return res.status(400).json({ success: false, message: 'Course has no academic context. Link it to the hierarchy first.' });
    }

    const v = await validateStudentContext({
      programId: course.program_id, sessionId: course.academic_session_id, semester: course.semester,
    });
    if (!v.ok) return res.status(400).json({ success: false, message: v.error });

    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ success: false, message: 'Provide a non-empty students array. Each row: { enrollmentNo, rollNo, name, email?, phone? }.' });
    }

    let created = 0; let updated = 0; let enrolled = 0; const errors = [];
    for (let i = 0; i < students.length; i += 1) {
      const s = students[i];
      const rowNo = s.rowNumber || i + 1;
      const reg = String(s.enrollmentNo || s.registrationNumber || '').trim();
      if (!reg || !s.name) {
        errors.push({ row: rowNo, enrollmentNo: reg, name: s.name || '', problem: 'Missing enrollment number or student name.' });
        // eslint-disable-next-line no-continue
        continue;
      }
      try {
        // Context-aware lookup: same enrollment number in this program+session = update
        const existing = await findStudentInContext({ registrationNumber: reg, programId: course.program_id, sessionId: course.academic_session_id });
        let studentId;
        if (existing) {
          await updateStudent(existing.id, {
            rollNumber: s.rollNo || s.rollNumber || null,
            name: s.name, email: s.email || null, phone: s.phone || null,
            status: 'Active',
          });
          studentId = existing.id;
          updated += 1;
        } else {
          const { student, created: isNew } = await createStudent({
            registrationNumber: reg, rollNumber: s.rollNo || s.rollNumber || null,
            name: s.name, email: s.email || null, phone: s.phone || null,
            status: 'Active', programId: course.program_id, sessionId: course.academic_session_id, semester: course.semester,
          });
          studentId = student.id;
          if (isNew) created += 1;
          else updated += 1;
        }
        // Enroll this student into ALL courses of the context
        enrolled += await enrollStudentInAllContextCourses({
          studentId, programId: course.program_id,
          sessionId: course.academic_session_id, semester: course.semester,
        });
      } catch (err) {
        errors.push({ row: rowNo, enrollmentNo: reg, name: s.name, problem: err.message });
      }
    }

    // Idempotent bulk sync: ensure every context student is enrolled in every context course
    enrolled += await enrollStudentInAllContextCourses({
      studentId: null, programId: course.program_id,
      sessionId: course.academic_session_id, semester: course.semester,
    });

    res.json({
      success: true,
      message: `${created + updated} student(s) processed (${created} created, ${updated} updated, ${enrolled} enrollments).`,
      data: { created, updated, enrolled, errors, total: created + updated },
    });
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────────────────────────────────────

// Map a student into an academic class (Phase 3J workflow).
// Body: { classId, programId?, sessionId?, semester?, section? }
router.post('/students/:id/map', protect, authorizeRoles('Admin', 'Moderator', 'Examination Team', 'Teacher'), async (req, res, next) => {
  try {
    const { classId, programId, sessionId, semester, section } = req.body;
    if (!classId) return res.status(400).json({ success: false, message: 'classId is required.' });
    const student = await mapStudentToClass({ studentId: req.params.id, classId, programId, sessionId, semester, section });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'map', entityType: 'student', entityId: req.params.id, details: { classId, programId, sessionId, semester, section } });
    res.json({ success: true, message: 'Student mapped to academic class.', data: { student } });
  } catch (err) { next(err); }
});

// ---------- Class Membership ----------
router.get('/classes/:id/students', protect, async (req, res, next) => {
  try {
    const inScope = await isClassInScope(req.user, req.params.id);
    if (inScope === null) return res.status(404).json({ success: false, message: 'Class not found.' });
    if (!inScope) return res.status(403).json({ success: false, message: 'Forbidden: outside your School/Department.' });
    const rows = await getStudentsForClass(req.params.id);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/classes/:id/students', protect, authorizeRoles('Admin', 'Moderator', 'Examination Team', 'Teacher'), async (req, res, next) => {
  try {
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'studentIds array is required.' });
    }
    await addManyStudentsToClass(req.params.id, studentIds);
    res.json({ success: true, message: 'Students added to class.' });
  } catch (err) { next(err); }
});

router.delete('/classes/:id/students/:studentId', protect, authorizeRoles('Admin', 'Moderator', 'Examination Team', 'Teacher'), async (req, res, next) => {
  try {
    const removed = await removeStudentFromClass(req.params.id, req.params.studentId);
    if (!removed) return res.status(404).json({ success: false, message: 'Student not in class.' });
    res.json({ success: true, message: 'Student removed from class.' });
  } catch (err) { next(err); }
});

// DELETE /api/students/:id — permanently removes a student and all associated records.
// Only Admin and Moderator may delete students; Teachers can unenroll but not delete.
router.delete('/students/:id', protect, authorizeRoles('Admin', 'Moderator'), async (req, res, next) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (!studentId) return res.status(400).json({ success: false, message: 'Invalid student ID.' });

    const student = await getStudentById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    const deleted = await deleteStudentById(studentId);
    if (!deleted) return res.status(500).json({ success: false, message: 'Failed to delete student.' });

    await logAction({
      actorUserId: req.user.id, actorName: req.user.email,
      action: 'delete', entityType: 'student', entityId: studentId,
      details: { name: student.name, registrationNumber: student.registration_number },
    });

    res.json({ success: true, message: `Student "${student.name}" (${student.registration_number}) has been permanently deleted.` });
  } catch (err) { next(err); }
});

module.exports = router;