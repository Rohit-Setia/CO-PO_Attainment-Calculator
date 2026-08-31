const express = require('express');
const router = express.Router();
const protect = require('../middlewares/authMiddleware');
const { checkCoursePermission, authorizeRoles } = require('../middlewares/roleMiddleware');
const {
  createCourse,
  getCoursesByTeacher,
  getCourseById,
  deleteCourse,
  assignUserToCourse,
  removeUserFromCourse,
  getAssignmentsForCourse,
} = require('../models/courseModel');
const {
  getConfig,
  saveConfig,
  getCoPoValuesForCourse,
  getCoPoAveragesForCourse,
  saveCoPoValue,
} = require('../models/mappingModel');
const {
  getCoMarksForCourse,
  getQuestionMarksForCourse,
  saveStudentMark,
  saveStudentCoMarks,
  saveStudentQuestionMarks,
  deleteMarksByCourse,
} = require('../models/marksModel');
const {
  MAX_COS_PER_COURSE,
  getActiveOutcomes,
  getOutcomeById,
  addCourseOutcome,
  updateCourseOutcome,
  archiveCourseOutcome,
} = require('../models/courseOutcomeModel');
const {
  MAX_QUESTIONS_PER_EXAM,
  getQuestionConfigs,
  replaceQuestionConfigs,
} = require('../models/questionConfigModel');
const { calculateCourseAttainment } = require('../utils/attainmentCalculator');
const { distributeTotalMarksToCos, calculateExamTotalMax } = require('../utils/marksDistribution');
const pool = require('../config/db');
const { findUserByEmail } = require('../models/userModel');
const { logAction } = require('../models/adminAuditModel');
const {
  getCourseHierarchyContext,
  getProgramByIdWithContext,
  getEnrolledStudentsForCourse,
  enrollStudentInCourse,
  unenrollStudentFromCourse,
  enrollManyStudentsInCourse,
  enrollEntireClassInCourse,
} = require('../models/academicModel');
const { enrollStudentInAllContextCourses } = require('../models/studentMasterModel');
const { getProgramOutcomesForCourse } = require('../models/programOutcomeModel');
const { buildMarksEntryWorkbook, buildMarksFileName } = require('../utils/marksTemplate');

const DEFAULT_CONFIG = {
  threshold_percent_internal: 40.0,
  threshold_percent_external: 40.0,
  level1_criteria_internal: 50.0,
  level2_criteria_internal: 60.0,
  level3_criteria_internal: 70.0,
  level1_criteria_external: 50.0,
  level2_criteria_external: 60.0,
  level3_criteria_external: 70.0,
  total_max_internal: 60,
  total_max_external: 100,
  internal_weight: 30.0,
  external_weight: 70.0,
};

// Loads the course and its active outcomes, 404ing consistently if either the course doesn't
// exist/isn't accessible, or an outcome id in the URL doesn't belong to it (prevents an
// authenticated user on one course from touching another course's CO/question/mapping rows by
// guessing ids).
async function loadCourseOr404(req, res) {
  const course = await getCourseById(req.params.id, req.user.id, req.user.role);
  if (!course) {
    res.status(404).json({ success: false, message: 'Course not found' });
    return null;
  }
  return course;
}

