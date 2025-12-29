import React, { useState } from "react"
import * as XLSX from "xlsx"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

import FileActions from "@/components/FileActions"
import CoMaxEditor from "@/components/CoMaxEditor"
import StudentTable from "@/components/StudentTable"

import { calculateAttainment, downloadExcel } from '@/Api/AttainmentApi'
import AttainmentResults from '@/components/AttainmentResult'
import { Button } from "@/components/ui/button"

import { parseExcel } from "@/utils/excelParser"
import { COS, calcOverallPercent, calcCoPercent } from "@/utils/calculations"

export default function Student() {
  const [students, setStudents] = useState([])
  const [status, setStatus] = useState(null)

  const [coMax, setCoMax] = useState({
    co1: 10,
    co2: 10,
    co3: 10,
    co4: 15,
    co5: 15,
  })

  const [totalMax, setTotalMax] = useState(60)

  const [thresholdPercent, setThresholdPercent] = useState(40)
const [levelCriteria, setLevelCriteria] = useState({
  level3: 70,
  level2: 60, 
  level1: 50
})


const [results, setResults] = useState(null)
const [isCalculating, setIsCalculating] = useState(false)

  /* ======================
     UPDATE CO MARK
  ====================== */
  const updateMark = (index, co, value) => {
    setStudents((prev) => {
      const copy = [...prev]
      const s = { ...copy[index], [co]: Number(value) || 0 }

      const otherSum = COS.reduce(
        (sum, c) => (c === co ? sum : sum + (s[c] || 0)),
        0
      )

      s[co] = Math.min(s[co], coMax[co], totalMax - otherSum)
      s.totalMarks = COS.reduce((sum, c) => sum + (s[c] || 0), 0)
      s.percentage = calcOverallPercent(s, coMax)

      copy[index] = s
      return copy
    })
  }

  /* ======================
     DOWNLOAD EXCEL
  ====================== */
  const downloadReportExcel = async () => {
    if (!results) {
      setStatus('Please calculate first!')
      return
    }
    
    try {
      const blob = await downloadExcel(students, coMax, results, levelCriteria, thresholdPercent);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'CO_Attainment_Report.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus('Report downloaded!');
    } catch (error) {
      setStatus('Download error: ' + error.message);
    }
  }
  
  return (
    <Card className="p-6">
      <CardHeader>
        <CardTitle>CO Marks Calculator</CardTitle>
      </CardHeader>

      <CardContent>
        {/* CO MAX + TOTAL MAX */}
        <CoMaxEditor
          coMax={coMax}
          setCoMax={setCoMax}
          totalMax={totalMax}
          setTotalMax={setTotalMax}
          thresholdPercent={thresholdPercent}
          setThresholdPercent={setThresholdPercent}
          levelCriteria={levelCriteria}
          setLevelCriteria={setLevelCriteria}
        />



        {/* FILE UPLOAD / DOWNLOAD */}
        <FileActions
          students={students}
          onUpload={(file) =>
            parseExcel(file, coMax, totalMax, setStudents, setStatus)
          }
          onDownload={downloadReportExcel}
          results={results} 
        />

        {status && (
          <Alert className="mb-4">
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        )}

        {students.length > 0 && (
          <StudentTable
            students={students}
            updateMark={updateMark}
            coMax={coMax}
          />
        )}
        <AttainmentResults results={results} isLoading={isCalculating} />
      </CardContent>
      <div className="flex justify-center gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
  <Button 
    onClick={async () => {
      setIsCalculating(true)
      try {
        const res = await calculateAttainment(students, coMax,thresholdPercent, levelCriteria)
        setResults(res.data)
        setStatus(`Calculated! CO of Course: ${res.data.CO}`)
      } catch (e) {
        setStatus('Backend error: ' + e.message)
      }
      setIsCalculating(false)
    }}
    disabled={students.length === 0 || isCalculating}
    className="bg-blue-600 hover:bg-blue-700 "   
  >
    {isCalculating ? 'Calculating...' : 'Calculate CO Attainment'}
  </Button>
</div>
    </Card>

  )
}


// import React, { useState } from "react"
// import * as XLSX from "xlsx"

// import { Download } from "lucide-react"
// import { Button } from "@/components/ui/button"
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
// import { Alert, AlertDescription } from "@/components/ui/alert"
// import { Input } from "@/components/ui/input"

// /* =========================
//    CONSTANTS & HELPERS
// ========================= */
// const COS = ["co1", "co2", "co3", "co4", "co5"]

// const normalize = (v = "") =>
//   v.toString().toLowerCase().replace(/[\s._-]/g, "")

