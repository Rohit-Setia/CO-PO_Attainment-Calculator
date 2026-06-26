import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCourses, createCourse, deleteCourse } from '../Api/AttainmentApi';
import { useAuth } from '../context/AuthContext';
import { 
  BookOpen, Plus, Award, LogOut, Loader2, RefreshCw
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
  const { user, logout } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white font-sans antialiased">
      {/* Navbar */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-slate-900/60 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Award className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-200 bg-clip-text text-transparent">OBE Calculator</h1>
            <p className="text-xs text-slate-400">Course & Program Outcome Attainment</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-medium text-slate-200">{user?.name}</p>
            <p className="text-xs text-slate-400">{user?.email}</p>
          </div>
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
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/25 transition duration-300 transform hover:-translate-y-0.5"
          >
            <Plus className="h-5 w-5" />
            Create Course
          </button>
        </div>

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
