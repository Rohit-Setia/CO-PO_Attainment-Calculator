// ─────────────────────────────────────────────────────────────────────────────
// Examination Cell — question paper upload/extraction/review/approval, class +
// marks-teacher assignment, and the "My Assigned Examinations" view. Marks entry
// itself is NOT duplicated here — it reuses the existing, already-tested
// POST/GET /courses/:id/marks (question mode) once question_configs is
// paper-sourced. See C:\Users\Sharv\.claude\plans\crispy-sprouting-horizon.md.
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const protect = require('../middlewares/authMiddleware');
const { upload } = require('../middlewares/upload');
const { authorizeExamWrite, applyReadScope } = require('../middlewares/scopeMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { findUserByEmail } = require('../models/userModel');
const { assignUserToCourse } = require('../models/courseModel');
const { logAction } = require('../models/adminAuditModel');
const { notify, getForUser, markRead } = require('../models/notificationModel');
const { sendMail } = require('../services/emailService');
const { extractQuestionPaper } = require('../services/paperExtractionService');
const { suggestCoRbt, isAiConfigured } = require('../services/coRbtSuggestionService');
const {
  buildDraft, suggestionItems, attachSuggestions, applyDraftEdits, evaluateDraft, toPublishQuestions,
} = require('../services/paperReviewRules');
const { getActiveOutcomes } = require('../models/courseOutcomeModel');
const pool = require('../config/db');

const {
  createQuestionPaper, getQuestionPaperById, setExtractionResult, updatePaperStatus,
  listQuestionPapers, getQuestionsForPaper, getStats,
  isAwaitingConfirmation, saveExtractionDraft, getExtractionDraft, updateExtractionDraft, confirmMapping,
} = require('../models/questionPaperModel');
const {
  assignResponsibility, removeAssignment, getAssignmentsForPaper,
  isAssignedAnyOf, countDistinctReviewers, getAssignmentsForUser,
  getAllocatedClassesForPaper, getClassesForUserOnPaper,
} = require('../models/paperAssignmentModel');
const {
  createForPaperClasses, listByPaperId, submit, lock, reopen,
} = require('../models/marksSubmissionModel');
const {
  listExaminations, getExaminationById, createExamination, updateExamination,
  getExaminationProgress,
} = require('../models/examinationModel');
const { validateAllocationWorkbook, importAllocations } = require('../services/allocationImportService');
const { buildAllocationTemplateWorkbook, buildAllocationErrorWorkbook } = require('../utils/allocationTemplate');
const { applyPaperQuestions, updateQuestionConfigFields, MAX_QUESTIONS_PER_EXAM } = require('../models/questionConfigModel');
const { enrollEntireClassInCourse } = require('../models/academicModel');

const UPLOAD_DIR = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'question-papers');
const OVERSEER_ROLES = ['Admin', 'Moderator', 'Examination Team', 'School Admin', 'Department Admin'];

const loadCourseRaw = async (courseId) => {
  const [rows] = await pool.query('SELECT * FROM courses WHERE id = ?', [courseId]);
  return rows[0] || null;
};

const loadPaperOr404 = async (req, res) => {
  const paper = await getQuestionPaperById(req.params.id);
  if (!paper) {
    res.status(404).json({ success: false, message: 'Question paper not found.' });
    return null;
  }
  return paper;
};

// An overseer (Admin/Moderator/Examination Team/School Admin/Department Admin) already
// cleared authorizeExamWrite's scope check on this route — they may act regardless of
// a specific paper_assignments row. Anyone else must hold the named responsibility.
const canActAs = async (req, paperId, responsibilities) => {
  if (OVERSEER_ROLES.includes(req.user.role)) return true;
  return isAssignedAnyOf(paperId, req.user.id, responsibilities);
};

const safeFileName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

// ── Auto-Mapping Review helpers ──────────────────────────────────────────────
// Extraction never writes question_configs. It produces a draft — with offline keyword
// suggestions beside any CO/RBT the paper does not print — that the Examination Cell
// reviews and then confirms. The rules live in services/paperReviewRules.js.
const reviewContext = async (paper) => {
  const [course, outcomes] = await Promise.all([loadCourseRaw(paper.course_id), getActiveOutcomes(paper.course_id)]);
  return {
    course,
    outcomes,
    rules: {
      courseCode: course?.course_code || null,
      outcomeNumbers: outcomes.map((o) => o.co_number),
      maxQuestions: MAX_QUESTIONS_PER_EXAM,
    },
  };
};

const draftResponse = (paper, draft, context) => ({
  paper,
  draft,
  review: evaluateDraft(draft, context.rules),
  course: {
    id: paper.course_id,
    courseCode: context.course?.course_code || null,
    subjectName: context.course?.subject_name || null,
    outcomes: context.outcomes.map((o) => ({ coNumber: o.co_number, description: o.description })),
  },
  ai: { available: isAiConfigured() },
});

