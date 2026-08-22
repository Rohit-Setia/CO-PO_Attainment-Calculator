const pool = require('../config/db');
const { getActiveOutcomes } = require('./courseOutcomeModel');

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

// Column identifiers can't be parameterized with `?` placeholders, and saveMapping/saveConfig
// build INSERT/UPDATE column lists directly from client-controlled object keys (req.body).
// Without a whitelist, a crafted JSON key becomes a raw SQL fragment (CWE-89). These sets pin
// the exact columns each table actually has — anything else is silently dropped, not executed.
const ALLOWED_MAPPING_COLUMNS = new Set();
for (let co = 1; co <= 6; co += 1) {
  for (let po = 1; po <= 12; po += 1) ALLOWED_MAPPING_COLUMNS.add(`co${co}_po${po}`);
  for (let pso = 1; pso <= 3; pso += 1) ALLOWED_MAPPING_COLUMNS.add(`co${co}_pso${pso}`);
}
for (let po = 1; po <= 12; po += 1) ALLOWED_MAPPING_COLUMNS.add(`avg_po${po}`);
for (let pso = 1; pso <= 3; pso += 1) ALLOWED_MAPPING_COLUMNS.add(`avg_pso${pso}`);

const ALLOWED_CONFIG_COLUMNS = new Set([
  'threshold_percent_internal', 'threshold_percent_external',
  'level1_criteria_internal', 'level2_criteria_internal', 'level3_criteria_internal',
  'level1_criteria_external', 'level2_criteria_external', 'level3_criteria_external',
  'total_max_internal', 'total_max_external',
  'internal_weight', 'external_weight',
  'questions_config_internal', 'questions_config_external',
]);
for (let co = 1; co <= 6; co += 1) {
  ALLOWED_CONFIG_COLUMNS.add(`co${co}_max_internal`);
  ALLOWED_CONFIG_COLUMNS.add(`co${co}_max_external`);
}

const getMapping = async (courseId) => {
  const [rows] = await pool.query('SELECT * FROM co_po_mappings WHERE course_id = ?', [courseId]);
  return rows[0] || null;
};

const saveMapping = async (courseId, mappingData) => {
  const keys = Object.keys(mappingData).filter(k => ALLOWED_MAPPING_COLUMNS.has(k));
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
  const keys = Object.keys(configData).filter(k => ALLOWED_CONFIG_COLUMNS.has(k));
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

// ── Normalized CO-PO mapping (dynamic CO count) ──────────────────────────────
// One row per course_outcome instead of one giant per-course row with co1_po1..co6_pso3
// columns — this is what actually makes CO-PO mapping work past CO6. PO/PSO stay fixed-width
// (12 + 3 columns) since only the CO dimension needed to become dynamic.

const PO_PSO_COLUMNS = [
  ...Array.from({ length: 12 }, (_, i) => `po${i + 1}`),
  ...Array.from({ length: 3 }, (_, i) => `pso${i + 1}`),
];
const ALLOWED_CO_PO_VALUE_COLUMNS = new Set(PO_PSO_COLUMNS);

const createCoPoValueTable = async () => {
  const columns = PO_PSO_COLUMNS.map((c) => `${c} INT DEFAULT 0`).join(',\n      ');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS co_po_values (
      co_id INT PRIMARY KEY,
      ${columns},
      FOREIGN KEY (co_id) REFERENCES course_outcomes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
};

// One-time, idempotent: copies each course's legacy co_po_mappings row (co1_po1..co6_pso3
// columns) into one co_po_values row per course_outcome. Requires course outcomes to already
// be migrated. Skipped per-CO if it already has a co_po_values row.
const migrateLegacyMappingToCoPoValues = async () => {
  const [courses] = await pool.query('SELECT id FROM courses');

  for (const course of courses) {
    const outcomes = await getActiveOutcomes(course.id);
    if (outcomes.length === 0) continue;

    const [legacyRows] = await pool.query('SELECT * FROM co_po_mappings WHERE course_id = ?', [course.id]);
    const legacy = legacyRows[0];
    if (!legacy) continue;

    for (const outcome of outcomes) {
      const [existing] = await pool.query('SELECT co_id FROM co_po_values WHERE co_id = ?', [outcome.id]);
      if (existing.length > 0) continue; // already migrated

      const values = {};
      PO_PSO_COLUMNS.forEach((col) => {
        values[col] = legacy[`co${outcome.co_number}_${col}`] ?? 0;
      });
      const cols = Object.keys(values);
      await pool.query(
        `INSERT INTO co_po_values (co_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`,
        [outcome.id, ...cols.map((c) => values[c])],
      );
    }
  }
};

// Returns one row per active CO: { co_id, co_number, description, po1..po12, pso1..pso3 }
const getCoPoValuesForCourse = async (courseId) => {
  const [rows] = await pool.query(
    `SELECT co.id as co_id, co.co_number, co.description, cpv.*
     FROM course_outcomes co
     LEFT JOIN co_po_values cpv ON cpv.co_id = co.id
     WHERE co.course_id = ? AND co.is_active = 1
     ORDER BY co.co_number ASC`,
    [courseId],
  );
  return rows.map((row) => {
    const clean = { co_id: row.co_id, co_number: row.co_number, description: row.description };
    PO_PSO_COLUMNS.forEach((col) => { clean[col] = row[col] ?? 0; });
    return clean;
  });
};

// Column-level average across every active CO for each PO/PSO — computed live instead of
// stored, so it can never go stale relative to the actual per-CO values.
const getCoPoAveragesForCourse = async (courseId) => {
  const rows = await getCoPoValuesForCourse(courseId);
  const averages = {};
  PO_PSO_COLUMNS.forEach((col) => {
    const nonZero = rows.map((r) => r[col]).filter((v) => v > 0);
    averages[`avg_${col}`] = nonZero.length > 0
      ? parseFloat((nonZero.reduce((a, b) => a + b, 0) / nonZero.length).toFixed(2))
      : 0;
  });
  return averages;
};

const saveCoPoValue = async (coId, valuesData) => {
  const keys = Object.keys(valuesData).filter((k) => ALLOWED_CO_PO_VALUE_COLUMNS.has(k));
  if (keys.length === 0) return;

  const placeholders = keys.map(() => '?');
  const updateAssignments = keys.map((k) => `${k} = VALUES(${k})`);
  const query = `
    INSERT INTO co_po_values (co_id, ${keys.join(', ')})
    VALUES (?, ${placeholders.join(', ')})
    ON DUPLICATE KEY UPDATE ${updateAssignments.join(', ')}
  `;
  await pool.query(query, [coId, ...keys.map((k) => valuesData[k])]);
};

module.exports = {
  createMappingTables,
  getMapping,
  saveMapping,
  getConfig,
  saveConfig,
  createCoPoValueTable,
  migrateLegacyMappingToCoPoValues,
  getCoPoValuesForCourse,
  getCoPoAveragesForCourse,
  saveCoPoValue,
};