// 1. Course CRUD
router.get('/courses', protect, async (req, res, next) => {
  try {
    // getCoursesByTeacher is now role-aware: Admin/Exam Team see all, others see own/assigned
    const courses = await getCoursesByTeacher(req.user.id, req.user.role);

    if (courses.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const courseIds = courses.map((c) => c.id);
    const placeholders = courseIds.map(() => '?').join(', ');

    const [outcomeCountRows] = await pool.query(
      `SELECT course_id, COUNT(*) as count FROM course_outcomes WHERE course_id IN (${placeholders}) AND is_active = 1 GROUP BY course_id`,
      courseIds,
    );
    const [mappingConfiguredRows] = await pool.query(
      `SELECT co.course_id,
              MAX(GREATEST(
                COALESCE(cpv.po1, 0), COALESCE(cpv.po2, 0), COALESCE(cpv.po3, 0),
                COALESCE(cpv.po4, 0), COALESCE(cpv.po5, 0), COALESCE(cpv.po6, 0),
                COALESCE(cpv.po7, 0), COALESCE(cpv.po8, 0), COALESCE(cpv.po9, 0),
                COALESCE(cpv.po10, 0), COALESCE(cpv.po11, 0), COALESCE(cpv.po12, 0),
                COALESCE(cpv.pso1, 0), COALESCE(cpv.pso2, 0), COALESCE(cpv.pso3, 0)
              )) as anyMapped
       FROM course_outcomes co
       LEFT JOIN co_po_values cpv ON cpv.co_id = co.id
       WHERE co.course_id IN (${placeholders}) AND co.is_active = 1
       GROUP BY co.course_id`,
      courseIds,
    );
    const [markCountRows] = await pool.query(
      `SELECT course_id, exam_type, COUNT(*) as count FROM student_marks
       WHERE course_id IN (${placeholders}) GROUP BY course_id, exam_type`,
      courseIds,
    );

    const coCountByCourseId = new Map(outcomeCountRows.map((r) => [r.course_id, r.count]));

    // "Has a mapping configured" = at least one non-zero PO/PSO value anywhere for the course.
    // The single-column MAX(po1) check above is a cheap first pass; fall back to a full scan
    // only for courses where it didn't already find something (rare, cheap given course counts).
    const mappingConfiguredByCourseId = new Map();
    for (const row of mappingConfiguredRows) {
      mappingConfiguredByCourseId.set(row.course_id, (row.anyMapped || 0) > 0);
    }

    const marksByCourseId = new Map();
    markCountRows.forEach((row) => {
      const entry = marksByCourseId.get(row.course_id) || { MTT: 0, ETT: 0 };
      entry[row.exam_type] = row.count;
      marksByCourseId.set(row.course_id, entry);
    });

    const enriched = courses.map((course) => {
      const marks = marksByCourseId.get(course.id) || { MTT: 0, ETT: 0 };
      return {
        ...course,
        num_cos: coCountByCourseId.get(course.id) || 0,
        hasMapping: mappingConfiguredByCourseId.get(course.id) || false,
        hasInternalMarks: marks.MTT > 0,
        hasExternalMarks: marks.ETT > 0,
      };
    });

    // Phase 9 — attach the full academic hierarchy context (School / Department / Program /
    // Session + program code/degree/duration/total semesters) to every course, so the Teacher
    // interface can show complete academic information without extra round-trips. All values
    // come from the SAME hierarchy tables the Admin configures — never duplicated per course.
    const hierarchyMap = await getCourseHierarchyContext(courseIds);
    const withHierarchy = enriched.map((course) => {
      const h = hierarchyMap.get(course.id) || {};
      return {
        ...course,
        hierarchyLinked: Boolean(course.program_id),
        schoolName: h.school_name || null,
        schoolId: h.school_id || null,
        departmentName: h.department_name || null,
        departmentId: h.department_id || null,
        programName: h.program_name || null,
        programCode: h.program_code || null,
        programDegree: h.program_degree || null,
        programDuration: h.program_duration ?? null,
        programTotalSemesters: h.program_total_semesters ?? null,
        sessionId: h.session_id || null,
        sessionName: h.session_name || null,
      };
    });

    res.json({ success: true, data: withHierarchy });
  } catch (err) {
    next(err);
  }
});

// Only Admins, Examination Team, and Teachers can create courses
// Phase 9 — courses are created INSIDE the academic hierarchy (programId + sessionId), not as
// standalone free-text entries. The Admin's configured School/Department/Program/Session is the
// single source of truth: the free-text school/department fields are derived from the linked
// program so they can never drift from the hierarchy. Semester is validated against the
// program's computed total (duration × 2) — a 3-year BBA can never get Sem 7 or Sem 8.
router.post('/courses', protect, authorizeRoles('Admin', 'Moderator', 'Examination Team', 'Teacher'), async (req, res, next) => {
  try {
    const { programId, sessionId, subjectName, courseCode, semester, academicYear, numCos } = req.body;
    if (!programId || !subjectName || !courseCode || !semester) {
      return res.status(400).json({
        success: false,
        message: 'programId, subjectName, courseCode and semester are required.',
      });
    }

    // Academic Year comes from the selected Academic Session (Admin-configured) — the free-text
    // course.academic_year is derived from the session name so it can never drift from it.
    let sessionName = null;
    if (sessionId) {
      const [sessRows] = await pool.query('SELECT name FROM academic_sessions WHERE id = ?', [sessionId]);
      sessionName = sessRows[0]?.name || null;
    }
    const finalAcademicYear = academicYear || sessionName || '';

    const program = await getProgramByIdWithContext(programId);
    if (!program) {
      return res.status(400).json({ success: false, message: 'The selected Program does not exist.' });
    }
    const totalSemesters = program.total_semesters;
    const sem = Number(semester);
    if (!Number.isFinite(sem) || sem < 1 || sem > totalSemesters) {
      return res.status(400).json({
        success: false,
        message: `Semester ${sem} is invalid for ${program.name} (${program.duration} year(s) = ${totalSemesters} semesters). Valid range: Sem 1 to Sem ${totalSemesters}.`,
      });
    }

    // Duplicate course code within the same academic context (program + session) is rejected —
    // the same subject cannot be created twice for the same program year.
    const [dup] = await pool.query(
      'SELECT id FROM courses WHERE course_code = ? AND program_id = ? AND academic_session_id = ? LIMIT 1',
      [courseCode, programId, sessionId || null],
    );
    if (dup.length > 0) {
      return res.status(400).json({
        success: false,
        message: `A course with code "${courseCode}" already exists for this Program and Academic Year.`,
      });
    }

    // Free-text fields are derived from the linked program — Admin configures once, the course
    // always mirrors the hierarchy (never a separate Teacher-entered copy).
    const courseId = await createCourse({
      teacherId: req.user.id,
      school: program.school_name || '',
      department: program.department_name || '',
      subjectName,
      courseCode,
      semester: sem,
      academicYear: finalAcademicYear,
      numCos: numCos || 5,
      programId,
      sessionId: sessionId || null,
    });

    await saveConfig(courseId, DEFAULT_CONFIG);

    // Seed the requested number of Course Outcomes as real, individually-numbered rows —
    // not a fixed-width column set. The teacher can add/archive from here at any time.
    const initialCoCount = Math.min(numCos || 5, MAX_COS_PER_COURSE);
    for (let i = 0; i < initialCoCount; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- co_number must be assigned sequentially
      await addCourseOutcome(courseId, {});
    }

    res.status(201).json({ success: true, message: 'Course created successfully', data: { id: courseId } });
  } catch (err) {
    next(err);
  }
});

// Only Admin or the course creator (Teacher) can delete a course
router.delete('/courses/:id', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const deleted = await deleteCourse(req.params.id, req.user.id, req.user.role);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    res.json({ success: true, message: 'Course deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// Section 21 — soft lifecycle status. Historical courses with marks stay reportable; this is
// the preferred alternative to deleting a course, matching the pattern already used for
// Schools/Departments/Programs/Sessions/Classes.
router.put('/courses/:id/status', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;
    const { status } = req.body;
    if (!['Active', 'Inactive', 'Archived'].includes(status)) {
      return res.status(400).json({ success: false, message: "status must be 'Active', 'Inactive', or 'Archived'." });
    }
    await pool.query('UPDATE courses SET status = ? WHERE id = ?', [status, course.id]);
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'update_status', entityType: 'course', entityId: course.id, details: { from: course.status, to: status } });
    res.json({ success: true, message: `Course marked ${status}.` });
  } catch (err) {
    next(err);
  }
});

// ── Course Assignment Management ─────────────────────────────────────────────
router.post('/courses/:id/assign', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const { email, assigned_role } = req.body;

    if (!['Teacher', 'Viewer'].includes(assigned_role)) {
      return res.status(400).json({ success: false, message: 'assigned_role must be Teacher or Viewer' });
    }
    const targetUser = await findUserByEmail(email);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'No user found with that email.' });
    }

    await assignUserToCourse(courseId, targetUser.id, assigned_role);
    return res.json({
      success: true,
      message: `${targetUser.name} assigned as ${assigned_role} on this course.`,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/courses/:id/assign/:userId', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const removed = await removeUserFromCourse(req.params.id, req.params.userId);
    if (!removed) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    return res.json({ success: true, message: 'User removed from course.' });
  } catch (err) {
    next(err);
  }
});

router.get('/courses/:id/assignments', protect, checkCoursePermission(['Teacher', 'Viewer']), async (req, res, next) => {
  try {
    const assignments = await getAssignmentsForCourse(req.params.id);
    return res.json({ success: true, data: assignments });
  } catch (err) {
    next(err);
  }
});

// ── Course Outcomes (dynamic — add/edit/archive) ─────────────────────────────

router.get('/courses/:id/outcomes', protect, checkCoursePermission(['Teacher', 'Viewer']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;
    const outcomes = await getActiveOutcomes(course.id);
    res.json({ success: true, data: outcomes, maxAllowed: MAX_COS_PER_COURSE });
  } catch (err) {
    next(err);
  }
});

router.post('/courses/:id/outcomes', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;
    const { description, max_internal, max_external } = req.body;
    if (!description || !String(description).trim()) {
      return res.status(400).json({ success: false, message: 'CO description is required.' });
    }
    const outcome = await addCourseOutcome(course.id, { description, max_internal, max_external });
    res.status(201).json({ success: true, message: `CO${outcome.co_number} added.`, data: outcome });
  } catch (err) {
    next(err);
  }
});

router.put('/courses/:id/outcomes/:coId', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;
    const outcome = await getOutcomeById(req.params.coId);
    if (!outcome || outcome.course_id !== course.id) {
      return res.status(404).json({ success: false, message: 'Course Outcome not found on this course.' });
    }
    const { description, max_internal, max_external, target_percent } = req.body;
    await updateCourseOutcome(outcome.id, { description, max_internal, max_external, target_percent });
    res.json({ success: true, message: `CO${outcome.co_number} updated.` });
  } catch (err) {
    next(err);
  }
});

