// ─────────────────────────────────────────────────────────────────────────────
// Bulk Question Paper Upload & Department Batch Extraction Service.
//
// Enables uploading multiple question papers at once for a department / program.
// 1. previewBulkPapers() parses each file's header and filename to auto-detect
//    the subject code, title, and paper set, matching against courses of that department.
// 2. executeBulkImport() creates each question paper and runs the extraction
//    pipeline into auto-mapping drafts for the Examination Cell to review.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { extractQuestionPaper } = require('./paperExtractionService');
const { createQuestionPaper, getQuestionPaperById } = require('../models/questionPaperModel');
const { logAction } = require('../models/adminAuditModel');

const normalize = (val) => (val ? String(val).toLowerCase().replace(/[^a-z0-9]/g, '') : '');

const safeFileName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

// Extract course code regex from text/filename: e.g. "BCSE301", "CS-201", "KCS-302", "ENG101"
const CODE_REGEX = /\b([a-zA-Z]{2,5}[-_\s]?\d{3,4}[a-zA-Z]?)\b/;

/**
 * Reads available courses scoped to the department, program, and session.
 */
const getAvailableCourses = async ({ departmentId, programId, academicYear } = {}) => {
  const conditions = ["c.status = 'Active'"];
  const params = [];

  if (departmentId) {
    conditions.push('p.department_id = ?');
    params.push(departmentId);
  }
  if (programId) {
    conditions.push('c.program_id = ?');
    params.push(programId);
  }
  if (academicYear) {
    conditions.push('c.academic_year = ?');
    params.push(academicYear);
  }

  const [rows] = await pool.query(
    `SELECT c.id, c.subject_name, c.course_code, c.semester, c.academic_year,
            c.program_id, p.name AS program_name, p.department_id, d.name AS department_name
     FROM courses c
     LEFT JOIN programs p ON p.id = c.program_id
     LEFT JOIN departments d ON d.id = p.department_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.course_code ASC`,
    params,
  );
  return rows;
};

/**
 * Previews uploaded files, runs quick parsing on each, and auto-matches
 * candidate courses from the department.
 */
const previewBulkPapers = async (files = [], { departmentId, programId, examType = 'MTT', academicYear } = {}) => {
  const courses = await getAvailableCourses({ departmentId, programId, academicYear });

  const previews = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    let detectedCode = null;
    let detectedTitle = null;
    let detectedPaperSet = null;
    let detectedExamType = examType || 'MTT';
    let questionCount = 0;
    let extractionStatus = 'pending';
    let extractionError = null;

    // Detect from filename first
    const filenameCodeMatch = file.originalname.match(CODE_REGEX);
    if (filenameCodeMatch) {
      detectedCode = filenameCodeMatch[1].replace(/[-_\s]/g, '');
    }

    const setMatch = file.originalname.match(/(?:Set|set)[-_\s]?([a-zA-Z0-9]+)/i);
    if (setMatch) {
      detectedPaperSet = `Set ${setMatch[1]}`;
    }

    if (/mtt|internal|mid/i.test(file.originalname)) {
      detectedExamType = 'MTT';
    } else if (/ett|external|end/i.test(file.originalname)) {
      detectedExamType = 'ETT';
    }

    // Run extractor on buffer to inspect document headers & questions
    try {
      const extraction = await extractQuestionPaper(file.buffer, file.mimetype, file.originalname);
      extractionStatus = extraction.status;
      if (extraction.status === 'extracted') {
        questionCount = extraction.questions?.length || 0;
        if (extraction.meta?.subjectCode) {
          detectedCode = extraction.meta.subjectCode;
        }
        if (extraction.meta?.subjectName) {
          detectedTitle = extraction.meta.subjectName;
        }
        if (extraction.meta?.paperSet) {
          detectedPaperSet = extraction.meta.paperSet;
        }
      } else {
        extractionError = extraction.error;
      }
    } catch (err) {
      extractionStatus = 'failed';
      extractionError = err.message;
    }

    // Match against department courses
    let matchedCourse = null;
    let matchConfidence = 'NONE';

    if (detectedCode) {
      const normDetected = normalize(detectedCode);
      const exactCode = courses.find((c) => normalize(c.course_code) === normDetected);
      if (exactCode) {
        matchedCourse = exactCode;
        matchConfidence = 'HIGH';
      }
    }

    // Try matching if filename contains the course code
    if (!matchedCourse) {
      const normFilename = normalize(file.originalname);
      const codeInName = courses.find((c) => normFilename.includes(normalize(c.course_code)));
      if (codeInName) {
        matchedCourse = codeInName;
        matchConfidence = 'MEDIUM';
      }
    }

    // Try matching subject name
    if (!matchedCourse && detectedTitle) {
      const normTitle = normalize(detectedTitle);
      const titleMatch = courses.find((c) => {
        const normSub = normalize(c.subject_name);
        return normSub === normTitle || normSub.includes(normTitle) || normTitle.includes(normSub);
      });
      if (titleMatch) {
        matchedCourse = titleMatch;
        matchConfidence = 'MEDIUM';
      }
    }

    previews.push({
      fileIndex: i,
      fileName: file.originalname,
      fileSize: file.size,
      fileMime: file.mimetype,
      detectedCode: detectedCode || '',
      detectedTitle: detectedTitle || '',
      detectedPaperSet: detectedPaperSet || 'Set 1',
      detectedExamType,
      matchConfidence,
      matchedCourseId: matchedCourse ? matchedCourse.id : '',
      matchedCourse: matchedCourse
        ? {
            id: matchedCourse.id,
            course_code: matchedCourse.course_code,
            subject_name: matchedCourse.subject_name,
            semester: matchedCourse.semester,
          }
        : null,
      questionCount,
      extractionStatus,
      extractionError,
    });
  }

  return {
    courses: courses.map((c) => ({
      id: c.id,
      course_code: c.course_code,
      subject_name: c.subject_name,
      semester: c.semester,
      academic_year: c.academic_year,
    })),
    previews,
  };
};

