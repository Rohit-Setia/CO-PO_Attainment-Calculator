const pool = require('../config/db');

// Helper for error handling
const handleError = (res, error, message = 'Internal Server Error') => {
  console.error(error);
  return res.status(500).json({ success: false, message, error: error.message });
};

// ==========================================
// 1. DEPARTMENTS
// ==========================================
const getDepartments = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM departments ORDER BY id DESC');
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch departments');
  }
};

const createDepartment = async (req, res) => {
  try {
    const { name, code, hod } = req.body;
    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'Name and Code are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO departments (name, code, hod) VALUES (?, ?, ?)',
      [name, code, hod || '']
    );
    res.status(201).json({ success: true, data: { id: result.insertId, name, code, hod } });
  } catch (error) {
    handleError(res, error, 'Failed to create department');
  }
};

const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, hod, status } = req.body;
    await pool.query(
      'UPDATE departments SET name = ?, code = ?, hod = ?, status = ? WHERE id = ?',
      [name, code, hod, status || 'Active', id]
    );
    res.json({ success: true, message: 'Department updated successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to update department');
  }
};

const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM departments WHERE id = ?', [id]);
    res.json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to delete department');
  }
};

// ==========================================
// 2. PROGRAMS
// ==========================================
const getPrograms = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, d.name as department_name 
      FROM programs p
      JOIN departments d ON p.department_id = d.id
      ORDER BY p.id DESC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch programs');
  }
};

const createProgram = async (req, res) => {
  try {
    const { name, code, duration, department_id } = req.body;
    if (!name || !code || !department_id) {
      return res.status(400).json({ success: false, message: 'Name, Code and Department are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO programs (name, code, duration, department_id) VALUES (?, ?, ?, ?)',
      [name, code, duration || 3, department_id]
    );
    res.status(201).json({ success: true, data: { id: result.insertId, name, code, duration, department_id } });
  } catch (error) {
    handleError(res, error, 'Failed to create program');
  }
};

const updateProgram = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, duration, department_id } = req.body;
    await pool.query(
      'UPDATE programs SET name = ?, code = ?, duration = ?, department_id = ? WHERE id = ?',
      [name, code, duration, department_id, id]
    );
    res.json({ success: true, message: 'Program updated successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to update program');
  }
};

const deleteProgram = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM programs WHERE id = ?', [id]);
    res.json({ success: true, message: 'Program deleted successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to delete program');
  }
};

// ==========================================
// 3. SEMESTERS
// ==========================================
const getSemesters = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM semesters ORDER BY id DESC');
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch semesters');
  }
};

const createSemester = async (req, res) => {
  try {
    const { semester_number, academic_year, batch } = req.body;
    if (!semester_number || !academic_year || !batch) {
      return res.status(400).json({ success: false, message: 'Semester Number, Academic Year, and Batch are required' });
    }
    const [result] = await pool.query(
      'INSERT INTO semesters (semester_number, academic_year, batch) VALUES (?, ?, ?)',
      [semester_number, academic_year, batch]
    );
    res.status(201).json({ success: true, data: { id: result.insertId, semester_number, academic_year, batch } });
  } catch (error) {
    handleError(res, error, 'Failed to create semester');
  }
};

const updateSemester = async (req, res) => {
  try {
    const { id } = req.params;
    const { semester_number, academic_year, batch, status } = req.body;
    await pool.query(
      'UPDATE semesters SET semester_number = ?, academic_year = ?, batch = ?, status = ? WHERE id = ?',
      [semester_number, academic_year, batch, status || 'Active', id]
    );
    res.json({ success: true, message: 'Semester updated successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to update semester');
  }
};

// ==========================================
// 4. SUBJECTS
// ==========================================
const getSubjects = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.*, sem.semester_number, sem.academic_year, d.name as department_name, t.name as teacher_name
      FROM subjects s
      JOIN semesters sem ON s.semester_id = sem.id
      JOIN departments d ON s.department_id = d.id
      LEFT JOIN teachers t ON s.teacher_id = t.id
      ORDER BY s.id DESC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch subjects');
  }
};

