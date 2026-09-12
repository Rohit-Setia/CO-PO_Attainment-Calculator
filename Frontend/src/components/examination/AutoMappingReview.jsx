import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, CheckCircle2, Info, Loader2, Pencil, Plus, RotateCcw, ShieldCheck, Sparkles, Trash2, Wand2, XCircle,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  fetchPaperDraft, savePaperDraft, suggestPaperMapping, confirmPaperMapping,
} from '../../Api/examinationApi';

// Auto-Mapping Review screen: what extraction read from an uploaded paper, before it is
// published. Edits autosave to the server, which returns the verdicts (Needs Review,
// issues, canPublish) — this component renders them and never decides them itself.

const RBT_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const SAVE_DELAY_MS = 700;
const EDITABLE_FIELDS = ['key', 'section', 'label', 'questionText', 'maxMarks', 'coNumber', 'coSource', 'rbtLevel', 'rbtSource', 'choiceGroup', 'reviewed', 'removed'];

const SOURCE_LABEL = {
  paper: ['Paper', 'bg-emerald-500/10 text-emerald-700'],
  instruction: ['Instruction', 'bg-sky-500/10 text-sky-700'],
  manual: ['Edited', 'bg-indigo-500/10 text-indigo-700'],
  ai: ['AI · accepted', 'bg-violet-500/10 text-violet-700'],
  heuristic: ['Keywords · accepted', 'bg-violet-500/10 text-violet-700'],
};
const SEVERITY_STYLE = {
  error: ['text-red-600', XCircle],
  warning: ['text-amber-600', AlertTriangle],
  info: ['text-muted-foreground', Info],
};
const FORMAT_LABEL = { pdf: 'PDF · read from text layout', 'docx-text': 'Word · read from text', docx: 'Word · read from tables', xlsx: 'Excel', csv: 'CSV' };
const SAVE_LABEL = { saving: 'Saving…', dirty: 'Unsaved changes', saved: 'All changes saved', error: 'Save failed' };

const toPayloadRow = (row) => Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, row[field] ?? null]));

const describeSources = (counts = {}) => Object.entries(counts)
  .filter(([source]) => source !== 'missing')
  .map(([source, n]) => `${n} ${(SOURCE_LABEL[source]?.[0] || source).toLowerCase()}`)
  .join(', ') || '—';

function SourceChip({ source }) {
  if (!SOURCE_LABEL[source]) return null;
  const [label, tone] = SOURCE_LABEL[source];
  return <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>{label}</span>;
}