// /* =========================
//    AUTO-DETECTION LOGIC
// ========================= */
// const detectHeaderRow = (rows) => {
//   const keys = ["sr", "reg", "name", "co1", "co2"]
//   for (let i = 0; i < rows.length; i++) {
//     const row = rows[i].map(normalize)
//     const matches = keys.filter((k) =>
//       row.some((c) => c.includes(k))
//     ).length
//     if (matches >= 3) return i
//   }
//   return -1
// }

// const buildColumnMap = (headerRow) => {
//   const map = {}
//   headerRow.forEach((cell, idx) => {
//     const h = normalize(cell)
//     if (h.includes("sr")) map.sr = idx
//     else if (h.includes("reg")) map.reg = idx
//     else if (h.includes("name")) map.name = idx
//     else if (h === "co1") map.co1 = idx
//     else if (h === "co2") map.co2 = idx
//     else if (h === "co3") map.co3 = idx
//     else if (h === "co4") map.co4 = idx
//     else if (h === "co5") map.co5 = idx
//   })
//   return map
// }

// /* =========================
//    COMPONENT
// ========================= */
// export default function Student() {
//   const [students, setStudents] = useState([])
//   const [status, setStatus] = useState(null)

//   const [coMax, setCoMax] = useState({
//     co1: 10,
//     co2: 10,
//     co3: 10,
//     co4: 15,
//     co5: 15,
//   })

//   const [totalMax, setTotalMax] = useState(100)

//   /* =========================
//      CALCULATIONS
//   ========================= */
//   const calcOverallPercent = (s) => {
//     let obtained = 0
//     let max = 0
//     COS.forEach((co) => {
//       obtained += s[co] || 0
//       max += coMax[co]
//     })
//     return max === 0 ? 0 : Math.round((obtained / max) * 100)
//   }

//   const calcCoPercent = (val, max) =>
//     max === 0 ? "0.00" : ((val / max) * 100).toFixed(2)

//   /* =========================
//      EXCEL UPLOAD (AUTO-DETECT)
//   ========================= */
//   const handleFileUpload = (e) => {
//     const file = e.target.files[0]
//     if (!file) return

//     const reader = new FileReader()
//     reader.onload = (evt) => {
//       try {
//         const wb = XLSX.read(evt.target.result, { type: "array" })
//         const sheet = wb.Sheets[wb.SheetNames[0]]

//         const rows = XLSX.utils.sheet_to_json(sheet, {
//           header: 1,
//           defval: "",
//         })

//         const headerIndex = detectHeaderRow(rows)
//         if (headerIndex === -1) {
//           setStatus("Student table not detected")
//           return
//         }

//         const colMap = buildColumnMap(rows[headerIndex])
//         const dataRows = rows.slice(headerIndex + 1)

//         const parsed = dataRows
//           .filter((r) => r[colMap.name])
//           .map((r, i) => {
//             const student = {
//               serialNo: r[colMap.sr] || i + 1,
//               roll: r[colMap.reg] || "",
//               name: r[colMap.name] || "",
//               co1: Number(r[colMap.co1]) || 0,
//               co2: Number(r[colMap.co2]) || 0,
//               co3: Number(r[colMap.co3]) || 0,
//               co4: Number(r[colMap.co4]) || 0,
//               co5: Number(r[colMap.co5]) || 0,
//               totalMarks: 0,
//               percentage: 0,
//             }

//             // clamp COs
//             let acc = 0
//             COS.forEach((co) => {
//               const allowed = Math.min(coMax[co], Math.max(0, totalMax - acc))
//               student[co] = Math.min(student[co], allowed)
//               acc += student[co]
//             })

//             student.totalMarks = acc
//             student.percentage = calcOverallPercent(student)
//             return student
//           })

//         setStudents(parsed)
//         setStatus(`Loaded ${parsed.length} students`)
//       } catch {
//         setStatus("Invalid Excel file")
//       }
//     }

//     reader.readAsArrayBuffer(file)
//   }

//   /* =========================
//      UPDATE CO (WITH LIMIT)
//   ========================= */
//   const updateMark = (index, co, value) => {
//     const num = Math.max(0, Number(value) || 0)

//     setStudents((prev) => {
//       const copy = [...prev]
//       const s = { ...copy[index] }

//       const otherSum = COS.reduce(
//         (sum, c) => (c === co ? sum : sum + (s[c] || 0)),
//         0
//       )

//       const allowed = Math.min(coMax[co], Math.max(0, totalMax - otherSum))
//       s[co] = Math.min(num, allowed)

