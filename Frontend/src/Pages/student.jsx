import React, { useState,useEffect,useCallback } from "react"
import { useNavigate } from "react-router-dom"

import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

import FileActions from "@/components/FileActions"
import CoMaxEditor from "@/components/CoMaxEditor"
import StudentTable from "@/components/StudentTable"

import { calculateAttainment, downloadExcel } from '@/Api/AttainmentApi'
import AttainmentResults from '@/components/AttainmentResult'
import { Button } from "@/components/ui/button"

import { parseExcel } from "@/utils/excelParser"
import { COS } from "@/utils/calculations"
import { useAuth } from "@/context/AuthContext"
import { fetchStudents, fetchGradingBoard, fetchCOs, saveGradingMarks, triggerDBAttainmentCalculation } from "../Api/erpApi"

const normalizeStudent = (student, coMax, totalMax) => {
  const fixed = { ...student }
  let total = 0

  COS.forEach((co) => {
    let val = Number(fixed[co])

    if (isNaN(val) || val < 0) val = 0
    if (val > coMax[co]) {
      val = coMax[co]
      fixed[co] = coMax[co]
    }

    total += val
  })

  fixed.totalMarks = Math.min(total, totalMax)
  return fixed
}

export default function Student() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [loading, setLoading] = useState(true)
  const [academicDetails, setAcademicDetails] = useState(null)
  const [dbStudents, setDbStudents] = useState([])
  const [dbMarks, setDbMarks] = useState([])
  const [dbCOs, setDbCOs] = useState([])

  const [rawStudents, setRawStudents] = useState([])
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

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      const detailsStr = sessionStorage.getItem("academicDetails")
      if (!detailsStr) {
        navigate("/select")
        return
      }
      const details = JSON.parse(detailsStr)
      setAcademicDetails(details)

      try {
        setLoading(true)

        // Load COs for subject first
        let cosList = []
        if (details.subjectId) {
          const cosRes = await fetchCOs(details.subjectId)
          cosList = cosRes.data.data
          setDbCOs(cosList)

          // Initialize coMax from COs if available
          const newCoMax = {}
          cosList.forEach((co, index) => {
            newCoMax[`co${index + 1}`] = 10 // Default value
          })
          setCoMax(newCoMax)
          // Set total max as sum of coMax
          setTotalMax(Object.values(newCoMax).reduce((sum, val) => sum + val, 0))
        }

        // Load students
        const studentsRes = await fetchStudents({ classroom_id: details.classroomId })
        const studentsList = studentsRes.data.data.map(student => ({
          id: student.id,
          roll: student.roll_no,
          name: student.name,
          regNo: student.reg_no,
          ...cosList.reduce((acc, _, index) => ({ ...acc, [`co${index + 1}`]: 0 }), {}),
          totalMarks: 0
        }))
        setDbStudents(studentsList)

        // Load grading board for existing marks
        const gradingRes = await fetchGradingBoard(details.classroomId, details.assessmentId)
        const { existingMarks: marksList } = gradingRes.data.data

        if (marksList && marksList.length > 0) {
          setDbMarks(marksList)
          // Group marks by student and CO
          const studentMarkMap = {}
          marksList.forEach(mark => {
            if (!studentMarkMap[mark.student_id]) studentMarkMap[mark.student_id] = {}
            // For CO-wise entry, we'll group by CO
            const coIndex = cosList.findIndex(co => co.id === mark.co_id)
            const coKey = `co${coIndex + 1}`
            if (coKey) {
              studentMarkMap[mark.student_id][coKey] = (studentMarkMap[mark.student_id][coKey] || 0) + mark.marks_obtained
            }
          })
          
          // Apply marks to students
          setRawStudents(studentsList.map(student => ({
            ...student,
            ...studentMarkMap[student.id]
          })))
        } else {
          setRawStudents(studentsList)
        }

      } catch (err) {
        console.error("Failed to load data", err)
        setStatus("Failed to load data from server")
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [navigate])

  // Re-normalize students when rawStudents, coMax or totalMax changes
  useEffect(() => {
    if (!rawStudents.length) {
      setStudents([]);
      return;
    }

    const activeTotalMax = totalMax === "" ? 9999 : Number(totalMax);
    const activeCoMax = {};
    COS.forEach((co) => {
      activeCoMax[co] = coMax[co] === "" ? 9999 : Number(coMax[co]);
    });

    setStudents(
      rawStudents.map((s) => normalizeStudent(s, activeCoMax, activeTotalMax))
    );
  }, [rawStudents, coMax, totalMax]);

  // Clear results whenever inputs change to avoid displaying stale results
  useEffect(() => {
    setResults(null);
  }, [rawStudents, coMax, totalMax, thresholdPercent, levelCriteria]);

  // Real-time autosave of student marks and configurations to sessionStorage
  useEffect(() => {
    if (rawStudents.length > 0) {
      sessionStorage.setItem("setupStudents", JSON.stringify(rawStudents));
    }
  }, [rawStudents]);

  useEffect(() => {
    const storedConfig = sessionStorage.getItem("coConfiguration");
    let config = {};
    if (storedConfig) {
      try {
        config = JSON.parse(storedConfig);
      } catch (e) {
        config = {};
      }
    }
    config.coMax = coMax;
    config.totalMax = totalMax;
    sessionStorage.setItem("coConfiguration", JSON.stringify(config));
  }, [coMax, totalMax]);

  const updateMark = useCallback(
    (index, co, value) => {
      setRawStudents((prevRaw) => {
        if (!prevRaw[index]) return prevRaw

        const updatedRaw = [...prevRaw]
        const studentRaw = { ...updatedRaw[index] }

        if (value === "" || /^\d*\.?\d*$/.test(value)) {
          studentRaw[co] = value
        }
        updatedRaw[index] = studentRaw
        return updatedRaw
      })
    },
    []
  );

  const handleMarkBlur = useCallback(
    (index, co) => {
      setRawStudents((prevRaw) => {
        if (!prevRaw[index]) return prevRaw

        const updatedRaw = [...prevRaw]
        const studentRaw = { ...updatedRaw[index] }
        const val = studentRaw[co]

        let parsed = parseFloat(val)
        if (val === "" || isNaN(parsed) || parsed < 0) {
          parsed = 0
        } else {
          const maxVal = coMax[co] === "" ? 9999 : Number(coMax[co])
          if (parsed > maxVal) {
            parsed = maxVal
          }
        }
        studentRaw[co] = parsed
        updatedRaw[index] = studentRaw
        return updatedRaw
      })
    },
    [coMax]
  );

  const handleCalculate = useCallback(async () => {
    if (!students.length || isCalculating) return

    setIsCalculating(true)
    try {
      // Save CO-wise marks first
      const marksPayload = students.flatMap(student => {
        return dbCOs.map((co, index) => {
          const coKey = `co${index + 1}`
          return {
            student_id: student.id,
            question_id: null,
            co_id: co.id,
            marks_obtained: student[coKey] || 0,
            is_absent: false
          }
        })
      })

      await saveGradingMarks({
        assessment_id: academicDetails.assessmentId,
        marks: marksPayload
      })

      const activeThreshold = thresholdPercent === "" ? 40 : Number(thresholdPercent);
      const activeLevelCriteria = {
        level3: levelCriteria.level3 === "" ? 70 : Number(levelCriteria.level3),
        level2: levelCriteria.level2 === "" ? 60 : Number(levelCriteria.level2),
        level1: levelCriteria.level1 === "" ? 50 : Number(levelCriteria.level1),
      };

      const activeTotalMax = totalMax === "" ? 9999 : Number(totalMax);
      const activeCoMax = {};
      Object.keys(coMax).forEach((co) => {
        activeCoMax[co] = coMax[co] === "" ? 9999 : Number(coMax[co]);
      });

      const res = await calculateAttainment(
        students,
        activeCoMax,
        activeThreshold,
        activeLevelCriteria
      )

      // Save attainment result using triggerDBAttainmentCalculation
      await triggerDBAttainmentCalculation({
        students,
        coMax: activeCoMax,
        thresholdPercent: activeThreshold,
        levelCriteria: activeLevelCriteria,
        subject_id: academicDetails.subjectId,
        classroom_id: academicDetails.classroomId,
        assessment_id: academicDetails.assessmentId
      })

      setResults(res.data)
      setStatus(null) // Clear any previous errors
    } catch (error) {
      console.error("Calculation error:", error)
      setStatus("Failed to calculate attainment: " + (error.response?.data?.message || error.message))
    } finally {
      setIsCalculating(false)
    }
  }, [students, coMax, totalMax, thresholdPercent, levelCriteria, isCalculating, academicDetails, dbCOs])

  /* ======================
     DOWNLOAD EXCEL
  ========================= */
  const downloadReportExcel = async () => {
    if (!results) {
      setStatus('Please calculate first!')
      return
    }
    
    try {
      const activeThreshold = thresholdPercent === "" ? 40 : Number(thresholdPercent);
      const activeLevelCriteria = {
        level3: levelCriteria.level3 === "" ? 70 : Number(levelCriteria.level3),
        level2: levelCriteria.level2 === "" ? 60 : Number(levelCriteria.level2),
        level1: levelCriteria.level1 === "" ? 50 : Number(levelCriteria.level1),
      };

      const activeTotalMax = totalMax === "" ? 9999 : Number(totalMax);
      const activeCoMax = {};
      Object.keys(coMax).forEach((co) => {
        activeCoMax[co] = coMax[co] === "" ? 9999 : Number(coMax[co]);
      });

      const courseInfo = {
        school: academicDetails.departmentName || "",
        program: academicDetails.programName || "",
        sem: academicDetails.semesterNumber || "",
        code: "", // Not collected in select screen, left empty
        name: academicDetails.subjectName || "",
        examType: academicDetails.assessmentType || "ETT"
      };

      const blob = await downloadExcel(students, activeCoMax, results, activeLevelCriteria, activeThreshold, courseInfo);
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
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="text-lg font-semibold text-slate-600">Loading data...</div>
        </div>
      </div>
    );
  }
  if (!academicDetails) return null;

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
      {academicDetails.subjectName} - {academicDetails.assessmentName}
    </p>
  )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                const stored = sessionStorage.getItem("coConfiguration");
                if (stored) {
                  try {
                    const parsed = JSON.parse(stored);
                    if (parsed.questions && parsed.questions.length > 0) {
                      navigate("/setup-questions");
                      return;
                    }
                  } catch (e) {
                    console.error(e);
                  }
                }
                navigate("/select");
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              ← Back
            </button>
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
                  parseExcel(file, coMax, totalMax, setRawStudents, setStatus)
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
                    onBlurMark={handleMarkBlur}
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
