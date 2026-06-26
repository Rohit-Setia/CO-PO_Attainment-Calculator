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
const writeSheetHeader = (ws, title, subtitle, course, columnsConfig) => {
  ws.columns = columnsConfig;
  
  ws.mergeCells('A1:P1');
  ws.mergeCells('A2:P2');
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

  styleRange(ws, 1, 1, 1, 16, { bold: true, size: 14, bgColor: 'DCE6F1' });
  styleRange(ws, 2, 1, 2, 16, { bold: true, size: 11, bgColor: 'DCE6F1' });
  styleRange(ws, 3, 1, 3, 16, { bold: true, bgColor: 'ECECEC' });
};

// Renders MTT or ETT marks list grid + dynamic formulas
const writeStudentMarksGrid = (ws, startRow, examTitle, maxTotal, coMaxValues, students, numCos, isInternal, config) => {
  const thresholdPercent = isInternal ? config.threshold_percent_internal : config.threshold_percent_external;
  const levelCriteria = isInternal
    ? { level1: config.level1_criteria_internal, level2: config.level2_criteria_internal, level3: config.level3_criteria_internal }
    : { level1: config.level1_criteria_external, level2: config.level2_criteria_external, level3: config.level3_criteria_external };

  let r = startRow;
  
  ws.getCell(`A${r}`).value = examTitle;
  ws.mergeCells(`A${r}:P${r}`);
  styleRange(ws, r, 1, r, 16, { bold: true, bgColor: 'F2F2F2', alignment: { horizontal: 'left' } });
  r++;

  ws.getCell(`A${r}`).value = 'Sr.No';
  ws.getCell(`B${r}`).value = 'Reg No';
  ws.getCell(`C${r}`).value = 'Name';
  ws.getCell(`D${r}`).value = 'Max Marks';
  for (let co = 1; co <= numCos; co++) {
    ws.getCell(r, 4 + co).value = `CO${co}`;
    ws.getCell(r, 10 + co).value = `CO${co}%`;
  }
  styleRange(ws, r, 1, r, 16, { bold: true, bgColor: 'DCE6F1' });
  r++;

  // Max marks values row
  ws.getCell(`D${r}`).value = maxTotal;
  for (let co = 1; co <= numCos; co++) {
    ws.getCell(r, 4 + co).value = coMaxValues[co];
    ws.getCell(r, 10 + co).value = 100;
  }
  styleRange(ws, r, 1, r, 16, { bold: true, bgColor: 'FFF2CC' });
  const maxRowIndex = r;
  r++;

  const marksStartRow = r;
  students.forEach((student, i) => {
    ws.getCell(`A${r}`).value = i + 1;
    ws.getCell(`B${r}`).value = student.reg_no;
    ws.getCell(`C${r}`).value = student.name;
    ws.getCell(`D${r}`).value = parseFloat(student.total_marks);
    
    for (let co = 1; co <= numCos; co++) {
      const mark = parseFloat(student[`co${co}`]) || 0;
      const coMax = coMaxValues[co];
      const maxColLetter = String.fromCharCode(64 + 4 + co);
      const marksColLetter = String.fromCharCode(64 + 4 + co);
      ws.getCell(r, 4 + co).value = mark;
      ws.getCell(r, 10 + co).value = {
        formula: `IF(${maxColLetter}${maxRowIndex}>0, ${marksColLetter}${r}/${maxColLetter}${maxRowIndex}*100, 0)`,
        result: coMax > 0 ? parseFloat((mark / coMax * 100).toFixed(2)) : 0
      };
    }
    styleRange(ws, r, 1, r, 16, { alignment: { horizontal: 'center' } });
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

  for (let co = 1; co <= numCos; co++) {
    const colLetter = String.fromCharCode(64 + 4 + co);
    const percentColLetter = String.fromCharCode(64 + 10 + co);
    
    ws.getCell(statsRow, 10 + co).value = {
      formula: `COUNTIF(${colLetter}${marksStartRow}:${colLetter}${marksEndRow}, ">="&${colLetter}${maxRowIndex}*(${thresholdPercent}/100))`,
      result: students.filter(s => parseFloat(s[`co${co}`]) >= (thresholdPercent / 100) * coMaxValues[co]).length
    };

    ws.getCell(statsRow + 1, 10 + co).value = {
      formula: `IF(COUNTA(${colLetter}${marksStartRow}:${colLetter}${marksEndRow})>0, ${percentColLetter}${statsRow}/COUNTA(${colLetter}${marksStartRow}:${colLetter}${marksEndRow})*100, 0)`,
      result: students.length > 0 ? parseFloat((students.filter(s => parseFloat(s[`co${co}`]) >= (thresholdPercent / 100) * coMaxValues[co]).length / students.length * 100).toFixed(2)) : 0
    };

    ws.getCell(statsRow + 2, 10 + co).value = {
      formula: `IF(${percentColLetter}${statsRow + 1}>=${levelCriteria.level3}, 3, IF(${percentColLetter}${statsRow + 1}>=${levelCriteria.level2}, 2, IF(${percentColLetter}${statsRow + 1}>=${levelCriteria.level1}, 1, 0)))`,
      result: (() => {
        if (students.length === 0) return 0;
        const p = (students.filter(s => parseFloat(s[`co${co}`]) >= (thresholdPercent / 100) * coMaxValues[co]).length / students.length * 100);
        if (p >= levelCriteria.level3) return 3;
        if (p >= levelCriteria.level2) return 2;
        if (p >= levelCriteria.level1) return 1;
        return 0;
      })()
    };
  }

  styleRange(ws, statsRow, 1, statsRow + 2, 16, { bold: true, bgColor: 'FFF8C6' });
  ws.getCell(`A${statsRow}`).alignment = { horizontal: 'left' };
  ws.getCell(`A${statsRow + 1}`).alignment = { horizontal: 'left' };
  ws.getCell(`A${statsRow + 2}`).alignment = { horizontal: 'left' };

  return statsRow; // Return stats row index for mapping references
};

// Sheet 1 builder entrypoint
const buildCourseAttainmentSheet = (ws1, course, config, mttStudents, ettStudents, numCos) => {
  writeSheetHeader(ws1, 'CO-PO ATTAINMENT CALCULATOR', `${course.school} - ${course.department}`.toUpperCase(), course, [
    { width: 8 }, { width: 15 }, { width: 25 }, { width: 12 },
    { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }
  ]);

  const coMaxInt = {};
  const coMaxExt = {};
  for (let co = 1; co <= numCos; co++) {
    coMaxInt[co] = config[`co${co}_max_internal`] ?? 10;
    coMaxExt[co] = config[`co${co}_max_external`] ?? 100;
  }

  // Draw MTT Grid
  const mttStatsRow = writeStudentMarksGrid(ws1, 9, 'INTERNAL ASSESSMENT (MTT) RECORDS', config.total_max_internal, coMaxInt, mttStudents, numCos, true, config);
  
  // Draw ETT Grid
  const ettGridStart = mttStatsRow + 5;
  const ettStatsRow = writeStudentMarksGrid(ws1, ettGridStart, 'EXTERNAL END-SEM (ETT) RECORDS', config.total_max_external, coMaxExt, ettStudents, numCos, false, config);

  // Combined att table
  let combinedStart = ettStatsRow + 5;
  ws1.getCell(`A${combinedStart}`).value = 'FINAL COMBINED CO DIRECT ATTAINMENT SUMMARY';
  ws1.mergeCells(`A${combinedStart}:P${combinedStart}`);
  styleRange(ws1, combinedStart, 1, combinedStart, 16, { bold: true, bgColor: 'F2F2F2', alignment: { horizontal: 'left' } });
  combinedStart++;

  ws1.mergeCells(`A${combinedStart}:C${combinedStart}`);
  ws1.getCell(`A${combinedStart}`).value = 'Outcome / Course Outcome';
  ws1.getCell(`D${combinedStart}`).value = 'Internal Level (MTT)';
  ws1.getCell(`E${combinedStart}`).value = 'External Level (ETT)';
  ws1.getCell(`F${combinedStart}`).value = `Combined Direct Level (${config.internal_weight}% Int + ${config.external_weight}% Ext)`;
  styleRange(ws1, combinedStart, 1, combinedStart, 16, { bold: true, bgColor: 'DCE6F1' });
  combinedStart++;

  const summaryStartRow = combinedStart;
  for (let co = 1; co <= numCos; co++) {
    ws1.mergeCells(`A${combinedStart}:C${combinedStart}`);
    ws1.getCell(`A${combinedStart}`).value = `CO${co}`;
    
    const intColLetter = String.fromCharCode(64 + 10 + co);
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
    styleRange(ws1, combinedStart, 1, combinedStart, 16, { alignment: { horizontal: 'center' } });
    ws1.getCell(`A${combinedStart}`).alignment = { horizontal: 'left' };
    combinedStart++;
  }
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
      return parseFloat((sum / numCos).toFixed(2));
    })()
  };
  styleRange(ws1, combinedStart, 1, combinedStart, 16, { bold: true, bgColor: 'D9E1F2' });
  ws1.getCell(`A${combinedStart}`).alignment = { horizontal: 'left' };

  return `F${combinedStart}`;
};

