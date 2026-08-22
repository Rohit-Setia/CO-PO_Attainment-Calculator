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
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 w-12 border-b border-r border-border bg-muted px-3 py-3 text-left">Sr</th>
            <th className="sticky left-12 z-10 w-36 border-b border-r border-border bg-muted px-3 py-3 text-left">Reg No</th>
            <th className="w-48 border-b border-r border-border px-3 py-3 text-left">Name</th>
            <th className="w-20 border-b border-r border-border px-3 py-3 text-center font-bold text-primary">Total</th>
            {coList.map((co) => (
              <th key={co} className="w-24 border-b border-r border-border px-3 py-3 text-center text-xs">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="font-bold text-foreground">{co.toUpperCase()}</span>
                  <span className="text-[10px] text-muted-foreground">/{coMax[co] ?? '-'}</span>
                </div>
              </th>
            ))}
            {coList.map((co) => (
              <th key={co + "%"} className="w-20 border-b border-r border-border px-3 py-3 text-center text-xs text-success">
                {co.toUpperCase()}%
              </th>
            ))}
            {/* Hide delete column header for Viewers */}
            {!readOnly && <th className="w-20 border-b border-border px-3 py-3 text-center">Action</th>}
          </tr>
        </thead>

        <tbody>
          {students.map((s, i) => (
            <tr key={s.id || i} className="border-b border-border transition hover:bg-muted/30">
              {/* Serial */}
              <td className="sticky left-0 z-10 border-r border-border bg-card px-3 py-2 text-center text-muted-foreground">
                {i + 1}
              </td>
              {/* Reg No */}
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
              {/* Name */}
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
              {/* Total Marks (computed, read-only) */}
              <td className="border-r border-border px-3 py-2 text-center text-sm font-bold text-primary">
                {parseFloat(s.total_marks ?? s.totalMarks ?? 0).toFixed(1)}
              </td>

              {/* CO Marks columns (editable) */}
              {coList.map((co) => (
                <td key={co} className="border-r border-border px-2 py-2 text-center">
                  <input
                    type="number"
                    min="0"
                    max={coMax[co]}
                    value={s[co] !== undefined && s[co] !== null && s[co] !== '' ? s[co] : ""}
                    onChange={(e) => updateMark(i, co, e.target.value)}
                    disabled={readOnly}
                    className={`w-16 rounded border px-1.5 py-1 text-center text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring ${
                      parseFloat(s[co]) > (coMax[co] || Infinity)
                        ? 'border-destructive bg-destructive/10 text-destructive'
                        : 'border-input bg-background focus:border-ring'
                    } ${readOnly ? 'cursor-default opacity-60' : ''}`}
                  />
                </td>
              ))}

              {/* CO % columns (computed, read-only) */}
              {coList.map((co) => {
                const max = coMax[co] || 0;
                const val = parseFloat(s[co]) || 0;
                const pct = max > 0 ? ((val / max) * 100).toFixed(1) : '0.0';
                return (
                  <td key={co + "percent"} className="border-r border-border px-3 py-2 text-center text-xs text-success">
                    {pct}%
                  </td>
                );
              })}

              {/* Delete — hidden for read-only Viewers */}
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
