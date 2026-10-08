import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Loader2, CheckCircle2, XCircle, ShieldCheck, UserPlus, GraduationCap, ArrowLeft, AlertTriangle, UploadCloud, Trash2, Download,
} from 'lucide-react';
import PageTransition from '../components/ui/PageTransition';
import { Badge } from '../components/ui/badge';
import { usePageHeader } from '../context/PageHeaderContext';
import { fetchClasses, downloadMarksTemplate } from '../Api/AttainmentApi';
import {
  fetchQuestionPaperDetail, correctPaperQuestion, verifyPaper, approvePaper, rejectPaper, reuploadPaper,
  assignPaperResponsibility, assignClassToPaper, submitPaperMarks, lockPaperMarks, reopenPaperMarks,
  deleteQuestionPaper,
} from '../Api/examinationApi';
import AutoMappingReview from '../components/examination/AutoMappingReview';
import FacultyAutocompleteInput from '../components/common/FacultyAutocompleteInput';

const RBT_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const RESPONSIBILITIES = ['PAPER_REVIEWER', 'PAPER_VERIFIER', 'PAPER_APPROVER', 'MARKS_ENTRY', 'EVALUATOR', 'MODERATOR'];

const STATUS_TONE = {
  UPLOADED: 'bg-slate-500/15 text-slate-600',
  EXTRACTED: 'bg-sky-500/15 text-sky-600',
  ASSIGNED_FOR_REVIEW: 'bg-amber-500/15 text-amber-600',
  UNDER_REVIEW: 'bg-amber-500/15 text-amber-600',
  VERIFIED: 'bg-indigo-500/15 text-indigo-600',
  APPROVED: 'bg-emerald-500/15 text-emerald-600',
  REJECTED: 'bg-red-500/15 text-red-600',
};

