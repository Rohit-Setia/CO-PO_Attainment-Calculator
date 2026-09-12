import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import { deleteTeacherRecord, fetchTeacherDeletionImpact } from '../../Api/adminApi';

// ─────────────────────────────────────────────────────────────────────────────
// Admin-only "Delete Teacher" confirmation flow.
//
// Deletion is a SOFT delete: the account leaves the directory and can no longer
// sign in, but every mark, enrollment, CO/PO mapping, question paper and audit
// row it produced stays in place. The dialog therefore shows two very different
// numbers — what still points at the teacher (must be reassigned) and what is
// being deliberately preserved (nothing is destroyed).
//
// The impact report is refetched on every open so counts are never stale, and
// the final action stays locked until the admin types DELETE.
// ─────────────────────────────────────────────────────────────────────────────

const CountList = ({ items, tone }) => (
  <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
    {items.map((i) => (
      <li key={i.key} className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-muted-foreground" title={i.label}>{i.label}</span>
        <span className={`shrink-0 font-bold tabular-nums ${i.count > 0 ? tone : 'text-muted-foreground/50'}`}>
          {i.count}
        </span>
      </li>
    ))}
  </ul>
);

// Turns an impact-request failure into something an admin can act on. A bare
// "could not load" is not enough: the two realistic causes look identical in the
// UI but need opposite fixes. A 404 means the running backend has no such route
// (a stale server process that predates the deletion endpoints), while a 403 means
// the signed-in role is not Admin. Both were seen in practice, so the status is
// always surfaced.
const describeImpactFailure = (err) => {
  const status = err?.response?.status;
  const serverMessage = err?.response?.data?.message;

  if (!status) {
    return 'Could not reach the server. Check that the backend is running.';
  }
  if (status === 404) {
    return 'The delete-teacher endpoints are not available on the running backend (404). The server needs to be restarted to pick them up.';
  }
  if (status === 401) {
    return 'Your session has expired. Sign in again and retry.';
  }
  if (status === 403) {
    return serverMessage || 'Only an Admin can view the dependency report.';
  }
  return serverMessage || `Could not load the dependency report (${status}).`;
};

export default function DeleteTeacherDialog({ open, onOpenChange, teacher, successors = [], onDeleted }) {
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reason, setReason] = useState('');
  const [reassignToId, setReassignToId] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadImpact = async () => {
    if (!teacher?.id) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetchTeacherDeletionImpact(teacher.id);
      setImpact(res.data?.data || null);
    } catch (err) {
      setImpact(null);
      setLoadError(describeImpactFailure(err));
    } finally {
      setLoading(false);
    }
  };

  // Reset everything and refetch whenever the dialog opens for a teacher.
  useEffect(() => {
    if (!open) return;
    setImpact(null);
    setReason('');
    setReassignToId('');
    setConfirmText('');
    loadImpact();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teacher?.id]);

  // The account being deleted can never be its own successor.
  const successorOptions = useMemo(
    () => successors.filter((s) => s.id !== teacher?.id && s.role === 'Teacher'),
    [successors, teacher?.id],
  );

  const blockers = impact?.blockers || [];
  const needsReassignment = Boolean(impact?.requiresReassignment);
  const preserved = impact?.historical?.items?.filter((i) => i.count > 0) || [];

  // canDelete=false with requiresReassignment=false means a reason the admin
  // cannot fix in this dialog (privileged account, already deleted) — hard stop.
  const hardBlocked = Boolean(impact) && impact.canDelete === false && !needsReassignment;

  const canSubmit = Boolean(impact)
    && !hardBlocked
    && confirmText.trim() === 'DELETE'
    && (!needsReassignment || Boolean(reassignToId))
    && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await deleteTeacherRecord(teacher.id, {
        confirm: 'DELETE',
        reason: reason.trim() || undefined,
        reassignToId: needsReassignment ? Number(reassignToId) : undefined,
      });
      toast.success(res.data?.message || `${teacher.name} has been removed from the directory.`);
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      const data = err.response?.data;
      toast.error(data?.message || 'Delete failed. The teacher was not removed.');
      // A 409 means the situation moved since the report was built — refresh so
      // the admin sees the real blockers rather than a stale list.
      if (data?.code === 'ACTIVE_ASSIGNMENTS' || data?.code === 'ALREADY_DELETED') loadImpact();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-4 w-4" /> Delete teacher
          </DialogTitle>
          <DialogDescription>
            {teacher?.name} · {teacher?.email}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking what depends on this account…
          </div>
        )}

        {!loading && loadError && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p>{loadError}</p>
              <button type="button" onClick={loadImpact} className="mt-1 text-xs font-semibold underline">
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && impact && (
          <div className="space-y-4">
            {hardBlocked && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>{impact.reasons.map((r) => <p key={r}>{r}</p>)}</div>
              </div>
            )}

            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Active responsibilities
              </p>
              <CountList items={impact.active.items} tone="text-destructive" />
              {blockers.length > 0 && (
                <p className="mt-2 text-xs text-destructive">
                  {blockers.length} active item type(s) must move to another teacher before this account can be removed.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Preserved history — not deleted
              </p>
              {preserved.length === 0
                ? <p className="text-xs text-muted-foreground">No academic records attached to this account yet.</p>
                : <CountList items={preserved} tone="text-emerald-600" />}
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                Student marks, CO/PO attainment and audit entries stay attributed to this teacher so past
                reports remain reproducible.
              </p>
            </div>

            {needsReassignment && (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Reassign active work to <span className="text-destructive">*</span>
                </label>
                <select
                  value={reassignToId}
                  onChange={(e) => setReassignToId(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select a teacher…</option>
                  {successorOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.email}){s.department_name ? ` — ${s.department_name}` : ''}
                    </option>
                  ))}
                </select>
                {successorOptions.length === 0 && (
                  <p className="mt-1 text-xs text-destructive">
                    No other active teacher is available to take over. Create or restore one first.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Reason <span className="font-normal normal-case">(optional — stored in the audit log)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={255}
                placeholder="e.g. Left the institution, effective July 2026"
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Type <span className="font-mono text-destructive">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                placeholder="DELETE"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={canSubmit ? undefined : 'Type DELETE to enable this action'}
            className="flex items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-white transition hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {needsReassignment ? 'Reassign & delete' : 'Delete teacher'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
