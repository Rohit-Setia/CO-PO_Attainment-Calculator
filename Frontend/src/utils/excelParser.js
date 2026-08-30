import * as XLSX from "xlsx"

/* =========================
   NORMALIZE HEADER (SAFE)
========================= */
const norm = (v = "") =>
  String(v).toLowerCase().replace(/[\s._-]/g, "")

/* =========================
   FIND HEADER ROWS
========================= */
const detectHeaderRows = (rows) => {
  let nameRow = -1
  let coRow = -1
  let qRow = -1

  rows.forEach((row, r) => {
    if (!Array.isArray(row)) return
    row.forEach((cell) => {
      if (cell === undefined || cell === null) return
      const h = norm(cell)
      if (["name", "studentname"].includes(h)) {
        nameRow = r
      }
      if (/^co\d+(?:%)?$/.test(h)) {
        coRow = r
      }
      if (/^(?:q|question)\d+(?:%)?$/.test(h)) {
        qRow = r
      }
    })
  })

  if (nameRow === -1) {
    if (coRow !== -1) nameRow = coRow
    else if (qRow !== -1) nameRow = qRow
    else return null
  }

  if (coRow === -1 && qRow === -1) {
    return null
  }

  return { nameRow, coRow, qRow }
}

/* =========================================
   COLLECT POSSIBLE CO COLS (dynamic CO list)
========================================= */
// `courseOutcomes` — the course's actual active COs: [{ id, co_number }]. A header "CO7" only
// matches if the course actually has a CO7 — there is no fixed CO1-6 assumption here.
const collectCoCandidates = (rows, coRow, courseOutcomes) => {
  const candidates = {} // co_id -> [colIdx]
  if (coRow === -1 || !rows[coRow]) return candidates
  const idByNumber = new Map(courseOutcomes.map((co) => [co.co_number, co.id]))

  rows[coRow].forEach((cell, idx) => {
    if (cell === undefined || cell === null) return
    const h = norm(cell)
    const match = h.match(/^co(\d+)(?:%)?$/)
    if (!match) return
    const coNumber = parseInt(match[1], 10)
    const coId = idByNumber.get(coNumber)
    if (!coId) return // header references a CO this course doesn't have — ignore, don't guess
    if (!candidates[coId]) candidates[coId] = []
    if (h.includes("%")) candidates[coId].push(idx)
    else candidates[coId].unshift(idx)
  })

  return candidates
}

/* =====================================================
   COLLECT POSSIBLE QUESTION COLS (dynamic question list)
===================================================== */
const collectQuestionCandidates = (rows, qRow) => {
  const candidates = {}
  if (qRow === -1 || !rows[qRow]) return candidates

  rows[qRow].forEach((cell, idx) => {
    if (cell === undefined || cell === null) return
    const h = norm(cell)
    const match = h.match(/^(?:q|question)(\d+)(?:%)?$/)
    if (match) {
      const qNumber = parseInt(match[1], 10)
      if (!candidates[qNumber]) candidates[qNumber] = []
      if (h.includes("%")) candidates[qNumber].push(idx)
      else candidates[qNumber].unshift(idx)
    }
  })

  return candidates
}

/* =========================
   CHOOSE RAW MARK COLUMN
========================= */
const pickBestColumn = (rows, colIndexes, startRow, maxMarks) => {
  for (const idx of colIndexes) {
    let valid = true

    for (let r = startRow; r < rows.length; r++) {
      const val = Number(rows[r][idx])
      if (isNaN(val)) continue
      if (val > maxMarks * 1.5) {
        valid = false
        break
      }
    }

    if (valid) return idx
  }
  return colIndexes[0]
}

