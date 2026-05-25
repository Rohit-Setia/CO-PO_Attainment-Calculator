import React from "react";
import { Input } from "@/components/ui/input";
import { COS } from "@/utils/calculations";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function QuestionWiseTable({ students, questions, updateMark, updateQuestionConfig, updateStudentInfo, removeStudent }) {
  return (
    <div className="w-full max-w-full overflow-x-auto rounded-lg border border-slate-200 shadow-sm bg-white">
      <table className="w-full text-sm border-collapse min-w-max">
        <thead className="bg-slate-50 border-b border-slate-200">
          {/* Main Headers */}
          <tr>
            <th className="sticky left-0 z-30 bg-slate-50 border-r border-slate-200 px-4 py-4 text-left font-semibold text-slate-700 w-[60px] min-w-[60px] whitespace-nowrap">Sr.</th>
            <th className="sticky left-[60px] z-30 bg-slate-50 border-r border-slate-200 px-4 py-4 text-left font-semibold text-slate-700 w-[180px] min-w-[180px] whitespace-nowrap">Reg No.</th>
            <th className="sticky left-[240px] z-30 bg-slate-50 border-r border-slate-200 px-4 py-4 text-left font-semibold text-slate-700 w-[250px] min-w-[250px] whitespace-nowrap">Student Name</th>
            <th className="sticky left-[490px] z-30 bg-slate-50 border-r border-slate-200 px-4 py-4 text-center font-bold text-blue-700 w-[100px] min-w-[100px] whitespace-nowrap">Total</th>
            {questions.map((q, i) => (
              <th key={q.id} className="px-2 py-4 text-center font-semibold text-slate-700 border-r border-slate-200 w-[160px] min-w-[160px]">
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm font-bold text-slate-900">{q.label}</span>
                  
                  {/* CO Dropdown directly in header */}
                  <select
                    value={q.co}
                    onChange={(e) => updateQuestionConfig(i, "co", e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium focus:border-blue-500 focus:outline-none"
                  >
                    {COS.map((co) => (
                      <option key={co} value={co}>
                        {co.toUpperCase()}
                      </option>
                    ))}
                  </select>

                  {/* Max Marks input directly in header */}
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">Max Marks:</span>
                    <input
                      type="number"
                      min="1"
                      value={q.maxMarks !== undefined && q.maxMarks !== null ? q.maxMarks : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateQuestionConfig(i, "maxMarks", val === "" ? "" : (parseInt(val) || 0));
                      }}
                      className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-center text-xs focus:border-blue-500 focus:outline-none font-bold"
                    />
                  </div>
                </div>
              </th>
            ))}
            <th className="px-4 py-4 text-center font-semibold text-slate-700 w-[120px] min-w-[120px] whitespace-nowrap">Action</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {students.map((student, i) => (
            <tr key={student.id || i} className="hover:bg-slate-50 transition-colors">
              <td className="sticky left-0 z-10 bg-white border-r border-slate-200 px-4 py-3 text-slate-600 font-medium text-center min-w-[60px]">
                {i + 1}
              </td>
              <td className="sticky left-[60px] z-10 bg-white border-r border-slate-200 px-4 py-3 min-w-[180px]">
                <div className="w-[160px]">
                  <Input
                    value={student.roll || ""}
                    onChange={(e) => updateStudentInfo(i, "roll", e.target.value)}
                    placeholder="Enter Reg No"
                    className="h-9 w-full text-sm border-slate-200 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </td>
              <td className="sticky left-[240px] z-10 bg-white border-r border-slate-200 px-4 py-3 min-w-[250px]">
                <div className="w-[230px]">
                  <Input
                    value={student.name || ""}
                    onChange={(e) => updateStudentInfo(i, "name", e.target.value)}
                    placeholder="Enter Student Name"
                    className="h-9 w-full text-sm border-slate-200 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </td>
              <td className="sticky left-[490px] z-10 bg-white border-r border-slate-200 px-4 py-3 text-center font-bold text-blue-600 min-w-[100px]">
                {student.totalMarks}
              </td>

              {questions.map((q) => (
                <td key={q.id} className="px-2 py-3 text-center border-r border-slate-200 w-[160px] min-w-[160px]">
                  <Input
                    type="number"
                    min="0"
                    max={q.maxMarks}
                    value={student.questionMarks?.[q.id] !== undefined && student.questionMarks?.[q.id] !== null ? student.questionMarks[q.id] : ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateMark(i, q.id, val === "" ? "" : (parseInt(val) || 0));
                    }}
                    className={`mx-auto h-9 w-20 text-center font-medium focus:ring-2 focus:ring-blue-500 ${
                      (student.questionMarks?.[q.id] ?? 0) > q.maxMarks ? "border-red-500 text-red-600 bg-red-50" : "bg-white border-slate-200"
                    } ${
                        (student.questionMarks?.[q.id] ?? 0) < 0 ? "border-red-500 text-red-600 bg-red-50" : ""
                    }`}
                  />
                </td>
              ))}
              <td className="px-4 py-3 text-center min-w-[120px]">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeStudent(i)}
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 flex items-center gap-1 mx-auto px-3"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase">Remove</span>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
