const express = require('express');
const ExcelJS = require('exceljs');
const router = express.Router();

// Helper to style a single cell
const styleCell = (cell, { bold = false, size = 10, color = '000000', bgColor = null, alignment = {}, border = true }) => {
  cell.font = { bold, size, name: 'Calibri', color: { argb: 'FF' + color } };
  if (bgColor) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF' + bgColor }
    };
  }
  cell.alignment = {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: true,
    ...alignment
  };
  if (border) {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFA6A6A6' } },
      left: { style: 'thin', color: { argb: 'FFA6A6A6' } },
      bottom: { style: 'thin', color: { argb: 'FFA6A6A6' } },
      right: { style: 'thin', color: { argb: 'FFA6A6A6' } }
    };
  }
};

// Helper to style a range of cells
const styleRange = (worksheet, startRow, startCol, endRow, endCol, options) => {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      styleCell(worksheet.getCell(r, c), options);
    }
  }
};

// POST /api/export-excel
router.post('/export-excel', async (req, res) => {
  const { students, coMaxMarks, results, levelCriteria, thresholdPercent, courseInfo = {} } = req.body;
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('CO Attainment');
  
  // Set columns width
  worksheet.columns = [
    { width: 8 },   // A: Sr.No
    { width: 15 },  // B: Reg No
    { width: 25 },  // C: Name
    { width: 12 },  // D: Max Marks / Total
    { width: 10 },  // E: CO1
    { width: 10 },  // F: CO2
    { width: 10 },  // G: CO3
    { width: 10 },  // H: CO4
    { width: 10 },  // I: CO5
    { width: 12 },  // J: CO1%
    { width: 12 },  // K: CO2%
    { width: 12 },  // L: CO3%
    { width: 12 },  // M: CO4%
    { width: 12 }   // N: CO5%
  ];

  // Set row heights
  for (let r = 1; r <= 9; r++) {
    worksheet.getRow(r).height = r === 1 ? 30 : r === 2 ? 25 : r === 3 ? 25 : 20;
  }

  // Merging header cells
  worksheet.mergeCells('A1:N1');
  worksheet.mergeCells('A2:N2');
  worksheet.mergeCells('A3:C3');
  worksheet.mergeCells('D3:F3');
  worksheet.mergeCells('G3:H3');
  worksheet.mergeCells('M3:N3');
  worksheet.mergeCells('A4:C6');
  worksheet.mergeCells('F4:H4');
  worksheet.mergeCells('F5:H5');
  worksheet.mergeCells('F6:H6');
  worksheet.mergeCells('I4:J6');
  worksheet.mergeCells('K4:K6');
  worksheet.mergeCells('L4:N4');
  worksheet.mergeCells('L5:L6');
  worksheet.mergeCells('M5:N6');
  worksheet.mergeCells('A7:I7');
  worksheet.mergeCells('A8:C8');
  worksheet.mergeCells('J7:J8');
  worksheet.mergeCells('K7:K8');
  worksheet.mergeCells('L7:L8');
  worksheet.mergeCells('M7:M8');
  worksheet.mergeCells('N7:N8');

  // Fill header values
  worksheet.getCell('A1').value = 'CT UNIVERSITY';
  worksheet.getCell('A2').value = (courseInfo.school ? courseInfo.school : 'SCHOOL / DEPARTMENT NAME').toUpperCase();
  
  worksheet.getCell('A3').value = 'Program Name';
  worksheet.getCell('D3').value = courseInfo.program || 'MBA';
  worksheet.getCell('G3').value = 'Sem';
  worksheet.getCell('I3').value = courseInfo.sem || 'II';
  worksheet.getCell('J3').value = 'Course Code';
  worksheet.getCell('K3').value = courseInfo.code || '23BAXCTC';
  worksheet.getCell('L3').value = 'Course Name';
  worksheet.getCell('M3').value = courseInfo.name || '';

  worksheet.getCell('A4').value = 'ATTAINMENT CRITERIA';
  worksheet.getCell('D4').value = levelCriteria.level3 || 70;
  worksheet.getCell('E4').value = '3 (Level)';
  worksheet.getCell('F4').value = 'Very Good';
  
  worksheet.getCell('D5').value = levelCriteria.level2 || 60;
  worksheet.getCell('E5').value = '2 (Level)';
  worksheet.getCell('F5').value = 'Good';

  worksheet.getCell('D6').value = levelCriteria.level1 || 50;
  worksheet.getCell('E6').value = '1 (Level)';
  worksheet.getCell('F6').value = 'Poor';

  worksheet.getCell('I4').value = 'Threshold Level/Bench Mark';
  const cellK4 = worksheet.getCell('K4');
  cellK4.value = (thresholdPercent || 40) / 100;
  cellK4.numFormat = '0%';

  worksheet.getCell('L4').value = 'Target To achieved';
  worksheet.getCell('L5').value = '60%';
  worksheet.getCell('M5').value = '2';

  worksheet.getCell('A7').value = 'Attainment for End Term Examination';
  worksheet.getCell('J7').value = 'CO1%';
  worksheet.getCell('K7').value = 'CO2%';
  worksheet.getCell('L7').value = 'CO3%';
  worksheet.getCell('M7').value = 'CO4%';
  worksheet.getCell('N7').value = 'CO5%';

  worksheet.getCell('A8').value = 'STUDENT PERFORMANCE RECORDS';
  worksheet.getCell('D8').value = 'Max Marks';
  worksheet.getCell('E8').value = 'CO1';
  worksheet.getCell('F8').value = 'CO2';
  worksheet.getCell('G8').value = 'CO3';
  worksheet.getCell('H8').value = 'CO4';
  worksheet.getCell('I8').value = 'CO5';

  worksheet.getCell('A9').value = 'Sr.No';
  worksheet.getCell('B9').value = 'Reg No';
  worksheet.getCell('C9').value = 'Name';
  worksheet.getCell('D9').value = Number(students[0]?.totalMax || students[0]?.totalMarks || 60);
  worksheet.getCell('E9').value = Number(coMaxMarks.CO1 || 0);
  worksheet.getCell('F9').value = Number(coMaxMarks.CO2 || 0);
  worksheet.getCell('G9').value = Number(coMaxMarks.CO3 || 0);
  worksheet.getCell('H9').value = Number(coMaxMarks.CO4 || 0);
  worksheet.getCell('I9').value = Number(coMaxMarks.CO5 || 0);
  worksheet.getCell('J9').value = 100;
  worksheet.getCell('K9').value = 100;
  worksheet.getCell('L9').value = 100;
  worksheet.getCell('M9').value = 100;
  worksheet.getCell('N9').value = 100;

  // Apply header styles using range helper
  styleRange(worksheet, 1, 1, 1, 14, { bold: true, size: 14, bgColor: 'DCE6F1' });
  styleRange(worksheet, 2, 1, 2, 14, { bold: true, size: 12, bgColor: 'DCE6F1' });

  styleRange(worksheet, 3, 1, 3, 3, { bold: true, bgColor: 'ECECEC', alignment: { horizontal: 'left' } });
  styleRange(worksheet, 3, 4, 3, 6, { bold: true });
  styleRange(worksheet, 3, 7, 3, 8, { bold: true, bgColor: 'ECECEC' });
  styleRange(worksheet, 3, 9, 3, 9, { bold: true });
  styleRange(worksheet, 3, 10, 3, 10, { bold: true, bgColor: 'ECECEC' });
  styleRange(worksheet, 3, 11, 3, 11, { bold: true });
  styleRange(worksheet, 3, 12, 3, 12, { bold: true, bgColor: 'ECECEC' });
  styleRange(worksheet, 3, 13, 3, 14, { bold: true });

  // Style criteria block
  styleRange(worksheet, 4, 1, 6, 14, { bold: true, bgColor: 'ECECEC' });
  
  // Custom colors for level percentages (Column D)
  styleRange(worksheet, 4, 4, 4, 4, { bold: true, bgColor: 'C65911', color: 'FFFFFF' });
  styleRange(worksheet, 5, 4, 5, 4, { bold: true, bgColor: 'F4B084', color: '000000' });
  styleRange(worksheet, 6, 4, 6, 4, { bold: true, bgColor: 'F8CBAD', color: '000000' });

  // Row 7 & 8 styles
  styleRange(worksheet, 7, 1, 7, 9, { bold: true, bgColor: 'ECECEC' });
  styleRange(worksheet, 7, 10, 8, 14, { bold: true, bgColor: 'ECECEC' });

  styleRange(worksheet, 8, 1, 8, 3, { bold: true, bgColor: 'FFFF00' });
  styleRange(worksheet, 8, 4, 8, 9, { bold: true, bgColor: 'ECECEC' });

  styleRange(worksheet, 9, 1, 9, 14, { bold: true, bgColor: 'ECECEC' });

  // Add students data rows
  students.forEach((student, i) => {
    const rowNum = 10 + i;
    worksheet.getRow(rowNum).height = 20;

    const co1Percent = coMaxMarks.CO1 ? (student.CO1 || 0) / coMaxMarks.CO1 * 100 : 0;
    const co2Percent = coMaxMarks.CO2 ? (student.CO2 || 0) / coMaxMarks.CO2 * 100 : 0;
    const co3Percent = coMaxMarks.CO3 ? (student.CO3 || 0) / coMaxMarks.CO3 * 100 : 0;
    const co4Percent = coMaxMarks.CO4 ? (student.CO4 || 0) / coMaxMarks.CO4 * 100 : 0;
    const co5Percent = coMaxMarks.CO5 ? (student.CO5 || 0) / coMaxMarks.CO5 * 100 : 0;

    const rowData = [
      i + 1,
      student.regNo || '',
      student.name || '',
      Number(student.totalMarks || 0),
      Number(student.CO1 || 0),
      Number(student.CO2 || 0),
      Number(student.CO3 || 0),
      Number(student.CO4 || 0),
      Number(student.CO5 || 0),
      { formula: `IF(E$9>0, E${rowNum}/E$9*100, 0)`, result: parseFloat(co1Percent.toFixed(2)) },
      { formula: `IF(F$9>0, F${rowNum}/F$9*100, 0)`, result: parseFloat(co2Percent.toFixed(2)) },
      { formula: `IF(G$9>0, G${rowNum}/G$9*100, 0)`, result: parseFloat(co3Percent.toFixed(2)) },
      { formula: `IF(H$9>0, H${rowNum}/H$9*100, 0)`, result: parseFloat(co4Percent.toFixed(2)) },
      { formula: `IF(I$9>0, I${rowNum}/I$9*100, 0)`, result: parseFloat(co5Percent.toFixed(2)) }
    ];

    rowData.forEach((val, colIdx) => {
      const cell = worksheet.getCell(rowNum, colIdx + 1);
      cell.value = val;
      styleCell(cell, {
        alignment: {
          horizontal: colIdx === 2 ? 'left' : 'center'
        }
      });
    });
  });

  // Calculate bottom layout start row
  const startBottomRow = 10 + students.length;
  const endRow = 9 + students.length;

  // Set bottom row heights
  for (let r = startBottomRow; r < startBottomRow + 6; r++) {
    worksheet.getRow(r).height = 22;
  }

  const isMTT = courseInfo.examType === 'MTT';

  // Row 21 (startBottomRow)
  worksheet.mergeCells(`A${startBottomRow}:C${startBottomRow}`);
  worksheet.getCell(`A${startBottomRow}`).value = 'Attainment through internal assessment: (CIA)';
  worksheet.getCell(`D${startBottomRow}`).value = isMTT 
    ? { formula: `J${startBottomRow + 5}`, result: results.CO }
    : 'NA';
  
  worksheet.mergeCells(`H${startBottomRow}:I${startBottomRow}`);
  worksheet.getCell(`H${startBottomRow}`).value = 'ABSENTEE + NOT ATTEMPT';
  for (let c = 10; c <= 14; c++) {
    const srcColLetter = String.fromCharCode(69 + c - 10); // E, F, G, H, I
    worksheet.getCell(startBottomRow, c).value = {
      formula: `COUNTIF(${srcColLetter}$10:${srcColLetter}$${endRow}, "")`,
      result: 0
    };
  }

  // Row 22 (startBottomRow + 1)
  worksheet.mergeCells(`A${startBottomRow + 1}:C${startBottomRow + 1}`);
  worksheet.getCell(`A${startBottomRow + 1}`).value = 'Attainment through university examination:';
  worksheet.getCell(`D${startBottomRow + 1}`).value = isMTT
    ? 'NA'
    : { formula: `J${startBottomRow + 5}`, result: results.CO };
  
  worksheet.mergeCells(`H${startBottomRow + 1}:I${startBottomRow + 1}`);
  worksheet.getCell(`H${startBottomRow + 1}`).value = 'PRESENT STUDENT FOR ATTEMPT';
  for (let c = 10; c <= 14; c++) {
    const srcColLetter = String.fromCharCode(69 + c - 10); // E, F, G, H, I
    worksheet.getCell(startBottomRow + 1, c).value = {
      formula: `COUNTA(${srcColLetter}$10:${srcColLetter}$${endRow})`,
      result: students.length
    };
  }

  // Row 23 (startBottomRow + 2)
  worksheet.mergeCells(`A${startBottomRow + 2}:C${startBottomRow + 2}`);
  worksheet.getCell(`A${startBottomRow + 2}`).value = 'Weightage given to the Internal examination (40%):';
  worksheet.getCell(`D${startBottomRow + 2}`).value = 'NA';
  
  worksheet.mergeCells(`H${startBottomRow + 2}:I${startBottomRow + 2}`);
  worksheet.getCell(`H${startBottomRow + 2}`).value = 'No of Student secure > Threshold';
  const getCOVal = (idx) => {
    if (idx === 10) return results.perCO.CO1.studentsAboveThreshold;
    if (idx === 11) return results.perCO.CO2.studentsAboveThreshold;
    if (idx === 12) return results.perCO.CO3.studentsAboveThreshold;
    if (idx === 13) return results.perCO.CO4.studentsAboveThreshold;
    return results.perCO.CO5.studentsAboveThreshold;
  };
  for (let c = 10; c <= 14; c++) {
    const srcColLetter = String.fromCharCode(69 + c - 10); // E, F, G, H, I
    worksheet.getCell(startBottomRow + 2, c).value = {
      formula: `COUNTIF(${srcColLetter}$10:${srcColLetter}$${endRow}, ">="&${srcColLetter}$9*$K$4)`,
      result: getCOVal(c)
    };
  }

  // Row 24 (startBottomRow + 3)
  worksheet.mergeCells(`A${startBottomRow + 3}:C${startBottomRow + 3}`);
  worksheet.getCell(`A${startBottomRow + 3}`).value = 'Weightage given to the university examination (60%):';
  worksheet.getCell(`D${startBottomRow + 3}`).value = 'NA';
  
  worksheet.mergeCells(`H${startBottomRow + 3}:I${startBottomRow + 3}`);
  worksheet.getCell(`H${startBottomRow + 3}`).value = '% of Student secure > Threshold';
  const getCOPercent = (idx) => {
    if (idx === 10) return results.perCO.CO1.percentAbove / 100;
    if (idx === 11) return results.perCO.CO2.percentAbove / 100;
    if (idx === 12) return results.perCO.CO3.percentAbove / 100;
    if (idx === 13) return results.perCO.CO4.percentAbove / 100;
    return results.perCO.CO5.percentAbove / 100;
  };
  for (let c = 10; c <= 14; c++) {
    const colLetter = String.fromCharCode(65 + c - 1);
    const cell = worksheet.getCell(startBottomRow + 3, c);
    cell.value = {
      formula: `IF(${colLetter}$${startBottomRow + 1}>0, ${colLetter}$${startBottomRow + 2}/${colLetter}$${startBottomRow + 1}, 0)`,
      result: getCOPercent(c)
    };
    cell.numFormat = '0%';
  }

  // Row 25 (startBottomRow + 4)
  worksheet.mergeCells(`A${startBottomRow + 4}:C${startBottomRow + 4}`);
  worksheet.getCell(`A${startBottomRow + 4}`).value = 'Final attainment level of the course (by Direct Assessment):';
  worksheet.getCell(`D${startBottomRow + 4}`).value = 'NA';
  
  worksheet.mergeCells(`H${startBottomRow + 4}:I${startBottomRow + 4}`);
  worksheet.getCell(`H${startBottomRow + 4}`).value = `Attainment (3 ≥ ${levelCriteria.level3 || 70}%, 2 ≥ ${levelCriteria.level2 || 60}%, 1 ≥ ${levelCriteria.level1 || 50}%)`;
  const getCOLevelVal = (idx) => {
    if (idx === 10) return results.perCO.CO1.level;
    if (idx === 11) return results.perCO.CO2.level;
    if (idx === 12) return results.perCO.CO3.level;
    if (idx === 13) return results.perCO.CO4.level;
    return results.perCO.CO5.level;
  };
  for (let c = 10; c <= 14; c++) {
    const colLetter = String.fromCharCode(65 + c - 1);
    worksheet.getCell(startBottomRow + 4, c).value = {
      formula: `IF(${colLetter}$${startBottomRow + 3}>=$D$4/100, 3, IF(${colLetter}$${startBottomRow + 3}>=$D$5/100, 2, IF(${colLetter}$${startBottomRow + 3}>=$D$6/100, 1, 0)))`,
      result: getCOLevelVal(c)
    };
  }

  // Row 26 (startBottomRow + 5)
  worksheet.mergeCells(`G${startBottomRow + 5}:I${startBottomRow + 5}`);
  worksheet.getCell(`G${startBottomRow + 5}`).value = 'Final Attainment Level in CIA';
  
  worksheet.mergeCells(`J${startBottomRow + 5}:N${startBottomRow + 5}`);
  worksheet.getCell(`J${startBottomRow + 5}`).value = {
    formula: `ROUND(AVERAGE(J${startBottomRow + 4}:N${startBottomRow + 4}), 2)`,
    result: results.CO || 0
  };

  // Merge ATTAINMENT TABLE vertical label
  worksheet.mergeCells(`E${startBottomRow}:G${startBottomRow + 4}`);
  worksheet.getCell(`E${startBottomRow}`).value = 'ATTAINMENT TABLE';

  // Apply bottom block styling using helper
  styleRange(worksheet, startBottomRow, 1, startBottomRow + 1, 3, { bold: true, bgColor: 'DCE6F1', alignment: { horizontal: 'left' } });
  styleRange(worksheet, startBottomRow, 4, startBottomRow + 1, 4, { bold: true, bgColor: 'DCE6F1' });
  
  styleRange(worksheet, startBottomRow + 2, 1, startBottomRow + 3, 3, { bold: true, bgColor: 'F8CBAD', alignment: { horizontal: 'left' } });
  styleRange(worksheet, startBottomRow + 2, 4, startBottomRow + 3, 4, { bold: true, bgColor: 'F8CBAD' });

  styleRange(worksheet, startBottomRow + 4, 1, startBottomRow + 4, 3, { bold: true, bgColor: 'DCE6F1', alignment: { horizontal: 'left' } });
  styleRange(worksheet, startBottomRow + 4, 4, startBottomRow + 4, 4, { bold: true, bgColor: 'DCE6F1' });

  styleRange(worksheet, startBottomRow, 5, startBottomRow + 4, 7, { 
    bold: true, 
    bgColor: 'FFFF00', 
    alignment: { horizontal: 'center', vertical: 'middle', textRotation: 90 } 
  });

  styleRange(worksheet, startBottomRow, 8, startBottomRow + 4, 9, { bold: true, bgColor: 'FFF8C6', alignment: { horizontal: 'left' } });
  styleRange(worksheet, startBottomRow, 10, startBottomRow + 4, 14, { bgColor: 'FFF8C6' });

  styleRange(worksheet, startBottomRow + 5, 7, startBottomRow + 5, 9, { bold: true, bgColor: 'FFF8C6', alignment: { horizontal: 'left' } });
  styleRange(worksheet, startBottomRow + 5, 10, startBottomRow + 5, 14, { bold: true, bgColor: 'FFF8C6' });

  // Set filename with timestamp
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="CO_Attainment_Report_${timestamp}.xlsx"`);
  
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