/* =========================
   PARSE EXCEL (FLEXIBLE)
========================= */
// courseOutcomes: [{ id, co_number, max_internal, max_external }] — the course's actual active COs.
// questionConfigs: [{ id, question_number, co_id, max_marks }] or null when in Direct CO-wise mode.
// isInternal: which max-marks field to validate CO columns against (MTT=internal, ETT=external).
export const parseExcel = (
  file,
  courseOutcomes,
  isInternal,
  setStudents,
  setStatus,
  questionConfigs,
  setIssues
) => {
  const reader = new FileReader()

  reader.onload = (e) => {
    const issues = []
    try {
      const wb = XLSX.read(e.target.result, { type: "array" })
      const sheet = wb.Sheets[wb.SheetNames[0]]

      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
      })

      const header = detectHeaderRows(rows)
      if (!header) {
        setStatus("❌ Could not detect headers")
        return
      }

      const startRow = Math.max(header.nameRow, header.coRow, header.qRow) + 1
      /* ---- FIND NAME / REG ---- */
      const colMap = {}
      rows[header.nameRow].forEach((cell, idx) => {
        const h = norm(cell)
        if (h.includes("sr")) colMap.sr = idx
        else if (h.includes("reg")) colMap.roll = idx
        else if (h === "name" || h === "studentname") colMap.name = idx
      })
      if (colMap.name == null) {
        setStatus("❌ Name column not found")
        return
      }

      const hasQuestionConfig = Array.isArray(questionConfigs) && questionConfigs.length > 0

      /* ---- FIND QUESTION CANDIDATES ---- */
      const qCandidates = hasQuestionConfig ? collectQuestionCandidates(rows, header.qRow) : {}
      const qCols = {} // question_config_id -> colIdx
      if (hasQuestionConfig) {
        const qcByNumber = new Map(questionConfigs.map((q) => [q.question_number, q]))
        Object.entries(qCandidates).forEach(([qNumberStr, idxs]) => {
          const qNumber = parseInt(qNumberStr, 10)
          const qc = qcByNumber.get(qNumber)
          if (!qc) {
            issues.push(`Column "Q${qNumber}" in the file doesn't match any configured question — ignored.`)
            return
          }
          qCols[qc.id] = { colIdx: pickBestColumn(rows, idxs, startRow, qc.max_marks), qc }
        })
        // Warn about configured questions with no matching column at all
        questionConfigs.forEach((qc) => {
          if (!qCols[qc.id]) issues.push(`No column found for Q${qc.question_number} — it will be left blank.`)
        })
      }

      /* ---- FIND CO CANDIDATES (Direct CO-wise mode only) ---- */
      const coCols = {} // co_id -> colIdx
      if (!hasQuestionConfig && header.coRow !== -1) {
        const candidates = collectCoCandidates(rows, header.coRow, courseOutcomes)
        courseOutcomes.forEach((co) => {
          if (!candidates[co.id]) return
          const maxMark = (isInternal ? co.max_internal : co.max_external) || 100
          coCols[co.id] = pickBestColumn(rows, candidates[co.id], startRow, maxMark)
        })
      }

      /* ---- READ STUDENTS ---- */
      const dataRows = rows.slice(startRow)
      const skippedCount = dataRows.filter((r) => !r[colMap.name]).length
      if (skippedCount > 0) {
        issues.push(`${skippedCount} row(s) skipped — missing student name.`)
      }

      const students = dataRows
        .filter((r) => r[colMap.name])
        .map((r, i) => {
          const rowLabel = `Row ${startRow + i + 1} (${r[colMap.name]})`
          const roll = r[colMap.roll]
          if (roll === undefined || roll === "" || roll === null) {
            issues.push(`${rowLabel}: missing registration number.`)
          }

          const student = {
            serialNo: r[colMap.sr] ?? i + 1,
            roll: roll ?? "",
            name: r[colMap.name],
            totalMarks: 0,
            coMarks: {},
            questionMarks: {},
          }

          if (hasQuestionConfig) {
            let total = 0
            const perCoTotals = {}
            Object.entries(qCols).forEach(([qcId, { colIdx, qc }]) => {
              const raw = r[colIdx]
              const val = Number(raw)
              const isInvalid = raw !== "" && (isNaN(val) || val < 0 || val > qc.max_marks)
              if (isInvalid) {
                issues.push(`${rowLabel}: Q${qc.question_number} mark "${raw}" is invalid (max ${qc.max_marks}) — set to 0.`)
              }
              const parsedVal = isNaN(val) || val < 0 || val > qc.max_marks ? 0 : val
              student.questionMarks[qcId] = parsedVal
              total += parsedVal
              perCoTotals[qc.co_id] = (perCoTotals[qc.co_id] || 0) + parsedVal
            })
            student.totalMarks = total
            student.coMarks = perCoTotals
          } else {
            let coTotal = 0
            courseOutcomes.forEach((co) => {
              const idx = coCols[co.id]
              if (idx === undefined) return
              const maxMark = (isInternal ? co.max_internal : co.max_external) || 100
              const raw = r[idx]
              let val = Number(raw)
              const isInvalid = raw !== "" && (isNaN(val) || val < 0 || val > maxMark)
              if (isInvalid) {
                issues.push(`${rowLabel}: CO${co.co_number} mark "${raw}" exceeds max (${maxMark}) or is invalid — set to 0.`)
              }
              if (isNaN(val) || val < 0 || val > maxMark) val = 0
              student.coMarks[co.id] = val
              coTotal += val
            })
            student.totalMarks = coTotal
          }

          return student
        })

      // Duplicate registration numbers within the same sheet
      const rollCounts = new Map()
      students.forEach((s) => {
        const key = String(s.roll).trim().toLowerCase()
        if (!key) return
        rollCounts.set(key, (rollCounts.get(key) || 0) + 1)
      })
      rollCounts.forEach((count, key) => {
        if (count > 1) {
          issues.push(`Duplicate registration number "${key}" appears ${count} times.`)
        }
      })

      setStudents(students)
      if (setIssues) setIssues(issues)
      setStatus(
        issues.length > 0
          ? `⚠️ Loaded ${students.length} students with ${issues.length} issue(s) — review before saving.`
          : `✅ Loaded ${students.length} students`
      )
    } catch (err) {
      console.error(err)
      setStatus("❌ Excel parsing failed")
      if (setIssues) setIssues([])
    }
  }  // ← closes reader.onload
  reader.readAsArrayBuffer(file)
}