//       s.totalMarks = COS.reduce((sum, c) => sum + (s[c] || 0), 0)
//       s.percentage = calcOverallPercent(s)

//       copy[index] = s
//       return copy
//     })
//   }

//   /* =========================
//      DOWNLOAD EXCEL
//   ========================= */
//   const downloadExcel = () => {
//     const data = students.map((s) => ({
//       "Sr No": s.serialNo,
//       "Reg No": s.roll,
//       Name: s.name,
//       Total: s.totalMarks,
//       CO1: s.co1,
//       "CO1 %": calcCoPercent(s.co1, coMax.co1),
//       CO2: s.co2,
//       "CO2 %": calcCoPercent(s.co2, coMax.co2),
//       CO3: s.co3,
//       "CO3 %": calcCoPercent(s.co3, coMax.co3),
//       CO4: s.co4,
//       "CO4 %": calcCoPercent(s.co4, coMax.co4),
//       CO5: s.co5,
//       "CO5 %": calcCoPercent(s.co5, coMax.co5),
//       "Overall %": s.percentage,
//     }))

//     const ws = XLSX.utils.json_to_sheet(data)
//     const wb = XLSX.utils.book_new()
//     XLSX.utils.book_append_sheet(wb, ws, "CO Attainment")
//     XLSX.writeFile(wb, "CO_Attainment.xlsx")
//   }

//   /* =========================
//      UI
//   ========================= */
//   return (
//     <div className="p-6">
//       <Card>
//         <CardHeader>
//           <CardTitle>CO Marks Calculator</CardTitle>
//           <CardDescription>
//             Auto-detect Excel → Edit marks → Download updated file
//           </CardDescription>
//         </CardHeader>

//         <CardContent>
//           {/* CO MAX + TOTAL */}
//           <div className="flex gap-4 flex-wrap mb-6">
//             {COS.map((co) => (
//               <div key={co} className="flex items-center gap-2">
//                 <span className="uppercase font-medium">{co} Max</span>
//                 <Input
//                   type="number"
//                   className="w-20"
//                   value={coMax[co]}
//                   onChange={(e) =>
//                     setCoMax({ ...coMax, [co]: Number(e.target.value) || 0 })
//                   }
//                 />
//               </div>
//             ))}
//             <div className="flex items-center gap-2">
//               <span className="uppercase font-medium">Total Max</span>
//               <Input
//                 type="number"
//                 className="w-24"
//                 value={totalMax}
//                 onChange={(e) =>
//                   setTotalMax(Math.max(0, Number(e.target.value) || 0))
//                 }
//               />
//             </div>
//           </div>

//           <div className="flex gap-4 mb-4">
//             <input type="file" accept=".xls,.xlsx" onChange={handleFileUpload} />
//             <Button disabled={!students.length} onClick={downloadExcel}>
//               <Download className="mr-2 h-4 w-4" />
//               Download Excel
//             </Button>
//           </div>

//           {status && (
//             <Alert className="mb-4">
//               <AlertDescription>{status}</AlertDescription>
//             </Alert>
//           )}

//           {students.length > 0 && (
//             <div className="overflow-x-auto">
//               <table className="border w-full text-sm">
//                 <thead className="bg-muted">
//                   <tr>
//                     <th>Sr</th>
//                     <th>Reg</th>
//                     <th>Name</th>
//                     <th>Total</th>
//                     {COS.map((c) => (
//                       <React.Fragment key={c}>
//                         <th>{c.toUpperCase()}</th>
//                         <th>%</th>
//                       </React.Fragment>
//                     ))}
//                     <th>Overall %</th>
//                   </tr>
//                 </thead>

//                 <tbody>
//                   {students.map((s, i) => (
//                     <tr key={i}>
//                       <td>{s.serialNo}</td>
//                       <td>{s.roll}</td>
//                       <td>{s.name}</td>
//                       <td>{s.totalMarks}</td>

//                       {COS.map((co) => (
//                         <React.Fragment key={co}>
//                           <td>
//                             <Input
//                               type="number"
//                               value={s[co]}
//                               onChange={(e) =>
//                                 updateMark(i, co, e.target.value)
//                               }
//                               className="w-20 text-center"
//                             />
//                           </td>
//                           <td className="text-center">
//                             {calcCoPercent(s[co], coMax[co])}%
//                           </td>
//                         </React.Fragment>
//                       ))}

//                       <td className="font-semibold">{s.percentage}%</td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>
//           )}
//         </CardContent>
//       </Card>
//     </div>
//   )
// }
