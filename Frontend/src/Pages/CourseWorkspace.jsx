import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  fetchCourseConfig, saveCourseConfig, 
  fetchCourseMapping, saveCourseMapping,
  fetchCourseMarks, saveCourseMarks,
  fetchCourseAttainment, downloadCourseExcel,
  exportCourseJson
} from '../Api/AttainmentApi';
import { 
  ArrowLeft, Sliders, Grid, Users, TrendingUp, Download, 
  Loader2, CheckCircle2, ShieldAlert, Share2
} from 'lucide-react';
import { parseExcel } from '../utils/excelParser';
import { useAuth } from '../context/AuthContext';

// Import Modular Components
import ConfigTab from '../components/workspace/ConfigTab';
import MappingTab from '../components/workspace/MappingTab';
import MarksTab from '../components/workspace/MarksTab';
import AttainmentTab from '../components/workspace/AttainmentTab';

export default function CourseWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isReadOnly = hasRole('Viewer');
  const [course, setCourse] = useState(null);
  const [config, setConfig] = useState(null);
  const [coDescriptions, setCoDescriptions] = useState([]);
  const [mapping, setMapping] = useState({});
  const [marks, setMarks] = useState({ mtt: [], ett: [] });
  const [attainment, setAttainment] = useState(null);
  
  const [activeTab, setActiveTab] = useState('config');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // Marks tab states
  const [activeExamType, setActiveExamType] = useState('MTT');
  const [entryMode, setEntryMode] = useState('co');
  const [questions, setQuestions] = useState([]);
  const [numQuestionsInput, setNumQuestionsInput] = useState('5');
  const [students, setStudents] = useState([]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const configRes = await fetchCourseConfig(id);
      setCourse(configRes.data.data.course);
      setConfig(configRes.data.data.config);
      setCoDescriptions(configRes.data.data.coDescriptions);

      const mappingRes = await fetchCourseMapping(id);
      setMapping(mappingRes.data.data || {});

      const marksRes = await fetchCourseMarks(id);
      const mData = marksRes.data.data;
      setMarks(mData);
      setStudents(activeExamType === 'MTT' ? mData.mtt : mData.ett);

      const attainmentRes = await fetchCourseAttainment(id);
      setAttainment(attainmentRes.data.data);

      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to load course details. Ensure database is connected.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [id]);

  // Sync questions config when exam type or config changes
  useEffect(() => {
    if (!config) return;
    const key = activeExamType === 'MTT' ? 'questions_config_internal' : 'questions_config_external';
    // Uniform default: 5 questions, maxMarks 10 each — same for both MTT and ETT
    const defaultQs = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1, label: `Q${i + 1}`, co: 'co1', maxMarks: 10
    }));

    if (config[key]) {
      try {
        const raw = config[key];
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQuestions(parsed);
          setNumQuestionsInput(parsed.length.toString());
        } else {
          setQuestions(defaultQs);
          setNumQuestionsInput('5');
        }
      } catch (e) {
        setQuestions(defaultQs);
        setNumQuestionsInput('5');
      }
    } else {
      setQuestions(defaultQs);
      setNumQuestionsInput('5');
    }
  }, [activeExamType, config]);

  // Sync students list when exam type or marks change; auto-populate names from other exam if target is empty
  useEffect(() => {
    const currentList = activeExamType === 'MTT' ? marks.mtt : marks.ett;
    const otherList  = activeExamType === 'MTT' ? marks.ett : marks.mtt;

    if (currentList.length === 0 && otherList.length > 0 && course) {
      // Pre-populate reg numbers & names from the other exam type (zero marks)
      const prePopulated = otherList.map(s => {
        const empty = {
          name: s.name || '',
          roll: s.roll || s.reg_no || '',
          reg_no: s.reg_no || s.roll || '',
          total_marks: 0,
          totalMarks: 0,
          questionMarks: {},
        };
        for (let co = 1; co <= course.num_cos; co++) {
          empty[`co${co}`] = 0;
        }
        return empty;
      });
      setStudents(prePopulated);
      setStatus(`ℹ️ ${prePopulated.length} student names pre-filled from ${activeExamType === 'MTT' ? 'ETT' : 'MTT'} — enter marks to continue.`);
    } else {
      setStudents(currentList);
    }

    // Auto-detect entry mode from saved data
    const hasQMarks = currentList.length > 0 && currentList.some(s => s.questionMarks && Object.keys(s.questionMarks).length > 0);
    setEntryMode(hasQMarks ? 'question' : 'co');
  }, [activeExamType, marks, course]);

  const triggerAttainmentCalculation = async () => {
    try {
      const attainmentRes = await fetchCourseAttainment(id);
      setAttainment(attainmentRes.data.data);
    } catch (err) {
      console.error('Failed to recalculate attainment:', err);
    }
  };

  // Config tab handlers
  const handleConfigChange = (e) => {
    const { name, value } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: value === '' ? '' : parseFloat(value) || 0
    }));
  };

  const handleCoDescChange = (index, value) => {
    setCoDescriptions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], description: value };
      return updated;
    });
  };

  const saveConfigAndCos = async () => {
    setSaving(true);
    setStatus('');
    try {
      await saveCourseConfig(id, { config, coDescriptions });
      setStatus('Configuration and CO descriptions saved successfully!');
      await triggerAttainmentCalculation();
    } catch (err) {
      setStatus('Failed to save configurations.');
    } finally {
      setSaving(false);
    }
  };

  // Mapping matrix handlers
  const handleMappingChange = (coNum, poKey, value) => {
    const key = `co${coNum}_${poKey.toLowerCase()}`;
    setMapping(prev => ({ ...prev, [key]: parseInt(value) || 0 }));
  };

  const getColAvg = (poKey) => {
    if (!course) return '0.00';
    let sum = 0;
    let count = 0;
    for (let co = 1; co <= course.num_cos; co++) {
      const val = mapping[`co${co}_${poKey.toLowerCase()}`] || 0;
      if (val > 0) {
        sum += val;
        count++;
      }
    }
    return count > 0 ? (sum / count).toFixed(2) : '0.00';
  };

  const saveMappingMatrix = async () => {
    setSaving(true);
    setStatus('');
    try {
      await saveCourseMapping(id, mapping);
      setStatus('CO-PO Articulation Matrix saved successfully!');
      const mappingRes = await fetchCourseMapping(id);
      setMapping(mappingRes.data.data || {});
      await triggerAttainmentCalculation();
    } catch (err) {
      setStatus('Failed to save mapping matrix.');
    } finally {
      setSaving(false);
    }
  };

  // Marks editing cell handlers
  const updateMark = (index, field, value) => {
    setStudents(prev => {
      const updated = [...prev];
      const s = { ...updated[index] };
      
      if (entryMode === 'question') {
        const qMarks = { ...s.questionMarks, [field]: value === '' ? '' : parseFloat(value) || 0 };
        const coPerformance = {};
        for (let co = 1; co <= course.num_cos; co++) {
          coPerformance[`co${co}`] = 0;
        }
        
        let total = 0;
        questions.forEach(q => {
          const mark = parseFloat(qMarks[q.id]) || 0;
          const coKey = String(q.co).toLowerCase();
          if (coPerformance[coKey] !== undefined) {
            coPerformance[coKey] += mark;
          }
          total += mark;
        });

        Object.assign(s, coPerformance);
        s.total_marks = total;
        s.totalMarks = total;  // keep alias in sync
        s.questionMarks = qMarks;
      } else {
        s[field] = value === '' ? '' : parseFloat(value) || 0;
        let total = 0;
        for (let co = 1; co <= course.num_cos; co++) {
          total += parseFloat(s[`co${co}`]) || 0;
        }
        s.total_marks = total;
        s.totalMarks = total;  // keep alias in sync
      }
      
      updated[index] = s;
      return updated;
    });
  };

  const updateQuestionConfig = (qIdx, field, value) => {
    setQuestions(prev => {
      const updated = [...prev];
      updated[qIdx] = { ...updated[qIdx], [field]: field === 'maxMarks' ? (parseFloat(value) || 0) : value };
      return updated;
    });
  };

  const updateStudentInfo = (index, field, value) => {
    setStudents(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeStudent = (index) => {
    setStudents(prev => prev.filter((_, i) => i !== index));
  };

  const addStudentRow = () => {
    const newStudent = {
      name: '',
      roll: '',
      reg_no: '',
      total_marks: 0,
      totalMarks: 0,
      questionMarks: {},
    };
    for (let co = 1; co <= course.num_cos; co++) {
      newStudent[`co${co}`] = 0;
    }
    setStudents(prev => [...prev, newStudent]);
  };

  // Submit marks & question configurations to backend
  const saveMarksList = async () => {
    setSaving(true);
    setStatus('');
    try {
      await saveCourseMarks(id, { examType: activeExamType, students });

      // Build config update — always save questions config
      const qKey = activeExamType === 'MTT' ? 'questions_config_internal' : 'questions_config_external';
      let configToSave = { ...config, [qKey]: questions };

      // FIX #3 & #4: If question-wise mode, auto-compute CO max marks from question configs.
      // This ensures co_max_internal/external matches actual sum per CO so attainment is correct.
      if (entryMode === 'question' && questions.length > 0) {
        const maxKey = activeExamType === 'MTT' ? 'internal' : 'external';
        const coMaxPerCo = {};
        let totalMax = 0;
        for (let co = 1; co <= course.num_cos; co++) coMaxPerCo[co] = 0;

        questions.forEach(q => {
          const coNum = parseInt(String(q.co).replace('co', ''));
          if (coNum >= 1 && coNum <= course.num_cos) {
            coMaxPerCo[coNum] += parseFloat(q.maxMarks) || 0;
            totalMax += parseFloat(q.maxMarks) || 0;
          }
        });

        for (let co = 1; co <= course.num_cos; co++) {
          if (coMaxPerCo[co] > 0) {
            configToSave[`co${co}_max_${maxKey}`] = coMaxPerCo[co];
          }
        }
        if (totalMax > 0) {
          configToSave[`total_max_${maxKey}`] = totalMax;
        }
      }

      await saveCourseConfig(id, { config: configToSave });
      setConfig(configToSave);

      const coMaxNote = entryMode === 'question' ? ' · CO max marks auto-synced from question config.' : '';
      setStatus(`✅ Saved ${activeExamType} marks successfully.${coMaxNote}`);

      // Update local marks cache
      setMarks(prev => ({
        ...prev,
        [activeExamType === 'MTT' ? 'mtt' : 'ett']: students
      }));

      await triggerAttainmentCalculation();
    } catch (err) {
      console.error(err);
      setStatus('❌ Failed to save student marks.');
    } finally {
      setSaving(false);
    }
  };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Use exam-type-aware CO max marks for the parser
    const isInternal = activeExamType === 'MTT';
    const coMaxForExam = {};
    for (let co = 1; co <= (course?.num_cos || 6); co++) {
      coMaxForExam[`co${co}`] = config
        ? (isInternal ? config[`co${co}_max_internal`] : config[`co${co}_max_external`])
        : 10;
    }
    const totalMaxForExam = config
      ? (isInternal ? config.total_max_internal : config.total_max_external)
      : (isInternal ? 60 : 100);

    parseExcel(
      file,
      coMaxForExam,
      totalMaxForExam,
      (parsedStudents) => {
        const mapped = parsedStudents.map(s => {
          const m = {
            name: s.name,
            roll: s.roll,
            reg_no: s.roll,
            total_marks: s.totalMarks || 0,
            totalMarks: s.totalMarks || 0,
            questionMarks: s.questionMarks || {}
          };
          for (let co = 1; co <= course.num_cos; co++) {
            m[`co${co}`] = s[`co${co}`] || 0;
          }
          return m;
        });
        setStudents(mapped);

        // FIX #1: Auto-detect question count from parsed Excel when in question-wise mode
        if (entryMode === 'question' && mapped.length > 0) {
          const firstQMarks = mapped[0].questionMarks || {};
          const detectedIds = Object.keys(firstQMarks)
            .map(Number)
            .filter(n => !isNaN(n) && n > 0)
            .sort((a, b) => a - b);

          if (detectedIds.length > 0) {
            const maxQId = Math.max(...detectedIds);
            setNumQuestionsInput(String(maxQId));
            setQuestions(prev =>
              Array.from({ length: maxQId }, (_, i) => {
                const existingQ = prev.find(q => q.id === i + 1);
                return existingQ || { id: i + 1, label: `Q${i + 1}`, co: 'co1', maxMarks: 10 };
              })
            );
          }
        }

        setStatus(`✅ Loaded ${mapped.length} students from Excel.`);
      },
      (msg) => setStatus(msg),
      entryMode === 'question' ? questions : null
    );
  };

  const handleExportJson = async () => {
    try {
      const res = await exportCourseJson(id);
      const snapshot = res.data.data;
      const safeName = (course.subject_name || 'course').replace(/\s+/g, '_');
      const filename  = `${safeName}_${course.course_code}_CO-PO-Snapshot.json`;
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('✅ Course snapshot exported. Share the .json file with another teacher to let them import it.');
    } catch (err) {
      console.error(err);
      alert('Failed to export course data.');
    }
  };

  const handleExportExcel = async () => {
    try {
      const blob = await downloadCourseExcel(id);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${course.subject_name.replace(/\s+/g, '_')}_OBE_Attainment_Report.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus('Excel report downloaded successfully!');
    } catch (err) {
      alert('Failed to download Excel report.');
    }
  };

  // Recharts helpers
  const getCOBarChartData = () => {
    if (!attainment) return [];
    const numCos = attainment.numCos;
    const data = [];
    for (let co = 1; co <= numCos; co++) {
      data.push({
        name: `CO${co}`,
        Internal: attainment.mttAttainment?.perCO[`CO${co}`]?.level || 0,
        External: attainment.ettAttainment?.perCO[`CO${co}`]?.level || 0,
        Combined: attainment.combinedCO[`CO${co}`]?.combinedLevel || 0
      });
    }
    return data;
  };

  const getPORadarChartData = () => {
    if (!attainment) return [];
    const data = [];
    for (let po = 1; po <= 12; po++) {
      data.push({ subject: `PO${po}`, Attainment: attainment.poResults[`po${po}`] || 0, fullMark: 3 });
    }
    for (let pso = 1; pso <= 3; pso++) {
      data.push({ subject: `PSO${pso}`, Attainment: attainment.poResults[`pso${pso}`] || 0, fullMark: 3 });
    }
    return data;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-3 text-white">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        <p className="text-slate-400 text-sm">Loading course workspace...</p>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 text-white px-4">
        <ShieldAlert className="h-16 w-16 text-red-500" />
        <p className="text-lg text-slate-300 font-bold">{error || 'Course not found.'}</p>
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700/80 transition text-sm">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>
      </div>
    );
  }

  // Compute coMax dynamically — uses internal or external max based on active exam type
  const coMax = {};
  if (config) {
    const isInternal = activeExamType === 'MTT';
    for (let co = 1; co <= course.num_cos; co++) {
      coMax[`co${co}`] = isInternal
        ? (parseFloat(config[`co${co}_max_internal`]) || 10)
        : (parseFloat(config[`co${co}_max_external`]) || 10);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white font-sans antialiased">
      {/* Top Banner Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-slate-900/60 border-b border-slate-700/50 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg border border-slate-700 hover:bg-slate-800/80 text-slate-400 hover:text-white transition duration-200"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-slate-100">{course.subject_name}</h2>
              <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                {course.course_code}
              </span>
            </div>
            <p className="text-xs text-slate-400">{course.school} &bull; {course.department} &bull; Sem {course.semester} ({course.academic_year})</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportJson}
            title="Export all course data (configs, mapping, marks) as a JSON file to share with another teacher"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/40 hover:bg-slate-700/60 text-slate-300 text-sm font-medium transition duration-200"
          >
            <Share2 className="h-4 w-4" /> Export Course
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-600/25 transition duration-300 transform hover:-translate-y-0.5"
          >
            <Download className="h-4 w-4" /> Download Report
          </button>
        </div>
      </header>

      {/* Main Workspace Workspace */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* View Only Mode Banner for Viewers */}
        {isReadOnly && (
          <div className="mb-6 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-amber-200 text-sm">
            <span className="font-bold text-amber-400">👁 View Only Mode:</span>
            <span>You have read-only access to this course. You can inspect mappings, student marks, calculate attainments, and export reports, but cannot modify records.</span>
          </div>
        )}

        {status && (
          <div className="mb-6 flex items-center gap-2 bg-blue-500/10 border border-blue-500/25 rounded-xl p-4 text-blue-200 text-sm">
            <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0" />
            <p>{status}</p>
          </div>
        )}

        {/* Tab Controls */}
        <div className="flex border-b border-slate-700/60 mb-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('config')}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition shrink-0 ${
              activeTab === 'config' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="h-4 w-4" /> Setup & Configs
          </button>

          <button
            onClick={() => setActiveTab('mapping')}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition shrink-0 ${
              activeTab === 'mapping' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Grid className="h-4 w-4" /> Articulation Matrix
          </button>

          <button
            onClick={() => setActiveTab('marks')}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition shrink-0 ${
              activeTab === 'marks' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="h-4 w-4" /> Marks Entry
          </button>

          <button
            onClick={() => setActiveTab('attainment')}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition shrink-0 ${
              activeTab === 'attainment' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="h-4 w-4" /> Attainment & Charts
          </button>
        </div>

        {/* Tab Components */}
        <div className="space-y-6">
          {activeTab === 'config' && (
            <ConfigTab
              config={config}
              coDescriptions={coDescriptions}
              course={course}
              saving={saving}
              handleConfigChange={handleConfigChange}
              handleCoDescChange={handleCoDescChange}
              saveConfigAndCos={saveConfigAndCos}
              readOnly={isReadOnly}
            />
          )}

          {activeTab === 'mapping' && (
            <MappingTab
              course={course}
              mapping={mapping}
              saving={saving}
              handleMappingChange={handleMappingChange}
              getColAvg={getColAvg}
              saveMappingMatrix={saveMappingMatrix}
              readOnly={isReadOnly}
            />
          )}

          {activeTab === 'marks' && (
            <MarksTab
              course={course}
              coMax={coMax}
              numCos={course.num_cos}
              students={students}
              setStudents={setStudents}
              activeExamType={activeExamType}
              setActiveExamType={setActiveExamType}
              entryMode={entryMode}
              setEntryMode={setEntryMode}
              questions={questions}
              setQuestions={setQuestions}
              numQuestionsInput={numQuestionsInput}
              setNumQuestionsInput={setNumQuestionsInput}
              handleExcelUpload={handleExcelUpload}
              saving={saving}
              saveMarksList={saveMarksList}
              updateMark={updateMark}
              updateQuestionConfig={updateQuestionConfig}
              updateStudentInfo={updateStudentInfo}
              removeStudent={removeStudent}
              addStudentRow={addStudentRow}
              readOnly={isReadOnly}
            />
          )}

          {activeTab === 'attainment' && (
            <AttainmentTab
              attainment={attainment}
              getCOBarChartData={getCOBarChartData}
              getPORadarChartData={getPORadarChartData}
            />
          )}
        </div>
      </div>
    </div>
  );
}
