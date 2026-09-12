// ─────────────────────────────────────────────────────────────────────────────
// Token readers shared by every question-paper parser (DOCX tables, XLSX/CSV and the
// PDF/plain-text parser). Each reader returns the canonical value together with HOW it
// was read, so the review screen can show "read as 'C01' → CO1" instead of silently
// changing a mapping:
//   kind 'exact'        — already canonical (CO1, Understand)
//   kind 'variant'      — formatting/spelling variant only (CO-1, co 1, Analyse, L2)
//   kind 'ocr'          — a character had to be reinterpreted (C01 → CO1); needs a human check
//   kind 'typo'         — misspelt word matched to the nearest RBT level (Rember → Remember)
//   kind 'multiple'     — more than one CO printed for one question; value stays null
//   kind 'unrecognized' — something was printed but it is not a CO/RBT value; value stays null
// ─────────────────────────────────────────────────────────────────────────────

const RBT_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

// Legitimate variants universities print — older Bloom names, noun/gerund forms, British
// spelling. Reading one of these is not an error and needs no reviewer attention.
const RBT_VARIANTS = {
  remembering: 'Remember', knowledge: 'Remember', recall: 'Remember',
  understanding: 'Understand', comprehension: 'Understand', comprehend: 'Understand',
  applying: 'Apply', application: 'Apply',
  analyse: 'Analyze', analyzing: 'Analyze', analysing: 'Analyze', analysis: 'Analyze',
  evaluating: 'Evaluate', evaluation: 'Evaluate',
  creating: 'Create', creation: 'Create', synthesis: 'Create',
};

const RBT_CODE_RE = /\(?\s*\b(?:B?T?L|K)\s*[-.]?\s*([1-6])\b\s*\)?/i;

const collapse = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const levenshtein = (a, b) => {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length];
};

const readRbt = (raw) => {
  const text = collapse(raw);
  if (!text) return null;

  const codeMatch = text.match(RBT_CODE_RE);
  const codeLevel = codeMatch ? RBT_LEVELS[Number(codeMatch[1]) - 1] : null;
  const words = text.replace(RBT_CODE_RE, ' ').replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return codeLevel ? { value: codeLevel, raw: text, kind: 'variant' } : { value: null, raw: text, kind: 'unrecognized' };
  }
  if (words.length > 1) return { value: null, raw: text, kind: 'unrecognized' };

  const word = words[0].toLowerCase();
  let value = null;
  let kind = 'unrecognized';
  const exact = RBT_LEVELS.find((level) => level.toLowerCase() === word);
  if (exact) {
    value = exact;
    kind = codeLevel ? 'variant' : 'exact';
  } else if (RBT_VARIANTS[word]) {
    value = RBT_VARIANTS[word];
    kind = 'variant';
  } else {
    let best = null;
    for (const level of RBT_LEVELS) {
      const distance = levenshtein(word, level.toLowerCase());
      const allowed = level.length >= 7 ? 2 : 1;
      if (distance <= allowed && (!best || distance < best.distance)) best = { level, distance };
    }
    if (best) {
      value = best.level;
      kind = 'typo';
    }
  }

  // "Apply (L2)" — the word and the level code disagree, so neither can be trusted.
  if (value && codeLevel && codeLevel !== value) return { value: null, raw: text, kind: 'unrecognized' };
  return { value, raw: text, kind };
};

// CO1, CO 1, CO-1, CO.1, co1, CO01 are formatting variants. C01 / C0-1 (digit zero read
// for the letter O) is an OCR-style reinterpretation and is flagged for review.
const CO_TOKEN_SOURCE = 'C\\s*([O0])\\s*[-–.:]?\\s*(\\d{1,2})(?!\\d)';

const readCo = (raw, { allowBareNumber = false } = {}) => {
  const text = collapse(raw);
  if (!text) return null;

  if (allowBareNumber && /^\d{1,2}$/.test(text)) {
    return { value: Number(text), raw: text, kind: 'variant' };
  }

  const numbers = [];
  let ocr = false;
  for (const match of text.matchAll(new RegExp(CO_TOKEN_SOURCE, 'gi'))) {
    const number = Number(match[2]);
    if (number < 1) continue;
    if (match[1] === '0') ocr = true;
    if (!numbers.includes(number)) numbers.push(number);
  }
  if (numbers.length === 0) return { value: null, raw: text, kind: 'unrecognized' };
  if (numbers.length > 1) return { value: null, raw: text, kind: 'multiple', numbers };

  let kind = 'variant';
  if (ocr) kind = 'ocr';
  else if (/^CO[1-9]\d?$/.test(text)) kind = 'exact';
  return { value: numbers[0], raw: text, kind };
};

const readMarks = (raw) => {
  const text = collapse(raw);
  if (!text) return null;
  const match = text.match(/^[[(]?\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:marks?|m)?\s*[\])]?$/i);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? { value, raw: text } : { value: null, raw: text };
};

