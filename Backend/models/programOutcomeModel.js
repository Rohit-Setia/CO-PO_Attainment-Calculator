const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12 — Program-level OBE outcome ownership.
//
// A Program owns its PEOs, POs and PSOs (definitions/descriptions/numbering/status).
// Courses own their COs and the CO→PO/PSO articulation mapping. The fixed
// co_po_values columns (po1..po12, pso1..pso3) remain the attainment storage
// contract — the MEANING of each column now comes from the linked program's
// program_outcomes rows instead of an implicit hardcoded list.
//
// Versioning: `version_label` is the forward-compatible hook. A future phase can
// group definitions under explicit versions (e.g. 'BBA-2026') without changing
// this table — historical attainment remains reproducible because co_po_values
// snapshots the mapping per course at save time.
// ─────────────────────────────────────────────────────────────────────────────

const createProgramOutcomesTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS program_outcomes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      program_id INT NOT NULL,
      type ENUM('PEO', 'PO', 'PSO') NOT NULL,
      code VARCHAR(20) NOT NULL,
      title VARCHAR(255) DEFAULT NULL,
      description TEXT,
      display_order INT DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      version_label VARCHAR(50) DEFAULT 'current',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
      UNIQUE KEY uniq_program_outcome (program_id, type, code)
    ) ENGINE=InnoDB;
  `);
};

// Seed generic PO/PSO definitions for programs that have none. The seeded rows are
// placeholders (never invented descriptions) so the articulation matrix keeps working
// exactly as before until an administrator customizes them. Only runs once per program.
const seedDefaultProgramOutcomes = async () => {
  const [programs] = await pool.query('SELECT id FROM programs');
  for (const program of programs) {
    const [existing] = await pool.query(
      'SELECT COUNT(*) AS c FROM program_outcomes WHERE program_id = ?',
      [program.id],
    );
    if (existing[0].c > 0) continue;
    const rows = [];
    for (let i = 1; i <= 12; i += 1) {
      rows.push(`(${program.id}, 'PO', 'PO${i}', NULL, NULL, ${i}, 1, 'current')`);
    }
    for (let i = 1; i <= 3; i += 1) {
      rows.push(`(${program.id}, 'PSO', 'PSO${i}', NULL, NULL, ${i}, 1, 'current')`);
    }
    await pool.query(
      `INSERT INTO program_outcomes (program_id, type, code, title, description, display_order, is_active, version_label)
       VALUES ${rows.join(', ')}`,
    );
  }
};

// All outcomes for a program, optionally filtered by type ('PEO' | 'PO' | 'PSO').
const getProgramOutcomes = async (programId, type) => {
  const params = [programId];
  let typeClause = '';
  if (type) {
    typeClause = ' AND type = ?';
    params.push(type);
  }
  const [rows] = await pool.query(
    `SELECT * FROM program_outcomes WHERE program_id = ?${typeClause} ORDER BY display_order ASC, code ASC`,
    params,
  );
  return rows;
};

// Outcome definitions for the program a course belongs to — used to label the
// articulation matrix and attainment/dashboard views with the program's OWN
// outcome titles/descriptions (never a hardcoded PO1..PO12 list).
const getProgramOutcomesForCourse = async (courseId) => {
  const [rows] = await pool.query(
    `SELECT po.* FROM program_outcomes po
     JOIN courses c ON c.program_id = po.program_id
     WHERE c.id = ? AND po.is_active = 1
     ORDER BY po.type, po.display_order ASC, po.code ASC`,
    [courseId],
  );
  const byType = { PEO: [], PO: [], PSO: [] };
  rows.forEach((r) => { (byType[r.type] || (byType[r.type] = [])).push(r); });
  return byType;
};

const createProgramOutcome = async ({ programId, type, code, title, description, displayOrder, isActive, versionLabel, target }) => {
  const [result] = await pool.query(
    `INSERT INTO program_outcomes (program_id, type, code, title, description, display_order, is_active, version_label, target)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [programId, type, code, title || null, description || null, displayOrder ?? 0, isActive === false ? 0 : 1, versionLabel || 'current', target ?? null],
  );
  const [row] = await pool.query('SELECT * FROM program_outcomes WHERE id = ?', [result.insertId]);
  return row[0];
};

const updateProgramOutcome = async (outcomeId, { code, title, description, displayOrder, isActive, versionLabel, target }) => {
  const sets = [];
  const values = [];
  if (code !== undefined) { sets.push('code = ?'); values.push(code); }
  if (title !== undefined) { sets.push('title = ?'); values.push(title); }
  if (description !== undefined) { sets.push('description = ?'); values.push(description); }
  if (displayOrder !== undefined) { sets.push('display_order = ?'); values.push(displayOrder); }
  if (isActive !== undefined) { sets.push('is_active = ?'); values.push(isActive ? 1 : 0); }
  if (versionLabel !== undefined) { sets.push('version_label = ?'); values.push(versionLabel); }
  // Phase 13 — configurable PO/PSO attainment target (0–3 scale). NULL = no target yet.
  if (target !== undefined) { sets.push('target = ?'); values.push(target === null || target === '' ? null : target); }
  if (sets.length === 0) return null;
  values.push(outcomeId);
  await pool.query(`UPDATE program_outcomes SET ${sets.join(', ')} WHERE id = ?`, values);
  const [row] = await pool.query('SELECT * FROM program_outcomes WHERE id = ?', [outcomeId]);
  return row[0] || null;
};

const deleteProgramOutcome = async (outcomeId) => {
  const [result] = await pool.query('DELETE FROM program_outcomes WHERE id = ?', [outcomeId]);
  return result.affectedRows > 0;
};

// Bulk upsert (create or update by program+type+code) — used by the management screen's
// Save All action. Returns the count of rows written.
const bulkUpsertProgramOutcomes = async (programId, type, rows) => {
  let written = 0;
  for (const row of rows) {
    if (!row || !row.code) continue; // eslint-disable-line no-continue
    const code = String(row.code).trim();
    if (!code) continue; // eslint-disable-line no-continue
    const [existing] = await pool.query(
      'SELECT id FROM program_outcomes WHERE program_id = ? AND type = ? AND code = ?',
      [programId, type, code],
    );
    if (existing.length > 0) {
      await updateProgramOutcome(existing[0].id, {
        title: row.title, description: row.description,
        displayOrder: row.displayOrder ?? row.display_order ?? 0,
        isActive: row.isActive ?? row.is_active ?? true,
        versionLabel: row.versionLabel ?? 'current',
        target: row.target,
      });
    } else {
      await createProgramOutcome({
        programId, type, code, title: row.title, description: row.description,
        displayOrder: row.displayOrder ?? row.display_order ?? 0,
        isActive: row.isActive ?? row.is_active ?? true,
        versionLabel: row.versionLabel ?? 'current',
        target: row.target,
      });
    }
    written += 1;
  }
  return written;
};

module.exports = {
  createProgramOutcomesTable,
  seedDefaultProgramOutcomes,
  getProgramOutcomes,
  getProgramOutcomesForCourse,
  createProgramOutcome,
  updateProgramOutcome,
  deleteProgramOutcome,
  bulkUpsertProgramOutcomes,
};
