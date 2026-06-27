import * as XLSX from "xlsx"
import { COS } from "./calculations"

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
      if (h.startsWith("co1")) {
        coRow = r
      }
      if (/^(?:q|question)1(?:%)?$/.test(h)) {
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

/* =========================
   COLLECT POSSIBLE CO COLS
========================= */
const collectCoCandidates = (rows, coRow) => {
  const candidates = {}
  if (coRow === -1 || !rows[coRow]) return candidates

  rows[coRow].forEach((cell, idx) => {
    if (cell === undefined || cell === null) return
    const h = norm(cell)
    COS.forEach((co) => {
      if (h.startsWith(co)) {
        if (!candidates[co]) candidates[co] = []
        if (h.includes("%")) {
          candidates[co].push(idx)
        } else {
          candidates[co].unshift(idx)
        }
      }
    })
  })

  return candidates
}

/* =============================
   COLLECT POSSIBLE QUESTION COLS
============================= */
const collectQuestionCandidates = (rows, qRow) => {
  const candidates = {}
  if (qRow === -1 || !rows[qRow]) return candidates

  rows[qRow].forEach((cell, idx) => {
    if (cell === undefined || cell === null) return
    const h = norm(cell)
    const match = h.match(/^(?:q|question)(\d+)(?:%)?$/)
    if (match) {
      const qId = parseInt(match[1])
      if (!candidates[qId]) candidates[qId] = []
      if (h.includes("%")) {
        candidates[qId].push(idx)
      } else {
        candidates[qId].unshift(idx)
      }
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
export const parseExcel = (
  file,
  coMax,
  totalMax,
  setStudents,
  setStatus,
  questions
) => {
  const reader = new FileReader()

  reader.onload = (e) => {
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

      /* ---- FIND QUESTION CANDIDATES ---- */
      const qCandidates = collectQuestionCandidates(rows, header.qRow)
      const qCols = {}
      Object.entries(qCandidates).forEach(([qId, idxs]) => {
        let maxMarks = 10
        if (questions) {
          const qConfig = questions.find((q) => q.id === parseInt(qId))
          if (qConfig) maxMarks = qConfig.maxMarks
        }
        qCols[qId] = pickBestColumn(rows, idxs, startRow, maxMarks)
      })

      /* ---- FIND CO CANDIDATES ---- */
      if (header.coRow !== -1) {
        const candidates = collectCoCandidates(rows, header.coRow)
        COS.forEach((co) => {
          if (!candidates[co]) return
          const maxMark = (coMax && coMax[co]) || 100
          colMap[co] = pickBestColumn(
            rows,
            candidates[co],
            startRow,
            maxMark
          )
        })
      }

      /* ---- READ STUDENTS ---- */
      const students = rows
        .slice(startRow)
        .filter((r) => r[colMap.name])
        .map((r, i) => {
          const student = {
            serialNo: r[colMap.sr] ?? i + 1,
            roll: r[colMap.roll] ?? "",
            name: r[colMap.name],
            totalMarks: 0,
            questionMarks: {},
            co1: 0,
            co2: 0,
            co3: 0,
            co4: 0,
            co5: 0,
            co6: 0,
          }

          const hasQCols = Object.keys(qCols).length > 0
          if (hasQCols) {
            let total = 0
            Object.entries(qCols).forEach(([qId, idx]) => {
              const val = Number(r[idx])
              const parsedVal = isNaN(val) || val < 0 ? 0 : val
              student.questionMarks[qId] = parsedVal
              total += parsedVal
            })
            student.totalMarks = total

            if (questions && questions.length > 0) {
              questions.forEach((q) => {
                const mark = student.questionMarks[q.id] || 0
                const coKey = String(q.co).toLowerCase()
                if (student[coKey] !== undefined) {
                  student[coKey] += mark
                }
              })
            }
          }

          let coTotal = 0
          let hasCos = false
          COS.forEach((co) => {
            const idx = colMap[co]
            if (idx !== undefined) {
              const maxMark = (coMax && coMax[co]) || 100
              let val = Number(r[idx])
              if (isNaN(val) || val < 0 || val > maxMark) val = 0
              student[co] = val
              coTotal += val
              hasCos = true
            }
          })

          if (hasCos && !hasQCols) {
            student.totalMarks = coTotal
          }

          return student
        })

      setStudents(students)
      setStatus(`✅ Loaded ${students.length} students`)
    } catch (err) {
      console.error(err)
      setStatus("❌ Excel parsing failed")
    }
  }
  reader.readAsArrayBuffer(file)
}