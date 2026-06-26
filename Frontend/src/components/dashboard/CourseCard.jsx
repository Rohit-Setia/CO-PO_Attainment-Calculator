import React from 'react';
import { Trash2, BookOpen, Layers, Calendar, Settings, CheckCircle, AlertCircle } from 'lucide-react';

export default function CourseCard({ course, onClick, onDelete }) {
  const getStatusBadge = () => {
    const steps = [
      { name: 'Mapping', done: course.hasMapping },
      { name: 'Internal Marks', done: course.hasInternalMarks },
      { name: 'External Marks', done: course.hasExternalMarks }
    ];
    const completedCount = steps.filter(s => s.done).length;

    if (completedCount === 3) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 animate-pulse">
          <CheckCircle className="h-3 w-3" /> Fully Configured
        </span>
      );
    } else if (completedCount > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          <AlertCircle className="h-3 w-3" /> {completedCount}/3 Steps Ready
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
          <Settings className="h-3 w-3" /> Setup Pending
        </span>
      );
    }
  };

  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-2xl bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/50 hover:border-blue-500/50 p-6 flex flex-col justify-between min-h-[220px] transition duration-300 shadow-md hover:shadow-lg shadow-slate-950/20 transform hover:-translate-y-1"
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
            {course.course_code}
          </span>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition duration-200"
            title="Delete Course"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          <h4 className="font-bold text-lg text-slate-100 group-hover:text-blue-300 transition duration-200 line-clamp-1">
            {course.subject_name}
          </h4>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <Layers className="h-3 w-3 text-slate-500" />
            {course.school} &bull; {course.department}
          </p>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-700/50 flex flex-col gap-3">
        <div className="flex justify-between items-center text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            Sem {course.semester} ({course.academic_year})
          </span>
          <span className="font-medium text-slate-300">
            {course.num_cos} COs
          </span>
        </div>
        <div className="flex justify-between items-center mt-1">
          {getStatusBadge()}
          <span className="text-xs text-blue-400 group-hover:underline font-medium">Open Workspace &rarr;</span>
        </div>
      </div>
    </div>
  );
}
