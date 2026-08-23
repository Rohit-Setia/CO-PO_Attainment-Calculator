import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  Users, BookOpen, ClipboardCheck, TrendingUp, Target, Upload, PenSquare,
  FolderKanban, Download, ArrowRight, GraduationCap, Info, Calculator,
  MapPin, Calendar, ChevronRight, AlertCircle,
} from 'lucide-react';
import { fetchDashboardSummary, fetchCourses } from '../Api/AttainmentApi';
import { usePageHeader } from '../context/PageHeaderContext';
import { useAcademicFilter, filterCoursesByAcademicSelection } from '../context/AcademicFilterContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import MetricCard from '../components/ui/MetricCard';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/skeleton';
import PageTransition from '../components/ui/PageTransition';
import Breadcrumb from '../components/ui/Breadcrumb';
import HierarchyFilterBar from '../components/dashboard/HierarchyFilterBar';
import DataQualityPanel from '../components/dashboard/DataQualityPanel';
import ClassDashboardView from '../components/dashboard/ClassDashboardView';

// ─── Heatmap colour helper ────────────────────────────────────────────────────
const heatColor = (percent) => {
  if (percent >= 80) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400';
  if (percent >= 60) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400';
  if (percent >= 40) return 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400';
  return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';
};

// ─── Custom Recharts tooltip ──────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-foreground">{payload[0].value}%</p>
      <p className="text-[10px] text-muted-foreground">CO Attainment</p>
    </div>
  );
}

// ─── Quick actions config ─────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    label: 'Upload Marks',
    description: 'Import student marks from Excel',
    icon: Upload,
    to: '/upload-excel',
    tone: 'blue',
  },
  {
    label: 'Edit Marks',
    description: 'View and edit student marks',
    icon: PenSquare,
    to: '/internal-marks',
    tone: 'blue',
  },
  {
    label: 'Manage Courses',
    description: 'Create and manage courses',
    icon: FolderKanban,
    to: '/courses',
    tone: 'blue',
  },
  {
    label: 'CO-PO Calculation',
    description: 'Calculate attainment results',
    icon: Calculator,
    to: '/co-po-calculation',
    tone: 'blue',
  },
  {
    label: 'Reports',
    description: 'Generate academic reports',
    icon: Download,
    to: '/reports',
    tone: 'blue',
  },
];

