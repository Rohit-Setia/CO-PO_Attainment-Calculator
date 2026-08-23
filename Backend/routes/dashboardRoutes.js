const express = require('express');
const router = express.Router();
const protect = require('../middlewares/authMiddleware');
const pool = require('../config/db');
const { getCoursesByTeacher } = require('../models/courseModel');
const { getConfig, getCoPoAveragesForCourse } = require('../models/mappingModel');
const { getActiveOutcomes } = require('../models/courseOutcomeModel');
const { getCoMarksForCourse } = require('../models/marksModel');
const { calculateCourseAttainment } = require('../utils/attainmentCalculator');
const { getStudentsForClass, getClassById, getCourseHierarchyContext } = require('../models/academicModel');

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Single authoritative aggregation service.
// Both /dashboard/summary (university-wide, optionally hierarchy-filtered) and
// /dashboard/class/:classId (section-level) call the SAME per-course helper
// below, which itself calls the SAME calculateCourseAttainment() engine that
// /courses/:id/attainment uses. No calculation logic is duplicated anywhere
// in this file — only real DB rows are read and passed through. Hierarchy
// name resolution (school/department/program/session) is likewise a single
// shared query — see academicModel.getCourseHierarchyContext — reused here
// and by /courses/:id/config's breadcrumb.
// ─────────────────────────────────────────────────────────────────────────────
const getHierarchyContextForCourses = getCourseHierarchyContext;

// Enrollment (course_enrollments, the Student-Master pipeline) and marks-recorded
// (student_marks, the legacy marks-entry pipeline) are two separate tables in this
// schema — see Phase 3/5 notes. Completion is reported honestly against whichever
// enrollment count exists; if enrollment was never configured for a course, that is
// reported as "not configured", never silently treated as 0/0 = 100%.
const getEnrollmentAndMarksCounts = async (courseIds) => {
  if (courseIds.length === 0) return new Map();
  const placeholders = courseIds.map(() => '?').join(', ');
  const [enrollRows] = await pool.query(
    `SELECT course_id, COUNT(*) AS enrolled_count FROM course_enrollments WHERE course_id IN (${placeholders}) GROUP BY course_id`,
    courseIds,
  );
  const [marksRows] = await pool.query(
    `SELECT course_id, exam_type, COUNT(DISTINCT reg_no) AS recorded_count
     FROM student_marks WHERE course_id IN (${placeholders}) GROUP BY course_id, exam_type`,
    courseIds,
  );
  const map = new Map();
  courseIds.forEach((id) => map.set(id, { enrolledCount: 0, mttRecordedCount: 0, ettRecordedCount: 0 }));
  enrollRows.forEach((r) => { map.get(r.course_id).enrolledCount = r.enrolled_count; });
  marksRows.forEach((r) => {
    const entry = map.get(r.course_id);
    if (r.exam_type === 'MTT') entry.mttRecordedCount = r.recorded_count;
    if (r.exam_type === 'ETT') entry.ettRecordedCount = r.recorded_count;
  });
  return map;
};