const createSubject = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { name, code, credits, semester_id, department_id, teacher_id, number_of_cos, course_coordinator } = req.body;
    if (!name || !code || !semester_id || !department_id) {
      return res.status(400).json({ success: false, message: 'Name, Code, Semester, and Department are required' });
    }

    const [subjResult] = await connection.query(
      `INSERT INTO subjects (name, code, credits, semester_id, department_id, teacher_id, number_of_cos, course_coordinator) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, code, credits || 4, semester_id, department_id, teacher_id || null, number_of_cos || 5, course_coordinator || '']
    );

    const subjectId = subjResult.insertId;

    // Auto-create default COs (CO1 to CO5 or COn)
    const cosCount = number_of_cos || 5;
    for (let i = 1; i <= cosCount; i++) {
      await connection.query(
        'INSERT INTO cos (subject_id, co_number, description, bloom_level, target_percentage) VALUES (?, ?, ?, ?, 40.00)',
        [subjectId, `CO${i}`, `Course Outcome ${i} for ${name}`, 'Remembering']
      );
    }

    await connection.commit();
    res.status(201).json({ success: true, data: { id: subjectId, name, code } });
  } catch (error) {
    await connection.rollback();
    handleError(res, error, 'Failed to create subject');
  } finally {
    connection.release();
  }
};

const updateSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, credits, semester_id, department_id, teacher_id, number_of_cos, course_coordinator } = req.body;
    await pool.query(
      `UPDATE subjects 
       SET name = ?, code = ?, credits = ?, semester_id = ?, department_id = ?, teacher_id = ?, number_of_cos = ?, course_coordinator = ? 
       WHERE id = ?`,
      [name, code, credits, semester_id, department_id, teacher_id || null, number_of_cos, course_coordinator, id]
    );
    res.json({ success: true, message: 'Subject updated successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to update subject');
  }
};

// ==========================================
// 5. CLASSROOMS
// ==========================================
const getClassrooms = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, d.name as department_name, p.name as program_name, sem.semester_number, sem.academic_year, t.name as teacher_name, s.name as subject_name
      FROM classrooms c
      JOIN departments d ON c.department_id = d.id
      JOIN programs p ON c.program_id = p.id
      JOIN semesters sem ON c.semester_id = sem.id
      LEFT JOIN teachers t ON c.teacher_id = t.id
      JOIN subjects s ON c.subject_id = s.id
      ORDER BY c.id DESC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch classrooms');
  }
};

const createClassroom = async (req, res) => {
  try {
    const { name, department_id, program_id, semester_id, section, academic_year, teacher_id, subject_id, capacity } = req.body;
    if (!name || !department_id || !program_id || !semester_id || !subject_id) {
      return res.status(400).json({ success: false, message: 'Required fields are missing' });
    }

    const [result] = await pool.query(
      `INSERT INTO classrooms (name, department_id, program_id, semester_id, section, academic_year, teacher_id, subject_id, capacity) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, department_id, program_id, semester_id, section || 'A', academic_year || '2025-2026', teacher_id || null, subject_id, capacity || 60]
    );

    res.status(201).json({ success: true, data: { id: result.insertId, name } });
  } catch (error) {
    handleError(res, error, 'Failed to create classroom');
  }
};

const updateClassroom = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, department_id, program_id, semester_id, section, academic_year, teacher_id, subject_id, capacity, status } = req.body;
    await pool.query(
      `UPDATE classrooms 
       SET name = ?, department_id = ?, program_id = ?, semester_id = ?, section = ?, academic_year = ?, teacher_id = ?, subject_id = ?, capacity = ?, status = ?
       WHERE id = ?`,
      [name, department_id, program_id, semester_id, section, academic_year, teacher_id || null, subject_id, capacity, status || 'Active', id]
    );
    res.json({ success: true, message: 'Classroom updated successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to update classroom');
  }
};

const deleteClassroom = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM classrooms WHERE id = ?', [id]);
    res.json({ success: true, message: 'Classroom deleted successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to delete classroom');
  }
};

// ==========================================
// 6. STUDENTS
// ==========================================
const getStudents = async (req, res) => {
  try {
    const { classroom_id, query, department_id } = req.query;
    let sql = `
      SELECT s.*, d.name as department_name, sem.semester_number, c.name as classroom_name 
      FROM students s
      JOIN departments d ON s.department_id = d.id
      JOIN semesters sem ON s.semester_id = sem.id
      LEFT JOIN classrooms c ON s.classroom_id = c.id
    `;
    const params = [];
    const conditions = [];

    if (classroom_id) {
      conditions.push('s.classroom_id = ?');
      params.push(classroom_id);
    }

    if (department_id) {
      conditions.push('s.department_id = ?');
      params.push(department_id);
    }

    if (query) {
      conditions.push('(s.name LIKE ? OR s.reg_no LIKE ? OR s.roll_no LIKE ?)');
      const match = `%${query}%`;
      params.push(match, match, match);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY s.id DESC';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch students');
  }
};

