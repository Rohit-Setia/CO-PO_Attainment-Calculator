// ─────────────────────────────────────────────────────────────────────────────
// Shared spreadsheet-parsing primitives for every bulk importer (teacher import,
// examination allocation import). Extracted from services/teacherImportService.js
// verbatim so the two importers cannot drift apart on header detection, cell
// coercion or CSV handling — the behaviour here is exactly what the teacher import
// has been doing.
// ─────────────────────────────────────────────────────────────────────────────
const ExcelJS = require('exceljs');
const { Readable } = require('stream');

// Header matching — mirrors Frontend/src/utils/excelParser.js norm() convention.
const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/[\s._-]/g, '');

// ExcelJS cell values can be plain strings, Date objects, formula results
// ({ formula, result }) or rich-text arrays — normalize all of them to text.
const cellText = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.result !== undefined) return String(v.result).trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (Array.isArray(v.richText)) return v.richText.map((r) => (r && r.text) || '').join('').trim();
    if (v.hyperlink && v.text) return String(v.text).trim();
    return String(v).trim();
  }
  return String(v).trim();
};

// First non-empty value among the columns that matched a field (a sheet may repeat
// a logical column, e.g. two "Email" headers where only one is filled in).
const readValue = (row, indices) => {
  for (const idx of indices) {
    const text = cellText(row[idx]);
    if (text !== '') return text;
  }
  return '';
};

// field -> [column indices], from an alias map of { field: [normalized aliases] }.
const detectColumns = (headers, aliases) => {
  const mapping = {};
  headers.forEach((cell, idx) => {
    if (cell === null || cell === undefined) return;
    const h = norm(cell);
    if (!h) return;
    for (const [field, names] of Object.entries(aliases)) {
      if (names.includes(h)) {
        if (!mapping[field]) mapping[field] = [];
        mapping[field].push(idx);
      }
    }
  });
  return mapping;
};

// Real sheets carry a title/logo band above the header row, so scan the first rows
// for the one that looks like headers rather than assuming row 1.
const findFirstHeaderRow = (rows, aliases, minRecognized = 2, scanRows = 15) => {
  for (let i = 0; i < Math.min(rows.length, scanRows); i += 1) {
    const mapping = detectColumns(rows[i], aliases);
    const recognized = Object.values(mapping).flat().length;
    if (recognized >= minRecognized) return { index: i, mapping };
  }
  return null;
};

// Loads a workbook (xlsx or csv) into a 2D array of raw cell values.
const loadWorkbookRows = async ({ buffer, filename }) => {
  const workbook = new ExcelJS.Workbook();
  const isCsv = /\.csv$/i.test(filename || '');
  if (isCsv) {
    // csv.read() consumes a stream — wrap the Buffer in a Readable so it is
    // chunked as bytes (a raw Buffer would be iterated byte-by-byte otherwise).
    await workbook.csv.read(Readable.from(buffer));
  } else {
    // xlsx.load() takes a Buffer (xlsx.read() takes a stream).
    await workbook.xlsx.load(buffer);
  }
  const ws = workbook.worksheets[0];
  if (!ws) throw Object.assign(new Error('Workbook has no worksheets.'), { status: 400 });

  const rows = [];
  ws.eachRow((row) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell) => values.push(cell ? cell.value : null));
    rows.push(values);
  });
  return rows;
};

const isEmptyRow = (raw) => raw.every((v) => v === null || v === undefined || String(v).trim() === '');

module.exports = {
  norm, cellText, readValue, detectColumns, findFirstHeaderRow, loadWorkbookRows, isEmptyRow,
};
