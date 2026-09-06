import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Target, Layers, TrendingUp, AlertTriangle, ShieldCheck, BarChart3,
  Download, ChevronRight, X,
} from 'lucide-react';
import {
  fetchSchools, fetchDepartments, fetchPrograms, fetchSessions,
  fetchProgramOBEDashboard, fetchCODrilldownStudents,
  fetchOutcomeCourseContributions, downloadOBEReport,
} from '../Api/AttainmentApi';
import { usePageHeader } from '../context/PageHeaderContext';
import PageTransition from '../components/ui/PageTransition';
import { Skeleton } from '../components/ui/skeleton';

const fieldClass = 'w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring';

const statusTone = (status) => {
  if (status === 'Achieved') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (status === 'Not Achieved') return 'bg-rose-500/10 text-rose-600 dark:text-rose-400';
  return 'bg-muted text-muted-foreground';
};

// Horizontal attainment bar on the 0–3 level scale.
const AttainmentBar = ({ value, max = 3 }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
    <div
      className="h-full rounded-full bg-primary transition-all"
      style={{ width: `${Math.min(100, Math.max(0, (Number(value) || 0) / max * 100))}%` }}
    />
  </div>
);

// Reusable modal shell for the drill-down views.
const ModalShell = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
    <div
      className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  </div>
);