const suggestionCourse = (context) => ({ courseCode: context.course?.course_code, subjectName: context.course?.subject_name });

// Shared by the first upload and the corrected re-upload.
const extractIntoDraft = async (paper, file, userId) => {
  const extraction = await extractQuestionPaper(file.buffer, file.mimetype, file.originalname);
  if (extraction.status !== 'extracted') {
    await setExtractionResult(paper.id, { status: 'failed', error: extraction.error });
    return { extraction, draft: null, context: null };
  }
  const context = await reviewContext(paper);
  let draft = buildDraft(extraction);
  const items = suggestionItems(draft);
  if (items.length > 0) {
    // Offline engine only at upload — sending paper text to an external AI service is
    // always an explicit reviewer action (POST …/draft/suggest).
    const result = await suggestCoRbt({ course: suggestionCourse(context), outcomes: context.outcomes, items, useAi: false });
    draft = attachSuggestions(draft, result);
  }
  await saveExtractionDraft(paper.id, draft, userId);
  await setExtractionResult(paper.id, { status: 'extracted', confidence: extraction.confidence, reviewRequired: true });
  return { extraction, draft, context };
};

const rejectUnconfirmed = (res) => res.status(400).json({
  success: false,
  message: 'The auto-mapping for this paper has not been confirmed yet — the Examination Cell must review it and Confirm & Publish first.',
});

// ── Upload + extract ─────────────────────────────────────────────────────────
router.post(
  '/examinations/papers',
  protect,
  authorizeExamWrite('course'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const { courseId, examType, paperSet } = req.body;
      if (!courseId || !['MTT', 'ETT'].includes(examType)) {
        return res.status(400).json({ success: false, message: 'courseId and a valid examType (MTT/ETT) are required.' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'A question paper file is required.' });
      }
      const course = await loadCourseRaw(courseId);
      if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });

      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const storedName = `${Date.now()}-${safeFileName(req.file.originalname)}`;
      const filePath = path.join(UPLOAD_DIR, storedName);
      fs.writeFileSync(filePath, req.file.buffer);

      const paper = await createQuestionPaper({
        courseId, examType, paperSet,
        filePath, fileName: req.file.originalname, fileMime: req.file.mimetype, fileSize: req.file.size,
        uploadedBy: req.user.id,
      });

      await logAction({
        actorUserId: req.user.id, actorName: req.user.email, action: 'PAPER_UPLOADED',
        entityType: 'question_paper', entityId: paper.id, details: { courseId, examType, fileName: req.file.originalname },
      });

      const { extraction, draft, context } = await extractIntoDraft(paper, req.file, req.user.id);
      const finalPaper = await getQuestionPaperById(paper.id);
      // questions stays empty: nothing is published until the draft is confirmed.
      res.json({
        success: true,
        data: {
          paper: finalPaper,
          questions: [],
          extractionMeta: extraction.meta || null,
          ...(draft ? draftResponse(finalPaper, draft, context) : {}),
        },
      });
    } catch (err) { next(err); }
  },
);

// ── List + detail ────────────────────────────────────────────────────────────
router.get('/examinations/papers', protect, async (req, res, next) => {
  try {
    const scoped = applyReadScope(req.user, {
      courseId: req.query.courseId, examType: req.query.examType, status: req.query.status,
      programId: req.query.programId, semester: req.query.semester,
      schoolId: req.query.schoolId, departmentId: req.query.departmentId,
    });
    // Plain Teacher/Viewer roles only ever see papers they hold some assignment on —
    // broader academic-scope visibility (School/Department Admin) is a deliberate
    // exception already applied above by applyReadScope.
    if (!OVERSEER_ROLES.includes(req.user.role)) {
      scoped.assignedUserId = req.user.id;
    }
    const papers = await listQuestionPapers(scoped);
    res.json({ success: true, data: papers });
  } catch (err) { next(err); }
});

