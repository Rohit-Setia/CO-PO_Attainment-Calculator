import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  fetchClassrooms, 
  fetchSubjects, 
  fetchAssessments, 
  createAssessment, 
  updateAssessment,
  deleteAssessment,
  duplicateAssessment,
  fetchCOs,
  fetchGradingBoard,
  fetchAttainmentHistory
} from '../../Api/erpApi';
import { downloadExcel } from '../../Api/AttainmentApi';
import { ClipboardList, Plus, Save, Eye, Edit2, Copy, Trash2, Download } from 'lucide-react';

export default function AssessmentsPage() {
  const navigate = useNavigate();
  const [numQuestionsInput, setNumQuestionsInput] = useState('5');

  const isValidNumericInput = (val) => {
    if (val === "") return true;
    const regex = /^\d*\.?\d*$/;
    return regex.test(val);
  };

  const [classrooms, setClassrooms] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  
  const [assessments, setAssessments] = useState([]);
  const [subjectCOs, setSubjectCOs] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Create Form State
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: 'MTT 1',
    type: 'MTT',
    max_marks: 30,
    entryMode: 'question' // 'question' or 'co'
  });
  
  const [numQuestions, setNumQuestions] = useState(5);
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    const loadDropdowns = async () => {
      try {
        const classRes = await fetchClassrooms();
        setClassrooms(classRes.data.data);
        if (classRes.data.data.length > 0) {
          setSelectedClassroomId(classRes.data.data[0].id);
          setSelectedSubjectId(classRes.data.data[0].subject_id);
        }
      } catch (err) {
        setError('Failed to load classrooms dropdown');
      }
    };
    loadDropdowns();
  }, []);

  const loadAssessments = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      
      // Load assessments (either filtered by classroom/subject, or all if not selected)
      const res = await fetchAssessments(selectedClassroomId || undefined, selectedSubjectId || undefined);
      setAssessments(res.data.data);

      if (selectedSubjectId) {
        const cosRes = await fetchCOs(selectedSubjectId);
        setSubjectCOs(cosRes.data.data);
      }
    } catch (err) {
      setError('Failed to fetch assessments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssessments();
  }, [selectedClassroomId, selectedSubjectId]);

  // Handle classroom change, auto-map matching subject
  const handleClassroomChange = (id) => {
    setSelectedClassroomId(id);
    if (!id) {
      setSelectedSubjectId('');
      return;
    }
    const cls = classrooms.find(c => String(c.id) === String(id));
    if (cls) {
      setSelectedSubjectId(cls.subject_id);
    }
  };

  // Re-generate questions config list on count change
  useEffect(() => {
    setQuestions(
      Array.from({ length: numQuestions }, (_, i) => ({
        question_no: i + 1,
        max_marks: 5,
        co_id: subjectCOs[0]?.id || '',
        difficulty_level: 'Medium',
        bloom_level: 'Remembering',
        question_type: 'Theory'
      }))
    );
  }, [numQuestions, subjectCOs]);

  useEffect(() => {
    setNumQuestionsInput(numQuestions.toString());
  }, [numQuestions]);

  const handleQuestionChange = (index, field, value) => {
    setQuestions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleQuestionMaxMarksChange = (idx, value) => {
    if (isValidNumericInput(value)) {
      setQuestions(prev => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], max_marks: value };
        return updated;
      });
    }
  };

  const handleQuestionMaxMarksBlur = (idx) => {
    const val = questions[idx].max_marks;
    if (val === "" || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
      setQuestions(prev => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], max_marks: 5 };
        return updated;
      });
    } else {
      setQuestions(prev => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], max_marks: parseFloat(val) };
        return updated;
      });
    }
  };

  const handleSaveAssessment = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      
      const payload = {
        subject_id: selectedSubjectId,
        classroom_id: selectedClassroomId,
        name: form.name,
        type: form.type,
        max_marks: parseFloat(form.max_marks) || 30,
        entry_mode: form.entryMode,
        questions: form.entryMode === 'question' ? questions.map(q => ({
          ...q,
          max_marks: parseFloat(q.max_marks) || 5
        })) : null
      };

      await createAssessment(payload);
      setSuccess('Assessment configuration saved in database!');
      setShowForm(false);
      loadAssessments();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save assessment');
    } finally {
      setLoading(false);
    }
  };

  // Duplicate assessment action
  const handleDuplicate = async (id) => {
    if (!window.confirm('Are you sure you want to duplicate this assessment configuration?')) return;
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      await duplicateAssessment(id);
      setSuccess('Assessment duplicated successfully as copy!');
      loadAssessments();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to duplicate assessment');
    } finally {
      setLoading(false);
    }
  };

  // Delete assessment action
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this assessment? All linked question mappings and student grades will be permanently deleted.')) return;
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      await deleteAssessment(id);
      setSuccess('Assessment deleted successfully.');
      loadAssessments();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete assessment');
    } finally {
      setLoading(false);
    }
  };

  // Route to the grader in edit or view mode
  const handleOpenGrader = (assessment, isReadOnly = false) => {
    const cls = classrooms.find(c => String(c.id) === String(assessment.classroom_id));
    const academicDetails = {
      departmentId: cls?.department_id || '',
      departmentName: cls?.department_name || '',
      programId: cls?.program_id || '',
      programName: cls?.program_name || '',
      semesterId: cls?.semester_id || '',
      semesterNumber: cls?.semester_number || '',
      classroomId: assessment.classroom_id,
      classroomName: cls?.name || '',
      subjectId: assessment.subject_id,
      subjectName: cls?.subject_name || '',
      assessmentId: assessment.id,
      assessmentName: assessment.name,
      assessmentType: assessment.type,
      isReadOnly: isReadOnly
    };

    sessionStorage.setItem("academicDetails", JSON.stringify(academicDetails));
    sessionStorage.removeItem("setupStudents");
    sessionStorage.removeItem("coConfiguration");

    if (assessment.entry_mode === 'question') {
      navigate('/setup-questions');
    } else {
      navigate('/student');
    }
  };

  // Export report to Excel
  const handleExport = async (assessment) => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      
      const cls = classrooms.find(c => String(c.id) === String(assessment.classroom_id));
      
      // 1. Fetch roster, questions, and marks
      const gradingRes = await fetchGradingBoard(assessment.classroom_id, assessment.id);
      const { students: stList, questions: qList, existingMarks } = gradingRes.data.data;
      
      // 2. Fetch Course Outcomes for mapping
      const cosRes = await fetchCOs(assessment.subject_id);
      const cosList = cosRes.data.data;
      
      // 3. Fetch calculation history
      const histRes = await fetchAttainmentHistory(assessment.subject_id, assessment.classroom_id);
      const histRecord = histRes.data.data.find(r => r.assessment_id === assessment.id);
      if (!histRecord) {
        throw new Error('No calculated attainment results found. Please open the assessment and calculate attainment before exporting.');
      }
      
      const resultsData = histRecord.results;
      const isQuestionWise = assessment.entry_mode === 'question';
      
      // 4. Map max marks
      const coMaxMarks = {};
      cosList.forEach(co => { coMaxMarks[co.co_number] = 0; });
      
      if (isQuestionWise) {
        qList.forEach(q => {
          const matchingCO = cosList.find(co => co.id === q.co_id);
          if (matchingCO) coMaxMarks[matchingCO.co_number] += Number(q.max_marks);
        });
      } else {
        qList.forEach(q => {
          const matchingCO = cosList.find(co => co.id === q.co_id);
          if (matchingCO) coMaxMarks[matchingCO.co_number] = Number(q.max_marks);
        });
        cosList.forEach(co => {
          if (!coMaxMarks[co.co_number]) coMaxMarks[co.co_number] = Number(assessment.max_marks);
        });
      }
      
      // 5. Structure student records
      const marksMap = {};
      stList.forEach(s => {
        marksMap[s.id] = {};
      });
      existingMarks.forEach(m => {
        if (marksMap[m.student_id]) {
          const key = m.question_id || m.co_id;
          marksMap[m.student_id][key] = Number(m.marks_obtained);
        }
      });
      
      const studentsPayload = stList.map(s => {
        const sRecord = {
          roll: s.roll_no,
          name: s.name,
          co1: 0, co2: 0, co3: 0, co4: 0, co5: 0
        };
        
        if (isQuestionWise) {
          qList.forEach(q => {
            const marksVal = Number(marksMap[s.id]?.[q.id] || 0);
            const matchingCO = cosList.find(co => co.id === q.co_id);
            if (matchingCO) {
              const coKey = matchingCO.co_number.toLowerCase();
              if (sRecord[coKey] !== undefined) sRecord[coKey] += marksVal;
            }
          });
        } else {
          cosList.forEach((co, idx) => {
            const marksVal = Number(marksMap[s.id]?.[co.id] || 0);
            const coKey = co.co_number.toLowerCase();
            if (sRecord[coKey] !== undefined) sRecord[coKey] = marksVal;
          });
        }
        return sRecord;
      });
      
      const courseInfo = {
        school: cls?.department_name || '',
        program: cls?.program_name || '',
        sem: `Sem ${cls?.semester_number || ''}`,
        code: assessment.subject_code || '',
        name: assessment.subject_name || '',
        examType: assessment.type || 'ETT'
      };
      
      const coMaxMapped = {
        co1: coMaxMarks['CO1'] || 0,
        co2: coMaxMarks['CO2'] || 0,
        co3: coMaxMarks['CO3'] || 0,
        co4: coMaxMarks['CO4'] || 0,
        co5: coMaxMarks['CO5'] || 0
      };
      
      const levelCriteria = { level3: 70, level2: 60, level1: 50 };
      const thresholdPercent = 40;
      
      const blob = await downloadExcel(studentsPayload, coMaxMapped, resultsData, levelCriteria, thresholdPercent, courseInfo);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `CO_Attainment_Report_${assessment.name.replace(/\s/g, '_')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setSuccess('Excel report exported successfully!');
    } catch (err) {
      setError('Export failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Assessment Dashboard & History</h1>
          <p className="text-slate-500 text-sm">Design question papers, audit mappings, copy setups, and download attainment reports.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedClassroomId}
            onChange={(e) => handleClassroomChange(e.target.value)}
            className="border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800"
          >
            <option value="">All Classrooms</option>
            {classrooms.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.subject_name})</option>
            ))}
          </select>
          <button
            onClick={() => setShowForm(true)}
            disabled={!selectedClassroomId}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>New Assessment</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-semibold border border-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-sm font-semibold border border-emerald-200">
          {success}
        </div>
      )}

      {showForm && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 animate-in fade-in duration-200">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-500" />
            <span>Create New Assessment Blueprint</span>
          </h2>
          <form onSubmit={handleSaveAssessment} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Assessment Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Assessment Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm font-medium"
                >
                  <option value="MTT">MTT (Mid Term)</option>
                  <option value="ETT">ETT (End Term)</option>
                  <option value="Quiz">Quiz</option>
                  <option value="Assignment">Assignment</option>
                  <option value="Lab">Lab/Practical</option>
                  <option value="Project">Project/Viva</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max Marks</label>
                <input
                  type="text"
                  required
                  value={form.max_marks}
                  onChange={(e) => {
                    if (isValidNumericInput(e.target.value)) {
                      setForm({ ...form, max_marks: e.target.value });
                    }
                  }}
                  onBlur={() => {
                    const val = form.max_marks;
                    if (val === "" || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
                      setForm({ ...form, max_marks: 30 });
                    } else {
                      setForm({ ...form, max_marks: parseFloat(val) });
                    }
                  }}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Marks Entry Mode</label>
                <select
                  value={form.entryMode}
                  onChange={(e) => setForm({ ...form, entryMode: e.target.value })}
                  className="w-full border border-slate-200 px-3 py-2 rounded-xl text-sm font-medium"
                >
                  <option value="question">Question-Wise Blueprint</option>
                  <option value="co">CO-Wise Summary</option>
                </select>
              </div>
            </div>

            {form.entryMode === 'question' && (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-extrabold text-slate-700">Question Blueprint Configuration</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-bold">Number of Questions:</span>
                    <input
                      type="text"
                      value={numQuestionsInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (/^\d*$/.test(value)) {
                          setNumQuestionsInput(value);
                          const parsed = parseInt(value);
                          if (!isNaN(parsed) && parsed >= 1 && parsed <= 30) {
                            setNumQuestions(parsed);
                          }
                        }
                      }}
                      onBlur={() => {
                        let parsed = parseInt(numQuestionsInput);
                        if (isNaN(parsed) || parsed < 1) {
                          parsed = 5;
                        } else if (parsed > 30) {
                          parsed = 30;
                        }
                        setNumQuestions(parsed);
                        setNumQuestionsInput(parsed.toString());
                      }}
                      className="w-16 border border-slate-200 px-2 py-1 rounded text-center text-sm font-bold text-blue-600"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                        <th className="px-4 py-2">Q No</th>
                        <th className="px-4 py-2">Max Marks</th>
                        <th className="px-4 py-2">Mapped CO</th>
                        <th className="px-4 py-2">Difficulty</th>
                        <th className="px-4 py-2">Bloom Level</th>
                        <th className="px-4 py-2">Question Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {questions.map((q, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2 font-extrabold text-slate-700">Q{q.question_no}</td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              required
                              value={q.max_marks}
                              onChange={(e) => handleQuestionMaxMarksChange(idx, e.target.value)}
                              onBlur={() => handleQuestionMaxMarksBlur(idx)}
                              className="w-16 border border-slate-200 rounded px-1.5 py-1 text-center font-bold"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <select
                              required
                              value={q.co_id}
                              onChange={(e) => handleQuestionChange(idx, 'co_id', e.target.value)}
                              className="border border-slate-200 rounded px-1.5 py-1 font-bold text-blue-600"
                            >
                              <option value="">Select CO</option>
                              {subjectCOs.map(co => (
                                <option key={co.id} value={co.id}>{co.co_number}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={q.difficulty_level}
                              onChange={(e) => handleQuestionChange(idx, 'difficulty_level', e.target.value)}
                              className="border border-slate-200 rounded px-1.5 py-1 text-xs"
                            >
                              <option value="Easy">Easy</option>
                              <option value="Medium">Medium</option>
                              <option value="Hard">Hard</option>
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={q.bloom_level}
                              onChange={(e) => handleQuestionChange(idx, 'bloom_level', e.target.value)}
                              className="border border-slate-200 rounded px-1.5 py-1 text-xs"
                            >
                              <option value="Remembering">Remembering</option>
                              <option value="Understanding">Understanding</option>
                              <option value="Applying">Applying</option>
                              <option value="Analyzing">Analyzing</option>
                              <option value="Evaluating">Evaluating</option>
                              <option value="Creating">Creating</option>
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={q.question_type}
                              onChange={(e) => handleQuestionChange(idx, 'question_type', e.target.value)}
                              className="border border-slate-200 rounded px-1.5 py-1 text-xs"
                            >
                              <option value="Theory">Theory</option>
                              <option value="Numerical">Numerical</option>
                              <option value="Practical">Practical</option>
                              <option value="MCQ">MCQ</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border border-slate-200 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-slate-50 text-slate-600 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-4 py-2 rounded-xl shadow-lg transition"
              >
                <Save className="h-4 w-4" />
                <span>Save Assessment</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Assessments Dashboard List */}
      {loading ? (
        <div className="h-48 flex items-center justify-center text-slate-500 font-medium">Loading Assessments telemetry...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Assessment Details</th>
                <th className="px-6 py-4">Subject</th>
                <th className="px-6 py-4">Semester & Class</th>
                <th className="px-6 py-4">Teacher / Created By</th>
                <th className="px-6 py-4 text-center">Student Count</th>
                <th className="px-6 py-4">Created Date</th>
                <th className="px-6 py-4">Modified Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {assessments.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900 leading-tight">{a.name}</p>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{a.entry_mode === 'co' ? 'CO-Wise Flow' : 'Question-Wise'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-800 leading-none">{a.subject_code}</p>
                    <p className="text-xs text-slate-500 truncate max-w-[160px] mt-1">{a.subject_name}</p>
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-700">
                    <p>Sem {a.semester_number}</p>
                    <p className="text-xs text-slate-400 font-medium">{a.academic_year}</p>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-600">{a.teacher_name || 'N/A'}</td>
                  <td className="px-6 py-4 text-center font-extrabold text-blue-600">{a.student_count || 0}</td>
                  <td className="px-6 py-4 text-xs text-slate-500 font-medium">{a.created_at ? new Date(a.created_at).toLocaleDateString() : 'N/A'}</td>
                  <td className="px-6 py-4 text-xs text-slate-500 font-medium">{a.updated_at ? new Date(a.updated_at).toLocaleDateString() : 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      a.status === 'Evaluated' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleOpenGrader(a, true)}
                        title="View Assessment (Read-Only)"
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleOpenGrader(a, false)}
                        title="Edit Marks & Setup"
                        className="p-2 hover:bg-slate-100 rounded-lg text-blue-600 transition"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(a.id)}
                        title="Duplicate Assessment Config"
                        className="p-2 hover:bg-slate-100 rounded-lg text-indigo-600 transition"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleExport(a)}
                        disabled={a.status !== 'Evaluated'}
                        title="Export LIVE Excel Report"
                        className="p-2 hover:bg-slate-100 disabled:opacity-30 rounded-lg text-emerald-600 transition"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        title="Delete Assessment"
                        className="p-2 hover:bg-red-50 rounded-lg text-red-600 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {assessments.length === 0 && (
                <tr>
                  <td colSpan="9" className="px-6 py-12 text-center text-slate-400 font-semibold">
                    No assessments logged. Select a classroom and click "New Assessment" to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