const createStudent = async (req, res) => {
  try {
    const { reg_no, roll_no, univ_roll_no, name, gender, email, phone, batch, semester_id, department_id, classroom_id } = req.body;
    if (!reg_no || !name || !semester_id || !department_id) {
      return res.status(400).json({ success: false, message: 'Reg No, Name, Semester and Department are required' });
    }

    const [result] = await pool.query(
      `INSERT INTO students (reg_no, roll_no, univ_roll_no, name, gender, email, phone, batch, semester_id, department_id, classroom_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [reg_no, roll_no || '', univ_roll_no || '', name, gender || '', email || '', phone || '', batch || '', semester_id, department_id, classroom_id || null]
    );

    res.status(201).json({ success: true, data: { id: result.insertId, name, reg_no } });
  } catch (error) {
    handleError(res, error, 'Failed to create student');
  }
};

const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { reg_no, roll_no, univ_roll_no, name, gender, email, phone, batch, semester_id, department_id, classroom_id, status } = req.body;
    await pool.query(
      `UPDATE students 
       SET reg_no = ?, roll_no = ?, univ_roll_no = ?, name = ?, gender = ?, email = ?, phone = ?, batch = ?, semester_id = ?, department_id = ?, classroom_id = ?, status = ?
       WHERE id = ?`,
      [reg_no, roll_no, univ_roll_no, name, gender, email, phone, batch, semester_id, department_id, classroom_id || null, status || 'Active', id]
    );
    res.json({ success: true, message: 'Student updated successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to update student');
  }
};

const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM students WHERE id = ?', [id]);
    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to delete student');
  }
};

const importStudents = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { students: studentList, classroom_id, semester_id, department_id } = req.body;

    if (!studentList || !Array.isArray(studentList)) {
      return res.status(400).json({ success: false, message: 'Invalid student list payload' });
    }

    let insertedCount = 0;
    let updatedCount = 0;

    for (const stud of studentList) {
      const { regNo, name, rollNo, univRollNo, gender, email, phone, batch } = stud;
      if (!regNo || !name) continue;

      // Check if student exists
      const [existing] = await connection.query('SELECT id FROM students WHERE reg_no = ?', [regNo]);

      if (existing.length > 0) {
        // Update details and link to classroom
        await connection.query(
          `UPDATE students 
           SET name = ?, roll_no = ?, univ_roll_no = ?, gender = ?, email = ?, phone = ?, batch = ?, semester_id = ?, department_id = ?, classroom_id = ?
           WHERE id = ?`,
          [name, rollNo || '', univRollNo || '', gender || '', email || '', phone || '', batch || '', semester_id, department_id, classroom_id, existing[0].id]
        );
        updatedCount++;
      } else {
        // Insert student
        await connection.query(
          `INSERT INTO students (reg_no, roll_no, univ_roll_no, name, gender, email, phone, batch, semester_id, department_id, classroom_id) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [regNo, rollNo || '', univRollNo || '', name, gender || '', email || '', phone || '', batch || '', semester_id, department_id, classroom_id]
        );
        insertedCount++;
      }
    }

    await connection.commit();
    res.json({ success: true, message: `Bulk import completed. Inserted: ${insertedCount}, Updated: ${updatedCount}` });
  } catch (error) {
    await connection.rollback();
    handleError(res, error, 'Failed to import students');
  } finally {
    connection.release();
  }
};

// ==========================================
// 7. OBE (CO/PO/PSOs & mappings)
// ==========================================
const getPOs = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM pos');
    rows.sort((a, b) => a.po_number.localeCompare(b.po_number, undefined, { numeric: true, sensitivity: 'base' }));
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch POs');
  }
};

