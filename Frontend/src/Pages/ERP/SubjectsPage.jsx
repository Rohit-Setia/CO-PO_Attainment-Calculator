import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  fetchSubjects, 
  createSubject, 
  updateSubject, 
  fetchSemesters, 
  fetchDepartments, 
  fetchTeachers 
} from '../../Api/erpApi';
import { Plus, Edit2, BookOpen } from 'lucide-react';

export default function SubjectsPage() {
  const [searchParams] = useSearchParams();
  const deptQueryParam = searchParams.get('department_id') || '';
  const [departmentFilter, setDepartmentFilter] = useState(deptQueryParam);

  const [subjects, setSubjects] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    credits: 4,
    semester_id: '',
    department_id: '',
    teacher_id: '',
    number_of_cos: 5,
    course_coordinator: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const subRes = await fetchSubjects();
      setSubjects(subRes.data.data);
      
      const semRes = await fetchSemesters();
      setSemesters(semRes.data.data.filter(s => s.status === 'Active'));

      const deptRes = await fetchDepartments();
      setDepartments(deptRes.data.data.filter(d => d.status === 'Active'));

      const teachRes = await fetchTeachers();
      setTeachers(teachRes.data.data);
      
      setError('');
    } catch (err) {
      setError('Failed to load subjects directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (deptQueryParam) {
      setDepartmentFilter(deptQueryParam);
    }
  }, [deptQueryParam]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        credits: parseInt(form.credits) || 4,
        number_of_cos: parseInt(form.number_of_cos) || 5
      };
      if (editId) {
        await updateSubject(editId, payload);
      } else {
        await createSubject(payload);
      }
      setShowModal(false);
      setForm({
        name: '',
        code: '',
        credits: 4,
        semester_id: '',
        department_id: '',
        teacher_id: '',
        number_of_cos: 5,
        course_coordinator: ''
      });
      setEditId(null);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    }
  };

  const handleEdit = (sub) => {
    setForm({
      name: sub.name,
      code: sub.code,
      credits: sub.credits,
      semester_id: sub.semester_id,
      department_id: sub.department_id,
      teacher_id: sub.teacher_id || '',
      number_of_cos: sub.number_of_cos,
      course_coordinator: sub.course_coordinator || ''
    });
    setEditId(sub.id);
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Subject Management</h1>
          <p className="text-slate-500 text-sm">Configure subjects, syllabus credits, and assign faculty teaching roles.</p>
        </div>
        <button
          onClick={() => {
            setEditId(null);
            setForm({
              name: '',
              code: '',
              credits: 4,
              semester_id: semesters[0]?.id || '',
              department_id: departments[0]?.id || '',
              teacher_id: '',
              number_of_cos: 5,
              course_coordinator: ''
            });
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>Add Subject</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-semibold border border-red-200">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">Filters</div>
        <div className="w-full md:w-auto">
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full md:w-64 border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-semibold"
          >
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center text-slate-500 font-medium">Loading Subjects Directory...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Code</th>
                  <th className="px-6 py-4">Subject Name</th>
                  <th className="px-6 py-4">Credits</th>
                  <th className="px-6 py-4">Semester</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4">Assigned Teacher</th>
                  <th className="px-6 py-4">CO Count</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {subjects
                  .filter(sub => !departmentFilter || String(sub.department_id) === String(departmentFilter))
                  .map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-bold text-blue-600">{sub.code}</td>
                    <td className="px-6 py-4 font-semibold text-slate-800">
                      <Link to={`/obe?subject_id=${sub.id}`} className="text-blue-600 hover:text-blue-500 hover:underline">
                        {sub.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-bold">{sub.credits}</td>
                    <td className="px-6 py-4 text-slate-600">Semester {sub.semester_number}</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{sub.department_name}</td>
                    <td className="px-6 py-4 text-slate-600 font-semibold">{sub.teacher_name || 'Unassigned'}</td>
                    <td className="px-6 py-4 text-right"><span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-extrabold text-slate-700">{sub.number_of_cos} COs</span></td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleEdit(sub)}
                        className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {subjects.filter(sub => !departmentFilter || String(sub.department_id) === String(departmentFilter)).length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-slate-400 font-semibold">
                      No subjects found matching filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-extrabold text-slate-800">{editId ? 'Edit Subject' : 'Add Subject'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Subject Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CS-201"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Subject Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Data Structures & Algorithms"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-semibold text-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Credits</label>
                  <input
                    type="text"
                    required
                    value={form.credits}
                    onChange={(e) => {
                      if (/^\d*$/.test(e.target.value)) {
                        setForm({ ...form, credits: e.target.value });
                      }
                    }}
                    onBlur={() => {
                      const val = form.credits;
                      if (val === "" || isNaN(parseInt(val)) || parseInt(val) <= 0) {
                        setForm({ ...form, credits: 4 });
                      } else {
                        setForm({ ...form, credits: parseInt(val) });
                      }
                    }}
                    className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Number of COs</label>
                  <input
                    type="text"
                    required
                    disabled={!!editId} // CO counts are locked post creation to avoid schema drops
                    value={form.number_of_cos}
                    onChange={(e) => {
                      if (/^\d*$/.test(e.target.value)) {
                        setForm({ ...form, number_of_cos: e.target.value });
                      }
                    }}
                    onBlur={() => {
                      const val = form.number_of_cos;
                      if (val === "" || isNaN(parseInt(val)) || parseInt(val) <= 0) {
                        setForm({ ...form, number_of_cos: 5 });
                      } else {
                        setForm({ ...form, number_of_cos: parseInt(val) });
                      }
                    }}
                    className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800 disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Department</label>
                <select
                  required
                  value={form.department_id}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="">Select Department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Semester</label>
                <select
                  required
                  value={form.semester_id}
                  onChange={(e) => setForm({ ...form, semester_id: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="">Select Semester</option>
                  {semesters.map(s => (
                    <option key={s.id} value={s.id}>Sem {s.semester_number} ({s.academic_year})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Assigned Teacher</label>
                <select
                  value={form.teacher_id}
                  onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="">Unassigned</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.employee_id || t.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Course Coordinator</label>
                <input
                  type="text"
                  placeholder="Coordinator name"
                  value={form.course_coordinator}
                  onChange={(e) => setForm({ ...form, course_coordinator: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="border border-slate-200 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-slate-50 text-slate-600 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-4 py-2 rounded-xl shadow-lg shadow-blue-500/20 transition"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
