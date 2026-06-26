import React from 'react';
import { Loader2 } from 'lucide-react';

export default function CreateCourseModal({
  show,
  onClose,
  formData,
  creating,
  academicStructure,
  handleChange,
  handleSubmit
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/70 rounded-2xl shadow-2xl p-6 relative animate-in fade-in zoom-in duration-200">
        <h3 className="text-xl font-bold tracking-wide text-slate-100 mb-6">Create New Course</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">School *</label>
            <select
              name="school"
              required
              value={formData.school}
              onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:border-blue-500 focus:outline-none text-sm transition"
            >
              <option value="">Select School</option>
              {Object.keys(academicStructure).map((school) => (
                <option key={school} value={school}>{school}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Department *</label>
            <select
              name="department"
              required
              disabled={!formData.school}
              value={formData.department}
              onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:border-blue-500 focus:outline-none text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
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
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Subject Name *</label>
              <input
                type="text"
                name="subjectName"
                required
                placeholder="e.g. Data Structures"
                value={formData.subjectName}
                onChange={handleChange}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:border-blue-500 focus:outline-none text-sm transition"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Course Code *</label>
              <input
                type="text"
                name="courseCode"
                required
                placeholder="e.g. CS201"
                value={formData.courseCode}
                onChange={handleChange}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:border-blue-500 focus:outline-none text-sm transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Semester *</label>
              <select
                name="semester"
                value={formData.semester}
                onChange={handleChange}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:border-blue-500 focus:outline-none text-sm transition"
              >
                {Array.from({ length: 8 }, (_, i) => i + 1).map((sem) => (
                  <option key={sem} value={sem}>Sem {sem}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Academic Year *</label>
              <input
                type="text"
                name="academicYear"
                required
                placeholder="e.g. 2025-2026"
                value={formData.academicYear}
                onChange={handleChange}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:border-blue-500 focus:outline-none text-sm transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Number of COs *</label>
              <select
                name="numCos"
                value={formData.numCos}
                onChange={handleChange}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:border-blue-500 focus:outline-none text-sm transition"
              >
                <option value="5">5 COs</option>
                <option value="6">6 COs</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700/50 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 font-semibold text-sm transition text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-md transition disabled:opacity-50"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Course
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
