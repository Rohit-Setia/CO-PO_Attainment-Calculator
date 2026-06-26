import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  fetchCourseConfig, saveCourseConfig, 
  fetchCourseMapping, saveCourseMapping,
  fetchCourseMarks, saveCourseMarks,
  fetchCourseAttainment, downloadCourseExcel
} from '../Api/AttainmentApi';
import { 
  ArrowLeft, Sliders, Grid, Users, TrendingUp, Download, 
  Loader2, CheckCircle2, ShieldAlert
} from 'lucide-react';
import { parseExcel } from '../utils/excelParser';

// Import Modular Components
import ConfigTab from '../components/workspace/ConfigTab';
import MappingTab from '../components/workspace/MappingTab';
import MarksTab from '../components/workspace/MarksTab';
import AttainmentTab from '../components/workspace/AttainmentTab';

export default function CourseWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
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

  // Sync questions config when component or config changes
  useEffect(() => {
    if (!config) return;
    const key = activeExamType === 'MTT' ? 'questions_config_internal' : 'questions_config_external';
    const defaultQs = activeExamType === 'MTT'
      ? Array.from({ length: 5 }, (_, i) => ({ id: i + 1, label: `Q${i + 1}`, co: 'co1', maxMarks: 10 }))
      : Array.from({ length: 1 }, (_, i) => ({ id: i + 1, label: `Q${i + 1}`, co: 'co1', maxMarks: 100 }));

    if (config[key]) {
      try {
        const parsed = JSON.parse(config[key]);
        setQuestions(parsed);
        setNumQuestionsInput(parsed.length.toString());
      } catch (e) {
        setQuestions(defaultQs);
        setNumQuestionsInput(defaultQs.length.toString());
      }
    } else {
      setQuestions(defaultQs);
      setNumQuestionsInput(defaultQs.length.toString());
    }
  }, [activeExamType, config]);

  // Sync students list when component or marks state changes
  useEffect(() => {
    setStudents(activeExamType === 'MTT' ? marks.mtt : marks.ett);
    
    // Automatically detect entry mode based on whether students have questionMarks
    const currentList = activeExamType === 'MTT' ? marks.mtt : marks.ett;
    const hasQMarks = currentList.length > 0 && currentList.some(s => s.questionMarks && Object.keys(s.questionMarks).length > 0);
    setEntryMode(hasQMarks ? 'question' : 'co');
  }, [activeExamType, marks]);

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
        s.questionMarks = qMarks;
      } else {
        s[field] = value === '' ? '' : parseFloat(value) || 0;
        let total = 0;
        for (let co = 1; co <= course.num_cos; co++) {
          total += parseFloat(s[`co${co}`]) || 0;
        }
        s.total_marks = total;
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
      total_marks: 0,
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
      await saveCourseMarks(id, {
        examType: activeExamType,
        students: students
      });

      const key = activeExamType === 'MTT' ? 'questions_config_internal' : 'questions_config_external';
      const updatedConfig = { ...config, [key]: questions };
      await saveCourseConfig(id, { config: updatedConfig });
      setConfig(updatedConfig);

      setStatus(`Successfully saved student marks and questions configuration for ${activeExamType}`);
      
      // Update local marks list in state
      setMarks(prev => ({
        ...prev,
        [activeExamType === 'MTT' ? 'mtt' : 'ett']: students
      }));

      await triggerAttainmentCalculation();
    } catch (err) {
      console.error(err);
      setStatus('Failed to save student marks.');
    } finally {
      setSaving(false);
    }
  };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    parseExcel(
      file,
      {
        co1: config ? config.co1_max_internal : 10,
        co2: config ? config.co2_max_internal : 10,
        co3: config ? config.co3_max_internal : 10,
        co4: config ? config.co4_max_internal : 15,
        co5: config ? config.co5_max_internal : 15,
        co6: config ? config.co6_max_internal : 10,
      },
      config ? config.total_max_internal : 60,
      (parsedStudents) => {
        const mapped = parsedStudents.map(s => {
          const m = {
            name: s.name,
            roll: s.roll,
            total_marks: s.totalMarks || 0,
            questionMarks: s.questionMarks || {}
          };
          for (let co = 1; co <= course.num_cos; co++) {
            m[`co${co}`] = s[`co${co}`] || 0;
          }
          return m;
        });
        setStudents(mapped);
        setStatus(`✅ Loaded ${mapped.length} students from spreadsheet.`);
      },
      (msg) => setStatus(msg),
      entryMode === 'question' ? questions : null
    );
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
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold shadow-lg shadow-emerald-600/25 transition duration-300 transform hover:-translate-y-0.5"
          >
            <Download className="h-4 w-4" /> Download Report
          </button>
        </div>
      </header>

      {/* Main Workspace Workspace */}
      <div className="max-w-6xl mx-auto px-6 py-8">
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
            />
          )}

          {activeTab === 'marks' && (
            <MarksTab
              course={course}
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
