// ─────────────────────────────────────────────────────────────────────────────
// Auto-Mapping Review rules — the single authority on what the review screen marks as
// "Needs Review" and on whether a draft may be published. The frontend renders these
// verdicts; it does not re-implement them.
//
// Every CO / RBT / marks value carries a source:
//   paper         printed in the question's own row
//   instruction   (marks only) derived from the section instruction, e.g. "(2 × 5 = 10 Marks)"
//   manual        entered or changed by the reviewer
//   ai|heuristic  a suggestion the reviewer ACCEPTED — never set without that action
//
// Errors block Confirm & Publish; warnings and info are shown (warnings are repeated in
// the confirmation dialog).
//   R1  Every row needs a CO, an RBT level and marks (CO_MISSING / RBT_MISSING / MARKS_MISSING).
//   R2  A suggestion never fills a value by itself — it waits beside the row until accepted.
//   R3  Whatever the reader had to reinterpret must be looked at by a person: C01 → CO1
//       (CO_NORMALIZED), a row that did not line up with the paper's columns
//       (ROW_PARSE_UNCERTAIN), marks that disagree with the section instruction
//       (MARKS_CONFLICT), a CO the course does not have (CO_UNKNOWN). These clear when the
//       reviewer ticks "Checked" for the row, or replaces the value.
//   R4  RBT spelling fixes (Rember → Remember) are shown but do not block (RBT_NORMALIZED).
//   R5  Question text must not be empty; section + question number must be unique.
//   R6  Paper-level cross-checks are warnings: question count vs the section instruction,
//       attemptable total vs Max Marks, subject code vs the selected course, and text-layout
//       (PDF) extraction. Only "no questions" / "too many questions" block.
// ─────────────────────────────────────────────────────────────────────────────
const { RBT_LEVELS, collapse, readCo } = require('./paperTokens');

const DRAFT_VERSION = 1;
const SUGGESTION_SOURCES = ['ai', 'heuristic'];

const httpError = (status, message) => Object.assign(new Error(message), { status });

const buildDraft = (extraction) => ({
  version: DRAFT_VERSION,
  revision: 1,
  format: extraction.format,
  confidence: extraction.confidence,
  meta: {
    examName: null, school: null, department: null, program: null, semester: null,
    subjectCode: null, subjectName: null, maxMarks: null, durationMinutes: null, paperSet: null,
    ...(extraction.meta || {}),
  },
  sections: extraction.sections || [],
  notes: extraction.notes || [],
  suggestionRun: null,
  rows: extraction.questions.map((q, index) => ({
    key: `r${index + 1}`,
    section: q.section || null,
    label: q.label,
    questionText: q.questionText || '',
    maxMarks: q.marks?.value ?? null,
    marksSource: q.marks?.value ? q.marks.source : null,
    coNumber: q.co?.value ?? null,
    coSource: q.co?.value ? 'paper' : null,
    rbtLevel: q.rbt?.value ?? null,
    rbtSource: q.rbt?.value ? 'paper' : null,
    choiceGroup: q.choiceGroup || null,
    extracted: {
      questionText: q.questionText || '',
      maxMarks: q.marks?.value ?? null,
      marksSource: q.marks?.value ? q.marks.source : null,
      marksRaw: q.marks?.raw || null,
      coNumber: q.co?.value ?? null,
      coRaw: q.co?.raw || null,
      coKind: q.co?.kind || null,
      rbtLevel: q.rbt?.value ?? null,
      rbtRaw: q.rbt?.raw || null,
      rbtKind: q.rbt?.kind || null,
    },
    flags: [...(q.flags || [])],
    suggestion: null,
    reviewed: false,
    removed: false,
    manual: false,
  })),
});

// Rows the suggestion engine should look at: only values the paper did not give.
const suggestionItems = (draft) => draft.rows
  .filter((row) => !row.removed && (row.coNumber === null || !row.rbtLevel) && row.questionText.trim())
  .map((row) => ({
    key: row.key,
    section: row.section,
    label: row.label,
    questionText: row.questionText,
    maxMarks: row.maxMarks,
    needs: { co: row.coNumber === null, rbt: !row.rbtLevel },
  }));

