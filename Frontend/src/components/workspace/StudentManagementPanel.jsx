import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Users, Upload, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { fetchCourseStudents, uploadCourseStudents } from '../../Api/AttainmentApi';
import { parseStudentExcel } from '../../utils/excelParser';
import EmptyState from '../ui/EmptyState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table';
import { Badge } from '../ui/badge';

// Phase 10 — Student Management for the course's academic context.
// Students belong to Program + Session + Semester (the same context as the course).
// The Teacher uploads only student-specific data (Enrollment No, Roll No, Name, Email,
// Phone) — School, Department, Program, Session, Semester are derived server-side from
// the assigned course. Uploaded students automatically appear in every course of the
// same context (no per-course student list duplication).
export default function StudentManagementPanel({ courseId, course, hierarchy, readOnly = false, onStudentsChanged }) {
  const fileInputRef = useRef(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null); // parsed rows awaiting confirmation
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCourseStudents(courseId);
      setStudents(res.data.data || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load students.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';
    parseStudentExcel(file)
      .then((rows) => {
        setPreview(rows);
        toast.success(`Parsed ${rows.length} student(s) from the file. Review and confirm to save.`);
      })
      .catch((err) => toast.error(err.message || 'Could not parse the student Excel file.'));
  };

  const confirmUpload = async () => {
    if (!preview || preview.length === 0) return;
    setUploading(true);
    try {
      const res = await uploadCourseStudents(courseId, preview);
      const { created, updated, enrolled, errors } = res.data.data;
      setPreview(null);
      await load();
      if (onStudentsChanged) onStudentsChanged();
      toast.success(`${created} created, ${updated} updated, ${enrolled} enrollments.`);
      if (errors && errors.length > 0) {
        toast.warning(`${errors.length} row(s) had problems — see student list.`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload students.');
    } finally {
      setUploading(false);
    }
  };

  const contextLabel = hierarchy?.linked
    ? `${hierarchy.schoolName} → ${hierarchy.departmentName} → ${hierarchy.programName} → ${hierarchy.sessionName} → Semester ${course?.semester}`
    : null;

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <h4 className="text-base font-bold text-foreground">
              Students <span className="text-muted-foreground font-semibold">({loading ? '…' : students.length})</span>
            </h4>
            {contextLabel && <p className="text-[11px] text-muted-foreground">{contextLabel}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary"
            title="Refresh student list"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          {!readOnly && (
            <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20">
              <Upload className="h-3.5 w-3.5" /> Upload Student Excel
              <input ref={fileInputRef} type="file" accept=".xlsx, .xls" onChange={handleFile} className="hidden" />
            </label>
          )}
        </div>
      </div>

      {/* Upload preview + confirm */}
      {preview && preview.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <FileSpreadsheet className="h-4 w-4" />
              {preview.length} student(s) ready — {hierarchy?.linked ? 'will join this course\'s academic context' : 'upload requires a hierarchy-linked course'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPreview(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmUpload}
                disabled={uploading || !hierarchy?.linked}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {uploading ? 'Saving…' : 'Confirm Upload'}
              </button>
            </div>
          </div>
          {!hierarchy?.linked && (
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              This course is not linked to the academic hierarchy — link it via the Admin panel first.
            </p>
          )}
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-card">
            <Table className="rounded-none border-0">
              <TableHeader>
                <TableRow>
                  <TableHead>Roll No</TableHead>
                  <TableHead>Enrollment No</TableHead>
                  <TableHead>Student Name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.slice(0, 100).map((s, i) => (
                  <TableRow key={i}>
                    <TableCell>{s.rollNo || '—'}</TableCell>
                    <TableCell className="font-medium">{s.enrollmentNo}</TableCell>
                    <TableCell>{s.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Student list */}
      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading students…</div>
      ) : error ? (
        <div className="py-6 text-center text-sm text-destructive">{error}</div>
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students in this course yet"
          description={hierarchy?.linked
            ? 'Upload the student Excel (Enrollment No, Roll No, Student Name) — they will automatically appear in every course of this academic context.'
            : 'This course is not linked to the academic hierarchy yet.'}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Roll No</TableHead>
                <TableHead>Enrollment No</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.roll_no || s.roll_number || '—'}</TableCell>
                  <TableCell className="font-medium">{s.registration_number}</TableCell>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>{s.email || '—'}</TableCell>
                  <TableCell>{s.phone || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === 'Active' ? 'success' : 'secondary'}>{s.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
