// Computes attainment for one component (Internal/MTT or External/ETT) across every active
// Course Outcome. `courseOutcomes` is the actual configured list (never assumed to be 1..N —
// once COs can be archived, the active set can be sparse, e.g. CO1, CO3, CO7), and each
// student's marks are looked up by `co.id`, not a fixed `co{N}` property name.
function computeAttainmentForComponent(students, courseOutcomes, config, isInternal) {
  const thresholdPercent = isInternal ? config.threshold_percent_internal : config.threshold_percent_external;
  const levelCriteria = isInternal
    ? { level1: config.level1_criteria_internal, level2: config.level2_criteria_internal, level3: config.level3_criteria_internal }
    : { level1: config.level1_criteria_external, level2: config.level2_criteria_external, level3: config.level3_criteria_external };

  const totalStudents = students.length;
  const perCo = {};

  courseOutcomes.forEach((co) => {
    const maxMarks = parseFloat(isInternal ? co.max_internal : co.max_external) || 0;
    const thresholdMarks = (thresholdPercent / 100) * maxMarks;

    let aboveThreshold = 0;
    students.forEach((student) => {
      const rawMarks = parseFloat(student.coMarks?.[co.id]) || 0;
      if (rawMarks >= thresholdMarks) aboveThreshold += 1;
    });

    const percentAbove = totalStudents ? (aboveThreshold / totalStudents) * 100 : 0;
    let level = 0;
    if (percentAbove >= levelCriteria.level3) level = 3;
    else if (percentAbove >= levelCriteria.level2) level = 2;
    else if (percentAbove >= levelCriteria.level1) level = 1;

    perCo[co.id] = {
      co_id: co.id,
      co_number: co.co_number,
      description: co.description,
      totalStudents,
      studentsAboveThreshold: aboveThreshold,
      percentAbove: parseFloat(percentAbove.toFixed(2)),
      level,
      thresholdMarks: parseFloat(thresholdMarks.toFixed(2)),
      maxMarks,
    };
  });

  const numCos = courseOutcomes.length;
  const avgLevel = numCos
    ? Object.values(perCo).reduce((sum, c) => sum + c.level, 0) / numCos
    : 0;

  return { perCo, CO: parseFloat(avgLevel.toFixed(2)) };
}

// Main entrypoint. All shapes come from the normalized schema (course_outcomes, co_po_values) —
// nothing here assumes a fixed CO count, a fixed CO1..CO6 range, or sequential numbering.
//
// Formula (unchanged from the original implementation — see docs/calculation-methodology.md):
//   1. Per CO, per component: % of students meeting threshold -> level 0-3
//   2. Per CO combined: internalLevel*(internalWeight/100) + externalLevel*(externalWeight/100)
//   3. Overall course attainment: average of combined levels across all active COs
//   4. Per PO/PSO: (average non-zero CO->PO correlation across active COs) * overall course attainment
function calculateCourseAttainment({ courseOutcomes, config, coPoAverages, mttStudents, ettStudents }) {
  const numCos = courseOutcomes.length;

  const mttAttainment = mttStudents.length > 0
    ? computeAttainmentForComponent(mttStudents, courseOutcomes, config, true)
    : null;
  const ettAttainment = ettStudents.length > 0
    ? computeAttainmentForComponent(ettStudents, courseOutcomes, config, false)
    : null;

  const internalWeight = config ? parseFloat(config.internal_weight) : 30.0;
  const externalWeight = config ? parseFloat(config.external_weight) : 70.0;

  const combinedCO = {};
  let directAttainmentSum = 0;
  courseOutcomes.forEach((co) => {
    const internalLevel = mttAttainment ? mttAttainment.perCo[co.id].level : 0;
    const externalLevel = ettAttainment ? ettAttainment.perCo[co.id].level : 0;
    const combinedLevel = (internalLevel * (internalWeight / 100)) + (externalLevel * (externalWeight / 100));

    combinedCO[co.id] = {
      co_id: co.id,
      co_number: co.co_number,
      description: co.description,
      internalLevel,
      externalLevel,
      combinedLevel: parseFloat(combinedLevel.toFixed(2)),
    };
    directAttainmentSum += combinedLevel;
  });

  const overallCourseAttainment = numCos ? parseFloat((directAttainmentSum / numCos).toFixed(2)) : 0.00;

  const poResults = {};
  const poKeys = [
    ...Array.from({ length: 12 }, (_, i) => `po${i + 1}`),
    ...Array.from({ length: 3 }, (_, i) => `pso${i + 1}`),
  ];
  poKeys.forEach((po) => {
    const colAverage = coPoAverages ? (coPoAverages[`avg_${po}`] || 0) : 0;
    poResults[po] = parseFloat((colAverage * overallCourseAttainment).toFixed(2));
  });

  return {
    mttAttainment,
    ettAttainment,
    combinedCO,
    overallCourseAttainment,
    poResults,
    internalWeight,
    externalWeight,
    numCos,
    courseOutcomes: courseOutcomes.map((co) => ({ id: co.id, co_number: co.co_number, description: co.description })),
    hasData: mttStudents.length > 0 || ettStudents.length > 0,
  };
}

module.exports = {
  computeAttainmentForComponent,
  calculateCourseAttainment,
};
