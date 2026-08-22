import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  fetchCourseConfig, saveCourseConfig,
  fetchCourseMapping, saveCourseMapping,
  fetchCourseMarks, saveCourseMarks,
  fetchCourseAttainment, downloadCourseExcel,
  exportCourseJson
} from '../Api/AttainmentApi';
import {
  Sliders, Grid, Users, TrendingUp, Download,
  Loader2, CheckCircle2, Share2, AlertTriangle, X,
} from 'lucide-react';
import { parseExcel } from '../utils/excelParser';
import { useAuth } from '../context/AuthContext';

import AppHeader from '../components/layout/AppHeader';
import ErrorState from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import PageTransition from '../components/ui/PageTransition';

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
  const [importIssues, setImportIssues] = useState([]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally reload only when the course id changes
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
      } catch {
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
      console.error('Failed to save configurations:', err);
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
      console.error('Failed to save mapping matrix:', err);
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
      setImportIssues([]);

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
      entryMode === 'question' ? questions : null,
      setImportIssues
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
      toast.error('Failed to export course data.');
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
      console.error('Failed to download Excel report:', err);
      toast.error('Failed to download Excel report.');
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
      <div className="min-h-screen bg-background">
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <ErrorState
            title={error || 'Course not found.'}
            onRetry={() => navigate('/dashboard')}
          />
        </div>
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

  const headerTitle = (
    <span className="flex items-center gap-2">
      {course.subject_name}
      <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
        {course.course_code}
      </span>
    </span>
  );
  const headerSubtitle = `${course.school} • ${course.department} • Sem ${course.semester} (${course.academic_year})`;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        backTo="/dashboard"
        title={headerTitle}
        subtitle={headerSubtitle}
        actions={
          <>
            <button
              onClick={handleExportJson}
              title="Export all course data (configs, mapping, marks) as a JSON file to share with another teacher"
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
            >
              <Share2 className="h-4 w-4" /> Export
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:bg-primary-hover"
            >
              <Download className="h-4 w-4" /> Report
            </button>
          </>
        }
      />

      <PageTransition>
        <div className="max-w-6xl mx-auto px-6 py-8">
          {/* View Only Mode Banner for Viewers */}
          {isReadOnly && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span><span className="font-bold">View Only Mode:</span> You have read-only access to this course. You can inspect mappings, student marks, calculate attainments, and export reports, but cannot modify records.</span>
            </div>
          )}

          {status && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 p-4 text-sm text-primary">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p>{status}</p>
            </div>
          )}

          {importIssues.length > 0 && (
            <div className="mb-6 rounded-xl border border-warning/30 bg-warning/10 p-4 text-warning">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">
                  {importIssues.length} issue{importIssues.length > 1 ? 's' : ''} found in the imported Excel file — review before saving
                </p>
                <button
                  onClick={() => setImportIssues([])}
                  className="shrink-0 text-warning/80 transition hover:text-warning"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="max-h-40 list-inside list-disc space-y-1 overflow-y-auto text-xs text-warning/90">
                {importIssues.slice(0, 50).map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
                {importIssues.length > 50 && <li>...and {importIssues.length - 50} more.</li>}
              </ul>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-8">
              <TabsTrigger value="config"><Sliders className="h-4 w-4" /> Setup & Configs</TabsTrigger>
              <TabsTrigger value="mapping"><Grid className="h-4 w-4" /> Articulation Matrix</TabsTrigger>
              <TabsTrigger value="marks"><Users className="h-4 w-4" /> Marks Entry</TabsTrigger>
              <TabsTrigger value="attainment"><TrendingUp className="h-4 w-4" /> Attainment & Charts</TabsTrigger>
            </TabsList>

            <TabsContent value="config">
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
            </TabsContent>

            <TabsContent value="mapping">
              <MappingTab
                course={course}
                mapping={mapping}
                saving={saving}
                handleMappingChange={handleMappingChange}
                getColAvg={getColAvg}
                saveMappingMatrix={saveMappingMatrix}
                readOnly={isReadOnly}
              />
            </TabsContent>

            <TabsContent value="marks">
              <MarksTab
                coMax={coMax}
                numCos={course.num_cos}
                students={students}
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
            </TabsContent>

            <TabsContent value="attainment">
              <AttainmentTab
                attainment={attainment}
                getCOBarChartData={getCOBarChartData}
                getPORadarChartData={getPORadarChartData}
              />
            </TabsContent>
          </Tabs>
        </div>
      </PageTransition>
    </div>
  );
}
