// ─────────────────────────────────────────────────────────────────────────────
// Phase 13 — Program OBE model (schema + orchestration).
//
// Everything here is additive. The validated course-level engine
// (utils/attainmentCalculator.js) is reused as-is; this module only (a) adds the
// program-level outcome-versioning + improvement-plan tables/columns and (b)
// orchestrates per-course attainment reads into program / semester / batch
// summaries. No formula is re-implemented on the frontend.
//
// Outcome Versioning: `outcome_versions` groups a program's PEO/PO/PSO definitions
// under a label (e.g. "2026 Curriculum"). `program_outcomes.outcome_version_id`
// links each definition to its version. Historical reports stay reproducible
// because a version pins its outcome definitions; editing a definition updates the
// *current* version's rows, and a new version snapshots the prior set.
// ─────────────────────────────────────────────────────────────────────────────
const pool = require('../config/db');
const { ensureColumn } = require('./universityModel');
const { getProgramOutcomes } = require('./programOutcomeModel');
const { getActiveOutcomes } = require('./courseOutcomeModel');
const { getConfig, getCoPoValuesForCourse, getCoPoAveragesForCourse } = require('./mappingModel');
const { getCoMarksForCourse } = require('./marksModel');
const { getEnrolledStudentsForCourse, getCourseHierarchyContext, getProgramByIdWithContext } = require('./academicModel');
const { calculateCourseAttainment } = require('../utils/attainmentCalculator');
const {
  statusFor, round, aggregateOutcomeAcrossCourses, buildProgramOutlineNodes, validateDataCoverage,
} = require('../utils/obeAssessmentService');

// ── Context & course listing ─────────────────────────────────────────────────
const OUTCOME_COLUMNS = Array.from({ length: 12 }, (_, i) => `po${i + 1}`)
  .concat(Array.from({ length: 3 }, (_, i) => `pso${i + 1}`));

const getProgramOutcomeMap = async (programId, versionLabel) => {
  // Version-scoped read: report historical definitions (description/title) from the
  // requested outcome version, never the currently-editable set. This is what keeps a
  // later edit to the current PO description from rewriting an older version's report.
  const rows = versionLabel
    ? await (async () => {
      const [vRows] = await pool.query(
        'SELECT * FROM program_outcomes WHERE program_id = ? AND version_label = ? ORDER BY display_order ASC, code ASC',
        [programId, versionLabel],
      );
      return vRows;
    })()
    : await getProgramOutcomes(programId);
  const byType = { PEO: [], PO: [], PSO: [] };
  rows.forEach((r) => { (byType[r.type] || (byType[r.type] = [])).push(r); });
  return byType;
};

const listProgramCourses = async (programId, filters = {}) => {
  const conditions = ['program_id = ?'];
  const params = [programId];
  if (filters.sessionId) { conditions.push('academic_session_id = ?'); params.push(filters.sessionId); }
  if (filters.semester) { conditions.push('semester = ?'); params.push(filters.semester); }
  const [rows] = await pool.query(
    `SELECT * FROM courses WHERE ${conditions.join(' AND ')} ORDER BY semester ASC, course_code ASC`,
    params,
  );
  return rows;
};

