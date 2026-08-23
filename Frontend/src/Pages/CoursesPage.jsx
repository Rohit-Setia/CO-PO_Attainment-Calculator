import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchCourses, createCourse, deleteCourse, importCourseJson } from '../Api/AttainmentApi';
import { useAuth } from '../context/AuthContext';
import { useAcademicFilter, filterCoursesByAcademicSelection } from '../context/AcademicFilterContext';
import { usePageHeader } from '../context/PageHeaderContext';
import {
  BookOpen, Plus, Loader2, RefreshCw, Upload, CheckCircle2, X, Layers, ListChecks,
} from 'lucide-react';

import CourseCard from '../components/dashboard/CourseCard';
import CreateCourseModal from '../components/dashboard/CreateCourseModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import MetricCard from '../components/ui/MetricCard';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/skeleton';
import PageTransition from '../components/ui/PageTransition';

const academicStructure = {
  Engineering: {
    departments: ["CSE", "Mechanical"],
  },
  Management: {
    departments: ["BBA", "MBA"],
  },
};

const CoursesPage = () => {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { semester, session, setAvailableSemesters, setAvailableSessions } = useAcademicFilter();
  const [courses, setCourses]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [creating, setCreating]     = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleting, setDeleting]     = useState(false);

  const importInputRef              = useRef(null);
  const [importData, setImportData] = useState(null);
  const [importing, setImporting]   = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

  const [formData, setFormData] = useState({
    school: '',
    department: '',
    subjectName: '',
    courseCode: '',
    semester: '1',
    academicYear: new Date().getFullYear() + '-' + (new Date().getFullYear() + 1),
    numCos: '5'
  });

  const loadCourses = async () => {
    setLoading(true);
    try {
      const response = await fetchCourses();
      setCourses(response.data.data);
      const semesters = [...new Set(response.data.data.map((c) => c.semester))].sort((a, b) => a - b);
      const sessions = [...new Set(response.data.data.map((c) => c.academic_year))].sort();
      setAvailableSemesters(semesters);
      setAvailableSessions(sessions);
      setError('');
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Could not load courses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleCourses = useMemo(
    () => filterCoursesByAcademicSelection(courses, semester, session),
    [courses, semester, session],
  );

  const metrics = useMemo(() => {
    const total = visibleCourses.length;
    const fullyConfigured = visibleCourses.filter(
      (c) => c.hasMapping && c.hasInternalMarks && c.hasExternalMarks
    ).length;
    const inProgress = total - fullyConfigured - visibleCourses.filter(
      (c) => !c.hasMapping && !c.hasInternalMarks && !c.hasExternalMarks
    ).length;
    const totalCos = visibleCourses.reduce((sum, c) => sum + (c.num_cos || 0), 0);
    return { total, fullyConfigured, inProgress, totalCos };
  }, [visibleCourses]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'school') {
        updated.department = '';
      }
      return updated;
    });
  };

  const handleCreateCourse = async (e) => {
    e.preventDefault();
    if (!formData.school || !formData.department || !formData.subjectName || !formData.courseCode || !formData.academicYear) {
      toast.error('Please fill all required fields.');
      return;
    }
    setCreating(true);
    try {
      await createCourse({
        ...formData,
        semester: parseInt(formData.semester),
        numCos: parseInt(formData.numCos)
      });
      setShowModal(false);
      setFormData({
        school: '',
        department: '',
        subjectName: '',
        courseCode: '',
        semester: '1',
        academicYear: new Date().getFullYear() + '-' + (new Date().getFullYear() + 1),
        numCos: '5'
      });
      await loadCourses();
      toast.success('Course created successfully.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create course.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCourse = (id, e) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDeleteCourse = async () => {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await deleteCourse(pendingDeleteId);
      await loadCourses();
      toast.success('Course deleted.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete course.');
    } finally {
      setDeleting(false);
      setPendingDeleteId(null);
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (importInputRef.current) importInputRef.current.value = '';

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.exportVersion || !parsed.course) {
          setImportError('Invalid file: this does not appear to be a CO-PO course snapshot.');
          return;
        }
        setImportData(parsed);
        setImportError('');
        setImportSuccess('');
      } catch {
        setImportError('Could not parse the file. Make sure it is a valid .json snapshot.');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!importData) return;
    setImporting(true);
    setImportError('');
    try {
      const res = await importCourseJson(importData);
      const newId = res.data.data.id;
      setImportSuccess(`"${importData.course.subject_name}" imported! Opening workspace...`);
      await loadCourses();
      setTimeout(() => navigate(`/courses/${newId}`), 1200);
    } catch (err) {
      setImportError(err.response?.data?.message || 'Failed to import course.');
    } finally {
      setImporting(false);
    }
  };

  const cancelImport = () => {
    setImportData(null);
    setImportError('');
    setImportSuccess('');
  };

  const headerActions = (
    <>
      {!hasRole('Viewer') && (
        <label
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-secondary"
          title="Import a course from another teacher's JSON snapshot"
        >
          <Upload className="h-3.5 w-3.5" /> Import
          <input ref={importInputRef} type="file" accept=".json,application/json" onChange={handleImportFile} className="hidden" />
        </label>
      )}
      {hasRole('Admin', 'Examination Team', 'Teacher') && (
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" /> Create Course
        </button>
      )}
    </>
  );

  usePageHeader({ title: 'Courses & Programs', subtitle: 'Manage your courses and CO-PO configuration', actions: headerActions });

  return (
    <PageTransition className="space-y-6">
      {!loading && visibleCourses.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard icon={BookOpen} label="Total Courses" value={metrics.total} index={0} />
          <MetricCard icon={CheckCircle2} label="Fully Configured" value={metrics.fullyConfigured} tone="success" index={1} />
          <MetricCard icon={Layers} label="In Progress" value={metrics.inProgress} tone="warning" index={2} />
          <MetricCard icon={ListChecks} label="Total COs Tracked" value={metrics.totalCos} tone="muted" index={3} />
        </div>
      )}

      <AnimatePresence>
        {(importData || importError || importSuccess) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`overflow-hidden rounded-2xl border p-5 ${
              importSuccess
                ? 'border-success/40 bg-success/5'
                : importError
                  ? 'border-destructive/40 bg-destructive/5'
                  : 'border-primary/30 bg-primary/5'
            }`}
          >
            {importSuccess ? (
              <div className="flex items-center gap-3 text-success">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">{importSuccess}</p>
              </div>
            ) : importError ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-destructive">{importError}</p>
                <button onClick={cancelImport} className="p-1 text-muted-foreground hover:text-foreground transition">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : importData ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Import Preview</p>
                  <p className="text-lg font-bold text-foreground">
                    {importData.course.subject_name}
                    <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                      {importData.course.course_code}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {importData.course.school} · {importData.course.department} · Sem {importData.course.semester} · {importData.course.num_cos} COs
                  </p>
                  <p className="text-xs text-muted-foreground/80">
                    Exported by <span className="text-muted-foreground">{importData.exportedBy}</span> on {new Date(importData.exportedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' · '}
                    {(importData.marks?.mtt?.length || 0)} MTT · {(importData.marks?.ett?.length || 0)} ETT students
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={cancelImport} className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition">
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    disabled={importing}
                    className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
                  >
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {importing ? 'Importing...' : 'Confirm Import'}
                  </button>
                </div>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold tracking-wide text-foreground">
            <BookOpen className="h-5 w-5 text-primary" />
            Your Courses
          </h3>
          <button
            onClick={loadCourses}
            className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            title="Refresh Courses"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[220px] rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <ErrorState description={error} onRetry={loadCourses} />
        ) : visibleCourses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={courses.length === 0 ? 'No courses created yet' : 'No courses match the current filter'}
            description={courses.length === 0 ? 'Create your first subject course to start setting up CO-PO mappings and analyzing student performance outcomes.' : 'Try a different semester or session in the header filters.'}
            action={
              courses.length === 0 && hasRole('Admin', 'Examination Team', 'Teacher') && (
                <button
                  onClick={() => setShowModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-5 py-2.5 font-medium text-secondary-foreground transition hover:bg-secondary/70"
                >
                  <Plus className="h-4 w-4" /> Create a Course
                </button>
              )
            }
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCourses.map((course, i) => (
              <CourseCard
                key={course.id}
                course={course}
                index={i}
                onClick={() => navigate(`/courses/${course.id}`)}
                onDelete={(e) => handleDeleteCourse(course.id, e)}
              />
            ))}
          </div>
        )}
      </div>

      <CreateCourseModal
        show={showModal}
        onClose={() => setShowModal(false)}
        formData={formData}
        creating={creating}
        academicStructure={academicStructure}
        handleChange={handleChange}
        handleSubmit={handleCreateCourse}
      />

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete this course?"
        description="This permanently deletes the course along with all its CO configuration, CO-PO mapping, and student marks. This action is irreversible."
        confirmLabel="Delete Course"
        danger
        loading={deleting}
        onConfirm={confirmDeleteCourse}
        onCancel={() => setPendingDeleteId(null)}
      />
    </PageTransition>
  );
};

export default CoursesPage;