// Archives (never hard-deletes) a CO. Reports back what still references it so the frontend can
// show a clear confirmation — the archive itself always succeeds and preserves every reference.
router.delete('/courses/:id/outcomes/:coId', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;
    const outcome = await getOutcomeById(req.params.coId);
    if (!outcome || outcome.course_id !== course.id) {
      return res.status(404).json({ success: false, message: 'Course Outcome not found on this course.' });
    }

    const [[questionCount]] = await pool.query(
      'SELECT COUNT(*) as count FROM question_configs WHERE co_id = ? AND is_active = 1',
      [outcome.id],
    );
    const [[marksCount]] = await pool.query(
      'SELECT COUNT(*) as count FROM student_co_marks WHERE co_id = ? AND marks > 0',
      [outcome.id],
    );

    await archiveCourseOutcome(outcome.id);
    res.json({
      success: true,
      message: `CO${outcome.co_number} archived. It no longer appears in active configuration, but all existing questions, marks, and mappings referencing it are preserved.`,
      data: {
        hadActiveQuestions: questionCount.count > 0,
        hadStudentMarks: marksCount.count > 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 2. Course Workspace config — thresholds/weights only; CO list lives under /outcomes
router.get('/courses/:id/config', protect, checkCoursePermission(['Teacher', 'Viewer']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;

    let config = await getConfig(course.id);
    if (!config) {
      await saveConfig(course.id, DEFAULT_CONFIG);
      config = await getConfig(course.id);
    }

    const outcomes = await getActiveOutcomes(course.id);
    // Self-healing: a pre-existing course somehow still has zero outcomes (shouldn't happen once
    // the startup migration has run, but guards against a course created mid-migration failure).
    const finalOutcomes = outcomes.length > 0 ? outcomes : await (async () => {
      await addCourseOutcome(course.id, {});
      return getActiveOutcomes(course.id);
    })();

    // Academic-context breadcrumb (School / Department / Program / Session), resolved via the
    // same hierarchy join the dashboard uses. Null when the course predates the Phase 2
    // hierarchy migration or was never linked — surfaced honestly, not guessed.
    const hierarchyMap = await getCourseHierarchyContext([course.id]);
    const hctx = hierarchyMap.get(course.id) || {};
    const hierarchy = {
      schoolName: hctx.school_name || null,
      schoolId: hctx.school_id || null,
      departmentName: hctx.department_name || null,
      departmentId: hctx.department_id || null,
      programName: hctx.program_name || null,
      programCode: hctx.program_code || null,
      programDegree: hctx.program_degree || null,
      programDuration: hctx.program_duration ?? null,
      programTotalSemesters: hctx.program_total_semesters ?? null,
      sessionId: hctx.session_id || null,
      sessionName: hctx.session_name || null,
      linked: Boolean(course.program_id),
    };

    res.json({
      success: true,
      data: { course, config, outcomes: finalOutcomes, hierarchy },
    });
  } catch (err) {
    next(err);
  }
});

// Only saves threshold/weight settings now — CO descriptions/max-marks go through /outcomes
router.post('/courses/:id/config', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;

    const { config } = req.body;
    if (config) {
      await saveConfig(course.id, config);
    }

    res.json({ success: true, message: 'Configuration saved successfully' });
  } catch (err) {
    next(err);
  }
});

// ── Question Paper Configuration (dynamic count, teacher-controlled CO mapping) ─────────────

router.get('/courses/:id/questions', protect, checkCoursePermission(['Teacher', 'Viewer']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;
    const examType = req.query.examType === 'ETT' ? 'ETT' : 'MTT';
    const questions = await getQuestionConfigs(course.id, examType);
    res.json({ success: true, data: questions, maxAllowed: MAX_QUESTIONS_PER_EXAM });
  } catch (err) {
    next(err);
  }
});

// Body: { examType: 'MTT'|'ETT', questions: [{ question_number, co_id, max_marks }] }
// Validates every question's CO exists on this course, and that no CO's total allocated
// question marks exceed its configured max for that component — rejects the whole save with a
// clear message instead of silently persisting an inconsistent paper.
router.post('/courses/:id/questions', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;

    const { examType, questions } = req.body;
    if (!['MTT', 'ETT'].includes(examType)) {
      return res.status(400).json({ success: false, message: 'Invalid exam type' });
    }
    if (!Array.isArray(questions)) {
      return res.status(400).json({ success: false, message: 'questions must be an array' });
    }

    const outcomes = await getActiveOutcomes(course.id);
    const outcomeById = new Map(outcomes.map((o) => [o.id, o]));

    const seenNumbers = new Set();
    const allocatedByCoId = new Map();
    for (const q of questions) {
      const coId = parseInt(q.co_id, 10);
      const maxMarks = parseFloat(q.max_marks);
      const qNumber = parseInt(q.question_number, 10);

      if (!outcomeById.has(coId)) {
        return res.status(400).json({ success: false, message: `Question ${q.question_number}: selected CO does not exist on this course.` });
      }
      if (Number.isNaN(maxMarks) || maxMarks <= 0) {
        return res.status(400).json({ success: false, message: `Question ${q.question_number}: maximum marks must be a positive number.` });
      }
      if (seenNumbers.has(qNumber)) {
        return res.status(400).json({ success: false, message: `Duplicate question number ${qNumber}.` });
      }
      seenNumbers.add(qNumber);
      allocatedByCoId.set(coId, (allocatedByCoId.get(coId) || 0) + maxMarks);
    }

    const isInternal = examType === 'MTT';
    for (const [coId, allocated] of allocatedByCoId.entries()) {
      const outcome = outcomeById.get(coId);
      const coMax = parseFloat(isInternal ? outcome.max_internal : outcome.max_external);
      if (allocated > coMax) {
        return res.status(400).json({
          success: false,
          message: `CO${outcome.co_number} question allocation (${allocated}) exceeds its configured ${examType} maximum of ${coMax} marks.`,
        });
      }
    }

    await replaceQuestionConfigs(
      course.id,
      examType,
      questions.map((q) => ({
        question_number: parseInt(q.question_number, 10),
        co_id: parseInt(q.co_id, 10),
        max_marks: parseFloat(q.max_marks),
      })),
    );

    res.json({ success: true, message: 'Question paper configuration saved successfully.' });
  } catch (err) {
    next(err);
  }
});

// 3. CO-PO / CO-PSO Mapping — dynamic CO rows, fixed 12 PO + 3 PSO columns
router.get('/courses/:id/mapping', protect, checkCoursePermission(['Teacher', 'Viewer']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;

    const values = await getCoPoValuesForCourse(course.id);
    const averages = await getCoPoAveragesForCourse(course.id);
    const programOutcomes = await getProgramOutcomesForCourse(course.id);
    res.json({ success: true, data: { values, averages, programOutcomes } });
  } catch (err) {
    next(err);
  }
});

// Body: { values: [{ co_id, po1..po12, pso1..pso3 }] }
router.post('/courses/:id/mapping', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;

    const { values } = req.body;
    if (!Array.isArray(values)) {
      return res.status(400).json({ success: false, message: 'values must be an array' });
    }

    const outcomes = await getActiveOutcomes(course.id);
    const validCoIds = new Set(outcomes.map((o) => o.id));

    for (const row of values) {
      const coId = parseInt(row.co_id, 10);
      if (!validCoIds.has(coId)) {
        return res.status(400).json({ success: false, message: 'One or more mapping rows reference a CO that does not belong to this course.' });
      }
      // eslint-disable-next-line no-await-in-loop -- small, bounded by CO count
      await saveCoPoValue(coId, row);
    }

    res.json({ success: true, message: 'CO-PO mapping saved successfully' });
  } catch (err) {
    next(err);
  }
});

