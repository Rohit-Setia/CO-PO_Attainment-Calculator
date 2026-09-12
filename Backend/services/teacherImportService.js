// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Teacher bulk-import service.
//
// Single source of truth for the §1/§2 import workflow:
//   parse (xlsx/csv) → smart column detection (aliases like the student parser)
//   → row validation & categorization → username/password generation
//   → bcrypt hashing → transactional account creation → password-setup tokens
//   → best-effort credential email (emailService) → import summary.
//
// Requirements honored:
//   * employee_id / emp_id / faculty_id … all recognized as Employee ID.
//   * duplicate Employee IDs and duplicate emails are detected (DB + in-file).
//   * department is validated against the departments table.
//   * default role is TEACHER; accounts are active immediately.
//   * secure random temporary password + bcrypt hash; NEVER a plaintext stored.
//   * per-row error reasons for the downloadable error workbook.
//   * the whole insert batch runs in a single DB transaction (rollback on failure).
// ─────────────────────────────────────────────────────────────────────────────
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/db');
const { withTransaction } = require('../utils/transaction');
const {
  bulkFindExistingTeacherIdentities,
  createTeacherFromImport,
  createPasswordSetupToken,
} = require('../models/userModel');
const { sendMail, buildCredentialEmail } = require('./emailService');

// Spreadsheet parsing primitives (header detection, cell coercion, xlsx/csv loading)
// are shared with the examination allocation importer — see utils/workbookReader.js.
const {
  norm, readValue, detectColumns: detectColumnsWith, findFirstHeaderRow: findHeaderRowWith,
  loadWorkbookRows,
} = require('../utils/workbookReader');

const COLUMN_ALIASES = {
  employeeId: ['employeeid', 'empid', 'facultyid', 'staffid', 'tcode', 'teachercode', 'facultyno'],
  name: ['name', 'teachername', 'facultyname', 'fullname', 'staffname', 'teacher', 'faculty'],
  email: ['email', 'mail', 'emailid', 'officialemail', 'emailaddress'],
  department: ['department', 'dept', 'departmentname', 'deptname', 'departmentcode'],
  designation: ['designation', 'post', 'jobtitle', 'position'],
  phone: ['phone', 'mobile', 'contact', 'telephone', 'mobileno', 'phonenumber', 'contactnumber'],
  username: ['username', 'user', 'userid', 'loginid', 'login'],
  password: ['password', 'temppassword', 'initialpassword', 'temppass'],
};

const detectColumns = (headers) => detectColumnsWith(headers, COLUMN_ALIASES);
const findFirstHeaderRow = (rows) => findHeaderRowWith(rows, COLUMN_ALIASES);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


