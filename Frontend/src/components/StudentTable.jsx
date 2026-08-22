import { Trash2 } from "lucide-react";

/**
 * Direct CO-wise marks entry table. `courseOutcomes` is the course's actual active CO list
 * (any count/numbering) — columns are generated from it, never from a fixed count.
 * `isInternal` picks which max-marks field (max_internal/max_external) applies.
 */
export default function StudentTable({
  students,
  updateMark,
  updateStudentInfo = () => {},
  removeStudent = () => {},
  courseOutcomes = [],
  isInternal = true,
  readOnly = false
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 w-12 border-b border-r border-border bg-muted px-3 py-3 text-left">Sr</th>
            <th className="sticky left-12 z-10 w-36 border-b border-r border-border bg-muted px-3 py-3 text-left">Reg No</th>
            <th className="w-48 border-b border-r border-border px-3 py-3 text-left">Name</th>
            <th className="w-20 border-b border-r border-border px-3 py-3 text-center font-bold text-primary">Total</th>
            {courseOutcomes.map((co) => (
              <th key={co.id} className="w-24 border-b border-r border-border px-3 py-3 text-center text-xs">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="font-bold text-foreground">CO{co.co_number}</span>
                  <span className="text-[10px] text-muted-foreground">/{isInternal ? co.max_internal : co.max_external}</span>
                </div>
              </th>
            ))}
            {courseOutcomes.map((co) => (
              <th key={co.id + "%"} className="w-20 border-b border-r border-border px-3 py-3 text-center text-xs text-success">
                CO{co.co_number}%
              </th>
            ))}
            {!readOnly && <th className="w-20 border-b border-border px-3 py-3 text-center">Action</th>}
          </tr>
        </thead>

        <tbody>
          {students.map((s, i) => (
            <tr key={s.id || i} className="border-b border-border transition hover:bg-muted/30">
              <td className="sticky left-0 z-10 border-r border-border bg-card px-3 py-2 text-center text-muted-foreground">
                {i + 1}
              </td>
              <td className="sticky left-12 z-10 border-r border-border bg-card px-2 py-2">
                <input
                  type="text"
                  value={s.roll || s.reg_no || ""}
                  onChange={(e) => {
                    updateStudentInfo(i, "roll", e.target.value);
                    updateStudentInfo(i, "reg_no", e.target.value);
                  }}
                  placeholder="Reg No"
                  disabled={readOnly}
                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-default disabled:opacity-60"
                />
              </td>
              <td className="border-r border-border px-2 py-2">
                <input
                  type="text"
                  value={s.name || ""}
                  onChange={(e) => updateStudentInfo(i, "name", e.target.value)}
                  placeholder="Student Name"
                  disabled={readOnly}
                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-default disabled:opacity-60"
                />
              </td>
              <td className="border-r border-border px-3 py-2 text-center text-sm font-bold text-primary">
                {parseFloat(s.totalMarks ?? 0).toFixed(1)}
              </td>

              {courseOutcomes.map((co) => {
                const max = isInternal ? co.max_internal : co.max_external;
                const val = s.coMarks?.[co.id];
                return (
                  <td key={co.id} className="border-r border-border px-2 py-2 text-center">
                    <input
                      type="number"
                      min="0"
                      max={max}
                      value={val !== undefined && val !== null && val !== '' ? val : ""}
                      onChange={(e) => updateMark(i, co.id, e.target.value)}
                      disabled={readOnly}
                      className={`w-16 rounded border px-1.5 py-1 text-center text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring ${
                        parseFloat(val) > (max || Infinity)
                          ? 'border-destructive bg-destructive/10 text-destructive'
                          : 'border-input bg-background focus:border-ring'
                      } ${readOnly ? 'cursor-default opacity-60' : ''}`}
                    />
                  </td>
                );
              })}

              {courseOutcomes.map((co) => {
                const max = parseFloat(isInternal ? co.max_internal : co.max_external) || 0;
                const val = parseFloat(s.coMarks?.[co.id]) || 0;
                const pct = max > 0 ? ((val / max) * 100).toFixed(1) : '0.0';
                return (
                  <td key={co.id + "percent"} className="border-r border-border px-3 py-2 text-center text-xs text-success">
                    {pct}%
                  </td>
                );
              })}

              {!readOnly && (
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => removeStudent(i)}
                    className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
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