const attachSuggestions = (draft, result) => {
  const next = structuredClone(draft);
  next.rows.forEach((row) => {
    if (result.suggestions[row.key]) row.suggestion = result.suggestions[row.key];
  });
  next.suggestionRun = {
    engine: result.engine,
    model: result.model || null,
    error: result.error || null,
    count: Object.keys(result.suggestions).length,
    at: new Date().toISOString(),
  };
  return next;
};

// ── Applying reviewer edits ──────────────────────────────────────────────────
const toCoNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : readCo(value, { allowBareNumber: true })?.value;
  if (!Number.isInteger(number) || number < 1 || number > 99) throw httpError(400, `"${value}" is not a valid CO.`);
  return number;
};

const toRbtLevel = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const level = RBT_LEVELS.find((l) => l.toLowerCase() === String(value).trim().toLowerCase());
  if (!level) throw httpError(400, `"${value}" is not an RBT level (${RBT_LEVELS.join(', ')}).`);
  return level;
};

const toMarks = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1000 || Math.round(number * 100) !== number * 100) {
    throw httpError(400, `"${value}" is not a valid marks value.`);
  }
  return number;
};

const sourceFor = ({ value, extractedValue, extractedSource, suggestion, field, claimed }) => {
  if (value === null) return null;
  if (extractedValue !== null && extractedValue !== undefined && value === extractedValue) return extractedSource;
  if (SUGGESTION_SOURCES.includes(claimed) && suggestion?.engine === claimed && suggestion[field] === value) return claimed;
  return 'manual';
};

const newManualRow = (key) => ({
  key, section: null, label: '', questionText: '',
  maxMarks: null, marksSource: null, coNumber: null, coSource: null, rbtLevel: null, rbtSource: null,
  choiceGroup: null, extracted: null, flags: [], suggestion: null, reviewed: false, removed: false, manual: true,
});

const mergeRow = (base, incoming) => {
  const row = { ...base };
  const ex = base.extracted || {};
  if (incoming.section !== undefined) row.section = collapse(incoming.section).toUpperCase().slice(0, 10) || null;
  if (incoming.label !== undefined) row.label = collapse(incoming.label).slice(0, 20);
  if (incoming.questionText !== undefined) row.questionText = String(incoming.questionText ?? '').trim().slice(0, 5000);
  if (incoming.choiceGroup !== undefined) row.choiceGroup = collapse(incoming.choiceGroup).slice(0, 20) || null;
  if (incoming.reviewed !== undefined) row.reviewed = !!incoming.reviewed;
  if (incoming.removed !== undefined) row.removed = !!incoming.removed;

  if (incoming.coNumber !== undefined) {
    const value = toCoNumber(incoming.coNumber);
    if (value !== base.coNumber) {
      row.coNumber = value;
      row.coSource = sourceFor({ value, extractedValue: ex.coNumber, extractedSource: 'paper', suggestion: base.suggestion, field: 'coNumber', claimed: incoming.coSource });
    }
  }
  if (incoming.rbtLevel !== undefined) {
    const value = toRbtLevel(incoming.rbtLevel);
    if (value !== base.rbtLevel) {
      row.rbtLevel = value;
      row.rbtSource = sourceFor({ value, extractedValue: ex.rbtLevel, extractedSource: 'paper', suggestion: base.suggestion, field: 'rbtLevel', claimed: incoming.rbtSource });
    }
  }
  if (incoming.maxMarks !== undefined) {
    const value = toMarks(incoming.maxMarks);
    if (value !== base.maxMarks) {
      row.maxMarks = value;
      row.marksSource = sourceFor({ value, extractedValue: ex.maxMarks, extractedSource: ex.marksSource, field: 'maxMarks' });
    }
  }
  return row;
};

