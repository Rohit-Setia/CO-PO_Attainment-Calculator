/*
 * Prepare a reviewed, data-only import file from the local SQL backup.
 *
 * This script DOES NOT connect to MySQL and DOES NOT import anything.
 * It reads the source dump and writes a separate SQL file.
 * The source dump is never modified.
 *
 * Usage:
 *   node Backend/migrations/prepare-reviewed-import.js \
 *     --source "D:\\ct r s\\db-backups\\teacher_auth-20260906-150445.sql" \
 *     --output "D:\\ct r s\\db-backups\\reviewed-data-import.sql"
 *
 * The generated file contains only INSERT IGNORE statements for tables that
 * already belong to the current 27-table application schema. Legacy tables,
 * schema_migrations, and all DDL are excluded for manual review.
 *
 * Reviewed source-data exclusion:
 *   student id 602 (Gurpreet Singh) and its dependent enrollment/mark rows
 *   are intentionally excluded because its registration number conflicts with
 *   the retained Sharvan Kumar record.
 *
 *   teacher ids 34 ('APITest2') and 37 ('ImportTest Admin') are intentionally
 *   excluded, along with admin_audit_log rows they authored, because they are
 *   QA/test Administrator accounts confirmed by the project owner to be
 *   duplicates. The application must have exactly one Administrator:
 *   id 1, 'Sharvan Kumar' <sharvandev28@gmail.com>.
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const EXPECTED_BACKUP_SHA256 = 'C908BA86B63B17D7E4062CA757A951698082E710088E216867747B1CACD50B0A';

const DIRECT_TABLES = [
  'schools',
  'departments',
  'branches',
  'teachers',
  'programs',
  'academic_sessions',
  'academic_classes',
  'courses',
  'students',
  'class_students',
  'course_enrollments',
  'co_descriptions',
  'course_outcomes',
  'course_configs',
  'co_po_mappings',
  'co_po_values',
  'question_configs',
  'student_marks',
  'student_co_marks',
  'student_question_marks',
  'program_outcomes',
  'outcome_versions',
  'improvement_action_plans',
  'admin_audit_log',
  'password_reset_tokens',
  'user_course_assignments',
];

const EXCLUDED_TABLES = [
  'schema_migrations',
  'subjects',
  'cos',
  'pos',
  'psos',
  'assessments',
  'question_papers',
  'attainment_records',
  'classrooms',
  'semesters',
];

const EXCLUDED_STUDENT_ID = '602';
const EXCLUDED_STUDENT_NAME = 'Gurpreet Singh';
const CONFLICTING_REGISTRATION_NUMBER = '72312229';
const EXCLUDED_ENROLLMENT_ID = '2996';
const EXCLUDED_MARK_IDS = new Set(['556', '581']);

const EXCLUDED_ADMIN_TEACHER_IDS = new Set(['34', '37']);
const EXCLUDED_ADMIN_NAMES = ['APITest2', 'ImportTest Admin'];
const RETAINED_ADMIN_TEACHER_ID = '1';
const RETAINED_ADMIN_EMAIL = 'sharvandev28@gmail.com';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const source = option('--source', 'D:\\ct r s\\db-backups\\teacher_auth-20260906-150445.sql');
const output = option('--output', path.resolve(path.dirname(source), 'reviewed-data-import.sql'));
const allowDifferentBackup = args.includes('--allow-different-backup');

if (!fs.existsSync(source)) {
  throw new Error(`Source backup does not exist: ${source}`);
}

const sourceBuffer = fs.readFileSync(source);
const sourceHash = crypto.createHash('sha256').update(sourceBuffer).digest('hex').toUpperCase();
if (!allowDifferentBackup && sourceHash !== EXPECTED_BACKUP_SHA256) {
  throw new Error(`Source backup SHA-256 does not match the reviewed backup. Expected ${EXPECTED_BACKUP_SHA256}, got ${sourceHash}. Use --allow-different-backup only after reviewing a new backup.`);
}

const sourceText = sourceBuffer.toString('utf8');
const schemas = {};
for (const match of sourceText.matchAll(/CREATE TABLE `([^`]+)` \((.*?)\) ENGINE=/gs)) {
  schemas[match[1]] = match[2]
    .split(/\r?\n/)
    .map((line) => line.match(/^  `([^`]+)`\s+/)?.[1])
    .filter(Boolean);
}

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

const sqlValue = (value) => {
  if (!value || value.toUpperCase() === 'NULL') return null;
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }
  return value;
};

const rowObject = (table, tuple) => {
  const columns = schemas[table] || [];
  const fields = splitFields(tuple);
  return Object.fromEntries(columns.map((column, index) => [column, sqlValue(fields[index])]));
};

const rowField = (table, tuple, column) => {
  const columns = schemas[table] || [];
  const index = columns.indexOf(column);
  return index < 0 ? undefined : sqlValue(splitFields(tuple)[index]);
};

const statements = new Map();
const insertPattern = /^INSERT INTO `([^`]+)` VALUES .*?;$/gm;
let match;
while ((match = insertPattern.exec(sourceText)) !== null) {
  const table = match[1];
  if (!statements.has(table)) statements.set(table, []);
  statements.get(table).push(match[0]);
}

const excludedMarkIds = new Set(EXCLUDED_MARK_IDS);

const studentStatements = statements.get('students') || [];
const studentConflictDetected = studentStatements.some((statement) => statement.includes("(602,'72312229'"));
if (!studentConflictDetected || excludedMarkIds.size === 0) {
  throw new Error(`Expected reviewed conflict was not detected (student=${studentConflictDetected}, markRows=${excludedMarkIds.size}). Refusing to generate an unfiltered import.`);
}

const teacherStatements = statements.get('teachers') || [];
const teacherRows = teacherStatements.flatMap((statement) => {
  const values = statement.match(/^INSERT INTO `[^`]+` VALUES (.*);$/)?.[1] || '';
  return splitTuples(values);
});
const adminRows = teacherRows
  .map((tuple) => rowObject('teachers', tuple))
  .filter((row) => String(row.role).toUpperCase() === 'ADMIN');
if (adminRows.length !== 3) {
  throw new Error(`Expected exactly 3 source Admin rows (1 retained + 2 duplicates), found ${adminRows.length}. Refusing to generate an unfiltered import.`);
}
const retainedAdmin = adminRows.find((row) => row.id === RETAINED_ADMIN_TEACHER_ID);
if (!retainedAdmin || retainedAdmin.email !== RETAINED_ADMIN_EMAIL) {
  throw new Error(`Retained admin id ${RETAINED_ADMIN_TEACHER_ID} does not match expected email ${RETAINED_ADMIN_EMAIL}. Refusing to generate an unfiltered import.`);
}
const duplicateAdminIds = adminRows.filter((row) => row.id !== RETAINED_ADMIN_TEACHER_ID).map((row) => row.id);
const duplicateAdminIdsMatch = duplicateAdminIds.length === EXCLUDED_ADMIN_TEACHER_IDS.size
  && duplicateAdminIds.every((id) => EXCLUDED_ADMIN_TEACHER_IDS.has(id));
if (!duplicateAdminIdsMatch) {
  throw new Error(`Duplicate admin ids ${JSON.stringify(duplicateAdminIds)} do not match expected ${JSON.stringify([...EXCLUDED_ADMIN_TEACHER_IDS])}. Refusing to generate an unfiltered import.`);
}

const shouldExcludeTuple = (table, tuple) => {
  const fields = splitFields(tuple);
  if (table === 'students') return tuple.includes("602,'72312229'");
  if (table === 'class_students') return fields[2] === EXCLUDED_STUDENT_ID;
  if (table === 'course_enrollments') return fields[0] === EXCLUDED_ENROLLMENT_ID || fields[2] === EXCLUDED_STUDENT_ID;
  if (table === 'student_marks') return excludedMarkIds.has(fields[0]);
  if (table === 'student_co_marks' || table === 'student_question_marks') {
    return excludedMarkIds.has(fields[1]);
  }
  if (table === 'teachers') return EXCLUDED_ADMIN_TEACHER_IDS.has(fields[0]);
  if (table === 'admin_audit_log') return EXCLUDED_ADMIN_TEACHER_IDS.has(fields[1]);
  return false;
};

// Parses each tuple structurally (via splitTuples/splitFields) rather than
// regex string-surgery, so removing one or many tuples — including the last
// one(s) in a list — never leaves a dangling/double comma in the output SQL.
const filterRawValues = (table, values) => {
  const tuples = splitTuples(values);
  let removed = 0;
  const kept = tuples.filter((tuple) => {
    if (shouldExcludeTuple(table, tuple)) {
      removed += 1;
      return false;
    }
    return true;
  });
  return { values: kept.map((tuple) => `(${tuple})`).join(','), removed };
};

const outputLines = [
  '-- REVIEWED DATA-ONLY IMPORT; GENERATED WITHOUT CONNECTING TO MYSQL.',
  `-- Source: ${source}`,
  `-- Source SHA-256: ${sourceHash}`,
  '-- This file contains no CREATE, ALTER, DROP, TRUNCATE, DELETE, or schema_migrations statements.',
  '-- INSERT IGNORE preserves source IDs on an empty target and avoids duplicate-key failures on retry.',
  '-- Existing rows with conflicting IDs are skipped and require manual collision review.',
  '-- Review the migration matrix before executing this file.',
  'SET FOREIGN_KEY_CHECKS=0;',
  '',
];

const generatedTables = [];
const excludedRows = {};
for (const table of DIRECT_TABLES) {
  const tableStatements = statements.get(table) || [];
  if (tableStatements.length === 0) continue;
  generatedTables.push(table);
  outputLines.push(`-- ${table}`);
  for (const statement of tableStatements) {
    const values = statement.match(/^INSERT INTO `[^`]+` VALUES (.*);$/)?.[1] || '';
    const filtered = filterRawValues(table, values);
    if (filtered.removed > 0) excludedRows[table] = (excludedRows[table] || 0) + filtered.removed;
    if (filtered.values.trim()) {
      outputLines.push(`INSERT IGNORE INTO \`${table}\` VALUES ${filtered.values};`);
    }
  }
  outputLines.push('');
}

outputLines.push('SET FOREIGN_KEY_CHECKS=1;');
outputLines.push('');
outputLines.push('-- Excluded legacy/manual-review tables: ' + EXCLUDED_TABLES.join(', '));
outputLines.push('-- schema_migrations was intentionally excluded; preserve the target migration history.');
outputLines.push(`-- Excluded reviewed conflict: student id ${EXCLUDED_STUDENT_ID} (${EXCLUDED_STUDENT_NAME}) and dependent rows.`);
outputLines.push(`-- Excluded duplicate Administrator accounts: teacher ids ${[...EXCLUDED_ADMIN_TEACHER_IDS].join(', ')} (${EXCLUDED_ADMIN_NAMES.join(', ')}) and their admin_audit_log rows.`);
outputLines.push(`-- Retained Administrator: teacher id ${RETAINED_ADMIN_TEACHER_ID} (${RETAINED_ADMIN_EMAIL}).`);

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, outputLines.join('\n'), 'utf8');

console.log(`Prepared reviewed import file: ${output}`);
console.log(`Source SHA-256 verified: ${sourceHash}`);
console.log(`Generated direct-compatible tables: ${generatedTables.join(', ') || '(none)'}`);
console.log(`Excluded legacy/manual-review tables: ${EXCLUDED_TABLES.join(', ')}`);
console.log(`Excluded conflict rows: ${JSON.stringify(excludedRows)}`);
console.log('No database connection or import was performed.');
