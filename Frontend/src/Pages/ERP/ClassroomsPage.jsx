import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  fetchClassrooms, 
  createClassroom, 
  updateClassroom, 
  deleteClassroom, 
  fetchDepartments, 
  fetchPrograms, 
  fetchSemesters, 
  fetchSubjects, 
  fetchTeachers 
} from '../../Api/erpApi';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export default function ClassroomsPage() {
  const [searchParams] = useSearchParams();
  const deptQueryParam = searchParams.get('department_id') || '';
  const [departmentFilter, setDepartmentFilter] = useState(deptQueryParam);

  const [classrooms, setClassrooms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  
  const [form, setForm] = useState({
    name: '',
    department_id: '',
    program_id: '',
    semester_id: '',
    section: 'A',
    academic_year: '',
    teacher_id: '',
    subject_id: '',
    capacity: 60
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const classRes = await fetchClassrooms();
      setClassrooms(classRes.data.data);

      const deptRes = await fetchDepartments();
      setDepartments(deptRes.data.data.filter(d => d.status === 'Active'));

      const progRes = await fetchPrograms();
      setPrograms(progRes.data.data);

      const semRes = await fetchSemesters();
      setSemesters(semRes.data.data.filter(s => s.status === 'Active'));

      const subRes = await fetchSubjects();
      setSubjects(subRes.data.data);

      const teachRes = await fetchTeachers();
      setTeachers(teachRes.data.data);

      setError('');
    } catch (err) {
      setError('Failed to load classrooms directory');
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
        capacity: parseInt(form.capacity) || 60
      };
      if (editId) {
        await updateClassroom(editId, payload);
      } else {
        await createClassroom(payload);
      }
      setShowModal(false);
      setForm({
        name: '',
        department_id: '',
        program_id: '',
        semester_id: '',
        section: 'A',
        academic_year: '',
        teacher_id: '',
        subject_id: '',
        capacity: 60
      });
      setEditId(null);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    }
  };

  const handleEdit = (c) => {
    setForm({
      name: c.name,
      department_id: c.department_id,
      program_id: c.program_id,
      semester_id: c.semester_id,
      section: c.section,
      academic_year: c.academic_year,
      teacher_id: c.teacher_id || '',
      subject_id: c.subject_id,
      capacity: c.capacity
    });
    setEditId(c.id);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this classroom?')) return;
    try {
      await deleteClassroom(id);
      loadData();
    } catch (err) {
      setError('Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Classroom Configuration</h1>
          <p className="text-slate-500 text-sm">Assign subjects, batches, sections, and class tutors to classrooms.</p>
        </div>
        <button
          onClick={() => {
            setEditId(null);
            setForm({
              name: '',
              department_id: departments[0]?.id || '',
              program_id: programs[0]?.id || '',
              semester_id: semesters[0]?.id || '',
              section: 'A',
              academic_year: semesters[0]?.academic_year || '2025-2026',
              teacher_id: '',
              subject_id: subjects[0]?.id || '',
              capacity: 60
            });
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>Create Classroom</span>
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
        <div className="h-48 flex items-center justify-center text-slate-500 font-medium">Loading Classrooms Directory...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Classroom Name</th>
                  <th className="px-6 py-4">Subject</th>
                  <th className="px-6 py-4">Section / Batch</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4">Program</th>
                  <th className="px-6 py-4">Class Teacher</th>
                  <th className="px-6 py-4">Capacity</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {classrooms
                  .filter(c => !departmentFilter || String(c.department_id) === String(departmentFilter))
                  .map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-bold text-slate-800">
                      <Link to={`/students?classroom_id=${c.id}`} className="text-blue-600 hover:text-blue-500 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-blue-600 font-semibold">
                      <Link to={`/obe?subject_id=${c.subject_id}`} className="hover:text-blue-500 hover:underline">
                        {c.subject_name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-600">Sec {c.section} ({c.academic_year})</td>
                    <td className="px-6 py-4 text-slate-600">{c.department_name}</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{c.program_name}</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{c.teacher_name || 'N/A'}</td>
                    <td className="px-6 py-4 font-bold text-slate-600">{c.capacity} Students</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleEdit(c)}
                          className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {classrooms.filter(c => !departmentFilter || String(c.department_id) === String(departmentFilter)).length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-slate-400 font-semibold">
                      No classrooms found matching filter criteria.
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
              <h2 className="font-extrabold text-slate-800">{editId ? 'Edit Classroom' : 'Create Classroom'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Classroom Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. B.Tech CSE 5A"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Section</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. A"
                    value={form.section}
                    onChange={(e) => setForm({ ...form, section: e.target.value.toUpperCase() })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Capacity</label>
                  <input
                    type="text"
                    required
                    value={form.capacity}
                    onChange={(e) => {
                      if (/^\d*$/.test(e.target.value)) {
                        setForm({ ...form, capacity: e.target.value });
                      }
                    }}
                    onBlur={() => {
                      const val = form.capacity;
                      if (val === "" || isNaN(parseInt(val)) || parseInt(val) <= 0) {
                        setForm({ ...form, capacity: 60 });
                      } else {
                        setForm({ ...form, capacity: parseInt(val) });
                      }
                    }}
                    className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800"
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
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Program</label>
                <select
                  required
                  value={form.program_id}
                  onChange={(e) => setForm({ ...form, program_id: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="">Select Program</option>
                  {programs.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
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
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Linked Course/Subject</label>
                <select
                  required
                  value={form.subject_id}
                  onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="">Select Subject</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Class Teacher</label>
                <select
                  value={form.teacher_id}
                  onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="">None</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
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