router.get('/examinations/papers/:id', protect, async (req, res, next) => {
  try {
    const paper = await loadPaperOr404(req, res);
    if (!paper) return;
    if (!OVERSEER_ROLES.includes(req.user.role) && !(await isAssignedAnyOf(paper.id, req.user.id, ['PAPER_REVIEWER', 'PAPER_VERIFIER', 'PAPER_APPROVER', 'MARKS_ENTRY', 'EVALUATOR', 'MODERATOR']))) {
      return res.status(403).json({ success: false, message: 'Forbidden: you have no assignment on this paper.' });
    }
    const [questions, assignments, marksSubmissions] = await Promise.all([
      getQuestionsForPaper(paper.id),
      getAssignmentsForPaper(paper.id),
      listByPaperId(paper.id),
    ]);
    const mine = assignments.filter((a) => a.user_id === req.user.id);
    const myResponsibilities = [...new Set(mine.map((a) => a.responsibility))];
    res.json({
      success: true,
      data: {
        paper, questions, assignments, marksSubmissions,
        // Kept for the existing single-submission callers; null once a paper is
        // allocated per class, which is why marksSubmissions is the list to read.
        marksSubmission: marksSubmissions.find((m) => m.class_id === null) || null,
        myResponsibilities,
        myClassIds: mine.map((a) => a.class_id).filter((c) => c !== null),
        canOversee: OVERSEER_ROLES.includes(req.user.role),
        awaitingConfirmation: isAwaitingConfirmation(paper),
      },
    });
  } catch (err) { next(err); }
});

// ── Auto-Mapping Review: draft → Confirm & Publish ───────────────────────────
// Examination Cell (authorizeExamWrite scope) only. Reviewers assigned later work on the
// published rows through PUT /questions/:questionConfigId as before.
router.get('/examinations/papers/:id/draft', protect, authorizeExamWrite('paper'), async (req, res, next) => {
  try {
    const paper = await loadPaperOr404(req, res);
    if (!paper) return;
    const draft = await getExtractionDraft(paper.id);
    if (!draft) return res.status(404).json({ success: false, message: 'No extraction draft exists for this paper.' });
    const context = await reviewContext(paper);
    res.json({ success: true, data: { ...draftResponse(paper, draft, context), awaitingConfirmation: isAwaitingConfirmation(paper) } });
  } catch (err) { next(err); }
});

const loadEditableDraft = async (req, res) => {
  const paper = await loadPaperOr404(req, res);
  if (!paper) return null;
  if (!isAwaitingConfirmation(paper)) {
    res.status(400).json({ success: false, message: 'This paper has no auto-mapping awaiting confirmation. Published questions are corrected through the paper review instead.' });
    return null;
  }
  const draft = await getExtractionDraft(paper.id);
  if (!draft) {
    res.status(404).json({ success: false, message: 'No extraction draft exists for this paper.' });
    return null;
  }
  return { paper, draft };
};

const staleDraft = (res) => res.status(409).json({
  success: false,
  message: 'This draft was changed by someone else — reload to see the latest version.',
});

router.put('/examinations/papers/:id/draft', protect, authorizeExamWrite('paper'), async (req, res, next) => {
  try {
    const loaded = await loadEditableDraft(req, res);
    if (!loaded) return;
    const updated = applyDraftEdits(loaded.draft, req.body);
    if (!(await updateExtractionDraft(loaded.paper.id, updated, req.user.id, loaded.draft.revision))) return staleDraft(res);
    const context = await reviewContext(loaded.paper);
    res.json({ success: true, data: draftResponse(loaded.paper, updated, context) });
  } catch (err) { next(err); }
});

// body: { engine?: 'ai' | 'heuristic' } — 'ai' (default) falls back to the keyword
// engine when AI is not configured or fails, and says so in draft.suggestionRun.error.
router.post('/examinations/papers/:id/draft/suggest', protect, authorizeExamWrite('paper'), async (req, res, next) => {
  try {
    const loaded = await loadEditableDraft(req, res);
    if (!loaded) return;
    const { paper, draft } = loaded;
    const context = await reviewContext(paper);
    const items = suggestionItems(draft);
    if (items.length === 0) {
      return res.json({ success: true, message: 'Every question already has a CO and an RBT level.', data: draftResponse(paper, draft, context) });
    }
    const result = await suggestCoRbt({
      course: suggestionCourse(context), outcomes: context.outcomes, items, useAi: req.body?.engine !== 'heuristic',
    });
    const updated = { ...attachSuggestions(draft, result), revision: draft.revision + 1 };
    if (!(await updateExtractionDraft(paper.id, updated, req.user.id, draft.revision))) return staleDraft(res);
    await logAction({
      actorUserId: req.user.id, actorName: req.user.email, action: 'PAPER_MAPPING_SUGGESTED',
      entityType: 'question_paper', entityId: paper.id,
      details: { engine: result.engine, model: result.model, questions: items.length, error: result.error },
    });
    res.json({ success: true, data: draftResponse(paper, updated, context) });
  } catch (err) { next(err); }
});