// Computes one course's full attainment using the unmodified validated engine, and
// shapes it for the program dashboard. Also gathers the coverage facts used by the
// validation pass (mapping/enrollment/marks/missing students).
const computeCourseAttainmentRow = async (course, filters = {}) => {
  const config = await getConfig(course.id);
  const outcomes = await getActiveOutcomes(course.id);
  const coPoValues = await getCoPoValuesForCourse(course.id);
  const coPoAverages = await getCoPoAveragesForCourse(course.id);

  const enrolled = await getEnrolledStudentsForCourse(course.id);
  const enrolledCount = enrolled.length;

  const loadStudents = async (examType) => {
    const [rows] = await pool.query(
      'SELECT id, name, reg_no, student_id FROM student_marks WHERE course_id = ? AND exam_type = ?',
      [course.id, examType],
    );
    const coMarksByStudent = await getCoMarksForCourse(course.id, examType);
    return rows.map((s) => ({ ...s, coMarks: coMarksByStudent.get(s.id) || {} }));
  };

  const mttStudents = await loadStudents('MTT');
  const ettStudents = await loadStudents('ETT');

  const hasOutcomes = outcomes.length > 0;
  const hasMapping = coPoValues.some((v) => OUTCOME_COLUMNS.some((col) => Number(v[col]) > 0));
  const hasData = mttStudents.length > 0 || ettStudents.length > 0;

  // Honest missing-students figure: enrolled students without a recorded row for either
  // component. If enrollment was never configured this is reported via enrollmentConfigured
  // instead (never a fabricated 0/0 = 100%).
  const enrolledRegNos = new Set(enrolled.map((s) => String(s.registration_number || '').toLowerCase()));
  const recordedRegNos = new Set([
    ...mttStudents.map((s) => String(s.reg_no || '').toLowerCase()),
    ...ettStudents.map((s) => String(s.reg_no || '').toLowerCase()),
  ]);
  const missingStudents = enrolledCount > 0
    ? [...enrolledRegNos].filter((r) => r && !recordedRegNos.has(r)).length
    : 0;

  let result = null;
  if (config && hasOutcomes) {
    result = calculateCourseAttainment({ courseOutcomes: outcomes, config, coPoAverages, mttStudents, ettStudents });
  }

  const coNodesForCourse = outcomes.map((co) => {
    const combined = result?.combinedCO?.[co.id];
    const actualLevel = combined ? Number(combined.combinedLevel) : null;
    const actualPercent = actualLevel === null ? null : round((actualLevel / 3) * 100, 2);
    const target = co.target_percent === null || co.target_percent === undefined ? null : Number(co.target_percent);
    const mtt = result?.mttAttainment?.perCo?.[co.id];
    const ett = result?.ettAttainment?.perCo?.[co.id];
    return {
      coId: co.id,
      coNumber: co.co_number,
      code: `CO${co.co_number}`,
      description: co.description,
      actualLevel,
      actualPercent,
      // Normalised aliases consumed by obeAssessmentService (summarizeAchievement / identifyWeakFromNodes)
      actual: actualPercent,
      target,
      targetPercent: target,
      status: statusFor(actualPercent, target),
      studentsAssessed: mtt?.totalStudents ?? ett?.totalStudents ?? 0,
      assessmentContribution: [
        mtt ? { examType: 'MTT', level: mtt.level, percentAbove: mtt.percentAbove, studentsAboveThreshold: mtt.studentsAboveThreshold, totalStudents: mtt.totalStudents, thresholdMarks: mtt.thresholdMarks, maxMarks: mtt.maxMarks } : null,
        ett ? { examType: 'ETT', level: ett.level, percentAbove: ett.percentAbove, studentsAboveThreshold: ett.studentsAboveThreshold, totalStudents: ett.totalStudents, thresholdMarks: ett.thresholdMarks, maxMarks: ett.maxMarks } : null,
      ].filter(Boolean),
    };
  });

  const poValues = {};
  const psoValues = {};
  OUTCOME_COLUMNS.forEach((col) => {
    const val = result?.poResults?.[col];
    if (val === undefined) return;
    if (col.startsWith('pso')) psoValues[col] = val;
    else poValues[col] = val;
  });

  return {
    courseId: course.id,
    courseCode: course.course_code,
    subjectName: course.subject_name,
    semester: course.semester,
    academicYear: course.academic_year,
    sessionId: course.academic_session_id,
    enrolledCount,
    hasOutcomes,
    hasMapping,
    hasData,
    enrollmentConfigured: enrolledCount > 0,
    missingStudents,
    overallCourseAttainment: result ? result.overallCourseAttainment : null,
    overallPercent: result ? round((result.overallCourseAttainment / 3) * 100, 1) : null,
    coNodes: coNodesForCourse,
    poValues,
    psoValues,
    coPoValues, // cached for heatmap reuse
  };
};
const createOutcomeVersionsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS outcome_versions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      program_id INT NOT NULL,
      label VARCHAR(100) NOT NULL,
      description TEXT,
      is_current TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
};

const createImprovementPlanTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS improvement_action_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      program_id INT NOT NULL,
      outcome_version_id INT DEFAULT NULL,
      academic_session_id INT DEFAULT NULL,
      semester INT DEFAULT NULL,
      course_id INT DEFAULT NULL,
      course_outcome_id INT DEFAULT NULL,
      program_outcome_id INT DEFAULT NULL,
      outcome_code VARCHAR(20) NOT NULL,
      issue TEXT,
      probable_cause TEXT,
      corrective_action TEXT,
      responsible_faculty VARCHAR(255) DEFAULT NULL,
      target_date DATE DEFAULT NULL,
      status ENUM('Planned','In Progress','Completed') NOT NULL DEFAULT 'Planned',
      remarks TEXT,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
};