// 4. Student Marks — dynamic CO / question columns, sourced entirely from persisted config
// Phase 11 — Marks Entry roster: returns ALL students of the course's academic context
// (auto-synced from Student Master enrollment), merged with any saved marks. The teacher no
// longer needs to import Excel just to populate the student list — marks load automatically
// and existing marks prefill. Legacy rows (marks for students no longer enrolled) are kept.
router.get('/courses/:id/marks', protect, checkCoursePermission(['Teacher', 'Viewer']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;

    let enrolled = await getEnrolledStudentsForCourse(course.id);
    const [[{ marksCount }]] = await pool.query('SELECT COUNT(*) AS marksCount FROM student_marks WHERE course_id = ?', [course.id]);

    // Auto-sync students belonging to the course's academic context into enrollment ONLY if
    // this course has neither enrollments nor saved marks yet (brand new empty course).
    // Once enrollments or marks exist, we respect the teacher's roster edits and never silently re-enroll removed students.
    if (enrolled.length === 0 && marksCount === 0 && course.program_id && course.academic_session_id && course.semester) {
      await enrollStudentInAllContextCourses({
        studentId: null, programId: course.program_id,
        sessionId: course.academic_session_id, semester: course.semester,
      });
      enrolled = await getEnrolledStudentsForCourse(course.id);
    }

    const buildForExamType = async (examType) => {
      const [studentRows] = await pool.query(
        'SELECT id, name, reg_no, student_id, total_marks FROM student_marks WHERE course_id = ? AND exam_type = ?',
        [course.id, examType],
      );
      const coMarksByStudent = await getCoMarksForCourse(course.id, examType);
      const questionMarksByStudent = await getQuestionMarksForCourse(course.id, examType);

      const marksByReg = new Map();
      studentRows.forEach((s) => {
        marksByReg.set(String(s.reg_no).toLowerCase(), {
          id: s.id, studentId: s.student_id || null,
          totalMarks: parseFloat(s.total_marks) || 0,
          coMarks: coMarksByStudent.get(s.id) || {},
          questionMarks: questionMarksByStudent.get(s.id) || {},
        });
      });

      // Roster from Student Master/enrollment (the source of truth) merged with saved marks
      const roster = enrolled.map((st) => {
        const m = marksByReg.get(String(st.registration_number).toLowerCase()) || {};
        return {
          id: m.id || null,
          studentId: m.studentId || st.id || null,
          name: st.name || m.name,
          reg_no: st.registration_number || st.reg_no,
          roll: st.roll_number || st.roll_no || st.registration_number,
          totalMarks: m.totalMarks || 0,
          coMarks: m.coMarks || {},
          questionMarks: m.questionMarks || {},
          hasSavedMarks: Boolean(m.id),
        };
      });

      // Include any legacy marks rows whose student is no longer in the roster (preserved,
      // never dropped) — marked so the UI can show them as no-longer-enrolled if it wishes.
      const rosterRegs = new Set(roster.map((s) => String(s.reg_no).toLowerCase()));
      const extra = studentRows
        .filter((s) => !rosterRegs.has(String(s.reg_no).toLowerCase()))
        .map((s) => ({
          id: s.id,
          studentId: s.student_id || null,
          name: s.name,
          reg_no: s.reg_no,
          roll: s.reg_no,
          totalMarks: parseFloat(s.total_marks) || 0,
          coMarks: coMarksByStudent.get(s.id) || {},
          questionMarks: questionMarksByStudent.get(s.id) || {},
          hasSavedMarks: true,
        }));

      return [...roster, ...extra];
    };

    const mtt = await buildForExamType('MTT');
    const ett = await buildForExamType('ETT');

    res.json({ success: true, data: { mtt, ett, contextStudents: enrolled.length } });
  } catch (err) {
    next(err);
  }
});

// Body: { examType, entryMode: 'co'|'question', students: [{ name, roll, coMarks?, questionMarks? }] }
// In 'question' mode, per-CO totals are always derived server-side by summing each student's
// question marks against the persisted question->CO mapping — never trusted from the client and
// never independently editable, so CO aggregation can't drift from the actual question paper.
router.post('/courses/:id/marks', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;

    const { examType, entryMode, students } = req.body;
    if (!['MTT', 'ETT'].includes(examType)) {
      return res.status(400).json({ success: false, message: 'Invalid exam type' });
    }
    if (!Array.isArray(students)) {
      return res.status(400).json({ success: false, message: 'students must be an array' });
    }

    const outcomes = await getActiveOutcomes(course.id);
    const outcomeById = new Map(outcomes.map((o) => [o.id, o]));
    const isInternal = examType === 'MTT';

    let questionConfigById = new Map();
    if (entryMode === 'question') {
      const questions = await getQuestionConfigs(course.id, examType);
      questionConfigById = new Map(questions.map((q) => [q.id, q]));
    }

    // Validate every mark before writing anything — a rejected row shouldn't leave a partial save.
    if (entryMode === 'total') {
      const totalMax = calculateExamTotalMax(outcomes, isInternal);
      for (const student of students) {
        const raw = student.totalMarks !== undefined ? student.totalMarks : student.total_marks;
        if (raw !== '' && raw !== null && raw !== undefined) {
          const val = parseFloat(raw);
          if (isNaN(val) || val < 0 || val > totalMax) {
            return res.status(400).json({
              success: false,
              message: `${student.name || student.roll || 'A student'}: Total mark (${raw}) must be between 0 and ${totalMax}.`,
            });
          }
        }
      }
    } else if (entryMode === 'question') {
      for (const student of students) {
        for (const [qcIdStr, mark] of Object.entries(student.questionMarks || {})) {
          const qc = questionConfigById.get(parseInt(qcIdStr, 10));
          if (!qc) continue; // stale/removed question — ignore rather than fail the whole save
          const val = parseFloat(mark) || 0;
          if (val < 0 || val > parseFloat(qc.max_marks)) {
            return res.status(400).json({
              success: false,
              message: `${student.name || student.roll || 'A student'}: Q${qc.question_number} mark (${val}) must be between 0 and ${qc.max_marks}.`,
            });
          }
        }
      }
    } else {
      for (const student of students) {
        for (const [coIdStr, mark] of Object.entries(student.coMarks || {})) {
          const co = outcomeById.get(parseInt(coIdStr, 10));
          if (!co) continue;
          const maxMarks = parseFloat(isInternal ? co.max_internal : co.max_external);
          const val = parseFloat(mark) || 0;
          if (val < 0 || val > maxMarks) {
            return res.status(400).json({
              success: false,
              message: `${student.name || student.roll || 'A student'}: CO${co.co_number} mark (${val}) must be between 0 and ${maxMarks}.`,
            });
          }
        }
      }
    }

    await deleteMarksByCourse(course.id, examType);

    // Phase 11 — resolve Student Master IDs so saved marks reference the actual student
    // record (stable FK), not just the reg_no text. Unknown/legacy rows keep NULL student_id.
    const [enrolledStudents] = await pool.query(
      `SELECT st.id, st.registration_number FROM course_enrollments ce
       JOIN students st ON st.id = ce.student_id
       WHERE ce.course_id = ?`,
      [course.id],
    );
    const studentIdByReg = new Map(
      enrolledStudents.map((s) => [String(s.registration_number).toLowerCase(), s.id]),
    );

    for (const student of students) {
      let coMarksToSave;
      let questionMarksToSave = [];

      if (entryMode === 'question') {
        const perCoTotals = new Map();
        outcomes.forEach((o) => perCoTotals.set(o.id, 0));
        questionMarksToSave = Object.entries(student.questionMarks || {})
          .map(([qcIdStr, mark]) => {
            const qc = questionConfigById.get(parseInt(qcIdStr, 10));
            if (!qc) return null;
            const val = parseFloat(mark) || 0;
            perCoTotals.set(qc.co_id, (perCoTotals.get(qc.co_id) || 0) + val);
            return { question_config_id: qc.id, marks: val };
          })
          .filter(Boolean);
        coMarksToSave = Array.from(perCoTotals.entries()).map(([co_id, marks]) => ({ co_id, marks }));
      } else if (entryMode === 'total') {
        const raw = student.totalMarks !== undefined ? student.totalMarks : student.total_marks;
        const dist = distributeTotalMarksToCos({
          totalMarks: raw || 0,
          courseOutcomes: outcomes,
          isInternal,
        });
        coMarksToSave = outcomes.map((co) => ({
          co_id: co.id,
          marks: dist.coMarks[co.id] ?? 0,
        }));
      } else {
        coMarksToSave = outcomes.map((co) => ({
          co_id: co.id,
          marks: parseFloat(student.coMarks?.[co.id]) || 0,
        }));
      }

      const totalMarks = coMarksToSave.reduce((sum, c) => sum + c.marks, 0);

      // Best-effort mirror into the legacy co1-6 columns for anyone still reading raw SQL —
      // purely cosmetic, has zero effect on attainment/marks-read, which use the tables below.
      const legacyCoValues = {};
      coMarksToSave.forEach((c) => {
        const outcome = outcomeById.get(c.co_id);
        if (outcome && outcome.co_number <= 6) legacyCoValues[`co${outcome.co_number}`] = c.marks;
      });

      // eslint-disable-next-line no-await-in-loop -- sequential to keep each student's writes atomic-ish
      const studentMarkId = await saveStudentMark({
        courseId: course.id,
        name: student.name,
        regNo: student.roll || student.reg_no,
        examType,
        ...legacyCoValues,
        totalMarks,
        questionMarks: null, // superseded by student_question_marks
        studentId: studentIdByReg.get(String(student.roll || student.reg_no).toLowerCase()) || null,
      });

      // eslint-disable-next-line no-await-in-loop
      await saveStudentCoMarks(studentMarkId, coMarksToSave);
      if (questionMarksToSave.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await saveStudentQuestionMarks(studentMarkId, questionMarksToSave);
      }
    }

    res.json({ success: true, message: 'Student marks uploaded successfully' });
  } catch (err) {
    next(err);
  }
});

