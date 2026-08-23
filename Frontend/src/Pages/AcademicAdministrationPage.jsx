import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Landmark, GitBranch, GraduationCap, CalendarRange, Users2, Plus, Pencil, Power } from 'lucide-react';
import {
  fetchSchools, createSchool, updateSchool,
  fetchDepartments, createDepartment, updateDepartment,
  fetchBranches, createBranch,
  fetchPrograms, createProgram, updateProgram,
  fetchSessions, createSession, updateSession,
  fetchClasses, createClass, updateClass,
} from '../Api/AttainmentApi';
import { useAuth } from '../context/AuthContext';
import { usePageHeader } from '../context/PageHeaderContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PageTransition from '../components/ui/PageTransition';
import EntityFormDialog from '../components/admin/EntityFormDialog';

const StatusBadge = ({ status }) => (
  <Badge variant={status === 'Active' ? 'success' : 'secondary'}>{status || 'Active'}</Badge>
);

// One tab's worth of "list + create + edit + deactivate" — shared by every hierarchy level.
// `canWrite` comes from the caller (role-aware, but the backend's authorizeAcademicWrite is
// what actually enforces scope — this only hides actions the user very likely can't take).
function EntityPanel({
  title, singular, icon: Icon, columns, fetchList, createFn, updateFn, fields, canWrite,
  emptyLabel, buildEditInitialValues, extraToolbar,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogMode, setDialogMode] = useState(null); // null | 'create' | { edit: row }
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchList();
      setRows(res.data.data || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [fetchList]);

  const handleCreate = async (values) => {
    await createFn(values);
    toast.success(`${singular} created.`);
    await load();
  };

  const handleEdit = async (values) => {
    await updateFn(dialogMode.edit.id, values);
    toast.success(`${singular} updated.`);
    await load();
  };

  const handleToggleStatus = async () => {
    setConfirmLoading(true);
    try {
      const nextStatus = confirmTarget.status === 'Active' ? 'Inactive' : 'Active';
      await updateFn(confirmTarget.id, { status: nextStatus });
      toast.success(`${singular} ${nextStatus === 'Active' ? 'reactivated' : 'deactivated'}.`);
      setConfirmTarget(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed.');
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <h3 className="text-base font-bold text-foreground">{title} ({rows.length})</h3>
        </div>
        <div className="flex items-center gap-2">
          {extraToolbar}
          {canWrite && createFn && (
            <button
              onClick={() => setDialogMode('create')}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-hover"
            >
              <Plus className="h-3.5 w-3.5" /> Add {singular}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Icon} title={emptyLabel || `No ${title.toLowerCase()} yet.`} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table className="rounded-none border-0">
            <TableHeader>
              <TableRow>
                {columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                {canWrite && updateFn && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((c) => (
                    <TableCell key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</TableCell>
                  ))}
                  {canWrite && updateFn && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setDialogMode({ edit: row })}
                          title="Edit"
                          className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmTarget(row)}
                          title={row.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                          className={`rounded-lg border p-1.5 transition ${row.status === 'Active' ? 'border-destructive/30 text-destructive hover:bg-destructive/10' : 'border-success/30 text-success hover:bg-success/10'}`}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* A single dialog instance, mounted only while actually in use, rather than two
          permanently-mounted Dialog roots (create + edit) toggled via `open` — simpler, and
          avoids two Radix Dialog roots coexisting in the same panel for no reason. */}
      {dialogMode && (
        <EntityFormDialog
          open
          onOpenChange={(v) => !v && setDialogMode(null)}
          title={dialogMode === 'create' ? `Add ${singular}` : `Edit ${singular}`}
          fields={fields}
          initialValues={dialogMode === 'create' ? {} : (buildEditInitialValues ? buildEditInitialValues(dialogMode.edit) : dialogMode.edit)}
          onSubmit={dialogMode === 'create' ? handleCreate : handleEdit}
          submitLabel={dialogMode === 'create' ? 'Create' : 'Save Changes'}
        />
      )}
      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title={confirmTarget?.status === 'Active' ? `Deactivate this ${singular.toLowerCase()}?` : `Reactivate this ${singular.toLowerCase()}?`}
        description={confirmTarget?.status === 'Active' ? 'This action may affect historical academic records. Deactivating preserves all history — it never deletes data.' : undefined}
        danger={confirmTarget?.status === 'Active'}
        loading={confirmLoading}
        onConfirm={handleToggleStatus}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}

export default function AcademicAdministrationPage() {
  const { hasRole } = useAuth();
  const canWrite = hasRole('Admin', 'School Admin', 'Department Admin');
  const canWriteSessions = hasRole('Admin'); // Sessions are University-wide, Admin-only (Section 11)

  usePageHeader({ title: 'Academic Structure', subtitle: 'Schools, Departments, Programs, Sessions & Classes' });

  const [activeTab, setActiveTab] = useState('schools');
  const loadedRef = useRef({ schools: false, departments: false, programs: false, sessions: false });
  const [schools, setSchools] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [sessions, setSessions] = useState([]);

  // Phase 8 — lazy loading: only the visible tab's data is fetched on mount (Schools).
  // Departments/Programs/Sessions lists are fetched on first selection of a tab that needs
  // them (for dropdown options), never all at once. Each tab's own list is still loaded by
  // its EntityPanel when that tab is first opened. A ref guards against double-fetch on
  // rapid tab switching.
  const ensureLoaded = (name) => {
    if (loadedRef.current[name]) return;
    loadedRef.current[name] = true;
    if (name === 'schools') fetchSchools().then((r) => setSchools(r.data.data || [])).catch(() => {});
    if (name === 'departments') fetchDepartments().then((r) => setDepartments(r.data.data || [])).catch(() => {});
    if (name === 'programs') fetchPrograms().then((r) => setPrograms(r.data.data || [])).catch(() => {});
    if (name === 'sessions') fetchSessions().then((r) => setSessions(r.data.data || [])).catch(() => {});
  };

  const handleTabChange = (value) => {
    setActiveTab(value);
    if (value === 'schools') ensureLoaded('schools');
    if (value === 'departments' || value === 'branches') ensureLoaded('departments');
    if (value === 'programs') { ensureLoaded('departments'); ensureLoaded('programs'); }
    if (value === 'sessions') ensureLoaded('sessions');
    if (value === 'classes') { ensureLoaded('programs'); ensureLoaded('sessions'); }
  };

  useEffect(() => { ensureLoaded('schools'); }, []);

  const schoolOptions = useMemo(() => schools.map((s) => ({ value: String(s.id), label: s.name })), [schools]);
  const departmentOptions = useMemo(() => departments.map((d) => ({ value: String(d.id), label: d.name })), [departments]);
  const programOptions = useMemo(() => programs.map((p) => ({ value: String(p.id), label: p.name })), [programs]);
  const sessionOptions = useMemo(() => sessions.map((s) => ({ value: String(s.id), label: s.name })), [sessions]);

  const schoolNameById = useMemo(() => Object.fromEntries(schools.map((s) => [s.id, s.name])), [schools]);
  const departmentNameById = useMemo(() => Object.fromEntries(departments.map((d) => [d.id, d.name])), [departments]);

  return (
    <PageTransition>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-8 flex-wrap">
          <TabsTrigger value="schools"><Building2 className="h-4 w-4" /> Schools</TabsTrigger>
          <TabsTrigger value="departments"><Landmark className="h-4 w-4" /> Departments</TabsTrigger>
          <TabsTrigger value="branches"><GitBranch className="h-4 w-4" /> Branches</TabsTrigger>
          <TabsTrigger value="programs"><GraduationCap className="h-4 w-4" /> Programs</TabsTrigger>
          <TabsTrigger value="sessions"><CalendarRange className="h-4 w-4" /> Sessions</TabsTrigger>
          <TabsTrigger value="classes"><Users2 className="h-4 w-4" /> Classes</TabsTrigger>
        </TabsList>

        <TabsContent value="schools">
          <EntityPanel
            title="Schools"
            singular="School"
            icon={Building2}
            canWrite={canWrite}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'code', label: 'Code' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
            fetchList={fetchSchools}
            createFn={createSchool}
            updateFn={updateSchool}
            fields={[
              { name: 'name', label: 'School Name', required: true, placeholder: 'School of Engineering & Technology' },
              { name: 'code', label: 'School Code', placeholder: 'SET' },
              { name: 'description', label: 'Description' },
            ]}
          />
        </TabsContent>

        <TabsContent value="departments">
          <EntityPanel
            title="Departments"
            singular="Department"
            icon={Landmark}
            canWrite={canWrite}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'code', label: 'Code' },
              { key: 'school_id', label: 'School', render: (r) => schoolNameById[r.school_id] || '—' },
              { key: 'hod', label: 'HOD' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
            fetchList={() => fetchDepartments()}
            createFn={(v) => createDepartment({ ...v, schoolId: Number(v.schoolId) })}
            updateFn={updateDepartment}
            buildEditInitialValues={(row) => ({ ...row, schoolId: String(row.school_id) })}
            fields={[
              { name: 'schoolId', label: 'School', type: 'select', required: true, options: schoolOptions },
              { name: 'name', label: 'Department Name', required: true, placeholder: 'Computer Science & Engineering' },
              { name: 'code', label: 'Department Code', placeholder: 'CSE' },
              { name: 'hod', label: 'Head of Department' },
            ]}
          />
        </TabsContent>

        <TabsContent value="branches">
          <EntityPanel
            title="Branches"
            singular="Branch"
            icon={GitBranch}
            canWrite={canWrite}
            emptyLabel="No branches yet. Branches are optional — a Program can belong directly to a Department instead."
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'code', label: 'Code' },
              { key: 'department_id', label: 'Department', render: (r) => departmentNameById[r.department_id] || '—' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
            fetchList={() => fetchBranches()}
            createFn={(v) => createBranch({ ...v, departmentId: Number(v.departmentId) })}
            fields={[
              { name: 'departmentId', label: 'Department', type: 'select', required: true, options: departmentOptions },
              { name: 'name', label: 'Branch Name', required: true },
              { name: 'code', label: 'Branch Code' },
            ]}
          />
        </TabsContent>

        <TabsContent value="programs">
          <EntityPanel
            title="Programs"
            singular="Program"
            icon={GraduationCap}
            canWrite={canWrite}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'code', label: 'Code' },
              { key: 'degree', label: 'Degree' },
              { key: 'duration', label: 'Duration (yrs)' },
              { key: 'department_id', label: 'Department', render: (r) => departmentNameById[r.department_id] || '—' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
            fetchList={() => fetchPrograms()}
            createFn={(v) => createProgram({ ...v, departmentId: Number(v.departmentId), duration: Number(v.duration) || 4 })}
            updateFn={updateProgram}
            buildEditInitialValues={(row) => ({ ...row, departmentId: String(row.department_id) })}
            fields={[
              { name: 'departmentId', label: 'Department', type: 'select', required: true, options: departmentOptions },
              { name: 'name', label: 'Program Name', required: true, placeholder: 'B.Tech Computer Science & Engineering' },
              { name: 'code', label: 'Program Code', placeholder: 'BTECH-CSE' },
              { name: 'degree', label: 'Degree', placeholder: 'B.Tech' },
              { name: 'duration', label: 'Duration (years)', type: 'number', placeholder: '4' },
            ]}
          />
        </TabsContent>

        <TabsContent value="sessions">
          <EntityPanel
            title="Academic Sessions"
            singular="Academic Session"
            icon={CalendarRange}
            canWrite={canWriteSessions}
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'start_year', label: 'Start Year' },
              { key: 'end_year', label: 'End Year' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
            fetchList={fetchSessions}
            createFn={createSession}
            updateFn={updateSession}
            fields={[
              { name: 'name', label: 'Session Name', required: true, placeholder: '2026-2027' },
              { name: 'startYear', label: 'Start Year', type: 'number' },
              { name: 'endYear', label: 'End Year', type: 'number' },
            ]}
          />
        </TabsContent>

        <TabsContent value="classes">
          <EntityPanel
            title="Classes"
            singular="Class"
            icon={Users2}
            canWrite={canWrite}
            columns={[
              { key: 'program_name', label: 'Program' },
              { key: 'session_name', label: 'Session' },
              { key: 'semester', label: 'Semester' },
              { key: 'section', label: 'Section' },
              { key: 'student_count', label: 'Students' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
            fetchList={() => fetchClasses()}
            createFn={(v) => createClass({ ...v, programId: Number(v.programId), sessionId: Number(v.sessionId), semester: Number(v.semester) })}
            updateFn={updateClass}
            buildEditInitialValues={(row) => ({ ...row, programId: String(row.program_id), sessionId: String(row.academic_session_id) })}
            fields={[
              { name: 'programId', label: 'Program', type: 'select', required: true, options: programOptions },
              { name: 'sessionId', label: 'Academic Session', type: 'select', required: true, options: sessionOptions },
              { name: 'semester', label: 'Semester', type: 'number', required: true, placeholder: '1' },
              { name: 'section', label: 'Section (optional)', placeholder: 'A' },
            ]}
          />
        </TabsContent>
      </Tabs>
    </PageTransition>
  );
}
