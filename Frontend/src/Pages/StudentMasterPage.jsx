import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, Users, Plus, AlertTriangle, ChevronLeft, ChevronRight, Power } from 'lucide-react';
import { fetchStudents, createStudent, updateStudentRecord } from '../Api/AttainmentApi';
import { usePageHeader } from '../context/PageHeaderContext';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PageTransition from '../components/ui/PageTransition';
import EntityFormDialog from '../components/admin/EntityFormDialog';

const PAGE_SIZE = 25;

// Section 13/14/17/18 — Student Master browsing/search/pagination, creation, and honest
// data-quality flags (unmapped, placeholder-suspect) surfaced for an administrator to act on.
// Actually mapping a student to a class is a distinct, focused workflow that already has its
// own screen (Student Mapping) — this page links there rather than duplicating it.
export default function StudentMasterPage() {
  const navigate = useNavigate();
  usePageHeader({ title: 'Student Master', subtitle: 'Search, review, and administer the university student registry' });

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchStudents({
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setRows(res.data.data || []);
      setTotal(res.data.meta?.total ?? res.data.data.length);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load students.');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [page, statusFilter]);

  // Debounced search — avoids firing a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setPage(0); load(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleCreate = async (values) => {
    await createStudent({
      registrationNumber: values.registrationNumber,
      rollNumber: values.rollNumber,
      name: values.name,
      email: values.email,
    });
    toast.success('Student created.');
    await load();
  };

  const handleToggleStatus = async () => {
    setConfirmLoading(true);
    try {
      const nextStatus = confirmTarget.status === 'Active' ? 'Inactive' : 'Active';
      await updateStudentRecord(confirmTarget.id, { status: nextStatus });
      toast.success(`Student ${nextStatus === 'Active' ? 'reactivated' : 'deactivated'}.`);
      setConfirmTarget(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed.');
    } finally {
      setConfirmLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageTransition className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by registration no, name, or roll no..."
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="all">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <button
            onClick={() => navigate('/admin/student-mapping')}
            className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary"
          >
            Map Students to Classes
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-hover"
          >
            <Plus className="h-3.5 w-3.5" /> Add Student
          </button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title="No students found." description={search ? 'Try a different search term.' : 'Add a student or import marks to populate the registry.'} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <Table className="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead>Registration No.</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Roll No.</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Semester</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {s.registration_number}
                        {s.isPlaceholderSuspect && (
                          <span title="Possible test/placeholder student — review before relying on this record.">
                            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.roll_number || s.roll_no || '—'}</TableCell>
                    <TableCell className="text-xs">{s.program_name || <span className="italic text-muted-foreground">Unmapped</span>}</TableCell>
                    <TableCell className="text-xs">{s.session_name || '—'}</TableCell>
                    <TableCell className="text-xs">{s.semester || '—'}</TableCell>
                    <TableCell className="text-xs">{s.section || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === 'Active' ? 'success' : 'secondary'}>{s.status || 'Active'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => setConfirmTarget(s)}
                        title={s.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                        className={`ml-auto rounded-lg border p-1.5 transition ${s.status === 'Active' ? 'border-destructive/30 text-destructive hover:bg-destructive/10' : 'border-success/30 text-success hover:bg-success/10'}`}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Showing {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-medium transition hover:bg-secondary disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <span>Page {page + 1} of {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-medium transition hover:bg-secondary disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      <EntityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add Student"
        description="Registration number must be unique — an existing student with the same identifier will be reused, not duplicated."
        fields={[
          { name: 'registrationNumber', label: 'Registration Number', required: true },
          { name: 'name', label: 'Full Name', required: true },
          { name: 'rollNumber', label: 'Roll Number' },
          { name: 'email', label: 'Email', type: 'email' },
        ]}
        initialValues={{}}
        onSubmit={handleCreate}
        submitLabel="Create"
      />

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={confirmTarget?.status === 'Active' ? 'Deactivate this student?' : 'Reactivate this student?'}
        description={confirmTarget?.status === 'Active' ? 'This action may affect historical academic records. Deactivating preserves all marks and enrollment history — it never deletes data.' : undefined}
        danger={confirmTarget?.status === 'Active'}
        loading={confirmLoading}
        onConfirm={handleToggleStatus}
        onCancel={() => setConfirmTarget(null)}
      />
    </PageTransition>
  );
}
