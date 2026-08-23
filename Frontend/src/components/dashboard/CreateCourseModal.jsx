import { Loader2, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

const fieldClass =
  'w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground';

// Phase 9 — Admin is the single source of truth. The Teacher/Admin picks School → Department →
// Program → Academic Year, and the semester list is computed server-side from the program's
// duration (duration years × 2). No academic information is typed in by hand; the backend
// derives the school/department names from the linked program.
export default function CreateCourseModal({
  show,
  onClose,
  formData,
  creating,
  schools,
  departments,
  programs,
  sessions,
  handleChange,
  handleSubmit,
}) {
  const selectedProgram = programs.find((p) => String(p.id) === String(formData.programId));
  const totalSemesters = selectedProgram?.total_semesters || selectedProgram?.totalSemesters || 0;
  const semesterOptions = totalSemesters > 0 ? Array.from({ length: totalSemesters }, (_, i) => i + 1) : [];

  return (
    <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Course</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>School *</label>
              <select name="schoolId" required value={formData.schoolId} onChange={handleChange} className={fieldClass}>
                <option value="">Select School</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Department *</label>
              <select
                name="departmentId"
                required
                disabled={!formData.schoolId}
                value={formData.departmentId}
                onChange={handleChange}
                className={fieldClass}
              >
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Program *</label>
              <select
                name="programId"
                required
                disabled={!formData.departmentId}
                value={formData.programId}
                onChange={handleChange}
                className={fieldClass}
              >
                <option value="">Select Program</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.degree || '—'} · {p.duration || '?'} yr)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Academic Year *</label>
              <select
                name="sessionId"
                required
                disabled={!formData.programId}
                value={formData.sessionId}
                onChange={handleChange}
                className={fieldClass}
              >
                <option value="">Select Year</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {selectedProgram && (
            <p className="flex items-center gap-1.5 rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary">
              <Info className="h-3.5 w-3.5 shrink-0" />
              {selectedProgram.name} — {selectedProgram.duration} year(s) = {totalSemesters} semesters (Sem 1 to Sem {totalSemesters})
            </p>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Semester *</label>
              <select
                name="semester"
                required
                disabled={!selectedProgram}
                value={formData.semester}
                onChange={handleChange}
                className={fieldClass}
              >
                <option value="">Sem</option>
                {semesterOptions.map((sem) => (
                  <option key={sem} value={sem}>Sem {sem}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Subject Name *</label>
              <input
                type="text"
                name="subjectName"
                required
                placeholder="e.g. Principles of Management"
                value={formData.subjectName}
                onChange={handleChange}
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass}>Course Code *</label>
              <input
                type="text"
                name="courseCode"
                required
                placeholder="e.g. MGT101"
                value={formData.courseCode}
                onChange={handleChange}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Starting Number of COs *</label>
            <select name="numCos" value={formData.numCos} onChange={handleChange} className={fieldClass}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} CO{n > 1 ? 's' : ''}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-muted-foreground">You can add or archive Course Outcomes any time from the course workspace.</p>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary-hover disabled:opacity-50"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Course
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
