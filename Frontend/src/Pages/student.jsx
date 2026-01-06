import React, { useState,useEffect,useCallback } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

import FileActions from "@/components/FileActions"
import CoMaxEditor from "@/components/CoMaxEditor"
import StudentTable from "@/components/StudentTable"

import { calculateAttainment, downloadExcel } from '@/Api/AttainmentApi'
import AttainmentResults from '@/components/AttainmentResult'
import { Button } from "@/components/ui/button"

import { parseExcel } from "@/utils/excelParser"
import { COS} from "@/utils/calculations"

const normalizeStudent = (student, coMax, totalMax) => {
  const fixed = { ...student }
  let total = 0

  COS.forEach((co) => {
    let val = Number(fixed[co])

    if (isNaN(val) || val < 0) val = 0
    if (val > coMax[co]) val = coMax[co]

    fixed[co] = val
    total += val
  })

  fixed.totalMarks = Math.min(total, totalMax)
  return fixed
}

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

  // Re-normalize students when coMax or totalMax changes
  useEffect(() => {
    if (!students.length) return

    setStudents((prev) =>
      prev.map((s) => normalizeStudent(s, coMax, totalMax))
    )
  }, [coMax, totalMax])

  const updateMark = useCallback(
    (index, co, value) => {
      setStudents((prev) => {
        if (!prev[index]) return prev

        const updated = [...prev]
        const student = { ...updated[index] }

        let entered = Number(value)
        if (isNaN(entered) || entered < 0) entered = 0
        entered = Math.min(entered, coMax[co])

        // Calculate sum of other COs
        const otherSum = COS.reduce(
          (sum, c) => (c === co ? sum : sum + (student[c] || 0)),
          0
        )

        const remaining = Math.max(0, totalMax - otherSum)
        student[co] = Math.min(entered, remaining)

        updated[index] = normalizeStudent(student, coMax, totalMax)
        return updated
      })
    },
    [coMax, totalMax]
  )

  const handleCalculate = useCallback(async () => {
    if (!students.length || isCalculating) return

    setIsCalculating(true)
    try {
      const res = await calculateAttainment(
        students,
        coMax,
        thresholdPercent,
        levelCriteria
      )
      setResults(res.data)
      setStatus(null) // Clear any previous errors
    } catch (error) {
      console.error("Calculation error:", error)
      setStatus("Failed to calculate attainment. Please try again.")
    } finally {
      setIsCalculating(false)
    }
  }, [students, coMax, thresholdPercent, levelCriteria, isCalculating])

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
  
  useEffect(() => {
    console.log("Students:", students)
  }, [students])
  

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
  onClick={handleCalculate}
  disabled={students.length === 0 || isCalculating}
  className="bg-blue-600 hover:bg-blue-700"
>
  {isCalculating ? 'Calculating...' : 'Calculate CO Attainment'}
</Button>

</div>
    </Card>

  )
}
