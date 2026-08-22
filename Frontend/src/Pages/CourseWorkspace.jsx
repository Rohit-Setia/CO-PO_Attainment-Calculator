import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  fetchCourseConfig, saveCourseConfig,
  updateCourseOutcome,
  fetchQuestionConfig, saveQuestionConfig,
  fetchCourseMapping, saveCourseMapping,
  fetchCourseMarks, saveCourseMarks,
  fetchCourseAttainment, downloadCourseExcel,
  exportCourseJson
} from '../Api/AttainmentApi';
import {
  Sliders, Grid, Users, TrendingUp, Download,
  Share2, AlertTriangle, X,
} from 'lucide-react';
import { parseExcel } from '../utils/excelParser';
import { useAuth } from '../context/AuthContext';

import AppHeader from '../components/layout/AppHeader';
import ErrorState from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import PageTransition from '../components/ui/PageTransition';

import ConfigTab from '../components/workspace/ConfigTab';
import MappingTab from '../components/workspace/MappingTab';
import MarksTab from '../components/workspace/MarksTab';
import AttainmentTab from '../components/workspace/AttainmentTab';

const emptyStudent = () => ({ name: '', roll: '', reg_no: '', totalMarks: 0, coMarks: {}, questionMarks: {} });

export default function CourseWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isReadOnly = hasRole('Viewer');

  const [course, setCourse] = useState(null);
  const [config, setConfig] = useState(null);
  const [courseOutcomes, setCourseOutcomes] = useState(null);
  const [mapping, setMapping] = useState({ values: [], averages: {} });
  const [marks, setMarks] = useState({ mtt: [], ett: [] });
  const [questionConfigs, setQuestionConfigs] = useState({ MTT: [], ETT: [] });
  const [maxQuestionsAllowed, setMaxQuestionsAllowed] = useState(50);
  const [attainment, setAttainment] = useState(null);

  const [activeTab, setActiveTab] = useState('config');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [error, setError] = useState('');

  const [activeExamType, setActiveExamType] = useState('MTT');
  const [entryMode, setEntryMode] = useState('co');
  const [students, setStudents] = useState([]);
  const [draftQuestions, setDraftQuestions] = useState([]);
  const [importIssues, setImportIssues] = useState([]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const configRes = await fetchCourseConfig(id);
      setCourse(configRes.data.data.course);
      setConfig(configRes.data.data.config);
      setCourseOutcomes(configRes.data.data.outcomes);

      const mappingRes = await fetchCourseMapping(id);
      setMapping(mappingRes.data.data || { values: [], averages: {} });

      const marksRes = await fetchCourseMarks(id);
      setMarks(marksRes.data.data);

      const [mttQRes, ettQRes] = await Promise.all([
        fetchQuestionConfig(id, 'MTT'),
        fetchQuestionConfig(id, 'ETT'),
      ]);
      setQuestionConfigs({ MTT: mttQRes.data.data, ETT: ettQRes.data.data });
      setMaxQuestionsAllowed(mttQRes.data.maxAllowed || 50);

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

  // Sync the active exam-type's students and question draft whenever data reloads or the
  // teacher switches MTT/ETT. Entry mode defaults from whether that component actually has a
  // saved question configuration — never fabricated, always read from the backend.
  useEffect(() => {
    const key = activeExamType === 'MTT' ? 'mtt' : 'ett';
    setStudents(marks[key] || []);

    const qs = questionConfigs[activeExamType] || [];
    setEntryMode(qs.length > 0 ? 'question' : 'co');
    setDraftQuestions(qs.map((q) => ({ key: q.id, question_number: q.question_number, co_id: q.co_id, max_marks: q.max_marks })));
  }, [activeExamType, marks, questionConfigs]);

  const triggerAttainmentRecalc = async () => {
    try {
      const res = await fetchCourseAttainment(id);
      setAttainment(res.data.data);
    } catch (err) {
      console.error('Failed to recalculate attainment:', err);
    }
  };

  // ── Config / CO handlers ──────────────────────────────────────────────────
  const handleConfigChange = (e) => {
    const { name, value } = e.target;
    setConfig((prev) => ({ ...prev, [name]: value === '' ? '' : parseFloat(value) || 0 }));
  };

  const handleCoFieldChange = (coId, field, value) => {
    setCourseOutcomes((prev) => prev.map((co) => (co.id === coId ? { ...co, [field]: value } : co)));
  };

  const saveConfigAndCos = async () => {
    setSaving(true);
    try {
      await saveCourseConfig(id, { config });
      await Promise.all(courseOutcomes.map((co) => updateCourseOutcome(id, co.id, {
        description: co.description, max_internal: co.max_internal, max_external: co.max_external,
      })));
      toast.success('Configuration saved.');
      await loadAllData();
      await triggerAttainmentRecalc();
    } catch (err) {
      console.error('Failed to save configuration:', err);
      toast.error(err.response?.data?.message || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  // ── Mapping handlers ──────────────────────────────────────────────────────
  const handleMappingChange = (coId, key, value) => {
    setMapping((prev) => ({
      ...prev,
      values: prev.values.map((v) => (v.co_id === coId ? { ...v, [key]: parseInt(value) || 0 } : v)),
    }));
  };

  const saveMappingMatrix = async () => {
    setSaving(true);
    try {
      await saveCourseMapping(id, { values: mapping.values });
      toast.success('CO-PO mapping saved.');
      const mappingRes = await fetchCourseMapping(id);
      setMapping(mappingRes.data.data || { values: [], averages: {} });
      await triggerAttainmentRecalc();
    } catch (err) {
      console.error('Failed to save mapping matrix:', err);
      toast.error(err.response?.data?.message || 'Failed to save mapping.');
    } finally {
      setSaving(false);
    }
  };

  // ── Question paper configuration handlers ────────────────────────────────
  const addQuestion = () => {
    const nextNumber = draftQuestions.length > 0 ? Math.max(...draftQuestions.map((q) => q.question_number)) + 1 : 1;
    // co_id intentionally starts unset — the teacher must explicitly choose it, never inferred.
    setDraftQuestions((prev) => [...prev, { key: `new-${Date.now()}`, question_number: nextNumber, co_id: null, max_marks: 10 }]);
  };

  const removeQuestion = (idx) => {
    setDraftQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx, field, value) => {
    setDraftQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));
  };

  const saveQuestions = async () => {
    if (draftQuestions.some((q) => !q.co_id)) {
      toast.error('Select a Course Outcome for every question before saving.');
      return;
    }
    setSavingQuestions(true);
    try {
      await saveQuestionConfig(id, {
        examType: activeExamType,
        questions: draftQuestions.map((q) => ({ question_number: q.question_number, co_id: q.co_id, max_marks: q.max_marks })),
      });
      toast.success('Question configuration saved.');
      await loadAllData();
      await triggerAttainmentRecalc();
    } catch (err) {
      console.error('Failed to save question configuration:', err);
      toast.error(err.response?.data?.message || 'Failed to save question configuration.');
    } finally {
      setSavingQuestions(false);
    }
  };

  // ── Marks handlers ────────────────────────────────────────────────────────
  const updateMark = (index, key, value) => {
    setStudents((prev) => {
      const updated = [...prev];
      const s = { ...updated[index] };
      const field = entryMode === 'question' ? 'questionMarks' : 'coMarks';
      const marksMap = { ...s[field], [key]: value === '' ? '' : parseFloat(value) || 0 };
      s[field] = marksMap;
      s.totalMarks = Object.values(marksMap).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
      updated[index] = s;
      return updated;
    });
  };

  const updateStudentInfo = (index, field, value) => {
    setStudents((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeStudent = (index) => {
    setStudents((prev) => prev.filter((_, i) => i !== index));
  };

  const addStudentRow = () => {
    setStudents((prev) => [...prev, emptyStudent()]);
  };

  const savedQuestions = questionConfigs[activeExamType] || [];

  const saveMarksList = async () => {
    if (entryMode === 'question' && savedQuestions.length === 0) {
      toast.error('Configure and save the question paper before entering marks.');
      return;
    }
    setSaving(true);
    try {
      await saveCourseMarks(id, { examType: activeExamType, entryMode, students });
      toast.success(`Saved ${activeExamType} marks successfully.`);
      setImportIssues([]);
      const marksRes = await fetchCourseMarks(id);
      setMarks(marksRes.data.data);
      await triggerAttainmentRecalc();
    } catch (err) {
      console.error('Failed to save marks:', err);
      toast.error(err.response?.data?.message || 'Failed to save student marks.');
    } finally {
      setSaving(false);
    }
  };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const isInternal = activeExamType === 'MTT';

    parseExcel(
      file,
      courseOutcomes,
      isInternal,
      (parsedStudents) => setStudents(parsedStudents),
      (msg) => {
        if (msg.startsWith('❌')) toast.error(msg);
        else if (msg.startsWith('⚠️')) toast.warning(msg);
        else toast.success(msg);
      },
      entryMode === 'question' ? savedQuestions : null,
      setImportIssues,
    );
  };

  const handleExportJson = async () => {
    try {
      const res = await exportCourseJson(id);
      const snapshot = res.data.data;
      const safeName = (course.subject_name || 'course').replace(/\s+/g, '_');
      const filename = `${safeName}_${course.course_code}_CO-PO-Snapshot.json`;
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Course snapshot exported.');
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
      toast.success('Excel report downloaded successfully!');
    } catch (err) {
      console.error('Failed to download Excel report:', err);
      toast.error('Failed to download Excel report.');
    }
  };

  // Recharts helpers — driven entirely by the actual active CO list, any count/numbering.
  const getCOBarChartData = () => {
    if (!attainment || !courseOutcomes) return [];
    return courseOutcomes.map((co) => ({
      name: `CO${co.co_number}`,
      Internal: attainment.mttAttainment?.perCo?.[co.id]?.level || 0,
      External: attainment.ettAttainment?.perCo?.[co.id]?.level || 0,
      Combined: attainment.combinedCO?.[co.id]?.combinedLevel || 0,
    }));
  };

  const getPORadarChartData = () => {
    if (!attainment) return [];
    const data = [];
    for (let po = 1; po <= 12; po++) data.push({ subject: `PO${po}`, Attainment: attainment.poResults[`po${po}`] || 0, fullMark: 3 });
    for (let pso = 1; pso <= 3; pso++) data.push({ subject: `PSO${pso}`, Attainment: attainment.poResults[`pso${pso}`] || 0, fullMark: 3 });
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
          <ErrorState title={error || 'Course not found.'} onRetry={() => navigate('/dashboard')} />
        </div>
      </div>
    );
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
          {isReadOnly && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span><span className="font-bold">View Only Mode:</span> You have read-only access to this course. You can inspect mappings, student marks, calculate attainments, and export reports, but cannot modify records.</span>
            </div>
          )}

          {importIssues.length > 0 && (
            <div className="mb-6 rounded-xl border border-warning/30 bg-warning/10 p-4 text-warning">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">
                  {importIssues.length} issue{importIssues.length > 1 ? 's' : ''} found in the imported Excel file — review before saving
                </p>
                <button onClick={() => setImportIssues([])} className="shrink-0 text-warning/80 transition hover:text-warning" aria-label="Dismiss">
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
                courseId={id}
                config={config}
                courseOutcomes={courseOutcomes}
                saving={saving}
                handleConfigChange={handleConfigChange}
                handleCoFieldChange={handleCoFieldChange}
                saveConfigAndCos={saveConfigAndCos}
                onOutcomesChanged={loadAllData}
                readOnly={isReadOnly}
              />
            </TabsContent>

            <TabsContent value="mapping">
              <MappingTab
                courseOutcomes={courseOutcomes}
                mappingValues={mapping.values}
                mappingAverages={mapping.averages}
                saving={saving}
                handleMappingChange={handleMappingChange}
                saveMappingMatrix={saveMappingMatrix}
                readOnly={isReadOnly}
              />
            </TabsContent>

            <TabsContent value="marks">
              <MarksTab
                courseOutcomes={courseOutcomes}
                students={students}
                activeExamType={activeExamType}
                setActiveExamType={setActiveExamType}
                entryMode={entryMode}
                setEntryMode={setEntryMode}
                draftQuestions={draftQuestions}
                addQuestion={addQuestion}
                removeQuestion={removeQuestion}
                updateQuestion={updateQuestion}
                saveQuestions={saveQuestions}
                savingQuestions={savingQuestions}
                maxQuestionsAllowed={maxQuestionsAllowed}
                savedQuestions={savedQuestions}
                handleExcelUpload={handleExcelUpload}
                saving={saving}
                saveMarksList={saveMarksList}
                updateMark={updateMark}
                updateStudentInfo={updateStudentInfo}
                removeStudent={removeStudent}
                addStudentRow={addStudentRow}
                readOnly={isReadOnly}
              />
            </TabsContent>

            <TabsContent value="attainment">
              <AttainmentTab
                attainment={attainment}
                courseOutcomes={courseOutcomes}
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
