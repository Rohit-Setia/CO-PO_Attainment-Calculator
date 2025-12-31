import * as XLSX from "xlsx"

/* =========================
   CONSTANTS
========================= */
const COS = ["co1", "co2", "co3", "co4", "co5"]

/* =========================
   NORMALIZE
========================= */
const norm = (v = "") =>
  String(v).toLowerCase().replace(/[\s._-]/g, "")

/* =========================
   FIND ROW CONTAINING A KEY
========================= */
const findRowWith = (rows, matcher) =>
  rows.findIndex((row) => row.map(norm).some(matcher))

/* =========================
   DETECT HEADER ROWS (HYBRID)
========================= */
export const detectHeaderRows = (rows) => {
  const nameRow = findRowWith(rows, (c) =>
    c === "name" || c === "student" || c === "studentname"
  )

  const coRow = findRowWith(rows, (c) =>
    c === "co1" || c === "courseoutcome1"
  )

  if (nameRow === -1 || coRow === -1) return null

  return { nameRow, coRow }
}

/* =========================
   BUILD COLUMN MAP (STRICT)
========================= */
export const buildColumnMap = (rows, nameRow, coRow) => {
  const map = {}

  // 🔹 Name / Reg / Sr from nameRow
  rows[nameRow].forEach((cell, idx) => {
    const h = norm(cell)
    if (h.includes("sr")) map.sr = idx
    else if (h.includes("reg") || h.includes("roll")) map.reg = idx
    else if (h.includes("name")) map.name = idx
  })

  // 🔹 CO columns from coRow
  rows[coRow].forEach((cell, idx) => {
    const h = norm(cell)
    if (h === "co1") map.co1 = idx
    else if (h === "co2") map.co2 = idx
    else if (h === "co3") map.co3 = idx
    else if (h === "co4") map.co4 = idx
    else if (h === "co5") map.co5 = idx
  })

  return map
}

/* =========================
   MAIN PARSER (HYBRID MODE)
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

      /* =========================
         DETECT HEADER ROWS
      ========================= */
      const header = detectHeaderRows(rows)
      if (!header) {
        setStatus("❌ Name / CO headers not detected")
        return
      }

      const colMap = buildColumnMap(
        rows,
        header.nameRow,
        header.coRow
      )

      if (!colMap.name || colMap.co1 === undefined) {
        setStatus("❌ Required columns missing")
        return
      }

      /* =========================
         DATA START ROW
         (below both header rows)
      ========================= */
      const dataStart =
        Math.max(header.nameRow, header.coRow) + 1

      const dataRows = rows.slice(dataStart)

      /* =========================
         PARSE STUDENTS
      ========================= */
      const students = dataRows
        .filter((r) => r[colMap.name])
        .map((r, i) => {
          let acc = 0

          const student = {
            serialNo:
              colMap.sr !== undefined ? r[colMap.sr] : i + 1,
            roll:
              colMap.reg !== undefined ? r[colMap.reg] : "",
            name: r[colMap.name],
            totalMarks: 0,
          }

          COS.forEach((co) => {
            if (colMap[co] === undefined) {
              student[co] = 0
              return
            }

            const rawVal = Number(r[colMap[co]])
            const safeVal = isNaN(rawVal)
              ? 0
              : Math.max(0, rawVal)

            const allowed = Math.min(
              coMax[co],
              Math.max(0, totalMax - acc)
            )

            student[co] = Math.min(safeVal, allowed)
            acc += student[co]
          })

          student.totalMarks = acc
          return student
        })

      setStudents(students)
      setStatus(`✅ Loaded ${students.length} students`)
    } catch (err) {
      console.error(err)
      setStatus("❌ Failed to parse Excel file")
    }
  }

  reader.readAsArrayBuffer(file)
}