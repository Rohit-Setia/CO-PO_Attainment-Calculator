const pool = require('./db');

const initDatabase = async () => {
  console.log('Starting ERP Database Initialization...');

  const connection = await pool.getConnection();
  try {
    // 1. Departments Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(20) NOT NULL UNIQUE,
        hod VARCHAR(100),
        status VARCHAR(20) DEFAULT 'Active'
      ) ENGINE=InnoDB;
    `);
    console.log('- departments table ready');

    // 2. Programs Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS programs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(20) NOT NULL UNIQUE,
        duration INT NOT NULL,
        department_id INT NOT NULL,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log('- programs table ready');

    // 3. Semesters Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS semesters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        semester_number INT NOT NULL,
        academic_year VARCHAR(20) NOT NULL,
        batch VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'Active'
      ) ENGINE=InnoDB;
    `);
    console.log('- semesters table ready');

    // 4. Alter Teachers Table to support designative fields
    // First, let's check columns in teachers table
    const [columns] = await connection.query('SHOW COLUMNS FROM teachers');
    const columnNames = columns.map(col => col.Field);

    if (!columnNames.includes('designation')) {
      await connection.query('ALTER TABLE teachers ADD COLUMN designation VARCHAR(50)');
      console.log('- Added designation to teachers');
    }
    if (!columnNames.includes('employee_id')) {
      await connection.query('ALTER TABLE teachers ADD COLUMN employee_id VARCHAR(50) UNIQUE');
      console.log('- Added employee_id to teachers');
    }
    if (!columnNames.includes('department_id')) {
      await connection.query(`
        ALTER TABLE teachers 
        ADD COLUMN department_id INT,
        ADD FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      `);
      console.log('- Added department_id to teachers');
    }

    // 5. Subjects Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(20) NOT NULL UNIQUE,
        credits INT NOT NULL,
        semester_id INT NOT NULL,
        department_id INT NOT NULL,
        teacher_id INT,
        number_of_cos INT DEFAULT 5,
        course_coordinator VARCHAR(100),
        FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    console.log('- subjects table ready');

    // 6. Classrooms Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS classrooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        department_id INT NOT NULL,
        program_id INT NOT NULL,
        semester_id INT NOT NULL,
        section VARCHAR(10) NOT NULL,
        academic_year VARCHAR(20) NOT NULL,
        teacher_id INT,
        subject_id INT NOT NULL,
        capacity INT DEFAULT 60,
        status VARCHAR(20) DEFAULT 'Active',
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
        FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
        FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log('- classrooms table ready');

    // 7. Students Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reg_no VARCHAR(50) NOT NULL UNIQUE,
        roll_no VARCHAR(50),
        univ_roll_no VARCHAR(50),
        name VARCHAR(100) NOT NULL,
        gender VARCHAR(10),
        email VARCHAR(120),
        phone VARCHAR(20),
        batch VARCHAR(20),
        semester_id INT NOT NULL,
        department_id INT NOT NULL,
        classroom_id INT,
        status VARCHAR(20) DEFAULT 'Active',
        FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
        FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    console.log('- students table ready');

    // 8. Course Outcomes (COs)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subject_id INT NOT NULL,
        co_number VARCHAR(10) NOT NULL,
        description TEXT NOT NULL,
        bloom_level VARCHAR(50),
        target_percentage DECIMAL(5,2) DEFAULT 40.00,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log('- cos table ready');

    // 9. Program Outcomes (POs)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        po_number VARCHAR(10) NOT NULL,
        description TEXT NOT NULL,
        target_level DECIMAL(3,2) DEFAULT 2.00,
        department_id INT NOT NULL,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log('- pos table ready');

    // 10. Program Specific Outcomes (PSOs)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS psos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pso_number VARCHAR(10) NOT NULL,
        description TEXT NOT NULL,
        department_id INT NOT NULL,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log('- psos table ready');

    // 11. CO-PO/PSO Mappings
    await connection.query(`
      CREATE TABLE IF NOT EXISTS co_po_mappings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subject_id INT NOT NULL,
        co_id INT NOT NULL,
        po_id INT NULL,
        pso_id INT NULL,
        mapping_value INT NOT NULL,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (co_id) REFERENCES cos(id) ON DELETE CASCADE,
        FOREIGN KEY (po_id) REFERENCES pos(id) ON DELETE CASCADE,
        FOREIGN KEY (pso_id) REFERENCES psos(id) ON DELETE CASCADE,
        CONSTRAINT chk_mapping_value CHECK (mapping_value IN (1, 2, 3))
      ) ENGINE=InnoDB;
    `);
    console.log('- co_po_mappings table ready');

    // 12. Assessments Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS assessments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subject_id INT NOT NULL,
        classroom_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL,
        max_marks DECIMAL(5,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'Pending',
        created_by INT,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES teachers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    console.log('- assessments table ready');

    // 13. Question Papers Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS question_papers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        assessment_id INT NOT NULL,
        question_no INT NOT NULL,
        max_marks DECIMAL(5,2) NOT NULL,
        co_id INT,
        difficulty_level VARCHAR(20) DEFAULT 'Medium',
        bloom_level VARCHAR(50),
        question_type VARCHAR(50) DEFAULT 'Theory',
        FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
        FOREIGN KEY (co_id) REFERENCES cos(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);
    console.log('- question_papers table ready');

    // 14. Student Marks Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_marks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        assessment_id INT NOT NULL,
        question_id INT NULL,
        co_id INT NULL,
        marks_obtained DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        is_absent TINYINT DEFAULT 0,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES question_papers(id) ON DELETE CASCADE,
        FOREIGN KEY (co_id) REFERENCES cos(id) ON DELETE SET NULL,
        CONSTRAINT uniq_student_assessment_q_co UNIQUE (student_id, assessment_id, question_id, co_id)
      ) ENGINE=InnoDB;
    `);
    console.log('- student_marks table ready');

    // 15. Attainment Records Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS attainment_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subject_id INT NOT NULL,
        classroom_id INT NOT NULL,
        assessment_id INT NOT NULL,
        calculation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        results_json LONGTEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'Saved',
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
        FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log('- attainment_records table ready');

    // Seed default POs (PO1 to PO12) if pos table is empty
    const [posCount] = await connection.query('SELECT COUNT(*) as count FROM pos');
    if (posCount[0].count === 0) {
      console.log('Seeding default POs...');
      const defaultPOs = [
        ['PO1', 'Engineering knowledge: Apply the knowledge of mathematics, science, engineering fundamentals, and an engineering specialization to the solution of complex engineering problems.'],
        ['PO2', 'Problem analysis: Identify, formulate, review research literature, and analyze complex engineering problems reaching substantiated conclusions using first principles of mathematics, natural sciences, and engineering sciences.'],
        ['PO3', 'Design/development of solutions: Design solutions for complex engineering problems and design system components or processes that meet the specified needs with appropriate consideration for the public health and safety, and the cultural, societal, and environmental considerations.'],
        ['PO4', 'Conduct investigations of complex problems: Use research-based knowledge and research methods including design of experiments, analysis and interpretation of data, and synthesis of the information to provide valid conclusions.'],
        ['PO5', 'Modern tool usage: Create, select, and apply appropriate techniques, resources, and modern engineering and IT tools including prediction and modeling to complex engineering activities with an understanding of the limitations.'],
        ['PO6', 'The engineer and society: Apply reasoning informed by the contextual knowledge to assess societal, health, safety, legal and cultural issues and the consequent responsibilities relevant to the professional engineering practice.'],
        ['PO7', 'Environment and sustainability: Understand the impact of the professional engineering solutions in societal and environmental contexts, and demonstrate the knowledge of, and need for sustainable development.'],
        ['PO8', 'Ethics: Apply ethical principles and commit to professional ethics and responsibilities and norms of the engineering practice.'],
        ['PO9', 'Individual and team work: Function effectively as an individual, and as a member or leader in diverse teams, and in multidisciplinary settings.'],
        ['PO10', 'Communication: Communicate effectively on complex engineering activities with the engineering community and with society at large, such as, being able to comprehend and write effective reports and design documentation, make effective presentations, and give and receive clear instructions.'],
        ['PO11', 'Project management and finance: Demonstrate knowledge and understanding of the engineering and management principles and apply these to one’s own work, as a member and leader in a team, to manage projects and in multidisciplinary environments.'],
        ['PO12', 'Life-long learning: Recognize the need for, and have the preparation and ability to engage in independent and life-long learning in the broadest context of technological change.']
      ];

      // Since we need a department_id, let's insert a default department if none exists
      let deptId = null;
      const [depts] = await connection.query('SELECT id FROM departments LIMIT 1');
      if (depts.length > 0) {
        deptId = depts[0].id;
      } else {
        const [insertedDept] = await connection.query(
          "INSERT INTO departments (name, code, hod) VALUES ('Computer Science & Engineering', 'CSE', 'Dr. John Doe')"
        );
        deptId = insertedDept.insertId;
        console.log('- Default CSE Department seeded');
      }

      for (const po of defaultPOs) {
        await connection.query(
          'INSERT INTO pos (po_number, description, target_level, department_id) VALUES (?, ?, 2.00, ?)',
          [po[0], po[1], deptId]
        );
      }
      console.log('- PO1-PO12 seeded successfully');
    }

    // Seed default Semesters (Sem 1 to Sem 8) if semesters table is empty
    const [semsCount] = await connection.query('SELECT COUNT(*) as count FROM semesters');
    if (semsCount[0].count === 0) {
      console.log('Seeding default Semesters 1 to 8...');
      const defaultSems = [
        [1, '2025-2026', '2025-2029'],
        [2, '2025-2026', '2025-2029'],
        [3, '2025-2026', '2024-2028'],
        [4, '2025-2026', '2024-2028'],
        [5, '2025-2026', '2023-2027'],
        [6, '2025-2026', '2023-2027'],
        [7, '2025-2026', '2022-2026'],
        [8, '2025-2026', '2022-2026']
      ];
      for (const sem of defaultSems) {
        await connection.query(
          'INSERT INTO semesters (semester_number, academic_year, batch) VALUES (?, ?, ?)',
          [sem[0], sem[1], sem[2]]
        );
      }
      console.log('- Semesters 1 to 8 seeded successfully');
    }

    // Seed default Programs if empty
    const [progCount] = await connection.query('SELECT COUNT(*) as count FROM programs');
    let defaultProjDeptId = null;
    const [existingDepts] = await connection.query('SELECT id FROM departments LIMIT 1');
    if (existingDepts.length > 0) {
      defaultProjDeptId = existingDepts[0].id;
    }
    if (progCount[0].count === 0 && defaultProjDeptId) {
      console.log('Seeding default B.Tech CSE program...');
      await connection.query(
        "INSERT INTO programs (name, code, duration, department_id) VALUES ('B.Tech Computer Science & Engineering', 'BTECH-CSE', 4, ?)",
        [defaultProjDeptId]
      );
      console.log('- B.Tech CSE Program seeded successfully');
    }

    // Seed default Subject if empty
    const [subjCount] = await connection.query('SELECT COUNT(*) as count FROM subjects');
    let sem5Id = null;
    const [sem5Rows] = await connection.query('SELECT id FROM semesters WHERE semester_number = 5 LIMIT 1');
    if (sem5Rows.length > 0) {
      sem5Id = sem5Rows[0].id;
    }
    if (subjCount[0].count === 0 && defaultProjDeptId && sem5Id) {
      console.log('Seeding default DSA subject...');
      const [subjResult] = await connection.query(
        `INSERT INTO subjects (name, code, credits, semester_id, department_id, number_of_cos, course_coordinator) 
         VALUES ('Data Structures & Algorithms', 'DSA', 4, ?, ?, 5, 'Dr. John Doe')`,
        [sem5Id, defaultProjDeptId]
      );
      const subjectId = subjResult.insertId;

      // Seed default COs for DSA
      for (let i = 1; i <= 5; i++) {
        await connection.query(
          'INSERT INTO cos (subject_id, co_number, description, bloom_level, target_percentage) VALUES (?, ?, ?, ?, 40.00)',
          [subjectId, `CO${i}`, `Understand and apply concepts of CO${i} in Data Structures & Algorithms`, i <= 2 ? 'Understanding' : 'Applying']
        );
      }
      console.log('- DSA Subject and CO1-5 seeded successfully');
    }

    // Seed default Classroom if empty
    const [classCount] = await connection.query('SELECT COUNT(*) as count FROM classrooms');
    if (classCount[0].count === 0 && defaultProjDeptId && sem5Id) {
      // Find default program and subject
      const [progs] = await connection.query('SELECT id FROM programs LIMIT 1');
      const [subjs] = await connection.query('SELECT id FROM subjects LIMIT 1');
      if (progs.length > 0 && subjs.length > 0) {
        console.log('Seeding default Classroom B.Tech CSE 5A...');
        await connection.query(
          `INSERT INTO classrooms (name, department_id, program_id, semester_id, section, academic_year, subject_id, capacity) 
           VALUES ('B.Tech CSE 5A', ?, ?, ?, 'A', '2025-2026', ?, 60)`,
          [defaultProjDeptId, progs[0].id, sem5Id, subjs[0].id]
        );
        console.log('- Classroom B.Tech CSE 5A seeded successfully');
      }
    }

    console.log('Database ERP Schema initialized successfully.');
  } catch (error) {
    console.error('Error during database initialization:', error);
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = { initDatabase };
