import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, CheckCircle2, XCircle } from 'lucide-react';
import { fetchCourses, fetchCourseMarks } from '../Api/AttainmentApi';
import { useAcademicFilter } from '../context/AcademicFilterContext';
import { usePageHeader } from '../context/PageHeaderContext';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import PageTransition from '../components/ui/PageTransition';

// There is no standalone "students" entity in this schema — a student only exists as marks
// rows scoped to a course. This page aggregates real (course, student) records across every
// course the user can access, rather than inventing a unified student registry that doesn't
// exist in the backend.
export default function StudentsPage() {
  const navigate = useNavigate();
  const { semester, session, setAvailableSemesters, setAvailableSessions } = useAcademicFilter();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  usePageHeader({ title: 'Students', subtitle: 'Aggregated across all accessible courses' });

  const load = async () => {
    setLoading(true);
    try {
      const coursesRes = await fetchCourses();
      const courses = coursesRes.data.data;
      setAvailableSemesters([...new Set(courses.map((c) => c.semester))].sort((a, b) => a - b));
      setAvailableSessions([...new Set(courses.map((c) => c.academic_year))].sort());

      const marksResults = await Promise.all(
        courses.map((c) => fetchCourseMarks(c.id).then((r) => ({ course: c, marks: r.data.data })).catch(() => null)),
      );

      const byStudent = new Map(); // `${courseId}:${reg_no}` -> row
      marksResults.filter(Boolean).forEach(({ course, marks }) => {
        [...(marks.mtt || []), ...(marks.ett || [])].forEach((s) => {
          const key = `${course.id}:${s.reg_no}`;
          const existing = byStudent.get(key) || {
            courseId: course.id, courseCode: course.course_code, subjectName: course.subject_name,
            semester: course.semester, academicYear: course.academic_year,
            regNo: s.reg_no, name: s.name, hasMtt: false, hasEtt: false,
          };
          byStudent.set(key, existing);
        });
        (marks.mtt || []).forEach((s) => { byStudent.get(`${course.id}:${s.reg_no}`).hasMtt = true; });
        (marks.ett || []).forEach((s) => { byStudent.get(`${course.id}:${s.reg_no}`).hasEtt = true; });
      });

      setRows(Array.from(byStudent.values()));
      setError('');
    } catch (err) {
      console.error(err);
      setError('Could not load student records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (semester !== 'all' && String(r.semester) !== String(semester)) return false;
      if (session !== 'all' && r.academicYear !== session) return false;
      if (!q) return true;
      return r.name?.toLowerCase().includes(q) || r.regNo?.toLowerCase().includes(q) || r.courseCode?.toLowerCase().includes(q);
    });
  }, [rows, search, semester, session]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error) return <ErrorState description={error} onRetry={load} />;

  return (
    <PageTransition className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, reg. no, or course code..."
          className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState icon={Users} title="No student records found" description="Enter marks in a course's Internal Marks tab to see students here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reg No</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Semester</TableHead>
              <TableHead>MTT</TableHead>
              <TableHead>ETT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((r) => (
              <TableRow key={`${r.courseId}:${r.regNo}`} className="cursor-pointer" onClick={() => navigate(`/courses/${r.courseId}?tab=marks`)}>
                <TableCell className="font-medium">{r.regNo}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.courseCode} &bull; {r.subjectName}</TableCell>
                <TableCell>{r.semester}</TableCell>
                <TableCell>{r.hasMtt ? <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> Recorded</Badge> : <Badge variant="secondary"><XCircle className="h-3 w-3" /> Missing</Badge>}</TableCell>
                <TableCell>{r.hasEtt ? <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> Recorded</Badge> : <Badge variant="secondary"><XCircle className="h-3 w-3" /> Missing</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PageTransition>
  );
}
