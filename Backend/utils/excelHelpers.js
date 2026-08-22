const styleCell = (cell, { bold = false, size = 10, color = '000000', bgColor = null, alignment = {}, border = true }) => {
  cell.font = { bold, size, name: 'Calibri', color: { argb: 'FF' + color } };
  if (bgColor) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
  }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, ...alignment };
  if (border) {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFA6A6A6' } },
      left: { style: 'thin', color: { argb: 'FFA6A6A6' } },
      bottom: { style: 'thin', color: { argb: 'FFA6A6A6' } },
      right: { style: 'thin', color: { argb: 'FFA6A6A6' } }
    };
  }
};

const styleRange = (worksheet, startRow, startCol, endRow, endCol, options) => {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      styleCell(worksheet.getCell(r, c), options);
    }
  }
};

// Writes standard institutional header at top of sheet
const writeSheetHeader = (ws, title, subtitle, course, columnsConfig, lastCol) => {
  ws.columns = columnsConfig;

  ws.mergeCells(1, 1, 1, lastCol);
  ws.mergeCells(2, 1, 2, lastCol);
  ws.mergeCells('A3:C3');
  ws.mergeCells('D3:F3');
  ws.mergeCells('G3:H3');
  ws.mergeCells('J3:L3');

  ws.getCell('A1').value = title;
  ws.getCell('A2').value = subtitle;

  ws.getCell('A3').value = 'Subject Name:';
  ws.getCell('D3').value = course.subject_name;
  ws.getCell('G3').value = 'Course Code:';
  ws.getCell('I3').value = course.course_code;
  ws.getCell('J3').value = 'Sem / Year:';
  ws.getCell('M3').value = `Sem ${course.semester} (${course.academic_year})`;

  styleRange(ws, 1, 1, 1, lastCol, { bold: true, size: 14, bgColor: 'DCE6F1' });
  styleRange(ws, 2, 1, 2, lastCol, { bold: true, size: 11, bgColor: 'DCE6F1' });
  styleRange(ws, 3, 1, 3, lastCol, { bold: true, bgColor: 'ECECEC' });
};

