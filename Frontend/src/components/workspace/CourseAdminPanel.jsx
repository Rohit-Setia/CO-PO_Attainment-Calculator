import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, UserPlus, Trash2, Loader2, Power, Search, Check } from 'lucide-react';
import {
  updateCourseStatus,
  assignFacultyToCourse,
  removeFacultyFromCourse,
  fetchCourseAssignments,
  searchFacultyUsers,
} from '../../Api/AttainmentApi';

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

  // Gmail-style autocomplete dropdown state
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const searchTimerRef = useRef(null);

  // Click outside to close autocomplete
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (val) => {
    setEmail(val);
    if (!val.trim() || val.trim().length < 1) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setLoadingSuggestions(true);
    setShowDropdown(true);

    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await searchFacultyUsers(val.trim());
        setSuggestions(res.data?.data || []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 250);
  };

  const handleSelectFaculty = (faculty) => {
    setEmail(faculty.email);
    setShowDropdown(false);
  };

  const loadAssignments = () => {
    setLoadingAssignments(true);
    fetchCourseAssignments(courseId)
      .then((res) => setAssignments(res.data.data || []))
      .catch(() => setAssignments([]))
      .finally(() => setLoadingAssignments(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAssignments(); }, [courseId]);

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
            <div className="relative" ref={dropdownRef}>
              <input
                type="text"
                value={email}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
                placeholder="Search faculty by name or email..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                autoComplete="off"
              />

              {/* Gmail-style dropdown */}
              {showDropdown && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-popover p-1 shadow-lg backdrop-blur-md">
                  {loadingSuggestions ? (
                    <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      Searching faculty...
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      No faculty found matching "{email}"
                    </div>
                  ) : (
                    suggestions.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectFaculty(user)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                          {(user.name || user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-foreground truncate">{user.name}</span>
                            <span className="shrink-0 text-[10px] text-muted-foreground rounded bg-secondary px-1.5 py-0.5">
                              {user.role}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
                          {user.department_name && (
                            <div className="text-[10px] text-muted-foreground/80 truncate">{user.department_name}</div>
                          )}
                        </div>
                        {email === user.email && (
                          <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

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
                disabled={assigning || !email.trim()}
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
