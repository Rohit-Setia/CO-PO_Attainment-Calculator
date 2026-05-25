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

export default function QuestionSetup() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [students, setStudents] = useState(() => {
    const stored = sessionStorage.getItem("setupStudents");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });
  const [status, setStatus] = useState(null);
  
  // Dynamic question configuration state
  const [numQuestions, setNumQuestions] = useState(() => {
    const stored = sessionStorage.getItem("coConfiguration");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.questions) return parsed.questions.length;
      } catch (e) {
        console.error(e);
      }
    }
    return 5;
  });

  const [numQuestionsInput, setNumQuestionsInput] = useState(() => {
    const stored = sessionStorage.getItem("coConfiguration");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.questions) return parsed.questions.length.toString();
      } catch (e) {
        console.error(e);
      }
    }
    return "5";
  });

  const [questions, setQuestions] = useState(() => {
    const stored = sessionStorage.getItem("coConfiguration");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.questions) return parsed.questions;
      } catch (e) {
        console.error(e);
      }
    }
    return Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      label: `Q${i + 1}`,
      co: "co1",
      maxMarks: 10,
    }));
  });

  // Update questions array when numQuestions changes
  useEffect(() => {
    setQuestions((prev) => {
      const current = [...prev];
      if (current.length === numQuestions) return current;
      
      if (current.length < numQuestions) {
        const added = Array.from({ length: numQuestions - current.length }, (_, i) => ({
          id: current.length + i + 1,
          label: `Q${current.length + i + 1}`,
          co: "co1",
          maxMarks: 10,
        }));
        return [...current, ...added];
      } else {
        return current.slice(0, numQuestions);
      }
    });
  }, [numQuestions]);

  const calculateStudentPerformance = useCallback(
    (student, currentQuestions) => {
      const qMarks = student.questionMarks || {};
      const coPerformance = { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 };
      let totalMarks = 0;

      currentQuestions.forEach((q) => {
        const mark = qMarks[q.id] || 0;
        coPerformance[q.co] += mark;
        totalMarks += mark;
      });

      return {
        ...student,
        ...coPerformance,
        totalMarks,
      };
    },
    []
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
        acc[coKey] = (acc[coKey] || 0) + q.maxMarks;
        return acc;
      }, { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 });

      const totalMax = questions.reduce((sum, q) => sum + q.maxMarks, 0);

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
        const qMarks = { ...student.questionMarks, [questionId]: value };

        const question = questions.find((q) => q.id === questionId);
        if (question && value !== "" && Number(value) > question.maxMarks) {
          setStatus(`Warning: Mark for Q${questionId} exceeds max marks (${question.maxMarks})`);
        } else if (value !== "" && Number(value) < 0) {
          setStatus(`Warning: Mark for Q${questionId} cannot be negative`);
        } else {
          setStatus(null);
        }

        updated[index] = calculateStudentPerformance(
          { ...student, questionMarks: qMarks },
          questions
        );
        return updated;
      });
    },
    [questions, calculateStudentPerformance]
  );

  const updateQuestionConfig = useCallback((index, field, value) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

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
      co1: 0, co2: 0, co3: 0, co4: 0, co5: 0
    };
    setStudents([...students, newStudent]);
  };

  const handleSubmit = () => {
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

    const coMax = questions.reduce((acc, q) => {
      const coKey = String(q.co).toLowerCase();
      acc[coKey] = (acc[coKey] || 0) + q.maxMarks;
      return acc;
    }, { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 });

    const totalMax = questions.reduce((sum, q) => sum + q.maxMarks, 0);

    // Recalculate CO totals for each student to ensure accuracy before saving
    const finalizedStudents = students.map((student) => {
      const qMarks = student.questionMarks || {};
      const coPerformance = { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 };
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
  };

  const academicDetails = JSON.parse(sessionStorage.getItem("academicDetails"));
  useEffect(() => {
    if (!academicDetails) {
      navigate("/select");
    }
  }, [academicDetails, navigate]);

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
                    {academicDetails.school}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                    {academicDetails.department}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-700/10">
                    {academicDetails.subject}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-700/10">
                    Sem: {academicDetails.semester}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-700/10">
                    {academicDetails.examType}
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
                  type="number"
                  value={numQuestionsInput}
                  onChange={(e) => {
                    const valStr = e.target.value;
                    setNumQuestionsInput(valStr);
                    const val = parseInt(valStr);
                    if (!isNaN(val) && val >= 5 && val <= 30) {
                      setNumQuestions(val);
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
                  className="w-24 font-bold text-blue-600"
                />
                <span className="text-sm text-slate-600 font-medium">(5-30)</span>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardContent className="p-4 flex items-center justify-between h-full">
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
          />
        </div>

        <div className="flex justify-center gap-4">
          <Button variant="outline" size="lg" onClick={() => navigate("/select")}>← Back</Button>
          <Button
            onClick={handleSubmit}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 px-16 font-bold"
          >
            Save & View Results →
          </Button>
        </div>
      </div>
    </div>
  );
}
