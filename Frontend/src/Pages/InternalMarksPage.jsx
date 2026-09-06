import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ClipboardList, ChevronRight, Search, Users, CheckCircle2, AlertTriangle,
  CircleDashed, Save, UserPlus, Settings2, Loader2, RefreshCw,
  Download, Upload, FileSpreadsheet, X, TriangleAlert,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  fetchSchools, fetchDepartments, fetchPrograms, fetchSessions, fetchClasses,
  fetchClassStudents, fetchCourseEnrollment, enrollClassInCourse, enrollStudentsInCourse,
  fetchCourses, fetchCourseConfig, fetchCourseMarks, saveCourseMarks,
  downloadMarksTemplate, previewMarksImport, confirmMarksImport,
} from '../Api/AttainmentApi';

const Select = ({ label, value, onChange, disabled, loading, placeholder, options }) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-semibold text-slate-500">{label}</span>
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        disabled={disabled}
        className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-8 text-sm font-medium text-slate-800 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        <option value="">{loading ? 'Loading…' : placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {loading && (
        <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
      )}
    </div>
  </label>
);

const StatusPill = ({ status }) => {
  const styles = {
    Complete: 'bg-emerald-100 text-emerald-700',
    Partial: 'bg-amber-100 text-amber-700',
    Pending: 'bg-slate-100 text-slate-500',
    Error: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status] || styles.Pending}`}>
      {status}
    </span>
  );
};

export default function InternalMarksPage() {
  // ── Academic context ──
  const [schools, setSchools] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);

  const [schoolId, setSchoolId] = useState(null);
  const [departmentId, setDepartmentId] = useState(null);
  const [programId, setProgramId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [semester, setSemester] = useState(null);
  const [section, setSection] = useState(null);
  const [courseId, setCourseId] = useState(null);

  const [_loading, setLoading] = useState({ schools: false, departments: false, programs: false, sessions: false, classes: false });
  const [loadingCourses, setLoadingCourses] = useState(false);

  // ── Marks workspace ──
  const [assessment, setAssessment] = useState('MTT');
  const [outcomes, setOutcomes] = useState([]);
  const [students, setStudents] = useState([]); // [{studentId, regNo, name, rollNo, coMarks:{}, dirty}]
  const [enrolledIds, setEnrolledIds] = useState([]);
  const [_loadedCourse, setLoadedCourse] = useState(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const dirtyRef = useRef(false);

  const selectedClass = useMemo(
    () => classes.find((c) =>
      String(c.program_id) === String(programId)
      && String(c.academic_session_id) === String(sessionId)
      && String(c.semester) === String(semester)
      && (c.section ?? '') === (section ?? '')),
    [classes, programId, sessionId, semester, section],
  );

  const selectedCourse = useMemo(() => courses.find((c) => String(c.id) === String(courseId)), [courses, courseId]);

  // ── Cascading loads ──
  useEffect(() => {
    setLoading((p) => ({ ...p, schools: true }));
    Promise.all([fetchSchools(), fetchSessions()])
      .then(([s, sess]) => { setSchools(s.data.data); setSessions(sess.data.data); })
      .catch(() => toast.error('Unable to load academic structure. Please try again.'))
      .finally(() => setLoading((p) => ({ ...p, schools: false, sessions: false })));
  }, []);

  useEffect(() => {
    if (!schoolId) { setDepartments([]); return; }
    setLoading((p) => ({ ...p, departments: true }));
    fetchDepartments(schoolId)
      .then((r) => setDepartments(r.data.data))
      .catch(() => toast.error('Unable to load departments.'))
      .finally(() => setLoading((p) => ({ ...p, departments: false })));
  }, [schoolId]);

  useEffect(() => {
    if (!departmentId) { setPrograms([]); return; }
    setLoading((p) => ({ ...p, programs: true }));
    fetchPrograms(departmentId)
      .then((r) => setPrograms(r.data.data))
      .catch(() => toast.error('Unable to load programs.'))
      .finally(() => setLoading((p) => ({ ...p, programs: false })));
  }, [departmentId]);

  useEffect(() => {
    if (!programId || !sessionId) { setClasses([]); return; }
    setLoading((p) => ({ ...p, classes: true }));
    fetchClasses({ programId, sessionId })
      .then((r) => setClasses(r.data.data))
      .catch(() => toast.error('Unable to load classes/sections.'))
      .finally(() => setLoading((p) => ({ ...p, classes: false })));
  }, [programId, sessionId]);

  useEffect(() => {
    setLoadingCourses(true);
    fetchCourses()
      .then((r) => setCourses(r.data.data))
      .catch(() => toast.error('Unable to load courses.'))
      .finally(() => setLoadingCourses(false));
  }, []);

  const semesters = useMemo(
    () => [...new Set(classes.map((c) => c.semester))].sort((a, b) => a - b).map((s) => ({ value: s, label: `Semester ${s}` })),
    [classes],
  );
  const sections = useMemo(
    () => [...new Set(classes.filter((c) => String(c.semester) === String(semester)).map((c) => c.section ?? ''))]
      .map((s) => ({ value: s, label: s === '' ? 'No Section' : s })),
    [classes, semester],
  );

  // Courses visible in the current academic context (program + session when chosen).
  const visibleCourses = useMemo(() => courses.filter((c) => {
    if (programId && c.program_id && String(c.program_id) !== String(programId)) return false;
    if (sessionId && c.academic_session_id && String(c.academic_session_id) !== String(sessionId)) return false;
    return true;
  }), [courses, programId, sessionId]);

  // ── Load students + marks for the selected course ──
  const loadCourseWorkspace = useCallback(async (cid, examType) => {
    if (!cid) { setLoadedCourse(null); setStudents([]); setOutcomes([]); return; }
    const type = examType || assessment;
    setLoadingStudents(true);
    try {
      const [configRes, marksRes, enrollRes] = await Promise.all([
        fetchCourseConfig(cid),
        fetchCourseMarks(cid),
        fetchCourseEnrollment(cid),
      ]);
      const cos = configRes.data.data.outcomes || [];
      setOutcomes(cos.filter((co) => co.is_active !== false));

      const marksForType = type === 'MTT' ? marksRes.data.data.mtt : marksRes.data.data.ett;
      const marksByReg = new Map(marksForType.map((m) => [String(m.reg_no), m]));

      const enrolled = enrollRes.data?.data?.students || [];
      setEnrolledIds(enrolled.map((s) => s.id));
      setStudents(enrolled.map((s) => {
        const m = marksByReg.get(String(s.registration_number));
        return {
          studentId: s.id,
          regNo: s.registration_number,
          name: s.name,
          rollNo: s.roll_number || s.roll_no || '',
          coMarks: m ? { ...m.coMarks } : {},
          errors: {},
          dirty: false,
        };
      }));
      setLoadedCourse(configRes.data.data.course || { id: cid });
      dirtyRef.current = false;
    } catch (err) {
      console.error(err);
      toast.error('Unable to load students for this course. Please try again.');
    } finally {
      setLoadingStudents(false);
    }
  }, [assessment]);

  useEffect(() => { loadCourseWorkspace(courseId); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [courseId]);
  useEffect(() => { if (courseId) loadCourseWorkspace(courseId, assessment); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [assessment]);

  const maxFor = (co) => parseFloat(assessment === 'MTT' ? co.max_internal : co.max_external) || 0;

  const setMark = (regNo, coId, raw) => {
    setStudents((prev) => prev.map((s) => {
      if (s.regNo !== regNo) return s;
      const co = outcomes.find((c) => String(c.id) === String(coId));
      const max = maxFor(co);
      let error = null;
      if (raw !== '') {
        const val = Number(raw);
        if (Number.isNaN(val)) error = 'Must be a number';
        else if (val < 0) error = 'Cannot be negative';
        else if (max > 0 && val > max) error = `Cannot exceed ${max}`;
      }
      return {
        ...s,
        coMarks: { ...s.coMarks, [coId]: raw },
        errors: { ...s.errors, [coId]: error },
        dirty: true,
      };
    }));
    dirtyRef.current = true;
  };

  const rowStatus = (s) => {
    if (outcomes.some((co) => s.errors?.[String(co.id)])) return 'Error';
    const filled = outcomes.filter((co) => {
      const v = s.coMarks[String(co.id)];
      return v !== undefined && v !== '' && v !== null;
    }).length;
    if (filled === 0) return 'Pending';
    if (filled === outcomes.length && outcomes.length > 0) return 'Complete';
    return 'Partial';
  };
  const totalFor = (s) => outcomes.reduce((sum, co) => {
    const v = parseFloat(s.coMarks[String(co.id)]);
    return sum + (Number.isNaN(v) ? 0 : v);
  }, 0);
  const maxTotal = useMemo(() => outcomes.reduce((sum, co) => sum + maxFor(co), 0), [outcomes]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (q && !`${s.regNo} ${s.rollNo} ${s.name}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'All' && rowStatus(s) !== statusFilter) return false;
      return true;
    });
  }, [students, search, statusFilter, outcomes]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const counts = { Complete: 0, Partial: 0, Pending: 0, Error: 0 };
    students.forEach((s) => { counts[rowStatus(s)] += 1; });
    return counts;
  }, [students, outcomes]); // eslint-disable-line react-hooks/exhaustive-deps

  const changedStudents = students.filter((s) => s.dirty && !outcomes.some((co) => s.errors?.[String(co.id)]));

  const saveMarks = async () => {
    if (!courseId) return;
    if (changedStudents.length === 0) { toast.info('No changes to save.'); return; }
    setSaving(true);
    try {
      await saveCourseMarks(courseId, {
        examType: assessment,
        entryMode: 'co',
        students: changedStudents.map((s) => ({
          name: s.name,
          roll: s.regNo,
          coMarks: Object.fromEntries(outcomes.map((co) => {
            const v = s.coMarks[String(co.id)];
            return [co.id, v === '' || v === null || v === undefined ? '' : parseFloat(v)];
          })),
        })),
      });
      toast.success(`✓ Marks saved successfully (${changedStudents.length} student${changedStudents.length > 1 ? 's' : ''}).`);
      await loadCourseWorkspace(courseId, assessment);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Unable to save marks. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Warn before leaving with unsaved edits
  useEffect(() => {
    const handler = (e) => {
      if (dirtyRef.current && changedStudents.length > 0) {
        e.preventDefault(); e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [changedStudents.length]);

  // ── Enrollment actions ──
  const [classRoster, setClassRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const openEnrollDialog = async () => {
    setShowEnrollDialog(true);
    if (selectedClass) {
      setRosterLoading(true);
      try {
        const r = await fetchClassStudents(selectedClass.id);
        setClassRoster(r.data.data.map((s) => ({ ...s, enrolled: enrolledIds.includes(s.id) })));
      } catch { toast.error('Unable to load class roster.'); }
      finally { setRosterLoading(false); }
    } else {
      setClassRoster([]);
    }
  };
  const enrollAllClass = async () => {
    if (!selectedClass) { toast.error('Select a class/section first so the system knows which students to enroll.'); return; }
    try {
      await enrollClassInCourse(courseId, selectedClass.id);
      toast.success('Entire class enrolled in course.');
      await loadCourseWorkspace(courseId, assessment);
      setShowEnrollDialog(false);
    } catch { toast.error('Unable to enroll class. Please try again.'); }
  };
  const saveManualEnrollment = async () => {
    const ids = classRoster.filter((s) => s.enrolled && !enrolledIds.includes(s.id)).map((s) => s.id);
    if (ids.length === 0) { setShowEnrollDialog(false); return; }
    try {
      await enrollStudentsInCourse(courseId, ids);
      toast.success(`${ids.length} student(s) enrolled.`);
      await loadCourseWorkspace(courseId, assessment);
      setShowEnrollDialog(false);
    } catch { toast.error('Unable to save enrollment.'); }
  };

  const breadcrumb = [
    schools.find((s) => String(s.id) === String(schoolId))?.name,
    departments.find((d) => String(d.id) === String(departmentId))?.name,
    programs.find((p) => String(p.id) === String(programId))?.name,
    sessions.find((s) => String(s.id) === String(sessionId))?.name,
    semester ? `Semester ${semester}` : null,
    section || undefined,
    selectedCourse ? `${selectedCourse.course_code || ''} — ${selectedCourse.subject_name || selectedCourse.course_name || ''}` : null,
  ].filter(Boolean);
  // ── Phase 5: Marks Excel download & import ────────────────────────────────
  const [importState, setImportState] = useState(null);
  // importState: { step: 'preview'|'result', file, preview, rows, result, acknowledgeMissing }
  const [pendingAssessmentChange, setPendingAssessmentChange] = useState(null);

  const handleDownloadTemplate = async () => {
    if (!courseId) return;
    try {
      const res = await downloadMarksTemplate(courseId, assessment);
      const disposition = res.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const fileName = match?.[1] || `Marks_${assessment}_${courseId}.xlsx`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Marks Excel downloaded — it already contains your enrolled students.');
    } catch (err) {
      console.error(err);
      toast.error('Unable to generate the marks Excel. Please try again.');
    }
  };

  // Parse the uploaded workbook client-side (SheetJS), then send rows to the
  // backend which re-validates everything authoritatively against the DB.
  const parseWorkbook = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read the file.'));
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        resolve({ grid, sheetName: wb.SheetNames[0] });
      } catch (err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });

  const handleImportFile = async (file) => {
    if (!courseId) { toast.error('Select a course first.'); return; }
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error('Only .xlsx files are supported. Please upload the generated marks Excel.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File is too large (max 10 MB).');
      return;
    }
    let grid;
    try {
      grid = (await parseWorkbook(file)).grid;
    } catch {
      toast.error('Could not read this file as an Excel workbook.');
      return;
    }
    // Locate the table header row ("Registration No" in column B)
    const headerIdx = grid.findIndex((row) =>
      String(row?.[1] || '').trim().toLowerCase() === 'registration no');
    if (headerIdx === -1) {
      toast.error('This does not look like a generated marks template (header row not found). Please download the template first.');
      return;
    }
    // Map CO columns by header "CO{n} (max M)" to the course's active outcomes.
    const coCols = [];
    let totalColIdx = -1;
    grid[headerIdx].forEach((cell, colIdx) => {
      const cellStr = String(cell || '').trim();
      const m = cellStr.match(/^CO(\d+)\s*\(max/i);
      if (m) {
        const co = outcomes.find((c) => c.co_number === parseInt(m[1], 10));
        if (co) coCols.push({ coId: co.id, colIdx });
      }
      const normH = cellStr.toLowerCase().replace(/[\s._-]/g, '');
      if (['total', 'totalmarks', 'marks', 'grandtotal', 'score'].includes(normH)) {
        totalColIdx = colIdx;
      }
    });
    // Build rows; blank cells stay blank (never coerced to zero).
    const rows = [];
    for (let i = headerIdx + 1; i < grid.length; i += 1) {
      const row = grid[i];
      const regNo = row?.[1] !== undefined && row?.[1] !== null ? String(row[1]).trim() : '';
      if (!regNo) continue; // trailing blank rows
      const coMarks = {};
      coCols.forEach(({ coId, colIdx }) => {
        const raw = row?.[colIdx];
        coMarks[String(coId)] = raw === null || raw === undefined ? '' : raw;
      });
      let totalMarks = undefined;
      if (totalColIdx !== -1) {
        const rawT = row?.[totalColIdx];
        if (rawT !== null && rawT !== undefined && rawT !== '') totalMarks = rawT;
      }
      rows.push({
        rowNumber: i + 1,
        regNo,
        name: row?.[3] ? String(row[3]).trim() : '',
        coMarks,
        totalMarks,
      });
    }
    if (rows.length === 0) {
      toast.error('No student rows were found in the file.');
      return;
    }
    try {
      const res = await previewMarksImport(courseId, { examType: assessment, rows });
      setImportState({ step: 'preview', file, preview: res.data.data, rows, acknowledgeMissing: false });
    } catch (err) {
      console.error(err);
      setImportState(null);
      toast.error(err.response?.data?.message || 'Import validation failed. Please check the file and try again.');
    }
  };

  const downloadErrorReport = () => {
    const errs = importState?.preview?.errors || [];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['Row', 'Registration Number', 'Student Name', 'Column', 'Problem'].join(','),
      ...errs.map((e) => [e.row, e.regNo, e.name, e.column, e.problem].map(esc).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Excel_Import_Errors_${assessment}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doConfirmImport = async (acknowledgeMissing = false) => {
    if (!importState) return;
    try {
      const res = await confirmMarksImport(courseId, {
        examType: assessment,
        rows: importState.rows,
        acknowledgeMissing,
      });
      setImportState((prev) => ({ ...prev, step: 'result', result: res.data.data }));
      toast.success('✓ Marks imported successfully.');
      await loadCourseWorkspace(courseId, assessment); // refresh the online table immediately
    } catch (err) {
      if (err.response?.status === 400 && err.response?.data?.data?.missingStudents) {
        // Missing-student acknowledgement flow — teacher explicitly continues or cancels.
        setImportState((prev) => ({ ...prev, acknowledgeMissing: true }));
        toast.warning(err.response.data.message);
      } else {
        toast.error(err.response?.data?.message || 'Unable to save imported marks.');
      }
    }
  };


  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Internal Marks</h1>
        <p className="text-sm text-muted-foreground">Manage student assessment marks for your assigned courses.</p>
      </header>

      {/* ── Breadcrumb ── */}
      {breadcrumb.length > 0 && (
        <nav className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              <span className={i === breadcrumb.length - 1 ? 'font-semibold text-foreground' : ''}>{b}</span>
            </span>
          ))}
        </nav>
      )}

      {/* ── Academic context selection panel (cascading) ── */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Select Academic Context</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <label className="text-xs font-medium text-muted-foreground">
            School
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={schoolId}
              onChange={(e) => {
                setSchoolId(e.target.value); setDepartmentId(''); setProgramId(''); setSessionId(''); setSemester(''); setSection(''); setCourseId('');
              }}
            >
              <option value="">All Schools</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Department
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={departmentId}
              disabled={!schoolId}
              onChange={(e) => { setDepartmentId(e.target.value); setProgramId(''); setSessionId(''); setSemester(''); setSection(''); setCourseId(''); }}
            >
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Program
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={programId}
              disabled={!departmentId}
              onChange={(e) => { setProgramId(e.target.value); setSessionId(''); setSemester(''); setSection(''); setCourseId(''); }}
            >
              <option value="">All Programs</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Academic Session
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={sessionId}
              disabled={!programId}
              onChange={(e) => { setSessionId(e.target.value); setSemester(''); setSection(''); setCourseId(''); }}
            >
              <option value="">All Sessions</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Semester
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={semester ?? ''}
              disabled={!sessionId || semesters.length === 0}
              onChange={(e) => { setSemester(e.target.value === '' ? null : e.target.value); setSection(null); setCourseId(null); }}
            >
              <option value="">{semesters.length === 0 ? 'No semesters available' : 'All Semesters'}</option>
              {semesters.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Section / Class
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={section ?? ''}
              disabled={!semester}
              onChange={(e) => { setSection(e.target.value === '' ? null : e.target.value); setCourseId(null); }}
            >
              <option value="">No Section</option>
              {sections.map((sec) => <option key={sec.value} value={sec.value}>{sec.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Course
            <select
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={courseId ?? ''}
              disabled={loadingCourses || visibleCourses.length === 0}
              onChange={(e) => setCourseId(e.target.value === '' ? null : e.target.value)}
            >
              <option value="">{loadingCourses ? 'Loading…' : 'Select a course'}</option>
              {visibleCourses.map((c) => (
                <option key={c.id} value={c.id}>{c.course_code} — {c.subject_name || c.course_name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* ── No course selected ── */}
      {!courseId && (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-base font-semibold text-foreground">Select a course</p>
          <p className="mt-1 text-sm text-muted-foreground">Choose your academic context and course to view students.</p>
        </div>
      )}

      {courseId && (
        <>
          {/* ── Course summary ── */}
          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-lg font-bold text-foreground">
              {selectedCourse ? `${selectedCourse.course_code} — ${selectedCourse.subject_name || selectedCourse.course_name}` : `Course #${courseId}`}
            </h2>
            <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm text-muted-foreground">
              <div><dt className="inline font-medium text-foreground">Program: </dt><dd className="inline">{programs.find((p) => String(p.id) === String(programId))?.name || '—'}</dd></div>
              <div><dt className="inline font-medium text-foreground">Session: </dt><dd className="inline">{sessions.find((s) => String(s.id) === String(sessionId))?.name || '—'}</dd></div>
              <div><dt className="inline font-medium text-foreground">Semester: </dt><dd className="inline">{semester || '—'}</dd></div>
              <div><dt className="inline font-medium text-foreground">Section: </dt><dd className="inline">{section || 'No Section'}</dd></div>
              <div><dt className="inline font-medium text-foreground">Students: </dt><dd className="inline">{students.length}</dd></div>
            </dl>
          </section>

          {students.length === 0 && !loadingStudents ? (
            <div className="rounded-xl border border-dashed bg-card p-10 text-center">
              <p className="text-base font-semibold text-foreground">No students are enrolled in this academic context</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Students load automatically from Student Management / the course enrollment for this Program · Session · Semester.
                {selectedCourse?.hierarchyLinked === false && ' This course is not linked to the academic hierarchy yet.'}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button type="button" onClick={enrollAllClass} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">Enroll Class Students</button>
                <button type="button" onClick={openEnrollDialog} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Manage Enrollment</button>
              </div>
            </div>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Students</p><p className="text-xl font-bold">{students.length}</p></div>
                <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Completed</p><p className="text-xl font-bold text-green-600">{stats.Complete}</p></div>
                <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Partial</p><p className="text-xl font-bold text-amber-500">{stats.Partial}</p></div>
                <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Pending</p><p className="text-xl font-bold text-muted-foreground">{stats.Pending}</p></div>
                <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Errors</p><p className={`text-xl font-bold ${stats.Error > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{stats.Error}</p></div>
              </section>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  placeholder="Search by registration no, roll no, or name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full max-w-xs rounded-md border bg-background px-3 py-1.5 text-sm"
                />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-sm">
                  {['All', 'Complete', 'Partial', 'Pending', 'Error'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  Assessment
                  <select
                    value={assessment}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next !== assessment && (dirtyRef.current || changedStudents.length > 0)) {
                        setPendingAssessmentChange(next);
                      } else {
                        setAssessment(next);
                      }
                    }}
                    disabled={saving}
                    className="rounded-md border bg-background px-2 py-1.5 text-sm font-semibold text-foreground"
                  >
                    <option value="MTT">MTT</option>
                    <option value="ETT">ETT</option>
                  </select>
                </label>
                <span className="flex-1" />
                {changedStudents.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Unsaved Changes ({changedStudents.length})</span>
                )}
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={!courseId}
                  title={courseId ? 'Download a pre-filled marks Excel for this course' : 'Select a course first'}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  <Download className="h-4 w-4" /> Download Marks Excel
                </button>
                <button
                  type="button"
                  onClick={() => setImportState({ step: 'upload' })}
                  disabled={!courseId}
                  title={courseId ? 'Upload a completed marks Excel' : 'Select a course first'}
                  className="flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" /> Upload Completed Excel
                </button>
                <button type="button" onClick={openEnrollDialog} className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">Manage Enrollment</button>
                <button
                  type="button"
                  onClick={saveMarks}
                  disabled={saving || changedStudents.length === 0}
                  className="rounded-md bg-blue-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">Registration No</th>
                      <th className="px-3 py-2">Student Name</th>
                      <th className="px-3 py-2">Roll No</th>
                      {outcomes.map((co) => (
                        <th key={co.id} className="px-3 py-2 text-right">CO{co.co_number} /{maxFor(co)}</th>
                      ))}
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingStudents && (
                      <tr><td colSpan={outcomes.length + 5} className="px-3 py-8 text-center text-muted-foreground">Loading students…</td></tr>
                    )}
                    {!loadingStudents && visibleStudents.length === 0 && (
                      <tr><td colSpan={outcomes.length + 5} className="px-3 py-8 text-center text-muted-foreground">No marks entered yet — enter marks online or use the Excel workflow.</td></tr>
                    )}
                    {visibleStudents.map((s) => {
                      const status = rowStatus(s);
                      const statusClass = status === 'Complete' ? 'bg-green-100 text-green-700'
                        : status === 'Partial' ? 'bg-amber-100 text-amber-700'
                        : status === 'Error' ? 'bg-red-100 text-red-700'
                        : 'bg-muted text-muted-foreground';
                      return (
                        <tr key={s.studentId ?? s.regNo} className="border-b last:border-b-0 hover:bg-muted/30">
                          <td className="px-3 py-1.5 font-mono text-xs">{s.regNo}</td>
                          <td className="px-3 py-1.5">{s.name}</td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground">{s.rollNo || '—'}</td>
                          {outcomes.map((co) => {
                            const key = String(co.id);
                            const err = s.errors?.[key];
                            return (
                              <td key={key} className="px-2 py-1.5 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={s.coMarks[key] ?? ''}
                                  onChange={(e) => setMark(s.regNo, co.id, e.target.value)}
                                  title={err || ''}
                                  aria-invalid={!!err}
                                  className={`w-16 rounded border px-1.5 py-1 text-right text-sm ${err ? 'border-red-400 bg-red-50' : ''}`}
                                />
                                {err && <p className="mt-0.5 text-[10px] leading-tight text-red-600">{err}</p>}
                              </td>
                            );
                          })}
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{maxTotal > 0 ? `${totalFor(s)} / ${maxTotal}` : totalFor(s)}</td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}>{status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {showEnrollDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
              <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-background p-4 shadow-xl">
                <h3 className="text-base font-bold">Course Enrollment</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selectedClass ? `${classRoster.length} class students · ${enrolledIds.length} enrolled` : 'Select a class/section first to load its roster.'}
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setClassRoster(classRoster.map((s) => ({ ...s, enrolled: true })))} disabled={!selectedClass} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">Select All</button>
                  <button type="button" onClick={() => setClassRoster(classRoster.map((s) => ({ ...s, enrolled: false })))} disabled={!selectedClass} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">Deselect All</button>
                  <span className="flex-1" />
                  <button type="button" onClick={enrollAllClass} disabled={!selectedClass} className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50">Enroll Entire Class</button>
                </div>
                <ul className="mt-3 divide-y rounded-md border">
                  {rosterLoading && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Loading roster…</li>}
                  {!rosterLoading && classRoster.map((s, idx) => (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={!!s.enrolled}
                        onChange={(e) => setClassRoster(classRoster.map((x, i) => (i === idx ? { ...x, enrolled: e.target.checked } : x)))}
                        className="h-4 w-4"
                      />
                      <span className="font-mono text-xs text-muted-foreground">{s.registration_number}</span>
                      <span className="flex-1 truncate text-sm">{s.name}</span>
                    </li>
                  ))}
                  {!rosterLoading && !selectedClass && (
                    <li className="px-3 py-6 text-center text-sm text-muted-foreground">No class selected — choose a section above.</li>
                  )}
                </ul>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setShowEnrollDialog(false)} className="rounded-md border px-4 py-1.5 text-sm hover:bg-muted">Cancel</button>
                  <button type="button" onClick={saveManualEnrollment} className="rounded-md bg-blue-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-800">Save Enrollment</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Phase 5: Marks Excel import dialog ── */}
          {importState?.step === 'upload' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
              <div className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl">
                <h3 className="text-base font-bold">Upload Completed Marks Excel</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload the generated workbook for <span className="font-semibold">{selectedCourse?.course_code} — {selectedCourse?.subject_name || selectedCourse?.course_name}</span> ({assessment}). Students are matched by Registration No — never by name.
                </p>
                <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
                  <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                  <span className="text-sm font-medium">Click to choose an .xlsx file</span>
                  <span className="mt-0.5 text-xs text-muted-foreground">Max 10 MB · .xlsx only</span>
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportFile(file);
                    }}
                  />
                </label>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => setImportState(null)} className="rounded-md border px-4 py-1.5 text-sm hover:bg-muted">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {importState?.step === 'preview' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
              <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border bg-background p-5 shadow-xl">
                <h3 className="text-base font-bold">Excel Import Preview</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ['Enrolled', importState.preview.enrolledCount],
                    ['Matched', importState.preview.matchedCount],
                    ['Valid', importState.preview.validCount],
                    ['Errors', importState.preview.errorCount],
                    ['Missing', importState.preview.missingStudents.length],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border bg-muted/40 px-3 py-2 text-center">
                      <p className={`text-lg font-bold ${label === 'Errors' && value > 0 ? 'text-red-700' : 'text-foreground'}`}>{value}</p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>

                {importState.preview.errors.length > 0 && (
                  <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900">
                    {importState.preview.errors.map((e, i) => (
                      <li key={i}>
                        Row {e.row}{e.regNo ? ` · ${e.regNo}` : ''} — <span className="font-semibold">{e.column}</span>: {e.problem}
                      </li>
                    ))}
                  </ul>
                )}
                {importState.preview.missingStudents.length > 0 && (
                  <ul className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                    {importState.preview.missingStudents.map((m) => (
                      <li key={m.regNo}>Missing from file: {m.regNo}{m.name ? ` (${m.name})` : ''} — existing marks will not be deleted.</li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 max-h-56 overflow-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/80">
                      <tr className="text-left">
                        <th className="px-2 py-1.5">Reg No</th>
                        <th className="px-2 py-1.5">Student</th>
                        <th className="px-2 py-1.5">Roll No</th>
                        <th className="px-2 py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importState.preview.validRecords.map((r) => (
                        <tr key={r.regNo} className="border-t">
                          <td className="px-2 py-1 font-mono">{r.regNo}</td>
                          <td className="max-w-[200px] truncate px-2 py-1">{r.name}</td>
                          <td className="px-2 py-1">{r.rollNo || '—'}</td>
                          <td className="px-2 py-1">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.status === 'Update' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>{r.status}</span>
                          </td>
                        </tr>
                      ))}
                      {importState.preview.validRecords.length === 0 && (
                        <tr><td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">No valid records.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {importState.preview.errors.length > 0 && (
                    <button type="button" onClick={downloadErrorReport} className="rounded-md border px-4 py-1.5 text-sm hover:bg-muted">Download Error Report</button>
                  )}
                  <button type="button" onClick={() => setImportState(null)} className="rounded-md border px-4 py-1.5 text-sm hover:bg-muted">Cancel</button>
                  {importState.preview.errorCount === 0 && importState.preview.validCount > 0 && (
                    <button type="button" onClick={() => doConfirmImport(false)} className="rounded-md bg-blue-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-800">
                      Import Marks ({importState.preview.validCount})
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {importState?.step === 'result' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
              <div className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl">
                <h3 className="text-base font-bold text-green-700">✓ Marks imported successfully</h3>
                <ul className="mt-3 space-y-1 text-sm">
                  <li>{importState.result.processed} students processed</li>
                  <li>{importState.result.updated} marks updated</li>
                  <li>{importState.result.unchanged} unchanged</li>
                  <li>0 errors</li>
                </ul>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setImportState(null)} className="rounded-md bg-blue-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-800">View Marks</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Unsaved-changes confirmation before switching assessment ── */}
          {pendingAssessmentChange && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
              <div className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl">
                <h3 className="text-base font-bold">You have unsaved changes</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  You have unsaved changes. Are you sure you want to switch assessment type to <span className="font-semibold text-foreground">{pendingAssessmentChange}</span>? Unsaved edits will be discarded.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingAssessmentChange(null)}
                    className="rounded-md border px-4 py-1.5 text-sm hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAssessment(pendingAssessmentChange);
                      setPendingAssessmentChange(null);
                    }}
                    className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Discard Changes & Switch
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
  </div>
  );
}
