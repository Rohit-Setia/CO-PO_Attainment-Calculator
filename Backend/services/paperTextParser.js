// ─────────────────────────────────────────────────────────────────────────────
// Layout-agnostic question-paper parser over plain text. Used for PDFs (pdf-parse text
// layer), as the DOCX fallback when a paper has no Word tables, and for any future OCR
// text. It does not depend on one university template:
//   * column order comes from the paper's own "Q.No / Question / CO / RBT / Marks"
//     header, whether that header is one line (PDF) or one cell per line (DOCX text);
//   * a question row stays open until the next plausible question number, section,
//     header or OR — so questions that wrap over several lines stay whole;
//   * the CO/RBT/marks tail is matched anchored to the END of the row, so "CO2" inside a
//     chemistry question is never mistaken for the mapped CO;
//   * a row whose tail cannot be matched against the header is flagged
//     ROW_PARSE_UNCERTAIN for the reviewer instead of being silently accepted.
// ─────────────────────────────────────────────────────────────────────────────
const {
  collapse, readRbt, readCo, readMarks, normalizeSectionCode,
  readMarksFormula, readChoice, readGeneralInstructions, readDurationMinutes,
} = require('./paperTokens');

const COLUMN_PATTERNS = [
  ['QNO', /\b(?:Q(?:uestion)?\s*\.?\s*(?:No|Number|#)\.?|S\.?\s*No\.?)(?=\s|$|[|:])/i],
  ['RBT', /\b(?:RBT(?:\s*Level)?|Bloom'?s?(?:\s*Taxonomy)?(?:\s*Level)?|BTL|BL|K\s*-?\s*Level|Cognitive\s*Level|Level)\b/i],
  ['CO', /\b(?:Course\s*Outcomes?|COs?(?:\s*No\.?)?|Mapped\s*CO)\b/i],
  ['MARKS', /\b(?:Max(?:imum)?\.?\s*)?Marks?\b/i],
  ['TEXT', /\bQuestions?\b(?!\s*(?:No|Number|#))/i],
];

// Returns the ordered column kinds when the line consists ONLY of column labels.
const readHeaderColumns = (line) => {
  let rest = line;
  const found = [];
  for (;;) {
    let best = null;
    for (const [kind, pattern] of COLUMN_PATTERNS) {
      if (found.some((f) => f.kind === kind)) continue;
      const match = rest.match(pattern);
      if (match && (!best || match.index < best.index)) best = { kind, index: match.index, length: match[0].length };
    }
    if (!best) break;
    found.push(best);
    rest = rest.slice(0, best.index) + ' '.repeat(best.length) + rest.slice(best.index + best.length);
  }
  if (found.length === 0 || /[A-Za-z0-9]/.test(rest)) return null;
  return found.sort((a, b) => a.index - b.index).map((f) => f.kind);
};

const CO_ONE = 'C\\s*[O0]\\s*[-–.:]?\\s*\\d{1,2}(?!\\d)';
const RBT_CODE = '(?:B?T?L|K)\\s*[-.]?\\s*[1-6]';
const TOKEN_SOURCES = {
  CO: `(?<co>${CO_ONE}(?:\\s*(?:,|/|&|and)\\s*${CO_ONE})*)`,
  RBT: `(?<rbt>(?:\\(?\\s*${RBT_CODE}\\s*\\)?\\s*[-–]?\\s*)?[A-Za-z]{3,14}(?:\\s*\\(\\s*${RBT_CODE}\\s*\\))?|${RBT_CODE})`,
  MARKS: `(?<marks>[[(]?\\d{1,3}(?:\\.\\d{1,2})?\\s*(?:marks?|m)?[\\])]?)`,
};

const rowRegexCache = new Map();
const buildRowRegex = (columns) => {
  const key = columns.join(',');
  if (!rowRegexCache.has(key)) {
    const textIndex = columns.indexOf('TEXT');
    const pre = columns.slice(0, textIndex).map((c) => TOKEN_SOURCES[c]);
    const post = columns.slice(textIndex + 1).map((c) => TOKEN_SOURCES[c]);
    const source = `^${pre.map((p) => `${p}\\s+`).join('')}(?<text>.+?)${post.map((p) => `\\s+${p}`).join('')}$`;
    rowRegexCache.set(key, new RegExp(source, 'i'));
  }
  return rowRegexCache.get(key);
};

// Tried, in order, when the paper has no usable header or a row does not fit it.
const FALLBACK_LAYOUTS = [
  ['TEXT', 'CO', 'RBT', 'MARKS'],
  ['TEXT', 'MARKS', 'CO', 'RBT'],
  ['TEXT', 'CO', 'RBT'],
  ['TEXT', 'RBT', 'CO', 'MARKS'],
  ['TEXT', 'RBT', 'CO'],
];

const INLINE_MARKS_RE = /\s*(?:\[\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:marks?|m)?\s*\]|\(\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:marks?|m)\s*\))\s*$/i;

const matchLayout = (columns, body) => {
  if (!columns.includes('TEXT')) return null;
  const match = body.match(buildRowRegex(columns));
  if (!match) return null;
  const { groups } = match;
  if (groups.rbt !== undefined && !readRbt(groups.rbt)?.value) return null;
  if (groups.co !== undefined && readCo(groups.co)?.value === undefined) return null;
  if (groups.marks !== undefined && !readMarks(groups.marks)?.value) return null;
  return groups;
};

// → { text, co, rbt, marks, matched: 'header'|'fallback'|null }
const parseRowText = (layout, rawText) => {
  const body = collapse(rawText);
  const columns = layout ? layout.filter((c) => c !== 'QNO') : null;
  let groups = null;
  let matched = null;

  if (columns && columns.includes('TEXT')) {
    if (columns.length === 1) {
      groups = { text: body };
      matched = 'header';
    } else {
      groups = matchLayout(columns, body);
      if (groups) matched = 'header';
    }
  }
  if (!groups) {
    for (const candidate of FALLBACK_LAYOUTS) {
      groups = matchLayout(candidate, body);
      if (groups) { matched = 'fallback'; break; }
    }
  }
  if (!groups) groups = { text: body };

  let text = collapse(groups.text);
  let marks = groups.marks !== undefined ? { ...readMarks(groups.marks), source: 'paper' } : null;
  const inline = text.match(INLINE_MARKS_RE);
  if (inline && !marks) {
    marks = { value: Number(inline[1] || inline[2]), raw: inline[0].trim(), source: 'paper' };
    text = text.slice(0, inline.index).trim();
  }
  return {
    text,
    co: groups.co !== undefined ? readCo(groups.co) : null,
    rbt: groups.rbt !== undefined ? readRbt(groups.rbt) : null,
    marks,
    matched,
  };
};

const SUB_MARKER_RE = /(?:^|\s)(?:\(\s*([a-z]|[ivx]{1,4})\s*\)|([a-z])\))\s+/gi;

// "1 (a) Define X. CO1 Remember (b) Explain Y. CO2 Understand" → two rows, but ONLY when
// every sub-part carries its own tail — "(i) Describe… (ii) Differentiate… CO1 Remember"
// is one question with one mapping and stays whole.
const splitSubParts = (layout, text) => {
  const columns = layout ? layout.filter((c) => c !== 'QNO') : null;
  if (columns && !columns.some((c) => c === 'CO' || c === 'RBT' || c === 'MARKS')) return null;
  const markers = [...text.matchAll(SUB_MARKER_RE)];
  if (markers.length < 2) return null;
  const stem = text.slice(0, markers[0].index).trim();
  const parts = markers.map((marker, i) => {
    const start = marker.index + marker[0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
    return { sub: (marker[1] || marker[2]).toLowerCase(), body: text.slice(start, end).trim() };
  });
  const parsed = parts.map((part) => ({ ...part, row: parseRowText(layout, part.body) }));
  if (!parsed.every((p) => p.row.matched && (p.row.co || p.row.rbt || p.row.marks))) return null;
  return parsed.map((p) => ({
    sub: p.sub,
    row: { ...p.row, text: collapse(`${stem} (${p.sub}) ${p.row.text}`) },
  }));
};

const SECTION_HEADING_RE = /^(?:SECTION|Section|SEC|Sec|PART|Part)\s*[-–—:.]?\s*([A-Z]|[IVX]{1,4}|\d{1,2})(?![A-Za-z0-9])\s*[:.\-–—]?\s*(.*)$/;
const QUESTION_START_RE = /^(?:Q(?:uestion)?\s*[.\-]?\s*)?(\d{1,2})(?:\s*[.):]\s*|\s+|(?=\()|$)(?:\(\s*([a-z]|[ivx]{1,4})\s*\)\s*)?(.*)$/i;
const SUB_START_RE = /^(?:\(\s*([a-z]|[ivx]{1,4})\s*\)|([a-z])\))\s+(.*)$/i;
const OR_RE = /^[-–—\s]*\(?\s*OR\s*\)?[-–—\s]*$/i;
const NOISE_RE = /^(?:--\s*\d+\s*of\s*\d+\s*--|page\s*\d+(?:\s*of\s*\d+)?|p\.?\s*t\.?\s*o\.?|[*_=\-–—.\s]{3,}|end\s+of\s+(?:the\s+)?(?:question\s+)?paper.*|(?:best\s+of\s+luck|all\s+the\s+best)[.!]*)$/i;

const META_LABELS = [
  ['school', /School\s*Name|School\s*:/gi],
  ['department', /Department(?:\s*Name)?|Dept\.?\s*:/gi],
  ['program', /Program(?:me)?(?:\s*Name)?/gi],
  ['semester', /Semester|Sem\.?\s*:/gi],
  ['subjectCode', /(?:Subject|Course|Paper)\s*Code/gi],
  ['subjectName', /(?:Subject|Course|Paper)\s*(?:Name|Title)|Subject\s*:/gi],
  ['maxMarks', /Max(?:imum)?\.?\s*Marks|Total\s*Marks/gi],
  ['duration', /Duration|Time\s*Allowed|Time\s*:/gi],
  ['paperSet', /Q\.?\s*P\.?\s*Set|Paper\s*Set/gi],
  [null, /Registration\s*No\.?|Roll\s*No\.?|Exam\s*Seat\s*No\.?|Date\s*:/gi],
];

const readMeta = (headerLines) => {
  const blob = headerLines.join(' | ');
  const hits = [];
  for (const [field, pattern] of META_LABELS) {
    for (const match of blob.matchAll(pattern)) {
      hits.push({ field, index: match.index, end: match.index + match[0].length });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const raw = {};
  hits.forEach((hit, i) => {
    if (!hit.field || raw[hit.field] !== undefined) return;
    const next = hits.slice(i + 1).find((h) => h.index >= hit.end);
    const value = blob.slice(hit.end, next ? next.index : blob.length)
      .split('|').map((part) => part.replace(/^[\s:.\-–]+|[\s:\-–]+$/g, '').replace(/\.{3,}/g, '').trim())
      .find(Boolean);
    if (value) raw[hit.field] = value;
  });

  const examLine = headerLines.find((line) => /\bEXAMINATION\b|\bEXAM\b|\bTEST\b/i.test(line) && !/Seat|Registration/i.test(line));
  const maxMarks = raw.maxMarks ? Number((raw.maxMarks.match(/\d{1,3}(?:\.\d{1,2})?/) || [])[0]) : null;
  return {
    examName: examLine ? collapse(examLine) : null,
    school: raw.school || null,
    department: raw.department || null,
    program: raw.program || null,
    semester: raw.semester || null,
    subjectCode: raw.subjectCode ? raw.subjectCode.split(/\s+/)[0] : null,
    subjectName: raw.subjectName || null,
    maxMarks: Number.isFinite(maxMarks) && maxMarks > 0 ? maxMarks : null,
    durationMinutes: readDurationMinutes(raw.duration),
    paperSet: raw.paperSet ? raw.paperSet.replace(/[[\]()]/g, '').trim() || null : null,
  };
};

// Shared with the DOCX table parser: resolves per-question marks from the section
// instruction, choice groups, and the numbers the review screen cross-checks.
const resolveSectionStructure = (sections, questions, general) => sections.map((section) => {
  const { code } = section;
  const rows = questions.filter((q) => q.section === code);
  const instruction = collapse((section.instructionLines || []).join(' '));
  const formula = readMarksFormula(instruction);
  const generalEntry = code ? general.get(code) : null;
  const choice = readChoice(instruction) || generalEntry?.choice || null;
  const questionCount = new Set(rows.map((q) => q.number)).size;
  const attempt = choice ? choice.attempt : questionCount;
  const generalMarks = generalEntry?.marksPerQuestion ?? null;

  let marksPerQuestion = null;
  let expectedCount = choice?.offered ?? null;
  let ambiguous = false;
  let conflict = false;
  if (formula && formula.consistent) {
    const { a, b } = formula;
    let perQuestion = null;
    let count = null;
    // "(2 × 5 = 10)": templates disagree on which factor is marks. An explicit "each
    // question carries N marks" decides first; failing that, the factor matching the
    // questions actually found; otherwise refuse to guess. (Count comes second because a
    // missed question would otherwise flip the answer.)
    if (generalMarks !== null && (generalMarks === a || generalMarks === b)) {
      perQuestion = generalMarks;
      count = generalMarks === a ? b : a;
    } else if (a === b || b === attempt) {
      perQuestion = a;
      count = b;
    } else if (a === attempt) {
      perQuestion = b;
      count = a;
    } else {
      ambiguous = true;
    }
    marksPerQuestion = perQuestion;
    if (count !== null && !choice) expectedCount = count;
    if (perQuestion !== null && generalMarks !== null && generalMarks !== perQuestion) conflict = true;
  } else if (generalMarks !== null) {
    marksPerQuestion = generalMarks;
  }

  const offered = choice?.offered ?? questionCount;
  for (const q of rows) {
    if (q.marks?.source === 'paper' && q.marks.value) {
      if (marksPerQuestion !== null && !q.sub && q.marks.value !== marksPerQuestion) q.flags.push('MARKS_CONFLICT');
    } else if (marksPerQuestion !== null && !q.sub) {
      q.marks = { value: marksPerQuestion, source: 'instruction', raw: formula?.raw || generalEntry?.raw?.[0] || null };
      if (conflict) q.flags.push('MARKS_CONFLICT');
    }
    if (choice && choice.attempt < offered) q.choiceGroup = `Section-${code || 'X'}`.slice(0, 20);
  }

  return {
    code,
    title: section.title || (code ? `Section ${code}` : null),
    instruction: instruction || null,
    formula: formula ? { ...formula } : null,
    choice,
    marksPerQuestion,
    questionCount,
    expectedCount,
    ambiguous,
    conflict,
  };
});

const toLines = (text) => String(text || '')
  .split(/\r?\n/)
  .map((line) => collapse(line.replace(/\t/g, ' ')))
  .filter((line) => line && !NOISE_RE.test(line));

const parsePaperText = (rawText) => {
  const lines = toLines(rawText);
  const isHeading = (line) => SECTION_HEADING_RE.test(line);
  const isHeaderStart = (line) => {
    const cols = readHeaderColumns(line);
    return !!cols && cols.includes('QNO');
  };
  let bodyStart = lines.findIndex((line) => isHeading(line) || isHeaderStart(line));
  if (bodyStart < 0) bodyStart = lines.findIndex((line) => /^(?:Q\s*\.?\s*)?1(?:[.):]|\s)/i.test(line));
  const preamble = bodyStart >= 0 ? lines.slice(0, bodyStart) : lines;
  const instructionsAt = preamble.findIndex((line) => /^(?:general\s+)?instructions?\b/i.test(line));
  const meta = readMeta(instructionsAt >= 0 ? preamble.slice(0, instructionsAt) : preamble);
  const general = readGeneralInstructions(preamble);

  const sections = [];
  const rawRows = [];
  const notes = [];
  let section = null;
  let layout = null;
  let headerSeen = false;
  let assembling = null;
  let row = null;
  let pendingOr = false;

  const currentSection = () => {
    if (!section) {
      section = { code: null, title: null, instructionLines: [] };
      sections.push(section);
    }
    return section;
  };
  const lastNumber = () => {
    if (row) return row.number;
    const previous = rawRows.filter((r) => r.section === section);
    return previous.length ? previous[previous.length - 1].number : null;
  };
  const previousSectionLast = () => {
    const earlier = rawRows.filter((r) => r.section !== section);
    return earlier.length ? earlier[earlier.length - 1].number : null;
  };
  const rowSatisfied = () => !!row && parseRowText(layout, row.parts.join(' ')).matched !== null;
  const closeRow = () => {
    if (row && row.parts.join('').trim()) rawRows.push(row);
    row = null;
  };
  const openRow = (number, sub, rest) => {
    closeRow();
    row = { section: currentSection(), number, sub, parts: [], or: pendingOr, layout };
    pendingOr = false;
    if (rest) row.parts.push(sub ? `(${sub}) ${rest}` : rest);
    else if (sub) row.parts.push(`(${sub})`);
  };

  const isPlausibleStart = (number, sub) => {
    const columns = layout ? layout.filter((c) => c !== 'QNO') : [];
    if (row && row.parts.length > 0 && columns.includes('MARKS') && !rowSatisfied()) return false;
    const last = lastNumber();
    if (last === null) {
      const carried = previousSectionLast();
      return headerSeen || number === 1 || (carried !== null && number === carried + 1);
    }
    if (sub && number === last) return true;
    if (number === last + 1) return true;
    if (number === last + 2 && rowSatisfied()) {
      notes.push(`Question numbering jumps from ${last} to ${number}${section?.code ? ` in Section ${section.code}` : ''} — check for a missed question.`);
      return true;
    }
    return false;
  };

  for (const line of bodyStart >= 0 ? lines.slice(bodyStart) : []) {
    if (assembling) {
      const cols = readHeaderColumns(line);
      if (cols && cols.length === 1 && !assembling.includes(cols[0])) { assembling.push(cols[0]); continue; }
      layout = assembling;
      assembling = null;
    }

    const heading = line.match(SECTION_HEADING_RE);
    if (heading && heading[1].toUpperCase() !== section?.code) {
      closeRow();
      section = { code: normalizeSectionCode(heading[1]), title: line, instructionLines: heading[2] ? [heading[2]] : [] };
      sections.push(section);
      continue;
    }

    const cols = readHeaderColumns(line);
    if (cols && cols.includes('QNO')) {
      closeRow();
      headerSeen = true;
      if (cols.length === 1) assembling = ['QNO'];
      else layout = cols;
      continue;
    }
    if (OR_RE.test(line)) {
      closeRow();
      pendingOr = true;
      continue;
    }

    const start = line.match(QUESTION_START_RE);
    if (start && isPlausibleStart(Number(start[1]), start[2]?.toLowerCase() || null)) {
      openRow(Number(start[1]), start[2]?.toLowerCase() || null, start[3]);
      continue;
    }
    const subStart = line.match(SUB_START_RE);
    if (subStart && row && rowSatisfied()) {
      openRow(row.number, (subStart[1] || subStart[2]).toLowerCase(), subStart[3]);
      continue;
    }
    if (row) {
      row.parts.push(line);
      continue;
    }
    currentSection().instructionLines.push(line);
  }
  closeRow();

  const questions = [];
  for (const raw of rawRows) {
    const text = collapse(raw.parts.join(' '));
    const expectsTail = !!raw.layout && raw.layout.some((c) => c === 'CO' || c === 'RBT');
    const split = raw.sub ? null : splitSubParts(raw.layout, text);
    const pieces = split || [{ sub: raw.sub, row: parseRowText(raw.layout, raw.sub ? text.replace(/^\(\s*[a-z]+\s*\)\s*/i, '') : text) }];
    for (const piece of pieces) {
      const flags = [];
      if (expectsTail && piece.row.matched !== 'header') flags.push('ROW_PARSE_UNCERTAIN');
      const questionText = raw.sub && !split ? collapse(`(${piece.sub}) ${piece.row.text}`) : piece.row.text;
      questions.push({
        section: raw.section.code,
        number: raw.number,
        sub: piece.sub || null,
        label: piece.sub ? `${raw.number}(${piece.sub})` : String(raw.number),
        questionText,
        co: piece.row.co,
        rbt: piece.row.rbt,
        marks: piece.row.marks?.value ? piece.row.marks : null,
        choiceGroup: null,
        orWithPrevious: raw.or,
        flags,
      });
    }
  }

  const structure = resolveSectionStructure(sections.filter((s) => questions.some((q) => q.section === s.code)), questions, general);

  // "Q1 … OR … Q2" internal choice: the pair share a choice group unless the whole
  // section is already a choice group.
  questions.forEach((q, i) => {
    if (!q.orWithPrevious || i === 0 || q.choiceGroup) return;
    const previous = questions[i - 1];
    const group = previous.choiceGroup || `${previous.section || 'Q'}-OR-${previous.label}`.slice(0, 20);
    previous.choiceGroup = group;
    q.choiceGroup = group;
  });
  questions.forEach((q) => { delete q.orWithPrevious; });

  if (!headerSeen && questions.length > 0) notes.push('No Q.No / Question / CO / RBT column header was found — columns were inferred from each row.');

  return { meta, sections: structure, questions, notes };
};

module.exports = { parsePaperText, resolveSectionStructure, readHeaderColumns, parseRowText };
