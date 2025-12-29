const express = require("express");
const router = express.Router();

router.post("/calculate", (req, res) => {
  const {
    students,
    coMaxMarks,
    thresholdPercent,
    levelCriteria,
  } = req.body;
  // console.log('Received students[0]:', students[0]); // ADD THIS
  // console.log('coMaxMarks:', coMaxMarks); // ADD THIS

  const thresholdMarks = {};
  Object.keys(coMaxMarks).forEach((co) => {
    thresholdMarks[co] = (thresholdPercent / 100) * coMaxMarks[co];
  });

  const coKeys = Object.keys(coMaxMarks);
  const totalStudents = students.length;
  const result = {};

  coKeys.forEach((co) => {
    let aboveThreshold = 0;

    students.forEach((student) => {
      const rawMarks = student[co.toLowerCase()] || 0;
      const coPercent = (rawMarks / coMaxMarks[co]) * 100;
      const above = rawMarks >= thresholdMarks[co];

      if (above) aboveThreshold++;
    });

    const percentAbove = totalStudents
      ? (aboveThreshold / totalStudents) * 100
      : 0;

    let level = 0;
    if (percentAbove >= levelCriteria.level3) level = 3;
    else if (percentAbove >= levelCriteria.level2) level = 2;
    else if (percentAbove >= levelCriteria.level1) level = 1;

    result[co] = {
      totalStudents,
      studentsAboveThreshold: aboveThreshold,
      percentAbove: parseFloat(percentAbove.toFixed(2)),
      level,
      thresholdMarks: thresholdMarks[co].toFixed(1),
      maxMarks: coMaxMarks[co],
    };
  });

  // Course average level
  const levels = coKeys.map((co) => result[co].level);
  const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;

  res.json({
    perCO: result,
    CO: parseFloat(avgLevel.toFixed(2)),
    totalStudents,
    summary: {
      presentStudents: totalStudents,
      absentStudents: 0,
    },
  });
});

module.exports = router;
