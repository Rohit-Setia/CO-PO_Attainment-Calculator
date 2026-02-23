import React, { useState,useEffect,useCallback } from "react"
import { useNavigate } from "react-router-dom"

import { Card, CardContent} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

import FileActions from "@/components/FileActions"
import CoMaxEditor from "@/components/CoMaxEditor"
import StudentTable from "@/components/StudentTable"

import { calculateAttainment, downloadExcel } from '@/Api/AttainmentApi'
import AttainmentResults from '@/components/AttainmentResult'
import { Button } from "@/components/ui/button"

import { parseExcel } from "@/utils/excelParser"
import { COS} from "@/utils/calculations"
import { useAuth } from "@/context/AuthContext"

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
  const navigate = useNavigate()
  const { logout } = useAuth()
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
  }, [coMax, totalMax, students.length])

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
  
  const academicDetails = JSON.parse(sessionStorage.getItem("academicDetails")) || null;
  useEffect(() => {
    if (!academicDetails) {
      navigate("/select");
    }
  }, [academicDetails, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 rounded-xl bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">CO-PO Attainment Calculator</h1>
            <p className="mt-1 text-sm text-slate-600">Calculate and analyze student CO-PO attainment levels</p>
            {academicDetails && (
    <p className="mt-2 text-sm text-slate-600">
      {academicDetails.subject} - {academicDetails.examType}
    </p>
  )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
        {/* Main Content Card */}
        <Card className="shadow-lg">
          <CardContent className="p-6">
            {/* CO MAX + TOTAL MAX */}
            <div className="mb-8">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Configuration</h2>
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
            </div>

            {/* FILE UPLOAD / DOWNLOAD */}
            <div className="mb-8">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Data Import/Export</h2>
              <FileActions
                students={students}
                onUpload={(file) =>
                  parseExcel(file, coMax, totalMax, setStudents, setStatus)
                }
                onDownload={downloadReportExcel}
                results={results}
              />
            </div>

            {/* Status Alert */}
            {status && (
              <Alert className="mb-6 border-l-4 border-blue-500 bg-blue-50">
                <AlertDescription className="text-blue-900">{status}</AlertDescription>
              </Alert>
            )}

            {/* Student Table */}
            {students.length > 0 && (
              <div className="mb-8">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Student Marks</h2>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <StudentTable
                    students={students}
                    updateMark={updateMark}
                    coMax={coMax}
                  />
                </div>
              </div>
            )}

            {/* Calculate Button */}
            <div className="mb-8 flex justify-center">
              <Button
                onClick={handleCalculate}
                disabled={students.length === 0 || isCalculating}
                className="bg-blue-600 px-8 py-3 text-base font-medium transition hover:bg-blue-700 disabled:opacity-50"
              >
                {isCalculating ? 'Calculating Attainment...' : 'Calculate CO Attainment'}
              </Button>
            </div>

            {/* Attainment Results */}
            {results && (
              <div>
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Results</h2>
                <AttainmentResults results={results} isLoading={isCalculating} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
