/*
 * Re-projects the reviewed, conflict-filtered import file onto Aiven's actual
 * current column list per table (by column NAME, not position), because the
 * legacy local schema and the current Aiven schema have drifted for some
 * tables (columns dropped/renamed/reordered, e.g. departments.hod removed,
 * teachers/programs/courses column order changed, students slimmed down).
 *
 * Read-only against Aiven: only queries information_schema.columns.
 * Writes a new file; never modifies the reviewed input or connects for writes.
 *
 * Usage:
 *   node Backend/migrations/map-to-aiven-schema.js \
 *     --local-source "D:\\ct r s\\db-backups\\teacher_auth-20260906-150445.sql" \
 *     --reviewed "D:\\ct r s\\db-backups\\reviewed-data-import.sql" \
 *     --output "D:\\ct r s\\db-backups\\aiven-import-ready.sql"
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const localSourcePath = option('--local-source', 'D:\\ct r s\\db-backups\\teacher_auth-20260906-150445.sql');
const reviewedPath = option('--reviewed', 'D:\\ct r s\\db-backups\\reviewed-data-import.sql');
const outputPath = option('--output', path.resolve(path.dirname(reviewedPath), 'aiven-import-ready.sql'));

const splitTuples = (value) => {
  const rows = [];
  let current = '';
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of value) {
    if (quoted) {
      current += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === "'") quoted = false;
      continue;
    }
    if (character === "'") { quoted = true; current += character; continue; }
    if (character === '(') { depth += 1; if (depth > 1) current += character; continue; }
    if (character === ')') {
      depth -= 1;
      if (depth === 0) { rows.push(current); current = ''; } else current += character;
      continue;
    }
    if (depth > 0) current += character;
  }
  return rows;
};

const splitFields = (tuple) => {
  const fields = [];
  let current = '';
  let quoted = false;
  let escaped = false;
  for (const character of tuple) {
    if (quoted) {
      current += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === "'") quoted = false;
      continue;
    }
    if (character === "'") { quoted = true; current += character; continue; }
    if (character === ',') { fields.push(current.trim()); current = ''; }
    else current += character;
  }
  fields.push(current.trim());
  return fields;
};

const localSourceText = fs.readFileSync(localSourcePath, 'utf8');
const localSchemas = {};
for (const match of localSourceText.matchAll(/CREATE TABLE `([^`]+)` \((.*?)\) ENGINE=/gs)) {
  localSchemas[match[1]] = match[2]
    .split(/\r?\n/)
    .map((line) => line.match(/^  `([^`]+)`\s+/)?.[1])
    .filter(Boolean);
}

const reviewedText = fs.readFileSync(reviewedPath, 'utf8');
const insertLineRe = /^INSERT IGNORE INTO `([^`]+)` VALUES (.*);$/gm;

(async () => {
  const outputLines = [
    '-- FINAL AIVEN-SCHEMA-MAPPED IMPORT; GENERATED FROM THE REVIEWED FILE.',
    `-- Reviewed source: ${reviewedPath}`,
    '-- Columns are re-projected onto Aiven\'s current schema by name.',
    '-- Columns present locally but absent on Aiven are dropped (documented below).',
    'SET FOREIGN_KEY_CHECKS=0;',
    '',
  ];
  const droppedColumnsByTable = {};

  let match;
  while ((match = insertLineRe.exec(reviewedText)) !== null) {
    const table = match[1];
    const localCols = localSchemas[table] || [];
    const tuples = splitTuples(match[2]);

    const [aivenColRows] = await pool.query(
      'SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION',
      [table]
    );
    const aivenCols = aivenColRows.map((r) => r.COLUMN_NAME);
    const targetCols = aivenCols.filter((c) => localCols.includes(c));
    const dropped = localCols.filter((c) => !aivenCols.includes(c));
    if (dropped.length > 0) droppedColumnsByTable[table] = dropped;

    const targetIndexes = targetCols.map((c) => localCols.indexOf(c));

    outputLines.push(`-- ${table} (columns: ${targetCols.join(', ')})`);
    const projectedTuples = tuples.map((tuple) => {
      const fields = splitFields(tuple);
      const projected = targetIndexes.map((i) => fields[i]);
      return `(${projected.join(',')})`;
    });
    outputLines.push(
      `INSERT IGNORE INTO \`${table}\` (${targetCols.map((c) => `\`${c}\``).join(',')}) VALUES ${projectedTuples.join(',')};`
    );
    outputLines.push('');
  }

  outputLines.push('SET FOREIGN_KEY_CHECKS=1;');
  outputLines.push('');
  outputLines.push('-- Columns dropped because they do not exist on Aiven (legacy-only fields):');
  for (const [table, cols] of Object.entries(droppedColumnsByTable)) {
    outputLines.push(`--   ${table}: ${cols.join(', ')}`);
  }

  fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf8');
  console.log('Wrote:', outputPath);
  console.log('Dropped columns by table:', JSON.stringify(droppedColumnsByTable, null, 2));
  await pool.end();
})().catch((e) => {
  console.error('MAP_ERROR:', e.message);
  process.exit(1);
});
