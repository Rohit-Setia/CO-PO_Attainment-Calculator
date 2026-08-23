import { motion } from 'framer-motion';
import { Trash2, Layers, Calendar, Settings, CheckCircle, AlertCircle } from 'lucide-react';
import { Badge } from '../ui/badge';

function StatusBadge({ course }) {
  const steps = [course.hasMapping, course.hasInternalMarks, course.hasExternalMarks];
  const completedCount = steps.filter(Boolean).length;

  if (completedCount === 3) {
    return (
      <Badge variant="success">
        <CheckCircle className="h-3 w-3" /> Fully Configured
      </Badge>
    );
  }
  if (completedCount > 0) {
    return (
      <Badge variant="warning">
        <AlertCircle className="h-3 w-3" /> {completedCount}/3 Steps Ready
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <Settings className="h-3 w-3" /> Setup Pending
    </Badge>
  );
}

export default function CourseCard({ course, onClick, onDelete, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.04, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      onClick={onClick}
      className="group relative flex min-h-[220px] cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-primary/40 hover:shadow-lg"
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            {course.course_code}
          </span>
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition duration-200 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
            title="Delete Course"
            aria-label="Delete course"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          <h4 className="line-clamp-1 text-lg font-bold text-foreground transition-colors group-hover:text-primary">
            {course.subject_name}
          </h4>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Layers className="h-3 w-3 shrink-0" />
            {course.programName ? (
              <>
                <span className="font-semibold text-foreground/80">{course.programName}</span>
                <span>·</span>
                <span>{course.departmentName || course.department}</span>
              </>
            ) : (
              <>{course.school} &bull; {course.department}</>
            )}
          </p>
          {course.programCode && (
            <p className="text-[11px] text-muted-foreground/80">
              {course.programCode}{course.programDegree ? ` · ${course.programDegree}` : ''}
              {course.programDuration ? ` · ${course.programDuration} year(s) · ${course.programTotalSemesters} semesters` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            Sem {course.semester} ({course.sessionName || course.academic_year})
          </span>
          <span className="font-medium text-foreground">{course.num_cos} COs</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <StatusBadge course={course} />
          <span className="text-xs font-medium text-primary group-hover:underline">Open Workspace &rarr;</span>
        </div>
      </div>
    </motion.div>
  );
}
