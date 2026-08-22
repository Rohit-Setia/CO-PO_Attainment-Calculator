const express = require('express');
const ExcelJS = require('exceljs');
const router = express.Router();
const protect = require('../middlewares/authMiddleware');
const { checkCoursePermission } = require('../middlewares/roleMiddleware');
const { getCourseById } = require('../models/courseModel');
const { getConfig, getMapping } = require('../models/mappingModel');
const { getMarksByCourse } = require('../models/marksModel');
const { buildCourseAttainmentSheet, buildCoPoAttainmentSheet } = require('../utils/excelHelpers');

// GET /api/courses/:id/export-excel — all course members (Teacher/Viewer/Admin/Exam Team) can export
router.get('/courses/:id/export-excel', protect, checkCoursePermission(['Teacher', 'Viewer']), async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.id, req.user.id, req.user.role);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const config = await getConfig(course.id);
    const mapping = await getMapping(course.id);
    const mttStudents = await getMarksByCourse(course.id, 'MTT');
    const ettStudents = await getMarksByCourse(course.id, 'ETT');
    const numCos = course.num_cos || 5;

    const workbook = new ExcelJS.Workbook();
    
    // SHEET 1: Course Attainment Summary
    const ws1 = workbook.addWorksheet('Course Attainment');
    const overallDirectCellIdx = buildCourseAttainmentSheet(ws1, course, config, mttStudents, ettStudents, numCos);

    // SHEET 2: CO-PO Mapping & PO Attainment
    const ws2 = workbook.addWorksheet('CO-PO Attainment');
    buildCoPoAttainmentSheet(ws2, course, config, mapping, mttStudents, ettStudents, numCos, overallDirectCellIdx);

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
