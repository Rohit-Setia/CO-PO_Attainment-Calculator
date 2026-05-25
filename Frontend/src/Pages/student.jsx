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
  const [rawStudents, setRawStudents] = useState(() => {
    const stored = sessionStorage.getItem("setupStudents");
    if (stored) return JSON.parse(stored);
    return [];
  });
  const [students, setStudents] = useState([]);
  const [status, setStatus] = useState(null)

  const [coMax, setCoMax] = useState(() => {
    const stored = sessionStorage.getItem("coConfiguration");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.coMax) return parsed.coMax;
    }
    return {
      co1: 10,
      co2: 10,
      co3: 10,
      co4: 15,
      co5: 15,
    };
  });

  const [totalMax, setTotalMax] = useState(() => {
    const stored = sessionStorage.getItem("coConfiguration");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.totalMax) return parsed.totalMax;
    }
    return 60;
  });

  const [thresholdPercent, setThresholdPercent] = useState(40)
  const [levelCriteria, setLevelCriteria] = useState({
    level3: 70,
    level2: 60, 
    level1: 50
  })

  const [results, setResults] = useState(null)
  const [isCalculating, setIsCalculating] = useState(false)

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

        let entered = value === "" ? "" : Number(value)
        if (entered !== "" && (isNaN(entered) || entered < 0)) entered = 0
        
        studentRaw[co] = entered
        updatedRaw[index] = studentRaw
        return updatedRaw
      })
    },
    []
  );

  const handleCalculate = useCallback(async () => {
    if (!students.length || isCalculating) return

    setIsCalculating(true)
    try {
      const activeThreshold = thresholdPercent === "" ? 40 : Number(thresholdPercent);
      const activeLevelCriteria = {
        level3: levelCriteria.level3 === "" ? 70 : Number(levelCriteria.level3),
        level2: levelCriteria.level2 === "" ? 60 : Number(levelCriteria.level2),
        level1: levelCriteria.level1 === "" ? 50 : Number(levelCriteria.level1),
      };

      const activeTotalMax = totalMax === "" ? 9999 : Number(totalMax);
      const activeCoMax = {};
      COS.forEach((co) => {
        activeCoMax[co] = coMax[co] === "" ? 9999 : Number(coMax[co]);
      });

      const res = await calculateAttainment(
        students,
        activeCoMax,
        activeThreshold,
        activeLevelCriteria
      )
      setResults(res.data)
      setStatus(null) // Clear any previous errors
    } catch (error) {
      console.error("Calculation error:", error)
      setStatus("Failed to calculate attainment. Please try again.")
    } finally {
      setIsCalculating(false)
    }
  }, [students, coMax, totalMax, thresholdPercent, levelCriteria, isCalculating])

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
      COS.forEach((co) => {
        activeCoMax[co] = coMax[co] === "" ? 9999 : Number(coMax[co]);
      });

      // Retrieve course info from sessionStorage
      const academicDetails = JSON.parse(sessionStorage.getItem("academicDetails")) || {};
      const courseInfo = {
        school: academicDetails.school || "",
        program: academicDetails.department || "",
        sem: academicDetails.semester || "",
        code: "", // Not collected in select screen, left empty
        name: academicDetails.subject || "",
        examType: academicDetails.examType || "ETT"
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
