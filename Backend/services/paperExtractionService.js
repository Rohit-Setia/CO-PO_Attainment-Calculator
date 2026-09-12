// ─────────────────────────────────────────────────────────────────────────────
// Question-paper extraction. Deterministic, rule-based reading of the paper's OWN
// structure — CO/RBT values are only ever taken from what the paper prints. Filling in a
// CO/RBT the paper does not give is a separate, explicitly-labelled suggestion step
// (coRbtSuggestionService) whose output the reviewer must accept on the Auto-Mapping
// Review screen; nothing here guesses.
//
//   DOCX  — Word tables (cell structure, high confidence); falls back to the text parser
//           when the paper has no tables.
//   XLSX/CSV — header row + columns (high confidence).
//   PDF   — text layer through the layout-agnostic text parser (low confidence: a PDF has
//           no real cells, so every row is shown for review). Scanned PDFs/images have no
//           text layer and are reported as such rather than half-read.
//
// Returns { status: 'extracted', format, confidence, meta, sections, questions, notes }
// or { status: 'failed', format, error }. Never throws past this module.
// Each question: { section, number, sub, label, questionText, co, rbt, marks,
// choiceGroup, flags } — co/rbt are paperTokens readings ({ value, raw, kind }).
// ─────────────────────────────────────────────────────────────────────────────
const mammoth = require('mammoth');
const cheerio = require('cheerio');
const ExcelJS = require('exceljs');
const {
  collapse, readRbt, readCo, readMarks, readQuestionLabel, normalizeSectionCode,
  readGeneralInstructions, readDurationMinutes,
} = require('./paperTokens');
const { parsePaperText, resolveSectionStructure, readHeaderColumns } = require('./paperTextParser');

const failed = (format, error) => ({ status: 'failed', format, error });

const isComplete = (q) => q.co?.value && q.rbt?.value && q.marks?.value && q.flags.length === 0;

const finish = ({ format, meta, sections, questions, notes = [], structural }) => {
  if (questions.length === 0) {
    return failed(format, 'No recognizable question rows were found in this document.');
  }
  return {
    status: 'extracted',
    format,
    confidence: structural && questions.every(isComplete) ? 'high' : 'low',
    meta,
    sections,
    questions,
    notes,
  };
};

// Column kind for a single header cell ("Q.No." → QNO, "RBT Level" → RBT, …).
const classifyHeaderCell = (cell) => {
  if (/^section$/i.test(collapse(cell))) return 'SECTION';
  const kinds = readHeaderColumns(collapse(cell));
  return kinds && kinds.length === 1 ? kinds[0] : null;
};

const readColumns = (cells) => {
  const columns = {};
  cells.forEach((cell, index) => {
    const kind = classifyHeaderCell(cell);
    if (kind && columns[kind] === undefined) columns[kind] = index;
  });
  return columns.QNO !== undefined && (columns.CO !== undefined || columns.RBT !== undefined) ? columns : null;
};

const buildQuestion = ({ cells, columns, section, extraFlags = [] }) => {
  const labelInfo = readQuestionLabel(cells[columns.QNO]);
  const textIndex = columns.TEXT !== undefined
    ? columns.TEXT
    : cells.findIndex((cell, i) => !Object.values(columns).includes(i) && collapse(cell).length > 8);
  const marks = columns.MARKS !== undefined ? readMarks(cells[columns.MARKS]) : null;
  const rowSection = columns.SECTION !== undefined ? normalizeSectionCode(cells[columns.SECTION]) : null;
  return {
    section: rowSection || section,
    number: labelInfo.number,
    sub: labelInfo.sub,
    label: labelInfo.label,
    questionText: textIndex >= 0 ? collapse(cells[textIndex]) : '',
    co: columns.CO !== undefined ? readCo(cells[columns.CO], { allowBareNumber: true }) : null,
    rbt: columns.RBT !== undefined ? readRbt(cells[columns.RBT]) : null,
    marks: marks?.value ? { ...marks, source: 'paper' } : null,
    choiceGroup: null,
    flags: [...extraFlags],
  };
};

