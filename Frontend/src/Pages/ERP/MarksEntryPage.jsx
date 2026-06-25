import React, { useEffect, useState, useCallback } from 'react';
import { 
  fetchClassrooms, 
  fetchAssessments, 
  fetchGradingBoard, 
  saveGradingMarks, 
  fetchCOs,
  triggerDBAttainmentCalculation
} from '../../Api/erpApi';
import { downloadExcel } from '../../Api/AttainmentApi';
import { ClipboardCheck, Save, Calculator, FileSpreadsheet, UploadCloud, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import AttainmentResults from '../../components/AttainmentResult';

export default function MarksEntryPage() {
  const [classrooms, setClassrooms] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  
  const [students, setStudents] = useState([]);
  const [assessment, setAssessment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [subjectCOs, setSubjectCOs] = useState([]);
  const [studentMarks, setStudentMarks] = useState({}); // studentId -> { questionId/coId -> marks }
  const [absentees, setAbsentees] = useState({}); // studentId -> boolean
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Threshold controls
  const isValidNumericInput = (val) => {
    if (val === "") return true;
    const regex = /^\d*\.?\d*$/;
    return regex.test(val);
  };

  const [thresholdPercent, setThresholdPercent] = useState(40);
  const [levelCriteria, setLevelCriteria] = useState({
    level3: 70,
    level2: 60,
    level1: 50
  });
  const [results, setResults] = useState(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    const loadClassrooms = async () => {
      try {
        const res = await fetchClassrooms();
        setClassrooms(res.data.data);
        if (res.data.data.length > 0) {
          setSelectedClassroomId(res.data.data[0].id);
        }
      } catch (err) {
        setError('Failed to load classrooms');
      }
    };
    loadClassrooms();
  }, []);

  const loadAssessments = async () => {
    if (!selectedClassroomId) return;
    try {
      const cls = classrooms.find(c => String(c.id) === String(selectedClassroomId));
      if (!cls) return;

      const res = await fetchAssessments(selectedClassroomId, cls.subject_id);
      setAssessments(res.data.data);
      if (res.data.data.length > 0) {
        setSelectedAssessmentId(res.data.data[0].id);
      } else {
        setSelectedAssessmentId('');
        setStudents([]);
        setAssessment(null);
        setQuestions([]);
        setResults(null);
      }
      
      const cosRes = await fetchCOs(cls.subject_id);
      setSubjectCOs(cosRes.data.data);
    } catch (err) {
      setError('Failed to load assessments');
    }
  };

  useEffect(() => {
    loadAssessments();
  }, [selectedClassroomId, classrooms]);

  const loadGradingDetails = async () => {
    if (!selectedClassroomId || !selectedAssessmentId) return;
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      setResults(null);

      const res = await fetchGradingBoard(selectedClassroomId, selectedAssessmentId);
      const { students: stList, assessment: assInfo, questions: qList, existingMarks } = res.data.data;
      
      setStudents(stList);
      setAssessment(assInfo);
      setQuestions(qList);

      // Structure existing marks
      const marksMap = {};
      const absMap = {};
      
      stList.forEach(s => {
        marksMap[s.id] = {};
        absMap[s.id] = false;
      });

      existingMarks.forEach(m => {
        if (marksMap[m.student_id]) {
          const key = m.question_id || m.co_id;
          marksMap[m.student_id][key] = Number(m.marks_obtained);
          if (m.is_absent) absMap[m.student_id] = true;
        }
      });

      setStudentMarks(marksMap);
      setAbsentees(absMap);
    } catch (err) {
      setError('Failed to load student roster & marks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGradingDetails();
  }, [selectedAssessmentId]);

  const handleMarkChange = (studentId, key, value, maxVal) => {
    if (!isValidNumericInput(value)) return;

    if (value !== '') {
      const num = parseFloat(value);
      if (num > maxVal) {
        setError(`Warning: Grade exceeds maximum marks limits (${maxVal})`);
        value = maxVal.toString();
      } else {
        setError('');
      }
    } else {
      setError('');
    }

    setStudentMarks(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [key]: value
      }
    }));
  };

  const handleAbsentToggle = (studentId) => {
    setAbsentees(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  };

  const handleSaveGrades = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const marksArray = [];
      const isQuestionWise = questions.length > 0;

      students.forEach(s => {
        if (isQuestionWise) {
          questions.forEach(q => {
            const mObt = studentMarks[s.id]?.[q.id];
            marksArray.push({
              student_id: s.id,
              question_id: q.id,
              co_id: null,
              marks_obtained: absentees[s.id] ? 0 : (mObt === '' || mObt === undefined ? 0 : parseFloat(mObt)),
              is_absent: absentees[s.id] ? 1 : 0
            });
          });
        } else {
          subjectCOs.forEach(co => {
            const mObt = studentMarks[s.id]?.[co.id];
            marksArray.push({
              student_id: s.id,
              question_id: null,
              co_id: co.id,
              marks_obtained: absentees[s.id] ? 0 : (mObt === '' || mObt === undefined ? 0 : parseFloat(mObt)),
              is_absent: absentees[s.id] ? 1 : 0
            });
          });
        }
      });

      await saveGradingMarks({
        assessment_id: selectedAssessmentId,
        marks: marksArray
      });

      setSuccess('Student grades saved in database successfully!');
    } catch (err) {
      setError('Save grades failed');
    } finally {
      setLoading(false);
    }
  };

  // Compile calculations & trigger attainment engine
  const handleCalculateAttainment = async () => {
    if (!students.length || calculating) return;
    try {
      setCalculating(true);
      setError('');
      setSuccess('');

      const isQuestionWise = questions.length > 0;
      
      // 1. Setup coMaxMarks
      const coMaxMarks = {};
      const coMapForQuestions = {}; // q.id -> co.co_number
      
      if (isQuestionWise) {
        // Init coMaxMarks to 0
        subjectCOs.forEach(co => {
          coMaxMarks[co.co_number] = 0;
        });

        questions.forEach(q => {
          const matchingCO = subjectCOs.find(co => co.id === q.co_id);
          if (matchingCO) {
            coMaxMarks[matchingCO.co_number] += Number(q.max_marks);
            coMapForQuestions[q.id] = matchingCO.co_number;
          }
        });
      } else {
        subjectCOs.forEach(co => {
          // In CO-Wise summary, we assume the max marks of the assessment represents the max of each outcome (or we can use co.target_percentage)
          // Wait! For CO-wise mode, let's treat assessment.max_marks as the CO max!
          coMaxMarks[co.co_number] = Number(assessment.max_marks);
        });
      }

      // 2. Prepare students marks payload
      const studentsPayload = students.map(s => {
        const sRecord = {
          regNo: s.reg_no,
          name: s.name,
          totalMarks: 0,
          co1: 0, co2: 0, co3: 0, co4: 0, co5: 0
        };

        if (absentees[s.id]) {
          return sRecord;
        }

        if (isQuestionWise) {
          questions.forEach(q => {
            const marksVal = parseFloat(studentMarks[s.id]?.[q.id] || 0);
            sRecord.totalMarks += marksVal;
            const coNumStr = coMapForQuestions[q.id];
            if (coNumStr) {
              const key = coNumStr.toLowerCase();
              if (sRecord[key] !== undefined) {
                sRecord[key] += marksVal;
              }
            }
          });
        } else {
          let total = 0;
          subjectCOs.forEach(co => {
            const marksVal = parseFloat(studentMarks[s.id]?.[co.id] || 0);
            const key = co.co_number.toLowerCase();
            if (sRecord[key] !== undefined) {
              sRecord[key] = marksVal;
              total += marksVal;
            }
          });
          sRecord.totalMarks = total;
        }

        return sRecord;
      });

      // 3. Send payload to calculations engine
      const res = await triggerDBAttainmentCalculation({
        students: studentsPayload,
        coMaxMarks,
        thresholdPercent: parseFloat(thresholdPercent) || 40,
        levelCriteria: {
          level3: parseFloat(levelCriteria.level3) || 70,
          level2: parseFloat(levelCriteria.level2) || 60,
          level1: parseFloat(levelCriteria.level1) || 50
        },
        subject_id: classrooms.find(c => String(c.id) === String(selectedClassroomId))?.subject_id,
        classroom_id: selectedClassroomId,
        sidebarMenu: true,
        assessment_id: selectedAssessmentId
      });

      setResults(res.data);
      setSuccess('Outcome attainment levels computed and saved in historical records!');
    } catch (err) {
      setError('Calculation failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setCalculating(false);
    }
  };

  // Bulk Import Student Marks Spreadsheet
  const handleExcelMarksImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length < 2) {
          setError('Spreadsheet is empty');
          return;
        }

        // Dynamically detect Reg No column
        const headers = rows[0].map(h => String(h).toLowerCase().replace(/[\s._-]/g, ''));
        const regIdx = headers.findIndex(h => h.includes('reg') || h.includes('id') || h.includes('rollno'));
        
        if (regIdx === -1) {
          setError('Could not map Registration Number column automatically.');
          return;
        }

        const isQuestionWise = questions.length > 0;
        const newMarksMap = { ...studentMarks };

        if (isQuestionWise) {
          // Parse columns like Q1, Q2...
          const qCols = {};
          questions.forEach(q => {
            const qHeaderIdx = headers.findIndex(h => h === `q${q.question_no}` || h === `question${q.question_no}`);
            if (qHeaderIdx !== -1) {
              qCols[q.id] = qHeaderIdx;
            }
          });

          rows.slice(1).forEach(row => {
            const regNo = String(row[regIdx] || '').trim();
            const matchingStudent = students.find(s => String(s.reg_no).trim() === regNo);
            if (matchingStudent) {
              Object.entries(qCols).forEach(([qId, colIdx]) => {
                const maxVal = questions.find(q => String(q.id) === String(qId))?.max_marks || 100;
                let val = Number(row[colIdx]);
                if (isNaN(val) || val < 0) val = 0;
                if (val > maxVal) val = maxVal;
                
                if (!newMarksMap[matchingStudent.id]) newMarksMap[matchingStudent.id] = {};
                newMarksMap[matchingStudent.id][qId] = val;
              });
            }
          });
        } else {
          // Parse columns like CO1, CO2...
          const coCols = {};
          subjectCOs.forEach(co => {
            const coHeaderIdx = headers.findIndex(h => h === co.co_number.toLowerCase());
            if (coHeaderIdx !== -1) {
              coCols[co.id] = coHeaderIdx;
            }
          });

          rows.slice(1).forEach(row => {
            const regNo = String(row[regIdx] || '').trim();
            const matchingStudent = students.find(s => String(s.reg_no).trim() === regNo);
            if (matchingStudent) {
              Object.entries(coCols).forEach(([coId, colIdx]) => {
                let val = Number(row[colIdx]);
                if (isNaN(val) || val < 0) val = 0;

                if (!newMarksMap[matchingStudent.id]) newMarksMap[matchingStudent.id] = {};
                newMarksMap[matchingStudent.id][coId] = val;
              });
            }
          });
        }

        setStudentMarks(newMarksMap);
        setSuccess('Marks spreadsheet uploaded successfully! Click Save Grades to commit changes.');
      } catch (err) {
        setError('Import failed: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Download styled excel report
  const downloadReportExcel = async () => {
    if (!results) return;
    try {
      const isQuestionWise = questions.length > 0;
      
      const coMaxMarks = {};
      if (isQuestionWise) {
        subjectCOs.forEach(co => { coMaxMarks[co.co_number] = 0; });
        questions.forEach(q => {
          const matchingCO = subjectCOs.find(co => co.id === q.co_id);
          if (matchingCO) coMaxMarks[matchingCO.co_number] += Number(q.max_marks);
        });
      } else {
        subjectCOs.forEach(co => { coMaxMarks[co.co_number] = Number(assessment.max_marks); });
      }

      const studentsPayload = students.map(s => {
        const sRecord = {
          regNo: s.reg_no,
          name: s.name,
          totalMarks: 0,
          co1: 0, co2: 0, co3: 0, co4: 0, co5: 0
        };

        if (absentees[s.id]) return sRecord;

        if (isQuestionWise) {
          questions.forEach(q => {
            const marksVal = Number(studentMarks[s.id]?.[q.id] ?? 0);
            sRecord.totalMarks += marksVal;
            const matchingCO = subjectCOs.find(co => co.id === q.co_id);
            if (matchingCO) {
              sRecord[matchingCO.co_number.toLowerCase()] += marksVal;
            }
          });
        } else {
          let total = 0;
          subjectCOs.forEach(co => {
            const marksVal = Number(studentMarks[s.id]?.[co.id] ?? 0);
            sRecord[co.co_number.toLowerCase()] = marksVal;
            total += marksVal;
          });
          sRecord.totalMarks = total;
        }
        return sRecord;
      });

      const cls = classrooms.find(c => String(c.id) === String(selectedClassroomId));
      const courseInfo = {
        school: cls?.department_name || '',
        program: cls?.program_name || '',
        sem: `Sem ${cls?.semester_number}`,
        code: cls?.subject_name ? '23BAXCTC' : '',
        name: cls?.subject_name || '',
        examType: assessment?.type || 'ETT'
      };

      const blob = await downloadExcel(studentsPayload, coMaxMarks, results, levelCriteria, thresholdPercent, courseInfo);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `CO_Attainment_Report_${assessment.name.replace(/\s/g, '_')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setSuccess('Excel report downloaded successfully!');
    } catch (err) {
      setError('Report generation failed: ' + err.message);
    }
  };

  const isQuestionWise = questions.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Marks Grading Board</h1>
          <p className="text-slate-500 text-sm">Input student marks, perform bulk imports, and run outcome attainment analysis.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedClassroomId}
            onChange={(e) => setSelectedClassroomId(e.target.value)}
            className="border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800"
          >
            <option value="">Select Classroom</option>
            {classrooms.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.subject_name})</option>
            ))}
          </select>
          <select
            value={selectedAssessmentId}
            onChange={(e) => setSelectedAssessmentId(e.target.value)}
            disabled={!selectedClassroomId}
            className="border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800 disabled:opacity-50"
          >
            <option value="">Select Assessment</option>
            {assessments.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
            ))}
          </select>
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

      {selectedAssessmentId && !loading && (
        <div className="space-y-6">
          {/* Settings & Spreadsheet Import Bar */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
            {/* Calculation Controls */}
            <div className="space-y-3 lg:col-span-2">
              <h3 className="text-sm font-extrabold text-slate-700">Attainment Threshold Configurations</h3>
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Threshold:</span>
                  <input
                    type="text"
                    value={thresholdPercent}
                    onChange={(e) => {
                      if (isValidNumericInput(e.target.value)) {
                        setThresholdPercent(e.target.value);
                      }
                    }}
                    onBlur={() => {
                      const val = thresholdPercent;
                      if (val === "" || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
                        setThresholdPercent(40);
                      } else {
                        setThresholdPercent(parseFloat(val));
                      }
                    }}
                    className="w-16 border border-slate-200 px-2 py-1 rounded text-center text-sm font-bold text-blue-600 focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-sm font-bold text-slate-500">%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Target Levels:</span>
                  <input
                    type="text"
                    value={levelCriteria.level3}
                    onChange={(e) => {
                      if (isValidNumericInput(e.target.value)) {
                        setLevelCriteria({ ...levelCriteria, level3: e.target.value });
                      }
                    }}
                    onBlur={() => {
                      const val = levelCriteria.level3;
                      if (val === "" || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
                        setLevelCriteria({ ...levelCriteria, level3: 70 });
                      } else {
                        setLevelCriteria({ ...levelCriteria, level3: parseFloat(val) });
                      }
                    }}
                    className="w-12 border border-slate-200 px-1 py-1 rounded text-center text-xs font-bold"
                    placeholder="L3"
                  />
                  <input
                    type="text"
                    value={levelCriteria.level2}
                    onChange={(e) => {
                      if (isValidNumericInput(e.target.value)) {
                        setLevelCriteria({ ...levelCriteria, level2: e.target.value });
                      }
                    }}
                    onBlur={() => {
                      const val = levelCriteria.level2;
                      if (val === "" || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
                        setLevelCriteria({ ...levelCriteria, level2: 60 });
                      } else {
                        setLevelCriteria({ ...levelCriteria, level2: parseFloat(val) });
                      }
                    }}
                    className="w-12 border border-slate-200 px-1 py-1 rounded text-center text-xs font-bold"
                    placeholder="L2"
                  />
                  <input
                    type="text"
                    value={levelCriteria.level1}
                    onChange={(e) => {
                      if (isValidNumericInput(e.target.value)) {
                        setLevelCriteria({ ...levelCriteria, level1: e.target.value });
                      }
                    }}
                    onBlur={() => {
                      const val = levelCriteria.level1;
                      if (val === "" || isNaN(parseFloat(val)) || parseFloat(val) <= 0) {
                        setLevelCriteria({ ...levelCriteria, level1: 50 });
                      } else {
                        setLevelCriteria({ ...levelCriteria, level1: parseFloat(val) });
                      }
                    }}
                    className="w-12 border border-slate-200 px-1 py-1 rounded text-center text-xs font-bold"
                    placeholder="L1"
                  />
                </div>
              </div>
            </div>

            {/* Excel Upload Area */}
            <div className="flex justify-end w-full">
              <label className="flex items-center gap-2 border border-slate-200 hover:border-blue-500 bg-slate-50 cursor-pointer px-4 py-2 rounded-xl text-sm font-bold text-slate-700 transition">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                <span>Upload Marks Excel</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelMarksImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Marks Grading Grid */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-extrabold text-slate-800">Roster Evaluation: {assessment?.name} ({assessment?.type})</h3>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveGrades}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-4 py-2 rounded-xl transition"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>Save Grades</span>
                </button>
                <button
                  onClick={handleCalculateAttainment}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 py-2 rounded-xl transition"
                >
                  <Calculator className="h-3.5 w-3.5" />
                  <span>Compute Attainment</span>
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                    <th className="px-4 py-3 text-left w-16">Sr.No</th>
                    <th className="px-4 py-3 text-left">Reg No</th>
                    <th className="px-4 py-3 text-left">Student Name</th>
                    <th className="px-4 py-3">Absent</th>
                    {isQuestionWise ? (
                      questions.map(q => (
                        <th key={q.id} className="px-2 py-3 bg-blue-50/20">
                          <div>Q{q.question_no}</div>
                          <div className="text-[10px] text-slate-400">Max: {q.max_marks}</div>
                        </th>
                      ))
                    ) : (
                      subjectCOs.map(co => (
                        <th key={co.id} className="px-2 py-3 bg-blue-50/20">
                          <div>{co.co_number}</div>
                          <div className="text-[10px] text-slate-400">Max: {assessment?.max_marks}</div>
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {students.map((s, idx) => (
                    <tr key={s.id} className={`hover:bg-slate-50/50 transition ${absentees[s.id] ? 'bg-red-50/30 text-slate-400' : ''}`}>
                      <td className="px-4 py-3 text-left font-bold text-slate-500">{idx + 1}</td>
                      <td className="px-4 py-3 text-left font-bold text-blue-600">{s.reg_no}</td>
                      <td className="px-4 py-3 text-left font-semibold text-slate-800">{s.name}</td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={!!absentees[s.id]}
                          onChange={() => handleAbsentToggle(s.id)}
                          className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                        />
                      </td>
                      {isQuestionWise ? (
                        questions.map(q => (
                          <td key={q.id} className="px-2 py-2">
                            <input
                              type="text"
                              disabled={absentees[s.id]}
                              value={absentees[s.id] ? '' : (studentMarks[s.id]?.[q.id] ?? '')}
                              onChange={(e) => handleMarkChange(s.id, q.id, e.target.value, q.max_marks)}
                              className="w-16 border border-slate-200 rounded px-1.5 py-1 text-center font-bold text-slate-800 disabled:bg-slate-100"
                            />
                          </td>
                        ))
                      ) : (
                        subjectCOs.map(co => (
                          <td key={co.id} className="px-2 py-2">
                            <input
                              type="text"
                              disabled={absentees[s.id]}
                              value={absentees[s.id] ? '' : (studentMarks[s.id]?.[co.id] ?? '')}
                              onChange={(e) => handleMarkChange(s.id, co.id, e.target.value, assessment.max_marks)}
                              className="w-16 border border-slate-200 rounded px-1.5 py-1 text-center font-bold text-slate-800 disabled:bg-slate-100"
                            />
                          </td>
                        ))
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Attainment Results panel */}
          {results && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-800">Calculation Results & Analytics</h3>
                <button
                  onClick={downloadReportExcel}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Live Excel Report</span>
                </button>
              </div>
              <AttainmentResults results={results} isLoading={false} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