export default function ProgramOBEDashboard() {
  usePageHeader({ title: 'Program OBE Dashboard', subtitle: 'CO / PO / PSO attainment, analytics & reporting' });

  const [schools, setSchools] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [schoolId, setSchoolId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [semester, setSemester] = useState('all');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [drill, setDrill] = useState(null);        // CO student drill-down modal payload
  const [contrib, setContrib] = useState(null);    // PO/PSO course-contribution modal payload
  const [exporting, setExporting] = useState('');

  const filters = useMemo(
    () => ({ sessionId: sessionId || undefined, semester }),
    [sessionId, semester],
  );

  useEffect(() => {
    fetchSchools().then((r) => setSchools(r.data.data || [])).catch(() => setSchools([]));
    fetchSessions().then((r) => setSessions(r.data.data || [])).catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    setDepartments([]); setDepartmentId(''); setPrograms([]); setProgramId(''); setData(null);
    if (!schoolId) return;
    fetchDepartments(schoolId).then((r) => setDepartments(r.data.data || [])).catch(() => setDepartments([]));
  }, [schoolId]);

  useEffect(() => {
    setPrograms([]); setProgramId(''); setData(null);
    if (!departmentId) return;
    fetchPrograms(departmentId).then((r) => setPrograms(r.data.data || [])).catch(() => setPrograms([]));
  }, [departmentId]);

  const loadDashboard = () => {
    if (!programId) { setData(null); return; }
    setLoading(true);
    fetchProgramOBEDashboard(programId, filters)
      .then((r) => setData(r.data.data))
      .catch((err) => toast.error(err.response?.data?.message || 'Could not load the OBE dashboard.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDashboard(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [programId, sessionId, semester]);

  const openDrilldown = (courseId, co) => {
    if (co.actualPercent === null || co.actualPercent === undefined) return;
    fetchCODrilldownStudents(programId, courseId, co.coNumber)
      .then((r) => setDrill({ co, ...r.data.data }))
      .catch(() => toast.error('Could not load the CO drill-down.'));
  };

  const openContributions = async (node) => {
    try {
      const r = await fetchOutcomeCourseContributions(programId, node.code, filters);
      setContrib(r.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load course contributions.');
    }
  };

  const doExport = async (format) => {
    if (!programId) return;
    setExporting(format);
    try {
      const blob = await downloadOBEReport(programId, filters, format);
      if (format === 'pdf') {
        const url = URL.createObjectURL(new Blob([blob], { type: 'text/html' }));
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        toast.info('Use the browser Print dialog → "Save as PDF" to produce the PDF file.');
        return;
      }
      const ext = format === 'excel' ? 'xlsx' : format;
      const mime = format === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv';
      const url = URL.createObjectURL(new Blob([blob], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `OBE_Report_${data?.program?.code || programId}_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`OBE report (${format}) exported.`);
    } catch (err) {
      toast.error(err.response?.data?.message || `Could not export the ${format} report.`);
    } finally {
      setExporting('');
    }
  };

  const summaryCard = (label, Icon, summary) => (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-extrabold text-foreground">
        {summary ? `${summary.achieved} / ${summary.total}` : '—'}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">outcomes meeting their configured target</p>
    </div>
  );

  const outcomeNodeCard = (node) => (
    <button
      key={node.code}
      onClick={() => openContributions(node)}
      className="w-full rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:shadow-sm"
      title={node.title || node.description || node.code}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">{node.code}</span>
        <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${statusTone(node.status)}`}>
          {node.status}
        </span>
      </div>
      <p className="mt-1.5 text-xl font-extrabold text-foreground">{Number(node.attainment || 0).toFixed(2)}</p>
      <p className="text-[10px] text-muted-foreground">Target: {node.target != null ? Number(node.target).toFixed(2) : '—'}</p>
      <div className="mt-2"><AttainmentBar value={node.attainment} /></div>
      <p className="mt-1.5 flex items-center gap-0.5 text-[10px] font-medium text-primary">
        Course contributions <ChevronRight className="h-3 w-3" />
      </p>
    </button>
  );

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Filters */}
        <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3 lg:grid-cols-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">School</span>
            <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} className={fieldClass}>
              <option value="">Select School</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Department</span>
            <select value={departmentId} disabled={!schoolId} onChange={(e) => setDepartmentId(e.target.value)} className={fieldClass}>
              <option value="">Select Department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Program</span>
            <select value={programId} disabled={!departmentId} onChange={(e) => setProgramId(e.target.value)} className={fieldClass}>
              <option value="">Select Program</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Batch / Session</span>
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className={fieldClass}>
              <option value="">All batches</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Semester</span>
            <select value={semester} onChange={(e) => setSemester(e.target.value)} className={fieldClass}>
              <option value="all">All semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>Semester {n}</option>)}
            </select>
          </label>
        </div>

        {!programId && !data && (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center">
            <Target className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="mt-3 text-base font-bold text-foreground">Select a program</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Choose School → Department → Program to compute its OBE attainment dashboard.
            </p>
          </div>
        )}

        {loading && !data && (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        )}

        {data && (
          <>
            {/* Program header + exports */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-gradient-to-r from-primary/10 to-primary/5 p-6">
              <div>
                <h2 className="text-lg font-bold text-foreground">{data.program?.name}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {data.program?.code} · Outcome version: <strong>{data.outcomeVersion?.label || 'N/A'}</strong>
                  {filters.semester !== 'all' ? ` · Semester ${filters.semester}` : ' · All semesters'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {['excel', 'csv', 'pdf'].map((f) => (
                  <button
                    key={f}
                    onClick={() => doExport(f)}
                    disabled={exporting === f}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/40 disabled:opacity-60"
                  >
                    {exporting === f ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Achievement summary */}
            <div className="grid gap-4 sm:grid-cols-3">
              {summaryCard('COs Achieved', TrendingUp, data.achievementSummary?.CO)}
              {summaryCard('POs Achieved', Target, data.achievementSummary?.PO)}
              {summaryCard('PSOs Achieved', Layers, data.achievementSummary?.PSO)}
            </div>

            {/* PO / PSO attainment grids */}
            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">PO Attainment</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(data.poAttainment || []).filter((p) => p.mapped).map(outcomeNodeCard)}
                </div>
              </section>
              <section>
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">PSO Attainment</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(data.psoAttainment || []).filter((p) => p.mapped).map(outcomeNodeCard)}
                </div>
              </section>
            </div>
            {/* Course-wise CO attainment */}
            <section>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Course CO Attainment</h3>
              <div className="space-y-4">
                {(data.coAttainment || []).map((course) => (
                  <div key={course.courseId} className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-sm font-bold text-foreground">{course.courseCode} · {course.subjectName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Semester {course.semester} · {course.enrolledCount} enrolled · Overall {course.overallCourseAttainment ?? '—'} / 3.00
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {(course.cos || []).map((co) => (
                        <button
                          key={co.coId}
                          onClick={() => openDrilldown(course.courseId, co)}
                          className={`rounded-xl border border-border p-3 text-left transition hover:border-primary/40 ${co.actualPercent == null ? 'opacity-60' : ''}`}
                          title={co.description || co.code}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-muted-foreground">{co.code}</span>
                            <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-bold ${statusTone(co.status)}`}>
                              {co.status}
                            </span>
                          </div>
                          <p className="mt-1 text-lg font-extrabold text-foreground">
                            {co.actualPercent != null ? `${Number(co.actualPercent).toFixed(0)}%` : '—'}
                          </p>
                          <p className="text-[9px] text-muted-foreground">Target {co.targetPercent != null ? `${Number(co.targetPercent).toFixed(0)}%` : '—'}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Weak outcomes + validation */}
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" /> Needs Attention
                </h3>
                <ul className="mt-3 space-y-2 text-xs">
                  {[
                    ...(data.weakOutcomes?.CO || []).map((w) => ({ ...w, kind: 'CO', actual: w.actualPercent, target: w.targetPercent })),
                    ...(data.weakOutcomes?.PO || []).map((w) => ({ ...w, kind: 'PO' })),
                    ...(data.weakOutcomes?.PSO || []).map((w) => ({ ...w, kind: 'PSO' })),
                  ].map((w) => (
                    <li key={`${w.kind}-${w.code}-${w.courseId || 'p'}`} className="flex items-center justify-between rounded-lg bg-card px-3 py-2">
                      <span className="font-semibold text-foreground">{w.kind} {w.code}{w.courseCode ? ` (${w.courseCode})` : ''}</span>
                      <span className="text-muted-foreground">
                        {w.actual != null ? Number(w.actual).toFixed(2) : '—'} vs target {w.target != null ? Number(w.target).toFixed(2) : '—'}
                      </span>
                    </li>
                  ))}
                  {(data.weakOutcomes?.CO || []).length === 0 && (data.weakOutcomes?.PO || []).length === 0 && (data.weakOutcomes?.PSO || []).length === 0 && (
                    <li className="rounded-lg bg-card px-3 py-2 text-muted-foreground">No weak outcomes below target in this scope.</li>
                  )}
                </ul>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" /> OBE Data Validation
                </h3>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {(data.validation || []).map((v) => (
                    <li key={v.type} className="flex items-start gap-2 rounded-lg px-2 py-1.5 odd:bg-muted/30">
                      <span>{v.level === 'error' ? '✕' : v.level === 'warning' ? '⚠' : v.level === 'info' ? 'ℹ' : '✓'}</span>
                      <span className="text-muted-foreground">{v.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {/* Heatmap */}
            {data.heatmap?.rows?.length > 0 && (
              <section className="overflow-x-auto rounded-2xl border border-border bg-card p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  <BarChart3 className="h-4 w-4" /> Program Outcome Heatmap (CO × PO/PSO mapping)
                </h3>
                <table className="min-w-max border-collapse text-[11px]">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-card px-3 py-2 text-left font-bold uppercase text-muted-foreground">Course / CO</th>
                      {[...(data.heatmap.columns?.PO || []), ...(data.heatmap.columns?.PSO || [])].map((c) => (
                        <th key={c} className="px-2 py-2 text-center font-bold text-muted-foreground">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.heatmap.rows.map((row) => (
                      <tr key={`${row.courseId}-${row.coCode}`} className="border-t border-border">
                        <td className="whitespace-nowrap px-3 py-1.5 font-semibold text-foreground">{row.courseCode} · {row.coCode}</td>
                        {Object.keys(row.values).map((code) => {
                          const v = row.values[code];
                          const tone = v >= 3 ? 'bg-emerald-500/70 text-white'
                            : v === 2 ? 'bg-sky-500/60 text-white'
                              : v === 1 ? 'bg-amber-500/50'
                                : 'text-muted-foreground';
                          return (
                            <td key={code} className={`px-2 py-1.5 text-center font-bold ${tone}`}>
                              {v > 0 ? v : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            </>
        )}

        {/* CO drill-down modal */}
        {drill && (
          <ModalShell
            title={`${drill.co.code} — Attainment Details`}
            subtitle={drill.co.description || undefined}
            onClose={() => setDrill(null)}
          >
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Attainment</p>
                <p className="mt-1 text-lg font-extrabold text-foreground">
                  {drill.co.actualPercent != null ? `${Number(drill.co.actualPercent).toFixed(0)}%` : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Target</p>
                <p className="mt-1 text-lg font-extrabold text-foreground">
                  {drill.co.targetPercent != null ? `${Number(drill.co.targetPercent).toFixed(0)}%` : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Status</p>
                <p className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${statusTone(drill.co.status)}`}>{drill.co.status}</p>
              </div>
            </div>

            <h4 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Assessment Contribution</h4>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(drill.co.assessmentContribution || []).map((a) => (
                <div key={a.examType} className="rounded-xl border border-border p-3 text-xs">
                  <p className="font-bold text-foreground">{a.examType}</p>
                  <p className="mt-1 text-muted-foreground">
                    Level {a.level} · {Number(a.percentAbove).toFixed(0)}% of {a.totalStudents} students above threshold
                    ({Number(a.thresholdMarks).toFixed(1)} / {Number(a.maxMarks).toFixed(0)} marks)
                  </p>
                </div>
              ))}
            </div>

            <h4 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Students</h4>
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-3 py-2 font-bold">#</th>
                    <th className="px-3 py-2 font-bold">Roll / Enrollment</th>
                    <th className="px-3 py-2 font-bold">Student</th>
                    <th className="px-3 py-2 text-right font-bold">MTT</th>
                    <th className="px-3 py-2 text-right font-bold">ETT</th>
                  </tr>
                </thead>
                <tbody>
                  {(drill.mtt || []).map((s, i) => {
                    const ett = (drill.ett || []).find((e) => e.roll === s.roll);
                    return (
                      <tr key={s.roll} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-1.5 font-mono">{s.roll}</td>
                        <td className="px-3 py-1.5">{s.name}</td>
                        <td className="px-3 py-1.5 text-right">{Number(s.marks).toFixed(1)}</td>
                        <td className="px-3 py-1.5 text-right">{ett ? Number(ett.marks).toFixed(1) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ModalShell>
        )}

        {/* PO/PSO course-contribution modal */}
        {contrib && (
          <ModalShell
            title={`${contrib.outcome.code} — Course Contributions`}
            subtitle={`Program attainment ${Number(contrib.outcome.attainment).toFixed(2)} · student-weighted across contributing courses`}
            onClose={() => setContrib(null)}
          >
            {(contrib.courses || []).length === 0 ? (
              <p className="rounded-xl bg-muted/40 p-4 text-xs text-muted-foreground">
                No courses have mapped this outcome yet — a missing mapping is not zero attainment.
              </p>
            ) : (
              <div className="space-y-2">
                {contrib.courses.map((c) => (
                  <div key={`${c.courseId}-${c.code}`} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-xs">
                    <div>
                      <p className="font-bold text-foreground">{c.code}</p>
                      <p className="text-[10px] text-muted-foreground">{c.weight} students contributing</p>
                    </div>
                    <span className="text-base font-extrabold text-foreground">{Number(c.contribution).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </ModalShell>
        )}
      </div>
    </PageTransition>
  );
}