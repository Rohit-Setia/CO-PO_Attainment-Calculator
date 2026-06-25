import React, { useEffect, useState } from 'react';
import { 
  fetchClassrooms, 
  fetchSubjects, 
  fetchAssessments, 
  createAssessment, 
  fetchCOs 
} from '../../Api/erpApi';
import { ClipboardList, Plus, Save } from 'lucide-react';

export default function AssessmentsPage() {
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
        const classRes = await classrooms.length === 0 ? await fetchClassrooms() : { data: { data: classrooms } };
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
    if (!selectedClassroomId || !selectedSubjectId) return;
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      
      const res = await fetchAssessments(selectedClassroomId, selectedSubjectId);
      setAssessments(res.data.data);

      const cosRes = await fetchCOs(selectedSubjectId);
      setSubjectCOs(cosRes.data.data);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Assessment & Exam Paper Builder</h1>
          <p className="text-slate-500 text-sm">Design question papers, map outcomes, and manage exam schedules.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedClassroomId}
            onChange={(e) => handleClassroomChange(e.target.value)}
            className="border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800"
          >
            <option value="">Select Classroom</option>
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
            <span>Create New Assessment</span>
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

      {/* Assessments list */}
      {loading ? (
        <div className="h-48 flex items-center justify-center text-slate-500 font-medium">Loading Assessments...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Assessment Name</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Max Marks</th>
                <th className="px-6 py-4">Evaluation Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {assessments.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-6 py-4 font-bold text-slate-800">{a.name}</td>
                  <td className="px-6 py-4 font-medium text-slate-600">{a.type}</td>
                  <td className="px-6 py-4 font-bold text-slate-600">{a.max_marks} Marks</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      a.status === 'Evaluated' 
                        ? 'bg-emerald-50 text-emerald-700' 
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
              {assessments.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-slate-400 font-semibold">
                    No assessments defined for this classroom. Click "New Assessment" to create one.
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
