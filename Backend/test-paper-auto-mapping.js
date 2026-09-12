// Offline tests for the question-paper Auto-Mapping pipeline: extraction (PDF, DOCX and
// text-layout variants), the review rules, and CO/RBT suggestions (keyword engine plus a
// mocked OpenAI-compatible endpoint). No database, no server, no network.
//   node test-paper-auto-mapping.js
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { extractQuestionPaper } = require('./services/paperExtractionService');
const { parsePaperText } = require('./services/paperTextParser');
const { readCo, readRbt } = require('./services/paperTokens');
const {
  buildDraft, suggestionItems, attachSuggestions, applyDraftEdits, evaluateDraft, toPublishQuestions,
} = require('./services/paperReviewRules');
const { suggestCoRbt, suggestRbtHeuristic } = require('./services/coRbtSuggestionService');

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
};
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'test-fixtures', name));
const row = (q) => [q.section, q.label, q.co?.value ?? null, q.rbt?.value ?? null, q.marks?.value ?? null].join('|');
const asExtraction = (text) => ({ status: 'extracted', format: 'pdf', confidence: 'low', ...parsePaperText(text) });
const codes = (issues) => issues.map((i) => i.code);
const throwsStatus = (fn) => { try { fn(); return null; } catch (err) { return err.status; } };

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