// One-time additive migration: seed a default outcome version for every program and
// bind its existing program_outcomes rows to it. Idempotent per program.
const seedDefaultOutcomeVersions = async () => {
  const [programs] = await pool.query('SELECT id FROM programs');
  for (const p of programs) {
    const [existing] = await pool.query(
      'SELECT id FROM outcome_versions WHERE program_id = ? AND label = ?',
      [p.id, 'current'],
    );
    let versionId;
    if (existing.length === 0) {
      const [res] = await pool.query(
        `INSERT INTO outcome_versions (program_id, label, description, is_current)
         VALUES (?, 'current', 'Active curriculum outcome definitions', 1)`,
        [p.id],
      );
      versionId = res.insertId;
    } else {
      versionId = existing[0].id;
    }
    await pool.query(
      'UPDATE program_outcomes SET outcome_version_id = ? WHERE program_id = ? AND outcome_version_id IS NULL',
      [versionId, p.id],
    );
  }
};

// Adds the additive target columns. Never touches existing data.
const ensureOBETargetColumns = async () => {
  await ensureColumn('program_outcomes', 'target', 'DECIMAL(5,2) DEFAULT 2.00 AFTER version_label');
  await ensureColumn('program_outcomes', 'outcome_version_id', 'INT DEFAULT NULL AFTER program_id');
  await ensureColumn('course_outcomes', 'target_percent', 'DECIMAL(5,2) DEFAULT 60.00 AFTER max_external');
  await ensureColumn('course_outcomes', 'outcome_version_id', 'INT DEFAULT NULL AFTER target_percent');
  try {
    await pool.query('UPDATE program_outcomes SET target = 2.00 WHERE target IS NULL');
  } catch (err) {
    // ignore if table not ready yet
  }
};

const ensureOBESchema = async () => {
  await createOutcomeVersionsTable();
  await createImprovementPlanTable();
  await ensureOBETargetColumns();
  await seedDefaultOutcomeVersions();
};
// ── Program dashboard ─────────────────────────────────────────────────────────
const getProgramContext = async (programId) => {
  const program = await getProgramByIdWithContext(programId);
  if (!program) return null;
  return program;
};

const getCurrentOutcomeVersion = async (programId) => {
  const [rows] = await pool.query(
    'SELECT * FROM outcome_versions WHERE program_id = ? ORDER BY is_current DESC, id DESC LIMIT 1',
    [programId],
  );
  return rows[0] || null;
};