// 5. Attainment Calculation Engine
router.get('/courses/:id/attainment', protect, checkCoursePermission(['Teacher', 'Viewer']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;

    const config = await getConfig(course.id);
    const courseOutcomes = await getActiveOutcomes(course.id);
    const coPoAverages = await getCoPoAveragesForCourse(course.id);

    const buildStudentsWithCoMarks = async (examType) => {
      const [studentRows] = await pool.query(
        'SELECT id, name, reg_no FROM student_marks WHERE course_id = ? AND exam_type = ?',
        [course.id, examType],
      );
      const coMarksByStudent = await getCoMarksForCourse(course.id, examType);
      return studentRows.map((s) => ({ ...s, coMarks: coMarksByStudent.get(s.id) || {} }));
    };

    const mttStudents = await buildStudentsWithCoMarks('MTT');
    const ettStudents = await buildStudentsWithCoMarks('ETT');

    const result = calculateCourseAttainment({
      courseOutcomes,
      config,
      coPoAverages,
      mttStudents,
      ettStudents,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// 6. Export full course as a portable JSON snapshot
router.get('/courses/:id/export-json', protect, checkCoursePermission(['Teacher', 'Viewer']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;

    const config = await getConfig(course.id);
    const outcomes = await getActiveOutcomes(course.id);
    const mappingValues = await getCoPoValuesForCourse(course.id);
    const mttQuestions = await getQuestionConfigs(course.id, 'MTT');
    const ettQuestions = await getQuestionConfigs(course.id, 'ETT');

    const coNumberById = new Map(outcomes.map((o) => [o.id, o.co_number]));
    const questionNumberById = new Map([...mttQuestions, ...ettQuestions].map((q) => [q.id, q.question_number]));

    // Keyed by co_number / question_number (portable across databases), never by internal id —
    // a snapshot's ids only mean something in the database it was exported from.
    const buildMarks = async (examType) => {
      const [studentRows] = await pool.query(
        'SELECT id, name, reg_no, total_marks FROM student_marks WHERE course_id = ? AND exam_type = ?',
        [course.id, examType],
      );
      const coMarksByStudent = await getCoMarksForCourse(course.id, examType);
      const questionMarksByStudent = await getQuestionMarksForCourse(course.id, examType);
      return studentRows.map((s) => {
        const coMarksByCoId = coMarksByStudent.get(s.id) || {};
        const questionMarksByQcId = questionMarksByStudent.get(s.id) || {};
        const coMarks = {};
        Object.entries(coMarksByCoId).forEach(([coId, marks]) => {
          const num = coNumberById.get(parseInt(coId, 10));
          if (num) coMarks[num] = marks;
        });
        const questionMarks = {};
        Object.entries(questionMarksByQcId).forEach(([qcId, marks]) => {
          const num = questionNumberById.get(parseInt(qcId, 10));
          if (num) questionMarks[num] = marks;
        });
        return {
          name: s.name,
          reg_no: s.reg_no,
          total_marks: parseFloat(s.total_marks) || 0,
          coMarks,
          questionMarks,
        };
      });
    };

    const snapshot = {
      exportVersion: '2.0',
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.name || req.user.email,
      course: {
        subject_name: course.subject_name,
        course_code: course.course_code,
        school: course.school,
        department: course.department,
        semester: course.semester,
        academic_year: course.academic_year,
      },
      config: config || {},
      outcomes: outcomes.map((o) => ({
        co_number: o.co_number,
        description: o.description,
        max_internal: o.max_internal,
        max_external: o.max_external,
      })),
      mapping: mappingValues.map((v) => ({ co_number: v.co_number, ...v })),
      questions: { mtt: mttQuestions, ett: ettQuestions },
      marks: {
        mtt: await buildMarks('MTT'),
        ett: await buildMarks('ETT'),
      },
    };

    res.json({ success: true, data: snapshot });
  } catch (err) {
    next(err);
  }
});

// 7. Import course from a v2.0 JSON snapshot (exported by this same version of the app).
// Snapshots exported before the dynamic-CO migration (exportVersion '1.0') are not supported —
// re-export the source course after it has gone through the startup migration.
router.post('/courses/import-json', protect, authorizeRoles('Admin', 'Moderator', 'Examination Team', 'Teacher'), async (req, res, next) => {
  try {
    const { courseData } = req.body;
    if (!courseData || !courseData.course) {
      return res.status(400).json({ success: false, message: 'Invalid course snapshot. Missing course data.' });
    }
    if (courseData.exportVersion !== '2.0') {
      return res.status(400).json({
        success: false,
        message: 'This snapshot was exported by an older version of the app and cannot be imported. Re-export it from the source course first.',
      });
    }

    const { course: c, config, outcomes, mapping, questions, marks } = courseData;

    const courseId = await createCourse({
      teacherId: req.user.id,
      school: c.school || '',
      department: c.department || '',
      subjectName: c.subject_name || 'Imported Course',
      courseCode: c.course_code || '',
      semester: c.semester || 1,
      academicYear: c.academic_year || '',
      numCos: (outcomes || []).length || 5,
      programId: c.program_id || null,
      sessionId: c.academic_session_id || null,
    });

    if (config && Object.keys(config).length > 0) {
      await saveConfig(courseId, config);
    }

    // Outcomes were auto-seeded by createCourse — overwrite their descriptions/max marks with
    // the snapshot's values in co_number order, then add any beyond the initial seed count.
    const seededOutcomes = await getActiveOutcomes(courseId);
    const coIdByNumber = new Map();
    for (let i = 0; i < (outcomes || []).length; i += 1) {
      const src = outcomes[i];
      let outcome = seededOutcomes[i];
      if (!outcome) {
        // eslint-disable-next-line no-await-in-loop
        outcome = await addCourseOutcome(courseId, {});
      }
      // eslint-disable-next-line no-await-in-loop
      await updateCourseOutcome(outcome.id, {
        description: src.description,
        max_internal: src.max_internal,
        max_external: src.max_external,
      });
      coIdByNumber.set(src.co_number, outcome.id);
    }

    if (Array.isArray(mapping)) {
      for (const row of mapping) {
        const coId = coIdByNumber.get(row.co_number);
        if (coId) {
          // eslint-disable-next-line no-await-in-loop
          await saveCoPoValue(coId, row);
        }
      }
    }

    const questionIdByOldId = { mtt: new Map(), ett: new Map() };
    if (questions?.mtt?.length) {
      await replaceQuestionConfigs(courseId, 'MTT', questions.mtt.map((q) => ({
        question_number: q.question_number, co_id: coIdByNumber.get(q.co_number), max_marks: q.max_marks,
      })).filter((q) => q.co_id));
      const saved = await getQuestionConfigs(courseId, 'MTT');
      saved.forEach((q) => questionIdByOldId.mtt.set(q.question_number, q.id));
    }
    if (questions?.ett?.length) {
      await replaceQuestionConfigs(courseId, 'ETT', questions.ett.map((q) => ({
        question_number: q.question_number, co_id: coIdByNumber.get(q.co_number), max_marks: q.max_marks,
      })).filter((q) => q.co_id));
      const saved = await getQuestionConfigs(courseId, 'ETT');
      saved.forEach((q) => questionIdByOldId.ett.set(q.question_number, q.id));
    }

    const importMarks = async (students, examType) => {
      if (!students || students.length === 0) return;
      const qIdMap = examType === 'MTT' ? questionIdByOldId.mtt : questionIdByOldId.ett;

      for (const student of students) {
        // coMarks/questionMarks in the snapshot are keyed by co_number/question_number
        // (portable), resolved here to this new course's actual co_id/question_config_id.
        const finalCoMarks = Object.entries(student.coMarks || {})
          .map(([coNum, marks]) => {
            const coId = coIdByNumber.get(parseInt(coNum, 10));
            return coId ? { co_id: coId, marks: parseFloat(marks) || 0 } : null;
          })
          .filter(Boolean);

        const questionMarksToSave = Object.entries(student.questionMarks || {})
          .map(([qNum, marks]) => {
            const qId = qIdMap.get(parseInt(qNum, 10));
            return qId ? { question_config_id: qId, marks: parseFloat(marks) || 0 } : null;
          })
          .filter(Boolean);

        const totalMarks = finalCoMarks.reduce((sum, c) => sum + c.marks, 0) || student.total_marks || 0;

        // eslint-disable-next-line no-await-in-loop
        const studentMarkId = await saveStudentMark({
          courseId,
          name: student.name || '',
          regNo: student.reg_no || '',
          examType,
          totalMarks,
          questionMarks: null,
        });
        // eslint-disable-next-line no-await-in-loop
        if (finalCoMarks.length > 0) await saveStudentCoMarks(studentMarkId, finalCoMarks);
        // eslint-disable-next-line no-await-in-loop
        if (questionMarksToSave.length > 0) await saveStudentQuestionMarks(studentMarkId, questionMarksToSave);
      }
    };

    await importMarks(marks?.mtt, 'MTT');
    await importMarks(marks?.ett, 'ETT');

    res.status(201).json({
      success: true,
      message: `Course "${c.subject_name}" imported successfully.`,
      data: { id: courseId },
    });
  } catch (err) {
    next(err);
  }
});

// ── Course Academic Mapping (Phase 3K) ─────────────────────────────────────
// Links an existing course into the university hierarchy WITHOUT touching its
// free-text fields (school/department/semester/academic_year stay intact unless
// the caller explicitly sends overwriteFreeText fields). Additive + reversible.

router.put('/courses/:id/academic-map', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;

    // Section 20 — Legacy Course Mapping reconciliation. `department`/`school` let an
    // administrator explicitly overwrite the free-text fields to match the linked hierarchy
    // (or vice versa, by instead calling this with a new programId) — never automatic, and
    // always audited so what changed and by whom is traceable.
    const { programId, sessionId, semester, department, school } = req.body;
    const targetProgramId = programId !== undefined ? programId : course.program_id;
    if (targetProgramId) {
      const program = await getProgramByIdWithContext(targetProgramId);
      if (!program) {
        return res.status(400).json({ success: false, message: 'The selected Program does not exist.' });
      }
      const targetSemester = semester !== undefined ? Number(semester) : Number(course.semester);
      if (Number.isFinite(targetSemester) && (targetSemester < 1 || targetSemester > program.total_semesters)) {
        return res.status(400).json({
          success: false,
          message: `Semester ${targetSemester} is invalid for ${program.name} (${program.duration} year(s) = ${program.total_semesters} semesters). Valid range: Sem 1 to Sem ${program.total_semesters}.`,
        });
      }
    }
    const sets = [];
    const values = [];
    if (programId !== undefined) { sets.push('program_id = ?'); values.push(programId); }
    if (sessionId !== undefined) { sets.push('academic_session_id = ?'); values.push(sessionId); }
    if (semester !== undefined) { sets.push('semester = ?'); values.push(semester); }
    if (department !== undefined) { sets.push('department = ?'); values.push(department); }
    if (school !== undefined) { sets.push('school = ?'); values.push(school); }
    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'Provide at least one of programId, sessionId, semester, department, school.' });
    }
    values.push(course.id);
    await pool.query(`UPDATE courses SET ${sets.join(', ')} WHERE id = ?`, values);
    await logAction({
      actorUserId: req.user.id, actorName: req.user.email, action: 'reconcile_mapping',
      entityType: 'course', entityId: course.id,
      details: { before: { department: course.department, school: course.school, program_id: course.program_id }, requested: req.body },
    });

    const [updated] = await pool.query(
      'SELECT id, course_code, subject_name, school, department, program_id, academic_session_id, semester FROM courses WHERE id = ?',
      [course.id],
    );
    res.json({ success: true, message: 'Course academic context updated.', data: updated[0] });
  } catch (err) { next(err); }
});