// "1", "1.", "Q1", "Q.1", "Q 1)", "1(a)", "1 (b)", "Q1.(ii)" → { number, sub, label }.
const readQuestionLabel = (raw) => {
  const text = collapse(raw);
  const match = text.match(/^(?:Q(?:uestion)?\s*(?:No\.?)?\s*[.\-:]?\s*)?(\d{1,3})\s*[.):]?\s*(?:\(\s*([a-z]|[ivx]{1,4})\s*\)|([a-z])\))?\s*$/i);
  if (!match) return null;
  const number = Number(match[1]);
  const sub = (match[2] || match[3] || '').toLowerCase() || null;
  return { number, sub, label: sub ? `${number}(${sub})` : String(number) };
};

// "A", "Sec-A", "Section B", "PART II", "Part-2" → "A" / "B" / "II" / "2".
const normalizeSectionCode = (raw) => {
  const text = collapse(raw);
  if (!text) return null;
  const match = text.match(/^(?:section|sec|part|unit)?\s*[-–.:]?\s*([A-Z]|[IVX]{1,4}|\d{1,2})\b/i);
  return (match ? match[1] : text).toUpperCase().slice(0, 10);
};

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const COUNT_SOURCE = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const toCount = (token) => (/^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token.toLowerCase()] ?? null);

// "(2 × 5 = 10 Marks)" — which factor is marks-per-question is decided later, against the
// number of questions actually found (templates disagree on the order).
const readMarksFormula = (text) => {
  const match = collapse(text).match(/(\d{1,3}(?:\.\d{1,2})?)\s*[×xX*]\s*(\d{1,3}(?:\.\d{1,2})?)\s*=\s*(\d{1,3}(?:\.\d{1,2})?)/);
  if (!match) return null;
  const [a, b, total] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return { a, b, total, consistent: Math.abs(a * b - total) < 0.001, raw: match[0] };
};

// "Do any 1 of 2", "attempt any 1 out of 2 questions", "Answer any two questions".
const readChoice = (text) => {
  const value = collapse(text);
  const withOffered = value.match(new RegExp(`\\bany\\s+${COUNT_SOURCE}\\s*(?:questions?\\s*)?(?:out\\s+of|of|from)\\s+(?:the\\s+)?(?:following\\s+)?${COUNT_SOURCE}\\b`, 'i'));
  if (withOffered) {
    const attempt = toCount(withOffered[1]);
    const offered = toCount(withOffered[2]);
    if (attempt && offered && attempt < offered) return { attempt, offered, raw: withOffered[0] };
    return null;
  }
  const attemptOnly = value.match(new RegExp(`\\b(?:attempt|answer|do|solve|write)\\s+any\\s+${COUNT_SOURCE}\\b`, 'i'));
  if (attemptOnly) {
    const attempt = toCount(attemptOnly[1]);
    return attempt ? { attempt, offered: null, raw: attemptOnly[0] } : null;
  }
  return null;
};

// General-instruction lines such as "In Sec-A each question carries 2 mark(s), attempt all
// questions" → Map('A' → { marksPerQuestion: 2, choice: null }).
const readGeneralInstructions = (lines) => {
  const bySection = new Map();
  for (const line of lines) {
    const text = collapse(line);
    const sectionMatch = text.match(/\b(?:Sec(?:tion)?|Part)\s*[-–.:]?\s*([A-Z]|[IVX]{1,4}|\d{1,2})\b/i);
    if (!sectionMatch) continue;
    const marksMatch = text.match(/(?:carries|carry|of|for)\s+(\d{1,3}(?:\.\d{1,2})?)\s*marks?\b/i)
      || text.match(/(\d{1,3}(?:\.\d{1,2})?)\s*marks?\s*(?:\(s\)\s*)?(?:each|per\s+question)/i);
    const choice = readChoice(text);
    if (!marksMatch && !choice) continue;
    const code = sectionMatch[1].toUpperCase();
    const entry = bySection.get(code) || { marksPerQuestion: null, choice: null, raw: [] };
    if (marksMatch) entry.marksPerQuestion = Number(marksMatch[1]);
    if (choice) entry.choice = choice;
    entry.raw.push(text);
    bySection.set(code, entry);
  }
  return bySection;
};

const readDurationMinutes = (raw) => {
  const text = collapse(raw);
  if (!text) return null;
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const minutes = text.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
  if (hours || minutes) {
    return (hours ? Math.round(parseFloat(hours[1]) * 60) : 0) + (minutes ? Number(minutes[1]) : 0);
  }
  const bare = text.match(/^(\d{1,3})$/);
  return bare ? Number(bare[1]) : null;
};

module.exports = {
  RBT_LEVELS,
  CO_TOKEN_SOURCE,
  collapse,
  readRbt,
  readCo,
  readMarks,
  readQuestionLabel,
  normalizeSectionCode,
  readMarksFormula,
  readChoice,
  readGeneralInstructions,
  readDurationMinutes,
};
