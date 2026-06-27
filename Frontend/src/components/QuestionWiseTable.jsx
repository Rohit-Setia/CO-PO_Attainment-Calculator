import React from "react";
import { COS } from "@/utils/calculations";
import { Trash2 } from "lucide-react";

/**
 * Question-wise marks entry table.
 * Works with students loaded from DB (reg_no, total_marks) or newly added rows (roll).
 */
export default function QuestionWiseTable({ students, questions, updateMark, updateQuestionConfig, updateStudentInfo, removeStudent }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-max">
        <thead className="bg-slate-900 text-slate-300">
          {/* Main headers row */}
          <tr>
            <th className="sticky left-0 z-30 bg-slate-900 border-r border-b border-slate-700/60 px-3 py-3 text-left w-12 min-w-[48px]">Sr</th>
            <th className="sticky left-12 z-30 bg-slate-900 border-r border-b border-slate-700/60 px-3 py-3 text-left w-36 min-w-[144px]">Reg No</th>
            <th className="sticky left-[192px] z-30 bg-slate-900 border-r border-b border-slate-700/60 px-3 py-3 text-left w-48 min-w-[192px]">Student Name</th>
            <th className="border-r border-b border-slate-700/60 px-3 py-3 text-center font-bold text-blue-400 w-24 min-w-[96px]">Total</th>
            {questions.map((q, i) => (
              <th key={q.id} className="border-r border-b border-slate-700/60 px-2 py-2 text-center w-40 min-w-[160px]">
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm font-bold text-slate-200">{q.label}</span>
                  {/* CO Assignment dropdown */}
                  <select
                    value={q.co}
                    onChange={(e) => updateQuestionConfig(i, "co", e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    {COS.map((co) => (
                      <option key={co} value={co} className="bg-slate-800">
                        {co.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  {/* Max Marks input */}
                  <div className="flex items-center gap-1 w-full">
                    <span className="text-[10px] text-slate-500 font-semibold whitespace-nowrap">Max:</span>
                    <input
                      type="number"
                      min="1"
                      value={q.maxMarks !== undefined && q.maxMarks !== null ? q.maxMarks : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateQuestionConfig(i, "maxMarks", val === "" ? "" : (parseInt(val) || 0));
                      }}
                      className="w-full rounded border border-slate-600 bg-slate-800 px-1.5 py-1 text-center text-xs text-white focus:border-blue-500 focus:outline-none font-bold"
                    />
                  </div>
                </div>
              </th>
            ))}
            <th className="border-b border-slate-700/60 px-3 py-3 text-center w-20">Action</th>
          </tr>
        </thead>

        <tbody>
          {students.map((student, i) => (
            <tr key={student.id || i} className="border-b border-slate-700/40 hover:bg-slate-800/20 transition">
              {/* Serial */}
              <td className="sticky left-0 z-10 bg-slate-900/90 border-r border-slate-700/40 px-3 py-2 text-slate-400 text-center min-w-[48px]">
                {i + 1}
              </td>
              {/* Reg No (editable) */}
              <td className="sticky left-12 z-10 bg-slate-900/90 border-r border-slate-700/40 px-2 py-2 min-w-[144px]">
                <input
                  type="text"
                  value={student.roll || student.reg_no || ""}
                  onChange={(e) => {
                    updateStudentInfo(i, "roll", e.target.value);
                    updateStudentInfo(i, "reg_no", e.target.value);
                  }}
                  placeholder="Reg No"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </td>
              {/* Name (editable) */}
              <td className="sticky left-[192px] z-10 bg-slate-900/90 border-r border-slate-700/40 px-2 py-2 min-w-[192px]">
                <input
                  type="text"
                  value={student.name || ""}
                  onChange={(e) => updateStudentInfo(i, "name", e.target.value)}
                  placeholder="Student Name"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </td>
              {/* Total (read-only, computed) */}
              <td className="border-r border-slate-700/40 px-3 py-2 text-center font-bold text-blue-400 text-sm">
                {parseFloat(student.total_marks ?? student.totalMarks ?? 0).toFixed(1)}
              </td>

              {/* Question mark cells */}
              {questions.map((q) => {
                const val = student.questionMarks?.[q.id];
                const isOver = val > q.maxMarks;
                const isUnder = val < 0;
                return (
                  <td key={q.id} className="border-r border-slate-700/40 px-2 py-2 text-center">
                    <input
                      type="number"
                      min="0"
                      max={q.maxMarks}
                      value={val !== undefined && val !== null && val !== '' ? val : ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        updateMark(i, q.id, raw === "" ? "" : (parseFloat(raw) || 0));
                      }}
                      className={`w-16 rounded border px-1.5 py-1 text-center text-xs focus:border-blue-500 focus:outline-none font-medium ${
                        isOver || isUnder
                          ? 'border-red-500 bg-red-900/20 text-red-300'
                          : 'border-slate-600 bg-slate-800 text-slate-100'
                      }`}
                    />
                  </td>
                );
              })}

              {/* Remove */}
              <td className="px-2 py-2 text-center">
                <button
                  onClick={() => removeStudent(i)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                  title="Remove student"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
