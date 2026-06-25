const express = require("express");
const pool = require("../config/db");
const router = express.Router();

router.post("/calculate", async (req, res) => {
  // Debug logging: Incoming API request (Bug 9)
  if (process.env.NODE_ENV !== 'production') {
    console.log('Incoming API Request: POST /api/calculate');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
  }

  const {
    students: bodyStudents,
    coMaxMarks: bodyCoMaxMarks,
    thresholdPercent,
    levelCriteria,
    subject_id,
    classroom_id,
    assessment_id
  } = req.body;

  // Validation Check (Bug 9 & 8)
  let validationError = null;
  if (!assessment_id && (!bodyStudents || !Array.isArray(bodyStudents))) {
    validationError = "Validation Error: 'students' list or 'assessment_id' is required.";
  } else if (!assessment_id && (!bodyCoMaxMarks || typeof bodyCoMaxMarks !== 'object')) {
    validationError = "Validation Error: 'coMaxMarks' config is required.";
  } else if (thresholdPercent === undefined || isNaN(Number(thresholdPercent))) {
    validationError = "Validation Error: 'thresholdPercent' is required and must be numeric.";
  } else if (!levelCriteria || typeof levelCriteria !== 'object') {
    validationError = "Validation Error: 'levelCriteria' object is required.";
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('Validation Result:', validationError ? `Failed - ${validationError}` : 'Success');
  }

  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  let activeStudents = [];
  let activeCoMaxMarks = {};
  let activeSubjectId = subject_id;
  let activeClassroomId = classroom_id;

  if (assessment_id) {
    try {
      // 1. Fetch assessment
      const [assessments] = await pool.query('SELECT * FROM assessments WHERE id = ?', [assessment_id]);
      if (assessments.length === 0) {
        return res.status(404).json({ success: false, message: `Assessment not found for ID ${assessment_id}` });
      }
      const assessment = assessments[0];
      activeSubjectId = assessment.subject_id;
      activeClassroomId = assessment.classroom_id;

      // 2. Fetch classroom students
      const [dbStudents] = await pool.query(
        'SELECT id, reg_no, roll_no, name FROM students WHERE classroom_id = ? ORDER BY roll_no ASC, reg_no ASC',
        [activeClassroomId]
      );

      // 3. Fetch COs for this subject
      const [dbCOs] = await pool.query('SELECT * FROM cos WHERE subject_id = ? ORDER BY co_number ASC', [activeSubjectId]);

      // 4. Fetch questions (blueprint)
      const [dbQuestions] = await pool.query('SELECT * FROM question_papers WHERE assessment_id = ? ORDER BY question_no ASC', [assessment_id]);

      // 5. Fetch student marks
      const [dbMarks] = await pool.query('SELECT * FROM student_marks WHERE assessment_id = ?', [assessment_id]);

      // 6. Calculate coMaxMarks
      const isQuestionWise = assessment.entry_mode === 'question';
      dbCOs.forEach(co => {
        activeCoMaxMarks[co.co_number.toUpperCase()] = 0;
      });

      if (isQuestionWise) {
        dbQuestions.forEach(q => {
          const matchingCO = dbCOs.find(co => co.id === q.co_id);
          if (matchingCO) {
            activeCoMaxMarks[matchingCO.co_number.toUpperCase()] += Number(q.max_marks);
          }
        });
      } else {
        dbQuestions.forEach(q => {
          const matchingCO = dbCOs.find(co => co.id === q.co_id);
          if (matchingCO) {
            activeCoMaxMarks[matchingCO.co_number.toUpperCase()] = Number(q.max_marks);
          }
        });
        // Fallback: if no configs in question_papers, use assessment.max_marks for each CO
        dbCOs.forEach(co => {
          const key = co.co_number.toUpperCase();
          if (!activeCoMaxMarks[key] || activeCoMaxMarks[key] === 0) {
            activeCoMaxMarks[key] = Number(assessment.max_marks);
          }
        });
      }

      // 7. Structure activeStudents list
      activeStudents = dbStudents.map(student => {
        const sMarks = dbMarks.filter(m => m.student_id === student.id);
        const isAbsent = sMarks.some(m => m.is_absent === 1);

        const sRecord = {
          regNo: student.reg_no,
          name: student.name,
          totalMarks: 0,
          is_absent: isAbsent
        };

        dbCOs.forEach(co => {
          sRecord[co.co_number.toLowerCase()] = 0;
        });

        if (!isAbsent) {
          if (isQuestionWise) {
            dbQuestions.forEach(q => {
              const mark = sMarks.find(m => m.question_id === q.id);
              const val = mark ? parseFloat(mark.marks_obtained) : 0;
              sRecord.totalMarks += val;

              const matchingCO = dbCOs.find(co => co.id === q.co_id);
              if (matchingCO) {
                sRecord[matchingCO.co_number.toLowerCase()] += val;
              }
            });
          } else {
            dbCOs.forEach(co => {
              const mark = sMarks.find(m => m.co_id === co.id);
              const val = mark ? parseFloat(mark.marks_obtained) : 0;
              sRecord.totalMarks += val;
              sRecord[co.co_number.toLowerCase()] = val;
            });
          }
        }

        return sRecord;
      });

    } catch (dbErr) {
      console.error('Failed to load calculation resources from DB:', dbErr);
      return res.status(500).json({ success: false, message: 'Database error while reading assessment details', error: dbErr.message });
    }
  } else {
    // Fallback to body-passed parameters
    activeStudents = bodyStudents;
    Object.keys(bodyCoMaxMarks || {}).forEach(k => {
      activeCoMaxMarks[k.toUpperCase()] = Number(bodyCoMaxMarks[k]);
    });
  }

  const thresholdMarks = {};
  Object.keys(activeCoMaxMarks).forEach((co) => {
    const maxVal = Number(activeCoMaxMarks[co]) || 0;
    thresholdMarks[co] = (Number(thresholdPercent) / 100) * maxVal;
  });

  const coKeys = Object.keys(activeCoMaxMarks);
  const absentCount = activeStudents.filter(s => s.is_absent).length;
  const presentCount = activeStudents.length - absentCount;
  const denominator = presentCount;
  const result = {};

  coKeys.forEach((co) => {
    let aboveThreshold = 0;
    const maxVal = Number(activeCoMaxMarks[co]) || 0;

    activeStudents.forEach((student) => {
      if (student.is_absent) return;
      const rawMarks = student[co.toLowerCase()] !== undefined && student[co.toLowerCase()] !== null ? parseFloat(student[co.toLowerCase()]) : 0;
      const above = maxVal > 0 && rawMarks >= thresholdMarks[co];

      if (above) aboveThreshold++;
    });

    const percentAbove = denominator
      ? (aboveThreshold / denominator) * 100
      : 0;

    let level = 0;
    if (percentAbove >= Number(levelCriteria.level3)) level = 3;
    else if (percentAbove >= Number(levelCriteria.level2)) level = 2;
    else if (percentAbove >= Number(levelCriteria.level1)) level = 1;

    result[co] = {
      totalStudents: denominator,
      studentsAboveThreshold: aboveThreshold,
      percentAbove: parseFloat(percentAbove.toFixed(2)),
      level,
      thresholdMarks: thresholdMarks[co].toFixed(1),
      maxMarks: maxVal,
    };
  });

  // Course average level
  const levels = coKeys.map((co) => result[co].level);
  const avgLevel = levels.length > 0 ? (levels.reduce((a, b) => a + b, 0) / levels.length) : 0;

  // Calculate PO and PSO attainments (Bug 8 step 6)
  let poAttainments = [];
  let psoAttainments = [];

  if (activeSubjectId) {
    try {
      // Fetch POs, PSOs, COs, and mappings
      const [dbCOs] = await pool.query('SELECT * FROM cos WHERE subject_id = ?', [activeSubjectId]);
      const [dbPOs] = await pool.query('SELECT * FROM pos');
      const [dbPSOs] = await pool.query('SELECT * FROM psos');
      const [dbMappings] = await pool.query('SELECT * FROM co_po_mappings WHERE subject_id = ?', [activeSubjectId]);

      const coLevels = {}; // CO_ID -> level (0, 1, 2, 3)
      dbCOs.forEach(co => {
        const coKey = co.co_number.toUpperCase();
        coLevels[co.id] = result[coKey]?.level ?? 0;
      });

      poAttainments = dbPOs.map(po => {
        const links = dbMappings.filter(m => m.po_id === po.id);
        if (links.length === 0) return null;
        let weightedSum = 0;
        let weightTotal = 0;
        links.forEach(link => {
          const coLvl = coLevels[link.co_id] ?? 0;
          weightedSum += coLvl * link.mapping_value;
          weightTotal += link.mapping_value;
        });
        const avgLvl = weightTotal > 0 ? (weightedSum / weightTotal) : 0;
        return {
          po_number: po.po_number,
          level: parseFloat(avgLvl.toFixed(2)),
          target_level: po.target_level
        };
      }).filter(Boolean);

      psoAttainments = dbPSOs.map(pso => {
        const links = dbMappings.filter(m => m.pso_id === pso.id);
        if (links.length === 0) return null;
        let weightedSum = 0;
        let weightTotal = 0;
        links.forEach(link => {
          const coLvl = coLevels[link.co_id] ?? 0;
          weightedSum += coLvl * link.mapping_value;
          weightTotal += link.mapping_value;
        });
        const avgLvl = weightTotal > 0 ? (weightedSum / weightTotal) : 0;
        return {
          pso_number: pso.pso_number,
          level: parseFloat(avgLvl.toFixed(2))
        };
      }).filter(Boolean);

    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error calculating PO/PSO attainments:', err);
      }
    }
  }

  const responsePayload = {
    perCO: result,
    CO: parseFloat(avgLevel.toFixed(2)),
    totalStudents: denominator,
    poAttainment: poAttainments,
    psoAttainment: psoAttainments,
    summary: {
      presentStudents: denominator,
      absentStudents: absentCount,
    },
  };

  // Debug logging: Calculation Output (Bug 9)
  if (process.env.NODE_ENV !== 'production') {
    console.log('Calculation Output:', JSON.stringify(responsePayload, null, 2));
  }

  if (activeSubjectId && activeClassroomId && assessment_id) {
    try {
      const sqlQuery = `INSERT INTO attainment_records (subject_id, classroom_id, assessment_id, results_json) 
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE results_json = VALUES(results_json), calculation_date = CURRENT_TIMESTAMP`;
      const queryParams = [activeSubjectId, activeClassroomId, assessment_id, JSON.stringify(responsePayload)];

      if (process.env.NODE_ENV !== 'production') {
        console.log('Executing SQL Query (attainment_records):', sqlQuery);
        console.log('With params:', queryParams);
      }

      const [dbRes] = await pool.query(sqlQuery, queryParams);

      if (process.env.NODE_ENV !== 'production') {
        console.log('Database Response:', dbRes);
      }
    } catch (dbErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Errors:', dbErr);
      }
      return res.status(500).json({ success: false, message: 'Failed to save attainment record', error: dbErr.message, stack: dbErr.stack });
    }
  }

  res.json(responsePayload);
});

module.exports = router;
