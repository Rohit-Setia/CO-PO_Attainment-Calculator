import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Upload, FileDown, Search, RefreshCw, Mail, Loader2, Users, Trash2, Archive, RotateCcw,
} from 'lucide-react';
import PageTransition from '../components/ui/PageTransition';
import { Badge } from '../components/ui/badge';
import DeleteTeacherDialog from '../components/admin/DeleteTeacherDialog';
import { useAuth } from '../context/AuthContext';
import { usePageHeader } from '../context/PageHeaderContext';
import {
  importTeachersFile,
  downloadTeacherImportTemplate,
  downloadTeacherImportErrors,
  fetchTeachers,
  resendTeacherCredential,
  restoreTeacherRecord,
} from '../Api/adminApi';

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

const EMPTY_SUMMARY = {
  totalRecords: 0, created: 0, alreadyExisting: 0,
  invalid: 0, duplicate: 0, failed: 0,
};

export default function TeacherManagementPage() {
  usePageHeader({ title: 'Teacher Management', subtitle: 'Bulk-import faculty accounts and manage the teacher directory' });

  // Deletion is Admin-only server-side too (authorizeRoles('Admin')) — HODs and
  // School/Department Admins can browse the directory but never remove accounts.
  const { user, hasRole } = useAuth();
  const canDelete = hasRole('Admin');

  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState(null); // last import summary
  const [createdAccounts, setCreatedAccounts] = useState([]);
  const [emailInfo, setEmailInfo] = useState(null);

  // Teacher directory
  const [teachers, setTeachers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active'); // 'active' | 'deleted'
  const [loadingList, setLoadingList] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Full active-teacher pool for the reassignment selector — the successor is
  // rarely on the page currently being viewed, so it is fetched separately.
  const [successors, setSuccessors] = useState([]);

  const loadSuccessors = useCallback(async () => {
    try {
      const res = await fetchTeachers({ page: 1, limit: 500, status: 'active' });
      setSuccessors(res.data?.data?.rows || []);
    } catch {
      setSuccessors([]); // non-fatal: the dialog just shows "no successor available"
    }
  }, []);

  const loadTeachers = useCallback(async (opts = {}) => {
    setLoadingList(true);
    try {
      const res = await fetchTeachers({
        page: opts.page ?? page,
        limit,
        search: opts.search ?? search,
        status: opts.status ?? status,
      });
      setTeachers(res.data?.data?.rows || []);
      setTotal(res.data?.data?.total || 0);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load the teacher directory.');
    } finally {
      setLoadingList(false);
    }
  }, [page, limit, search, status]);

  useEffect(() => { loadTeachers(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [page, status]);
  useEffect(() => { if (canDelete) loadSuccessors(); }, [canDelete, loadSuccessors]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error('Choose an Excel (.xlsx/.xls) or CSV file first.');
      return;
    }
    setImporting(true);
    try {
      const res = await importTeachersFile(selectedFile);
      const data = res.data?.data || {};
      setSummary(data.summary || EMPTY_SUMMARY);
      setCreatedAccounts(data.createdAccounts || []);
      setEmailInfo(data.emails || null);
      const s = data.summary || EMPTY_SUMMARY;
      toast.success(res.data?.message || `Imported ${s.created} teacher(s).`);
      setSelectedFile(null);
      setPage(1);
      setSearch('');
      loadTeachers({ page: 1, search: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed. Please check the file and try again.');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadTeacherImportTemplate();
      saveBlob(blob, 'teacher_import_template.xlsx');
    } catch {
      toast.error('Could not download the template.');
    }
  };

  const handleDownloadErrors = async () => {
    const errors = summary?.errors || [];
    if (errors.length === 0) return;
    try {
      const blob = await downloadTeacherImportErrors(errors);
      saveBlob(blob, 'teacher_import_errors.xlsx');
    } catch {
      toast.error('Could not download the error file.');
    }
  };

  const handleResend = async (teacher) => {
    setResendingId(teacher.id);
    try {
      const res = await resendTeacherCredential(teacher.id);
      toast.success(res.data?.message || 'Credential email sent.');
      loadTeachers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not resend the credential email.');
    } finally {
      setResendingId(null);
    }
  };
  const handleDeleted = async () => {
    await Promise.all([loadTeachers(), loadSuccessors()]);
  };

  const handleRestore = async (teacher) => {
    setRestoringId(teacher.id);
    try {
      const res = await restoreTeacherRecord(teacher.id);
      toast.success(res.data?.message || `${teacher.name} has been restored.`);
      await Promise.all([loadTeachers(), loadSuccessors()]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not restore this teacher.');
    } finally {
      setRestoringId(null);
    }
  };



  const totalPages = Math.max(Math.ceil(total / limit), 1);

  const summaryCards = summary ? [
    { label: 'Total Records', value: summary.totalRecords, tone: 'text-foreground' },
    { label: 'Created', value: summary.created, tone: 'text-emerald-600' },
    { label: 'Already Existing', value: summary.alreadyExisting, tone: 'text-sky-600' },
    { label: 'Invalid', value: summary.invalid, tone: 'text-red-600' },
    { label: 'Duplicates', value: summary.duplicate, tone: 'text-amber-600' },
    { label: 'Failed', value: summary.failed, tone: 'text-red-700' },
  ] : [];

  return (
    <PageTransition className="space-y-6">
      {/* ── Bulk import ── */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground">Bulk Teacher Import</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Upload an Excel/CSV with columns: Employee ID, Teacher Name, Email, Department, Designation, Phone, Username.
              Accounts are created instantly with the Teacher role and receive a credential email.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold transition hover:bg-secondary/80"
          >
            <FileDown className="h-3.5 w-3.5" /> Download Template
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary"
          >
            <Upload className="h-4 w-4" />
            {selectedFile ? selectedFile.name : 'Choose Excel / CSV file'}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || !selectedFile}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? 'Importing…' : 'Import Teachers'}
          </button>

        {/* Import summary */}
        {summary && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {summaryCards.map((c) => (
                <div key={c.label} className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                  <p className={`text-xl font-extrabold ${c.tone}`}>{c.value}</p>
                  <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</p>
                </div>
              ))}
            </div>

            {emailInfo && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                Credential emails queued: <b className="text-foreground">{emailInfo.queued}</b>
                {emailInfo.enabled
                  ? ' — sent via SMTP.'
                  : ' — SMTP is disabled, so they were logged on the server instead of delivered.'}
              </p>
            )}

            {createdAccounts.length > 0 && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-600">Created accounts</p>
                <div className="flex flex-wrap gap-2">
                  {createdAccounts.map((t) => (
                    <span key={t.id} className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs">
                      <b>{t.name}</b> · {t.username} · {t.email}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {summary.errors?.length > 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-600">
                    Skipped records ({summary.errors.length})
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadErrors}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold transition hover:bg-secondary"
                  >
                    <FileDown className="h-3.5 w-3.5" /> Download Error File
                  </button>
                </div>
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {summary.errors.map((e, i) => (
                    <div key={i} className="rounded-lg bg-card px-3 py-2 text-xs">
                      <b>Row {e.row}:</b>{' '}
                      <span className="text-muted-foreground">
                        {[e.data?.employeeId, e.data?.name, e.data?.email].filter(Boolean).join(' · ') || '—'}
                      </span>
                      <span className="ml-2 font-semibold text-red-600">{e.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
        </div>

      {/* ── Teacher directory ── */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Users className="h-4 w-4" /> Teacher Directory
            <span className="text-sm font-medium text-muted-foreground">({total})</span>
          </h3>

          {/* Active vs Archived — deleted teachers leave the default list so a
              stray name never resolves to a removed account. */}
          {canDelete && (
            <div className="flex rounded-xl border border-border bg-secondary/50 p-0.5">
              {[
                { key: 'active', label: 'Active', icon: Users },
                { key: 'deleted', label: 'Archived', icon: Archive },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setStatus(tab.key); setPage(1); }}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    status === tab.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" /> {tab.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                onKeyDown={(e) => { if (e.key === 'Enter') loadTeachers({ page: 1 }); }}
                placeholder="Search name, email, username, emp. id…"
                className="w-64 rounded-xl border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="button"
              onClick={() => loadTeachers()}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold transition hover:bg-secondary/80"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingList ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">Emp. ID</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingList && teachers.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!loadingList && teachers.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  {status === 'deleted' ? 'No deleted teachers.' : 'No teachers found.'}
                </td></tr>
              )}
              {teachers.map((t) => (
                <tr key={t.id} className="border-b border-border/60 hover:bg-muted/30">
                  <td className="px-3 py-2 font-semibold text-foreground">{t.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.email}</td>
                  <td className="px-3 py-2">{t.username || '—'}</td>
                  <td className="px-3 py-2">{t.employee_id || '—'}</td>
                  <td className="px-3 py-2">{t.department_name || '—'}</td>
                  <td className="px-3 py-2"><Badge variant="secondary">{t.role}</Badge></td>
                  <td className="px-3 py-2">
                    {t.deleted_at ? (
                      <Badge className="bg-muted text-muted-foreground" title={`Deleted ${t.deleted_at}`}>
                        Deleted
                      </Badge>
                    ) : t.is_active
                      ? <Badge className="bg-emerald-500/15 text-emerald-600">Active</Badge>
                      : <Badge className="bg-red-500/15 text-red-600">Inactive</Badge>}
                    {t.must_change_password && !t.deleted_at ? (
                      <span className="ml-1 text-[10px] font-bold uppercase text-amber-600">setup pending</span>
                    ) : null}
                    {t.deleted_at && t.delete_reason ? (
                      <div className="mt-0.5 max-w-[16rem] truncate text-[10px] text-muted-foreground" title={t.delete_reason}>
                        {t.delete_reason}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {!t.deleted_at && (
                        <button
                          type="button"
                          onClick={() => handleResend(t)}
                          disabled={resendingId === t.id}
                          title="Regenerate password-setup link and resend credential email"
                          className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold transition hover:bg-secondary disabled:opacity-50"
                        >
                          {resendingId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                          Resend
                        </button>
                      )}
                      {/* Admin only, and never on your own account — the server
                          rejects both, the UI just avoids the dead end. */}
                      {canDelete && !t.deleted_at && t.id !== user?.id && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(t)}
                          title="Remove this teacher from the directory"
                          className="flex items-center gap-1 rounded-lg border border-destructive/40 px-2 py-1 text-xs font-semibold text-destructive transition hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      )}
                      {canDelete && t.deleted_at && (
                        <button
                          type="button"
                          onClick={() => handleRestore(t)}
                          disabled={restoringId === t.id}
                          title="Restore this teacher to the active directory"
                          className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold transition hover:bg-secondary disabled:opacity-50"
                        >
                          {restoringId === t.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <RotateCcw className="h-3 w-3" />}
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
      {/* Admin-only soft-delete flow. Mounted once and driven by deleteTarget so
          the impact report is refetched on every open. */}
      <DeleteTeacherDialog
        open={Boolean(deleteTarget)}
        teacher={deleteTarget}
        successors={successors}
        onOpenChange={(next) => { if (!next) setDeleteTarget(null); }}
        onDeleted={handleDeleted}
      />

    </PageTransition>
  );
}