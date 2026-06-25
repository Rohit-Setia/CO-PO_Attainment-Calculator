import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  fetchStudents, 
  createStudent, 
  updateStudent, 
  deleteStudent, 
  fetchClassrooms, 
  fetchSemesters, 
  fetchDepartments, 
  importStudents 
} from '../../Api/erpApi';
import { Plus, Edit2, Trash2, Search, FileSpreadsheet, UploadCloud } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function StudentsPage() {
  const [searchParams] = useSearchParams();
  const deptQueryParam = searchParams.get('department_id') || '';
  const classQueryParam = searchParams.get('classroom_id') || '';

  const [students, setStudents] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [departments, setDepartments] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Search & Filters
  const [classroomFilter, setClassroomFilter] = useState(classQueryParam);
  const [departmentFilter, setDepartmentFilter] = useState(deptQueryParam);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editId, setEditId] = useState(null);
  
  const [form, setForm] = useState({
    reg_no: '',
    roll_no: '',
    univ_roll_no: '',
    name: '',
    gender: 'Male',
    email: '',
    phone: '',
    batch: '',
    semester_id: '',
    department_id: '',
    classroom_id: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const classesRes = await fetchClassrooms();
      setClassrooms(classesRes.data.data);

      const semRes = await fetchSemesters();
      setSemesters(semRes.data.data.filter(s => s.status === 'Active'));

      const deptRes = await fetchDepartments();
      setDepartments(deptRes.data.data.filter(d => d.status === 'Active'));

      const studRes = await fetchStudents({
        classroom_id: classroomFilter,
        department_id: departmentFilter,
        query: searchQuery
      });
      setStudents(studRes.data.data);
      setError('');
    } catch (err) {
      setError('Failed to load students roster');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [classroomFilter, departmentFilter, searchQuery]);

  useEffect(() => {
    if (deptQueryParam) {
      setDepartmentFilter(deptQueryParam);
    }
    if (classQueryParam) {
      setClassroomFilter(classQueryParam);
    }
  }, [deptQueryParam, classQueryParam]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await updateStudent(editId, form);
      } else {
        await createStudent(form);
      }
      setShowModal(false);
      resetForm();
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    }
  };

  const handleEdit = (s) => {
    setForm({
      reg_no: s.reg_no,
      roll_no: s.roll_no || '',
      univ_roll_no: s.univ_roll_no || '',
      name: s.name,
      gender: s.gender || 'Male',
      email: s.email || '',
      phone: s.phone || '',
      batch: s.batch || '',
      semester_id: s.semester_id,
      department_id: s.department_id,
      classroom_id: s.classroom_id || ''
    });
    setEditId(s.id);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this student? All linked marks will be deleted.')) return;
    try {
      await deleteStudent(id);
      loadData();
    } catch (err) {
      setError('Delete failed');
    }
  };

  const resetForm = () => {
    setForm({
      reg_no: '',
      roll_no: '',
      univ_roll_no: '',
      name: '',
      gender: 'Male',
      email: '',
      phone: '',
      batch: '',
      semester_id: semesters[0]?.id || '',
      department_id: departments[0]?.id || '',
      classroom_id: ''
    });
    setEditId(null);
  };

  // Excel Roster Import
  const handleExcelImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length < 2) {
          setError('Spreadsheet does not contain data');
          return;
        }

        // Detect columns dynamically
        const headers = rows[0].map(h => String(h).toLowerCase().replace(/[\s._-]/g, ''));
        const regIdx = headers.findIndex(h => h.includes('reg') || h.includes('id') || h.includes('rollno'));
        const rollIdx = headers.findIndex(h => h.includes('roll') && !h.includes('univ'));
        const univIdx = headers.findIndex(h => h.includes('univ'));
        const nameIdx = headers.findIndex(h => h.includes('name'));
        const genderIdx = headers.findIndex(h => h.includes('gender'));
        const emailIdx = headers.findIndex(h => h.includes('email'));
        const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('contact'));
        const batchIdx = headers.findIndex(h => h.includes('batch'));

        if (nameIdx === -1 || regIdx === -1) {
          setError('Could not map Name or Registration Number columns automatically.');
          return;
        }

        const parsedStudents = rows.slice(1).map(row => ({
          regNo: String(row[regIdx] || '').trim(),
          name: String(row[nameIdx] || '').trim(),
          rollNo: rollIdx !== -1 ? String(row[rollIdx] || '').trim() : '',
          univRollNo: univIdx !== -1 ? String(row[univIdx] || '').trim() : '',
          gender: genderIdx !== -1 ? String(row[genderIdx] || '').trim() : 'Male',
          email: emailIdx !== -1 ? String(row[emailIdx] || '').trim() : '',
          phone: phoneIdx !== -1 ? String(row[phoneIdx] || '').trim() : '',
          batch: batchIdx !== -1 ? String(row[batchIdx] || '').trim() : ''
        })).filter(s => s.regNo && s.name);

        if (!form.classroom_id || !form.semester_id || !form.department_id) {
          setError('Please select Department, Semester, and Classroom in the form before importing.');
          return;
        }

        const res = await importStudents({
          students: parsedStudents,
          classroom_id: form.classroom_id,
          semester_id: form.semester_id,
          department_id: form.department_id
        });

        setSuccessMsg(res.data.message);
        setShowImportModal(false);
        loadData();
      } catch (err) {
        setError('Excel parsing failed: ' + (err.message || err));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Student Directory</h1>
          <p className="text-slate-500 text-sm">Manage student profiles, search registry, and perform bulk roster imports.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              resetForm();
              setShowImportModal(true);
            }}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg transition-all"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Bulk Excel Import</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search Name, Reg No..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 text-slate-800"
          />
        </div>
        <div className="w-full md:w-auto flex flex-col sm:flex-row gap-2">
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full sm:w-48 border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-semibold"
          >
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select
            value={classroomFilter}
            onChange={(e) => setClassroomFilter(e.target.value)}
            className="w-full sm:w-48 border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-semibold"
          >
            <option value="">All Classrooms</option>
            {classrooms.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.subject_name})</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-semibold border border-red-200">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-sm font-semibold border border-emerald-200">
          {successMsg}
        </div>
      )}

      {loading ? (
        <div className="h-48 flex items-center justify-center text-slate-500 font-medium">Loading Roster...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Reg No</th>
                  <th className="px-6 py-4">Roll No</th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Gender</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Classroom</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-bold text-blue-600">{s.reg_no}</td>
                    <td className="px-6 py-4 font-medium text-slate-600">{s.roll_no || 'N/A'}</td>
                    <td className="px-6 py-4 font-semibold text-slate-800">{s.name}</td>
                    <td className="px-6 py-4 text-slate-500">{s.gender}</td>
                    <td className="px-6 py-4 text-slate-500">{s.email || 'N/A'}</td>
                    <td className="px-6 py-4 text-slate-600 font-bold">{s.classroom_name || 'Unassigned'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                        s.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleEdit(s)}
                          className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-slate-400 font-semibold">
                      No students found.
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
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-extrabold text-slate-800">{editId ? 'Edit Student' : 'Add Student'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Registration Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1200001"
                    value={form.reg_no}
                    onChange={(e) => setForm({ ...form, reg_no: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Roll Number</label>
                  <input
                    type="text"
                    placeholder="Class Roll Number"
                    value={form.roll_no}
                    onChange={(e) => setForm({ ...form, roll_no: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 text-slate-800 font-semibold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="Student Full Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-semibold text-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">University Roll No</label>
                  <input
                    type="text"
                    value={form.univ_roll_no}
                    onChange={(e) => setForm({ ...form, univ_roll_no: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="student@ct.edu"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 text-slate-800"
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
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Classroom Link</label>
                <select
                  value={form.classroom_id}
                  onChange={(e) => setForm({ ...form, classroom_id: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="">Unassigned</option>
                  {classrooms.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
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

      {/* Bulk Excel Upload Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-extrabold text-slate-800">Bulk Student Import</h2>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-blue-50 text-blue-800 text-xs rounded-xl border border-blue-100 space-y-1">
                <p className="font-bold">Required Columns in Spreadsheet:</p>
                <p>• Name / Student Name</p>
                <p>• Registration Number / Roll No / ID</p>
                <p className="pt-2 font-semibold">Select Target Metadata below before choosing file:</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Target Department</label>
                <select
                  value={form.department_id}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-semibold"
                >
                  <option value="">Select Department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Target Semester</label>
                <select
                  value={form.semester_id}
                  onChange={(e) => setForm({ ...form, semester_id: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-semibold"
                >
                  <option value="">Select Semester</option>
                  {semesters.map(s => (
                    <option key={s.id} value={s.id}>Sem {s.semester_number} ({s.academic_year})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Classroom Assignment</label>
                <select
                  value={form.classroom_id}
                  onChange={(e) => setForm({ ...form, classroom_id: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-semibold"
                >
                  <option value="">Select Classroom</option>
                  {classrooms.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-blue-500 bg-slate-50 cursor-pointer p-6 rounded-2xl gap-2 transition-all">
                  <UploadCloud className="h-10 w-10 text-slate-400" />
                  <span className="text-sm font-bold text-slate-700">Choose Student Spreadsheet</span>
                  <span className="text-xs text-slate-400">Accepts .xlsx, .xls, .csv</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleExcelImport}
                    disabled={!form.classroom_id || !form.semester_id || !form.department_id}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="border border-slate-200 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-slate-50 text-slate-600 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