function IssueList({ issues, className = '' }) {
  if (!issues?.length) return null;
  return (
    <ul className={`space-y-1 ${className}`}>
      {issues.map((issue, i) => {
        const [tone, Icon] = SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE.info;
        return (
          <li key={`${issue.code}-${i}`} className={`flex items-start gap-1.5 text-xs ${tone}`}>
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{issue.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

function SuggestionButton({ label, confidence, engine, onUse }) {
  return (
    <button
      type="button" onClick={onUse}
      className="mt-1 flex items-center gap-1 rounded-lg border border-dashed border-violet-500/50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-500/10"
    >
      <Sparkles className="h-3 w-3" /> Use {label}
      <span className="font-normal opacity-80">· {confidence || 'low'} · {engine === 'ai' ? 'AI' : 'keywords'}</span>
    </button>
  );
}

export default function AutoMappingReview({ paperId, onPublished }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ maxMarks: null, durationMinutes: null });
  const [saveState, setSaveState] = useState('saved');
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false);
  const [editingText, setEditingText] = useState(null);
  const [suggesting, setSuggesting] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const rowsRef = useRef([]);
  const metaRef = useRef(meta);
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const editSeqRef = useRef(0);
  const inFlightRef = useRef(null);
  const timerRef = useRef(null);

  const adopt = useCallback((payload, replaceLocal = true) => {
    setData(payload);
    revisionRef.current = payload.draft.revision;
    if (!replaceLocal) return;
    rowsRef.current = payload.draft.rows;
    setRows(payload.draft.rows);
    const nextMeta = { maxMarks: payload.draft.meta.maxMarks, durationMinutes: payload.draft.meta.durationMinutes };
    metaRef.current = nextMeta;
    setMeta(nextMeta);
  }, []);

  const load = useCallback(async () => {
    clearTimeout(timerRef.current);
    dirtyRef.current = false;
    try {
      const res = await fetchPaperDraft(paperId);
      adopt(res.data.data);
      setSaveState('saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load the auto-mapping draft.');
    } finally {
      setLoading(false);
    }
  }, [paperId, adopt]);

  useEffect(() => {
    load();
    return () => clearTimeout(timerRef.current);
  }, [load]);

  // Sends the local rows; if more edits arrived while saving, only the verdicts are
  // adopted and the pending timer saves again.
  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (inFlightRef.current) await inFlightRef.current;
    if (!dirtyRef.current) return true;
    dirtyRef.current = false;
    const seq = editSeqRef.current;
    setSaveState('saving');
    const run = savePaperDraft(paperId, {
      revision: revisionRef.current,
      meta: metaRef.current,
      rows: rowsRef.current.map(toPayloadRow),
    })
      .then((res) => {
        const current = seq === editSeqRef.current;
        adopt(res.data.data, current);
        setSaveState(current ? 'saved' : 'dirty');
        return true;
      })
      .catch(async (err) => {
        toast.error(err.response?.data?.message || 'Could not save your changes — the latest draft was reloaded.');
        setSaveState('error');
        await load();
        return false;
      })
      .finally(() => { inFlightRef.current = null; });
    inFlightRef.current = run;
    return run;
  }, [paperId, adopt, load]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    editSeqRef.current += 1;
    setSaveState('dirty');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { flush(); }, SAVE_DELAY_MS);
  }, [flush]);

  const setAllRows = useCallback((next) => {
    rowsRef.current = next;
    setRows(next);
    markDirty();
  }, [markDirty]);

  const updateRow = useCallback((key, patch) => {
    setAllRows(rowsRef.current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }, [setAllRows]);

  const updateMeta = (field, value) => {
    const next = { ...metaRef.current, [field]: value };
    metaRef.current = next;
    setMeta(next);
    markDirty();
  };

  const addRow = (section) => {
    const current = rowsRef.current;
    const inSection = current.filter((row) => row.section === section && !row.removed);
    const nextNumber = inSection.reduce((max, row) => Math.max(max, parseInt(row.label, 10) || 0), 0) + 1;
    const groups = new Set(inSection.map((row) => row.choiceGroup));
    const lastIndex = current.map((row) => row.section).lastIndexOf(section);
    const insertAt = lastIndex >= 0 ? lastIndex + 1 : current.length;
    const row = {
      key: `new-${Date.now()}`, section, label: String(nextNumber), questionText: '',
      maxMarks: null, marksSource: null, coNumber: null, coSource: null, rbtLevel: null, rbtSource: null,
      choiceGroup: groups.size === 1 ? [...groups][0] : null,
      reviewed: false, removed: false, manual: true, extracted: null, suggestion: null, flags: [],
    };
    setEditingText(row.key);
    setAllRows([...current.slice(0, insertAt), row, ...current.slice(insertAt)]);
  };

  const runSuggestions = async (engine) => {
    setSuggesting(engine);
    try {
      if (!(await flush())) return;
      const res = await suggestPaperMapping(paperId, engine);
      adopt(res.data.data);
      const run = res.data.data.draft.suggestionRun;
      if (res.data.message) toast.info(res.data.message);
      else if (run?.error) toast.warning(run.error);
      else toast.success(`Suggestions ready for ${run?.count || 0} question(s) — accept or change each one.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not get suggestions.');
    } finally {
      setSuggesting(null);
    }
  };

  const openConfirm = async () => {
    if (await flush()) setConfirmOpen(true);
  };

  const publish = async () => {
    setPublishing(true);
    try {
      await confirmPaperMapping(paperId, revisionRef.current);
      toast.success('Mapping confirmed — the questions are now published for this paper.');
      setConfirmOpen(false);
      onPublished?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Publishing failed.');
      setConfirmOpen(false);
      if (err.response?.data?.data?.draft) adopt(err.response.data.data);
      else if (err.response?.status === 409) await load();
    } finally {
      setPublishing(false);
    }
  };

  const sections = useMemo(() => {
    const order = [];
    rows.forEach((row) => { if (!row.removed && !order.includes(row.section)) order.push(row.section); });
    return order.map((code) => ({
      code,
      info: data?.draft.sections.find((s) => s.code === code) || null,
      rows: rows.filter((row) => !row.removed && row.section === code),
    }));
  }, [rows, data]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the auto-mapping…
      </div>
    );
  }
  if (!data) {
    return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">The auto-mapping draft could not be loaded.</div>;
  }

  const {
    paper, draft, review, course, ai,
  } = data;
  const { summary } = review;
  const paperIssues = review.paper.filter((issue) => issue.code !== 'EXTRACTION_NOTE');
  const notes = review.paper.filter((issue) => issue.code === 'EXTRACTION_NOTE');
  const warnings = review.paper.filter((issue) => issue.severity === 'warning');
  const removedRows = rows.filter((row) => row.removed);
  const missingCount = rows.filter((row) => !row.removed && (row.coNumber === null || !row.rbtLevel)).length;
  const coChoices = course.outcomes.length ? course.outcomes.map((o) => o.coNumber) : Array.from({ length: 10 }, (_, i) => i + 1);
  const metaItems = [
    ['Exam', draft.meta.examName],
    ['School', draft.meta.school],
    ['Program', draft.meta.program],
    ['Semester', draft.meta.semester],
    ['Subject (paper)', [draft.meta.subjectCode, draft.meta.subjectName].filter(Boolean).join(' — ')],
    ['Course (selected)', [course.courseCode, course.subjectName].filter(Boolean).join(' — ')],
  ];

  const renderRow = (row) => {
    const verdict = review.rows[row.key] || { status: 'ready', issues: [], checkable: false };
    if (onlyNeedsReview && verdict.status !== 'needs_review') return null;
    const suggestion = row.suggestion;
    const needsReview = verdict.status === 'needs_review';
    const edited = row.extracted && row.questionText !== row.extracted.questionText;
    const inputClass = 'rounded-lg border bg-background px-2 py-1 text-sm';

    return (
      <tr key={row.key} className={`border-b border-border/60 align-top ${needsReview ? 'bg-red-500/[0.04]' : ''}`}>
        <td className="px-2 py-2">
          <input
            aria-label="Question number" value={row.label ?? ''}
            onChange={(e) => updateRow(row.key, { label: e.target.value })}
            className={`w-14 font-semibold ${inputClass} border-border`}
          />
          {row.choiceGroup && <p className="mt-1 text-[10px] text-muted-foreground">choice</p>}
        </td>
        <td className="min-w-[18rem] px-2 py-2">
          {editingText === row.key ? (
            <>
              <textarea
                autoFocus rows={3} aria-label="Question text" value={row.questionText}
                onChange={(e) => updateRow(row.key, { questionText: e.target.value })}
                onBlur={() => setEditingText(null)}
                className={`w-full ${inputClass} border-border`}
              />
              {edited && <p className="mt-1 text-xs text-muted-foreground">Original: {row.extracted.questionText}</p>}
            </>
          ) : (
            <button type="button" onClick={() => setEditingText(row.key)} className="group w-full text-left text-sm text-foreground">
              {row.questionText || <span className="italic text-muted-foreground">No question text — click to add</span>}
              <Pencil className="ml-1 inline h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
              {edited && <span className="ml-1 rounded bg-indigo-500/10 px-1 text-[10px] font-semibold text-indigo-700">edited</span>}
            </button>
          )}
        </td>
        <td className="px-2 py-2">
          <input
            type="number" min="0.5" step="0.5" aria-label="Marks" value={row.maxMarks ?? ''}
            onChange={(e) => updateRow(row.key, { maxMarks: e.target.value === '' ? null : Number(e.target.value) })}
            className={`w-16 ${inputClass} ${row.maxMarks === null ? 'border-red-500/60' : 'border-border'}`}
          />
          <div><SourceChip source={row.marksSource} /></div>
        </td>
        <td className="px-2 py-2">
          <select
            aria-label="CO" value={row.coNumber ?? ''}
            onChange={(e) => updateRow(row.key, { coNumber: e.target.value === '' ? null : Number(e.target.value), coSource: 'manual' })}
            className={`${inputClass} ${row.coNumber === null ? 'border-red-500/60' : 'border-border'}`}
          >
            <option value="">Needs Review</option>
            {coChoices.map((n) => <option key={n} value={n}>CO{n}</option>)}
            {row.coNumber !== null && !coChoices.includes(row.coNumber) && <option value={row.coNumber}>CO{row.coNumber} (not in course)</option>}
          </select>
          <div><SourceChip source={row.coSource} /></div>
          {row.coSource === 'paper' && row.extracted?.coKind === 'ocr' && <p className="text-[10px] text-amber-700">read as “{row.extracted.coRaw}”</p>}
          {row.coNumber === null && suggestion?.coNumber != null && (
            <SuggestionButton
              label={`CO${suggestion.coNumber}`} confidence={suggestion.coConfidence} engine={suggestion.engine}
              onUse={() => updateRow(row.key, { coNumber: suggestion.coNumber, coSource: suggestion.engine })}
            />
          )}
        </td>
        <td className="px-2 py-2">
          <select
            aria-label="RBT level" value={row.rbtLevel ?? ''}
            onChange={(e) => updateRow(row.key, { rbtLevel: e.target.value || null, rbtSource: 'manual' })}
            className={`${inputClass} ${!row.rbtLevel ? 'border-red-500/60' : 'border-border'}`}
          >
            <option value="">Needs Review</option>
            {RBT_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
          <div><SourceChip source={row.rbtSource} /></div>
          {row.rbtSource === 'paper' && row.extracted?.rbtKind === 'typo' && <p className="text-[10px] text-amber-700">read as “{row.extracted.rbtRaw}”</p>}
          {!row.rbtLevel && suggestion?.rbtLevel && (
            <SuggestionButton
              label={suggestion.rbtLevel} confidence={suggestion.rbtConfidence} engine={suggestion.engine}
              onUse={() => updateRow(row.key, { rbtLevel: suggestion.rbtLevel, rbtSource: suggestion.engine })}
            />
          )}
        </td>
        <td className="min-w-[15rem] px-2 py-2">
          {needsReview
            ? <Badge className="bg-red-500/15 text-red-600">Needs Review</Badge>
            : <Badge className="bg-emerald-500/15 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Ready</Badge>}
          <IssueList issues={verdict.issues.filter((issue) => issue.severity !== 'info')} className="mt-1.5" />
          {suggestion?.rationale && (row.coNumber === null || !row.rbtLevel) && (
            <p className="mt-1 text-[11px] text-violet-700">Suggestion basis: {suggestion.rationale}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {verdict.checkable && (
              <label className="flex items-center gap-1 text-xs font-medium text-foreground">
                <input type="checkbox" checked={!!row.reviewed} onChange={(e) => updateRow(row.key, { reviewed: e.target.checked })} />
                Checked against the paper
              </label>
            )}
            <button type="button" onClick={() => updateRow(row.key, { removed: true })} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600">
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground">Auto-Mapping Review</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Check what was read from the paper. Nothing is published until you Confirm &amp; Publish.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{FORMAT_LABEL[draft.format] || draft.format}</Badge>
            <span className={`text-xs ${saveState === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>
              {saveState === 'saving' && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
              {SAVE_LABEL[saveState]}
            </span>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {metaItems.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="text-foreground">{value || <span className="text-muted-foreground">Not found</span>}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Max Marks</dt>
            <dd>
              <input
                type="number" min="1" aria-label="Max marks" value={meta.maxMarks ?? ''}
                onChange={(e) => updateMeta('maxMarks', e.target.value === '' ? null : Number(e.target.value))}
                className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm"
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duration (minutes)</dt>
            <dd>
              <input
                type="number" min="1" aria-label="Duration in minutes" value={meta.durationMinutes ?? ''}
                onChange={(e) => updateMeta('durationMinutes', e.target.value === '' ? null : Number(e.target.value))}
                className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm"
              />
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{summary.total} questions</Badge>
          <Badge className="bg-emerald-500/15 text-emerald-600">{summary.ready} ready</Badge>
          <Badge className={summary.needsReview ? 'bg-red-500/15 text-red-600' : 'bg-emerald-500/15 text-emerald-600'}>{summary.needsReview} need review</Badge>
          <Badge variant="secondary">{summary.attemptableTotal ?? '—'} / {summary.maxMarks ?? '—'} marks attemptable</Badge>
        </div>

        {paperIssues.length > 0 && <IssueList issues={paperIssues} className="mt-4" />}
        {notes.length > 0 && <IssueList issues={notes} className="mt-2" />}

        {missingCount > 0 && (
          <div className="mt-4 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
            <p className="text-sm text-foreground">
              <b>{missingCount}</b> question(s) have no CO or RBT level printed in the paper. Suggestions appear beside each
              row — nothing is applied until you accept it.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ai.available && (
                <button
                  type="button" disabled={!!suggesting} onClick={() => runSuggestions('ai')}
                  className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {suggesting === 'ai' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Suggest with AI
                </button>
              )}
              <button
                type="button" disabled={!!suggesting} onClick={() => runSuggestions('heuristic')}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-1.5 text-xs font-semibold hover:bg-secondary/80 disabled:opacity-50"
              >
                {suggesting === 'heuristic' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Keyword suggestions
              </button>
            </div>
            {draft.suggestionRun && (
              <p className="mt-2 text-xs text-muted-foreground">
                Last run: {draft.suggestionRun.engine === 'ai' ? `AI (${draft.suggestionRun.model})` : 'keyword engine'} · {new Date(draft.suggestionRun.at).toLocaleString()}
                {draft.suggestionRun.error ? ` — ${draft.suggestionRun.error}` : ''}
              </p>
            )}
            {ai.available && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                “Suggest with AI” sends these questions’ text and the course’s CO descriptions to the configured AI service.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-foreground">Questions</h3>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={onlyNeedsReview} onChange={(e) => setOnlyNeedsReview(e.target.checked)} />
            Show only Needs Review
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2">Q.No.</th>
                <th className="px-2 py-2">Question</th>
                <th className="px-2 py-2">Marks</th>
                <th className="px-2 py-2">CO</th>
                <th className="px-2 py-2">RBT Level</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            {sections.map(({ code, info, rows: sectionRows }) => (
              <tbody key={code ?? 'none'}>
                <tr className="bg-muted/40">
                  <td colSpan={6} className="px-2 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-bold text-foreground">{code ? `Section ${code}` : 'Questions'}</span>
                        {info && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {[
                              info.marksPerQuestion ? `${info.marksPerQuestion} marks each` : null,
                              info.choice ? `attempt ${info.choice.attempt}${info.choice.offered ? ` of ${info.choice.offered}` : ''}` : null,
                              info.formula?.raw ? `“${info.formula.raw}”` : null,
                            ].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                      <button type="button" onClick={() => addRow(code)} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold hover:bg-secondary">
                        <Plus className="h-3 w-3" /> Add question
                      </button>
                    </div>
                  </td>
                </tr>
                {sectionRows.map(renderRow)}
              </tbody>
            ))}
          </table>
        </div>
        {sections.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No questions left.{' '}
            <button type="button" onClick={() => addRow(null)} className="font-semibold text-foreground underline">Add a question</button>
          </div>
        )}
        {removedRows.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Removed ({removedRows.length})</p>
            <ul className="space-y-1">
              {removedRows.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground line-through">{row.section ? `${row.section}-` : ''}{row.label} {row.questionText}</span>
                  <button type="button" onClick={() => updateRow(row.key, { removed: false })} className="flex shrink-0 items-center gap-1 text-xs font-semibold hover:underline">
                    <RotateCcw className="h-3 w-3" /> Restore
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
        <p className="text-sm text-foreground">
          {review.canPublish
            ? 'Every question has a confirmed CO, RBT level and marks.'
            : `${summary.needsReview} question(s) need review before this paper can be published.`}
        </p>
        <button
          type="button" onClick={openConfirm}
          disabled={!review.canPublish || publishing || saveState === 'saving' || !!suggesting}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <ShieldCheck className="h-4 w-4" /> Confirm &amp; Publish
        </button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!publishing) setConfirmOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm &amp; publish this mapping?</DialogTitle>
            <DialogDescription>
              {summary.total} question(s), {summary.attemptableTotal ?? '—'} attemptable marks
              {summary.maxMarks ? ` of ${summary.maxMarks}` : ''}, become the {paper.exam_type} question configuration
              for {course.courseCode}. Assigned reviewers can still correct individual rows afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 rounded-xl border border-border bg-muted/30 p-3 text-xs text-foreground">
            <p><b>CO:</b> {describeSources(summary.sources.co)}</p>
            <p><b>RBT:</b> {describeSources(summary.sources.rbt)}</p>
            <p><b>Marks:</b> {describeSources(summary.sources.marks)}</p>
          </div>
          {warnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="mb-1.5 text-xs font-semibold text-amber-700">Publishing despite these warnings:</p>
              <IssueList issues={warnings} />
            </div>
          )}
          <DialogFooter>
            <button
              type="button" onClick={() => setConfirmOpen(false)} disabled={publishing}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button" onClick={publish} disabled={publishing || !review.canPublish}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {publishing && <Loader2 className="h-4 w-4 animate-spin" />} Confirm &amp; Publish
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
