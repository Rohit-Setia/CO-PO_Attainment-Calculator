import React from "react";
import { Trash2 } from "lucide-react";

/**
 * Direct CO-wise marks entry table.
 * Works with students loaded from DB (reg_no, total_marks) or newly added rows (roll).
 */
export default function StudentTable({
  students,
  updateMark,
  updateStudentInfo = () => {},
  removeStudent = () => {},
  coMax = {},
  numCos = 5,
  readOnly = false
}) {
  // Build CO array up to numCos only
  const coList = Array.from({ length: numCos }, (_, i) => `co${i + 1}`);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-max">
        <thead className="bg-slate-900 text-slate-300">
          <tr>
            <th className="border-r border-b border-slate-700/60 px-3 py-3 text-left w-12 sticky left-0 bg-slate-900 z-10">Sr</th>
            <th className="border-r border-b border-slate-700/60 px-3 py-3 text-left w-36 sticky left-12 bg-slate-900 z-10">Reg No</th>
            <th className="border-r border-b border-slate-700/60 px-3 py-3 text-left w-48">Name</th>
            <th className="border-r border-b border-slate-700/60 px-3 py-3 text-center font-bold text-blue-400 w-20">Total</th>
            {coList.map((co) => (
              <th key={co} className="border-r border-b border-slate-700/60 px-3 py-3 text-center text-xs w-24">
                <div className="flex flex-col gap-0.5 items-center">
                  <span className="font-bold text-slate-200">{co.toUpperCase()}</span>
                  <span className="text-slate-500 text-[10px]">/{coMax[co] ?? '-'}</span>
                </div>
              </th>
            ))}
            {coList.map((co) => (
              <th key={co + "%"} className="border-r border-b border-slate-700/60 px-3 py-3 text-center text-xs w-20 text-emerald-400">
                {co.toUpperCase()}%
              </th>
            ))}
            {/* Hide delete column header for Viewers */}
            {!readOnly && <th className="border-b border-slate-700/60 px-3 py-3 text-center w-20">Action</th>}
          </tr>
        </thead>

        <tbody>
          {students.map((s, i) => (
            <tr key={s.id || i} className="border-b border-slate-700/40 hover:bg-slate-800/20 transition">
              {/* Serial */}
              <td className="border-r border-slate-700/40 px-3 py-2 text-slate-400 text-center sticky left-0 bg-slate-900/80 z-10">
                {i + 1}
              </td>
              {/* Reg No */}
              <td className="border-r border-slate-700/40 px-2 py-2 sticky left-12 bg-slate-900/80 z-10">
                <input
                  type="text"
                  value={s.roll || s.reg_no || ""}
                  onChange={(e) => {
                    updateStudentInfo(i, "roll", e.target.value);
                    updateStudentInfo(i, "reg_no", e.target.value);
                  }}
                  placeholder="Reg No"
                  disabled={readOnly}
                  className={`w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none ${readOnly ? 'opacity-60 cursor-default' : ''}`}
                />
              </td>
              {/* Name */}
              <td className="border-r border-slate-700/40 px-2 py-2">
                <input
                  type="text"
                  value={s.name || ""}
                  onChange={(e) => updateStudentInfo(i, "name", e.target.value)}
                  placeholder="Student Name"
                  disabled={readOnly}
                  className={`w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none ${readOnly ? 'opacity-60 cursor-default' : ''}`}
                />
              </td>
              {/* Total Marks (computed, read-only) */}
              <td className="border-r border-slate-700/40 px-3 py-2 text-center font-bold text-blue-400 text-sm">
                {parseFloat(s.total_marks ?? s.totalMarks ?? 0).toFixed(1)}
              </td>

              {/* CO Marks columns (editable) */}
              {coList.map((co) => (
                <td key={co} className="border-r border-slate-700/40 px-2 py-2 text-center">
                  <input
                    type="number"
                    min="0"
                    max={coMax[co]}
                    value={s[co] !== undefined && s[co] !== null && s[co] !== '' ? s[co] : ""}
                    onChange={(e) => updateMark(i, co, e.target.value)}
                    disabled={readOnly}
                    className={`w-16 bg-slate-800 border rounded px-1.5 py-1 text-center text-xs text-slate-100 focus:border-blue-500 focus:outline-none ${
                      parseFloat(s[co]) > (coMax[co] || Infinity)
                        ? 'border-red-500 bg-red-900/20 text-red-300'
                        : 'border-slate-700'
                    } ${readOnly ? 'opacity-60 cursor-default' : ''}`}
                  />
                </td>
              ))}

              {/* CO % columns (computed, read-only) */}
              {coList.map((co) => {
                const max = coMax[co] || 0;
                const val = parseFloat(s[co]) || 0;
                const pct = max > 0 ? ((val / max) * 100).toFixed(1) : '0.0';
                return (
                  <td key={co + "percent"} className="border-r border-slate-700/40 px-3 py-2 text-center text-xs text-emerald-400">
                    {pct}%
                  </td>
                );
              })}

              {/* Delete — hidden for read-only Viewers */}
              {!readOnly && (
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => removeStudent(i)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                    title="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