router.post('/examinations/papers/:id/confirm', protect, authorizeExamWrite('paper'), async (req, res, next) => {
  try {
    const loaded = await loadEditableDraft(req, res);
    if (!loaded) return;
    const { paper, draft } = loaded;
    if (req.body?.revision !== undefined && Number(req.body.revision) !== draft.revision) return staleDraft(res);

    const context = await reviewContext(paper);
    const review = evaluateDraft(draft, context.rules);
    if (!review.canPublish) {
      const blocking = review.summary.needsReview;
      return res.status(422).json({
        success: false,
        message: blocking > 0
          ? `${blocking} question(s) still need review — resolve every Needs Review item before publishing.`
          : review.paper.find((issue) => issue.severity === 'error')?.message,
        data: draftResponse(paper, draft, context),
      });
    }

    const questions = toPublishQuestions(draft);
    await applyPaperQuestions(paper.course_id, paper.exam_type, paper.id, questions);
    const confirmedNow = await confirmMapping(paper.id, req.user.id, {
      maxMarks: draft.meta.maxMarks, durationMinutes: draft.meta.durationMinutes,
    });
    if (confirmedNow) {
      const active = draft.rows.filter((row) => !row.removed);
      await logAction({
        actorUserId: req.user.id, actorName: req.user.email, action: 'PAPER_MAPPING_CONFIRMED',
        entityType: 'question_paper', entityId: paper.id,
        details: {
          questions: questions.length,
          sources: review.summary.sources,
          addedRows: active.filter((row) => row.manual).length,
          removedRows: review.summary.removed,
          editedText: active.filter((row) => row.extracted && row.questionText !== row.extracted.questionText).length,
          warnings: review.paper.filter((issue) => issue.severity === 'warning').map((issue) => issue.code),
        },
      });
    }
    const [finalPaper, published] = await Promise.all([getQuestionPaperById(paper.id), getQuestionsForPaper(paper.id)]);
    res.json({ success: true, data: { paper: finalPaper, questions: published } });
  } catch (err) { next(err); }
});