// Generates a secure random temporary password guaranteed to contain a letter and digit.
const generateTemporaryPassword = () => {
  let password = '';
  do {
    password = crypto.randomBytes(9).toString('base64url');
  } while (!/[A-Za-z]/.test(password) || !/\d/.test(password));
  return password;
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const generateSetupToken = () => {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
};

// Loads a workbook (xlsx or csv) into a 2D array of raw cell values.
// ─────────────────────────────────────────────────────────────────────────────
// Column → data extraction, validation and categorization.
// ─────────────────────────────────────────────────────────────────────────────

// Maps a department name/code to a departments.id (case-insensitive). Returns null
// when unknown. Callers may decide rows with an unknown department are invalid.
const listDepartments = async () => {
  const [rows] = await pool.query('SELECT id, name, code, school_id FROM departments');
  return rows;
};

const categorizeRows = async ({ rows, filename }) => {
  const grid = await loadWorkbookRows({ buffer: rows, filename });
  const header = findFirstHeaderRow(grid);
  if (!header) {
    return { classified: [], summary: null, headerError: 'Could not detect a valid teacher columns header (Employee ID / Name / Email).' };
  }
  const { mapping, index: headerRowIdx } = header;

  const departments = await listDepartments();
  const deptKey = new Map();
  departments.forEach((d) => {
    deptKey.set(norm(d.name), d);
    if (d.code) deptKey.set(norm(d.code), d);
  });

  const seenEmailsInFile = new Set();
  const seenEmployeeIdsInFile = new Set();

  const classified = []; // { rowNumber, data, outcome:'create'|'alreadyExisting'|'duplicate'|'invalid', reasons: string[] }
  for (let i = headerRowIdx + 1; i < grid.length; i += 1) {
    const raw = grid[i];
    const rowNumber = i + 1;
    const isEmptyRow = raw.every((v) => v === null || v === undefined || String(v).trim() === '');
    if (isEmptyRow) continue;

    const data = {
      employeeId: readValue(raw, mapping.employeeId || []),
      name: readValue(raw, mapping.name || []),
      email: readValue(raw, mapping.email || []),
      department: readValue(raw, mapping.department || []),
      designation: readValue(raw, mapping.designation || []),
      phone: readValue(raw, mapping.phone || []),
      username: readValue(raw, mapping.username || []),
      password: readValue(raw, mapping.password || []),
    };
    const reasons = [];

    if (!data.name) reasons.push('Teacher name is missing.');
    if (!data.email) {
      reasons.push('Email is missing.');
    } else if (!EMAIL_RE.test(data.email)) {
      reasons.push(`Email "${data.email}" is not a valid email address.`);
    }
    if (data.department && !deptKey.has(norm(data.department))) {
      reasons.push(`Department "${data.department}" was not found.`);
    }

    const emailKey = data.email ? data.email.toLowerCase() : '';
    const empKey = data.employeeId ? data.employeeId.toLowerCase() : '';

    let outcome = 'create';
    if (reasons.length > 0) {
      outcome = 'invalid';
    } else if (seenEmailsInFile.has(emailKey)) {
      outcome = 'duplicate';
      reasons.push(`Email "${data.email}" appears more than once in the file.`);
    } else if (empKey && seenEmployeeIdsInFile.has(empKey)) {
      outcome = 'duplicate';
      reasons.push(`Employee ID "${data.employeeId}" appears more than once in the file.`);
    } else {
      seenEmailsInFile.add(emailKey);
      if (empKey) seenEmployeeIdsInFile.add(empKey);
    }

    classified.push({ rowNumber, data, outcome, reasons });
  }
  return { classified, headerError: null, departments };
};

// Refresh DB-existing identities for a classified batch (within the transaction).
const applyExistingIdentityCheck = async (classified, conn) => {
  const emails = classified.map((c) => c.data.email).filter(Boolean);
  const employeeIds = classified.map((c) => c.data.employeeId).filter(Boolean);
  const { existingEmails, existingEmployeeIds, deletedEmails, deletedEmployeeIds } = await bulkFindExistingTeacherIdentities({ emails, employeeIds }, conn);
  classified.forEach((c) => {
    if (c.outcome !== 'create') return;
    const emailKey = c.data.email.toLowerCase();
    const empKey = c.data.employeeId ? c.data.employeeId.toLowerCase() : '';
    if (deletedEmails.has(emailKey)) {
      c.outcome = 'alreadyExisting';
      c.reasons.push('Teacher email belongs to a deleted account that still holds this identifier — restore it from the Archived view or use a different email.');
    } else if (empKey && deletedEmployeeIds.has(empKey)) {
      c.outcome = 'alreadyExisting';
      c.reasons.push('Employee ID belongs to a deleted account that still holds this identifier — restore it from the Archived view or use a different ID.');
    } else if (existingEmails.has(emailKey)) {
      c.outcome = 'alreadyExisting';
      c.reasons.push('Teacher email is already registered.');
    } else if (empKey && existingEmployeeIds.has(empKey)) {
      c.outcome = 'alreadyExisting';
      c.reasons.push('Employee ID is already registered.');
    }
  });
  return classified;
};
// Deterministic username generation: derives from the provided username (or email
// local-part / employee id), sanitizes, and uniqueness-appends a counter when needed.
const buildUniqueUsernames = (classified, existingUsernames) => {
  const taken = new Set(existingUsernames);
  return classified.map((c) => {
    let base = norm(c.data.username) || '';
    if (!base) {
      const local = norm((c.data.email || '').split('@')[0]);
      base = local || norm(c.data.employeeId) || 'teacher';
    }
    base = base.replace(/[^a-z0-9._]/g, '').slice(0, 32) || 'teacher';
    let candidate = base;
    let counter = 1;
    while (taken.has(candidate)) {
      counter += 1;
      candidate = `${base}${counter}`;
    }
    taken.add(candidate);
    c.data.username = candidate;
    return candidate;
  });
};

// Pre-load usernames already in the DB so auto-generated usernames stay unique.
const loadExistingUsernames = async (conn) => {
  const db = conn || pool;
  const [rows] = await db.query("SELECT username FROM teachers WHERE username IS NOT NULL AND username != ''");
  return rows.map((r) => r.username);
};

/**
 * Full import pipeline (parse → validate → transactional create → email).
 * @param {Buffer} buffer - file bytes
 * @param {string} filename - original file name (extension decides xlsx/csv)
 * @returns {Promise<object>} import summary incl. created accounts, errors and emails.
 */
const importTeachers = async ({ buffer, filename }) => {
  const { classified, headerError, departments } = await categorizeRows({ rows: buffer, filename });
  if (headerError) return { headerError, summary: null, errors: [], created: [] };

  const deptByNorm = new Map();
  (departments || []).forEach((d) => { deptByNorm.set(norm(d.name), d); if (d.code) deptByNorm.set(norm(d.code), d); });

  const summary = {
    totalRecords: classified.length,
    created: 0,
    alreadyExisting: 0,
    invalid: 0,
    duplicate: 0,
    failed: 0,
    errors: [],
  };

  const createdAccounts = [];
  const mailQueue = [];

  try {
    await withTransaction(async (conn) => {
      await applyExistingIdentityCheck(classified, conn);
      const existingUsernames = await loadExistingUsernames(conn);
      buildUniqueUsernames(classified, existingUsernames);

      for (const c of classified) {
        if (c.outcome === 'create') {
          const tempPassword = c.data.password || generateTemporaryPassword();
          const hashedPassword = await bcrypt.hash(tempPassword, 10);
          const { token, tokenHash } = generateSetupToken();
          const expiresHours = Number(process.env.PASSWORD_RESET_EXPIRY_HOURS || 24);
          const dept = c.data.department ? deptByNorm.get(norm(c.data.department)) : null;

          try {
            const userId = await createTeacherFromImport({
              name: c.data.name,
              email: c.data.email,
              hashedPassword,
              username: c.data.username,
              employeeId: c.data.employeeId || null,
              designation: c.data.designation || null,
              phone: c.data.phone || null,
              departmentId: dept ? dept.id : null,
            }, conn);

            await createPasswordSetupToken({
              userId,
              tokenHash,
              expiresAt: new Date(Date.now() + expiresHours * 3600 * 1000),
              purpose: 'password_setup',
            }, conn);

            summary.created += 1;
            createdAccounts.push({
              id: userId, name: c.data.name, email: c.data.email,
              username: c.data.username, employeeId: c.data.employeeId || '',
              departmentId: dept ? dept.id : null,
            });
            mailQueue.push({
              userId, name: c.data.name, employeeId: c.data.employeeId,
              username: c.data.username, email: c.data.email, setupToken: token, temporaryPassword: tempPassword,
            });
          } catch (err) {
            summary.failed += 1;
            summary.errors.push({
              row: c.rowNumber, data: c.data, reason: `Database error while creating account: ${err.message}`,
            });
          }
        } else if (c.outcome === 'alreadyExisting') {
          summary.alreadyExisting += 1;
          summary.errors.push({ row: c.rowNumber, data: c.data, reason: c.reasons.join(' ') });
        } else if (c.outcome === 'duplicate') {
          summary.duplicate += 1;
          summary.errors.push({ row: c.rowNumber, data: c.data, reason: c.reasons.join(' ') });
        } else {
          summary.invalid += 1;
          summary.errors.push({ row: c.rowNumber, data: c.data, reason: c.reasons.join(' ') });
        }
      }
    });
  } catch (err) {
    throw Object.assign(new Error(`Import could not be saved because validation or the database transaction failed: ${err.message}`), { status: 400 });
  }

// Best-effort credential emails — never allowed to fail the import response.
  let emailsQueued = 0;
  let emailsSimulated = 0;
  if (mailQueue.length > 0) {
    emailsQueued = mailQueue.length;
    await Promise.allSettled(mailQueue.map(async (m) => {
      const { subject, html } = buildCredentialEmail(m);
      const result = await sendMail({ to: m.email, subject, html });
      if (result.simulated) emailsSimulated += 1;
    }));
  }

  return {
    headerError: null,
    summary,
    created: createdAccounts,
    emails: { queued: emailsQueued, simulated: emailsSimulated, enabled: require('./emailService').smtpEnabled() },
  };
};

// ── Workbook builders ────────────────────────────────────────────────────────

// Blank template the Admin can download and fill in.
const buildImportTemplateWorkbook = async () => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Teachers');
  const headers = ['Employee ID', 'Teacher Name', 'Email', 'Department', 'Designation', 'Phone', 'Username', 'Temporary Password (optional)'];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  ws.getRow(1).alignment = { horizontal: 'center' };
  ws.columns.forEach((col, i) => { col.width = [14, 22, 28, 18, 16, 16, 16, 22][i] || 16; });
  ws.addRow(['EMP001', 'Example Teacher', 'example.teacher@ctuniversity.in', 'CSE', 'Professor', '9876543210', 'example_teacher', '']);
  const notes = workbook.addWorksheet('Instructions');
  notes.getCell('A1').value = 'Instructions';
  notes.getCell('A1').font = { bold: true, size: 14 };
  [
    '1. "Employee ID", "Teacher Name" and "Email" columns are required.',
    '2. "Department" must match an existing department (name or code) configured under Academic Structure.',
    '3. Duplicate emails / employee ids and unknown departments are skipped with a reason in the error file.',
    '4. If "Username" is left blank, one is auto-generated from the email/employee id.',
    '5. If "Temporary Password" is left blank, a secure random temporary password is generated. Teachers set their own password via the emailed link.',
  ].forEach((line, i) => { notes.getCell(`A${3 + i}`).value = line; });
  notes.getColumn(1).width = 110;
  return workbook;
};

// Error workbook: one row per skipped/failed record with the "Reason" as the last column.
const buildImportErrorWorkbook = async (errors) => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Import Errors');
  ws.addRow(['Row', 'Employee ID', 'Teacher Name', 'Email', 'Department', 'Designation', 'Phone', 'Reason']);
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C1C' } };
  (errors || []).forEach((e) => {
    const d = e.data || {};
    ws.addRow([e.row, d.employeeId || '', d.name || '', d.email || '', d.department || '', d.designation || '', d.phone || '', e.reason]);
  });
  ws.columns.forEach((col, i) => { col.width = [8, 16, 24, 28, 18, 16, 16, 60][i] || 16; });
  return workbook;
};

module.exports = {
  importTeachers,
  buildImportTemplateWorkbook,
  buildImportErrorWorkbook,
  normalizeColumnName: norm,
};