// ── Phase 5: Marks Excel Template ──────────────────────────────────────────
// GET /api/courses/:id/marks-template?examType=MTT&classId=1
// Generates a pre-filled workbook from Course Enrollment + Student Master.

router.get('/courses/:id/marks-template', protect, checkCoursePermission(['Teacher', 'Viewer']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;

    const examType = req.query.examType === 'ETT' ? 'ETT' : 'MTT';
    const [ctxRows] = await pool.query(
      `SELECT c.id, c.course_code, c.subject_name, c.semester,
              p.id AS program_id, p.name AS program_name, p.code AS program_code,
              d.id AS department_id, d.name AS department_name,
              s.id AS school_id, s.name AS school_name,
              sess.id AS session_id, sess.name AS session_name
       FROM courses c
       LEFT JOIN programs p ON p.id = c.program_id
       LEFT JOIN departments d ON d.id = p.department_id
       LEFT JOIN schools s ON s.id = d.school_id
       LEFT JOIN academic_sessions sess ON sess.id = c.academic_session_id
       WHERE c.id = ?`,
      [course.id],
    );
    const ctxCourse = ctxRows[0] || {};

    // Optional section label from an explicit class selection
    let section = null;
    if (req.query.classId) {
      const [cls] = await pool.query('SELECT section FROM academic_classes WHERE id = ?', [req.query.classId]);
      section = cls[0]?.section || null;
    }

    const outcomes = await getActiveOutcomes(course.id);
    const enrolled = await getEnrolledStudentsForCourse(course.id);

    // Pre-fill already-saved marks for this exam type (matched by reg_no)
    const [markRows] = await pool.query(
      'SELECT id, reg_no FROM student_marks WHERE course_id = ? AND exam_type = ?',
      [course.id, examType],
    );
    const coMarksByMarkId = await getCoMarksForCourse(course.id, examType);
    const marksByReg = new Map(markRows.map((m) => [String(m.reg_no), coMarksByMarkId.get(m.id) || {}]));

    const ctx = {
      course: ctxCourse,
      program: { id: ctxCourse.program_id, name: ctxCourse.program_name, code: ctxCourse.program_code },
      department: { id: ctxCourse.department_id, name: ctxCourse.department_name },
      school: { id: ctxCourse.school_id, name: ctxCourse.school_name },
      session: { id: ctxCourse.session_id, name: ctxCourse.session_name },
      semester: ctxCourse.semester,
      section,
      outcomes,
      students: enrolled.map((st) => ({
        registration_number: st.registration_number,
        roll_number: st.roll_number,
        roll_no: st.roll_no,
        name: st.name,
        coMarks: marksByReg.get(String(st.registration_number)) || {},
      })),
      examType,
    };

    const { workbook } = await buildMarksEntryWorkbook(ctx);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${buildMarksFileName({ session: ctx.session, program: ctx.program, semester: ctx.semester, section, course })}"`,
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// ── Phase 5: Marks Excel Import (validate + preview + confirm) ─────────────
// The frontend parses the .xlsx client-side (existing SheetJS architecture — no multer on this
// backend) and posts the extracted grid. The BACKEND is authoritative: it re-validates every
// mark against the persisted CO configuration and matches students against Course Enrollment
// in the DB. Nothing is ever saved on preview.
const validateImportPayload = async (course, examType, rows) => {
  const errors = [];
  if (!['MTT', 'ETT'].includes(examType)) return { error: 'Invalid assessment type.' };
  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: 'No student rows found in the uploaded file.' };
  }

  const outcomes = await getActiveOutcomes(course.id);
  const outcomeById = new Map(outcomes.map((o) => [String(o.id), o]));
  const isInternal = examType === 'MTT';
  const enrolled = await getEnrolledStudentsForCourse(course.id);
  const enrolledByReg = new Map(enrolled.map((s) => [String(s.registration_number).toLowerCase(), s]));

  // Existing saved marks — needed to classify updated vs unchanged
  const [markRows] = await pool.query(
    'SELECT id, reg_no FROM student_marks WHERE course_id = ? AND exam_type = ?',
    [course.id, examType],
  );
  const existingCoMarks = await getCoMarksForCourse(course.id, examType);
  const existingByReg = new Map(markRows.map((m) => [String(m.reg_no), existingCoMarks.get(m.id) || {}]));

  const seenRegs = new Set();
  const valid = [];
  let duplicateCount = 0;
  let unknownCount = 0;

  rows.forEach((row, idx) => {
    const rowNo = row.rowNumber || idx + 1;
    const regKey = String(row.regNo || '').trim().toLowerCase();
    if (!regKey) {
      errors.push({ row: rowNo, regNo: '', name: row.name || '', column: 'Registration No', problem: 'Missing registration number.' });
      return;
    }
    if (seenRegs.has(regKey)) {
      duplicateCount += 1;
      errors.push({ row: rowNo, regNo: row.regNo, name: row.name || '', column: 'Registration No', problem: `Duplicate student registration number: ${row.regNo}` });
      return;
    }
    seenRegs.add(regKey);

    const student = enrolledByReg.get(regKey);
    if (!student) {
      unknownCount += 1;
      errors.push({ row: rowNo, regNo: row.regNo, name: row.name || '', column: 'Registration No', problem: `Student ${row.regNo} is not enrolled in this course.` });
      return;
    }

    // Validate every provided CO mark against the persisted maximum; blank stays missing (NOT zero)
    const cleanedCoMarks = {};
    let rowHasError = false;

    const hasSpecificCoMarks = Object.keys(row.coMarks || {}).length > 0 &&
      Object.values(row.coMarks || {}).some((v) => v !== '' && v !== null && v !== undefined);

    if (hasSpecificCoMarks) {
      for (const [coId, raw] of Object.entries(row.coMarks || {})) {
        const co = outcomeById.get(String(coId));
        if (!co) continue; // stale/unknown CO column — ignore
        if (raw === '' || raw === null || raw === undefined) continue;
        const val = Number(raw);
        const max = parseFloat(isInternal ? co.max_internal : co.max_external);
        if (Number.isNaN(val)) {
          rowHasError = true;
          errors.push({ row: rowNo, regNo: row.regNo, name: student.name, column: `CO${co.co_number}`, problem: `Value "${raw}" is not a number.` });
        } else if (val < 0) {
          rowHasError = true;
          errors.push({ row: rowNo, regNo: row.regNo, name: student.name, column: `CO${co.co_number}`, problem: 'Marks cannot be negative.' });
        } else if (max > 0 && val > max) {
          rowHasError = true;
          errors.push({ row: rowNo, regNo: row.regNo, name: student.name, column: `CO${co.co_number}`, problem: `Maximum ${examType} mark for CO${co.co_number} is ${max}.` });
        } else {
          cleanedCoMarks[co.id] = val;
        }
      }
    } else if (row.totalMarks !== undefined && row.totalMarks !== null && row.totalMarks !== '') {
      // Auto-distribute total marks based on CO weightage
      const totalMax = calculateExamTotalMax(outcomes, isInternal);
      const rawTotal = Number(row.totalMarks);
      if (Number.isNaN(rawTotal)) {
        rowHasError = true;
        errors.push({ row: rowNo, regNo: row.regNo, name: student.name, column: 'Total Marks', problem: `Value "${row.totalMarks}" is not a number.` });
      } else if (rawTotal < 0) {
        rowHasError = true;
        errors.push({ row: rowNo, regNo: row.regNo, name: student.name, column: 'Total Marks', problem: 'Total marks cannot be negative.' });
      } else if (totalMax > 0 && rawTotal > totalMax) {
        rowHasError = true;
        errors.push({ row: rowNo, regNo: row.regNo, name: student.name, column: 'Total Marks', problem: `Total marks (${rawTotal}) exceeds exam maximum of ${totalMax}.` });
      } else {
        const dist = distributeTotalMarksToCos({ totalMarks: rawTotal, courseOutcomes: outcomes, isInternal });
        if (dist.error) {
          rowHasError = true;
          errors.push({ row: rowNo, regNo: row.regNo, name: student.name, column: 'Total Marks', problem: dist.error });
        } else {
          Object.assign(cleanedCoMarks, dist.coMarks);
        }
      }
    }
    if (rowHasError) return;

    // Updated vs unchanged, compared against currently stored values
    const prev = existingByReg.get(String(student.registration_number)) || {};
    const changed = Object.keys(cleanedCoMarks).length > 0
      ? Object.keys(cleanedCoMarks).some((coId) => Math.abs((parseFloat(prev[coId]) || 0) - (cleanedCoMarks[coId] || 0)) > 1e-9)
      : Object.keys(prev).length > 0;

    valid.push({
      studentId: student.id,
      regNo: student.registration_number,
      name: student.name,
      rollNo: student.roll_number || student.roll_no || '',
      coMarks: cleanedCoMarks,
      changed,
    });
  });

  const missing = enrolled.filter((s) => !seenRegs.has(String(s.registration_number).toLowerCase()));

  return {
    error: null,
    result: {
      enrolledCount: enrolled.length,
      matchedCount: valid.length,
      validCount: valid.length,
      errorCount: errors.length,
      duplicateCount,
      unknownCount,
      changedCount: valid.filter((v) => v.changed).length,
      unchangedCount: valid.filter((v) => !v.changed).length,
      validRecords: valid.map((v) => ({ regNo: v.regNo, name: v.name, rollNo: v.rollNo, status: v.changed ? 'Update' : 'Unchanged' })),
      errors,
      missingStudents: missing.map((m) => ({ regNo: m.registration_number, name: m.name })),
    },
    validRows: valid,
    outcomes,
  };
};
// Step 2/3 — validate and return the preview. Nothing is written.
router.post('/courses/:id/marks/import-preview', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;
    const { examType, rows } = req.body;
    const { error, result } = await validateImportPayload(course, examType, rows);
    if (error) return res.status(400).json({ success: false, message: error });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// Step 4 — teacher confirmed. Saves ONLY validated rows through the EXISTING marks pipeline
// (saveStudentMark upserts on course+reg+exam → no duplicate marks; CO totals into
// student_co_marks), so online entry, Excel entry, attainment, and exports share one dataset.
router.post('/courses/:id/marks/import', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const course = await loadCourseOr404(req, res);
    if (!course) return;
    const { examType, rows, acknowledgeMissing } = req.body;
    const { error, result, validRows, outcomes } = await validateImportPayload(course, examType, rows);
    if (error) return res.status(400).json({ success: false, message: error });
    if (result.errorCount > 0) {
      return res.status(400).json({ success: false, message: `${result.errorCount} validation error(s) must be resolved before saving.` });
    }
    if (result.missingStudents.length > 0 && !acknowledgeMissing) {
      return res.status(400).json({
        success: false,
        message: `${result.missingStudents.length} enrolled student(s) are missing from the file. Acknowledge to continue.`,
        data: { missingStudents: result.missingStudents },
      });
    }
    if (validRows.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid marks to save.' });
    }

    let updated = 0;
    let unchanged = 0;
    // eslint-disable-next-line no-restricted-syntax
    for (const row of validRows) {
      const totalMarks = Object.values(row.coMarks).reduce((sum, v) => sum + v, 0);
      // eslint-disable-next-line no-await-in-loop
      const studentMarkId = await saveStudentMark({
        courseId: course.id,
        name: row.name,
        regNo: row.regNo,
        examType,
        totalMarks,
        questionMarks: null,
        studentId: row.studentId || null,
      });
      // eslint-disable-next-line no-await-in-loop
      await saveStudentCoMarks(studentMarkId, outcomes
        .filter((o) => row.coMarks[o.id] !== undefined)
        .map((o) => ({ co_id: o.id, marks: row.coMarks[o.id] })));
      if (row.changed) updated += 1; else unchanged += 1;
    }

    res.json({
      success: true,
      message: `Marks imported successfully — ${validRows.length} processed, ${updated} updated, ${unchanged} unchanged, 0 errors.`,
      data: { processed: validRows.length, updated, unchanged, errors: 0 },
    });
  } catch (err) { next(err); }
});




