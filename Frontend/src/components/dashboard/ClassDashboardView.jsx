import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, BookOpen, ChevronRight, AlertCircle } from 'lucide-react';
import { fetchClassDashboard } from '../../Api/AttainmentApi';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { Skeleton } from '../ui/skeleton';

// Section/Class-level dashboard: the real student roster for this class, and the real courses
// its students are enrolled in — each course's attainment comes straight from
// GET /dashboard/class/:classId, which itself reuses the same calculation engine as every
// other attainment view. Marks-completion is counted against THIS class's roster, not the
// whole course (a course can span multiple sections).
export default function ClassDashboardView({ classId }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    // Deferred so the loading reset isn't a synchronous setState inside the effect
    // body (react-hooks/set-state-in-effect) while still showing the skeleton on switch.
    Promise.resolve().then(() => { if (!cancelled) setLoading(true); });
    fetchClassDashboard(classId)
      .then((res) => { if (!cancelled) { setData(res.data.data); setError(''); } })
      .catch(() => { if (!cancelled) setError('Could not load this class/section.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [classId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error) return <ErrorState description={error} />;
  if (!data) return null;

  const { class: cls, roster, courseAttainment } = data;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">
              Semester {cls.semester}{cls.section ? ` — Section ${cls.section}` : ''}
            </h3>
            <p className="text-xs text-muted-foreground">{roster.length} student{roster.length === 1 ? '' : 's'} mapped to this class</p>
          </div>
        </div>
      </div>

      {roster.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students mapped to this section yet."
          description="Map students to this class from Student Mapping before attainment data can be shown here."
          action={
            <button
              onClick={() => navigate('/admin/student-mapping')}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-5 py-2.5 font-medium text-secondary-foreground transition hover:bg-secondary/70"
            >
              Go to Student Mapping
            </button>
          }
        />
      ) : courseAttainment.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="This section isn't enrolled in any course yet."
          description="Enroll this class in a course from Course Enrollment to see attainment here."
          action={
            <button
              onClick={() => navigate('/admin/course-enrollment')}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-5 py-2.5 font-medium text-secondary-foreground transition hover:bg-secondary/70"
            >
              Go to Course Enrollment
            </button>
          }
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-[15px] font-bold text-foreground">Courses for this Section</h3>
          <div className="space-y-2">
            {courseAttainment.map((c) => (
              <button
                key={c.courseId}
                onClick={() => navigate(`/courses/${c.courseId}?tab=attainment`)}
                className="group flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:border-primary/30 hover:bg-primary/5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-center">
                  <span className="text-[10px] font-bold leading-none text-primary">{c.courseCode?.slice(0, 5) || '—'}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{c.subjectName}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>MTT: {c.sectionMttRecorded ?? 0}/{roster.length} completed</span>
                    <span>ETT: {c.sectionEttRecorded ?? 0}/{roster.length} completed</span>
                    {c.hasData ? (
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{c.overallPercent}% attainment</span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-3 w-3" /> No attainment data yet
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:text-primary" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
