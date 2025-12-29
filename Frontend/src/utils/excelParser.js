import * as XLSX from "xlsx"

/* =========================
   CONSTANTS
========================= */
const COS = ["co1", "co2", "co3", "co4", "co5"]

/* =========================
   NORMALIZE TEXT
========================= */
const norm = (v = "") =>
  String(v).toLowerCase().replace(/[\s._-]/g, "")

/* =========================
   MERGE HEADER ROWS
   (for complex Excel, but safe for simple)
========================= */
const mergeRows = (rows, start, depth = 3) => {
  const merged = []
  const baseRow = rows[start] || []

  for (let c = 0; c < baseRow.length; c++) {
    let value = ""
    for (let r = start; r < start + depth && rows[r]; r++) {
      const cell = rows[r][c]
      if (cell !== undefined && cell !== null && String(cell).trim() !== "") {
        value += norm(cell)
      }
    }
    merged[c] = value
  }

  return merged
}

/* =========================
   DETECT HEADER ROW
========================= */
export const detectHeaderRow = (rows) => {
  let bestIndex = -1
  let bestScore = 0

  for (let i = 0; i < rows.length; i++) {
    const merged = mergeRows(rows, i)

    let score = 0

    if (merged.some((c) => c.includes("name"))) score += 3
    if (merged.some((c) => c.includes("reg") || c.includes("roll"))) score += 2

    const coCount = COS.filter((co) =>
      merged.some((c) => c.includes(co))
    ).length

    score += coCount * 2

    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  // minimum confidence threshold
  return bestScore >= 5 ? bestIndex : -1
}

/* =========================
   BUILD COLUMN MAP
========================= */
export const buildColumnMap = (rows, headerIndex) => {
  const merged = mergeRows(rows, headerIndex)
  const map = {}

  merged.forEach((cell, idx) => {
    if (cell.includes("sr")) map.sr = idx
    else if (cell.includes("reg") || cell.includes("roll")) map.reg = idx
    else if (cell.includes("name")) map.name = idx
    else if (cell.includes("co1")) map.co1 = idx
    else if (cell.includes("co2")) map.co2 = idx
    else if (cell.includes("co3")) map.co3 = idx
    else if (cell.includes("co4")) map.co4 = idx
    else if (cell.includes("co5")) map.co5 = idx
  })

  return map
}

/* =========================
   MAIN PARSER
========================= */
export const parseExcel = (
  file,
  coMax,
  totalMax,
  setStudents,
  setStatus
) => {
  if (!file) return

  const reader = new FileReader()

  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "array" })
      const sheet = wb.Sheets[wb.SheetNames[0]]

      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
      })

      if (!rows.length) {
        setStatus("❌ Empty Excel file")
        return
      }

      const headerIndex = detectHeaderRow(rows)
      if (headerIndex === -1) {
        setStatus("❌ Student table header not detected")
        return
      }

      const colMap = buildColumnMap(rows, headerIndex)

      if (!colMap.name) {
        setStatus("❌ Name column not found")
        return
      }

      /* 🔥 IMPORTANT FIX HERE
         Only skip ONE header row
      */
      const dataRows = rows.slice(headerIndex + 1)

      const students = dataRows
        .filter((r) => r[colMap.name])
        .map((r, i) => {
          let acc = 0

          const student = {
            serialNo: colMap.sr !== undefined ? r[colMap.sr] : i + 1,
            roll: colMap.reg !== undefined ? r[colMap.reg] : "",
            name: r[colMap.name],
            totalMarks: 0,
          }

          COS.forEach((co) => {
            const raw =
              colMap[co] !== undefined ? Number(r[colMap[co]]) || 0 : 0

            const allowed = Math.min(
              coMax[co],
              Math.max(0, totalMax - acc)
            )

            student[co] = Math.min(raw, allowed)
            acc += student[co]
          })

          student.totalMarks = acc
          return student
        })

      setStudents(students)
      setStatus(`✅ Loaded ${students.length} students`)
    } catch (err) {
      console.error(err)
      setStatus("❌ Failed to read Excel file")
    }
  }

  reader.readAsArrayBuffer(file)
}
