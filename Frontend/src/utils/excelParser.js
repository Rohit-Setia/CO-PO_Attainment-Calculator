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

  rows.forEach((row, r) => {
    row.forEach((cell) => {
      const h = norm(cell)
      if (["name", "studentname"].includes(h)) nameRow = r
      if (h === "co1" || h === "co1%") coRow = r
    })
  })

  return nameRow === -1 || coRow === -1
    ? null
    : { nameRow, coRow }
}

/* =========================
   COLLECT POSSIBLE CO COLS
========================= */
const collectCoCandidates = (rows, coRow) => {
  const candidates = {}

  rows[coRow].forEach((cell, idx) => {
    const raw = String(cell).toLowerCase()
    COS.forEach((co) => {
      if (raw.includes(co)) {
        if (!candidates[co]) candidates[co] = []
        candidates[co].push(idx)
      }
    })
  })

  return candidates
}

/* =========================
   CHOOSE RAW MARK COLUMN
========================= */
const pickBestColumn = (rows, colIndexes, startRow, coMax) => {
  for (const idx of colIndexes) {
    let valid = true

    for (let r = startRow; r < rows.length; r++) {
      const val = Number(rows[r][idx])
      if (isNaN(val)) continue
      if (val > coMax * 1.5) {
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
  setStatus
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

      const startRow = Math.max(header.nameRow, header.coRow) + 1
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
      /* ---- FIND CO CANDIDATES ---- */
      const candidates = collectCoCandidates(rows, header.coRow)

      COS.forEach((co) => {
        if (!candidates[co]) return
        colMap[co] = pickBestColumn(
          rows,
          candidates[co],
          startRow,
          coMax[co]
        )
      })

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
          }

          let total = 0

          COS.forEach((co) => {
            const idx = colMap[co]
            let val = Number(r[idx])

            if (isNaN(val) || val < 0 || val > coMax[co]) val = 0

            student[co] = val
            total += val
          })

          student.totalMarks = total
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