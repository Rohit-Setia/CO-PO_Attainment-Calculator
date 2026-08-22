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
  }
  reader.readAsArrayBuffer(file)
}
