import { COS } from "@/utils/calculations";
import { Trash2 } from "lucide-react";

/**
 * Question-wise marks entry table.
 * Works with students loaded from DB (reg_no, total_marks) or newly added rows (roll).
 */
export default function QuestionWiseTable({
  students,
  questions,
  updateMark,
  updateQuestionConfig,
  updateStudentInfo,
  removeStudent,
  readOnly = false
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="bg-muted/60 text-muted-foreground">
          {/* Main headers row */}
          <tr>
            <th className="sticky left-0 z-30 w-12 min-w-[48px] border-b border-r border-border bg-muted px-3 py-3 text-left">Sr</th>
            <th className="sticky left-12 z-30 w-36 min-w-[144px] border-b border-r border-border bg-muted px-3 py-3 text-left">Reg No</th>
            <th className="sticky left-[192px] z-30 w-48 min-w-[192px] border-b border-r border-border bg-muted px-3 py-3 text-left">Student Name</th>
            <th className="w-24 min-w-[96px] border-b border-r border-border px-3 py-3 text-center font-bold text-primary">Total</th>
            {questions.map((q, i) => (
              <th key={q.id} className="w-40 min-w-[160px] border-b border-r border-border px-2 py-2 text-center">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{q.label}</span>
                  {/* CO Assignment dropdown */}
                  <select
                    value={q.co}
                    disabled={readOnly}
                    onChange={(e) => updateQuestionConfig(i, "co", e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-2 py-1 text-xs font-medium text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {COS.map((co) => (
                      <option key={co} value={co} className="bg-popover">
                        {co.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  {/* Max Marks input */}
                  <div className="flex w-full items-center gap-1">
                    <span className="whitespace-nowrap text-[10px] font-semibold text-muted-foreground">Max:</span>
                    <input
                      type="number"
                      min="1"
                      disabled={readOnly}
                      value={q.maxMarks !== undefined && q.maxMarks !== null ? q.maxMarks : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateQuestionConfig(i, "maxMarks", val === "" ? "" : (parseInt(val) || 0));
                      }}
                      className="w-full rounded border border-input bg-background px-1.5 py-1 text-center text-xs font-bold text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                </div>
              </th>
            ))}
            {!readOnly && <th className="w-20 border-b border-border px-3 py-3 text-center">Action</th>}
          </tr>
        </thead>

        <tbody>
          {students.map((student, i) => (
            <tr key={student.id || i} className="border-b border-border transition hover:bg-muted/30">
              {/* Serial */}
              <td className="sticky left-0 z-10 min-w-[48px] border-r border-border bg-card px-3 py-2 text-center text-muted-foreground">
                {i + 1}
              </td>
              {/* Reg No */}
              <td className="sticky left-12 z-10 min-w-[144px] border-r border-border bg-card px-2 py-2">
                <input
                  type="text"
                  disabled={readOnly}
                  value={student.roll || student.reg_no || ""}
                  onChange={(e) => {
                    updateStudentInfo(i, "roll", e.target.value);
                    updateStudentInfo(i, "reg_no", e.target.value);
                  }}
                  placeholder="Reg No"
                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-default disabled:opacity-60"
                />
              </td>
              {/* Name */}
              <td className="sticky left-[192px] z-10 min-w-[192px] border-r border-border bg-card px-2 py-2">
                <input
                  type="text"
                  disabled={readOnly}
                  value={student.name || ""}
                  onChange={(e) => updateStudentInfo(i, "name", e.target.value)}
                  placeholder="Student Name"
                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-default disabled:opacity-60"
                />
              </td>
              {/* Total (read-only, computed) */}
              <td className="border-r border-border px-3 py-2 text-center text-sm font-bold text-primary">
                {parseFloat(student.total_marks ?? student.totalMarks ?? 0).toFixed(1)}
              </td>

              {/* Question mark cells */}
              {questions.map((q) => {
                const val = student.questionMarks?.[q.id];
                const isOver = val > q.maxMarks;
                const isUnder = val < 0;
                return (
                  <td key={q.id} className="border-r border-border px-2 py-2 text-center">
                    <input
                      type="number"
                      min="0"
                      max={q.maxMarks}
                      disabled={readOnly}
                      value={val !== undefined && val !== null && val !== '' ? val : ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        updateMark(i, q.id, raw === "" ? "" : (parseFloat(raw) || 0));
                      }}
                      className={`w-16 rounded border px-1.5 py-1 text-center text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring ${
                        isOver || isUnder
                          ? 'border-destructive bg-destructive/10 text-destructive'
                          : 'border-input bg-background text-foreground focus:border-ring'
                      } ${readOnly ? 'cursor-default opacity-60' : ''}`}
                    />
                  </td>
                );
              })}

              {/* Remove */}
              {!readOnly && (
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => removeStudent(i)}
                    className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    title="Remove student"
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