// Compose the full program-level OBE dashboard payload. This is the single
// authoritative aggregation consumed by the dashboard UI and report exports.
const getProgramDashboard = async (programId, filters = {}) => {
  const program = await getProgramContext(programId);
  if (!program) {
    const err = new Error('Program not found.');
    err.status = 404;
    throw err;
  }

  // When a version label filter is supplied, definitions AND version metadata resolve to
  // that specific outcome version (historical snapshot); otherwise the current version is used.
  const versionLabel = filters.versionLabel || null;
  const outcomeVersion = (versionLabel
    ? (await pool.query(
      'SELECT * FROM outcome_versions WHERE program_id = ? AND label = ? ORDER BY id DESC LIMIT 1',
      [programId, versionLabel],
    ))[0][0]
    : await getCurrentOutcomeVersion(programId)) || null;
  const effectiveLabel = outcomeVersion?.label || versionLabel || null;
  const outcomeMap = await getProgramOutcomeMap(programId, effectiveLabel);
  const courses = await listProgramCourses(programId, filters);

  const courseRows = [];
  const courseSummary = {};
  const coNodes = [];
  const poCourseRows = [];
  const psoCourseRows = [];
  const coPoValuesCache = {};

  // Parallelize per-course attainment computation — each course's data is independent, so
  // Promise.all runs them concurrently without changing the calculation results.
  const courseResults = await Promise.all(courses.map(async (course) => {
    const row = await computeCourseAttainmentRow(course, filters);
    coPoValuesCache[course.id] = row.coPoValues || [];
    return { course, row };
  }));

  for (const { course, row } of courseResults) {
    courseRows.push({
      courseId: row.courseId,
      courseCode: row.courseCode,
      subjectName: row.subjectName,
      semester: row.semester,
      academicYear: row.academicYear,
      sessionId: row.sessionId,
      enrolledCount: row.enrolledCount,
      hasOutcomes: row.hasOutcomes,
      hasMapping: row.hasMapping,
      hasData: row.hasData,
      enrollmentConfigured: row.enrollmentConfigured,
      missingStudents: row.missingStudents,
      overallCourseAttainment: row.overallCourseAttainment,
      overallPercent: row.overallPercent,
      cos: row.coNodes,
    });
    courseSummary[course.id] = row;

    row.coNodes.forEach((cn) => coNodes.push({ ...cn, courseId: course.id, courseCode: course.course_code }));
    poCourseRows.push({ code: course.course_code, courseId: course.id, enrolledCount: row.enrolledCount, values: row.poValues });
    psoCourseRows.push({ code: course.course_code, courseId: course.id, enrolledCount: row.enrolledCount, values: row.psoValues });
  }

  // PO / PSO nodes — target comes from the program's outcome definitions when present, defaulting to 2.00.
  const poAttainment = (outcomeMap.PO || []).map((def) => {
    const agg = aggregateOutcomeAcrossCourses(poCourseRows, def.code.toLowerCase(), 'enrolledCount');
    const target = def.target !== null && def.target !== undefined && def.target !== '' ? Number(def.target) : 2.00;
    return {
      id: def.id, code: def.code, title: def.title, description: def.description,
      attainment: agg.attainment,
      // Normalised aliases for obeAssessmentService
      actual: agg.attainment,
      target,
      status: statusFor(agg.attainment, target),
      mapped: agg.mapped, contributions: agg.contributions,
    };
  });

  const psoAttainment = (outcomeMap.PSO || []).map((def) => {
    const agg = aggregateOutcomeAcrossCourses(psoCourseRows, def.code.toLowerCase(), 'enrolledCount');
    const target = def.target !== null && def.target !== undefined && def.target !== '' ? Number(def.target) : 2.00;
    return {
      id: def.id, code: def.code, title: def.title, description: def.description,
      attainment: agg.attainment,
      // Normalised aliases for obeAssessmentService
      actual: agg.attainment,
      target,
      status: statusFor(agg.attainment, target),
      mapped: agg.mapped, contributions: agg.contributions,
    };
  });

  const outline = buildProgramOutlineNodes({
    coNodes,
    poNodes: poAttainment.filter((p) => p.mapped),
    psoNodes: psoAttainment.filter((p) => p.mapped),
  });

  // Heatmap: rows are each course's COs, columns are the program's actual PO/PSO codes.
  // Reuses the co_po_values already loaded during course attainment computation (no N+1).
  const poColumns = (outcomeMap.PO || []).map((d) => d.code);
  const psoColumns = (outcomeMap.PSO || []).map((d) => d.code);
  const heatmapRows = [];
  for (const course of courses) {
    const coPoValues = coPoValuesCache[course.id] || [];
    for (const row of coPoValues) {
      const values = {};
      poColumns.forEach((code) => { values[code] = Number(row[code.toLowerCase()] || 0); });
      psoColumns.forEach((code) => { values[code] = Number(row[code.toLowerCase()] || 0); });
      heatmapRows.push({
        courseId: course.id, courseCode: course.course_code, coCode: `CO${row.co_number}`, values,
      });
    }
  }

  const validation = validateDataCoverage({
    program, courses,
    outcomeCodes: { PEO: outcomeMap.PEO, PO: outcomeMap.PO, PSO: outcomeMap.PSO },
    courseSummary,
  });

  return {
    program: { id: program.id, name: program.name, code: program.code, degree: program.degree },
    outcomeVersion,
    filters,
    coAttainment: courseRows,
    poAttainment,
    psoAttainment,
    achievementSummary: outline.summary,
    weakOutcomes: outline.weak,
    heatmap: { rows: heatmapRows, columns: { PO: poColumns, PSO: psoColumns } },
    validation,
  };
};

// Per-course / per-CO student drill-down (underlying assessment marks for both components).
const getCourseCOStudentDrilldown = async (courseId, coNumber) => {
  const outcomes = await getActiveOutcomes(courseId);
  const co = outcomes.find((o) => o.co_number === Number(coNumber));
  if (!co) {
    const err = new Error(`CO${coNumber} not found for this course.`);
    err.status = 404;
    throw err;
  }
  const loadStudents = async (examType) => {
    const [rows] = await pool.query(
      `SELECT sm.id, sm.name, sm.reg_no, sm.student_id, scm.marks
       FROM student_marks sm
       JOIN student_co_marks scm ON scm.student_mark_id = sm.id
       WHERE sm.course_id = ? AND sm.exam_type = ? AND scm.co_id = ?`,
      [courseId, examType, co.id],
    );
    return rows.map((r) => ({
      roll: r.reg_no, enrollment: r.student_id, name: r.name,
      marks: Number(r.marks) || 0, examType,
    }));
  };
  return { coId: co.id, coNumber: co.co_number, description: co.description, mtt: await loadStudents('MTT'), ett: await loadStudents('ETT') };
};
// ── Improvement / action plans ───────────────────────────────────────────────
// Every plan is stored against program + outcome version (+ optional year/semester/
// course/outcome). New plans are always inserted — never overwrite an earlier one —
// so historical improvement records remain reproducible.
const getActionPlans = async (programId, filters = {}) => {
  const conditions = ['program_id = ?'];
  const params = [programId];
  if (filters.outcomeCode) { conditions.push('outcome_code = ?'); params.push(filters.outcomeCode); }
  if (filters.sessionId || filters.batchId) { conditions.push('academic_session_id = ?'); params.push(filters.sessionId || filters.batchId); }
  if (filters.semester) { conditions.push('semester = ?'); params.push(filters.semester); }
  const [rows] = await pool.query(
    `SELECT * FROM improvement_action_plans WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC, id DESC`,
    params,
  );
  return rows;
};

