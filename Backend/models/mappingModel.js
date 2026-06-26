const pool = require('../config/db');

const createMappingTables = async () => {
  // 1. Drop conflicting legacy table if it has subject_id/co_id structure
  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM co_po_mappings');
    const hasLegacyColumns = cols.some(col => col.Field === 'subject_id' || col.Field === 'co_id');
    if (hasLegacyColumns) {
      console.log('Dropping legacy co_po_mappings table to match new schema...');
      await pool.query('DROP TABLE IF EXISTS co_po_mappings');
    }
  } catch (err) {
    // Table doesn't exist yet, which is fine
  }

  // 2. Create new co_po_mappings table
  // Columns for mapping CO1-CO6 to PO1-PO12, PSO1-PSO3
  const columns = [];
  for (let co = 1; co <= 6; co++) {
    for (let po = 1; po <= 12; po++) {
      columns.push(`co${co}_po${po} INT DEFAULT 0`);
    }
    for (let pso = 1; pso <= 3; pso++) {
      columns.push(`co${co}_pso${pso} INT DEFAULT 0`);
    }
  }

  const avgColumns = [];
  for (let po = 1; po <= 12; po++) {
    avgColumns.push(`avg_po${po} DECIMAL(5,2) DEFAULT 0.00`);
  }
  for (let pso = 1; pso <= 3; pso++) {
    avgColumns.push(`avg_pso${pso} DECIMAL(5,2) DEFAULT 0.00`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS co_po_mappings (
      course_id INT PRIMARY KEY,
      ${columns.join(',\n      ')},
      ${avgColumns.join(',\n      ')},
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // 3. Create course_configs table
  // Max marks for internal and external (CO1-CO6), weightages, thresholds, target level criteria
  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM course_configs');
    const hasCol = cols.some(col => col.Field === 'questions_config_internal');
    if (!hasCol) {
      console.log('Dropping legacy course_configs table to match new schema with questions config...');
      await pool.query('DROP TABLE IF EXISTS course_configs');
    }
  } catch (err) {
    // Table doesn't exist, which is fine
  }

  const coMaxIntColumns = [];
  const coMaxExtColumns = [];
  for (let co = 1; co <= 6; co++) {
    coMaxIntColumns.push(`co${co}_max_internal INT DEFAULT 10`);
    coMaxExtColumns.push(`co${co}_max_external INT DEFAULT 100`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS course_configs (
      course_id INT PRIMARY KEY,
      threshold_percent_internal DECIMAL(5,2) DEFAULT 40.0,
      threshold_percent_external DECIMAL(5,2) DEFAULT 40.0,
      level1_criteria_internal DECIMAL(5,2) DEFAULT 50.0,
      level2_criteria_internal DECIMAL(5,2) DEFAULT 60.0,
      level3_criteria_internal DECIMAL(5,2) DEFAULT 70.0,
      level1_criteria_external DECIMAL(5,2) DEFAULT 50.0,
      level2_criteria_external DECIMAL(5,2) DEFAULT 60.0,
      level3_criteria_external DECIMAL(5,2) DEFAULT 70.0,
      ${coMaxIntColumns.join(',\n      ')},
      ${coMaxExtColumns.join(',\n      ')},
      total_max_internal INT DEFAULT 60,
      total_max_external INT DEFAULT 100,
      internal_weight DECIMAL(5,2) DEFAULT 30.0,
      external_weight DECIMAL(5,2) DEFAULT 70.0,
      questions_config_internal TEXT,
      questions_config_external TEXT,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
};

const getMapping = async (courseId) => {
  const [rows] = await pool.query('SELECT * FROM co_po_mappings WHERE course_id = ?', [courseId]);
  return rows[0] || null;
};

const saveMapping = async (courseId, mappingData) => {
  const keys = Object.keys(mappingData).filter(k => k !== 'course_id');
  if (keys.length === 0) return;

  const placeholders = keys.map(() => '?');
  const updateAssignments = keys.map(k => `${k} = VALUES(${k})`);

  const query = `
    INSERT INTO co_po_mappings (course_id, ${keys.join(', ')})
    VALUES (?, ${placeholders.join(', ')})
    ON DUPLICATE KEY UPDATE ${updateAssignments.join(', ')}
  `;

  const values = [courseId, ...keys.map(k => mappingData[k])];
  await pool.query(query, values);
};

const getConfig = async (courseId) => {
  const [rows] = await pool.query('SELECT * FROM course_configs WHERE course_id = ?', [courseId]);
  return rows[0] || null;
};

const saveConfig = async (courseId, configData) => {
  const keys = Object.keys(configData).filter(k => k !== 'course_id');
  if (keys.length === 0) return;

  const placeholders = keys.map(() => '?');
  const updateAssignments = keys.map(k => `${k} = VALUES(${k})`);

  const query = `
    INSERT INTO course_configs (course_id, ${keys.join(', ')})
    VALUES (?, ${placeholders.join(', ')})
    ON DUPLICATE KEY UPDATE ${updateAssignments.join(', ')}
  `;

  const values = [courseId, ...keys.map(k => configData[k])];
  await pool.query(query, values);
};

module.exports = {
  createMappingTables,
  getMapping,
  saveMapping,
  getConfig,
  saveConfig,
};
