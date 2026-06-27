const express = require('express');
const router = express.Router();
const protect = require('../middlewares/authMiddleware');
const {
  createCourse,
  getCoursesByTeacher,
  getCourseById,
  deleteCourse,
  getCoDescriptions,
  saveCoDescriptions,
} = require('../models/courseModel');
const {
  getMapping,
  saveMapping,
  getConfig,
  saveConfig,
} = require('../models/mappingModel');
const {
  getMarksByCourse,
  saveStudentMark,
  deleteMarksByCourse,
} = require('../models/marksModel');
const { calculateCourseAttainment } = require('../utils/attainmentCalculator');

// 1. Course CRUD
router.get('/courses', protect, async (req, res, next) => {
  try {
    const courses = await getCoursesByTeacher(req.user.id);
    const pool = require('../config/db');
    
    const enriched = await Promise.all(courses.map(async (course) => {
      const [mappingRows] = await pool.query('SELECT COUNT(*) as count FROM co_po_mappings WHERE course_id = ?', [course.id]);
      const [mttRows] = await pool.query('SELECT COUNT(*) as count FROM student_marks WHERE course_id = ? AND exam_type = "MTT"', [course.id]);
      const [ettRows] = await pool.query('SELECT COUNT(*) as count FROM student_marks WHERE course_id = ? AND exam_type = "ETT"', [course.id]);
      
      let isMappingConfigured = false;
      if (mappingRows[0].count > 0) {
        const [mappingData] = await pool.query('SELECT * FROM co_po_mappings WHERE course_id = ?', [course.id]);
        const m = mappingData[0];
        if (m) {
          isMappingConfigured = Object.keys(m).some(k => k.startsWith('co') && m[k] > 0);
        }
      }

      return {
        ...course,
        hasMapping: isMappingConfigured,
        hasInternalMarks: mttRows[0].count > 0,
        hasExternalMarks: ettRows[0].count > 0,
      };
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
});

router.post('/courses', protect, async (req, res, next) => {
  try {
    const { school, department, subjectName, courseCode, semester, academicYear, numCos } = req.body;
    const courseId = await createCourse({
      teacherId: req.user.id,
      school,
      department,
      subjectName,
      courseCode,
      semester,
      academicYear,
      numCos: numCos || 5,
    });

    const defaultConfig = {
      threshold_percent_internal: 40.0,
      threshold_percent_external: 40.0,
      level1_criteria_internal: 50.0,
      level2_criteria_internal: 60.0,
      level3_criteria_internal: 70.0,
      level1_criteria_external: 50.0,
      level2_criteria_external: 60.0,
      level3_criteria_external: 70.0,
      total_max_internal: 60,
      total_max_external: 100,
      internal_weight: 30.0,
      external_weight: 70.0,
    };
    for (let co = 1; co <= 6; co++) {
      defaultConfig[`co${co}_max_internal`] = co <= 3 ? 10 : 15;
      defaultConfig[`co${co}_max_external`] = 100;
    }
    await saveConfig(courseId, defaultConfig);

    const defaultDescriptions = Array.from({ length: numCos || 5 }, (_, i) => ({
      co_number: i + 1,
      description: `Course Outcome ${i + 1}`,
    }));
    await saveCoDescriptions(courseId, defaultDescriptions);

    const defaultMapping = {};
    for (let co = 1; co <= 6; co++) {
      for (let po = 1; po <= 12; po++) defaultMapping[`co${co}_po${po}`] = 0;
      for (let pso = 1; pso <= 3; pso++) defaultMapping[`co${co}_pso${pso}`] = 0;
    }
    await saveMapping(courseId, defaultMapping);

    res.status(201).json({ success: true, message: 'Course created successfully', data: { id: courseId } });
  } catch (err) {
    next(err);
  }
});

router.delete('/courses/:id', protect, async (req, res, next) => {
  try {
    const deleted = await deleteCourse(req.params.id, req.user.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    res.json({ success: true, message: 'Course deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// 2. Course Workspace config
router.get('/courses/:id/config', protect, async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.id, req.user.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    let config = await getConfig(course.id);
    // Self-healing: create default config if none exists (e.g. legacy courses)
    if (!config) {
      const defaultConfig = {
        threshold_percent_internal: 40.0,
        threshold_percent_external: 40.0,
        level1_criteria_internal: 50.0,
        level2_criteria_internal: 60.0,
        level3_criteria_internal: 70.0,
        level1_criteria_external: 50.0,
        level2_criteria_external: 60.0,
        level3_criteria_external: 70.0,
        total_max_internal: 60,
        total_max_external: 100,
        internal_weight: 30.0,
        external_weight: 70.0,
      };
      for (let co = 1; co <= 6; co++) {
        defaultConfig[`co${co}_max_internal`] = co <= 3 ? 10 : 15;
        defaultConfig[`co${co}_max_external`] = 100;
      }
      await saveConfig(course.id, defaultConfig);
      config = await getConfig(course.id);
    }

    let coDescriptions = await getCoDescriptions(course.id);
    // Self-healing: create default CO descriptions if none exist
    if (!coDescriptions || coDescriptions.length === 0) {
      const defaultDescriptions = Array.from({ length: course.num_cos }, (_, i) => ({
        co_number: i + 1,
        description: `Course Outcome ${i + 1}`,
      }));
      await saveCoDescriptions(course.id, defaultDescriptions);
      coDescriptions = await getCoDescriptions(course.id);
    }

    res.json({
      success: true,
      data: { course, config, coDescriptions },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/courses/:id/config', protect, async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.id, req.user.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const { config, coDescriptions } = req.body;
    if (config) {
      const configToSave = { ...config };
      if (configToSave.questions_config_internal && typeof configToSave.questions_config_internal === 'object') {
        configToSave.questions_config_internal = JSON.stringify(configToSave.questions_config_internal);
      }
      if (configToSave.questions_config_external && typeof configToSave.questions_config_external === 'object') {
        configToSave.questions_config_external = JSON.stringify(configToSave.questions_config_external);
      }
      await saveConfig(course.id, configToSave);
    }
    if (coDescriptions) await saveCoDescriptions(course.id, coDescriptions);

    res.json({ success: true, message: 'Configuration saved successfully' });
  } catch (err) {
    next(err);
  }
});

// 3. CO-PO Mapping Matrix
router.get('/courses/:id/mapping', protect, async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.id, req.user.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const mapping = await getMapping(course.id);
    res.json({ success: true, data: mapping });
  } catch (err) {
    next(err);
  }
});

router.post('/courses/:id/mapping', protect, async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.id, req.user.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const mappingData = req.body;
    const numCos = course.num_cos;

    const pos = [];
    for (let p = 1; p <= 12; p++) pos.push(`po${p}`);
    for (let ps = 1; ps <= 3; ps++) pos.push(`pso${ps}`);

    pos.forEach(po => {
      let sum = 0;
      let count = 0;
      for (let co = 1; co <= numCos; co++) {
        const val = parseInt(mappingData[`co${co}_${po}`]) || 0;
        if (val > 0) {
          sum += val;
          count++;
        }
      }
      mappingData[`avg_${po}`] = count > 0 ? parseFloat((sum / count).toFixed(2)) : 0.00;
    });

    await saveMapping(course.id, mappingData);
    res.json({ success: true, message: 'CO-PO mapping saved successfully' });
  } catch (err) {
    next(err);
  }
});

// 4. Student Marks
router.get('/courses/:id/marks', protect, async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.id, req.user.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const mtt = await getMarksByCourse(course.id, 'MTT');
    const ett = await getMarksByCourse(course.id, 'ETT');

    // Normalize student record: parse question marks and add field aliases for frontend
    const normalizeStudent = (s) => {
      let questionMarks = {};
      if (s.question_marks) {
        try { questionMarks = JSON.parse(s.question_marks); } catch (e) { /* ignore */ }
      }
      return {
        ...s,
        roll: s.reg_no || '',        // alias so frontend always has `roll` field
        totalMarks: parseFloat(s.total_marks) || 0,  // camelCase alias
        questionMarks,
      };
    };

    res.json({
      success: true,
      data: { 
        mtt: mtt.map(normalizeStudent), 
        ett: ett.map(normalizeStudent) 
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/courses/:id/marks', protect, async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.id, req.user.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const { examType, students } = req.body;
    if (!['MTT', 'ETT'].includes(examType)) {
      return res.status(400).json({ success: false, message: 'Invalid exam type' });
    }

    await deleteMarksByCourse(course.id, examType);

    for (const student of students) {
      let totalMarks = 0;
      for (let co = 1; co <= course.num_cos; co++) {
        totalMarks += parseFloat(student[`co${co}`]) || 0;
      }

      let qMarksStr = null;
      if (student.questionMarks) {
        qMarksStr = typeof student.questionMarks === 'object' ? JSON.stringify(student.questionMarks) : student.questionMarks;
      }

      await saveStudentMark({
        courseId: course.id,
        name: student.name,
        regNo: student.roll,
        examType,
        co1: student.co1 || 0,
        co2: student.co2 || 0,
        co3: student.co3 || 0,
        co4: student.co4 || 0,
        co5: student.co5 || 0,
        co6: student.co6 || 0,
        totalMarks,
        questionMarks: qMarksStr
      });
    }

    res.json({ success: true, message: 'Student marks uploaded successfully' });
  } catch (err) {
    next(err);
  }
});

// 5. Attainment Calculation Engine
router.get('/courses/:id/attainment', protect, async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.id, req.user.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const config = await getConfig(course.id);
    const mapping = await getMapping(course.id);
    const mttStudents = await getMarksByCourse(course.id, 'MTT');
    const ettStudents = await getMarksByCourse(course.id, 'ETT');

    const result = calculateCourseAttainment({
      course,
      config,
      mapping,
      mttStudents,
      ettStudents
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// 6. Export full course as a portable JSON snapshot
router.get('/courses/:id/export-json', protect, async (req, res, next) => {
  try {
    const course = await getCourseById(req.params.id, req.user.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const config       = await getConfig(course.id);
    const coDescriptions = await getCoDescriptions(course.id);
    const mapping      = await getMapping(course.id);
    const mtt          = await getMarksByCourse(course.id, 'MTT');
    const ett          = await getMarksByCourse(course.id, 'ETT');

    // Strip internal IDs — only keep transferable fields
    const courseExport = {
      subject_name:  course.subject_name,
      course_code:   course.course_code,
      school:        course.school,
      department:    course.department,
      semester:      course.semester,
      academic_year: course.academic_year,
      num_cos:       course.num_cos,
    };

    const cleanMark = (s) => ({
      name:          s.name || '',
      reg_no:        s.reg_no || '',
      co1: s.co1 || 0, co2: s.co2 || 0, co3: s.co3 || 0,
      co4: s.co4 || 0, co5: s.co5 || 0, co6: s.co6 || 0,
      total_marks:   s.total_marks || 0,
      question_marks: s.question_marks || null,
    });

    const snapshot = {
      exportVersion: '1.0',
      exportedAt:    new Date().toISOString(),
      exportedBy:    req.user.name || req.user.email,
      course:        courseExport,
      config:        config || {},
      coDescriptions: (coDescriptions || []).map(d => ({
        co_number:   d.co_number,
        description: d.description,
      })),
      mapping: mapping || {},
      marks: {
        mtt: mtt.map(cleanMark),
        ett: ett.map(cleanMark),
      },
    };

    res.json({ success: true, data: snapshot });
  } catch (err) {
    next(err);
  }
});

// 7. Import course from a JSON snapshot (creates a new course under the importing teacher)
router.post('/courses/import-json', protect, async (req, res, next) => {
  try {
    const { courseData } = req.body;
    if (!courseData || !courseData.course) {
      return res.status(400).json({ success: false, message: 'Invalid course snapshot. Missing course data.' });
    }

    const { course: c, config, coDescriptions, mapping, marks } = courseData;

    // 1. Create the new course under the importing teacher
    const courseId = await createCourse({
      teacherId:    req.user.id,
      school:       c.school       || '',
      department:   c.department   || '',
      subjectName:  c.subject_name || 'Imported Course',
      courseCode:   c.course_code  || '',
      semester:     c.semester     || 1,
      academicYear: c.academic_year || '',
      numCos:       c.num_cos      || 5,
    });

    // 2. Save config (stringify question configs if they are objects)
    if (config && Object.keys(config).length > 0) {
      const configToSave = { ...config };
      if (configToSave.questions_config_internal && typeof configToSave.questions_config_internal === 'object') {
        configToSave.questions_config_internal = JSON.stringify(configToSave.questions_config_internal);
      }
      if (configToSave.questions_config_external && typeof configToSave.questions_config_external === 'object') {
        configToSave.questions_config_external = JSON.stringify(configToSave.questions_config_external);
      }
      await saveConfig(courseId, configToSave);
    }

    // 3. Save CO descriptions
    if (coDescriptions && coDescriptions.length > 0) {
      await saveCoDescriptions(courseId, coDescriptions);
    }

    // 4. Save CO-PO mapping
    if (mapping && Object.keys(mapping).length > 0) {
      await saveMapping(courseId, mapping);
    }

    // 5. Save student marks (MTT then ETT)
    const importMarks = async (students, examType) => {
      if (!students || students.length === 0) return;
      for (const student of students) {
        let totalMarks = 0;
        for (let co = 1; co <= (c.num_cos || 5); co++) {
          totalMarks += parseFloat(student[`co${co}`]) || 0;
        }
        await saveStudentMark({
          courseId,
          name:          student.name || '',
          regNo:         student.reg_no || '',
          examType,
          co1: student.co1 || 0, co2: student.co2 || 0, co3: student.co3 || 0,
          co4: student.co4 || 0, co5: student.co5 || 0, co6: student.co6 || 0,
          totalMarks,
          questionMarks: student.question_marks || null,
        });
      }
    };

    await importMarks(marks?.mtt, 'MTT');
    await importMarks(marks?.ett, 'ETT');

    res.status(201).json({
      success: true,
      message: `Course "${c.subject_name}" imported successfully.`,
      data: { id: courseId },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