/*
  inferQuestionConfigsFromExcel(file, courseOutcomes)
  ─────────────────────────────────────────────────────
  Promise-based. Inspects the raw header structure of the uploaded Excel and attempts
  to extract question configurations automatically:
    • Detects Q-header row (Q1, Q2, ... or Question1 …).
    • Detects CO row (CO1, CO2 … or CO-# labels aligned below each question).
    • Detects max-marks row (numeric row immediately after the question header row).
    • Returns: { questions: [{ question_number, co_number, max_marks }], warnings: [] }
    • Returns null if no question headers are found (caller falls back to CO-wise mode).

  co_number is resolved from the CO column in the sheet. If a question's CO cannot be
  determined, co_number is set to null with a warning; the caller can still auto-save
  other questions that do have a CO assignment.
*/
export const inferQuestionConfigsFromExcel = (file, courseOutcomes) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        const header = detectHeaderRows(rows);
        if (!header || header.qRow === -1) {
          resolve(null); // No question headers — not a question-wise sheet
          return;
        }

        const warnings = [];
        const qRow = rows[header.qRow];

        // Build: question_number -> colIdx
        const qColByNumber = {};
        qRow.forEach((cell, idx) => {
          const h = norm(cell);
          const m = h.match(/^(?:q|question)(\d+)(?:%)?$/);
          if (m && !h.includes('%')) {
            qColByNumber[parseInt(m[1], 10)] = idx;
          }
        });

        const questionNumbers = Object.keys(qColByNumber).map(Number).sort((a, b) => a - b);
        if (questionNumbers.length === 0) { resolve(null); return; }

        // Detect CO row: prefer a row ABOVE the qRow that has CO1, CO2 … headers.
        // If not found, fall back to the coRow detected by detectHeaderRows.
        let coRowIdx = header.coRow;

        // Build: colIdx -> co_number (from whatever CO row we have)
        const coByColIdx = {};
        if (coRowIdx !== -1 && rows[coRowIdx]) {
          rows[coRowIdx].forEach((cell, idx) => {
            const h = norm(cell);
            const m = h.match(/^co(\d+)$/);
            if (m) coByColIdx[idx] = parseInt(m[1], 10);
          });
        }

        // If there is a CO row BELOW the question-header row (pattern: q-header row, then a CO-label row),
        // use that instead — common pattern in MTT sheets.
        const rowAfterQ = rows[header.qRow + 1] || [];
        let usedSubRow = false;
        const subRowCoMap = {};
        rowAfterQ.forEach((cell, idx) => {
          const h = norm(cell);
          const m = h.match(/^co(\d+)$/);
          if (m) { subRowCoMap[idx] = parseInt(m[1], 10); usedSubRow = true; }
        });
        if (usedSubRow && Object.keys(subRowCoMap).length > 0) {
          Object.assign(coByColIdx, subRowCoMap);
        }

        // Detect max-marks row: scan the 2-3 rows after qRow for a row that has
        // numeric values in the question columns.
        let maxMarksRow = null;
        const scanStart = header.qRow + (usedSubRow ? 2 : 1);
        for (let r = scanStart; r < Math.min(rows.length, scanStart + 4); r++) {
          const rowCells = rows[r] || [];
          const qValues = questionNumbers.map((q) => Number(rowCells[qColByNumber[q]]));
          const allNumeric = qValues.every((v) => !isNaN(v) && v > 0);
          if (allNumeric) { maxMarksRow = r; break; }
        }

        // Resolve co_number for each question via its column's CO mapping.
        const questions = questionNumbers.map((qNum) => {
          const colIdx = qColByNumber[qNum];
          const coNumber = coByColIdx[colIdx] ?? null;
          const rawMax = maxMarksRow !== null ? Number(rows[maxMarksRow]?.[colIdx]) : NaN;
          const maxMarks = !isNaN(rawMax) && rawMax > 0 ? rawMax : 10; // default 10 if not found

          if (coNumber === null) {
            warnings.push(`Q${qNum}: could not determine CO assignment from the sheet — set it manually after import.`);
          } else {
            const coExists = courseOutcomes.some((c) => c.co_number === coNumber);
            if (!coExists) {
              warnings.push(`Q${qNum}: references CO${coNumber} which is not configured for this course.`);
            }
          }

          return { question_number: qNum, co_number: coNumber, max_marks: maxMarks };
        });

        resolve({ questions, warnings });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });

