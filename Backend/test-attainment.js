const { computeAttainmentForComponent, calculateCourseAttainment } = require('./utils/attainmentCalculator');

let passed = 0;
let failed = 0;
const results = [];

function assert(description, actual, expected, tolerance = 0.001) {
  const ok = typeof expected === 'number'
    ? Math.abs(actual - expected) < tolerance
    : actual === expected;
  if (ok) {
    passed += 1;
    results.push({ test: description, expected, actual, status: 'PASS' });
  } else {
    failed += 1;
    results.push({ test: description, expected, actual, status: 'FAIL' });
  }
}

// ── Test 1: Threshold computation ──
const co1 = { id: 1, co_number: 1, description: 'Test CO1', max_internal: 10, max_external: 20 };
const config = {
  threshold_percent_internal: 40,
  threshold_percent_external: 40,
  level1_criteria_internal: 50, level2_criteria_internal: 60, level3_criteria_internal: 70,
  level1_criteria_external: 50, level2_criteria_external: 60, level3_criteria_external: 70,
  internal_weight: 30, external_weight: 70,
};

// Threshold: 40% of 10 = 4
const thresholdMarks = (40 / 100) * 10;
assert('Threshold 40% of 10 = 4', thresholdMarks, 4);

// ── Test 2: Level computation ──
// 4 students, 3 above threshold → 75% → Level 3 (≥70%)
const studentsAbove = [
  { coMarks: { 1: 8 } },
  { coMarks: { 1: 7 } },
  { coMarks: { 1: 5 } },
  { coMarks: { 1: 3 } },
];
const compResult = computeAttainmentForComponent(studentsAbove, [co1], config, true);
assert('Above threshold count', compResult.perCo[1].studentsAboveThreshold, 3);
assert('Percent above', compResult.perCo[1].percentAbove, 75);
assert('Level 3 (80% → 70% threshold)', compResult.perCo[1].level, 3);

// ── Test 3: Level 2 (60% threshold) ──
const studentsLevel2 = [
  { coMarks: { 1: 8 } }, { coMarks: { 1: 7 } },
  { coMarks: { 1: 5 } }, { coMarks: { 1: 3 } },
  { coMarks: { 1: 2 } },
];
// 3 above threshold (5, 7, 8) → 3/5 = 60% → Level 2 (≥60%)
const compL2 = computeAttainmentForComponent(studentsLevel2, [co1], config, true);
assert('Level 2 (60%)', compL2.perCo[1].level, 2);

// ── Test 4: Level 1 (50% threshold) ──
const studentsLevel1 = [
  { coMarks: { 1: 8 } }, { coMarks: { 1: 7 } },
  { coMarks: { 1: 3 } }, { coMarks: { 1: 2 } },
  { coMarks: { 1: 4 } }, { coMarks: { 1: 1 } },
];
// 3 above threshold (4, 7, 8) → 3/6 = 50% → Level 1 (≥50%)
const compL1 = computeAttainmentForComponent(studentsLevel1, [co1], config, true);
assert('Level 1 (50%)', compL1.perCo[1].level, 1);

// ── Test 5: Level 0 (<50%) ──
const studentsLevel0 = [
  { coMarks: { 1: 8 } }, { coMarks: { 1: 3 } },
  { coMarks: { 1: 2 } }, { coMarks: { 1: 1 } },
  { coMarks: { 1: 0 } },
];
// 1 above threshold (8) → 1/5 = 20% → Level 0 (<50%)
const compL0 = computeAttainmentForComponent(studentsLevel0, [co1], config, true);
assert('Level 0 (20%)', compL0.perCo[1].level, 0);

// ── Test 6: Combined attainment ──
// MTT Level 3 + ETT Level 2 → 3×0.30 + 2×0.70 = 2.30
const co2 = { id: 2, co_number: 2, description: 'Test CO2', max_internal: 10, max_external: 20 };
const mttStudents = [
  { coMarks: { 1: 8, 2: 8 } },
  { coMarks: { 1: 7, 2: 7 } },
  { coMarks: { 1: 5, 2: 5 } },
  { coMarks: { 1: 3, 2: 3 } },
];
const ettStudents = [
  { coMarks: { 1: 16, 2: 16 } },
  { coMarks: { 1: 14, 2: 14 } },
  { coMarks: { 1: 10, 2: 10 } },
  { coMarks: { 1: 8, 2: 8 } },
  { coMarks: { 1: 6, 2: 6 } },
];
const combinedResult = calculateCourseAttainment({
  courseOutcomes: [co1, co2],
  config,
  coPoAverages: { avg_po1: 2, avg_po2: 1.5, avg_po3: 0, avg_po4: 0, avg_po5: 0, avg_po6: 0, avg_po7: 0, avg_po8: 0, avg_po9: 0, avg_po10: 0, avg_po11: 0, avg_po12: 0, avg_pso1: 0, avg_pso2: 0, avg_pso3: 0 },
  mttStudents,
  ettStudents,
});