// ── My Assigned Examinations ─────────────────────────────────────────────────
router.get('/examinations/my-assignments', protect, async (req, res, next) => {
  try {
    const rows = await getAssignmentsForUser(req.user.id, req.user.role);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// ── Assignments (reviewer/approver/marks-entry) ──────────────────────────────
router.post('/examinations/papers/:id/assignments', protect, authorizeExamWrite('paper'), async (req, res, next) => {
  try {
    const paper = await loadPaperOr404(req, res);
    if (!paper) return;
    const { email, responsibility, deadline, classId } = req.body;
    const VALID = ['PAPER_REVIEWER', 'PAPER_VERIFIER', 'PAPER_APPROVER', 'MARKS_ENTRY', 'EVALUATOR', 'MODERATOR'];
    if (!VALID.includes(responsibility)) {
      return res.status(400).json({ success: false, message: `responsibility must be one of ${VALID.join(', ')}.` });
    }
    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ success: false, message: `No user found with email ${email}.` });

    // classId scopes the responsibility to one section. Omitted, it stays paper-level
    // ("every class on this paper"), which is what every pre-per-class assignment means.
    if (classId) {
      const [[klass]] = await pool.query('SELECT id FROM academic_classes WHERE id = ?', [classId]);
      if (!klass) return res.status(404).json({ success: false, message: 'Class not found.' });
    }
    const { assignment } = await assignResponsibility({
      questionPaperId: paper.id, courseId: paper.course_id, userId: user.id,
      responsibility, assignedBy: req.user.id, deadline, classId: classId || null,
    });

    // MARKS_ENTRY reuses the EXISTING marks endpoints (GET/POST /courses/:id/marks),
    // which are gated by the pre-existing checkCoursePermission/user_course_assignments —
    // grant that course-level access here so the assignee doesn't need a second, separate
    // grant. PAPER_REVIEWER etc. don't need this: they act entirely through the new
    // examination endpoints, which check paper_assignments directly.
    if (responsibility === 'MARKS_ENTRY') {
      await assignUserToCourse(paper.course_id, user.id, 'Teacher');
    }

    if (paper.status === 'UPLOADED' || paper.status === 'EXTRACTED') {
      await updatePaperStatus(paper.id, 'ASSIGNED_FOR_REVIEW');
    }

    await logAction({
      actorUserId: req.user.id, actorName: req.user.email, action: 'PAPER_ASSIGNED',
      entityType: 'question_paper', entityId: paper.id, details: { userId: user.id, responsibility },
    });
    await notify({
      userId: user.id, type: 'PAPER_ASSIGNMENT', title: `New ${responsibility.replace('_', ' ').toLowerCase()} assignment`,
      message: `You have been assigned ${responsibility.replace('_', ' ')} for a question paper.`,
      relatedEntityType: 'question_paper', relatedEntityId: paper.id,
    });
    if (['PAPER_REVIEWER', 'MARKS_ENTRY'].includes(responsibility)) {
      sendMail({
        to: user.email, subject: 'New examination assignment — CT University OBE ERP',
        html: `<p>Hello ${user.name},</p><p>You have been assigned <b>${responsibility.replace('_', ' ')}</b> for a question paper. Please log in to the ERP to view it.</p>`,
      }).catch(() => {});
    }
    res.json({ success: true, data: assignment });
  } catch (err) { next(err); }
});

router.delete('/examinations/papers/:id/assignments/:assignmentId', protect, authorizeExamWrite('paper'), async (req, res, next) => {
  try {
    const ok = await removeAssignment(req.params.assignmentId);
    if (!ok) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    res.json({ success: true, message: 'Assignment removed.' });
  } catch (err) { next(err); }
});

// ── Assign class (reuses the existing enrollment pipeline) ──────────────────
router.post('/examinations/papers/:id/assign-class', protect, authorizeExamWrite('paper'), async (req, res, next) => {
  try {
    const paper = await loadPaperOr404(req, res);
    if (!paper) return;
    const { classId } = req.body;
    if (!classId) return res.status(400).json({ success: false, message: 'classId is required.' });
    const enrolledCount = await enrollEntireClassInCourse(classId, paper.course_id);
    await logAction({
      actorUserId: req.user.id, actorName: req.user.email, action: 'CLASS_ASSIGNED',
      entityType: 'question_paper', entityId: paper.id, details: { classId, enrolledCount },
    });
    res.json({ success: true, message: `Class assigned — ${enrolledCount} student(s) enrolled in this course.` });
  } catch (err) { next(err); }
});

// ── Reviewer correction of one question row ──────────────────────────────────
// Deliberately NOT gated by authorizeExamWrite: a plain Teacher holding the
// PAPER_REVIEWER/PAPER_VERIFIER responsibility on THIS specific paper must be able
// to act here even outside their own school/department scope — canActAs() below is
// the real gate (overseer roles bypass it, everyone else needs the assignment).
router.put('/examinations/papers/:id/questions/:questionConfigId', protect, async (req, res, next) => {
  try {
    const paper = await loadPaperOr404(req, res);
    if (!paper) return;
    if (!(await canActAs(req, paper.id, ['PAPER_REVIEWER', 'PAPER_VERIFIER']))) {
      return res.status(403).json({ success: false, message: 'Forbidden: you are not the assigned reviewer for this paper.' });
    }
    if (isAwaitingConfirmation(paper)) return rejectUnconfirmed(res);
    const [[before]] = await pool.query('SELECT * FROM question_configs WHERE id = ? AND question_paper_id = ?', [req.params.questionConfigId, paper.id]);
    if (!before) return res.status(404).json({ success: false, message: 'Question not found on this paper.' });

    const { coNumber, maxMarks, questionText, rbtLevel } = req.body;
    const after = await updateQuestionConfigFields(req.params.questionConfigId, { coNumber, maxMarks, questionText, rbtLevel });

    if (paper.status === 'ASSIGNED_FOR_REVIEW') await updatePaperStatus(paper.id, 'UNDER_REVIEW');
    await logAction({
      actorUserId: req.user.id, actorName: req.user.email, action: 'CO_MAPPING_CHANGED',
      entityType: 'question_config', entityId: after.id,
      details: { questionNumber: before.question_number, before: { co_id: before.co_id, max_marks: before.max_marks, rbt_level: before.rbt_level }, after: { co_id: after.co_id, max_marks: after.max_marks, rbt_level: after.rbt_level } },
    });
    res.json({ success: true, data: after });
  } catch (err) { next(err); }
});

// ── Verify / Approve / Reject / Revise ───────────────────────────────────────
// Same as above: gated by canActAs() inside the handler, not authorizeExamWrite.
router.post('/examinations/papers/:id/verify', protect, async (req, res, next) => {
  try {
    const paper = await loadPaperOr404(req, res);
    if (!paper) return;
    if (!(await canActAs(req, paper.id, ['PAPER_REVIEWER', 'PAPER_VERIFIER']))) {
      return res.status(403).json({ success: false, message: 'Forbidden: you are not the assigned reviewer for this paper.' });
    }
    if (isAwaitingConfirmation(paper)) return rejectUnconfirmed(res);
    const updated = await updatePaperStatus(paper.id, 'VERIFIED');
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'PAPER_REVIEWED', entityType: 'question_paper', entityId: paper.id });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.post('/examinations/papers/:id/approve', protect, async (req, res, next) => {
  try {
    const paper = await loadPaperOr404(req, res);
    if (!paper) return;
    if (paper.status !== 'VERIFIED') {
      return res.status(400).json({ success: false, message: 'Only a VERIFIED paper can be approved.' });
    }
    const hasSeparateApprover = await isAssignedAnyOf(paper.id, req.user.id, ['PAPER_APPROVER']);
    const soleReviewer = (await countDistinctReviewers(paper.id)) <= 1;
    if (!OVERSEER_ROLES.includes(req.user.role) && !hasSeparateApprover && !(soleReviewer && await canActAs(req, paper.id, ['PAPER_REVIEWER']))) {
      return res.status(403).json({ success: false, message: 'Forbidden: you are not authorized to approve this paper.' });
    }

    const updated = await updatePaperStatus(paper.id, 'APPROVED');
    // One marks lifecycle per allocated class, so CSE-A and CSE-B sharing this paper
    // submit and lock independently. With no class-scoped evaluator this creates the
    // single paper-level row approval has always created.
    const allocatedClasses = await getAllocatedClassesForPaper(paper.id);
    await createForPaperClasses(paper.id, paper.course_id, allocatedClasses.map((c) => c.class_id));
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'PAPER_APPROVED', entityType: 'question_paper', entityId: paper.id });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.post('/examinations/papers/:id/reject', protect, async (req, res, next) => {
  try {
    const paper = await loadPaperOr404(req, res);
    if (!paper) return;
    if (!(await canActAs(req, paper.id, ['PAPER_REVIEWER', 'PAPER_VERIFIER', 'PAPER_APPROVER']))) {
      return res.status(403).json({ success: false, message: 'Forbidden: you are not an assigned reviewer/approver for this paper.' });
    }
    if (paper.status === 'APPROVED') {
      return res.status(400).json({ success: false, message: 'An already-approved paper cannot be rejected — revise it instead.' });
    }
    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ success: false, message: 'A rejection reason is required.' });
    const updated = await updatePaperStatus(paper.id, 'REJECTED', { rejectionReason: reason });
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'PAPER_REJECTED', entityType: 'question_paper', entityId: paper.id, details: { reason } });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ── Re-upload a corrected version of a rejected paper ────────────────────────
// Creates a NEW question_papers row (version = old + 1) and runs the same extraction
// pipeline as the initial upload, then links old -> new via superseded_by_id so the
// rejected version stays in history rather than being overwritten. Only a REJECTED
// paper may be superseded — a paper still in review is corrected row-by-row via the
// /questions/:questionConfigId endpoint above, and an APPROVED paper is the source of
// truth for an examination already in progress and must not be replaced silently.
router.post(
  '/examinations/papers/:id/reupload',
  protect,
  authorizeExamWrite('paper'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const oldPaper = await loadPaperOr404(req, res);
      if (!oldPaper) return;
      if (oldPaper.status !== 'REJECTED') {
        return res.status(400).json({ success: false, message: 'Only a REJECTED paper can be superseded by a corrected re-upload.' });
      }
      if (oldPaper.superseded_by_id) {
        return res.status(400).json({ success: false, message: 'This paper has already been superseded by a newer version.' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'A corrected question paper file is required.' });
      }

      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const storedName = `${Date.now()}-${safeFileName(req.file.originalname)}`;
      const filePath = path.join(UPLOAD_DIR, storedName);
      fs.writeFileSync(filePath, req.file.buffer);

      const newPaper = await createQuestionPaper({
        courseId: oldPaper.course_id, examType: oldPaper.exam_type, paperSet: oldPaper.paper_set,
        filePath, fileName: req.file.originalname, fileMime: req.file.mimetype, fileSize: req.file.size,
        uploadedBy: req.user.id, version: (oldPaper.version || 1) + 1,
      });

      await logAction({
        actorUserId: req.user.id, actorName: req.user.email, action: 'PAPER_UPLOADED',
        entityType: 'question_paper', entityId: newPaper.id,
        details: {
          courseId: oldPaper.course_id, examType: oldPaper.exam_type, fileName: req.file.originalname,
          supersedes: oldPaper.id, version: newPaper.version,
        },
      });

      await extractIntoDraft(newPaper, req.file, req.user.id);

      // Link old -> new so the rejected version stays visible in history but can no
      // longer be actioned — canActAs/loadPaperOr404 callers should route to the new id.
      await updatePaperStatus(oldPaper.id, oldPaper.status, { supersededById: newPaper.id });

      const finalPaper = await getQuestionPaperById(newPaper.id);
      const questions = await getQuestionsForPaper(newPaper.id);
      res.json({ success: true, data: { paper: finalPaper, questions, supersedes: oldPaper.id } });
    } catch (err) { next(err); }
  },
);

// ── Marks submission lifecycle ───────────────────────────────────────────────
router.post('/examinations/papers/:id/marks-submission/submit', protect, async (req, res, next) => {
  try {
    const paper = await loadPaperOr404(req, res);
    if (!paper) return;
    if (!(await canActAs(req, paper.id, ['MARKS_ENTRY']))) {
      return res.status(403).json({ success: false, message: 'Forbidden: you are not the assigned marks-entry teacher for this paper.' });
    }
    // A class-scoped evaluator submits only their own section. A paper-level
    // (class_id NULL) assignment still covers every class, as it always did.
    const { classId } = req.body;
    if (!OVERSEER_ROLES.includes(req.user.role)) {
      const scope = await getClassesForUserOnPaper(paper.id, req.user.id, ['MARKS_ENTRY']);
      if (!scope.allClasses && !scope.classIds.includes(Number(classId))) {
        return res.status(403).json({ success: false, message: 'Forbidden: you are not the marks-entry teacher for that class.' });
      }
    }
    const updated = await submit(paper.id, req.user.id, classId || null);
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'MARKS_SUBMITTED', entityType: 'question_paper', entityId: paper.id });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.post('/examinations/papers/:id/marks-submission/lock', protect, authorizeExamWrite('paper'), async (req, res, next) => {
  try {
    const paper = await loadPaperOr404(req, res);
    if (!paper) return;
    const updated = await lock(paper.id, req.body.classId || null);
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'MARKS_LOCKED', entityType: 'question_paper', entityId: paper.id, details: { classId: req.body.classId || null } });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.post('/examinations/papers/:id/marks-submission/reopen', protect, authorizeExamWrite('paper'), async (req, res, next) => {
  try {
    const paper = await loadPaperOr404(req, res);
    if (!paper) return;
    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ success: false, message: 'A reason is required to reopen marks entry.' });
    const updated = await reopen(paper.id, req.user.id, reason, req.body.classId || null);
    await logAction({ actorUserId: req.user.id, actorName: req.user.email, action: 'MARKS_REOPENED', entityType: 'question_paper', entityId: paper.id, details: { reason, classId: req.body.classId || null } });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ── Dashboard stats ───────────────────────────────────────────────────────────
router.get('/examinations/stats', protect, async (req, res, next) => {
  try {
    const scoped = applyReadScope(req.user, {});
    const stats = await getStats(scoped);
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
});

// ── Examination campaigns ─────────────────────────────────────────────────────
// NOTE ON ROUTE ORDER: every literal path under /examinations (/papers,
// /my-assignments, /stats) is registered ABOVE this line, so the /examinations/:id
// routes below can never shadow them. Keep new literal paths above this line.
const streamWorkbook = async (res, workbook, filename) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
};

const loadExaminationOr404 = async (req, res) => {
  const examination = await getExaminationById(req.params.id);
  if (!examination) {
    res.status(404).json({ success: false, message: 'Examination not found.' });
    return null;
  }
  return examination;
};

router.get('/examinations', protect, async (req, res, next) => {
  try {
    const rows = await listExaminations({
      status: req.query.status,
      examType: req.query.examType,
      academicSessionId: req.query.academicSessionId,
    });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/examinations', protect, authorizeRoles(...OVERSEER_ROLES), async (req, res, next) => {
  try {
    const { name, code, examType, academicSessionId, startDate, endDate, status } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'An examination name is required.' });
    }
    if (!['MTT', 'ETT'].includes(examType)) {
      return res.status(400).json({ success: false, message: 'examType must be MTT or ETT.' });
    }
    const examination = await createExamination({
      name: name.trim(), code: code ? code.trim() : null, examType,
      academicSessionId, startDate, endDate, status, createdBy: req.user.id,
    });
    await logAction({
      actorUserId: req.user.id, actorName: req.user.email, action: 'EXAMINATION_CREATED',
      entityType: 'examination', entityId: examination.id, details: { name, examType },
    });
    res.json({ success: true, data: examination });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'An examination with that code already exists.' });
    }
    return next(err);
  }
});

