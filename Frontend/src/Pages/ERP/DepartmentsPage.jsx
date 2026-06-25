import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDepartments, createDepartment, updateDepartment, deleteDepartment } from '../../Api/erpApi';
import { Plus, Edit2, Trash2, CheckCircle2, XCircle } from 'lucide-react';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', hod: '', status: 'Active' });

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchDepartments();
      setDepartments(res.data.data);
      setError('');
    } catch (err) {
      setError('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await updateDepartment(editId, form);
      } else {
        await createDepartment(form);
      }
      setShowModal(false);
      setForm({ name: '', code: '', hod: '', status: 'Active' });
      setEditId(null);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    }
  };

  const handleEdit = (dept) => {
    setForm({ name: dept.name, code: dept.code, hod: dept.hod, status: dept.status });
    setEditId(dept.id);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this department? This will delete all linked programs and subjects.')) return;
    try {
      await deleteDepartment(id);
      loadData();
    } catch (err) {
      setError('Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Department Management</h1>
          <p className="text-slate-500 text-sm">Configure and manage institutional academic departments.</p>
        </div>
        <button
          onClick={() => {
            setEditId(null);
            setForm({ name: '', code: '', hod: '', status: 'Active' });
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>Add Department</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-semibold border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-48 flex items-center justify-center text-slate-500 font-medium">Loading Departments...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Code</th>
                  <th className="px-6 py-4">Department Name</th>
                  <th className="px-6 py-4">HOD</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Explore</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {departments.map((dept) => (
                  <tr key={dept.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-bold text-blue-600">{dept.code}</td>
                    <td className="px-6 py-4 font-semibold text-slate-800">{dept.name}</td>
                    <td className="px-6 py-4 text-slate-600">{dept.hod || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        dept.status === 'Active' 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : 'bg-rose-50 text-rose-700'
                      }`}>
                        {dept.status === 'Active' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {dept.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        <Link 
                          to={`/programs?department_id=${dept.id}`} 
                          className="px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition"
                        >
                          Programs
                        </Link>
                        <Link 
                          to={`/classrooms?department_id=${dept.id}`} 
                          className="px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition"
                        >
                          Classrooms
                        </Link>
                        <Link 
                          to={`/subjects?department_id=${dept.id}`} 
                          className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition"
                        >
                          Subjects
                        </Link>
                        <Link 
                          to={`/students?department_id=${dept.id}`} 
                          className="px-2 py-1 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg text-xs font-bold transition"
                        >
                          Students
                        </Link>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleEdit(dept)}
                          className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(dept.id)}
                          className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {departments.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-slate-400 font-semibold">
                      No departments registered yet.
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
              <h2 className="font-extrabold text-slate-800">{editId ? 'Edit Department' : 'Add Department'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CSE"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Department Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Computer Science Engineering"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">HOD</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. John Doe"
                  value={form.hod}
                  onChange={(e) => setForm({ ...form, hod: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
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
