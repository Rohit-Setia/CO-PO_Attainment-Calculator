import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, UserPlus, Trash2, Loader2, Power } from 'lucide-react';
import { updateCourseStatus, assignFacultyToCourse, removeFacultyFromCourse, fetchCourseAssignments } from '../../Api/AttainmentApi';

const STATUS_OPTIONS = ['Active', 'Inactive', 'Archived'];

// Section 19/21/22/23 — course lifecycle status and faculty assignment, kept inline in the
// workspace an Admin/course-owner is already looking at rather than a separate page. Reuses
// the existing /courses/:id/assign(ments) API (built in an earlier phase) — no new backend
// concept, just the first UI for it.
export default function CourseAdminPanel({ courseId, status, onStatusChanged, readOnly }) {
  const [savingStatus, setSavingStatus] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [email, setEmail] = useState('');
  const [assignedRole, setAssignedRole] = useState('Teacher');
  const [assigning, setAssigning] = useState(false);

  const loadAssignments = () => {
    setLoadingAssignments(true);
    fetchCourseAssignments(courseId)
      .then((res) => setAssignments(res.data.data || []))
      .catch(() => setAssignments([]))
      .finally(() => setLoadingAssignments(false));
  };

  useEffect(() => { loadAssignments(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [courseId]);

  const handleStatusChange = async (e) => {
    const nextStatus = e.target.value;
    setSavingStatus(true);
    try {
      await updateCourseStatus(courseId, nextStatus);
      toast.success(`Course marked ${nextStatus}.`);
      await onStatusChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status.');
    } finally {
      setSavingStatus(false);
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAssigning(true);
    try {
      const res = await assignFacultyToCourse(courseId, { email: email.trim(), assigned_role: assignedRole });
      toast.success(res.data.message || 'Faculty assigned.');
      setEmail('');
      loadAssignments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign faculty.');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (userId) => {
    try {
      await removeFacultyFromCourse(courseId, userId);
      toast.success('Assignment removed.');
      loadAssignments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove assignment.');
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Power className="h-4 w-4 text-primary" /> Course Status
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Inactive/Archived courses keep all historical marks and attainment — this never deletes data.
        </p>
        <select
          value={status || 'Active'}
          onChange={handleStatusChange}
          disabled={readOnly || savingStatus}
          className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-60"
        >
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="border-t border-border pt-4">
        <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" /> Faculty Assigned to this Course
        </h4>

        {loadingAssignments ? (
          <p className="mt-2 text-xs text-muted-foreground">Loading...</p>
        ) : assignments.length === 0 ? (
          <p className="mt-2 text-xs italic text-muted-foreground">No additional faculty assigned yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs">
                <span className="truncate">
                  <span className="font-semibold text-foreground">{a.name}</span>
                  <span className="text-muted-foreground"> — {a.assigned_role}</span>
                </span>
                {!readOnly && (
                  <button onClick={() => handleRemove(a.id)} className="shrink-0 text-muted-foreground transition hover:text-destructive" title="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!readOnly && (
          <form onSubmit={handleAssign} className="mt-3 flex flex-col gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@ctuniversity.in"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground"
            />
            <div className="flex gap-2">
              <select
                value={assignedRole}
                onChange={(e) => setAssignedRole(e.target.value)}
                className="flex-1 rounded-lg border border-input bg-background px-2 py-2 text-xs text-foreground"
              >
                <option value="Teacher">Teacher</option>
                <option value="Viewer">Viewer</option>
              </select>
              <button
                type="submit"
                disabled={assigning}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
              >
                {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                Assign
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
