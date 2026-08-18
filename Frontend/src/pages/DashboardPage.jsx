import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCourses, createCourse, deleteCourse, importCourseJson } from '../Api/AttainmentApi';
import { useAuth } from '../context/AuthContext';
import { 
  BookOpen, Plus, Award, LogOut, Loader2, RefreshCw, Upload, CheckCircle2, X, ShieldCheck
} from 'lucide-react';

import CourseCard from '../components/dashboard/CourseCard';
import CreateCourseModal from '../components/dashboard/CreateCourseModal';

const academicStructure = {
  Engineering: {
    departments: ["CSE", "Mechanical"],
  },
  Management: {
    departments: ["BBA", "MBA"],
  },
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const { user, logout, hasRole } = useAuth();
  const [courses, setCourses]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [creating, setCreating]     = useState(false);

  // Import Course state
  const importInputRef              = useRef(null);
  const [importData, setImportData] = useState(null);   // parsed snapshot
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
      setError('');
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Could not load courses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

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
      alert('Please fill all required fields.');
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
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create course.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCourse = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this course and all its related marks and configurations? This action is irreversible.')) {
      return;
    }
    try {
      await deleteCourse(id);
      await loadCourses();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete course.');
    }
  };

  // --- Import Course JSON handlers ---
  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Reset the input so the same file can be re-selected if needed
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white font-sans antialiased">
      {/* Navbar */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-slate-900/60 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Award className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-200 bg-clip-text text-transparent">CO-PO Attainemnt Calculator</h1>
            <p className="text-xs text-slate-400">Course & Program Outcome Attainment</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-medium text-slate-200">{user?.name}</p>
            <p className="text-xs text-slate-400">{user?.email}</p>
            {/* Role badge */}
            {user?.role && (
              <span className={`mt-0.5 inline-block text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded border
                ${ user.role === 'Admin' ? 'bg-red-500/20 text-red-300 border-red-500/30'
                  : user.role === 'Examination Team' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  : user.role === 'Teacher' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  : 'bg-slate-500/20 text-slate-300 border-slate-500/30' }`}>
                {user.role}
              </span>
            )}
          </div>
          {/* Admin Panel link — only visible to Admins */}
          {hasRole('Admin') && (
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-800/50 hover:bg-red-900/20 transition duration-200 text-sm font-medium text-red-400"
              title="Open Admin Panel"
            >
              <ShieldCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}
          <button 
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800/80 transition duration-200 text-sm font-medium text-slate-300"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        
        {/* Banner */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-blue-600/20 to-indigo-600/20 border border-slate-700/50 p-8 sm:p-10 mb-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <h2 className="text-3xl font-extrabold tracking-tight">Teacher Workspace</h2>
            <p className="text-slate-300 max-w-lg">Manage course details, articulation mapping matrices, student marks, and generate NBA-compliant reports with live Excel formulas.</p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center sm:justify-end">
            {/* Import Course — hidden for Viewers */}
            {!hasRole('Viewer') && (
              <label
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-600 bg-slate-800/60 hover:bg-slate-700/60 text-slate-200 font-semibold cursor-pointer transition duration-200"
                title="Import a course from another teacher's JSON snapshot"
              >
                <Upload className="h-4 w-4" /> Import Course
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </label>
            )}
            {/* Create Course — Admins, Examination Team, and Teachers only */}
            {hasRole('Admin', 'Examination Team', 'Teacher') && (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/25 transition duration-300 transform hover:-translate-y-0.5"
              >
                <Plus className="h-5 w-5" />
                Create Course
              </button>
            )}
          </div>
        </div>

        {/* Import Preview Card */}
        {(importData || importError || importSuccess) && (
          <div className={`mb-6 rounded-2xl border p-5 transition-all ${
            importSuccess
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : importError
                ? 'border-red-500/40 bg-red-500/5'
                : 'border-blue-500/30 bg-blue-500/5'
          }`}>
            {importSuccess ? (
              <div className="flex items-center gap-3 text-emerald-300">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">{importSuccess}</p>
              </div>
            ) : importError ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-red-300">{importError}</p>
                <button onClick={cancelImport} className="p-1 text-slate-400 hover:text-white transition">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : importData ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider">Import Preview</p>
                  <p className="text-lg font-bold text-slate-100">
                    {importData.course.subject_name}
                    <span className="ml-2 text-[11px] font-bold text-blue-400 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                      {importData.course.course_code}
                    </span>
                  </p>
                  <p className="text-slate-400 text-sm">
                    {importData.course.school} · {importData.course.department} · Sem {importData.course.semester} · {importData.course.num_cos} COs
                  </p>
                  <p className="text-slate-500 text-xs">
                    Exported by <span className="text-slate-400">{importData.exportedBy}</span> on {new Date(importData.exportedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' · '}
                    {(importData.marks?.mtt?.length || 0)} MTT · {(importData.marks?.ett?.length || 0)} ETT students
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={cancelImport}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    disabled={importing}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-bold transition"
                  >
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {importing ? 'Importing...' : 'Confirm Import'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Courses Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold tracking-wide text-slate-200 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-400" />
              Your Courses
            </h3>
            <button 
              onClick={loadCourses}
              className="p-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition duration-200"
              title="Refresh Courses"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4 text-red-200 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
              <p className="text-slate-400 text-sm">Loading your courses...</p>
            </div>
          ) : courses.length === 0 ? (
            <div className="border-2 border-dashed border-slate-700/60 rounded-2xl p-16 text-center space-y-4">
              <div className="h-14 w-14 rounded-full bg-slate-800/80 mx-auto flex items-center justify-center text-slate-500 border border-slate-700/50">
                <BookOpen className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold text-slate-300">No courses created yet</p>
                <p className="text-slate-500 text-sm max-w-sm mx-auto">Create your first subject course to start setting up CO-PO mappings and analyzing student performance outcomes.</p>
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 hover:text-white font-medium transition duration-200"
              >
                <Plus className="h-4 w-4" /> Create a Course
              </button>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  onClick={() => navigate(`/courses/${course.id}`)}
                  onDelete={(e) => handleDeleteCourse(course.id, e)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* CREATE COURSE DIALOG MODAL */}
      <CreateCourseModal
        show={showModal}
        onClose={() => setShowModal(false)}
        formData={formData}
        creating={creating}
        academicStructure={academicStructure}
        handleChange={handleChange}
        handleSubmit={handleCreateCourse}
      />
    </div>
  );
};

export default DashboardPage;
