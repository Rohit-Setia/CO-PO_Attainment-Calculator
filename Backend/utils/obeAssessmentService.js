// ─────────────────────────────────────────────────────────────────────────────
// Phase 13 — Program-level OBE assessment service (pure functions).
//
// This module contains ONLY stateless, reusable aggregation/classification logic.
// It never touches the database and never re-derives a course's CO/PO/PSO values —
// those come from the validated engine in ./attainmentCalculator.js (via
// Backend/models/obeModel.js). Keeping these helpers free of DB I/O makes them
// trivially unit-testable offline and guarantees a single authoritative formula
// (no duplicated calculation logic on the frontend).
//
// Grade scale: direct CO/PO/PSO attainment is on a 0–3 level scale (the existing
// engine's output). CO attainment is additionally reported as a percentage
// (level / 3 × 100) for threshold-style targets. Target configuration lives on
// the outcome rows (course_outcomes.target_percent for COs, program_outcomes.target
// for POs/PSOs), established by obeModel.ensureOBESchema().
// ─────────────────────────────────────────────────────────────────────────────

// Maps an outcome's actual level/percent against its configured target and returns
// an honest status. A missing target OR missing data is never classified as failure.
const statusFor = (actual, target) => {
  if (actual === null || actual === undefined || Number.isNaN(Number(actual))) return 'No Data';
  if (target === null || target === undefined || Number.isNaN(Number(target))) return 'No Target';
  return Number(actual) >= Number(target) ? 'Achieved' : 'Not Achieved';
};

// Filters outcome nodes that sit strictly below their configured target.
// A node without a target, or without data, is never reported weak (data-driven only).
const identifyWeakFromNodes = (nodes) =>
  (Array.isArray(nodes) ? nodes : []).filter((n) => {
    if (n.actual === null || n.actual === undefined) return false;
    if (n.target === null || n.target === undefined) return false;
    return Number(n.actual) < Number(n.target);
  });

// Summarizes achievement across a collection of outcome nodes. Returns
// { achieved, total, not }
// counting only nodes that have BOTH an actual value and a configured target;
// everything else is excluded (never silently reported as 0).
const summarizeAchievement = (nodes) => {
  const scorable = (Array.isArray(nodes) ? nodes : []).filter(
    (n) => n && n.actual !== null && n.actual !== undefined && n.target !== null && n.target !== undefined,
  );
  const achieved = scorable.filter((n) => Number(n.actual) >= Number(n.target)).length;
  const not = scorable.filter((n) => Number(n.actual) < Number(n.target)).length;
  const weak = scorable.filter((n) => Number(n.actual) < Number(n.target));
  return { achieved, total: scorable.length, not, weak };
};

// Rounds to a fixed number of decimal places, tolerating non-numeric input.
const round = (value, digits = 2) => {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Number(n.toFixed(digits));
};

// Student-weighted aggregation of a PO/PSO code across multiple course rows.
// `courseRows` — array of:
//   { code, courseId, enrolledCount:number, values:{ [outcomeKey]: number|string, ... } }
// For each course we read course.values[outcomeKey]; only courses whose value is
// numeric and > 0 contribute (a course that never mapped to the outcome must NOT
// drag the program value toward zero). The weight is the enrolled-student count so
// a course with more students weighs proportionally more; the caller already
// restricted the course list to the selected semester/session scope, so students
// are not double counted.
const aggregateOutcomeAcrossCourses = (courseRows, outcomeKey, enrolledKey = 'enrolledCount') => {
  let weightedSum = 0;
  let totalWeight = 0;
  const contributions = [];

  (Array.isArray(courseRows) ? courseRows : []).forEach((cr) => {
    const raw = cr.values?.[outcomeKey];
    const val = raw === null || raw === undefined ? 0 : Number(raw);
    if (Number.isNaN(val) || val <= 0) return; // not mapped / no data — ignore
    const weight = Number(cr[enrolledKey]) || 1; // fall back to equal weight
    weightedSum += val * weight;
    totalWeight += weight;
    contributions.push({ code: cr.code, courseId: cr.courseId, contribution: round(val, 2), weight });
  });

  if (totalWeight === 0) return { attainment: 0, mapped: false, contributions };
  return { attainment: round(weightedSum / totalWeight, 2), mapped: true, contributions };
};

// Builds the weak-outcome lists and achievement summary blocks that the program
// dashboard renders. `poNodes`/`psoNodes`/`coNodes` are already-shaped outcome
// nodes ({ code, actual, target, ... }).
function buildProgramOutlineNodes({ poNodes = [], psoNodes = [], coNodes = [] }) {
  return {
    weak: {
      CO: identifyWeakFromNodes(coNodes),
      PO: identifyWeakFromNodes(poNodes),
      PSO: identifyWeakFromNodes(psoNodes),
    },
    summary: {
      CO: summarizeAchievement(coNodes),
      PO: summarizeAchievement(poNodes),
      PSO: summarizeAchievement(psoNodes),
    },
  };
}

// Program-level data-completeness/validation. Returns a flat list of
//   { level: 'error'|'warning'|'ok', type, message }
// built purely from the coverage facts passed in — never invents zeros.
function validateDataCoverage({ program, outcomeCodes = { PEO: [], PO: [], PSO: [] }, courses = [], courseSummary = {}, info }) {
  const items = [];
  info = info || ((code, message) => items.push({ level: 'info', type: code, message }));
  const err = (code, message) => items.push({ level: 'error', type: code, message });
  const warn = (code, message) => items.push({ level: 'warning', type: code, message });
  const ok = (code, message) => items.push({ level: 'ok', type: code, message });

  if (!program) err('program_missing', 'No program selected.');
  if (outcomeCodes.PO?.length === 0) warn('po_missing', 'No Program Outcomes (POs) configured yet.');
  if (outcomeCodes.PSO?.length === 0) warn('pso_missing', 'No Program Specific Outcomes (PSOs) configured yet.');
  if (outcomeCodes.PEO?.length === 0) info('peo_missing', 'No Programme Educational Objectives (PEOs) configured yet.');

  if (courses.length === 0) {
    err('no_courses', 'No courses exist for this program / filter scope.');
    return items;
  }
  courses.forEach((course) => {
    const c = courseSummary[course.id] || {};
    if (!c.hasOutcomes) warn(`course_${course.id}_co`, `${course.code}: No Course Outcomes configured.`);
    if (c.hasOutcomes && !c.hasMapping) warn(`course_${course.id}_mapping`, `${course.code}: CO-PO / CO-PSO articulation matrix is not mapped.`);
    if (!c.enrollmentConfigured) warn(`course_${course.id}_enroll`, `${course.code}: No students enrolled via Course Enrollment.`);
    if (!c.hasData) warn(`course_${course.id}_marks`, `${course.code}: No MTT/ETT marks recorded for the selected scope.`);
    if (c.missingStudents) warn(`course_${course.id}_missing`, `${course.code}: ${c.missingStudents} enrolled student(s) have no recorded marks.`);
  });

  if (items.length === 0) ok('complete', 'OBE data is fully configured for the selected scope.');
  return items;
};

module.exports = {
  statusFor,
  identifyWeakFromNodes,
  summarizeAchievement,
  round,
  aggregateOutcomeAcrossCourses,
  buildProgramOutlineNodes,
  validateDataCoverage,
};