const express = require('express');
const ExcelJS = require('exceljs');
const router = express.Router();

// POST /api/export-excel
router.post('/export-excel', async (req, res) => {
  const { students, coMaxMarks, results, levelCriteria,thresholdPercent, courseInfo = {} } = req.body;
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('CO Attainment');
  
  // Demo headers [file:62]
worksheet.addRow(['CT University']);
worksheet.mergeCells('A1:N1');

// ✅ CENTER ALIGNMENT (add these 3 lines)
const universityCell = worksheet.getCell('A1');
universityCell.alignment = {
  horizontal: 'center',
  vertical: 'middle'
};
universityCell.font = { bold: true, size: 14 };
  worksheet.addRow(['SCHOOL /DEPARTMENT NAME']);
  worksheet.addRow([
    'Program Name', '', courseInfo.program || '', '', '', 'Sem', courseInfo.sem || '', 'Course Code', courseInfo.code , '', 
    'Course Name', courseInfo.name || '', 
  ]);
  
  // Attainment criteria
  worksheet.addRow(['ATTAINMENT CRITERIA', '', levelCriteria.level3 || '70', '', '3 (Level)', '', 'Very Good', '', 'Threshold ', `(${thresholdPercent || 40}%)`, '', 'Target To achieved']);
  worksheet.addRow(['', '', levelCriteria.level2 || '60', '', '2 ', '', 'Good']);
  worksheet.addRow(['', '', levelCriteria.level1 || '50', '', '1 ', '', 'Poor']);
  
  // Student data headers
  worksheet.addRow(['Attainment for End Term Examination', 'Max Marks', 'CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO1%', 'CO2%', 'CO3%', 'CO4%', 'CO5%']);
  worksheet.addRow(['Sr.No', 'Reg No', 'Name', students[0]?.totalMax || 60,coMaxMarks.CO1, coMaxMarks.CO2, coMaxMarks.CO3, coMaxMarks.CO4, coMaxMarks.CO5, '100', '100', '100', '100', '100']);
  
  // Student data
  students.forEach((student, i) => {
    const row = [
      i + 1, 
      student.regNo, 
      student.name,
      students[0]?.totalMax || students[0]?.totalMarks || 60,
      student.CO1 || 0,
      student.CO2 || 0, 
      student.CO3 || 0,
      student.CO4 || 0,
      student.CO5 || 0,
      '100', '100', '100', '100', '100'  // placeholder %
    ];
    worksheet.addRow(row);
  });
  
  // ATTAINMENT TABLE [file:62] - THE KEY PART!
  worksheet.addRow(['ATTAINMENT TABLE']);
  worksheet.mergeCells(`A${worksheet.rowCount}:N${worksheet.rowCount}`);
  worksheet.addRow(['Attainment through internal assessment: (CIA)', '', '', '', '', '', '', 'ABSENTEE', '0', '0', '0', '0', '0']);
  worksheet.addRow(['Attainment through university examination:', results.CO, '', '', '', '', '', 'PRESENT STUDENT', 
    results.summary.presentStudents, results.summary.presentStudents, results.summary.presentStudents, 
    results.summary.presentStudents, results.summary.presentStudents]);
  worksheet.addRow(['Weightage given to the Internal examination (40%):', '', '', '', '', '', '', 
    'No of Student secure > Thresold', 
    results.perCO.CO1.studentsAboveThreshold,
    results.perCO.CO2.studentsAboveThreshold,
    results.perCO.CO3.studentsAboveThreshold,
    results.perCO.CO4.studentsAboveThreshold,
    results.perCO.CO5.studentsAboveThreshold]);
  worksheet.addRow(['Weightage given to the university examination (60%):', '', '', '', '', '', '', 
    '% of Student secure > Thresold',
    `${results.perCO.CO1.percentAbove}%`,
    `${results.perCO.CO2.percentAbove}%`,
    `${results.perCO.CO3.percentAbove}%`,
    `${results.perCO.CO4.percentAbove}%`,
    `${results.perCO.CO5.percentAbove}%`]);
  worksheet.addRow(['Final attainment level of the course (by Direct Assessement):', '', '', '', '', '', 
    '',`Attainment (3 ≥ ${levelCriteria.level3 || 70}%, 2 ≥ ${levelCriteria.level2 || 60}%, 1 ≥ ${levelCriteria.level1 || 50}%)`, 
    results.perCO.CO1.level, results.perCO.CO2.level, results.perCO.CO3.level, 
    results.perCO.CO4.level, results.perCO.CO5.level]);
    worksheet.addRow([
        '', '', '', '', '', '', 'Final CO Level of Course', results.CO || 0
      ]);
      worksheet.mergeCells(`G${worksheet.rowCount}:H${worksheet.rowCount}`); // Merge "Final CO" cells
  
  // Styling
  worksheet.columns = [
    { width: 8 }, { width: 12 }, { width: 15 }, { width: 8 }, { width: 8 }, { width: 8 }, 
    { width: 12 }, { width: 20 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, 
    { width: 10 }, { width: 10 }
  ];


  // Set filename with timestamp
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="CO_Attainment_Report_${timestamp}.xlsx"`);
  
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