// ── DOCX ─────────────────────────────────────────────────────────────────────
const META_LABEL_MAP = {
  'school name': 'school', school: 'school', department: 'department',
  program: 'program', programme: 'program', semester: 'semester',
  'subject code': 'subjectCode', 'course code': 'subjectCode', 'paper code': 'subjectCode',
  'subject name': 'subjectName', 'course name': 'subjectName', 'course title': 'subjectName',
  'max marks': 'maxMarks', 'maximum marks': 'maxMarks', 'total marks': 'maxMarks',
  duration: 'duration', time: 'duration',
};

const extractFromDocx = async (buffer) => {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const $ = cheerio.load(html);
  const rowCells = (row) => $(row).find('td,th').map((_, cell) => collapse($(cell).text())).get();

  const rawMeta = {};
  let examName = null;
  const preambleLines = [];
  const sections = [];
  const questions = [];
  let section = null;
  let metaTableRead = false;

  $('body').children().each((_, el) => {
    if (el.tagName === 'p') {
      const text = collapse($(el).text());
      if (!text) return;
      const heading = text.match(/^(?:Section|Part)\s*[-–:]?\s*([A-Z]|[IVX]{1,4}|\d{1,2})\s*$/i);
      if (heading) {
        section = { code: normalizeSectionCode(heading[1]), title: text, instructionLines: [] };
        sections.push(section);
      } else if (section) {
        section.instructionLines.push(text);
      } else {
        preambleLines.push(text);
        if (!examName && /\bEXAMINATION\b|\bEXAM\b/i.test(text) && !/Seat|Registration/i.test(text)) examName = text;
      }
      return;
    }
    if (el.tagName !== 'table') return;

    const rows = $(el).find('tr').toArray();
    let headerAt = -1;
    let columns = null;
    for (let i = 0; i < Math.min(rows.length, 4); i += 1) {
      columns = readColumns(rowCells(rows[i]));
      if (columns) { headerAt = i; break; }
    }

    // Headerless question table: "Q1 | question text | 2 | CO1 | Remember".
    if (!columns && rows.length >= 1) {
      const sample = rowCells(rows[0]);
      const co = sample.findIndex((cell) => readCo(cell)?.value);
      const marks = sample.findIndex((cell, i) => i !== co && /^\d+(?:\.\d+)?$/.test(cell));
      if (readQuestionLabel(sample[0]) && co >= 0) {
        columns = { QNO: 0, TEXT: 1, CO: co, ...(marks >= 0 ? { MARKS: marks } : {}), ...(sample[co + 1] ? { RBT: co + 1 } : {}) };
      }
    }

    if (!columns) {
      // The paper's own metadata table (School / Program / Subject Code / Max Marks…).
      if (!metaTableRead && !section) {
        rows.forEach((tr) => {
          const cells = rowCells(tr);
          for (let i = 0; i + 1 < cells.length; i += 2) {
            const field = META_LABEL_MAP[cells[i].replace(/:$/, '').trim().toLowerCase()];
            if (field && rawMeta[field] === undefined) rawMeta[field] = cells[i + 1];
          }
        });
        metaTableRead = true;
      }
      return;
    }

    if (!section) {
      section = { code: null, title: null, instructionLines: [] };
      sections.push(section);
    }
    rows.slice(0, Math.max(headerAt, 0)).forEach((tr) => section.instructionLines.push(rowCells(tr).join(' ')));

    for (const tr of rows.slice(headerAt + 1)) {
      const cells = rowCells(tr);
      if (cells.every((cell) => !cell)) continue;
      if (readQuestionLabel(cells[columns.QNO])) {
        questions.push(buildQuestion({ cells, columns, section: section.code }));
        continue;
      }
      // Row without its own Q.No: a merged-cell continuation of the previous question.
      const previous = questions[questions.length - 1];
      const extra = cells.filter((cell, i) => i !== columns.QNO && cell).join(' ');
      if (previous && extra) {
        previous.questionText = collapse(`${previous.questionText} ${extra}`);
        if (!previous.flags.includes('ROW_PARSE_UNCERTAIN')) previous.flags.push('ROW_PARSE_UNCERTAIN');
      }
    }
  });

  if (questions.length === 0) {
    // No Word tables — the questions are plain paragraphs, so read the text instead.
    const { value: text } = await mammoth.extractRawText({ buffer });
    const parsed = parsePaperText(text);
    return finish({ format: 'docx-text', ...parsed, structural: false, notes: ['No question table was found in this Word file — questions were read from its text.', ...parsed.notes] });
  }

  const general = readGeneralInstructions(preambleLines);
  const structure = resolveSectionStructure(sections.filter((s) => questions.some((q) => q.section === s.code)), questions, general);
  const maxMarks = rawMeta.maxMarks ? Number((rawMeta.maxMarks.match(/\d{1,3}(?:\.\d{1,2})?/) || [])[0]) : null;
  const meta = {
    examName,
    school: rawMeta.school || null,
    department: rawMeta.department || null,
    program: rawMeta.program || null,
    semester: rawMeta.semester || null,
    subjectCode: rawMeta.subjectCode || null,
    subjectName: rawMeta.subjectName || null,
    maxMarks: Number.isFinite(maxMarks) && maxMarks > 0 ? maxMarks : null,
    durationMinutes: readDurationMinutes(rawMeta.duration),
    paperSet: null,
  };
  return finish({ format: 'docx', meta, sections: structure, questions, structural: true });
};

