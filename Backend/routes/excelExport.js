const express = require('express');
const ExcelJS = require('exceljs');
const router = express.Router();
const protect = require('../middlewares/authMiddleware');
const { checkCoursePermission } = require('../middlewares/roleMiddleware');
const { getCourseById } = require('../models/courseModel');
const { getConfig, getCoPoValuesForCourse } = require('../models/mappingModel');
const { getCoMarksForCourse } = require('../models/marksModel');
const { getActiveOutcomes } = require('../models/courseOutcomeModel');
const { buildCourseAttainmentSheet, buildCoPoAttainmentSheet } = require('../utils/excelHelpers');
const { buildAttainmentChartBuffers } = require('../utils/chartGenerator');
const pool = require('../config/db');

// GET /api/courses/:id/export-excel — export Excel report
router.get('/courses/:id/export-excel', protect, checkCoursePermission(['Teacher', 'Viewer']), async (req, res, next) => {
  try {
    if (req.user.role === 'Teacher') {
      return res.status(403).json({ success: false, message: 'Teachers are not permitted to download course reports.' });
    }
    const course = await getCourseById(req.params.id, req.user.id, req.user.role);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const config = await getConfig(course.id);
    const courseOutcomes = await getActiveOutcomes(course.id);
    const coPoValues = await getCoPoValuesForCourse(course.id);

    const buildStudents = async (examType) => {
      const [rows] = await pool.query(
        'SELECT id, name, reg_no, total_marks FROM student_marks WHERE course_id = ? AND exam_type = ? ORDER BY reg_no ASC',
        [course.id, examType],
      );
      const coMarksByStudent = await getCoMarksForCourse(course.id, examType);
      return rows.map((s) => ({ ...s, coMarks: coMarksByStudent.get(s.id) || {} }));
    };

    const mttStudents = await buildStudents('MTT');
    const ettStudents = await buildStudents('ETT');

    const workbook = new ExcelJS.Workbook();

    // SHEET 1: Course Attainment Summary
    const ws1 = workbook.addWorksheet('Course Attainment');
    const overallDirectCellIdx = buildCourseAttainmentSheet(ws1, course, config, courseOutcomes, mttStudents, ettStudents);

    // SHEET 2: CO-PO Mapping & PO Attainment
    const ws2 = workbook.addWorksheet('CO-PO Attainment');
    buildCoPoAttainmentSheet(ws2, course, config, courseOutcomes, coPoValues, mttStudents, ettStudents, overallDirectCellIdx);

    // SHEET 3: Attainment Charts (SVG bar charts embedded as images)
    try {
      const { coChartBuffer, poChartBuffer } = buildAttainmentChartBuffers({
        courseOutcomes, mttStudents, ettStudents, config, coPoValues,
      });

      if (coChartBuffer || poChartBuffer) {
        const ws3 = workbook.addWorksheet('Charts');
        ws3.getCell('A1').value = 'ATTAINMENT CHARTS';
        ws3.getCell('A1').font = { bold: true, size: 14, name: 'Calibri' };
        ws3.getCell('A2').value = `${course.subject_name} (${course.course_code}) — Semester ${course.semester} ${course.academic_year}`;
        ws3.getCell('A2').font = { size: 11, name: 'Calibri', color: { argb: 'FF555555' } };

        let imageRow = 4;

        if (coChartBuffer) {
          ws3.getCell(`A${imageRow}`).value = 'CO Direct Attainment Levels (Combined MTT + ETT):';
          ws3.getCell(`A${imageRow}`).font = { bold: true, size: 10 };
          imageRow++;

          const coImageId = workbook.addImage({ buffer: coChartBuffer, extension: 'svg' });
          ws3.addImage(coImageId, {
            tl: { col: 0, row: imageRow },
            ext: { width: 600, height: 300 },
          });
          imageRow += 17; // ~300px / ~18px per row
        }

        if (poChartBuffer) {
          ws3.getCell(`A${imageRow}`).value = 'PO / PSO Attainment Levels:';
          ws3.getCell(`A${imageRow}`).font = { bold: true, size: 10 };
          imageRow++;

          const poImageId = workbook.addImage({ buffer: poChartBuffer, extension: 'svg' });
          ws3.addImage(poImageId, {
            tl: { col: 0, row: imageRow },
            ext: { width: 700, height: 300 },
          });
        }
      }
    } catch (chartErr) {
      // Chart generation is best-effort — don't fail the export if charts error
      console.error('[export-excel] Chart generation failed (non-fatal):', chartErr.message);
    }

    // Set headers and filename
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${course.subject_name.replace(/\s+/g, '_')}_OBE_Attainment_${timestamp}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    next(err);
  }
});

module.exports = router;