const createPO = async (req, res) => {
  try {
    const { po_number, description, target_level, department_id } = req.body;
    await pool.query(
      'INSERT INTO pos (po_number, description, target_level, department_id) VALUES (?, ?, ?, ?)',
      [po_number, description, target_level || 2.00, department_id]
    );
    res.json({ success: true, message: 'PO added successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to create PO');
  }
};

const getPSOs = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM psos');
    rows.sort((a, b) => a.pso_number.localeCompare(b.pso_number, undefined, { numeric: true, sensitivity: 'base' }));
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch PSOs');
  }
};

const createPSO = async (req, res) => {
  try {
    const { pso_number, description, department_id } = req.body;
    await pool.query(
      'INSERT INTO psos (pso_number, description, department_id) VALUES (?, ?, ?)',
      [pso_number, description, department_id]
    );
    res.json({ success: true, message: 'PSO added successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to create PSO');
  }
};

const getCOs = async (req, res) => {
  try {
    const { subject_id } = req.params;
    const [rows] = await pool.query('SELECT * FROM cos WHERE subject_id = ? ORDER BY co_number ASC', [subject_id]);
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch COs');
  }
};

const saveCOs = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { subject_id, cos } = req.body;

    if (!subject_id || !cos || !Array.isArray(cos)) {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    // Wipe previous COs for subject and insert new ones
    await connection.query('DELETE FROM cos WHERE subject_id = ?', [subject_id]);

    for (const co of cos) {
      await connection.query(
        'INSERT INTO cos (subject_id, co_number, description, bloom_level, target_percentage) VALUES (?, ?, ?, ?, ?)',
        [subject_id, co.co_number, co.description, co.bloom_level, co.target_percentage || 40.00]
      );
    }

    await connection.commit();
    res.json({ success: true, message: 'Course Outcomes saved successfully' });
  } catch (error) {
    await connection.rollback();
    handleError(res, error, 'Failed to save COs');
  } finally {
    connection.release();
  }
};

const getCOPOMappings = async (req, res) => {
  try {
    const { subject_id } = req.params;
    const [rows] = await pool.query('SELECT * FROM co_po_mappings WHERE subject_id = ?', [subject_id]);
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch CO-PO mappings');
  }
};

const saveCOPOMappings = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { subject_id, mappings } = req.body;

    if (!subject_id || !mappings || !Array.isArray(mappings)) {
      return res.status(400).json({ success: false, message: 'Invalid mappings payload' });
    }

    // Clear old mappings
    await connection.query('DELETE FROM co_po_mappings WHERE subject_id = ?', [subject_id]);

    for (const map of mappings) {
      // map: { co_id, po_id, pso_id, value }
      await connection.query(
        'INSERT INTO co_po_mappings (subject_id, co_id, po_id, pso_id, mapping_value) VALUES (?, ?, ?, ?, ?)',
        [subject_id, map.co_id, map.po_id || null, map.pso_id || null, map.mapping_value]
      );
    }

    await connection.commit();
    res.json({ success: true, message: 'CO-PO matrix mapping saved successfully' });
  } catch (error) {
    await connection.rollback();
    handleError(res, error, 'Failed to save mappings');
  } finally {
    connection.release();
  }
};

// ==========================================
// 8. ASSESSMENTS
// ==========================================
const getAssessments = async (req, res) => {
  try {
    const { classroom_id, subject_id } = req.query;
    let sql = `
      SELECT 
        a.*, 
        s.name as subject_name, 
        s.code as subject_code, 
        sem.semester_number, 
        sem.academic_year, 
        sem.batch,
        t.name as teacher_name, 
        (SELECT COUNT(*) FROM students stud WHERE stud.classroom_id = a.classroom_id) as student_count
      FROM assessments a
      JOIN subjects s ON a.subject_id = s.id
      JOIN classrooms c ON a.classroom_id = c.id
      JOIN semesters sem ON c.semester_id = sem.id
      LEFT JOIN teachers t ON a.created_by = t.id
    `;
    const params = [];
    const conditions = [];

    if (classroom_id) {
      conditions.push('a.classroom_id = ?');
      params.push(classroom_id);
    }
    if (subject_id) {
      conditions.push('a.subject_id = ?');
      params.push(subject_id);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY a.id DESC';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch assessments');
  }
};