/**
 * Executes creation and extraction for the mapped papers.
 */
const executeBulkImport = async ({
  files = [],
  mappings = [],
  uploadDir,
  userId,
  userEmail,
  extractIntoDraft,
}) => {
  fs.mkdirSync(uploadDir, { recursive: true });

  const results = [];

  for (const mapping of mappings) {
    const file = files[mapping.fileIndex];
    if (!file) continue;

    const courseId = Number(mapping.courseId);
    if (!courseId) {
      results.push({
        fileName: file.originalname,
        success: false,
        error: 'No course assigned for this paper.',
      });
      continue;
    }

    try {
      const storedName = `${Date.now()}-${mapping.fileIndex}-${safeFileName(file.originalname)}`;
      const filePath = path.join(uploadDir, storedName);
      fs.writeFileSync(filePath, file.buffer);

      const paper = await createQuestionPaper({
        courseId,
        examType: mapping.examType || 'MTT',
        paperSet: mapping.paperSet || 'Set 1',
        filePath,
        fileName: file.originalname,
        fileMime: file.mimetype,
        fileSize: file.size,
        uploadedBy: userId,
      });

      await logAction({
        actorUserId: userId,
        actorName: userEmail,
        action: 'PAPER_UPLOADED',
        entityType: 'question_paper',
        entityId: paper.id,
        details: {
          courseId,
          examType: mapping.examType || 'MTT',
          fileName: file.originalname,
          bulkImport: true,
        },
      });

      const { extraction, draft } = await extractIntoDraft(paper, file, userId);
      const finalPaper = await getQuestionPaperById(paper.id);

      results.push({
        paperId: finalPaper.id,
        courseId,
        fileName: file.originalname,
        examType: finalPaper.exam_type,
        paperSet: finalPaper.paper_set,
        extractionStatus: finalPaper.extraction_status,
        confidence: finalPaper.extraction_confidence,
        reviewRequired: Boolean(finalPaper.mapping_review_required),
        questionCount: draft?.rows?.length || 0,
        success: true,
      });
    } catch (err) {
      results.push({
        fileName: file.originalname,
        courseId,
        success: false,
        error: err.message,
      });
    }
  }

  return {
    total: mappings.length,
    successfulCount: results.filter((r) => r.success).length,
    failedCount: results.filter((r) => !r.success).length,
    results,
  };
};

module.exports = {
  getAvailableCourses,
  previewBulkPapers,
  executeBulkImport,
};
