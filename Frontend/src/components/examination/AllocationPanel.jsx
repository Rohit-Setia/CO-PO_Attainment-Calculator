// ─────────────────────────────────────────────────────────────────────────────
// Examination Cell — campaign selection + bulk teacher allocation.
//
// The whole point of this panel is that a Cell allocating 350 responsibilities
// never clicks "assign teacher" 350 times. The loop is:
//   pick/create an examination → download a PRE-FILLED template (one row per
//   uploaded paper × class) → type teacher emails → upload → read the validation
//   preview → import only the valid rows.
//
// Nothing is written until Import is pressed, and the server re-validates the file
// at import time, so the preview is a report rather than a promise.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Download, Upload, Loader2, Plus, CheckCircle2, AlertTriangle, FileSpreadsheet, ArrowRight,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { fetchSessions } from '../../Api/AttainmentApi';
import {
  fetchExaminations, createExamination, fetchExamination,
  downloadAllocationTemplate, previewAllocation, importAllocation, downloadAllocationErrors,
} from '../../Api/examinationApi';

const saveBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(new Blob([blob]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const STATUS_TONE = {
  DRAFT: 'bg-slate-500/15 text-slate-600',
  ACTIVE: 'bg-emerald-500/15 text-emerald-600',
  COMPLETED: 'bg-indigo-500/15 text-indigo-600',
  ARCHIVED: 'bg-slate-500/15 text-slate-500',
};

const OUTCOME_TONE = {
  create: 'bg-emerald-500/15 text-emerald-600',
  alreadyExisting: 'bg-slate-500/15 text-slate-600',
  invalid: 'bg-red-500/15 text-red-600',
};

const OUTCOME_LABEL = { create: 'Will import', alreadyExisting: 'Unchanged', invalid: 'Error' };

const inputClass = 'rounded-xl border border-border bg-background px-3 py-2 text-sm';

export default function AllocationPanel() {
  const fileInputRef = useRef(null);

  const [examinations, setExaminations] = useState([]);
  const [examinationId, setExaminationId] = useState('');
  const [progress, setProgress] = useState(null);
  const [sessions, setSessions] = useState([]);

  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ name: '', code: '', examType: 'ETT', academicSessionId: '', startDate: '', endDate: '' });
  const [creating, setCreating] = useState(false);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rowFilter, setRowFilter] = useState('all');

  const loadExaminations = useCallback(async () => {
    try {
      const res = await fetchExaminations();
      const rows = res.data?.data || [];
      setExaminations(rows);
      setExaminationId((current) => current || (rows[0] ? String(rows[0].id) : ''));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load examinations.');
    }
  }, []);

  useEffect(() => { loadExaminations(); }, [loadExaminations]);
  useEffect(() => { fetchSessions().then((r) => setSessions(r.data?.data || r.data || [])).catch(() => {}); }, []);

  useEffect(() => {
    if (!examinationId) { setProgress(null); return; }
    fetchExamination(examinationId)
      .then((r) => setProgress(r.data?.data?.progress || null))
      .catch(() => setProgress(null));
  }, [examinationId]);

  // Switching examination invalidates a preview built against the previous one.
  useEffect(() => { setPreview(null); setFile(null); }, [examinationId]);

  const selected = examinations.find((e) => String(e.id) === String(examinationId));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!draft.name.trim()) { toast.error('Give the examination a name.'); return; }
    setCreating(true);
    try {
      const res = await createExamination({
        ...draft,
        academicSessionId: draft.academicSessionId || null,
        startDate: draft.startDate || null,
        endDate: draft.endDate || null,
        status: 'ACTIVE',
      });
      const created = res.data.data;
      toast.success(`Examination "${created.name}" created.`);
      setShowCreate(false);
      setDraft({ name: '', code: '', examType: 'ETT', academicSessionId: '', startDate: '', endDate: '' });
      await loadExaminations();
      setExaminationId(String(created.id));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not create the examination.');
    } finally {
      setCreating(false);
    }
  };

  const handleTemplate = async () => {
    try {
      const blob = await downloadAllocationTemplate(examinationId);
      saveBlob(blob, `allocation_${(selected?.code || selected?.name || 'examination').replace(/[^a-zA-Z0-9._-]/g, '_')}.xlsx`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not build the template.');
    }
  };

  const handleValidate = async () => {
    if (!file) { toast.error('Choose an allocation file first.'); return; }
    setValidating(true);
    setPreview(null);
    try {
      const res = await previewAllocation(examinationId, file);
      const data = res.data.data;
      setPreview(data);
      if (data.headerError) toast.error(data.headerError);
      else if (data.summary.errorRows > 0) toast.warning(`${data.summary.validRows} valid, ${data.summary.errorRows} with errors.`);
      else toast.success(`All ${data.summary.totalRows} row(s) valid.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Validation failed.');
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const res = await importAllocation(examinationId, file);
      const { summary } = res.data.data;
      toast.success(`Imported ${summary.importedRows} row(s) — ${summary.assignmentsCreated} assignment(s) created.`);
      setPreview({ ...res.data.data, examination: selected });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchExamination(examinationId).then((r) => setProgress(r.data?.data?.progress || null)).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed — nothing was written.');
    } finally {
      setImporting(false);
    }
  };

  const handleErrorFile = async () => {
    try {
      const blob = await downloadAllocationErrors(examinationId, preview.rows);
      saveBlob(blob, 'allocation_errors.xlsx');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not build the error file.');
    }
  };

  const visibleRows = (preview?.rows || []).filter((r) => (rowFilter === 'all' ? true : r.outcome === rowFilter));

  return (
    <div className="space-y-6">
      {/* ── Examination selection ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground">Examination</h3>
            <p className="text-sm text-muted-foreground">
              Every question paper and every allocation belongs to one examination.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary"
          >
            <Plus className="h-4 w-4" /> New examination
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Name</label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="End Term Examination – December 2026" className={`${inputClass} w-72`} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Code</label>
              <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                placeholder="ETT2026" className={`${inputClass} w-32`} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Component</label>
              <select value={draft.examType} onChange={(e) => setDraft({ ...draft, examType: e.target.value })} className={inputClass}>
                <option value="ETT">ETT (External)</option>
                <option value="MTT">MTT (Internal)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Session</label>
              <select value={draft.academicSessionId} onChange={(e) => setDraft({ ...draft, academicSessionId: e.target.value })} className={inputClass}>
                <option value="">—</option>
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <button type="submit" disabled={creating}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create
            </button>
          </form>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <select value={examinationId} onChange={(e) => setExaminationId(e.target.value)} className={`${inputClass} w-96`}>
            <option value="">Select an examination…</option>
            {examinations.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}{e.code ? ` (${e.code})` : ''} — {e.exam_type}
              </option>
            ))}
          </select>
          {selected && (
            <>
              <Badge className={STATUS_TONE[selected.status] || ''}>{selected.status}</Badge>
              <span className="text-sm text-muted-foreground">
                {selected.paper_count} paper(s) · {selected.assignment_count} allocation(s)
              </span>
            </>
          )}
        </div>

        {progress && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ['Papers', progress.papers.total],
              ['In review', progress.papers.in_review],
              ['Approved', progress.papers.approved],
              ['Marks submitted', progress.marks.submitted],
              ['Marks locked', progress.marks.finalized],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-background p-3">
                <p className="text-xl font-extrabold text-foreground">{Number(value ?? 0)}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Allocation upload ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-1 text-base font-bold text-foreground">Bulk Teacher Allocation</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          One row per subject, paper set and class — each carrying that class&apos;s Paper Reviewer and Marks
          Evaluator, who do not have to be the same person. The template comes pre-filled with every uploaded
          paper crossed with its classes, so only the two teacher columns need typing.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={handleTemplate} disabled={!examinationId}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-secondary disabled:opacity-50">
            <Download className="h-4 w-4" /> Download template
          </button>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!examinationId}
            className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold hover:bg-secondary disabled:opacity-50">
            <FileSpreadsheet className="h-4 w-4" /> {file ? file.name : 'Choose allocation file'}
          </button>
          <button type="button" onClick={handleValidate} disabled={!file || validating}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-secondary disabled:opacity-50">
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {validating ? 'Validating…' : 'Validate'}
          </button>
        </div>

        {preview && !preview.headerError && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Total rows', preview.summary.totalRows, 'text-foreground'],
                ['Valid', preview.summary.validRows, 'text-emerald-600'],
                ['Errors', preview.summary.errorRows, 'text-red-600'],
                ['Already allocated', preview.summary.alreadyExisting, 'text-muted-foreground'],
              ].map(([label, value, tone]) => (
                <div key={label} className="rounded-xl border border-border bg-background p-3">
                  <p className={`text-2xl font-extrabold ${tone}`}>{value}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleImport}
                disabled={importing || !file || preview.summary.validRows === 0}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {importing
                  ? 'Importing…'
                  : `Import ${preview.summary.validRows} valid row(s) — ${preview.summary.assignmentsToCreate ?? 0} assignment(s)`}
              </button>
              {preview.summary.errorRows > 0 && (
                <button type="button" onClick={handleErrorFile}
                  className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-secondary">
                  <AlertTriangle className="h-4 w-4" /> Download {preview.summary.errorRows} error row(s)
                </button>
              )}
              <select value={rowFilter} onChange={(e) => setRowFilter(e.target.value)} className={inputClass}>
                <option value="all">All rows</option>
                <option value="create">Will import</option>
                <option value="invalid">Errors</option>
                <option value="alreadyExisting">Unchanged</option>
              </select>
            </div>

            <div className="max-h-96 overflow-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">Class</th>
                    <th className="px-3 py-2">Set</th>
                    <th className="px-3 py-2">Reviewer</th>
                    <th className="px-3 py-2">Evaluator</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No rows in this view.</td></tr>
                  )}
                  {visibleRows.map((r) => (
                    <tr key={r.rowNumber} className="border-b border-border/60 align-top">
                      <td className="px-3 py-2 text-muted-foreground">{r.rowNumber}</td>
                      <td className="px-3 py-2 font-semibold text-foreground">
                        {r.resolved.subjectName || r.data.subject || r.data.courseCode || '—'}
                        <span className="block text-xs font-normal text-muted-foreground">{r.data.courseCode}</span>
                      </td>
                      <td className="px-3 py-2">{r.resolved.classLabel || r.data.section || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.resolved.paperSet || r.data.paperSet || '—'}</td>
                      <td className="px-3 py-2">{r.resolved.reviewer?.name || r.data.reviewer || '—'}</td>
                      <td className="px-3 py-2">{r.resolved.evaluator?.name || r.data.evaluator || '—'}</td>
                      <td className="px-3 py-2">
                        <Badge className={OUTCOME_TONE[r.outcome] || ''}>{OUTCOME_LABEL[r.outcome] || r.outcome}</Badge>
                        {r.outcome === 'invalid' && (
                          <ul className="mt-1 list-disc pl-4 text-xs text-red-600">
                            {r.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {preview?.headerError && (
          <div className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-600">
            {preview.headerError}
          </div>
        )}
      </div>
    </div>
  );
}
