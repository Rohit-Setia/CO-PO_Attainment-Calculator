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
const pool = require('../config/db');

// GET /api/courses/:id/export-excel — all course members (Teacher/Viewer/Admin/Exam Team) can export
router.get('/courses/:id/export-excel', protect, checkCoursePermission(['Teacher', 'Viewer']), async (req, res, next) => {
  try {
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
