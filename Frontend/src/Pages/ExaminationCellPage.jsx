import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Upload, Loader2, FileText, ClipboardList, CheckCircle2, XCircle, Users, Users2 } from 'lucide-react';
import PageTransition from '../components/ui/PageTransition';
import { Badge } from '../components/ui/badge';
import { usePageHeader } from '../context/PageHeaderContext';
import { fetchCourses } from '../Api/AttainmentApi';
import { uploadQuestionPaper, fetchQuestionPapers, fetchExaminationStats } from '../Api/examinationApi';
import AllocationPanel from '../components/examination/AllocationPanel';

const STATUS_TONE = {
  UPLOADED: 'bg-slate-500/15 text-slate-600',
  EXTRACTED: 'bg-sky-500/15 text-sky-600',
  ASSIGNED_FOR_REVIEW: 'bg-amber-500/15 text-amber-600',
  UNDER_REVIEW: 'bg-amber-500/15 text-amber-600',
  VERIFIED: 'bg-indigo-500/15 text-indigo-600',
  APPROVED: 'bg-emerald-500/15 text-emerald-600',
  REJECTED: 'bg-red-500/15 text-red-600',
};

const STAT_CARDS = [
  ['totalExaminations', 'Total Examinations', ClipboardList],
  ['papersPendingReview', 'Pending Review', FileText],
  ['papersApproved', 'Approved', CheckCircle2],
  ['papersRejected', 'Rejected', XCircle],
  ['teachersAssigned', 'Teachers Assigned', Users],
  ['marksPending', 'Marks Pending', ClipboardList],
  ['marksSubmitted', 'Marks Submitted', ClipboardList],
  ['marksLocked', 'Marks Locked', ClipboardList],
];

export default function ExaminationCellPage() {
  usePageHeader({ title: 'Examination Cell', subtitle: 'Upload question papers, assign reviewers and marks-entry teachers, and track examination status' });
  const navigate = useNavigate();

  const fileInputRef = useRef(null);
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [examType, setExamType] = useState('MTT');
  const [paperSet, setPaperSet] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [stats, setStats] = useState(null);
  const [papers, setPapers] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loadingPapers, setLoadingPapers] = useState(true);
  const [tab, setTab] = useState('papers');

  const loadPapers = useCallback(async () => {
    setLoadingPapers(true);
    try {
      const res = await fetchQuestionPapers(statusFilter ? { status: statusFilter } : {});
      setPapers(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load question papers.');
    } finally {
      setLoadingPapers(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchCourses().then((res) => setCourses(res.data?.data || res.data || [])).catch(() => {}); }, []);
  useEffect(() => { fetchExaminationStats().then((res) => setStats(res.data?.data)).catch(() => {}); }, []);
  useEffect(() => { loadPapers(); }, [loadPapers]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!courseId || !file) {
      toast.error('Select a course and a question paper file first.');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadQuestionPaper(file, { courseId, examType, paperSet });
      const { paper, draft, review } = res.data.data;
      setFile(null);
      setPaperSet('');
      if (paper.extraction_status === 'extracted' && draft) {
        const pending = review?.summary?.needsReview || 0;
        toast.success(`Read ${draft.rows.length} question(s)${pending ? ` — ${pending} need review` : ''}. Check the auto-mapping, then Confirm & Publish.`);
        navigate(`/examinations/papers/${paper.id}`);
        return;
      }
      toast.error(`Uploaded, but automatic extraction failed: ${paper.extraction_error} Use the manual Question Paper Configuration form instead.`);
      loadPapers();
      fetchExaminationStats().then((r) => setStats(r.data?.data)).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const TABS = [
    ['papers', 'Question Papers', FileText],
    ['allocation', 'Teacher Allocation', Users2],
  ];

  return (
    <PageTransition className="space-y-6">
      <div className="flex gap-2 border-b border-border">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'allocation' && <AllocationPanel />}

      {tab === 'papers' && stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STAT_CARDS.map(([key, label, Icon]) => (
            <div key={key} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-2xl font-extrabold text-foreground">{stats[key] ?? 0}</p>
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'papers' && (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-1 text-base font-bold text-foreground">Upload Question Paper</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Upload the finalized paper (PDF, DOCX, XLSX or CSV). Sections, question numbers, marks, COs and RBT levels
          are read from the paper itself and shown on an Auto-Mapping Review screen — nothing is published until you
          confirm it there. Questions without a printed CO or RBT level are marked Needs Review, with optional suggestions.
        </p>
        <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Course</label>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="w-64 rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <option value="">Select a course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.subject_name} ({c.course_code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Exam Type</label>
            <select value={examType} onChange={(e) => setExamType(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <option value="MTT">MTT (Internal)</option>
              <option value="ETT">ETT (External)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Paper Set (optional)</label>
            <input value={paperSet} onChange={(e) => setPaperSet(e.target.value)} placeholder="Set 1" className="w-32 rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold hover:bg-secondary">
            <Upload className="h-4 w-4" /> {file ? file.name : 'Choose file'}
          </button>
          <button type="submit" disabled={uploading} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Upload & Extract'}
          </button>
        </form>
      </div>
      )}

      {tab === 'papers' && (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-foreground">Question Papers</h3>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
            <option value="">All statuses</option>
            {Object.keys(STATUS_TONE).map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Exam</th>
                <th className="px-3 py-2">School / Dept</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Marks</th>
                <th className="px-3 py-2">Uploaded</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {loadingPapers && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>}
              {!loadingPapers && papers.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No question papers yet.</td></tr>}
              {papers.map((p) => (
                <tr key={p.id} className="border-b border-border/60 hover:bg-muted/30">
                  <td className="px-3 py-2 font-semibold text-foreground">{p.subject_name} <span className="text-muted-foreground">({p.course_code})</span></td>
                  <td className="px-3 py-2">{p.exam_type}{p.paper_set ? ` · ${p.paper_set}` : ''}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.school_name || '—'} / {p.department_name || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {!(p.awaiting_confirmation && p.status === 'UPLOADED') && <Badge className={STATUS_TONE[p.status] || ''}>{p.status.replace(/_/g, ' ')}</Badge>}
                      {p.awaiting_confirmation && <Badge className="bg-violet-500/15 text-violet-600">AWAITING CONFIRMATION</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{p.marks_status ? p.marks_status.replace(/_/g, ' ') : '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(p.uploaded_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => navigate(`/examinations/papers/${p.id}`)} className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:bg-secondary">
                      {p.awaiting_confirmation ? 'Review Mapping' : 'Manage'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </PageTransition>
  );
}