// GET /api/courses/:id/enrollment — list enrolled students
// Phase 10 — when the course is linked to the academic hierarchy, students belonging to the
// course's context (Program + Session + Semester) are auto-synced into enrollment first
// (additive, idempotent), so the SAME students automatically appear in every course of their
// context without per-course manual enrollment. Legacy courses keep the enrollment table.
router.get('/courses/:id/enrollment', protect, checkCoursePermission(['Teacher', 'Viewer']), async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.id, req.user.id, req.user.role);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });
    if (course.program_id && course.academic_session_id && course.semester) {
      await enrollStudentInAllContextCourses({
        studentId: null, programId: course.program_id,
        sessionId: course.academic_session_id, semester: course.semester,
      });
    }
    const students = await getEnrolledStudentsForCourse(req.params.id);
    res.json({ success: true, data: { courseId: req.params.id, students } });
  } catch (err) { next(err); }
});

// POST /api/courses/:id/enrollment — bulk enroll (array of student_id) OR entire class
// Body: { studentIds?: number[], classId?: number }
router.post('/courses/:id/enrollment', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const { studentIds, classId } = req.body;
    let count = 0;
    if (classId) {
      count = await enrollEntireClassInCourse(classId, req.params.id);
    } else if (Array.isArray(studentIds) && studentIds.length > 0) {
      await enrollManyStudentsInCourse(req.params.id, studentIds);
      count = studentIds.length;
    } else {
      return res.status(400).json({ success: false, message: 'Provide studentIds[] or classId.' });
    }
    res.json({ success: true, message: `${count} student(s) enrolled in course.`, data: { enrolled: count } });
  } catch (err) { next(err); }
});

// DELETE /api/courses/:id/enrollment/:studentId — remove a single student
router.delete('/courses/:id/enrollment/:studentId', protect, checkCoursePermission(['Teacher']), async (req, res, next) => {
  try {
    const removed = await unenrollStudentFromCourse(req.params.id, req.params.studentId);
    if (!removed) return res.status(404).json({ success: false, message: 'Student not enrolled in this course.' });
    res.json({ success: true, message: 'Student removed from course.' });
  } catch (err) { next(err); }
});

module.exports = router;