// Sheet 2 builder entrypoint
const buildCoPoAttainmentSheet = (ws2, course, config, mapping, mttStudents, ettStudents, numCos, overallDirectCellIdx) => {
  ws2.columns = [
    { width: 15 },
    ...Array.from({ length: 12 }, () => ({ width: 8 })),
    { width: 10 }, { width: 10 }, { width: 10 }
  ];

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

  const mappingStartRow = 6;
  for (let co = 1; co <= numCos; co++) {
    const rNum = mappingStartRow + co - 1;
    ws2.getCell(`A${rNum}`).value = `CO${co}`;
    for (let p = 1; p <= 12; p++) {
      const val = mapping ? mapping[`co${co}_po${p}`] : 0;
      ws2.getCell(rNum, 1 + p).value = val === 0 ? '' : val;
    }
    ws2.getCell(rNum, 14).value = mapping && mapping[`co${co}_pso1`] !== 0 ? mapping[`co${co}_pso1`] : '';
    ws2.getCell(rNum, 15).value = mapping && mapping[`co${co}_pso2`] !== 0 ? mapping[`co${co}_pso2`] : '';
    ws2.getCell(rNum, 16).value = mapping && mapping[`co${co}_pso3`] !== 0 ? mapping[`co${co}_pso3`] : '';
    
    styleRange(ws2, rNum, 1, rNum, 16, { alignment: { horizontal: 'center' } });
    ws2.getCell(`A${rNum}`).font = { bold: true };
    ws2.getCell(`A${rNum}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  }
  const mappingEndRow = mappingStartRow + numCos - 1;

  // averages row
  const mappingAvgRow = mappingEndRow + 1;
  ws2.getCell(`A${mappingAvgRow}`).value = 'Articulation Average';
  for (let col = 2; col <= 16; col++) {
    const colLetter = String.fromCharCode(64 + col);
    ws2.getCell(mappingAvgRow, col).value = {
      formula: `IF(COUNTIF(${colLetter}${mappingStartRow}:${colLetter}${mappingEndRow}, ">0")>0, ROUND(AVERAGEIF(${colLetter}${mappingStartRow}:${colLetter}${mappingEndRow}, ">0"), 2), 0.00)`,
      result: (() => {
        let sum = 0, count = 0;
        for (let co = 1; co <= numCos; co++) {
          const poKey = col <= 13 ? `co${co}_po${col - 1}` : `co${co}_pso${col - 13}`;
          const val = mapping ? mapping[poKey] : 0;
          if (val > 0) { sum += val; count++; }
        }
        return count > 0 ? parseFloat((sum / count).toFixed(2)) : 0;
      })()
    };
  }
  styleRange(ws2, mappingAvgRow, 1, mappingAvgRow, 16, { bold: true, bgColor: 'FFF2CC' });
  ws2.getCell(`A${mappingAvgRow}`).alignment = { horizontal: 'left' };

  // final po attainment row
  const mappingAttainmentRow = mappingAvgRow + 2;
  ws2.getCell(`A${mappingAttainmentRow}`).value = 'Final PO/PSO Attainment';
  for (let col = 2; col <= 16; col++) {
    const colLetter = String.fromCharCode(64 + col);
    ws2.getCell(mappingAttainmentRow, col).value = {
      formula: `ROUND(${colLetter}${mappingAvgRow} * 'Course Attainment'!${overallDirectCellIdx}, 2)`,
      result: (() => {
        const formulaRes = ws2.getCell(`${colLetter}${mappingAvgRow}`).value.result || 0;
        
        let overallSum = 0;
        for (let co = 1; co <= numCos; co++) {
          const lInt = (() => {
            if (mttStudents.length === 0) return 0;
            const p = (mttStudents.filter(s => parseFloat(s[`co${co}`]) >= (config.threshold_percent_internal / 100) * config[`co${co}_max_internal`]).length / mttStudents.length * 100);
            if (p >= config.level3_criteria_internal) return 3;
            if (p >= config.level2_criteria_internal) return 2;
            if (p >= config.level1_criteria_internal) return 1;
            return 0;
          })();
          const lExt = (() => {
            if (ettStudents.length === 0) return 0;
            const p = (ettStudents.filter(s => parseFloat(s[`co${co}`]) >= (config.threshold_percent_external / 100) * config[`co${co}_max_external`]).length / ettStudents.length * 100);
            if (p >= config.level3_criteria_external) return 3;
            if (p >= config.level2_criteria_external) return 2;
            if (p >= config.level1_criteria_external) return 1;
            return 0;
          })();
          overallSum += (lInt * (config.internal_weight / 100) + lExt * (config.external_weight / 100));
        }
        const overallAvg = parseFloat((overallSum / numCos).toFixed(2));
        return parseFloat((formulaRes * overallAvg).toFixed(2));
      })()
    };
  }
  styleRange(ws2, mappingAttainmentRow, 1, mappingAttainmentRow, 16, { bold: true, bgColor: 'C6E0B4' });
  ws2.getCell(`A${mappingAttainmentRow}`).alignment = { horizontal: 'left' };
};

module.exports = {
  buildCourseAttainmentSheet,
  buildCoPoAttainmentSheet
};
