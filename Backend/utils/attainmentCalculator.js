// Helper to compute single component CO attainment details (Internal or External)
function computeAttainmentForComponent(students, config, numCos, isInternal) {
  const thresholdPercent = isInternal ? config.threshold_percent_internal : config.threshold_percent_external;
  const levelCriteria = isInternal
    ? { level1: config.level1_criteria_internal, level2: config.level2_criteria_internal, level3: config.level3_criteria_internal }
    : { level1: config.level1_criteria_external, level2: config.level2_criteria_external, level3: config.level3_criteria_external };

  const totalStudents = students.length;
  const result = {};

  for (let co = 1; co <= numCos; co++) {
    const maxMarks = isInternal ? config[`co${co}_max_internal`] : config[`co${co}_max_external`];
    const thresholdMarks = (thresholdPercent / 100) * maxMarks;
    
    let aboveThreshold = 0;
    students.forEach((student) => {
      const rawMarks = parseFloat(student[`co${co}`]) || 0;
      if (rawMarks >= thresholdMarks) {
        aboveThreshold++;
      }
    });

    const percentAbove = totalStudents ? (aboveThreshold / totalStudents) * 100 : 0;
    let level = 0;
    if (percentAbove >= levelCriteria.level3) level = 3;
    else if (percentAbove >= levelCriteria.level2) level = 2;
    else if (percentAbove >= levelCriteria.level1) level = 1;

    result[`CO${co}`] = {
      totalStudents,
      studentsAboveThreshold: aboveThreshold,
      percentAbove: parseFloat(percentAbove.toFixed(2)),
      level,
      thresholdMarks: parseFloat(thresholdMarks.toFixed(2)),
      maxMarks,
    };
  }

  // Average level
  let sumLevels = 0;
  for (let co = 1; co <= numCos; co++) {
    sumLevels += result[`CO${co}`].level;
  }
  const avgLevel = numCos ? (sumLevels / numCos) : 0;

  return {
    perCO: result,
    CO: parseFloat(avgLevel.toFixed(2)),
  };
}

// Main logic to compute the overall direct and PO/PSO averages
function calculateCourseAttainment({ course, config, mapping, mttStudents, ettStudents }) {
  const numCos = course.num_cos || 5;

  const mttAttainment = mttStudents.length > 0
    ? computeAttainmentForComponent(mttStudents, config, numCos, true)
    : null;

  const ettAttainment = ettStudents.length > 0
    ? computeAttainmentForComponent(ettStudents, config, numCos, false)
    : null;

  // Combine using weightages
  const combinedCO = {};
  let directAttainmentSum = 0;
  const internalWeight = config ? parseFloat(config.internal_weight) : 30.0;
  const externalWeight = config ? parseFloat(config.external_weight) : 70.0;

  for (let co = 1; co <= numCos; co++) {
    const internalLevel = mttAttainment ? mttAttainment.perCO[`CO${co}`].level : 0;
    const externalLevel = ettAttainment ? ettAttainment.perCO[`CO${co}`].level : 0;

    const combinedLevel = (internalLevel * (internalWeight / 100)) + (externalLevel * (externalWeight / 100));
    combinedCO[`CO${co}`] = {
      internalLevel,
      externalLevel,
      combinedLevel: parseFloat(combinedLevel.toFixed(2)),
    };
    directAttainmentSum += combinedLevel;
  }

  const overallCourseAttainment = numCos ? parseFloat((directAttainmentSum / numCos).toFixed(2)) : 0.00;

  // PO & PSO Attainment Calculations
  const poResults = {};
  const pos = [];
  for (let p = 1; p <= 12; p++) pos.push(`po${p}`);
  for (let ps = 1; ps <= 3; ps++) pos.push(`pso${ps}`);

  pos.forEach(po => {
    const colAverage = mapping ? parseFloat(mapping[`avg_${po}`]) || 0 : 0;
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
  };
}

module.exports = {
  computeAttainmentForComponent,
  calculateCourseAttainment,
};
