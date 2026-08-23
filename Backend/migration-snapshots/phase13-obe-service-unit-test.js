// Phase 13 — offline unit tests for the pure OBE assessment service.
// Usage: node migration-snapshots/phase13-obe-service-unit-test.js
// No DB, no server — validates the classification/aggregation helpers directly.
const { assert } = require('console');
const {
  statusFor, identifyWeakFromNodes, summarizeAchievement, round,
  aggregateOutcomeAcrossCourses, buildProgramOutlineNodes, validateDataCoverage,
} = require('../utils/obeAssessmentService');

let pass = 0; let fail = 0;
function check(label, ok, detail) {
  if (ok) { pass += 1; console.log(`  PASS: ${label}`); }
  else { fail += 1; console.error(`  FAIL: ${label} — ${detail}`); }
}

console.log('\n── statusFor semantics ──');
check('2.42 >= 2.50 → Not Achieved', statusFor(2.42, 2.5), statusFor(2.42, 2.5));
check('2.67 >= 2.50 → Achieved', statusFor(2.67, 2.5) === 'Achieved', statusFor(2.67, 2.5));
check('Actual at boundary → Achieved', statusFor(2.5, 2.5) === 'Achieved', statusFor(2.5, 2.5));
check('Missing actual → No Data (never Not Achieved)', statusFor(null, 2.5) === 'No Data', statusFor(null, 2.5));
check('Missing target → No Target (never Not Achieved)', statusFor(1.5, null) === 'No Target', statusFor(1.5, null));
check('Percent target works too', statusFor(58, 60) === 'Not Achieved' && statusFor(72, 60) === 'Achieved', '');

console.log('\n── weak outcome identification (data-driven, no hardcoding) ──');
const nodes = [
  { code: 'PO3', actual: 2.21, target: 2.5 },
  { code: 'PO1', actual: 2.67, target: 2.5 },
  { code: 'PSO2', actual: 2.18, target: 2.5 },
  { code: 'PO2', actual: null, target: 2.5 },
  { code: 'PO4', actual: 2.1, target: null },
];
const weak = identifyWeakFromNodes(nodes);
check('Weak list contains exactly PO3 and PSO2', weak.length === 2 && weak.map((w) => w.code).sort().join(',') === 'PO3,PSO2',
  JSON.stringify(weak.map((w) => w.code)));
check('Outcome with null actual is never weak', !weak.some((w) => w.code === 'PO2'), '');
check('Outcome with no target is never weak', !weak.some((w) => w.code === 'PO4'), '');

console.log('\n── achievement summary ──');
const sum = summarizeAchievement(nodes);
check('Achieved = 1 (PO1)', sum.achieved === 1, JSON.stringify(sum));
check('Total scorable = 3 (PO1, PO3, PSO2)', sum.total === 3, `total=${sum.total}`);
check('Not achieved = 2', sum.not === 2, `not=${sum.not}`);

console.log('\n── student-weighted aggregate ──');
const rows = [
  { code: 'MGT101', courseId: 17, enrolledCount: 25, values: { po3: 2.3 } },
  { code: 'MGT102', courseId: 18, enrolledCount: 15, values: { po3: 2.1 } },
  { code: 'FIN101', courseId: 19, enrolledCount: 30, values: { po3: 0 } },  // not mapped -> must not drag toward 0
  { code: 'ECO101', courseId: 20, enrolledCount: 20, values: {} },           // no mapping row
];
const agg = aggregateOutcomeAcrossCourses(rows, 'po3');
const expected = ((25 * 2.3) + (15 * 2.1)) / 40; // only mapped courses contribute
check('Weighted attainment = (25*2.3 + 15*2.1)/40', agg.attainment === round(expected, 2), `got ${agg.attainment}`);
check('Unmapped / zero courses excluded (mapped count = 2 contributions)', agg.contributions.length === 2, JSON.stringify(agg.contributions));
check('Contribution weights carried', agg.contributions[0].weight === 25 && agg.contributions[1].weight === 15, JSON.stringify(agg.contributions));

const emptyAgg = aggregateOutcomeAcrossCourses(rows, 'pso1');
check('No mapping anywhere → mapped=false, attainment 0 (not fabricated)', emptyAgg.mapped === false && emptyAgg.attainment === 0, JSON.stringify(emptyAgg));

console.log('\n── outline builder ──');
const outline = buildProgramOutlineNodes({
  coNodes: [{ code: 'CO4', actual: 58, target: 60 }, { code: 'CO1', actual: 72, target: 60 }],
  poNodes: nodes,
});

check('CO weak contains CO4', outline.weak.CO.some((w) => w.code === 'CO4'), JSON.stringify(outline.weak.CO));
check('PO weak contains PO3', outline.weak.PO.some((w) => w.code === 'PO3'), '');
check('Weak is empty for scorable-none', outline.weak.PSO.length === 0 || JSON.stringify(outline.weak.PSO), '');
check('Summary PO total counts only scorable (PO3, PO1, PSO2 → 3)', outline.summary.PO.total === 3, JSON.stringify(outline.summary.PO));

console.log('\n── validateDataCoverage ──');
const validation = validateDataCoverage({
  program: { id: 3 },
  outcomeCodes: { PEO: [], PO: [{}], PSO: [{}] },
  courses: [{ id: 17, code: 'MGT101' }],
  courseSummary: { 17: { hasOutcomes: true, hasMapping: false, enrollmentConfigured: true, hasData: true } },
});
check('Flags unmapped course', validation.some((v) => v.type === 'course_17_mapping'), JSON.stringify(validation));
check('Flags missing PEO info', validation.some((v) => v.type === 'peo_missing'), '');
const completeValidation = validateDataCoverage({
  program: { id: 3 },
  outcomeCodes: { PEO: [{}], PO: [{}], PSO: [{}] },
  courses: [{ id: 17, code: 'MGT101' }],
  courseSummary: { 17: { hasOutcomes: true, hasMapping: true, enrollmentConfigured: true, hasData: true, missingStudents: 0 } },
});
check('Fully-configured scope reports ok', completeValidation.some((v) => v.type === 'complete'), JSON.stringify(completeValidation));

console.log(`\n=== Phase 13 OBE Service Unit: Pass ${pass}, Fail ${fail} ===`);
process.exit(fail > 0 ? 1 : 0);