const ExcelJS = require('exceljs');

// ── Filename helpers ───────────────────────────────────────────────────────
// Windows-illegal characters: < > : " / \ | ? *
const sanitize = (s) => String(s || '').replace(/[<>:"/\\|?*]+/g, '').trim().replace(/\s+/g, '-');

const buildMarksFileName = ({ session, program, semester, section, course }) => {
  const sessionShort = String(session?.name || '').replace(/\s+/g, ''); // "2026-2027"
  const programPart = sanitize(program?.code || program?.name || '');
  const semPart = `Sem${semester ?? ''}`;
  const sectionPart = section ? sanitize(section) : '';
  const courseCode = sanitize(course.course_code || String(course.id));
  const courseName = sanitize((course.subject_name || course.course_name || '').split(' ')[0]);
  return [sessionShort, programPart, semPart, sectionPart, courseCode, courseName, 'Marks']
    .filter(Boolean)
    .join('_')
    .concat('.xlsx');
};

// ── Marks Entry workbook ───────────────────────────────────────────────────
// ctx: { course, program, department, school, session, semester, section,
//        outcomes: [{id, co_number, max_internal, max_external}],
//        students: [{registration_number, roll_number, roll_no, name, coMarks:{coId:val}}],
//        examType: 'MTT'|'ETT' }
const buildMarksEntryWorkbook = async (ctx) => {
  const { course, outcomes, students, examType } = ctx;
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Marks Entry');

  // Header block
  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = 'CT University';
  ws.getCell('A1').font = { bold: true, size: 16 };
  ws.mergeCells('A2:D2');
  ws.getCell('A2').value = 'Academic Marks Entry';
  ws.getCell('A2').font = { bold: true, size: 12, color: { argb: 'FF1F3864' } };

  const metaRows = [
    ['School', ctx.school?.name || ''],
    ['Department', ctx.department?.name || ''],
    ['Program', ctx.program?.name || ''],
    ['Academic Session', ctx.session?.name || ''],
    ['Semester', ctx.semester ?? ''],
    ['Section', ctx.section || ''],
    ['Course Code', course.course_code || ''],
    ['Course Name', course.subject_name || course.course_name || ''],
    ['Assessment', examType],
    ['Generated Date', new Date().toISOString().slice(0, 10)],
  ];
  let r = 4;
  metaRows.forEach(([label, value]) => {
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`A${r}`).font = { bold: true };
    ws.getCell(`B${r}`).value = value;
    r += 1;
  });

  // Machine-readable identification block (used by import validation)
  r += 1;
  [
    ['Template Version', 1],
    ['Course ID', course.id],
    ['Program ID', ctx.program?.id ?? ''],
    ['Session ID', ctx.session?.id ?? ''],
    ['Semester', ctx.semester ?? ''],
    ['Exam Type', examType],
    ['Generated From', 'CT University CO-PO System'],
  ].forEach(([label, value]) => {
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`A${r}`).font = { size: 8, italic: true, color: { argb: 'FF808080' } };
    ws.getCell(`B${r}`).value = value;
    ws.getCell(`B${r}`).font = { size: 8, italic: true, color: { argb: 'FF808080' } };
    r += 1;
  });

  // Student table
  r += 1;
  const headerRowIndex = r;
  const coColumns = outcomes.map((co, i) => ({
    co,
    col: 5 + i, // E onward
    max: parseFloat(examType === 'MTT' ? co.max_internal : co.max_external) || 0,
  }));
  const totalCol = 5 + coColumns.length;
  const statusCol = totalCol + 1;
  const thinBorder = {
    top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' },
  };

  const headerCell = (col, label, fill) => {
    const cell = ws.getCell(r, col);
    cell.value = label;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: 'center', wrapText: true };
    return cell;
  };
  ['S.No', 'Registration No', 'Roll No', 'Student Name'].forEach((h, i) => headerCell(i + 1, h, 'FFD9E2F3'));
  coColumns.forEach(({ co, col, max }) => headerCell(col, `CO${co.co_number} (max ${max})`, 'FFFFF2CC'));
  headerCell(totalCol, 'Total', 'FFD9E2F3');
  headerCell(statusCol, 'Status', 'FFD9E2F3');

  // Student rows — identity auto-populated; teacher fills only CO columns
  students.forEach((s, idx) => {
    const row = r + 1 + idx;
    ws.getCell(row, 1).value = idx + 1;
    const regCell = ws.getCell(row, 2);
    regCell.value = s.registration_number;
    regCell.font = { bold: true };
    ws.getCell(row, 3).value = s.roll_number || s.roll_no || '';
    ws.getCell(row, 4).value = s.name;
    coColumns.forEach(({ co, col }) => {
      const v = s.coMarks?.[String(co.id)];
      if (v !== undefined && v !== null && v !== '') ws.getCell(row, col).value = Number(v);
    });
    if (coColumns.length > 0) {
      const first = ws.getColumn(5).letter;
      const last = ws.getColumn(4 + coColumns.length).letter;
      ws.getCell(row, totalCol).value = { formula: `SUM(${first}${row}:${last}${row})` };
    }
    for (let c = 1; c <= statusCol; c += 1) {
      const cell = ws.getCell(row, c);
      cell.border = thinBorder;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: c >= 5 && c <= 4 + coColumns.length ? 'FFFFFBEA' : 'FFF2F2F2' },
      };
      if (c >= 5 && c <= 4 + coColumns.length) cell.alignment = { horizontal: 'center' };
    }
  });
  const lastDataRow = r + students.length;

  // Data validation on marks cells (per configured maximum — never hardcoded).
  // NOTE: applied per-cell — ExcelJS's range-based dataValidations.add() crashes
  // the writer (optimiseDataValidations bug), per-cell addresses are safe.
  coColumns.forEach(({ col, max }) => {
    if (max <= 0 || lastDataRow <= headerRowIndex) return;
    const colLetter = ws.getColumn(col).letter;
    for (let row = headerRowIndex + 1; row <= lastDataRow; row += 1) {
      ws.dataValidations.add(`${colLetter}${row}`, {
        type: 'decimal',
        operator: 'between',
        allowBlank: true,
        formulae: ['0', String(max)],
        showErrorMessage: true,
        errorTitle: 'Invalid mark',
        error: `Value must be between 0 and ${max}.`,
      });
    }
  });

  // Layout: freeze identity columns + header row; sensible widths
  ws.views = [{ state: 'frozen', xSplit: 4, ySplit: headerRowIndex }];
  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 26;
  coColumns.forEach(({ col }) => { ws.getColumn(col).width = 12; });
  ws.getColumn(totalCol).width = 10;
  ws.getColumn(statusCol).width = 12;

  // Instructions sheet
  const ins = workbook.addWorksheet('Instructions');
  ins.getCell('A1').value = 'Instructions';
  ins.getCell('A1').font = { bold: true, size: 14 };
  [
    '1. Do not change student identity columns (S.No, Registration No, Roll No, Name).',
    '2. Enter marks ONLY in the highlighted CO columns.',
    `3. Each CO column shows its maximum for this assessment (${examType}).`,
    '4. Leave a cell blank if the mark is missing — do not enter 0.',
    '5. Do not rename sheets, insert rows above the table, or edit the grey metadata block.',
    '6. Save as .xlsx and upload via Internal Marks → Upload Completed Excel.',
  ].forEach((line, i) => {
    ins.getCell(`A${3 + i}`).value = line;
  });
  ins.getColumn(1).width = 90;

  return { workbook };
};



module.exports = { buildMarksEntryWorkbook, buildMarksFileName, sanitizeFileName: sanitize };
