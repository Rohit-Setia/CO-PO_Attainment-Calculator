import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { COS } from "@/utils/calculations";

export default function QuestionConfig({ onConfigChange }) {
  const [numQuestions, setNumQuestions] = useState(15);
  const [numQuestionsInput, setNumQuestionsInput] = useState("15");
  const [questions, setQuestions] = useState([]);

  // Initialize questions when numQuestions changes
  useEffect(() => {
    setQuestions((prev) => {
      const newQuestions = [...prev];
      if (newQuestions.length < numQuestions) {
        for (let i = newQuestions.length; i < numQuestions; i++) {
          newQuestions.push({
            id: i + 1,
            label: `Q${i + 1}`,
            co: "co1",
            maxMarks: 10,
          });
        }
      } else if (newQuestions.length > numQuestions) {
        return newQuestions.slice(0, numQuestions);
      }
      return newQuestions;
    });
  }, [numQuestions]);

  // Sync input text when numQuestions changes
  useEffect(() => {
    setNumQuestionsInput(numQuestions.toString());
  }, [numQuestions]);

  // Notify parent of changes
  useEffect(() => {
    onConfigChange(questions);
  }, [questions, onConfigChange]);

  const updateQuestion = (index, field, value) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleNumQuestionsChange = (value) => {
    if (/^\d*$/.test(value)) {
      setNumQuestionsInput(value);
      const parsed = parseInt(value);
      if (!isNaN(parsed) && parsed >= 15 && parsed <= 30) {
        setNumQuestions(parsed);
      }
    }
  };

  const handleNumQuestionsBlur = () => {
    let parsed = parseInt(numQuestionsInput);
    if (isNaN(parsed) || parsed < 15) {
      parsed = 15;
    } else if (parsed > 30) {
      parsed = 30;
    }
    setNumQuestions(parsed);
    setNumQuestionsInput(parsed.toString());
  };

  const handleMaxMarksChange = (index, value) => {
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      updateQuestion(index, "maxMarks", value);
    }
  };

  const handleMaxMarksBlur = (index) => {
    const val = questions[index].maxMarks;
    let parsed = parseFloat(val);
    if (val === "" || isNaN(parsed) || parsed <= 0) {
      parsed = 10;
    }
    updateQuestion(index, "maxMarks", parsed);
  };

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="mb-6 flex items-center gap-4">
          <label className="text-sm font-medium text-slate-700">Number of Questions (15-30):</label>
          <Input
            type="text"
            value={numQuestionsInput}
            onChange={(e) => handleNumQuestionsChange(e.target.value)}
            onBlur={handleNumQuestionsBlur}
            className="w-24 font-bold"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="border p-2 text-left">Question</th>
                <th className="border p-2 text-left">CO Mapping</th>
                <th className="border p-2 text-left">Max Marks</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q, i) => (
                <tr key={q.id}>
                  <td className="border p-2 font-medium">{q.label}</td>
                  <td className="border p-2">
                    <select
                      value={q.co}
                      onChange={(e) => updateQuestion(i, "co", e.target.value)}
                      className="w-full rounded-md border border-slate-200 p-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {COS.map((co) => (
                        <option key={co} value={co}>
                          {co.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border p-2">
                    <Input
                      type="text"
                      value={q.maxMarks !== undefined && q.maxMarks !== null ? q.maxMarks : ""}
                      onChange={(e) => handleMaxMarksChange(i, e.target.value)}
                      onBlur={() => handleMaxMarksBlur(i)}
                      className="h-8 w-20 font-bold"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