// payload: { revision, meta?: { maxMarks, durationMinutes }, rows?: [{ key, ...editable }] }
const applyDraftEdits = (draft, payload) => {
  if (!payload || typeof payload !== 'object') throw httpError(400, 'A draft payload is required.');
  if (Number(payload.revision) !== draft.revision) {
    throw httpError(409, 'This draft was changed by someone else — reload to see the latest version.');
  }
  const next = structuredClone(draft);

  if (payload.meta && typeof payload.meta === 'object') {
    if (payload.meta.maxMarks !== undefined) next.meta.maxMarks = toMarks(payload.meta.maxMarks);
    if (payload.meta.durationMinutes !== undefined) {
      const minutes = payload.meta.durationMinutes === null || payload.meta.durationMinutes === '' ? null : Number(payload.meta.durationMinutes);
      if (minutes !== null && (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440)) throw httpError(400, 'Duration must be a whole number of minutes.');
      next.meta.durationMinutes = minutes;
    }
  }

  if (Array.isArray(payload.rows)) {
    if (payload.rows.length > 200) throw httpError(400, 'A question paper draft cannot have more than 200 rows.');
    const existing = new Map(next.rows.map((row) => [row.key, row]));
    const seen = new Set();
    const rows = payload.rows.map((incoming) => {
      const key = String(incoming?.key || '');
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(key) || seen.has(key)) throw httpError(400, 'Every row needs a unique key.');
      seen.add(key);
      return mergeRow(existing.get(key) || newManualRow(key), incoming);
    });
    if (next.rows.every((row) => seen.has(row.key))) {
      // The full list: the client's order is the paper order (it may insert new rows).
      next.rows = rows;
    } else {
      // A partial update patches rows in place — a row the client did not send is kept
      // where it was, never dropped or moved (publishing numbers questions in this
      // order); new rows go at the end.
      const patched = new Map(rows.map((row) => [row.key, row]));
      next.rows = [...next.rows.map((row) => patched.get(row.key) || row), ...rows.filter((row) => !existing.has(row.key))];
    }
  }

  next.revision = draft.revision + 1;
  return next;
};

// ── Evaluation ───────────────────────────────────────────────────────────────
const labelKey = (row) => `${row.section || ''}|${collapse(row.label).toLowerCase()}`;
const describeLabel = (row) => `${row.section ? `Section ${row.section} ` : ''}Q${collapse(row.label)}`;
const formatCos = (numbers) => numbers.map((n) => `CO${n}`).join(', ');

const choiceAttempt = (draft, group) => {
  const section = draft.sections.find((s) => `Section-${s.code || 'X'}`.slice(0, 20) === group);
  return section?.choice?.attempt || 1;
};

const attemptableTotal = (draft, rows) => {
  let total = 0;
  const groups = new Map();
  for (const row of rows) {
    if (row.maxMarks === null) return { total: null, complete: false };
    if (row.choiceGroup) {
      if (!groups.has(row.choiceGroup)) groups.set(row.choiceGroup, []);
      groups.get(row.choiceGroup).push(row.maxMarks);
    } else {
      total += row.maxMarks;
    }
  }
  for (const [group, marks] of groups) {
    total += marks.sort((a, b) => b - a).slice(0, choiceAttempt(draft, group)).reduce((sum, m) => sum + m, 0);
  }
  return { total: Math.round(total * 100) / 100, complete: true };
};