// Runs the existing, unmodified calculation engine for one course and shapes the
// result plus real data-quality signals. Never invents a zero for missing data —
// each flag says explicitly what is missing so the UI can show an honest state.
const buildCourseAttainmentEntry = async (course, hierarchyCtx, countsCtx) => {
  const config = await getConfig(course.id);
  const courseOutcomes = await getActiveOutcomes(course.id);
  const hctx = hierarchyCtx.get(course.id) || {};
  const counts = countsCtx.get(course.id) || { enrolledCount: 0, mttRecordedCount: 0, ettRecordedCount: 0 };

  const base = {
    courseId: course.id,
    courseCode: course.course_code,
    subjectName: course.subject_name,
    semester: course.semester,
    academicYear: course.academic_year,
    school: course.school,
    department: course.department,
    hierarchyLinked: Boolean(course.program_id),
    schoolName: hctx.school_name || null,
    departmentName: hctx.department_name || null,
    programName: hctx.program_name || null,
    sessionName: hctx.session_name || null,
    // A course's free-text department (set at creation) can drift from the department of the
    // program it was later linked to during the Phase 2 hierarchy migration — surfaced as a
    // warning, never silently corrected (Phase 6 rule: do not modify enrollment/course data
    // without an explicit, documented bug fix). Compared against both the linked department's
    // full name AND its short code (e.g. "CSE"), since course.department is often an
    // abbreviation — only a genuine mismatch (matches neither) is flagged.
    departmentMismatch: Boolean(
      hctx.department_name && course.department
        && ![hctx.department_name, hctx.department_code].filter(Boolean)
          .some((v) => v.trim().toLowerCase() === course.department.trim().toLowerCase()),
    ),
    enrolledCount: counts.enrolledCount,
    mttRecordedCount: counts.mttRecordedCount,
    ettRecordedCount: counts.ettRecordedCount,
    enrollmentConfigured: counts.enrolledCount > 0,
  };

  if (!config || courseOutcomes.length === 0) {
    return {
      ...base,
      overallPercent: 0,
      hasData: false,
      coMappingMissing: courseOutcomes.length === 0,
      poMappingMissing: true,
      result: null,
    };
  }

  const coPoAverages = await getCoPoAveragesForCourse(course.id);
  const [mttRows] = await pool.query(
    'SELECT id, name, reg_no FROM student_marks WHERE course_id = ? AND exam_type = ?', [course.id, 'MTT'],
  );
  const [ettRows] = await pool.query(
    'SELECT id, name, reg_no FROM student_marks WHERE course_id = ? AND exam_type = ?', [course.id, 'ETT'],
  );
  const mttCoMarksByStudent = await getCoMarksForCourse(course.id, 'MTT');
  const ettCoMarksByStudent = await getCoMarksForCourse(course.id, 'ETT');
  const mttStudents = mttRows.map((s) => ({ ...s, coMarks: mttCoMarksByStudent.get(s.id) || {} }));
  const ettStudents = ettRows.map((s) => ({ ...s, coMarks: ettCoMarksByStudent.get(s.id) || {} }));

  const result = calculateCourseAttainment({ courseOutcomes, config, coPoAverages, mttStudents, ettStudents });
  const overallPercent = parseFloat(((result.overallCourseAttainment / 3) * 100).toFixed(1));

  return {
    ...base,
    overallPercent,
    hasData: result.hasData,
    coMappingMissing: false,
    poMappingMissing: !result.hasPoData,
    result,
  };
};

// Applies optional hierarchy filters to an already-RBAC-scoped course list. Filtering happens
// in application code (not SQL) because the course list is already small per user and this
// keeps the single RBAC entry point (getCoursesByTeacher) as the only source of "which courses
// can this user see" — filters only narrow within that set, never widen it.
const applyHierarchyFilters = (courses, hierarchyCtx, filters) => courses.filter((c) => {
  const hctx = hierarchyCtx.get(c.id) || {};
  if (filters.schoolId && String(hctx.school_id) !== String(filters.schoolId)) return false;
  if (filters.departmentId && String(hctx.department_id) !== String(filters.departmentId)) return false;
  if (filters.programId && String(c.program_id) !== String(filters.programId)) return false;
  if (filters.sessionId && String(c.academic_session_id) !== String(filters.sessionId)) return false;
  if (filters.semester && String(c.semester) !== String(filters.semester)) return false;
  return true;
});

const emptySummary = () => ({
  totalCourses: 0, totalStudents: 0, totalAssessments: 0,
  avgCoAttainmentPercent: 0, avgPoAttainmentPercent: 0,
  courseAttainment: [], semesterPoHeatmap: [], dataQualityWarnings: [],
});

