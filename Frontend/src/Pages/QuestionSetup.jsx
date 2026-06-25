import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FileActions from "@/components/FileActions";
import QuestionWiseTable from "@/components/QuestionWiseTable";
import { parseExcel } from "@/utils/excelParser";
import { useAuth } from "@/context/AuthContext";
import { fetchStudents, fetchGradingBoard, fetchCOs, saveGradingMarks, triggerDBAttainmentCalculation, fetchAttainmentHistory } from "../Api/erpApi";
import AttainmentResults from "@/components/AttainmentResult";

export default function QuestionSetup() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [academicDetails, setAcademicDetails] = useState(null);
  const [dbStudents, setDbStudents] = useState([]);
  const [dbQuestions, setDbQuestions] = useState([]);
  const [dbMarks, setDbMarks] = useState([]);
  const [dbCOs, setDbCOs] = useState([]);
  const [students, setStudents] = useState([]);
  const [historicalResults, setHistoricalResults] = useState(null);
  
  // Dynamic question configuration state
  const [numQuestions, setNumQuestions] = useState(5);
  const [numQuestionsInput, setNumQuestionsInput] = useState("5");
  const [questions, setQuestions] = useState([]);

  // Load academic details and data from API on component mount
  useEffect(() => {
    const loadData = async () => {
      const detailsStr = sessionStorage.getItem("academicDetails");
      if (!detailsStr) {
        navigate("/select");
        return;
      }
      const details = JSON.parse(detailsStr);
      setAcademicDetails(details);

      try {
        setLoading(true);

        // Load COs first!
        let cosList = [];
        if (details.subjectId) {
          const cosRes = await fetchCOs(details.subjectId);
          cosList = cosRes.data.data;
          setDbCOs(cosList);
        }

        // Load students in classroom
        const studentsRes = await fetchStudents({ classroom_id: details.classroomId });
        const studentsList = studentsRes.data.data.map(student => ({
          id: student.id,
          serialNo: student.id,
          roll: student.roll_no,
          name: student.name,
          regNo: student.reg_no,
          questionMarks: {},
          // Initialize dynamic CO fields based on cosList
          ...cosList.reduce((acc, _, index) => ({ ...acc, [`co${index + 1}`]: 0 }), {})
        }));
        setDbStudents(studentsList);

        // Load grading board (questions and existing marks)
        const gradingRes = await fetchGradingBoard(details.classroomId, details.assessmentId);
        const { questions: qList, existingMarks: marksList } = gradingRes.data.data;
        
        if (qList && qList.length > 0) {
          setDbQuestions(qList);
          setQuestions(qList.map(q => {
            const coIndex = cosList.findIndex(co => co.id === q.co_id);
            return {
              id: q.id,
              label: `Q${q.question_no}`,
              co: coIndex !== -1 ? `co${coIndex + 1}` : "co1",
              maxMarks: q.max_marks,
              coId: q.co_id
            };
          }));
          setNumQuestions(qList.length);
          setNumQuestionsInput(qList.length.toString());
        }

        if (marksList && marksList.length > 0) {
          setDbMarks(marksList);
          // Map existing marks to students
          setStudents(studentsList.map(student => {
            const studentMarks = marksList.filter(m => m.student_id === student.id);
            const questionMarks = {};
            studentMarks.forEach(m => {
              questionMarks[m.question_id || m.co_id] = m.marks_obtained;
            });
            return {
              ...student,
              questionMarks
            };
          }));
        } else {
          setStudents(studentsList);
        }

        if (details.isReadOnly) {
          try {
            const historyRes = await fetchAttainmentHistory(details.subjectId, details.classroomId);
            const historyList = historyRes.data?.data || [];
            const currentRecord = historyList.find(r => r.assessment_id === details.assessmentId);
            if (currentRecord) {
              setHistoricalResults(currentRecord.results);
            }
          } catch (historyErr) {
            console.error("Failed to fetch historical results", historyErr);
          }
        }

      } catch (err) {
        console.error("Failed to load data", err);
        setStatus("Failed to load data from server");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [navigate]);

  // Update questions array when numQuestions changes (only if no DB questions)
  useEffect(() => {
    if (dbQuestions.length > 0) return;
    setQuestions((prev) => {
      const current = [...prev];
      if (current.length === numQuestions) return current;
      
      if (current.length < numQuestions) {
        const added = Array.from({ length: numQuestions - current.length }, (_, i) => ({
          id: current.length + i + 1,
          label: `Q${current.length + i + 1}`,
          co: dbCOs.length > 0 ? `co1` : "co1",
          maxMarks: 10,
        }));
        return [...current, ...added];
      } else {
        return current.slice(0, numQuestions);
      }
    });
  }, [numQuestions, dbQuestions.length, dbCOs]);

  const calculateStudentPerformance = useCallback(
    (student, currentQuestions) => {
      const qMarks = student.questionMarks || {};
      const coPerformance = dbCOs.reduce((acc, _, index) => {
        const coKey = `co${index + 1}`;
        acc[coKey] = 0;
        return acc;
      }, {});
      let totalMarks = 0;

      currentQuestions.forEach((q) => {
        const rawMark = qMarks[q.id];
        const mark = rawMark === "" || rawMark === undefined || rawMark === null ? 0 : parseFloat(rawMark);
        const validMark = isNaN(mark) ? 0 : mark;
        if (coPerformance[q.co] !== undefined) {
          coPerformance[q.co] += validMark;
        }
        totalMarks += validMark;
      });

      return {
        ...student,
        ...coPerformance,
        totalMarks,
      };
    },
    [dbCOs]
  );

  useEffect(() => {
    if (!students.length || !questions.length) return;
    setStudents((prev) => prev.map((s) => calculateStudentPerformance(s, questions)));
  }, [questions, calculateStudentPerformance]);

  // Real-time autosave of students and configurations to sessionStorage
  useEffect(() => {
    if (students.length > 0) {
      sessionStorage.setItem("setupStudents", JSON.stringify(students));
    }
  }, [students]);

  useEffect(() => {
    if (questions.length > 0) {
      const coMax = questions.reduce((acc, q) => {
        const coKey = String(q.co).toLowerCase();
        acc[coKey] = (acc[coKey] || 0) + Number(q.maxMarks);
        return acc;
      }, { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 });

      const totalMax = questions.reduce((sum, q) => sum + Number(q.maxMarks), 0);

      const config = {
        questions,
        coMax,
        totalMax
      };
      sessionStorage.setItem("coConfiguration", JSON.stringify(config));
    }
  }, [questions]);

  const updateMark = useCallback(
    (index, questionId, value) => {
      setStudents((prev) => {
        const updated = [...prev];
        const student = { ...updated[index] };
        
        let valToStore = value;
        if (value === "" || /^\d*\.?\d*$/.test(value)) {
          const question = questions.find((q) => q.id === questionId);
          const maxVal = question ? Number(question.maxMarks) : 100;
          if (value !== "") {
            const num = parseFloat(value);
            if (num > maxVal) {
              setStatus(`Warning: Mark for ${question ? question.label : ('Q' + questionId)} exceeds max marks (${maxVal})`);
            } else {
              setStatus(null);
            }
          } else {
            setStatus(null);
          }
          
          const qMarks = { ...student.questionMarks, [questionId]: valToStore };
          updated[index] = calculateStudentPerformance(
            { ...student, questionMarks: qMarks },
            questions
          );
        }
        return updated;
      });
    },
    [questions, calculateStudentPerformance]
  );

  const updateQuestionConfig = useCallback((index, field, value) => {
    setQuestions((prev) => {
      const updated = [...prev];
      let coId = updated[index].coId;
      if (field === "co") {
        const coIdx = parseInt(value.replace("co", "")) - 1;
        if (dbCOs[coIdx]) {
          coId = dbCOs[coIdx].id;
        }
      }
      updated[index] = { ...updated[index], [field]: value, ...(field === "co" ? { coId } : {}) };
      return updated;
    });
  }, [dbCOs]);

  const updateStudentInfo = useCallback((index, field, value) => {
    setStudents((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const removeStudent = useCallback((index) => {
    setStudents((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addStudentRow = () => {
    const newStudent = {
      serialNo: students.length + 1,
      roll: "",
      name: "",
      questionMarks: {},
      totalMarks: 0,
      ...dbCOs.reduce((acc, _, index) => {
        const coKey = `co${index + 1}`;
        acc[coKey] = 0;
        return acc;
      }, {})
    };
    setStudents([...students, newStudent]);
  };

  const handleSubmit = async () => {
    if (!students.length) {
      alert("Please add at least one student or upload data.");
      return;
    }

    // Basic validation for students
    const hasEmptyInfo = students.some(s => !s.roll || !s.name);
    if (hasEmptyInfo) {
      if (!window.confirm("Some students have empty Reg No or Name. Continue anyway?")) {
        return;
      }
    }

    // Validate all marks (Bug 3 / Bug 5)
    for (const student of students) {
      for (const q of questions) {
        const markVal = student.questionMarks[q.id];
        const mark = markVal === "" || markVal === undefined || markVal === null ? 0 : parseFloat(markVal);
        const maxVal = Number(q.maxMarks) || 0;
        if (mark > maxVal) {
          alert(`Validation Error: Student "${student.name || 'Unknown'}" (${student.roll || 'Unknown Roll'}) has marks for question ${q.label || ('Q' + q.id)} (${mark}) exceeding the maximum limit (${maxVal}).`);
          return;
        }
      }
    }

    try {
      // Prepare questions blueprint payload
      const questionsPayload = questions.map(q => {
        const coIdx = parseInt(q.co.replace("co", "")) - 1;
        const coId = dbCOs[coIdx] ? dbCOs[coIdx].id : null;
        return {
          question_no: parseInt(q.label.replace("Q", "")),
          max_marks: Number(q.maxMarks),
          co_id: q.coId || coId,
          difficulty_level: q.difficulty || 'Medium',
          bloom_level: q.bloomLevel || 'Remembering',
          question_type: q.type || 'Theory'
        };
      });

      // Prepare marks for saving
      const marksPayload = students.flatMap(student => {
        return questions.map(q => {
          const markVal = student.questionMarks[q.id];
          const mark = markVal === "" || markVal === undefined || markVal === null ? 0 : parseFloat(markVal);
          const qNo = parseInt(q.label.replace("Q", ""));
          return {
            student_id: student.id,
            question_no: qNo,
            marks_obtained: mark,
            is_absent: false
          };
        });
      });
      
      await saveGradingMarks({
        assessment_id: academicDetails.assessmentId,
        questions: questionsPayload,
        marks: marksPayload
      });

      const coMax = questions.reduce((acc, q) => {
        const coKey = String(q.co).toLowerCase();
        acc[coKey] = (acc[coKey] || 0) + q.maxMarks;
        return acc;
      }, dbCOs.reduce((acc, _, index) => {
          const coKey = `co${index + 1}`;
          acc[coKey] = 0;
          return acc;
        }, {}));

      const totalMax = questions.reduce((sum, q) => sum + q.maxMarks, 0);

      // Recalculate CO totals for each student to ensure accuracy before saving
      const finalizedStudents = students.map((student) => {
        const qMarks = student.questionMarks || {};
        const coPerformance = dbCOs.reduce((acc, _, index) => {
          const coKey = `co${index + 1}`;
          acc[coKey] = 0;
          return acc;
        }, {});
        let totalMarks = 0;

        questions.forEach((q) => {
          const mark = Number(qMarks[q.id]) || 0;
          const coKey = String(q.co).toLowerCase();
          if (coPerformance[coKey] !== undefined) {
            coPerformance[coKey] += mark;
          }
          totalMarks += mark;
        });

        return {
          ...student,
          ...coPerformance,
          totalMarks,
        };
      });

      const config = {
        questions,
        coMax,
        totalMax
      };
      
      sessionStorage.setItem("coConfiguration", JSON.stringify(config));
      sessionStorage.setItem("setupStudents", JSON.stringify(finalizedStudents));
      
      navigate("/student");
    } catch (err) {
      console.error(err);
      setStatus("Failed to save marks: " + (err.response?.data?.message || err.message));
    }
  };

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
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-[98%]">
        <div className="mb-6 flex flex-col gap-4 rounded-xl bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between border border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Exam Management Interface</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              {academicDetails && (
                <>
                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                    {academicDetails.departmentName}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                    {academicDetails.programName}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-700/10">
                    {academicDetails.subjectName}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-700/10">
                    Sem: {academicDetails.semesterNumber}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-700/10">
                    {academicDetails.assessmentName}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/dashboard")}>Dashboard</Button>
            <Button variant="destructive" onClick={logout}>Logout</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Question Selection</label>
              <div className="flex items-center gap-3">
                <Input
                  type="text"
                  value={numQuestionsInput}
                  disabled={academicDetails?.isReadOnly}
                  onChange={(e) => {
                    const valStr = e.target.value;
                    if (/^\d*$/.test(valStr)) {
                      setNumQuestionsInput(valStr);
                      const val = parseInt(valStr);
                      if (!isNaN(val) && val >= 5 && val <= 30) {
                        setNumQuestions(val);
                      }
                    }
                  }}
                  onBlur={() => {
                    let val = parseInt(numQuestionsInput);
                    if (isNaN(val) || val < 5) {
                      val = 5;
                    } else if (val > 30) {
                      val = 30;
                    }
                    setNumQuestions(val);
                    setNumQuestionsInput(val.toString());
                  }}
                  className="w-24 font-bold text-blue-600 text-center"
                />
                <span className="text-sm text-slate-600 font-medium">(5-30)</span>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardContent className="p-4 flex items-center justify-between h-full">
               {!academicDetails?.isReadOnly ? (
                 <>
                   <FileActions
                      students={students}
                      onUpload={(file) => parseExcel(file, { co1: 100, co2: 100, co3: 100, co4: 100, co5: 100 }, 500, (parsedStudents) => {
                        setStudents(parsedStudents);
                        if (parsedStudents.length > 0 && parsedStudents[0].questionMarks) {
                           const qIds = Object.keys(parsedStudents[0].questionMarks).map(Number);
                           if (qIds.length > 0) {
                             const maxQ = Math.max(...qIds);
                             if (maxQ >= 5 && maxQ <= 30) {
                               setNumQuestions(maxQ);
                               setNumQuestionsInput(maxQ.toString());
                             }
                           }
                        }
                      }, setStatus, questions)}
                      onDownload={() => {}}
                      results={null}
                    />
                    <Button variant="outline" onClick={addStudentRow} className="bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100">
                      + Add Student Row
                    </Button>
                 </>
               ) : (
                 <div className="text-slate-500 font-medium text-sm">Read-only view of assessment marks setup.</div>
               )}
            </CardContent>
          </Card>
        </div>

        {status && (
          <Alert className="mb-6 bg-blue-50">
            <AlertDescription className="text-blue-900 font-medium">{status}</AlertDescription>
          </Alert>
        )}

        <div className="mb-8">
          <QuestionWiseTable
            students={students}
            questions={questions}
            updateMark={updateMark}
            updateQuestionConfig={updateQuestionConfig}
            updateStudentInfo={updateStudentInfo}
            removeStudent={removeStudent}
            isReadOnly={academicDetails?.isReadOnly}
          />
        </div>

        {historicalResults && (
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Results</h2>
            <AttainmentResults results={historicalResults} isLoading={false} />
          </div>
        )}

        <div className="flex justify-center gap-4">
          <Button variant="outline" size="lg" onClick={() => navigate(academicDetails?.isReadOnly ? "/dashboard" : "/select")}>
            {academicDetails?.isReadOnly ? "Back to Dashboard" : "← Back"}
          </Button>
          {!academicDetails?.isReadOnly && (
            <Button
              onClick={handleSubmit}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 px-16 font-bold"
            >
              Save & View Results →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