// Renders MTT or ETT marks list grid + dynamic formulas.
// `courseOutcomes` — the actual configured/active COs for this course (any count, any co_number).
// `students` — each has `.coMarks: { [co_id]: marks }` (from the normalized marks tables).
const writeStudentMarksGrid = (ws, startRow, examTitle, maxTotal, students, courseOutcomes, isInternal, config, lastCol) => {
  const thresholdPercent = isInternal ? config.threshold_percent_internal : config.threshold_percent_external;
  const levelCriteria = isInternal
    ? { level1: config.level1_criteria_internal, level2: config.level2_criteria_internal, level3: config.level3_criteria_internal }
    : { level1: config.level1_criteria_external, level2: config.level2_criteria_external, level3: config.level3_criteria_external };
  const numCos = courseOutcomes.length;

  let r = startRow;

  ws.getCell(`A${r}`).value = examTitle;
  ws.mergeCells(r, 1, r, lastCol);
  styleRange(ws, r, 1, r, lastCol, { bold: true, bgColor: 'F2F2F2', alignment: { horizontal: 'left' } });
  r++;

  ws.getCell(`A${r}`).value = 'Sr.No';
  ws.getCell(`B${r}`).value = 'Reg No';
  ws.getCell(`C${r}`).value = 'Name';
  ws.getCell(`D${r}`).value = 'Max Marks';
  courseOutcomes.forEach((co, i) => {
    ws.getCell(r, 4 + i + 1).value = `CO${co.co_number}`;
    ws.getCell(r, 4 + numCos + i + 1).value = `CO${co.co_number}%`;
  });
  styleRange(ws, r, 1, r, lastCol, { bold: true, bgColor: 'DCE6F1' });
  r++;

  // Max marks values row
  ws.getCell(`D${r}`).value = maxTotal;
  courseOutcomes.forEach((co, i) => {
    ws.getCell(r, 4 + i + 1).value = parseFloat(isInternal ? co.max_internal : co.max_external);
    ws.getCell(r, 4 + numCos + i + 1).value = 100;
  });
  styleRange(ws, r, 1, r, lastCol, { bold: true, bgColor: 'FFF2CC' });
  const maxRowIndex = r;
  r++;

  const marksStartRow = r;
  students.forEach((student, i) => {
    ws.getCell(`A${r}`).value = i + 1;
    ws.getCell(`B${r}`).value = student.reg_no;
    ws.getCell(`C${r}`).value = student.name;
    ws.getCell(`D${r}`).value = parseFloat(student.total_marks ?? student.totalMarks ?? 0);

    courseOutcomes.forEach((co, ci) => {
      const mark = parseFloat(student.coMarks?.[co.id]) || 0;
      const coMax = parseFloat(isInternal ? co.max_internal : co.max_external);
      const maxCellCol = 4 + ci + 1;
      const percentCellCol = 4 + numCos + ci + 1;
      const maxColLetter = colLetter(maxCellCol);
      const marksColLetter = colLetter(maxCellCol);
      ws.getCell(r, maxCellCol).value = mark;
      ws.getCell(r, percentCellCol).value = {
        formula: `IF(${maxColLetter}${maxRowIndex}>0, ${marksColLetter}${r}/${maxColLetter}${maxRowIndex}*100, 0)`,
        result: coMax > 0 ? parseFloat((mark / coMax * 100).toFixed(2)) : 0
      };
    });
    styleRange(ws, r, 1, r, lastCol, { alignment: { horizontal: 'center' } });
    ws.getCell(`C${r}`).alignment = { horizontal: 'left' };
    r++;
  });
  const marksEndRow = r - 1;

  // Attainments formulas block
  const statsRow = r;
  ws.mergeCells(`A${statsRow}:C${statsRow}`);
  ws.getCell(`A${statsRow}`).value = 'No. of Students secure > Threshold';

  ws.mergeCells(`A${statsRow + 1}:C${statsRow + 1}`);
  ws.getCell(`A${statsRow + 1}`).value = '% of Students secure > Threshold';

  ws.mergeCells(`A${statsRow + 2}:C${statsRow + 2}`);
  ws.getCell(`A${statsRow + 2}`).value = 'Attainment Level';

  courseOutcomes.forEach((co, ci) => {
    const coMax = parseFloat(isInternal ? co.max_internal : co.max_external);
    const thresholdMarks = (thresholdPercent / 100) * coMax;
    const maxCellCol = 4 + ci + 1;
    const percentCellCol = 4 + numCos + ci + 1;
    const colLetterMax = colLetter(maxCellCol);
    const percentColLetter = colLetter(percentCellCol);

    const aboveCount = students.filter((s) => (parseFloat(s.coMarks?.[co.id]) || 0) >= thresholdMarks).length;
    const abovePercent = students.length > 0 ? (aboveCount / students.length * 100) : 0;
    let level = 0;
    if (abovePercent >= levelCriteria.level3) level = 3;
    else if (abovePercent >= levelCriteria.level2) level = 2;
    else if (abovePercent >= levelCriteria.level1) level = 1;

    ws.getCell(statsRow, percentCellCol).value = {
      formula: `COUNTIF(${colLetterMax}${marksStartRow}:${colLetterMax}${marksEndRow}, ">="&${colLetterMax}${maxRowIndex}*(${thresholdPercent}/100))`,
      result: aboveCount
    };
    ws.getCell(statsRow + 1, percentCellCol).value = {
      formula: `IF(COUNTA(${colLetterMax}${marksStartRow}:${colLetterMax}${marksEndRow})>0, ${percentColLetter}${statsRow}/COUNTA(${colLetterMax}${marksStartRow}:${colLetterMax}${marksEndRow})*100, 0)`,
      result: parseFloat(abovePercent.toFixed(2))
    };
    ws.getCell(statsRow + 2, percentCellCol).value = {
      formula: `IF(${percentColLetter}${statsRow + 1}>=${levelCriteria.level3}, 3, IF(${percentColLetter}${statsRow + 1}>=${levelCriteria.level2}, 2, IF(${percentColLetter}${statsRow + 1}>=${levelCriteria.level1}, 1, 0)))`,
      result: level
    };
  });

  styleRange(ws, statsRow, 1, statsRow + 2, lastCol, { bold: true, bgColor: 'FFF8C6' });
  ws.getCell(`A${statsRow}`).alignment = { horizontal: 'left' };
  ws.getCell(`A${statsRow + 1}`).alignment = { horizontal: 'left' };
  ws.getCell(`A${statsRow + 2}`).alignment = { horizontal: 'left' };

  return statsRow;
};