const createAssessment = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { subject_id, classroom_id, name, type, max_marks, entry_mode, questions } = req.body;
    const createdBy = req.user.id;

    if (!subject_id || !classroom_id || !name || !type || !max_marks) {
      return res.status(400).json({ success: false, message: 'Missing assessment parameters' });
    }

    const [assessResult] = await connection.query(
      `INSERT INTO assessments (subject_id, classroom_id, name, type, max_marks, entry_mode, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [subject_id, classroom_id, name, type, max_marks, entry_mode || 'question', createdBy]
    );

    const assessmentId = assessResult.insertId;

    // If Question-wise config is sent
    if (questions && Array.isArray(questions)) {
      for (const q of questions) {
        await connection.query(
          `INSERT INTO question_papers (assessment_id, question_no, max_marks, co_id, difficulty_level, bloom_level, question_type) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [assessmentId, q.question_no, q.max_marks, q.co_id || null, q.difficulty_level || 'Medium', q.bloom_level || 'Remembering', q.question_type || 'Theory']
        );
      }
    }

    await connection.commit();
    res.status(201).json({ success: true, data: { id: assessmentId, name } });
  } catch (error) {
    await connection.rollback();
    handleError(res, error, 'Failed to create assessment');
  } finally {
    connection.release();
  }
};

const updateAssessment = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const { name, type, max_marks, entry_mode, questions } = req.body;

    await connection.query(
      `UPDATE assessments 
       SET name = ?, type = ?, max_marks = ?, entry_mode = ? 
       WHERE id = ?`,
      [name, type, max_marks, entry_mode || 'question', id]
    );

    if (questions && Array.isArray(questions)) {
      const [existing] = await connection.query('SELECT id, question_no FROM question_papers WHERE assessment_id = ?', [id]);
      const existingMap = {};
      existing.forEach(q => {
        existingMap[q.question_no] = q.id;
      });

      const activeQNos = [];
      for (const q of questions) {
        activeQNos.push(q.question_no);
        if (existingMap[q.question_no]) {
          await connection.query(
            `UPDATE question_papers 
             SET max_marks = ?, co_id = ?, difficulty_level = ?, bloom_level = ?, question_type = ? 
             WHERE id = ?`,
            [q.max_marks, q.co_id || null, q.difficulty_level || 'Medium', q.bloom_level || 'Remembering', q.question_type || 'Theory', existingMap[q.question_no]]
          );
        } else {
          await connection.query(
            `INSERT INTO question_papers (assessment_id, question_no, max_marks, co_id, difficulty_level, bloom_level, question_type) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, q.question_no, q.max_marks, q.co_id || null, q.difficulty_level || 'Medium', q.bloom_level || 'Remembering', q.question_type || 'Theory']
          );
        }
      }

      if (activeQNos.length > 0) {
        await connection.query('DELETE FROM question_papers WHERE assessment_id = ? AND question_no NOT IN (?)', [id, activeQNos]);
      } else {
        await connection.query('DELETE FROM question_papers WHERE assessment_id = ?', [id]);
      }
    }

    await connection.commit();
    res.json({ success: true, message: 'Assessment updated successfully' });
  } catch (error) {
    await connection.rollback();
    handleError(res, error, 'Failed to update assessment');
  } finally {
    connection.release();
  }
};

const deleteAssessment = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM assessments WHERE id = ?', [id]);
    res.json({ success: true, message: 'Assessment deleted successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to delete assessment');
  }
};

const duplicateAssessment = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;

    const [assessments] = await connection.query('SELECT * FROM assessments WHERE id = ?', [id]);
    if (assessments.length === 0) {
      return res.status(404).json({ success: false, message: 'Original assessment not found' });
    }
    const original = assessments[0];

    const [dupResult] = await connection.query(
      `INSERT INTO assessments (subject_id, classroom_id, name, type, max_marks, entry_mode, status, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)`,
      [original.subject_id, original.classroom_id, `${original.name} (Copy)`, original.type, original.max_marks, original.entry_mode || 'question', req.user.id]
    );
    const newAssessmentId = dupResult.insertId;

    const [questions] = await connection.query('SELECT * FROM question_papers WHERE assessment_id = ?', [id]);
    for (const q of questions) {
      await connection.query(
        `INSERT INTO question_papers (assessment_id, question_no, max_marks, co_id, difficulty_level, bloom_level, question_type) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newAssessmentId, q.question_no, q.max_marks, q.co_id, q.difficulty_level, q.bloom_level, q.question_type]
      );
    }

    await connection.commit();
    res.status(201).json({ success: true, message: 'Assessment duplicated successfully', data: { id: newAssessmentId } });
  } catch (error) {
    await connection.rollback();
    handleError(res, error, 'Failed to duplicate assessment');
  } finally {
    connection.release();
  }
};