const evaluateRow = (row, { draft, labelCounts, outcomeNumbers }) => {
  const issues = [];
  const add = (code, severity, field, message, checkable = false) => issues.push({ code, severity, field, message, checkable });
  const ex = row.extracted || {};
  const section = draft.sections.find((s) => s.code === row.section);

  if (!row.questionText.trim()) add('TEXT_MISSING', 'error', 'questionText', 'Question text is empty.');
  else if (row.extracted && row.questionText !== ex.questionText) add('TEXT_EDITED', 'info', 'questionText', 'Question wording was edited; the originally extracted wording is kept for reference.');
  if (!collapse(row.label)) add('LABEL_MISSING', 'error', 'label', 'Question number is empty.');
  else if (labelCounts.get(labelKey(row)) > 1) add('DUPLICATE_LABEL', 'error', 'label', `${describeLabel(row)} appears more than once.`);

  if (row.coNumber === null) {
    let message = 'Needs Review — the paper gives no CO for this question.';
    if (ex.coKind === 'multiple') message = `Needs Review — the paper lists "${ex.coRaw}"; choose the one CO this question is mapped to.`;
    else if (ex.coKind === 'unrecognized') message = `Needs Review — "${ex.coRaw}" in the CO column is not a CO value.`;
    add('CO_MISSING', 'error', 'coNumber', message);
  } else {
    if (row.coSource === 'paper' && ex.coKind === 'ocr' && !row.reviewed) {
      add('CO_NORMALIZED', 'error', 'coNumber', `Read as "${ex.coRaw}" and interpreted as CO${row.coNumber} — confirm against the paper.`, true);
    }
    if (outcomeNumbers.length > 0 && !outcomeNumbers.includes(row.coNumber) && !row.reviewed) {
      add('CO_UNKNOWN', 'error', 'coNumber', `CO${row.coNumber} is not defined for this course (${formatCos(outcomeNumbers)}). Publishing will create it — confirm or correct.`, true);
    }
    if (SUGGESTION_SOURCES.includes(row.coSource)) add('CO_FROM_SUGGESTION', 'info', 'coNumber', `CO accepted from the ${row.coSource === 'ai' ? 'AI' : 'keyword-based'} suggestion.`);
  }

  if (!row.rbtLevel) {
    const message = ex.rbtKind === 'unrecognized'
      ? `Needs Review — "${ex.rbtRaw}" is not an RBT level.`
      : 'Needs Review — the paper gives no RBT level for this question.';
    add('RBT_MISSING', 'error', 'rbtLevel', message);
  } else {
    if (row.rbtSource === 'paper' && ex.rbtKind === 'typo') add('RBT_NORMALIZED', 'warning', 'rbtLevel', `Read as "${ex.rbtRaw}" and interpreted as ${row.rbtLevel}.`);
    if (SUGGESTION_SOURCES.includes(row.rbtSource)) add('RBT_FROM_SUGGESTION', 'info', 'rbtLevel', `RBT level accepted from the ${row.rbtSource === 'ai' ? 'AI' : 'keyword-based'} suggestion.`);
  }

  if (row.maxMarks === null) {
    const message = row.extracted && section?.ambiguous
      ? `Needs Review — "${section.formula?.raw}" does not make clear which number is marks per question.`
      : 'Needs Review — marks for this question were not found.';
    add('MARKS_MISSING', 'error', 'maxMarks', message);
  } else if (row.marksSource === 'instruction') {
    add('MARKS_FROM_INSTRUCTION', 'info', 'maxMarks', `${row.maxMarks} marks taken from the ${row.section ? `Section ${row.section} ` : ''}instruction.`);
  }

  if (row.flags.includes('ROW_PARSE_UNCERTAIN') && !row.reviewed) {
    add('ROW_PARSE_UNCERTAIN', 'error', null, "This row did not line up with the paper's columns — check the question text, CO, RBT and marks against the original.", true);
  }
  if (row.flags.includes('MARKS_CONFLICT') && row.marksSource !== 'manual' && row.maxMarks !== null && !row.reviewed) {
    add('MARKS_CONFLICT', 'error', 'maxMarks', 'Marks printed for this question disagree with the section instruction — confirm the correct value.', true);
  }

  const checkable = row.flags.includes('ROW_PARSE_UNCERTAIN')
    || (row.flags.includes('MARKS_CONFLICT') && row.marksSource !== 'manual')
    || (row.coSource === 'paper' && ex.coKind === 'ocr')
    || (row.coNumber !== null && outcomeNumbers.length > 0 && !outcomeNumbers.includes(row.coNumber));
  return {
    status: issues.some((i) => i.severity === 'error') ? 'needs_review' : 'ready',
    checkable,
    issues,
  };
};