export default function PaperReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  usePageHeader({ title: 'Question Paper Review', subtitle: '' });

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [assignEmail, setAssignEmail] = useState('');
  const [assignResp, setAssignResp] = useState('PAPER_REVIEWER');
  const reuploadInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchQuestionPaperDetail(id);
      setData(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load this question paper.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchClasses().then((res) => setClasses(res.data?.data || [])).catch(() => {}); }, []);

  if (loading) {
    return <PageTransition><div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></PageTransition>;
  }
  if (!data) return <PageTransition><p className="text-muted-foreground">Question paper not found.</p></PageTransition>;

  const {
    paper, questions, assignments, marksSubmission, marksSubmissions = [], myResponsibilities = [], myClassIds = [], canOversee, awaitingConfirmation,
  } = data;
  const canReview = canOversee || myResponsibilities.includes('PAPER_REVIEWER') || myResponsibilities.includes('PAPER_VERIFIER');
  const canApprove = canOversee || myResponsibilities.includes('PAPER_APPROVER') || (myResponsibilities.includes('PAPER_REVIEWER') && assignments.filter((a) => ['PAPER_REVIEWER', 'PAPER_APPROVER'].includes(a.responsibility)).length <= 1);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const handleDownloadTemplate = async (classId = null) => {
    if (!paper?.course_id) return;
    setDownloadingTemplate(true);
    try {
      const res = await downloadMarksTemplate(paper.course_id, paper.exam_type, classId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const cleanSubject = (paper.subject_name || paper.file_name || 'Marks').replace(/\s+/g, '_');
      link.setAttribute('download', `${cleanSubject}_${paper.exam_type}_Marks_Template.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Marks template downloaded.');
    } catch (err) {
      console.error('Failed to download marks template:', err);
      toast.error('Failed to download marks template.');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const withBusy = (fn) => async (...args) => {
    setBusy(true);
    try { await fn(...args); await load(); } catch (err) { toast.error(err.response?.data?.message || 'Action failed.'); } finally { setBusy(false); }
  };

  const handleCorrect = withBusy(async (q, field, value) => {
    await correctPaperQuestion(paper.id, q.id, { [field]: value });
    toast.success(`Q${q.question_number} updated.`);
  });
  const handleVerify = withBusy(async () => { await verifyPaper(paper.id); toast.success('Paper marked as verified.'); });
  const handleApprove = withBusy(async () => { await approvePaper(paper.id); toast.success('Paper approved — CO max marks reconciled and marks entry is now open.'); });
  const handleReject = withBusy(async () => {
    const reason = window.prompt('Reason for rejecting this paper:');
    if (!reason || !reason.trim()) return;
    await rejectPaper(paper.id, reason);
    toast.success('Paper rejected.');
  });
  const handleReuploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const res = await reuploadPaper(paper.id, file);
      toast.success(`Corrected version uploaded (v${res.data.data.paper.version}) — extraction re-run.`);
      navigate(`/examinations/papers/${res.data.data.paper.id}`, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Re-upload failed.');
    } finally {
      setBusy(false);
    }
  };
  const handleAssign = withBusy(async (e) => {
    e.preventDefault();
    if (!assignEmail.trim()) return;
    await assignPaperResponsibility(paper.id, { email: assignEmail.trim(), responsibility: assignResp });
    toast.success(`${assignResp.replace('_', ' ')} assigned to ${assignEmail}.`);
    setAssignEmail('');
  });
  const handleAssignClass = withBusy(async () => {
    if (!selectedClass) return;
    const res = await assignClassToPaper(paper.id, selectedClass);
    toast.success(res.data.message);
  });
  const handleSubmitMarks = (classId = null) => withBusy(async () => {
    await submitPaperMarks(paper.id, classId);
    toast.success('Marks submitted.');
  })();
  const handleLock = (classId = null) => withBusy(async () => {
    await lockPaperMarks(paper.id, classId);
    toast.success('Marks locked.');
  })();
  const handleReopen = (classId = null) => withBusy(async () => {
    const reason = window.prompt('Reason for reopening marks entry:');
    if (!reason || !reason.trim()) return;
    await reopenPaperMarks(paper.id, reason, classId);
    toast.success('Marks reopened for correction.');
  })();
  const handleDeletePaper = withBusy(async () => {
    if (!window.confirm(`Are you sure you want to permanently delete question paper "${paper.file_name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteQuestionPaper(paper.id);
      toast.success('Question paper deleted.');
      navigate('/examinations');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete question paper.');
    }
  });

  return (
    <PageTransition className="space-y-6">
      <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">{paper.subject_name || paper.file_name}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {paper.exam_type} · {paper.paper_set || 'No set label'} · v{paper.version} · Max {paper.max_marks || '—'} marks · {paper.duration_minutes ? `${paper.duration_minutes} min` : '—'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={STATUS_TONE[paper.status] || ''}>{paper.status.replace(/_/g, ' ')}</Badge>
            {canOversee && paper.status !== 'APPROVED' && (
              <button
                type="button"
                onClick={handleDeletePaper}
                disabled={busy}
                className="flex items-center gap-1 rounded-xl border border-destructive/40 px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                title="Delete this question paper"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>
        </div>
        {paper.extraction_confidence === 'low' && !awaitingConfirmation && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Low-confidence extraction ({paper.extraction_error || 'best-effort parsing'}) — every row below must be reviewed carefully before approval.</span>
          </div>
        )}
        {paper.status === 'REJECTED' && paper.rejection_reason && (
          <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-700">
            <b>Rejected:</b> {paper.rejection_reason}
          </div>
        )}
        {paper.superseded_by_id && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700">
            A corrected version (v{paper.version + 1}) was uploaded to replace this one —{' '}
            <Link to={`/examinations/papers/${paper.superseded_by_id}`} className="font-semibold underline">view the current version</Link>.
          </div>
        )}
        {paper.status === 'REJECTED' && !paper.superseded_by_id && canReview && (
          <div className="mt-3 flex items-center gap-2">
            <input ref={reuploadInputRef} type="file" accept=".docx,.xlsx,.xls,.csv,.pdf" className="hidden" onChange={handleReuploadFile} />
            <button
              type="button" disabled={busy} onClick={() => reuploadInputRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-semibold hover:bg-secondary/80 disabled:opacity-50"
            >
              <UploadCloud className="h-4 w-4" /> Upload Corrected Version
            </button>
          </div>
        )}
      </div>

      {/* Auto-mapping awaiting confirmation: nothing is published yet */}
      {awaitingConfirmation && canOversee && (
        <>
          <AutoMappingReview paperId={paper.id} onPublished={load} />
          <button type="button" disabled={busy} onClick={handleReject} className="flex items-center gap-2 rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/5 disabled:opacity-50">
            <XCircle className="h-4 w-4" /> Reject Paper (wrong or unreadable file)
          </button>
        </>
      )}
      {awaitingConfirmation && !canOversee && (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          The Examination Cell is still confirming the questions, COs and RBT levels read from this paper. They will appear here once published.
        </div>
      )}

      {/* Published questions */}
      {!awaitingConfirmation && (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-4 text-base font-bold text-foreground">Questions ({questions.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Q#</th>
                <th className="px-3 py-2">Section</th>
                <th className="px-3 py-2">Question</th>
                <th className="px-3 py-2">Marks</th>
                <th className="px-3 py-2">CO</th>
                <th className="px-3 py-2">RBT Level</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.id} className="border-b border-border/60">
                  <td className="px-3 py-2 font-semibold">
                    {q.question_label || q.question_number}
                    {q.question_label && <span className="ml-1 text-[10px] font-normal text-muted-foreground">#{q.question_number}</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{q.section || '—'}{q.choice_group ? ' (choice)' : ''}</td>
                  <td className="px-3 py-2 max-w-md">{q.question_text || <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2">{q.max_marks}</td>
                  <td className="px-3 py-2">
                    {canReview && paper.status !== 'APPROVED' ? (
                      <input
                        type="number" min="1" defaultValue={q.co_number}
                        onBlur={(e) => { const v = Number(e.target.value); if (v && v !== q.co_number) handleCorrect(q, 'coNumber', v); }}
                        className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-sm"
                      />
                    ) : <Badge variant="secondary">CO{q.co_number}</Badge>}
                  </td>
                  <td className="px-3 py-2">
                    {canReview && paper.status !== 'APPROVED' ? (
                      <select
                        defaultValue={q.rbt_level || ''}
                        onChange={(e) => handleCorrect(q, 'rbtLevel', e.target.value)}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                      >
                        <option value="">—</option>
                        {RBT_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : (q.rbt_level || '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canReview && ['ASSIGNED_FOR_REVIEW', 'UNDER_REVIEW'].includes(paper.status) && (
          <button type="button" disabled={busy} onClick={handleVerify} className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <CheckCircle2 className="h-4 w-4" /> Mark as Verified
          </button>
        )}
        {canApprove && (paper.status === 'VERIFIED' || (canOversee && ['ASSIGNED_FOR_REVIEW', 'UNDER_REVIEW', 'EXTRACTED'].includes(paper.status))) && (
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={busy} onClick={handleApprove} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              <ShieldCheck className="h-4 w-4" /> Approve Paper
            </button>
          </div>
        )}
        {canReview && !['APPROVED'].includes(paper.status) && (
          <button type="button" disabled={busy} onClick={handleReject} className="mt-2 ml-2 flex items-center gap-2 rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/5 disabled:opacity-50">
            <XCircle className="h-4 w-4" /> Reject Paper
          </button>
        )}
      </div>
      )}

      {/* Assignments (overseers only) */}
      {canOversee && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-foreground"><UserPlus className="h-4 w-4" /> Assignments</h3>
          <div className="mb-4 flex flex-wrap gap-2">
            {assignments.map((a) => (
              <span key={a.id} className="rounded-lg border border-border bg-muted/30 px-2.5 py-1 text-xs">
                <b>{a.responsibility.replace(/_/g, ' ')}</b> — {a.name} ({a.email})
              </span>
            ))}
            {assignments.length === 0 && <p className="text-sm text-muted-foreground">No one is assigned yet.</p>}
          </div>
          <form onSubmit={handleAssign} className="flex flex-wrap items-center gap-2">
            <div className="w-72">
              <FacultyAutocompleteInput
                value={assignEmail}
                onChange={setAssignEmail}
                onSelect={(user) => setAssignEmail(user.email)}
                placeholder="Search teacher by name or email…"
                required
              />
            </div>
            <select value={assignResp} onChange={(e) => setAssignResp(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
              {RESPONSIBILITIES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
            <button type="submit" disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Assign</button>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <option value="">Select a class to assign…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.program_name} · Sem {c.semester}{c.section ? ` · ${c.section}` : ''}</option>
              ))}
            </select>
            <button type="button" disabled={busy || !selectedClass} onClick={handleAssignClass} className="rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-semibold hover:bg-secondary/80 disabled:opacity-50">Assign Class</button>
          </div>
        </div>
      )}

      {/* Marks submission lifecycle */}
      {paper.status === 'APPROVED' && (() => {
        const classSubmissions = marksSubmissions.filter((m) => m.class_id !== null);
        const hasClassScopedSubmissions = classSubmissions.length > 0;
        const singleSub = marksSubmission || marksSubmissions.find((m) => m.class_id === null) || marksSubmissions[0];
        const singleStatus = singleSub?.status || 'NOT_STARTED';

        return (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Marks Entry & Submission Status</h3>
                <p className="text-xs text-muted-foreground">
                  {hasClassScopedSubmissions
                    ? 'Track independent marks submission, verification, and lock status per allocated class section.'
                    : 'Manage course marks entry, submission, locking, and download templates.'}
                </p>
              </div>
              <button
                type="button"
                disabled={downloadingTemplate}
                onClick={() => handleDownloadTemplate(null)}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"
                title="Download pre-filled Excel template for this course and exam"
              >
                {downloadingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Download Marks Template
              </button>
            </div>

            {hasClassScopedSubmissions ? (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Class / Section</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Evaluator</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {classSubmissions.map((sub) => {
                      const isMyClass = canOversee || myClassIds.includes(sub.class_id) || (myResponsibilities.includes('MARKS_ENTRY') && myClassIds.length === 0);
                      return (
                        <tr key={sub.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {sub.class_label || (sub.section ? `Section ${sub.section}` : `Class #${sub.class_id}`)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className="text-xs font-medium">
                              {sub.status.replace(/_/g, ' ')}
                            </Badge>
                            {sub.status === 'CORRECTION_REQUIRED' && sub.reopen_reason && (
                              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                <b>Reopened:</b> {sub.reopen_reason}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {sub.submitted_by_name || '—'}
                            {sub.submitted_at && (
                              <span className="block text-[10px]">
                                Submitted {new Date(sub.submitted_at).toLocaleDateString()}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {isMyClass && sub.status !== 'LOCKED' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/courses/${paper.course_id}?tab=marks&classId=${sub.class_id}`)}
                                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                                  >
                                    Enter Marks
                                  </button>
                                  {['NOT_STARTED', 'IN_PROGRESS', 'CORRECTION_REQUIRED'].includes(sub.status) && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => handleSubmitMarks(sub.class_id)}
                                      className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold hover:bg-secondary/80 disabled:opacity-50"
                                    >
                                      Submit
                                    </button>
                                  )}
                                </>
                              )}
                              {canOversee && sub.status === 'SUBMITTED' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleLock(sub.class_id)}
                                  className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold hover:bg-secondary/80 disabled:opacity-50"
                                >
                                  Lock
                                </button>
                              )}
                              {canOversee && ['SUBMITTED', 'LOCKED'].includes(sub.status) && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleReopen(sub.class_id)}
                                  className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-500/5 disabled:opacity-50"
                                >
                                  Reopen
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDownloadTemplate(sub.class_id)}
                                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary"
                                title="Download Excel template for this section"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Paper Marks Status</p>
                  <Badge variant="secondary">
                    {singleStatus.replace(/_/g, ' ') || 'NOT STARTED'}
                  </Badge>
                  {singleSub?.status === 'CORRECTION_REQUIRED' && singleSub?.reopen_reason && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      <b>Reopened:</b> {singleSub.reopen_reason}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(myResponsibilities.includes('MARKS_ENTRY') || canOversee) && singleStatus !== 'LOCKED' && (
                    <>
                      <button
                        type="button"
                        onClick={() => navigate(`/courses/${paper.course_id}?tab=marks`)}
                        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        Enter Marks
                      </button>
                      {['NOT_STARTED', 'IN_PROGRESS', 'CORRECTION_REQUIRED'].includes(singleStatus) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleSubmitMarks(null)}
                          className="rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-semibold hover:bg-secondary/80 disabled:opacity-50"
                        >
                          Submit Marks
                        </button>
                      )}
                    </>
                  )}
                  {canOversee && singleStatus === 'SUBMITTED' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleLock(null)}
                      className="rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-semibold hover:bg-secondary/80 disabled:opacity-50"
                    >
                      Lock Marks
                    </button>
                  )}
                  {canOversee && ['SUBMITTED', 'LOCKED'].includes(singleStatus) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleReopen(null)}
                      className="rounded-xl border border-amber-500/40 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-500/5 disabled:opacity-50"
                    >
                      Reopen for Correction
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </PageTransition>
  );
}