(async () => {
  // ── 1. Token readers ────────────────────────────────────────────────────────
  check('CO1 read exactly', readCo('CO1').value === 1 && readCo('CO1').kind === 'exact');
  check('CO-1 / co 12 are formatting variants', readCo('CO-1').kind === 'variant' && readCo('co 12').value === 12);
  check('C01 is read as CO1 but flagged as an OCR reinterpretation', readCo('C01').value === 1 && readCo('C01').kind === 'ocr');
  check('CO1/CO2 keeps no single value', readCo('CO1/CO2').value === null && readCo('CO1/CO2').kind === 'multiple');
  check('L3 → Apply, Analyse → Analyze', readRbt('L3').value === 'Apply' && readRbt('Analyse').value === 'Analyze');
  check('Rember → Remember flagged as typo', readRbt('Rember').value === 'Remember' && readRbt('Rember').kind === 'typo');
  check('Contradictory "Apply (L2)" is not trusted', readRbt('Apply (L2)').value === null);

  // ── 2. The uploaded PDF sample (text layer, multi-line questions, restarting numbers) ─
  const pdf = await extractQuestionPaper(fixture('web-designing-mid-term-sample.pdf'), 'application/pdf', 'paper.pdf');
  const PDF_EXPECTED = [
    'A|1|1|Understand|2', 'A|2|3|Understand|2', 'A|3|2|Understand|2', 'A|4|1|Understand|2', 'A|5|3|Understand|2',
    'B|1|2|Understand|5', 'B|2|2|Understand|5', 'C|1|1|Understand|10', 'C|2|3|Apply|10',
  ];
  check('PDF: extracted at low (review-everything) confidence', pdf.status === 'extracted' && pdf.confidence === 'low', pdf.error);
  check('PDF: all 9 questions keep their own section, number, CO, RBT and marks',
    JSON.stringify(pdf.questions?.map(row)) === JSON.stringify(PDF_EXPECTED), JSON.stringify(pdf.questions?.map(row)));
  check('PDF: wrapped question text preserved word for word',
    pdf.questions?.[7]?.questionText === 'Define website and explain its types and main components with suitable examples.', pdf.questions?.[7]?.questionText);
  check('PDF: marks come from the section instructions', pdf.questions?.every((q) => q.marks.source === 'instruction'));
  check('PDF: Section C "any 1 of 2" is a choice group', pdf.questions?.slice(7).every((q) => q.choiceGroup === 'Section-C') && !pdf.questions?.[0].choiceGroup);
  check('PDF: meta read', pdf.meta?.subjectCode === '25BTAL12C07' && pdf.meta?.subjectName === 'Basics of Web Designing'
    && pdf.meta?.maxMarks === 30 && pdf.meta?.durationMinutes === 60 && /MID TERM EXAMINATION/.test(pdf.meta?.examName || ''), JSON.stringify(pdf.meta));

  // ── 3. DOCX fixture: tables, and the text parser reaching the same answer ─────
  const DOCX_EXPECTED = [
    'A|1|1|Remember|2', 'A|2|3|Remember|2', 'A|3|2|Evaluate|2', 'A|4|1|Remember|2', 'A|5|3|Evaluate|2',
    'B|1|3|Apply|5', 'B|2|3|Apply|5', 'C|1|1|Remember|10', 'C|2|2|Remember|10',
  ];
  const docx = await extractQuestionPaper(fixture('applied-chemistry-sample-paper.docx'), DOCX_MIME, 'paper.docx');
  check('DOCX: high confidence, 9 rows matching the known mapping', docx.confidence === 'high'
    && JSON.stringify(docx.questions.map(row)) === JSON.stringify(DOCX_EXPECTED), JSON.stringify(docx.questions?.map(row)));
  const { value: docxText } = await mammoth.extractRawText({ buffer: fixture('applied-chemistry-sample-paper.docx') });
  check('DOCX text (one cell per line) parses to the same 9 rows', JSON.stringify(parsePaperText(docxText).questions.map(row)) === JSON.stringify(DOCX_EXPECTED));

  // ── 4. Other layouts ─────────────────────────────────────────────────────────
  const variants = parsePaperText(`END TERM EXAMINATION
Subject Code: CS201 Subject Name: Chemistry of Materials Maximum Marks: 40 Time: 3 Hrs
PART I
Answer all questions. (5 × 2 = 10 Marks)
Q.No Question Marks BL CO
1 Explain the effect of CO2 on global warming. 5 L2 C01
2 Compare ionic and covalent bonds with
examples from daily life. 5 Analyse CO-2
PART II
Answer any two questions.
Q.No Question Marks RBT CO
1 (a) Define polymer. 4 Remember CO 3
(b) Design a polymer blend for packaging. 6 Create CO3
2 Evaluate the recycling methods of plastics. 10 Evaluate CO1, CO2
OR
3 Justify the use of composites in aerospace. 10 Evalute CO4
PART III
Q.No Question
1 Describe the structure of graphene.
2 Solve the given numerical on crystal density.`);
  const v = variants.questions;
  check('Different column order (Marks, BL, CO) and roman section names', JSON.stringify(v.map(row)) === JSON.stringify([
    'I|1|1|Understand|5', 'I|2|2|Analyze|5', 'II|1(a)|3|Remember|4', 'II|1(b)|3|Create|6', 'II|2||Evaluate|10', 'II|3|4|Evaluate|10', 'III|1|||', 'III|2|||',
  ]), JSON.stringify(v.map(row)));
  check('"CO2" inside the question text is not taken as the CO', v[0].questionText.includes('CO2') && v[0].co.raw === 'C01');
  check('Sub-parts with their own CO/RBT become separate rows', v[2].questionText === '(a) Define polymer.' && v[3].label === '1(b)');
  check('"Answer any two" makes Part II a choice group', v.slice(2, 6).every((q) => q.choiceGroup === 'Section-II'));
  check('A paper without CO/RBT columns yields empty values, not guesses', v[6].co === null && v[6].rbt === null && v[6].flags.length === 0);

  const unparsed = parsePaperText(`Section A
Q.No. Question CO RBT Level
1 Define a token. CO1 Remember
2 Describe tokens in detail. CO2 Recognise`).questions;
  check('A row that does not fit the header is flagged, not silently read', unparsed[1].flags.includes('ROW_PARSE_UNCERTAIN') && unparsed[1].co === null);

  const ambiguous = parsePaperText(`Section A
Answer all questions. (5 × 2 = 10 Marks)
Q.No. Question CO RBT Level
1 Define a compiler. CO1 Remember
2 Explain lexical analysis. CO1 Understand
3 Explain parsing. CO2 Understand`);
  check('"(5 × 2)" with 3 questions: marks left empty rather than guessed', ambiguous.questions.every((q) => q.marks === null) && ambiguous.sections[0].ambiguous);
  const resolved = parsePaperText(`Instructions
1. In Sec-A each question carries 2 mark(s).
Section A
Answer all questions. (5 × 2 = 10 Marks)
Q.No. Question CO RBT Level
1 Define a compiler. CO1 Remember
2 Explain lexical analysis. CO1 Understand
3 Explain parsing. CO2 Understand`);
  check('General instructions settle which factor is marks', resolved.questions.every((q) => q.marks?.value === 2) && resolved.sections[0].expectedCount === 5);
  check('…and the review flags the missing questions', codes(evaluateDraft(buildDraft(asExtraction(`Instructions
1. In Sec-A each question carries 2 mark(s).
Section A
(5 × 2 = 10 Marks)
Q.No. Question CO RBT Level
1 Define a compiler. CO1 Remember
2 Explain lexical analysis. CO1 Understand`))).paper).includes('SECTION_COUNT_MISMATCH'));

  const conflictDraft = buildDraft(asExtraction(`Section A
(2 × 3 = 6 Marks)
Q.No. Question Marks CO RBT
1 Define entropy. 2 CO1 Remember
2 State the second law. 3 CO1 Remember
3 List two heat engines. 2 CO2 Remember`));
  const conflictReview = evaluateDraft(conflictDraft, { outcomeNumbers: [1, 2] });
  check('Printed marks disagreeing with the instruction block publishing', codes(conflictReview.rows.r2.issues).includes('MARKS_CONFLICT') && !conflictReview.canPublish);
  const conflictChecked = applyDraftEdits(conflictDraft, { revision: 1, rows: [{ key: 'r2', reviewed: true }] });
  check('Ticking "Checked" clears a conflict', evaluateDraft(conflictChecked, { outcomeNumbers: [1, 2] }).rows.r2.status === 'ready');

  // ── 5. Review rules on the PDF draft ─────────────────────────────────────────
  const pdfDraft = buildDraft(pdf);
  const pdfReview = evaluateDraft(pdfDraft, { courseCode: '25BTAL12C07', outcomeNumbers: [1, 2, 3] });
  check('PDF draft: every row ready, publishable', pdfReview.canPublish && pdfReview.summary.ready === 9, JSON.stringify(pdfReview.paper));
  check('PDF draft: text-layout warning shown, totals agree with Max Marks', codes(pdfReview.paper).includes('TEXT_LAYOUT_EXTRACTION')
    && pdfReview.summary.attemptableTotal === 30 && !codes(pdfReview.paper).includes('TOTAL_MARKS_MISMATCH'));
  check('PDF draft: nothing to suggest when the paper prints every CO/RBT', suggestionItems(pdfDraft).length === 0);
  check('Wrong course selected → subject-code warning', codes(evaluateDraft(pdfDraft, { courseCode: 'CS101', outcomeNumbers: [1, 2, 3] }).paper).includes('SUBJECT_CODE_MISMATCH'));
  const unknownCo = evaluateDraft(pdfDraft, { courseCode: '25BTAL12C07', outcomeNumbers: [1, 2] });
  check('A CO the course does not define needs a check', !unknownCo.canPublish && unknownCo.rows.r2.checkable && codes(unknownCo.rows.r2.issues).includes('CO_UNKNOWN'));

  const published = toPublishQuestions(pdfDraft);
  check('Publish: sequential numbers, section-wise labels and sources kept', published.length === 9 && published[8].questionNumber === 9
    && published[8].section === 'C' && published[8].questionLabel === '2' && published[8].coSource === 'paper' && published[8].marksSource === 'instruction');

  const variantsDraft = buildDraft(asExtraction(`PART I
Q.No Question Marks BL CO
1 Explain the effect of CO2 on global warming. 5 L2 C01
2 Evaluate the recycling methods of plastics. 5 Evaluate CO1, CO2`));
  const variantsReview = evaluateDraft(variantsDraft, { outcomeNumbers: [1, 2, 3] });
  check('C01 must be confirmed before publishing', codes(variantsReview.rows.r1.issues).includes('CO_NORMALIZED'));
  check('Two printed COs → Needs Review asking for one', variantsReview.rows.r2.issues.some((i) => i.code === 'CO_MISSING' && i.message.includes('CO1, CO2')));

  // ── 6. Edits: validation, provenance, concurrency ────────────────────────────
  check('Stale revision → 409', throwsStatus(() => applyDraftEdits(pdfDraft, { revision: 7, rows: [] })) === 409);
  check('Invalid RBT → 400', throwsStatus(() => applyDraftEdits(pdfDraft, { revision: 1, rows: [{ key: 'r1', rbtLevel: 'Memorise' }] })) === 400);
  const edited = applyDraftEdits(pdfDraft, { revision: 1, rows: pdfDraft.rows.map((r) => ({ key: r.key })) });
  check('Saving unchanged rows keeps them unchanged', JSON.stringify(edited.rows) === JSON.stringify(pdfDraft.rows));
  check('Duplicate key in one save → 400', throwsStatus(() => applyDraftEdits(pdfDraft, { revision: 1, rows: [{ key: 'r1' }, { key: 'r1' }] })) === 400);
  const withManual = applyDraftEdits(pdfDraft, {
    revision: 1,
    rows: [{ key: 'r1', removed: true }, { key: 'new-1', section: 'C', label: '1', questionText: 'Added by hand.', coNumber: 1, rbtLevel: 'Apply', maxMarks: 10 }, { key: 'r2', questionText: 'Changed wording.' }],
  });
  const manualReview = evaluateDraft(withManual, { outcomeNumbers: [1, 2, 3] });
  check('Removed rows leave the count and the publish set', manualReview.summary.removed === 1 && !toPublishQuestions(withManual).some((q) => q.questionText === pdfDraft.rows[0].questionText));
  check('Manual row duplicating C-1 is blocked', codes(manualReview.rows['new-1'].issues).includes('DUPLICATE_LABEL') && withManual.rows.find((r) => r.key === 'new-1').coSource === 'manual');
  check('Edited wording is shown as edited, not blocked', codes(manualReview.rows.r2.issues).includes('TEXT_EDITED') && manualReview.rows.r2.status === 'ready');
  check('Revision increments on save', edited.revision === 2);
  const partial = applyDraftEdits(pdfDraft, { revision: 1, rows: [{ key: 'r7', rbtLevel: 'Apply' }] });
  check('A partial update patches in place without reordering the paper',
    partial.rows.map((r) => r.key).join() === pdfDraft.rows.map((r) => r.key).join()
    && partial.rows[6].rbtLevel === 'Apply' && partial.rows[6].rbtSource === 'manual'
    && toPublishQuestions(partial)[6].section === 'B' && toPublishQuestions(partial)[6].questionLabel === '2',
    partial.rows.map((r) => r.key).join());

  // ── 7. Paper without CO/RBT: keyword suggestions, never applied on their own ──
  const outcomes = [
    { co_number: 1, description: 'Understand the fundamentals of relational databases and their components' },
    { co_number: 2, description: 'Apply normalization techniques to remove redundancy in database schemas' },
    { co_number: 3, description: 'Write SQL queries to retrieve and manipulate data' },
    { co_number: 4, description: 'Design entity relationship models for real-world applications' },
  ];
  const bare = buildDraft(asExtraction(`Subject Code: CS305 Max Marks: 20
Section A
Attempt all questions. (5 × 4 = 20 Marks)
Q.No. Question
1 Define a relational database and list its main components.
2 Explain normalization with suitable examples.
3 Write an SQL query to find the second highest salary from an employee table.
4 Design an ER diagram for a library management system.`));
  const bareContext = { courseCode: 'CS305', outcomeNumbers: [1, 2, 3, 4] };
  check('No CO/RBT in the paper → every row Needs Review', evaluateDraft(bare, bareContext).summary.needsReview === 4);
  const heuristic = await suggestCoRbt({ course: { courseCode: 'CS305' }, outcomes, items: suggestionItems(bare) });
  const s = heuristic.suggestions;
  check('Keyword engine: RBT from action verbs', s.r1.rbtLevel === 'Remember' && s.r2.rbtLevel === 'Understand' && s.r3.rbtLevel === 'Apply' && s.r4.rbtLevel === 'Create',
    JSON.stringify(Object.values(s).map((x) => x.rbtLevel)));
  check('Keyword engine: CO from CO-description overlap, none when nothing overlaps', s.r1.coNumber === 1 && s.r2.coNumber === 2 && s.r3.coNumber === 3 && s.r4.coNumber === null,
    JSON.stringify(Object.values(s).map((x) => x.coNumber)));
  check('Keyword confidence never exceeds medium', Object.values(s).every((x) => !['high'].includes(x.coConfidence) && !['high'].includes(x.rbtConfidence)));

  const suggested = attachSuggestions(bare, heuristic);
  const suggestedReview = evaluateDraft(suggested, bareContext);
  check('Suggestions are stored beside rows but do not fill them', suggested.rows.every((r) => r.coNumber === null && r.rbtLevel === null)
    && suggestedReview.summary.needsReview === 4 && suggestedReview.summary.suggestionsWaiting === 4);

  const accepted = applyDraftEdits(suggested, {
    revision: suggested.revision,
    rows: [
      { key: 'r1', coNumber: s.r1.coNumber, coSource: 'heuristic', rbtLevel: s.r1.rbtLevel, rbtSource: 'heuristic' },
      { key: 'r2', coNumber: s.r2.coNumber, coSource: 'heuristic', rbtLevel: 'Apply', rbtSource: 'heuristic' },
      { key: 'r3', coNumber: s.r3.coNumber, coSource: 'ai', rbtLevel: s.r3.rbtLevel, rbtSource: 'heuristic' },
      { key: 'r4', coNumber: 4, rbtLevel: s.r4.rbtLevel, rbtSource: 'heuristic' },
    ],
  });
  const byKey = Object.fromEntries(accepted.rows.map((r) => [r.key, r]));
  check('Accepted suggestion records its engine', byKey.r1.coSource === 'heuristic' && byKey.r1.rbtSource === 'heuristic');
  check('A value different from the suggestion is recorded as manual', byKey.r2.rbtSource === 'manual');
  check('Claiming the wrong engine is recorded as manual', byKey.r3.coSource === 'manual');
  const acceptedReview = evaluateDraft(accepted, bareContext);
  check('After acceptance the paper is publishable', acceptedReview.canPublish, JSON.stringify(acceptedReview.paper));
  check('Heuristic RBT agrees with the sample PDF\'s printed levels', pdf.questions.every((q) => suggestRbtHeuristic(q.questionText).rbtLevel === q.rbt.value));

  // ── 8. AI engine against a mocked OpenAI-compatible endpoint ─────────────────
  const items = suggestionItems(bare);
  const aiReply = (content, status = 200) => ({
    ok: status < 400, status, json: async () => (status < 400 ? { choices: [{ message: { content } }] } : { error: { message: content } }),
  });
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_BASE_URL = 'https://ai.example.test/v1/';
  process.env.AI_MODEL = 'test-model';

  const calls = [];
  const ai = await suggestCoRbt({
    course: { courseCode: 'CS305' }, outcomes, items, useAi: true,
    fetch: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return aiReply(JSON.stringify({ predictions: [
        { key: 'r1', coNumber: 1, coConfidence: 'high', rbtLevel: 'remember', rbtConfidence: 'HIGH', rationale: 'Asks to define and list components.' },
        { key: 'r2', coNumber: 9, coConfidence: 'high', rbtLevel: 'Understand', rbtConfidence: 'medium', rationale: 'x' },
        { key: 'r3', coNumber: 'CO3', coConfidence: 'medium', rbtLevel: 'Synthesize', rbtConfidence: 'low', rationale: 'y' },
        { key: 'zzz', coNumber: 2, rbtLevel: 'Apply' },
      ] }));
    },
  });
  check('AI: request goes to /chat/completions with the configured model and key', calls[0]?.url === 'https://ai.example.test/v1/chat/completions'
    && calls[0]?.options.headers.Authorization === 'Bearer test-key' && calls[0]?.body.model === 'test-model' && calls[0]?.body.response_format?.type === 'json_object');
  check('AI: the question text and CO descriptions are sent', calls[0]?.body.messages[1].content.includes('second highest salary') && calls[0]?.body.messages[1].content.includes('normalization techniques'));
  check('AI: valid predictions kept and normalized', ai.engine === 'ai' && ai.suggestions.r1.coNumber === 1 && ai.suggestions.r1.rbtLevel === 'Remember' && ai.suggestions.r1.rbtConfidence === 'high');
  check('AI: a CO the course does not have is discarded', ai.suggestions.r2.coNumber === null && ai.suggestions.r2.coConfidence === null && ai.suggestions.r2.rbtLevel === 'Understand');
  check('AI: an RBT outside the six levels is discarded', ai.suggestions.r3.coNumber === 3 && ai.suggestions.r3.rbtLevel === null);
  check('AI: missing and unknown keys handled', ai.suggestions.r4.coNumber === null && ai.suggestions.r4.rbtLevel === null && !ai.suggestions.zzz);

  const retryCalls = [];
  const retried = await suggestCoRbt({
    course: {}, outcomes, items, useAi: true,
    fetch: async (url, options) => {
      retryCalls.push(JSON.parse(options.body));
      return retryCalls.length === 1 ? aiReply('response_format is not supported', 400) : aiReply('{"predictions":[]}');
    },
  });
  check('AI: servers rejecting response_format get one retry without it', retried.engine === 'ai' && retryCalls.length === 2 && !retryCalls[1].response_format);

  const malformed = await suggestCoRbt({ course: {}, outcomes, items, useAi: true, fetch: async () => aiReply('Sorry, I cannot help with that.') });
  check('AI: malformed output falls back to keywords and says why', malformed.engine === 'heuristic' && /not valid JSON/.test(malformed.error) && malformed.suggestions.r1.rbtLevel === 'Remember');

  process.env.AI_TIMEOUT_MS = '30';
  const timedOut = await suggestCoRbt({
    course: {}, outcomes, items, useAi: true,
    fetch: (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }),
  });
  check('AI: a hung endpoint times out and falls back', timedOut.engine === 'heuristic' && /did not respond/.test(timedOut.error));

  ['AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL', 'AI_TIMEOUT_MS'].forEach((key) => delete process.env[key]);
  const unconfigured = await suggestCoRbt({ course: {}, outcomes, items, useAi: true, fetch: async () => { throw new Error('must not be called'); } });
  check('AI not configured: keyword engine, with the reason', unconfigured.engine === 'heuristic' && /not configured/.test(unconfigured.error));

  const image = await extractQuestionPaper(Buffer.from('not really an image'), 'image/png', 'scan.png');
  check('Images are refused with a clear message instead of being half-read', image.status === 'failed' && /OCR/.test(image.error));

  console.log(failed === 0 ? '\nALL AUTO-MAPPING TESTS PASSED' : `\nFAILED: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('CRASH', err);
  process.exit(1);
});