// context: { courseCode, outcomeNumbers: [1, 2, …], maxQuestions }
const evaluateDraft = (draft, { courseCode = null, outcomeNumbers = [], maxQuestions = 50 } = {}) => {
  const active = draft.rows.filter((row) => !row.removed);
  const labelCounts = new Map();
  active.forEach((row) => labelCounts.set(labelKey(row), (labelCounts.get(labelKey(row)) || 0) + 1));

  const rows = {};
  for (const row of draft.rows) {
    rows[row.key] = row.removed
      ? { status: 'removed', checkable: false, issues: [] }
      : evaluateRow(row, { draft, labelCounts, outcomeNumbers });
  }

  const paper = [];
  const add = (code, severity, message) => paper.push({ code, severity, message });
  if (active.length === 0) add('NO_QUESTIONS', 'error', 'No questions remain — add them or re-upload the paper.');
  if (active.length > maxQuestions) add('TOO_MANY_QUESTIONS', 'error', `A single exam component cannot have more than ${maxQuestions} questions (${active.length} found).`);
  if (['pdf', 'docx-text'].includes(draft.format)) {
    add('TEXT_LAYOUT_EXTRACTION', 'warning', 'This paper was read from its text layout, not table cells — compare every row with the original before publishing.');
  }
  const normalizeCode = (code) => String(code || '').replace(/[\s-]/g, '').toUpperCase();
  if (draft.meta.subjectCode && courseCode && normalizeCode(draft.meta.subjectCode) !== normalizeCode(courseCode)) {
    add('SUBJECT_CODE_MISMATCH', 'warning', `The paper's subject code (${draft.meta.subjectCode}) does not match the selected course (${courseCode}). Make sure this is the right paper.`);
  }
  for (const section of draft.sections) {
    const numbers = new Set(active.filter((row) => row.section === section.code).map((row) => parseInt(row.label, 10)).filter(Number.isFinite));
    if (section.expectedCount && numbers.size !== section.expectedCount) {
      add('SECTION_COUNT_MISMATCH', 'warning', `${section.code ? `Section ${section.code}` : 'The paper'} instruction implies ${section.expectedCount} question(s), but ${numbers.size} ${numbers.size === 1 ? 'is' : 'are'} listed — check for a missed or split question.`);
    }
  }
  const totals = attemptableTotal(draft, active);
  if (!draft.meta.maxMarks) {
    add('MAX_MARKS_MISSING', 'warning', "The paper's Max Marks was not found — enter it so the question total can be checked.");
  } else if (totals.complete && Math.abs(totals.total - draft.meta.maxMarks) > 0.001) {
    add('TOTAL_MARKS_MISMATCH', 'warning', `Questions add up to ${totals.total} attemptable marks, but the paper's Max Marks is ${draft.meta.maxMarks}.`);
  }
  (draft.notes || []).forEach((note) => add('EXTRACTION_NOTE', 'info', note));

  const count = (field) => active.reduce((acc, row) => {
    const key = row[field] || 'missing';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const needsReview = active.filter((row) => rows[row.key].status === 'needs_review').length;
  return {
    rows,
    paper,
    summary: {
      total: active.length,
      ready: active.length - needsReview,
      needsReview,
      removed: draft.rows.length - active.length,
      attemptableTotal: totals.total,
      maxMarks: draft.meta.maxMarks,
      sources: { co: count('coSource'), rbt: count('rbtSource'), marks: count('marksSource') },
      suggestionsWaiting: active.filter((row) => row.suggestion
        && ((row.coNumber === null && row.suggestion.coNumber !== null) || (!row.rbtLevel && row.suggestion.rbtLevel))).length,
    },
    canPublish: needsReview === 0 && !paper.some((issue) => issue.severity === 'error'),
  };
};

// The confirmed rows, in paper order, as applyPaperQuestions() expects them. question_number
// is sequential across the paper (question_configs needs it unique); the printed
// section-wise number is kept in question_label.
const toPublishQuestions = (draft) => draft.rows
  .filter((row) => !row.removed)
  .map((row, index) => ({
    questionNumber: index + 1,
    questionLabel: row.label,
    questionText: row.questionText,
    section: row.section,
    coNumber: row.coNumber,
    rbtLevel: row.rbtLevel,
    maxMarks: row.maxMarks,
    choiceGroup: row.choiceGroup,
    coSource: row.coSource,
    rbtSource: row.rbtSource,
    marksSource: row.marksSource,
  }));

module.exports = {
  buildDraft,
  suggestionItems,
  attachSuggestions,
  applyDraftEdits,
  evaluateDraft,
  toPublishQuestions,
};
