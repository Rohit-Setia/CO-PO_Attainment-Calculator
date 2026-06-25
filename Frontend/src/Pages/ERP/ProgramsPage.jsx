import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchPrograms, createProgram, updateProgram, deleteProgram, fetchDepartments } from '../../Api/erpApi';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export default function ProgramsPage() {
  const [searchParams] = useSearchParams();
  const deptQueryParam = searchParams.get('department_id') || '';
  const [departmentFilter, setDepartmentFilter] = useState(deptQueryParam);

  const [programs, setPrograms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', duration: 3, department_id: '' });

  const loadData = async () => {
    try {
      setLoading(true);
      const progRes = await fetchPrograms();
      setPrograms(progRes.data.data);
      const deptRes = await fetchDepartments();
      setDepartments(deptRes.data.data.filter(d => d.status === 'Active'));
      setError('');
    } catch (err) {
      setError('Failed to load program listings');
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
        duration: parseInt(form.duration) || 3
      };
      if (editId) {
        await updateProgram(editId, payload);
      } else {
        await createProgram(payload);
      }
      setShowModal(false);
      setForm({ name: '', code: '', duration: 3, department_id: '' });
      setEditId(null);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    }
  };

  const handleEdit = (prog) => {
    setForm({ name: prog.name, code: prog.code, duration: prog.duration, department_id: prog.department_id });
    setEditId(prog.id);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this program?')) return;
    try {
      await deleteProgram(id);
      loadData();
    } catch (err) {
      setError('Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Program Management</h1>
          <p className="text-slate-500 text-sm">Register degree programs and assign them to departments.</p>
        </div>
        <button
          onClick={() => {
            setEditId(null);
            setForm({ name: '', code: '', duration: 3, department_id: departments[0]?.id || '' });
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>Add Program</span>
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
        <div className="h-48 flex items-center justify-center text-slate-500 font-medium">Loading Programs...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Code</th>
                  <th className="px-6 py-4">Program Name</th>
                  <th className="px-6 py-4">Duration (Years)</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {programs
                  .filter(p => !departmentFilter || String(p.department_id) === String(departmentFilter))
                  .map((prog) => (
                  <tr key={prog.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-bold text-blue-600">{prog.code}</td>
                    <td className="px-6 py-4 font-semibold text-slate-800">{prog.name}</td>
                    <td className="px-6 py-4 text-slate-600">{prog.duration} Years</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{prog.department_name}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleEdit(prog)}
                          className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(prog.id)}
                          className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {programs.filter(p => !departmentFilter || String(p.department_id) === String(departmentFilter)).length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-slate-400 font-semibold">
                      No programs found matching filter criteria.
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
              <h2 className="font-extrabold text-slate-800">{editId ? 'Edit Program' : 'Add Program'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BTECH-CSE"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Program Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bachelor of Technology in CSE"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Duration (Years)</label>
                <input
                  type="text"
                  required
                  value={form.duration}
                  onChange={(e) => {
                    if (/^\d*$/.test(e.target.value)) {
                      setForm({ ...form, duration: e.target.value });
                    }
                  }}
                  onBlur={() => {
                    const val = form.duration;
                    if (val === "" || isNaN(parseInt(val)) || parseInt(val) <= 0) {
                      setForm({ ...form, duration: 3 });
                    } else {
                      setForm({ ...form, duration: parseInt(val) });
                    }
                  }}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 text-slate-800 font-bold"
                />
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