// GET /api/dashboard/summary — aggregate view across every course the user can access.
// Optional query filters (all backward-compatible — omitting them reproduces the exact
// original response shape, plus additive fields): schoolId, departmentId, programId,
// sessionId, semester.
router.get('/dashboard/summary', protect, async (req, res, next) => {
  try {
    const allCourses = await getCoursesByTeacher(req.user.id, req.user.role);

    if (allCourses.length === 0) {
      return res.json({ success: true, data: emptySummary() });
    }

    const allCourseIds = allCourses.map((c) => c.id);
    const hierarchyCtx = await getHierarchyContextForCourses(allCourseIds);

    const filters = {
      schoolId: req.query.schoolId,
      departmentId: req.query.departmentId,
      programId: req.query.programId,
      sessionId: req.query.sessionId,
      semester: req.query.semester,
    };
    const hasFilters = Object.values(filters).some(Boolean);
    const courses = hasFilters ? applyHierarchyFilters(allCourses, hierarchyCtx, filters) : allCourses;

    if (courses.length === 0) {
      return res.json({ success: true, data: emptySummary() });
    }

    const courseIds = courses.map((c) => c.id);
    const placeholders = courseIds.map(() => '?').join(', ');

    const [distinctStudentRows] = await pool.query(
      `SELECT COUNT(DISTINCT reg_no) as count FROM student_marks WHERE course_id IN (${placeholders})`,
      courseIds,
    );
    const [assessmentRows] = await pool.query(
      `SELECT course_id, exam_type FROM student_marks WHERE course_id IN (${placeholders}) GROUP BY course_id, exam_type`,
      courseIds,
    );
    const countsCtx = await getEnrollmentAndMarksCounts(courseIds);

    const courseAttainment = [];
    const dataQualityWarnings = [];
    const semesterPoBuckets = new Map();

    for (const course of courses) {
      // eslint-disable-next-line no-await-in-loop
      const entry = await buildCourseAttainmentEntry(course, hierarchyCtx, countsCtx);
      const { result, ...publicEntry } = entry;
      courseAttainment.push(publicEntry);

      if (entry.coMappingMissing) {
        dataQualityWarnings.push({ courseId: course.id, courseCode: course.course_code, type: 'co_mapping_missing', message: `${course.course_code}: No Course Outcomes configured yet.` });
      }
      if (!entry.coMappingMissing && entry.poMappingMissing) {
        dataQualityWarnings.push({ courseId: course.id, courseCode: course.course_code, type: 'po_mapping_missing', message: `${course.course_code}: CO-PO articulation matrix is not mapped.` });
      }
      if (!entry.enrollmentConfigured) {
        dataQualityWarnings.push({ courseId: course.id, courseCode: course.course_code, type: 'enrollment_missing', message: `${course.course_code}: No students enrolled via Course Enrollment.` });
      }
      if (!entry.hasData) {
        dataQualityWarnings.push({ courseId: course.id, courseCode: course.course_code, type: 'marks_missing', message: `${course.course_code}: No MTT or ETT marks recorded yet.` });
      }
      if (entry.departmentMismatch) {
        dataQualityWarnings.push({ courseId: course.id, courseCode: course.course_code, type: 'department_mismatch', message: `${course.course_code}: listed department "${course.department}" does not match its linked program's department "${entry.departmentName}".` });
      }

      if (result && result.hasData) {
        const bucket = semesterPoBuckets.get(course.semester) || { sums: {}, count: 0 };
        Object.entries(result.poResults).forEach(([key, val]) => {
          bucket.sums[key] = (bucket.sums[key] || 0) + val;
        });
        bucket.count += 1;
        semesterPoBuckets.set(course.semester, bucket);
      }
    }

    const coursesWithData = courseAttainment.filter((c) => c.hasData);
    const avgCoAttainmentPercent = coursesWithData.length > 0
      ? parseFloat((coursesWithData.reduce((sum, c) => sum + c.overallPercent, 0) / coursesWithData.length).toFixed(1))
      : 0;

    const semesterPoHeatmap = Array.from(semesterPoBuckets.entries())
      .map(([semester, bucket]) => {
        const po = {};
        Object.entries(bucket.sums).forEach(([key, sum]) => {
          po[key] = parseFloat((((sum / bucket.count) / 9) * 100).toFixed(1));
        });
        return { semester, ...po };
      })
      .sort((a, b) => a.semester - b.semester);

    const allPoValues = semesterPoHeatmap.flatMap((row) =>
      Object.entries(row).filter(([k]) => k !== 'semester').map(([, v]) => v));
    const avgPoAttainmentPercent = allPoValues.length > 0
      ? parseFloat((allPoValues.reduce((a, b) => a + b, 0) / allPoValues.length).toFixed(1))
      : 0;

    res.json({
      success: true,
      data: {
        totalCourses: courses.length,
        totalStudents: distinctStudentRows[0].count,
        totalAssessments: assessmentRows.length,
        avgCoAttainmentPercent,
        avgPoAttainmentPercent,
        courseAttainment,
        semesterPoHeatmap,
        dataQualityWarnings,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/class/:classId — Section/Class-level view: real student roster, the
// real courses this class's students are enrolled in (via course_enrollments), each course's
// attainment via the SAME engine/helper as above, and marks-completion counted against this
// class's own roster (not the whole course's enrollment). RBAC: the underlying course
// attainment is still only computed for courses visible to this user via getCoursesByTeacher.
router.get('/dashboard/class/:classId', protect, async (req, res, next) => {
  try {
    const classId = req.params.classId;
    const cls = await getClassById(classId);
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found.' });

    const roster = await getStudentsForClass(classId);
    const rosterIds = roster.map((s) => s.id);

    const visibleCourses = await getCoursesByTeacher(req.user.id, req.user.role);
    const visibleCourseIds = visibleCourses.map((c) => c.id);

    let enrolledCourseIds = [];
    if (rosterIds.length > 0 && visibleCourseIds.length > 0) {
      const [rows] = await pool.query(
        `SELECT DISTINCT course_id FROM course_enrollments
         WHERE student_id IN (${rosterIds.map(() => '?').join(', ')})
           AND course_id IN (${visibleCourseIds.map(() => '?').join(', ')})`,
        [...rosterIds, ...visibleCourseIds],
      );
      enrolledCourseIds = rows.map((r) => r.course_id);
    }

    const classCourses = visibleCourses.filter((c) => enrolledCourseIds.includes(c.id));
    const hierarchyCtx = await getHierarchyContextForCourses(classCourses.map((c) => c.id));
    const countsCtx = await getEnrollmentAndMarksCounts(classCourses.map((c) => c.id));

    // Registration numbers of THIS class's roster, used to scope marks-completion to the
    // section rather than the whole course (a course can span multiple sections).
    const rosterRegNos = new Set(roster.map((s) => s.registration_number).filter(Boolean));

    const courseAttainment = [];
    for (const course of classCourses) {
      // eslint-disable-next-line no-await-in-loop
      const entry = await buildCourseAttainmentEntry(course, hierarchyCtx, countsCtx);
      const { result: _omit, ...publicEntry } = entry;

      // Marks-completion scoped to THIS class's roster (a course can span multiple sections,
      // so the course-wide recorded count isn't meaningful at section level).
      let sectionMttRecorded = null;
      let sectionEttRecorded = null;
      if (rosterRegNos.size > 0) {
        // eslint-disable-next-line no-await-in-loop
        const [markRows] = await pool.query(
          'SELECT DISTINCT reg_no, exam_type FROM student_marks WHERE course_id = ? AND exam_type IN (?, ?)',
          [course.id, 'MTT', 'ETT'],
        );
        sectionMttRecorded = markRows.filter((r) => r.exam_type === 'MTT' && rosterRegNos.has(r.reg_no)).length;
        sectionEttRecorded = markRows.filter((r) => r.exam_type === 'ETT' && rosterRegNos.has(r.reg_no)).length;
      }
      courseAttainment.push({ ...publicEntry, sectionMttRecorded, sectionEttRecorded, sectionRosterSize: roster.length });
    }

    res.json({
      success: true,
      data: {
        class: cls,
        roster,
        rosterSize: roster.length,
        courseAttainment,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