// ==========================================
// 9. MARKS GRADING & AUTO-LOADING
// ==========================================
const loadGradingBoard = async (req, res) => {
  try {
    const { classroom_id, assessment_id } = req.query;
    if (!classroom_id || !assessment_id) {
      return res.status(400).json({ success: false, message: 'classroom_id and assessment_id are required' });
    }

    // 1. Fetch all students in classroom
    const [students] = await pool.query(
      'SELECT id, reg_no, roll_no, name FROM students WHERE classroom_id = ? ORDER BY roll_no ASC, reg_no ASC',
      [classroom_id]
    );

    // 2. Fetch assessment details
    const [assessments] = await pool.query('SELECT * FROM assessments WHERE id = ?', [assessment_id]);
    if (!assessments.length) {
      return res.status(404).json({ success: false, message: 'Assessment not found' });
    }
    const assessment = assessments[0];

    // 3. Fetch questions if any
    const [questions] = await pool.query('SELECT * FROM question_papers WHERE assessment_id = ? ORDER BY question_no ASC', [assessment_id]);

    // 4. Fetch existing marks entered
    const [marks] = await pool.query('SELECT * FROM student_marks WHERE assessment_id = ?', [assessment_id]);

    res.json({
      success: true,
      data: {
        students,
        assessment,
        questions,
        existingMarks: marks
      }
    });
  } catch (error) {
    handleError(res, error, 'Failed to load grading data');
  }
};

