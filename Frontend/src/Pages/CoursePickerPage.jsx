import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import { fetchCourses } from '../Api/AttainmentApi';
import { useAcademicFilter, filterCoursesByAcademicSelection } from '../context/AcademicFilterContext';
import { usePageHeader } from '../context/PageHeaderContext';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/skeleton';
import PageTransition from '../components/ui/PageTransition';

// Several sidebar items (Internal Marks, CO Mapping, PO Mapping, CO-PO Calculation, Upload
// Excel) are inherently per-course in this app's data model — there's no global cross-course
// version of them. Rather than fabricate one, this page lets the teacher pick a course and
// deep-links straight into the matching Course Workspace tab, which does the real work.
export default function CoursePickerPage({ title, description, icon: Icon, targetTab, actionLabel = 'Open' }) {
  const navigate = useNavigate();
  const { semester, session, setAvailableSemesters, setAvailableSessions } = useAcademicFilter();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  usePageHeader({ title, subtitle: description });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchCourses();
      setCourses(res.data.data);
      setAvailableSemesters([...new Set(res.data.data.map((c) => c.semester))].sort((a, b) => a - b));
      setAvailableSessions([...new Set(res.data.data.map((c) => c.academic_year))].sort());
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load courses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleCourses = useMemo(
    () => filterCoursesByAcademicSelection(courses, semester, session),
    [courses, semester, session],
  );

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
    );
  }

  if (error) return <ErrorState description={error} onRetry={load} />;

  if (visibleCourses.length === 0) {
    return (
      <EmptyState
        icon={Icon || BookOpen}
        title="No courses available"
        description="Create a course first, then come back here to work with it."
        action={
          <button onClick={() => navigate('/courses')} className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-5 py-2.5 font-medium text-secondary-foreground transition hover:bg-secondary/70">
            Go to Courses & Programs
          </button>
        }
      />
    );
  }

  return (
    <PageTransition>
      <p className="mb-4 text-sm text-muted-foreground">Select a course to continue.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCourses.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/courses/${c.id}?tab=${targetTab}`)}
            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 text-left transition hover:border-primary/40 hover:shadow-md"
          >
            <div className="min-w-0">
              <p className="truncate font-bold text-foreground">{c.course_code}</p>
              <p className="truncate text-sm text-muted-foreground">{c.subject_name}</p>
              <p className="mt-1 text-xs text-muted-foreground">Sem {c.semester} &bull; {c.academic_year}</p>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
              {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </button>
        ))}
      </div>
    </PageTransition>
  );
}