router.get('/examinations/:id', protect, async (req, res, next) => {
  try {
    const examination = await loadExaminationOr404(req, res);
    if (!examination) return;
    const progress = await getExaminationProgress(examination.id);
    res.json({ success: true, data: { examination, progress } });
  } catch (err) { next(err); }
});

router.patch('/examinations/:id', protect, authorizeRoles(...OVERSEER_ROLES), async (req, res, next) => {
  try {
    const examination = await loadExaminationOr404(req, res);
    if (!examination) return;
    const updated = await updateExamination(examination.id, req.body);
    await logAction({
      actorUserId: req.user.id, actorName: req.user.email, action: 'EXAMINATION_UPDATED',
      entityType: 'examination', entityId: examination.id, details: req.body,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ── Bulk teacher allocation ───────────────────────────────────────────────────
// The three-step loop the Examination Cell actually uses:
//   template → preview (validates, writes nothing) → import (writes valid rows only).

router.get(
  '/examinations/:id/allocation-template',
  protect,
  authorizeRoles(...OVERSEER_ROLES),
  async (req, res, next) => {
    try {
      const examination = await loadExaminationOr404(req, res);
      if (!examination) return;
      const workbook = await buildAllocationTemplateWorkbook(examination);
      const safeName = (examination.code || examination.name).replace(/[^a-zA-Z0-9._-]/g, '_');
      await streamWorkbook(res, workbook, `allocation_${safeName}.xlsx`);
    } catch (err) { next(err); }
  },
);

router.post(
  '/examinations/:id/allocation/preview',
  protect,
  authorizeRoles(...OVERSEER_ROLES),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const examination = await loadExaminationOr404(req, res);
      if (!examination) return;
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Please upload an Excel (.xlsx/.xls) or CSV allocation file.' });
      }
      const result = await validateAllocationWorkbook({
        buffer: req.file.buffer, filename: req.file.originalname, examinationId: examination.id,
      });
      return res.json({ success: true, data: result });
    } catch (err) { return next(err); }
  },
);

// Fans the committed allocations out to their owners. Deliberately AFTER the import
// transaction: a mail or notification outage must never roll back allocations that
// are already correctly written.
const announceAllocations = async (examination, notifications) => {
  for (const n of notifications) {
    const label = n.responsibility === 'PAPER_REVIEWER' ? 'Paper Review' : 'Marks Entry';
    const where = [n.subjectName, n.classLabel].filter(Boolean).join(' — ');
    await notify({
      userId: n.userId,
      type: 'PAPER_ASSIGNMENT',
      title: `New ${label} assignment`,
      message: `${examination.name}: you have been assigned ${label} for ${where}.`,
      relatedEntityType: 'question_paper',
      relatedEntityId: n.questionPaperId,
    });
  }

  const byUser = new Map();
  for (const n of notifications) {
    if (!byUser.has(n.userId)) byUser.set(n.userId, []);
    byUser.get(n.userId).push(n);
  }
  if (byUser.size === 0) return;

  const ids = [...byUser.keys()];
  const [users] = await pool.query(
    `SELECT id, name, email FROM teachers WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ids,
  );
  // ONE digest per teacher, not one mail per allocated class — a 350-row sheet must
  // not drop 350 emails into one person's inbox.
  for (const user of users) {
    const lines = (byUser.get(user.id) || []).map((n) => {
      const label = n.responsibility === 'PAPER_REVIEWER' ? 'Paper Review' : 'Marks Entry';
      return `<li>${label} — ${[n.subjectName, n.classLabel].filter(Boolean).join(' — ')}</li>`;
    }).join('');
    sendMail({
      to: user.email,
      subject: `${examination.name} — your examination assignments`,
      html: `<p>Hello ${user.name},</p><p>You have been allocated the following for <b>${examination.name}</b>:</p><ul>${lines}</ul><p>Please log in to the ERP to act on them.</p>`,
    }).catch(() => {});
  }
};

router.post(
  '/examinations/:id/allocation/import',
  protect,
  authorizeRoles(...OVERSEER_ROLES),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const examination = await loadExaminationOr404(req, res);
      if (!examination) return;
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Please upload an Excel (.xlsx/.xls) or CSV allocation file.' });
      }

      const result = await importAllocations({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        examinationId: examination.id,
        importedBy: req.user.id,
      });

      await logAction({
        actorUserId: req.user.id, actorName: req.user.email, action: 'ALLOCATION_IMPORTED',
        entityType: 'examination', entityId: examination.id,
        details: { fileName: req.file.originalname, ...result.summary },
      });

      await announceAllocations(examination, result.notifications);

      return res.json({ success: true, data: { summary: result.summary, rows: result.rows } });
    } catch (err) { return next(err); }
  },
);

// Re-emits the rejected rows as a workbook the Cell fixes in place and re-uploads.
router.post(
  '/examinations/:id/allocation/error-file',
  protect,
  authorizeRoles(...OVERSEER_ROLES),
  async (req, res, next) => {
    try {
      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ success: false, message: 'No rows to export.' });
      }
      const workbook = await buildAllocationErrorWorkbook(rows);
      await streamWorkbook(res, workbook, 'allocation_errors.xlsx');
      return undefined;
    } catch (err) { return next(err); }
  },
);

// ── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications', protect, async (req, res, next) => {
  try {
    const rows = await getForUser(req.user.id, { unreadOnly: req.query.unreadOnly === 'true' });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.patch('/notifications/:id/read', protect, async (req, res, next) => {
  try {
    const ok = await markRead(req.params.id, req.user.id);
    if (!ok) return res.status(404).json({ success: false, message: 'Notification not found.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