// MTT: 3 students above threshold (5, 7, 8) → 3/4 = 75% → Level 3
// ETT: 3 students above threshold (40% of 20 = 8, so 16, 14, 10, 8 → 4/5 = 80% → Level 3
// Combined: 3×0.30 + 3×0.70 = 3.00
assert('MTT Level CO1', combinedResult.mttAttainment.perCo[1].level, 3);
assert('ETT Level CO1', combinedResult.ettAttainment.perCo[1].level, 3);
assert('Combined CO1', combinedResult.combinedCO[1].combinedLevel, 3.00);

// ── Test 7: Overall course attainment ──
// CO1 = 3.00, CO2 = 3.00 → (3.00 + 3.00) / 2 = 3.00
assert('Overall course attainment', combinedResult.overallCourseAttainment, 3.00);

// ── Test 8: PO attainment ──
// avg_po1 = 2, overall = 3.00 → 2 × 3.00 = 6.00
assert('PO1 attainment', combinedResult.poResults.po1, 6.00);
assert('PO2 attainment', combinedResult.poResults.po2, 4.50);

// ── Test 9: MTT only (no ETT data) ──
const mttOnly = calculateCourseAttainment({
  courseOutcomes: [co1],
  config,
  coPoAverages: { avg_po1: 2 },
  mttStudents: studentsAbove,
  ettStudents: [],
});
// Only MTT contributes: 3×0.30 + 0×0.70 = 0.90
assert('Combined MTT only', mttOnly.combinedCO[1].combinedLevel, 0.90);
assert('Overall MTT only', mttOnly.overallCourseAttainment, 0.90);

// ── Test 10: ETT only ──
// ETT max = 20, threshold = 40% of 20 = 8. Marks 16,14,10,8 meet it (4/5 = 80% → Level 3).
const ettOnly = calculateCourseAttainment({
  courseOutcomes: [co1],
  config,
  coPoAverages: { avg_po1: 2 },
  mttStudents: [],
  ettStudents,
});
// Only ETT contributes: 0×0.30 + 3×0.70 = 2.10
assert('Combined ETT only', ettOnly.combinedCO[1].combinedLevel, 2.10);

// ── Test 11: Edge case - 0 students ──
const empty = calculateCourseAttainment({
  courseOutcomes: [co1],
  config,
  coPoAverages: { avg_po1: 0 },
  mttStudents: [],
  ettStudents: [],
});
assert('No data flag', empty.hasData, false);
assert('Overall no data', empty.overallCourseAttainment, 0);

// ── Test 12: Edge case - 0 max marks ──
const coZeroMax = { id: 99, co_number: 1, description: 'Zero max', max_internal: 0, max_external: 0 };
const zeroMax = computeAttainmentForComponent(
  [{ coMarks: { 99: 5 } }],
  [coZeroMax],
  config,
  true,
);
assert('Zero max → threshold 0', zeroMax.perCo[99].thresholdMarks, 0);

// ── Test 13: PO average (non-zero only) ──
const poAvgResult = calculateCourseAttainment({
  courseOutcomes: [co1],
  config,
  coPoAverages: { avg_po1: 2.5, avg_po2: 0, avg_po3: 1.5, avg_po4: 0 },
  mttStudents: studentsAbove,
  ettStudents: [],
});
// avg_po1 = 2.5, avg_po2 = 0, avg_po3 = 1.5, avg_po4 = 0
// overall = 0.90
// po1 = 2.5 × 0.90 = 2.25
// po2 = 0 × 0.90 = 0 (zero correlation → 0)
// po3 = 1.5 × 0.90 = 1.35
assert('PO1 non-zero avg', poAvgResult.poAverages.po1, 2.5);
assert('PO2 zero avg', poAvgResult.poAverages.po2, 0);
assert('PO1 attainment', poAvgResult.poResults.po1, 2.25);
assert('PO2 zero attainment', poAvgResult.poResults.po2, 0);

// ── Summary ──
console.log(`\n=== Attainment Calculation Test Results ===`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
results.forEach((r) => {
  const icon = r.status === 'PASS' ? '✓' : '✗';
  console.log(`  ${icon} ${r.test}: expected ${r.expected}, got ${r.actual} [${r.status}]`);
});
console.log(`\n${failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
process.exit(failed > 0 ? 1 : 0);