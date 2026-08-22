import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

const fieldClass =
  'w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground';

export default function CreateCourseModal({
  show,
  onClose,
  formData,
  creating,
  academicStructure,
  handleChange,
  handleSubmit,
}) {
  return (
    <Dialog open={show} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Course</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>School *</label>
            <select name="school" required value={formData.school} onChange={handleChange} className={fieldClass}>
              <option value="">Select School</option>
              {Object.keys(academicStructure).map((school) => (
                <option key={school} value={school}>{school}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Department *</label>
            <select
              name="department"
              required
              disabled={!formData.school}
              value={formData.department}
              onChange={handleChange}
              className={fieldClass}
            >
              <option value="">Select Department</option>
              {formData.school &&
                academicStructure[formData.school].departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Subject Name *</label>
              <input
                type="text"
                name="subjectName"
                required
                placeholder="e.g. Data Structures"
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
                placeholder="e.g. CS201"
                value={formData.courseCode}
                onChange={handleChange}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Semester *</label>
              <select name="semester" value={formData.semester} onChange={handleChange} className={fieldClass}>
                {Array.from({ length: 8 }, (_, i) => i + 1).map((sem) => (
                  <option key={sem} value={sem}>Sem {sem}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Academic Year *</label>
              <input
                type="text"
                name="academicYear"
                required
                placeholder="e.g. 2025-2026"
                value={formData.academicYear}
                onChange={handleChange}
                className={fieldClass}
              />
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
