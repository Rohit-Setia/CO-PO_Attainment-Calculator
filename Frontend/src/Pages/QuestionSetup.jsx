import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Configuration for Exam Types
const examConfig = {
  MTT: { questionCount: 8 },
  ETT: { questionCount: 23 },
};

export default function QuestionSetup() {
  const navigate = useNavigate();
  // Eagerly parse to prevent effect cycles
  const cachedDetails = sessionStorage.getItem("academicDetails");
  const academicDetails = cachedDetails ? JSON.parse(cachedDetails) : null;

  const [questions, setQuestions] = useState(() => {
    if (!academicDetails) return [];
    const config = examConfig[academicDetails.examType];
    const count = config ? config.questionCount : 0;
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      co: "",
      marks: "",
    }));
  });

  useEffect(() => {
    if (!academicDetails) {
      navigate("/select");
    }
  }, [navigate, academicDetails]);

  const handleQuestionChange = (id, field, value) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, [field]: value } : q))
    );
  };

  const calculateTotals = () => {
    const totals = { co1: 0, co2: 0, co3: 0, co4: 0, co5: 0 };
    let totalMaxMarks = 0;

    questions.forEach((q) => {
      if (q.co && q.marks) {
        const marksNum = Number(q.marks);
        const coKey = q.co.toLowerCase(); // e.g. "CO1" -> "co1"
        if (totals[coKey] !== undefined) {
          totals[coKey] += marksNum;
        }
        totalMaxMarks += marksNum;
      }
    });

    return { coMax: totals, totalMax: totalMaxMarks };
  };

  const handleSkip = () => {
    // Proceed without overriding default CO max states in student.jsx
    sessionStorage.removeItem("coConfiguration");
    navigate("/student");
  };

  const handleSubmit = () => {
    // Validate that all questions have both CO and Marks filled out
    const isComplete = questions.every((q) => q.co !== "" && q.marks !== "");
    if (!isComplete) {
      alert("Please fill out both CO and Marks for all questions, or press Skip.");
      return;
    }

    const totals = calculateTotals();
    sessionStorage.setItem("coConfiguration", JSON.stringify(totals));
    navigate("/student");
  };

  // Safe check while redirecting
  if (!academicDetails) return null;

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <Card className="shadow-lg">
          <CardContent className="p-6">
            <h1 className="mb-2 text-2xl font-bold text-slate-900">
              Question Setup ({academicDetails.examType})
            </h1>
            <p className="mb-6 text-sm text-slate-600">
              Please enter the mapped CO and maximum marks for each of the {questions.length} questions.
            </p>

            {questions.length === 0 ? (
              <p className="text-red-500">
                Invalid Exam Type or Configuration. Cannot generate questions.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-12 gap-4 pb-2 text-sm font-semibold text-slate-700 border-b">
                  <div className="col-span-2 text-center">Q. No</div>
                  <div className="col-span-5">Course Outcome (CO)</div>
                  <div className="col-span-5">Marks</div>
                </div>

                {questions.map((q) => (
                  <div key={q.id} className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-2 text-center font-medium">
                      Q{q.id}
                    </div>
                    <div className="col-span-5">
                      <select
                        value={q.co}
                        onChange={(e) =>
                          handleQuestionChange(q.id, "co", e.target.value)
                        }
                        className="w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">Select CO</option>
                        <option value="CO1">CO1</option>
                        <option value="CO2">CO2</option>
                        <option value="CO3">CO3</option>
                        <option value="CO4">CO4</option>
                        <option value="CO5">CO5</option>
                      </select>
                    </div>
                    <div className="col-span-5">
                      <input
                        type="number"
                        min="0"
                        value={q.marks}
                        onChange={(e) =>
                          handleQuestionChange(q.id, "marks", e.target.value)
                        }
                        className="w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        placeholder="Marks"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8 flex justify-between gap-4">
              <Button
                variant="outline"
                onClick={handleSkip}
                className="w-full sm:w-auto"
              >
                Skip to Calculator
              </Button>
              <Button
                onClick={handleSubmit}
                className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto"
                disabled={questions.length === 0}
              >
                Save & Continue →
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
