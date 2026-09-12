// ─────────────────────────────────────────────────────────────────────────────
// Allocation workbook builders — the download half of the bulk-allocation loop.
//
// buildAllocationTemplateWorkbook is deliberately NOT a blank sheet: it is
// pre-filled with one row for every (uploaded paper × eligible class) already in the
// examination, so the Examination Cell types teacher emails into a skeleton the ERP
// generated rather than retyping subject codes and class names it already knows.
// Every pre-filled column is one the importer resolves, so a downloaded-and-filled
// template imports cleanly by construction.
//
// buildAllocationErrorWorkbook re-emits only the rejected rows with a Reason column,
// so the Cell fixes the errors in place and re-uploads that same file.
// ─────────────────────────────────────────────────────────────────────────────
const ExcelJS = require('exceljs');
const pool = require('../config/db');
const { TEMPLATE_HEADERS } = require('../services/allocationImportService');

const HEADER_FILL = 'FF1E3A8A';
const COLUMN_WIDTHS = [22, 20, 16, 20, 10, 14, 18, 26, 12, 28, 28, 14];

const styleHeaderRow = (ws) => {
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  ws.getRow(1).alignment = { horizontal: 'center' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
};

// Every (paper, class) pair the Cell will plausibly need to allocate: papers already
// uploaded for this examination, crossed with the classes of each paper's course
// program + semester. A course with no matching class still gets one row (with an
// empty Class cell) so the subject is visible rather than silently absent.
const loadAllocationSkeleton = async (examinationId) => {
  const [rows] = await pool.query(
    `SELECT qp.id AS paper_id, qp.paper_set, qp.exam_type,
            c.course_code, c.subject_name, c.semester,
            s.name AS school_name, d.name AS department_name,
            COALESCE(p.code, p.name) AS program_label,
            ac.section
     FROM question_papers qp
     JOIN courses c ON c.id = qp.course_id
     LEFT JOIN programs p ON p.id = c.program_id
     LEFT JOIN departments d ON d.id = p.department_id
     LEFT JOIN schools s ON s.id = d.school_id
     LEFT JOIN academic_classes ac
       ON ac.program_id = c.program_id AND ac.semester = c.semester
      AND (ac.status IS NULL OR ac.status = 'Active')
     WHERE qp.examination_id = ?
     ORDER BY c.course_code ASC, qp.paper_set ASC, ac.section ASC`,
    [examinationId],
  );
  return rows;
};

const buildAllocationTemplateWorkbook = async (examination) => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Allocation');
  ws.addRow(TEMPLATE_HEADERS);
  styleHeaderRow(ws);
  ws.columns.forEach((col, i) => { col.width = COLUMN_WIDTHS[i] || 18; });

  const skeleton = await loadAllocationSkeleton(examination.id);
  const examLabel = examination.code || examination.name;

  for (const r of skeleton) {
    ws.addRow([
      examLabel, r.school_name || '', r.department_name || '', r.program_label || '',
      r.semester ?? '', r.section || '', r.course_code, r.subject_name,
      r.paper_set || '', '', '', '',
    ]);
  }

  if (skeleton.length === 0) {
    // No papers uploaded yet — show the shape of a row rather than an empty grid.
    ws.addRow([examLabel, 'School of Engineering', 'CSE', 'B.Tech CSE', 2, 'CSE-A',
      '25BTAL12C01', 'Applied Chemistry', 'Set 1',
      'reviewer@ctuniversity.in', 'evaluator@ctuniversity.in', '']);
    ws.getRow(2).font = { italic: true, color: { argb: 'FF888888' } };
  }

  const notes = workbook.addWorksheet('Instructions');
  notes.getCell('A1').value = `Allocation template — ${examination.name}`;
  notes.getCell('A1').font = { bold: true, size: 14 };
  [
    '1. One row per SUBJECT + PAPER SET + CLASS. The same paper allocated to two classes needs two rows.',
    '2. "Subject Code" and "Class" are required. Every other column either narrows an ambiguous match or is informational.',
    '3. "Paper Reviewer" and "Marks Evaluator" are the teachers\' EMAIL addresses. Employee ID also works; a full name works only if it is unique.',
    '4. A row needs at least one of Paper Reviewer / Marks Evaluator. Fill in only one if only one is being allocated.',
    '5. The reviewer and the evaluator do NOT have to be the same person — that separation is the point of this sheet.',
    '6. The question paper must already be uploaded for the subject. Rows for a subject with no uploaded paper are reported as errors.',
    '7. "Paper Set" may be left blank only when the subject has exactly one uploaded paper.',
    '8. "Deadline" is optional (YYYY-MM-DD).',
    '9. Upload creates a preview first: nothing is written until you confirm the import.',
    '10. Re-importing the same sheet is safe — allocations that already exist exactly as written are reported as unchanged, not duplicated.',
    '11. A class already allocated to a DIFFERENT teacher for the same responsibility is reported as an error, never silently reassigned.',
  ].forEach((line, i) => { notes.getCell(`A${3 + i}`).value = line; });
  notes.getColumn(1).width = 120;
  notes.getColumn(1).alignment = { wrapText: true };

  return workbook;
};

const buildAllocationErrorWorkbook = async (rows) => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Errors');
  ws.addRow(['Row', ...TEMPLATE_HEADERS, 'Reason']);
  styleHeaderRow(ws);
  ws.columns.forEach((col, i) => { col.width = i === 0 ? 8 : (COLUMN_WIDTHS[i - 1] || 18); });
  ws.getColumn(TEMPLATE_HEADERS.length + 2).width = 80;

  rows.filter((r) => r.outcome === 'invalid').forEach((r) => {
    const d = r.data;
    ws.addRow([
      r.rowNumber, d.exam || '', d.school || '', d.department || '', d.program || '',
      d.semester || '', d.section || '', d.courseCode || '', d.subject || '',
      d.paperSet || '', d.reviewer || '', d.evaluator || '', d.deadline || '',
      r.reasons.join(' '),
    ]);
  });
  ws.getColumn(TEMPLATE_HEADERS.length + 2).alignment = { wrapText: true };
  return workbook;
};

module.exports = { buildAllocationTemplateWorkbook, buildAllocationErrorWorkbook };