// Excel column letters beyond Z (AA, AB, ...) — a course with many COs can exceed 26 columns.
function colLetter(colIndex) {
  let n = colIndex;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// Sheet 1 builder entrypoint
const buildCourseAttainmentSheet = (ws1, course, config, courseOutcomes, mttStudents, ettStudents) => {
  const numCos = courseOutcomes.length;
  const lastCol = 4 + numCos * 2;

  const columns = [
    { width: 8 }, { width: 15 }, { width: 25 }, { width: 12 },
    ...Array.from({ length: numCos }, () => ({ width: 10 })),
    ...Array.from({ length: numCos }, () => ({ width: 12 })),
  ];
  writeSheetHeader(ws1, 'CO-PO ATTAINMENT CALCULATOR', `${course.school} - ${course.department}`.toUpperCase(), course, columns, lastCol);

  const mttStatsRow = writeStudentMarksGrid(ws1, 9, 'INTERNAL ASSESSMENT (MTT) RECORDS', config.total_max_internal, mttStudents, courseOutcomes, true, config, lastCol);

  const ettGridStart = mttStatsRow + 5;
  const ettStatsRow = writeStudentMarksGrid(ws1, ettGridStart, 'EXTERNAL END-SEM (ETT) RECORDS', config.total_max_external, ettStudents, courseOutcomes, false, config, lastCol);

  // Combined attainment table
  let combinedStart = ettStatsRow + 5;
  ws1.getCell(`A${combinedStart}`).value = 'FINAL COMBINED CO DIRECT ATTAINMENT SUMMARY';
  ws1.mergeCells(combinedStart, 1, combinedStart, lastCol);
  styleRange(ws1, combinedStart, 1, combinedStart, lastCol, { bold: true, bgColor: 'F2F2F2', alignment: { horizontal: 'left' } });
  combinedStart++;

  ws1.mergeCells(`A${combinedStart}:C${combinedStart}`);
  ws1.getCell(`A${combinedStart}`).value = 'Outcome / Course Outcome';
  ws1.getCell(`D${combinedStart}`).value = 'Internal Level (MTT)';
  ws1.getCell(`E${combinedStart}`).value = 'External Level (ETT)';
  ws1.getCell(`F${combinedStart}`).value = `Combined Direct Level (${config.internal_weight}% Int + ${config.external_weight}% Ext)`;
  styleRange(ws1, combinedStart, 1, combinedStart, lastCol, { bold: true, bgColor: 'DCE6F1' });
  combinedStart++;

  const summaryStartRow = combinedStart;
  courseOutcomes.forEach((co, ci) => {
    ws1.mergeCells(`A${combinedStart}:C${combinedStart}`);
    ws1.getCell(`A${combinedStart}`).value = `CO${co.co_number}`;

    const percentCol = 4 + numCos + ci + 1;
    const intColLetter = colLetter(percentCol);
    ws1.getCell(`D${combinedStart}`).value = {
      formula: `'Course Attainment'!${intColLetter}${mttStatsRow + 2}`,
      result: ws1.getCell(`${intColLetter}${mttStatsRow + 2}`).value?.result ?? 0
    };
    ws1.getCell(`E${combinedStart}`).value = {
      formula: `'Course Attainment'!${intColLetter}${ettStatsRow + 2}`,
      result: ws1.getCell(`${intColLetter}${ettStatsRow + 2}`).value?.result ?? 0
    };
    ws1.getCell(`F${combinedStart}`).value = {
      formula: `D${combinedStart}*(${config.internal_weight}/100) + E${combinedStart}*(${config.external_weight}/100)`,
      result: parseFloat(((ws1.getCell(`D${combinedStart}`).value.result || 0) * (config.internal_weight / 100) + (ws1.getCell(`E${combinedStart}`).value.result || 0) * (config.external_weight / 100)).toFixed(2))
    };
    styleRange(ws1, combinedStart, 1, combinedStart, lastCol, { alignment: { horizontal: 'center' } });
    ws1.getCell(`A${combinedStart}`).alignment = { horizontal: 'left' };
    combinedStart++;
  });
  const summaryEndRow = combinedStart - 1;

  ws1.mergeCells(`A${combinedStart}:E${combinedStart}`);
  ws1.getCell(`A${combinedStart}`).value = 'OVERALL DIRECT COURSE ATTAINMENT AVERAGE LEVEL';
  ws1.getCell(`F${combinedStart}`).value = {
    formula: `ROUND(AVERAGE(F${summaryStartRow}:F${summaryEndRow}), 2)`,
    result: (() => {
      let sum = 0;
      for (let rIdx = summaryStartRow; rIdx <= summaryEndRow; rIdx++) {
        sum += ws1.getCell(`F${rIdx}`).value.result || 0;
      }
      return numCos > 0 ? parseFloat((sum / numCos).toFixed(2)) : 0;
    })()
  };
  styleRange(ws1, combinedStart, 1, combinedStart, lastCol, { bold: true, bgColor: 'D9E1F2' });
  ws1.getCell(`A${combinedStart}`).alignment = { horizontal: 'left' };

  return `F${combinedStart}`;
};

// Sheet 2 builder entrypoint. `coPoValues` — one entry per active CO: { co_id, co_number, po1..po12, pso1..pso3 }.
const buildCoPoAttainmentSheet = (ws2, course, config, courseOutcomes, coPoValues, mttStudents, ettStudents, overallDirectCellIdx) => {
  const numCos = courseOutcomes.length;
  ws2.columns = [
    { width: 15 },
    ...Array.from({ length: 12 }, () => ({ width: 8 })),
    { width: 10 }, { width: 10 }, { width: 10 }
  ];
  const lastCol = 16;

  ws2.mergeCells('A1:P1');
  ws2.mergeCells('A2:P2');
  ws2.mergeCells('A3:P3');
  ws2.getCell('A1').value = 'CO-PO ARTICULATION MATRIX & ATTAINMENT PROFILE';
  ws2.getCell('A2').value = `Course Name: ${course.subject_name} (${course.course_code})`.toUpperCase();
  ws2.getCell('A3').value = 'Enter correlation values (1 = Low, 2 = Medium, 3 = High, or 0 / empty for no correlation)';

  styleRange(ws2, 1, 1, 3, 16, { bold: true, size: 10 });
  ws2.getCell('A1').font = { bold: true, size: 14, name: 'Calibri' };
  ws2.getCell('A3').font = { bold: false, size: 9, name: 'Calibri' };
  styleRange(ws2, 1, 1, 2, 16, { bold: true, bgColor: 'DCE6F1' });
  styleRange(ws2, 3, 1, 3, 16, { bgColor: 'ECECEC', bold: false });

  const mappingHeaderRow = 5;
  ws2.getCell(`A${mappingHeaderRow}`).value = 'CO / PO';
  for (let p = 1; p <= 12; p++) ws2.getCell(mappingHeaderRow, 1 + p).value = `PO${p}`;
  ws2.getCell(mappingHeaderRow, 14).value = 'PSO1';
  ws2.getCell(mappingHeaderRow, 15).value = 'PSO2';
  ws2.getCell(mappingHeaderRow, 16).value = 'PSO3';
  styleRange(ws2, mappingHeaderRow, 1, mappingHeaderRow, 16, { bold: true, bgColor: 'DCE6F1' });

  const valuesByCoId = new Map(coPoValues.map((v) => [v.co_id, v]));
  const mappingStartRow = 6;
  courseOutcomes.forEach((co, i) => {
    const rNum = mappingStartRow + i;
    const rowValues = valuesByCoId.get(co.id) || {};
    ws2.getCell(`A${rNum}`).value = `CO${co.co_number}`;
    for (let p = 1; p <= 12; p++) {
      const val = rowValues[`po${p}`] || 0;
      ws2.getCell(rNum, 1 + p).value = val === 0 ? '' : val;
    }
    ws2.getCell(rNum, 14).value = rowValues.pso1 ? rowValues.pso1 : '';
    ws2.getCell(rNum, 15).value = rowValues.pso2 ? rowValues.pso2 : '';
    ws2.getCell(rNum, 16).value = rowValues.pso3 ? rowValues.pso3 : '';

    styleRange(ws2, rNum, 1, rNum, 16, { alignment: { horizontal: 'center' } });
    ws2.getCell(`A${rNum}`).font = { bold: true };
    ws2.getCell(`A${rNum}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  });
  const mappingEndRow = mappingStartRow + numCos - 1;

  // averages row
  const mappingAvgRow = mappingEndRow + 1;
  ws2.getCell(`A${mappingAvgRow}`).value = 'Articulation Average';
  const poPsoKeys = [...Array.from({ length: 12 }, (_, i) => `po${i + 1}`), 'pso1', 'pso2', 'pso3'];
  for (let col = 2; col <= 16; col++) {
    const colKey = poPsoKeys[col - 2];
    const colLetterStr = colLetter(col);
    const nonZero = coPoValues.map((v) => v[colKey] || 0).filter((v) => v > 0);
    const avg = nonZero.length > 0 ? parseFloat((nonZero.reduce((a, b) => a + b, 0) / nonZero.length).toFixed(2)) : 0;
    ws2.getCell(mappingAvgRow, col).value = {
      formula: `IF(COUNTIF(${colLetterStr}${mappingStartRow}:${colLetterStr}${mappingEndRow}, ">0")>0, ROUND(AVERAGEIF(${colLetterStr}${mappingStartRow}:${colLetterStr}${mappingEndRow}, ">0"), 2), 0.00)`,
      result: avg,
    };
  }
  styleRange(ws2, mappingAvgRow, 1, mappingAvgRow, 16, { bold: true, bgColor: 'FFF2CC' });
  ws2.getCell(`A${mappingAvgRow}`).alignment = { horizontal: 'left' };

  // final PO/PSO attainment row — mirrors the app's actual formula: avg correlation * overall course attainment
  const thresholdI = config.threshold_percent_internal, thresholdE = config.threshold_percent_external;
  const levelOf = (percent, lc) => (percent >= lc.level3 ? 3 : percent >= lc.level2 ? 2 : percent >= lc.level1 ? 1 : 0);
  const lcInt = { level1: config.level1_criteria_internal, level2: config.level2_criteria_internal, level3: config.level3_criteria_internal };
  const lcExt = { level1: config.level1_criteria_external, level2: config.level2_criteria_external, level3: config.level3_criteria_external };

  let overallSum = 0;
  courseOutcomes.forEach((co) => {
    const lInt = mttStudents.length === 0 ? 0 : levelOf(
      (mttStudents.filter((s) => (parseFloat(s.coMarks?.[co.id]) || 0) >= (thresholdI / 100) * co.max_internal).length / mttStudents.length) * 100,
      lcInt,
    );
    const lExt = ettStudents.length === 0 ? 0 : levelOf(
      (ettStudents.filter((s) => (parseFloat(s.coMarks?.[co.id]) || 0) >= (thresholdE / 100) * co.max_external).length / ettStudents.length) * 100,
      lcExt,
    );
    overallSum += (lInt * (config.internal_weight / 100) + lExt * (config.external_weight / 100));
  });
  const overallAvg = numCos > 0 ? parseFloat((overallSum / numCos).toFixed(2)) : 0;

  const mappingAttainmentRow = mappingAvgRow + 2;
  ws2.getCell(`A${mappingAttainmentRow}`).value = 'Final PO/PSO Attainment';
  for (let col = 2; col <= 16; col++) {
    const colLetterStr = colLetter(col);
    const avgResult = ws2.getCell(mappingAvgRow, col).value.result || 0;
    ws2.getCell(mappingAttainmentRow, col).value = {
      formula: `ROUND(${colLetterStr}${mappingAvgRow} * 'Course Attainment'!${overallDirectCellIdx}, 2)`,
      result: parseFloat((avgResult * overallAvg).toFixed(2)),
    };
  }
  styleRange(ws2, mappingAttainmentRow, 1, mappingAttainmentRow, 16, { bold: true, bgColor: 'C6E0B4' });
  ws2.getCell(`A${mappingAttainmentRow}`).alignment = { horizontal: 'left' };
};

module.exports = {
  buildCourseAttainmentSheet,
  buildCoPoAttainmentSheet
};