const saveGradingMarks = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { assessment_id, questions, marks } = req.body;

    // Debug logging (Bug 9)
    if (process.env.NODE_ENV !== 'production') {
      console.log('Incoming API request: POST /api/erp/marks/save');
      console.log('Request body:', JSON.stringify(req.body, null, 2));
    }

    if (!assessment_id || !marks || !Array.isArray(marks)) {
      return res.status(400).json({ success: false, message: 'Invalid marks grading payload' });
    }

    // 1. Verify Assessment exists (Bug 10)
    const [assessmentRows] = await connection.query('SELECT * FROM assessments WHERE id = ?', [assessment_id]);
    if (assessmentRows.length === 0) {
      if (process.env.NODE_ENV !== 'production') console.log(`Database Integrity Check Failed: Assessment ID ${assessment_id} not found.`);
      return res.status(404).json({ success: false, message: `Database Integrity Error: Assessment with ID ${assessment_id} does not exist.` });
    }
    const assessment = assessmentRows[0];

    // 2. Verify Classroom exists (Bug 10)
    const [classroomRows] = await connection.query('SELECT * FROM classrooms WHERE id = ?', [assessment.classroom_id]);
    if (classroomRows.length === 0) {
      if (process.env.NODE_ENV !== 'production') console.log(`Database Integrity Check Failed: Classroom ID ${assessment.classroom_id} not found.`);
      return res.status(404).json({ success: false, message: `Database Integrity Error: Classroom with ID ${assessment.classroom_id} does not exist.` });
    }
    const classroom = classroomRows[0];

    // 3. Verify Subject exists (Bug 10)
    const [subjectRows] = await connection.query('SELECT * FROM subjects WHERE id = ?', [assessment.subject_id]);
    if (subjectRows.length === 0) {
      if (process.env.NODE_ENV !== 'production') console.log(`Database Integrity Check Failed: Subject ID ${assessment.subject_id} not found.`);
      return res.status(404).json({ success: false, message: `Database Integrity Error: Subject with ID ${assessment.subject_id} does not exist.` });
    }

    // 4. Verify Teacher exists (Bug 10)
    if (assessment.created_by) {
      const [teacherRows] = await connection.query('SELECT * FROM teachers WHERE id = ?', [assessment.created_by]);
      if (teacherRows.length === 0) {
        if (process.env.NODE_ENV !== 'production') console.log(`Database Integrity Check Failed: Teacher ID ${assessment.created_by} not found.`);
        return res.status(404).json({ success: false, message: `Database Integrity Error: Teacher with ID ${assessment.created_by} does not exist.` });
      }
    }

    // 5. Verify Semester / Academic Year exists (Bug 10)
    const [semesterRows] = await connection.query('SELECT * FROM semesters WHERE id = ?', [classroom.semester_id]);
    if (semesterRows.length === 0) {
      if (process.env.NODE_ENV !== 'production') console.log(`Database Integrity Check Failed: Semester ID ${classroom.semester_id} not found.`);
      return res.status(404).json({ success: false, message: `Database Integrity Error: Academic Year / Semester with ID ${classroom.semester_id} does not exist.` });
    }

    // 6. Verify Students exist in the database (Bug 10)
    const studentIds = [...new Set(marks.map(m => m.student_id))].filter(Boolean);
    if (studentIds.length > 0) {
      const [existingStudents] = await connection.query(
        'SELECT id FROM students WHERE id IN (?)',
        [studentIds]
      );
      const existingStudentIds = existingStudents.map(s => s.id);
      const missingStudentIds = studentIds.filter(id => !existingStudentIds.includes(id));
      if (missingStudentIds.length > 0) {
        if (process.env.NODE_ENV !== 'production') console.log(`Database Integrity Check Failed: Student IDs ${missingStudentIds.join(', ')} not found.`);
        return res.status(400).json({
          success: false,
          message: `Database Integrity Error: Student(s) with ID(s) ${missingStudentIds.join(', ')} do not exist in the database. Please add them to the roster first.`
        });
      }
    }

    // Sync question configurations if sent
    if (questions && Array.isArray(questions)) {
      const [existingQs] = await connection.query('SELECT id, question_no FROM question_papers WHERE assessment_id = ?', [assessment_id]);
      const existingMap = {};
      existingQs.forEach(q => {
        existingMap[q.question_no] = q.id;
      });

      const activeQNos = [];
      for (const q of questions) {
        activeQNos.push(q.question_no);
        if (existingMap[q.question_no]) {
          await connection.query(
            `UPDATE question_papers 
             SET max_marks = ?, co_id = ?, difficulty_level = ?, bloom_level = ?, question_type = ? 
             WHERE id = ?`,
            [q.max_marks, q.co_id || null, q.difficulty_level || 'Medium', q.bloom_level || 'Remembering', q.question_type || 'Theory', existingMap[q.question_no]]
          );
        } else {
          await connection.query(
            `INSERT INTO question_papers (assessment_id, question_no, max_marks, co_id, difficulty_level, bloom_level, question_type) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [assessment_id, q.question_no, q.max_marks, q.co_id || null, q.difficulty_level || 'Medium', q.bloom_level || 'Remembering', q.question_type || 'Theory']
          );
        }
      }

      // Delete questions not in active list
      if (activeQNos.length > 0) {
        await connection.query('DELETE FROM question_papers WHERE assessment_id = ? AND question_no NOT IN (?)', [assessment_id, activeQNos]);
      } else {
        await connection.query('DELETE FROM question_papers WHERE assessment_id = ?', [assessment_id]);
      }
    }

    // Load updated question paper config map
    const [syncedQs] = await connection.query('SELECT id, question_no, co_id FROM question_papers WHERE assessment_id = ?', [assessment_id]);
    const qNoToIdMap = {};
    const qNoToCoIdMap = {};
    syncedQs.forEach(q => {
      qNoToIdMap[q.question_no] = q.id;
      qNoToCoIdMap[q.question_no] = q.co_id;
    });

    // Clean up existing student marks for this assessment to avoid duplicates from stale mappings/configs
    await connection.query('DELETE FROM student_marks WHERE assessment_id = ?', [assessment_id]);

    // 7. Save grading marks
    for (const record of marks) {
      let { student_id, question_id, co_id, marks_obtained, is_absent } = record;

      if (record.question_no) {
        question_id = qNoToIdMap[record.question_no] || null;
        co_id = qNoToCoIdMap[record.question_no] || null;
      } else if (record.question_id && questions) {
        const matchingInputQ = questions.find(q => String(q.id) === String(record.question_id));
        if (matchingInputQ) {
          question_id = qNoToIdMap[matchingInputQ.question_no] || null;
          co_id = qNoToCoIdMap[matchingInputQ.question_no] || null;
        }
      }

      const query = `INSERT INTO student_marks (student_id, assessment_id, question_id, co_id, marks_obtained, is_absent) 
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE marks_obtained = VALUES(marks_obtained), is_absent = VALUES(is_absent)`;
      const params = [student_id, assessment_id, question_id || null, co_id || null, marks_obtained || 0, is_absent ? 1 : 0];

      if (process.env.NODE_ENV !== 'production') {
        console.log('Executing query:', query);
        console.log('Parameters:', params);
      }

      await connection.query(query, params);
    }

    // Set assessment status to 'Evaluated'
    const statusQuery = 'UPDATE assessments SET status = "Evaluated" WHERE id = ?';
    if (process.env.NODE_ENV !== 'production') {
      console.log('Executing query:', statusQuery, 'Parameters:', [assessment_id]);
    }
    await connection.query(statusQuery, [assessment_id]);

    await connection.commit();
    res.json({ success: true, message: 'Marks updated successfully' });
  } catch (error) {
    await connection.rollback();
    if (process.env.NODE_ENV !== 'production') {
      console.error('saveGradingMarks Error:', error);
    }
    res.status(500).json({ success: false, message: 'Failed to save marks', error: error.message, stack: error.stack });
  } finally {
    connection.release();
  }
};

// ==========================================
// 10. ERP STATS DASHBOARD
// ==========================================
const getERPDashboardStats = async (req, res) => {
  try {
    const [depts] = await pool.query('SELECT COUNT(*) as count FROM departments');
    const [subjects] = await pool.query('SELECT COUNT(*) as count FROM subjects');
    const [teachers] = await pool.query('SELECT COUNT(*) as count FROM teachers');
    const [classrooms] = await pool.query('SELECT COUNT(*) as count FROM classrooms');
    const [students] = await pool.query('SELECT COUNT(*) as count FROM students');
    const [exams] = await pool.query('SELECT COUNT(*) as count FROM assessments WHERE status = "Evaluated"');

    // Get recent activities
    const [recentAssessments] = await pool.query(`
      SELECT a.name, a.type, s.name as subject_name, c.name as class_name, a.status
      FROM assessments a
      JOIN subjects s ON a.subject_id = s.id
      JOIN classrooms c ON a.classroom_id = c.id
      ORDER BY a.id DESC LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        counts: {
          departments: depts[0].count,
          subjects: subjects[0].count,
          teachers: teachers[0].count,
          classrooms: classrooms[0].count,
          students: students[0].count,
          exams: exams[0].count
        },
        recentActivities: recentAssessments
      }
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch dashboard stats');
  }
};

module.exports = {
  // Departments
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  // Programs
  getPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
  // Semesters
  getSemesters,
  createSemester,
  updateSemester,
  // Subjects
  getSubjects,
  createSubject,
  updateSubject,
  // Classrooms
  getClassrooms,
  createClassroom,
  updateClassroom,
  deleteClassroom,
  // Students
  getStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  importStudents,
  // OBE
  getPOs,
  createPO,
  getPSOs,
  createPSO,
  getCOs,
  saveCOs,
  getCOPOMappings,
  saveCOPOMappings,
  // Assessments
  getAssessments,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  duplicateAssessment,
  // Grading
  loadGradingBoard,
  saveGradingMarks,
  // ERP Dashboard
  getERPDashboardStats,
  // Teachers list
  getTeachers: async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT id, name, email, designation, employee_id FROM teachers ORDER BY name ASC');
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to fetch teachers' });
    }
  },
  // Attainment history reports
  getAttainmentHistory: async (req, res) => {
    try {
      const { subject_id, classroom_id } = req.query;
      if (!subject_id || !classroom_id) {
        return res.status(400).json({ success: false, message: 'subject_id and classroom_id are required' });
      }

      const [rows] = await pool.query(
        `SELECT r.*, a.name as assessment_name, a.type as assessment_type 
         FROM attainment_records r
         JOIN assessments a ON r.assessment_id = a.id
         WHERE r.subject_id = ? AND r.classroom_id = ?
         ORDER BY r.id DESC`,
        [subject_id, classroom_id]
      );

      const data = rows.map(r => ({
        ...r,
        results: JSON.parse(r.results_json)
      }));

      res.json({ success: true, data });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Failed to fetch history logs' });
    }
  }
};