const createActionPlan = async (programId, data, actor) => {
  await pool.query(
    `INSERT INTO improvement_action_plans
      (program_id, outcome_version_id, academic_session_id, semester, course_id,
       course_outcome_id, program_outcome_id, outcome_code, issue, probable_cause,
       corrective_action, responsible_faculty, target_date, status, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      programId, data.outcomeVersionId || null, data.sessionId || data.batchId || null,
      data.semester || null, data.courseId || null, data.courseOutcomeId || null,
      data.programOutcomeId || null, data.outcomeCode, data.issue || null,
      data.probableCause || null, data.correctiveAction || null,
      data.responsibleFaculty || null, data.targetDate || null,
      data.status || 'Planned', data.remarks || null, actor,
    ],
  );
  const [rows] = await pool.query(
    'SELECT * FROM improvement_action_plans WHERE id = LAST_INSERT_ID()',
  );
  return rows[0];
};

const updateActionPlan = async (programId, planId, patch) => {
  const allowed = {
    outcomeCode: 'outcome_code', issue: 'issue', probableCause: 'probable_cause',
    correctiveAction: 'corrective_action', responsibleFaculty: 'responsible_faculty',
    targetDate: 'target_date', status: 'status', remarks: 'remarks',
    sessionId: 'academic_session_id', semester: 'semester',
  };
  const sets = [];
  const values = [];
  for (const [key, col] of Object.entries(allowed)) {
    if (patch[key] !== undefined) { sets.push(`${col} = ?`); values.push(patch[key]); }
  }
  if (sets.length === 0) return false;
  values.push(planId, programId);
  const [result] = await pool.query(
    `UPDATE improvement_action_plans SET ${sets.join(', ')} WHERE id = ? AND program_id = ?`,
    values,
  );
  return result.affectedRows > 0;
};

const deleteActionPlan = async (programId, planId) => {
  const [result] = await pool.query(
    'DELETE FROM improvement_action_plans WHERE id = ? AND program_id = ?',
    [planId, programId],
  );
  return result.affectedRows > 0;
};

// ── Outcome versions ─────────────────────────────────────────────────────────
const listOutcomeVersions = async (programId) => {
  const [rows] = await pool.query(
    'SELECT * FROM outcome_versions WHERE program_id = ? ORDER BY created_at DESC, id DESC',
    [programId],
  );
  return rows;
};

const createOutcomeVersion = async (programId, { label, description }) => {
  if (!label) {
    const err = new Error('Outcome version label is required.');
    err.status = 400;
    throw err;
  }
  // Clear is_current on existing versions for this program, then insert the new one.
  await pool.query(
    'UPDATE outcome_versions SET is_current = 0 WHERE program_id = ?',
    [programId],
  );
  const [res] = await pool.query(
    `INSERT INTO outcome_versions (program_id, label, description, is_current)
     VALUES (?, ?, ?, 1)`,
    [programId, label, description || null],
  );
  const versionId = res.insertId;
  return (await pool.query('SELECT * FROM outcome_versions WHERE id = ?', [versionId]))[0][0];
};

module.exports = {
  ensureOBESchema,
  createOutcomeVersionsTable,
  createImprovementPlanTable,
  getProgramContext,
  getProgramOutcomeMap,
  listProgramCourses,
  computeCourseAttainmentRow,
  getProgramDashboard,
  getCourseCOStudentDrilldown,
  getActionPlans,
  createActionPlan,
  updateActionPlan,
  deleteActionPlan,
  listOutcomeVersions,
  createOutcomeVersion,
};