// ─── Attainment bar colour helper ─────────────────────────────────────────────
const barColor = (percent) => {
  if (percent >= 80) return '#10b981'; // emerald
  if (percent >= 60) return '#f59e0b'; // amber
  return '#3b82f6'; // blue default
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const {
    semester, session, setAvailableSemesters, setAvailableSessions,
    schools, departments, programs, academicSessions,
    schoolId, departmentId, programId, academicSessionId, hierarchySemester, classId,
    hierarchyActive,
  } = useAcademicFilter();

  const [summary, setSummary] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  usePageHeader({ title: 'Dashboard', subtitle: 'CO-PO Attainment Overview' });

  const hierarchyFilters = useMemo(() => ({
    schoolId: schoolId !== 'all' ? schoolId : undefined,
    departmentId: departmentId !== 'all' ? departmentId : undefined,
    programId: programId !== 'all' ? programId : undefined,
    sessionId: academicSessionId !== 'all' ? academicSessionId : undefined,
    semester: hierarchySemester !== 'all' ? hierarchySemester : undefined,
  }), [schoolId, departmentId, programId, academicSessionId, hierarchySemester]);

  const load = async () => {
    setLoading(true);
    try {
      const [summaryRes, coursesRes] = await Promise.all([fetchDashboardSummary(hierarchyFilters), fetchCourses()]);
      setSummary(summaryRes.data.data);
      setCourses(coursesRes.data.data);

      const semesters = [...new Set(coursesRes.data.data.map((c) => c.semester))].sort((a, b) => a - b);
      const sessions = [...new Set(coursesRes.data.data.map((c) => c.academic_year))].sort();
      setAvailableSemesters(semesters);
      setAvailableSessions(sessions);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Could not load dashboard data. Ensure the database is connected.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchyFilters]);

  // Real, resolved names for the current hierarchy selection — never index numbers or IDs.
  const filterBreadcrumb = useMemo(() => {
    if (!hierarchyActive) return [];
    const school = schools.find((s) => String(s.id) === String(schoolId));
    const dept = departments.find((d) => String(d.id) === String(departmentId));
    const prog = programs.find((p) => String(p.id) === String(programId));
    const sess = academicSessions.find((s) => String(s.id) === String(academicSessionId));
    return [
      { label: school?.name },
      { label: dept?.name },
      { label: prog?.name },
      { label: sess?.name },
      { label: hierarchySemester !== 'all' ? `Semester ${hierarchySemester}` : null },
    ];
  }, [hierarchyActive, schools, departments, programs, academicSessions, schoolId, departmentId, programId, academicSessionId, hierarchySemester]);

  const filteredCourseIds = useMemo(() => {
    if (!courses.length) return null;
    if (semester === 'all' && session === 'all') return null;
    return new Set(filterCoursesByAcademicSelection(courses, semester, session).map((c) => c.id));
  }, [courses, semester, session]);

  const courseAttainment = useMemo(() => {
    const list = summary?.courseAttainment || [];
    return filteredCourseIds ? list.filter((c) => filteredCourseIds.has(c.courseId)) : list;
  }, [summary, filteredCourseIds]);

  const heatmapRows = useMemo(() => {
    const rows = summary?.semesterPoHeatmap || [];
    return semester === 'all' ? rows : rows.filter((r) => String(r.semester) === String(semester));
  }, [summary, semester]);

  const filteredCourses = useMemo(
    () => (filteredCourseIds ? courses.filter((c) => filteredCourseIds.has(c.id)) : courses),
    [courses, filteredCourseIds],
  );

  const recentCourses = useMemo(
    () => [...filteredCourses].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5),
    [filteredCourses],
  );

  // Determine if PO is genuinely not configured
  const poNotConfigured = useMemo(() => {
    if (heatmapRows.length === 0) return true;
    return heatmapRows.every((row) =>
      Array.from({ length: 12 }, (_, i) => row[`po${i + 1}`] || 0).every((v) => v === 0),
    );
  }, [heatmapRows]);

  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#1e293b' : '#f1f5f9';

  // ─── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return <ErrorState description={error} onRetry={load} />;
  }

  return (
    <PageTransition className="space-y-6">

      {/* ── Hero banner ────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-900/30 bg-gradient-to-br from-[#0D162B] via-[#0f2352] to-[#1a3a8a] p-6 text-white sm:p-8">
        {/* Subtle academic pattern — inline SVG, no external images */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <svg className="absolute -right-10 -top-10 h-64 w-64 opacity-[0.06]" viewBox="0 0 200 200" fill="none">
            <circle cx="100" cy="100" r="80" stroke="white" strokeWidth="2" />
            <circle cx="100" cy="100" r="60" stroke="white" strokeWidth="1.5" />
            <circle cx="100" cy="100" r="40" stroke="white" strokeWidth="1" />
            <line x1="100" y1="20" x2="100" y2="180" stroke="white" strokeWidth="1" />
            <line x1="20" y1="100" x2="180" y2="100" stroke="white" strokeWidth="1" />
            <line x1="43" y1="43" x2="157" y2="157" stroke="white" strokeWidth="0.8" />
            <line x1="157" y1="43" x2="43" y2="157" stroke="white" strokeWidth="0.8" />
          </svg>
          <GraduationCap className="absolute bottom-4 right-8 h-24 w-24 opacity-[0.07] text-white" />
        </div>

        <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="mb-1 text-sm font-medium text-blue-200/80">CT University Academic Portal</p>
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Welcome back, {user?.name?.split(' ')[0] || 'Professor'}
            </h2>
            <p className="mt-1.5 max-w-lg text-[14px] leading-relaxed text-blue-100/80">
              Course Outcome — Program Outcome attainment across your courses at CT University.
            </p>
          </div>
          <button
            onClick={() => navigate('/courses')}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-white/10 border border-white/20 backdrop-blur-sm px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            <FolderKanban className="h-4 w-4" />
            Manage Courses
          </button>
        </div>
      </div>

      {/* ── Cascading academic hierarchy filter ───────────────────────────────── */}
      <HierarchyFilterBar semesterOptions={availableSemesters} />
      {filterBreadcrumb.length > 0 && <Breadcrumb segments={filterBreadcrumb} />}

      {/* ── Section/Class selected → dedicated Section dashboard ──────────────── */}
      {classId !== 'all' ? (
        <ClassDashboardView classId={classId} />
      ) : (
      <>
      {/* ── No courses → Empty state ────────────────────────────────────────── */}
      {courseAttainment.length === 0 && filteredCourses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No course data available yet."
          description="Create your first course to start tracking CO-PO attainment."
          action={
            <button
              onClick={() => navigate('/courses')}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-5 py-2.5 font-medium text-secondary-foreground transition hover:bg-secondary/70"
            >
              Create Course
            </button>
          }
        />
      ) : (
        <>
          {/* ── Stat cards ─────────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard icon={Users} label="Total Students" value={summary.totalStudents} index={0} />
            <MetricCard icon={BookOpen} label="Total Courses" value={filteredCourses.length} index={1} />
            <MetricCard
              icon={ClipboardCheck}
              label="Assessments"
              value={summary.totalAssessments}
              index={2}
              tone="muted"
            />
            <MetricCard
              icon={TrendingUp}
              label="Avg. CO Attainment"
              value={`${summary.avgCoAttainmentPercent}%`}
              index={3}
              tone="success"
            />
            <MetricCard
              icon={Target}
              label="Avg. PO Attainment"
              value={poNotConfigured ? '—' : `${summary.avgPoAttainmentPercent}%`}
              subLabel={poNotConfigured ? 'Not Configured' : undefined}
              index={4}
              tone={poNotConfigured ? 'muted' : 'success'}
            />
          </div>

          {/* ── Data Quality Warnings ─────────────────────────────────────────── */}
          <DataQualityPanel warnings={summary?.dataQualityWarnings || []} />

          {/* ── Charts row ─────────────────────────────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-2">

            {/* CO Attainment Bar Chart */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-1 flex items-center justify-between">
                <div>
                  <h3 className="text-[15px] font-bold text-foreground">Course Attainment Overview</h3>
                  <p className="text-[12px] text-muted-foreground">Overall CO attainment by course</p>
                </div>
                <button
                  onClick={() => navigate('/courses')}
                  className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  View Details <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {courseAttainment.some((c) => c.hasData) ? (
                <div className="mt-4 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={courseAttainment.map((c) => ({ name: c.courseCode, percent: c.overallPercent }))}
                      barSize={36}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis
                        dataKey="name"
                        stroke={axisColor}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke={axisColor}
                        domain={[0, 100]}
                        unit="%"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: isDark ? '#1e293b' : '#f8fafc' }} />
                      <Bar dataKey="percent" radius={[8, 8, 0, 0]}>
                        {courseAttainment.map((c, i) => (
                          <Cell key={i} fill={barColor(c.overallPercent)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  No attainment data yet. Enter and save marks in a course to see this chart.
                </p>
              )}

              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Info className="h-3 w-3 shrink-0" />
                CO definitions vary by course, so attainment is shown at course level.
              </p>
            </div>

            {/* PO Attainment Heatmap — or empty state */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-1 flex items-center justify-between">
                <div>
                  <h3 className="text-[15px] font-bold text-foreground">PO Attainment Heatmap</h3>
                  <p className="text-[12px] text-muted-foreground">Semester-wise Program Outcome attainment</p>
                </div>
                <button
                  onClick={() => navigate('/po-mapping')}
                  className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  Configure <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {poNotConfigured ? (
                /* Professional PO empty state */
                <div className="mt-4 flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border py-12 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted/50">
                    <AlertCircle className="h-6 w-6 text-muted-foreground/60" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">PO Attainment Not Available</p>
                    <p className="mx-auto max-w-[240px] text-[12px] leading-relaxed text-muted-foreground">
                      PO mapping has not been configured for the available courses.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/po-mapping')}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                  >
                    Configure PO Mapping
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr>
                          <th className="p-2 text-left text-[11px] font-semibold text-muted-foreground">Sem</th>
                          {Array.from({ length: 12 }, (_, i) => (
                            <th key={i} className="p-2 text-center text-[11px] font-semibold text-muted-foreground">
                              PO{i + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {heatmapRows.map((row) => (
                          <tr key={row.semester}>
                            <td className="p-2 text-[11px] font-semibold text-foreground">Sem {row.semester}</td>
                            {Array.from({ length: 12 }, (_, i) => (
                              <td key={i} className="p-1">
                                <div
                                  className={`rounded-md py-1.5 text-center text-[11px] font-semibold ${heatColor(row[`po${i + 1}`] || 0)}`}
                                >
                                  {row[`po${i + 1}`] || 0}%
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> 80–100% High
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> 60–79% Medium
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> 40–59% Low
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> &lt;40% Very Low
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Marks Completion ──────────────────────────────────────────── */}
          {courseAttainment.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h3 className="mb-1 text-[15px] font-bold text-foreground">Marks Completion</h3>
              <p className="mb-4 text-[12px] text-muted-foreground">
                Students with recorded marks vs. students enrolled, per course and exam component
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4">Course</th>
                      <th className="py-2 pr-4 text-center">Enrolled</th>
                      <th className="py-2 pr-4 text-center">MTT Completed</th>
                      <th className="py-2 text-center">ETT Completed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {courseAttainment.map((c) => (
                      <tr key={c.courseId}>
                        <td className="py-2 pr-4 font-medium text-foreground">{c.courseCode} — {c.subjectName}</td>
                        <td className="py-2 pr-4 text-center">
                          {c.enrollmentConfigured ? c.enrolledCount : <span className="italic text-muted-foreground">Not configured</span>}
                        </td>
                        <td className="py-2 pr-4 text-center">
                          {c.enrollmentConfigured ? `${c.mttRecordedCount}/${c.enrolledCount}` : `${c.mttRecordedCount} recorded`}
                        </td>
                        <td className="py-2 text-center">
                          {c.enrollmentConfigured ? `${c.ettRecordedCount}/${c.enrolledCount}` : `${c.ettRecordedCount} recorded`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Bottom row: Recent Courses / Quick Actions / Activity ─────── */}
          <div className="grid gap-6 lg:grid-cols-3">

            {/* Recent Courses */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-foreground">Recent Courses</h3>
                <button
                  onClick={() => navigate('/courses')}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  View All
                </button>
              </div>

              {recentCourses.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No courses yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentCourses.map((c) => {
                    const att = summary?.courseAttainment?.find((a) => a.courseId === c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => navigate(`/courses/${c.id}`)}
                        className="group flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:border-primary/30 hover:bg-primary/5"
                      >
                        {/* Course code badge */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-center">
                          <span className="text-[10px] font-bold leading-none text-primary">
                            {c.course_code?.slice(0, 5) || '—'}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{c.subject_name}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-0.5">
                              <Calendar className="h-3 w-3" /> Sem {c.semester}
                            </span>
                            {att?.hasData && (
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                {att.overallPercent}%
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:text-primary" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h3 className="mb-4 text-[15px] font-bold text-foreground">Quick Actions</h3>
              <div className="space-y-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => navigate(action.to)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition hover:border-primary/30 hover:bg-primary/5"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white">
                      <action.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{action.label}</p>
                      <p className="text-[11px] text-muted-foreground">{action.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:text-primary" />
                  </button>
                ))}
              </div>
            </div>

            {/* Recently Created Courses — activity timeline */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h3 className="mb-4 text-[15px] font-bold text-foreground">Recently Created Courses</h3>
              {recentCourses.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No recent activity.</p>
              ) : (
                <ul className="space-y-1">
                  {recentCourses.map((c, idx) => (
                    <li key={c.id} className="relative flex gap-3">
                      {/* Timeline line */}
                      {idx < recentCourses.length - 1 && (
                        <div className="absolute left-[11px] top-8 h-full w-0.5 bg-border" />
                      )}
                      {/* Dot */}
                      <div className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                        <div className="h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" />
                      </div>
                      {/* Content */}
                      <div className="min-w-0 flex-1 pb-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                          Course Created
                        </p>
                        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                          {c.course_code} — {c.subject_name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
      </>
      )}

      {/* ── Footer / University Identity ────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-8 text-center shadow-sm">
        {/* Official CT University Logo */}
        <img
          src="/ct-university-logo.png"
          alt="CT University"
          className="h-12 w-auto object-contain opacity-90"
        />
        <div className="space-y-0.5">
          <p className="text-sm font-bold text-foreground">CT University, Ludhiana</p>
          <p className="text-[12px] italic text-muted-foreground">
            Empowering Education. Enhancing Excellence.
          </p>
        </div>
        <div className="h-px w-24 bg-border" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Academic Management System
        </p>
      </div>
    </PageTransition>
  );
}