// ── XLSX / CSV ───────────────────────────────────────────────────────────────
const cellText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
  if (value.result !== undefined) return String(value.result);
  if (value.text !== undefined) return String(value.text);
  return '';
};

const extractFromTabular = async (buffer, isCsv) => {
  const format = isCsv ? 'csv' : 'xlsx';
  const workbook = new ExcelJS.Workbook();
  if (isCsv) await workbook.csv.read(require('stream').Readable.from(buffer));
  else await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return failed(format, 'No worksheet found in the uploaded file.');

  const rowValues = (r) => sheet.getRow(r).values.slice(1).map((v) => collapse(cellText(v)));
  let headerAt = -1;
  let columns = null;
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    columns = readColumns(rowValues(r));
    if (columns) { headerAt = r; break; }
  }
  if (!columns) return failed(format, 'Could not find a header row with recognizable Q.No and CO/RBT columns.');

  const questions = [];
  for (let r = headerAt + 1; r <= sheet.rowCount; r += 1) {
    const cells = rowValues(r);
    if (!readQuestionLabel(cells[columns.QNO])) continue;
    questions.push(buildQuestion({ cells, columns, section: null }));
  }
  const codes = [...new Set(questions.map((q) => q.section))];
  const sections = codes.map((code) => ({ code, title: code ? `Section ${code}` : null, instructionLines: [] }));
  const structure = resolveSectionStructure(sections, questions, new Map());
  return finish({ format, meta: {}, sections: structure, questions, structural: true });
};

// ── PDF ──────────────────────────────────────────────────────────────────────
const extractFromPdf = async (buffer) => {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const { text } = await parser.getText();
    const readable = collapse(String(text || '').replace(/--\s*\d+\s*of\s*\d+\s*--/g, ''));
    if (readable.length < 40) {
      return failed('pdf', 'This PDF has no readable text layer (it appears to be scanned). Upload the DOCX or a text-based PDF of the paper, or use the manual Question Paper Configuration form.');
    }
    const parsed = parsePaperText(text);
    return finish({ format: 'pdf', ...parsed, structural: false, notes: ['A PDF has no table cells — columns were inferred from the text layout.', ...parsed.notes] });
  } finally {
    await parser.destroy();
  }
};

const extractQuestionPaper = async (buffer, mimeType, originalName) => {
  const ext = (originalName || '').split('.').pop().toLowerCase();
  try {
    if (mimeType?.includes('wordprocessingml') || ext === 'docx') return await extractFromDocx(buffer);
    if (mimeType?.includes('spreadsheetml') || mimeType?.includes('ms-excel') || ['xlsx', 'xls'].includes(ext)) return await extractFromTabular(buffer, false);
    if (mimeType?.includes('csv') || ext === 'csv') return await extractFromTabular(buffer, true);
    if (mimeType === 'application/pdf' || ext === 'pdf') return await extractFromPdf(buffer);
    if (mimeType?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
      return failed('image', 'Image uploads need OCR, which is not enabled on this server. Upload the paper as DOCX or a text-based PDF, or use the manual Question Paper Configuration form.');
    }
    return failed(ext || 'unknown', `Automatic extraction is not supported for this file type (${mimeType || ext}). Use the manual Question Paper Configuration form instead.`);
  } catch (err) {
    return failed(ext || 'unknown', `Extraction failed: ${err.message}`);
  }
};

module.exports = { extractQuestionPaper };