/* =========================
   PARSE STUDENT EXCEL (Phase 10)
   =========================
   The Teacher uploads a student list with columns:
     Enrollment No / Reg No / Roll No / Student Name / Email / Phone

   The backend derives School, Department, Program, Session, Semester from the
   course context — the Teacher never enters academic structure information.
*/
export const parseStudentExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) { reject(new Error('No sheets found in the workbook.')); return; }

        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (rows.length === 0) { reject(new Error('No student rows found.')); return; }

        const headers = Object.keys(rows[0]);
        const findCol = (aliases) => headers.find((hdr) => aliases.some((a) => norm(hdr).includes(a)));

        const enrollmentCol = findCol(['enrollment', 'regno', 'reg_no', 'registration', 'studentid', 'studentno']);
        const rollCol = findCol(['roll', 'rollno', 'roll_no']);
        const nameCol = findCol(['name', 'studentname', 'student_name']);
        const emailCol = findCol(['email', 'e-mail', 'mail']);
        const phoneCol = findCol(['phone', 'mobile', 'contact', 'telephone']);

        if (!enrollmentCol || !nameCol) {
          reject(new Error("Could not find 'Enrollment No' and 'Student Name' columns. Expected headers: Enrollment No, Roll No, Student Name, Email, Phone."));
          return;
        }

        const students = rows.map((row, idx) => ({
          rowNumber: idx + 2,
          enrollmentNo: String(row[enrollmentCol] || '').trim(),
          rollNo: rollCol ? String(row[rollCol] || '').trim() : '',
          name: String(row[nameCol] || '').trim(),
          email: emailCol ? String(row[emailCol] || '').trim() : '',
          phone: phoneCol ? String(row[phoneCol] || '').trim() : '',
        })).filter((s) => s.enrollmentNo && s.name);

        resolve(students);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
};
