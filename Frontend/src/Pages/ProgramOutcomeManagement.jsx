import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Loader2, Save, Plus, Trash2, RefreshCw, Target, Layers, Award, Upload, FileDown } from 'lucide-react';
import { fetchSchools, fetchDepartments, fetchPrograms, fetchProgramOutcomes, saveProgramOutcomesBulk } from '../Api/AttainmentApi';
import { useAuth } from '../context/AuthContext';
import { usePageHeader } from '../context/PageHeaderContext';
import PageTransition from '../components/ui/PageTransition';
import EmptyState from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/skeleton';
import { Badge } from '../components/ui/badge';

// Phase 12 — Program Outcome Management (OBE).
// Program-level PEO / PO / PSO definitions are owned by the Program and maintained here by
// academic administrators (Admin / School Admin / Department Admin — the backend enforces
// the same authorization on every write). The articulation matrix and attainment views read
// these definitions dynamically, so every program can have its OWN outcome set.
const TYPES = [
  { key: 'PO', label: 'Program Outcomes', icon: Target, hint: 'Graduate attributes the program develops' },
  { key: 'PSO', label: 'Program Specific Outcomes', icon: Layers, hint: 'Outcomes specific to this program discipline' },
  { key: 'PEO', label: 'Program Educational Objectives', icon: Award, hint: 'Broad career/professional goals of the program' },
];

const fieldClass = 'w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring';
const thClass = 'border-b border-r border-border bg-muted/60 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground';

export default function ProgramOutcomeManagement() {
  const { hasRole } = useAuth();
  const canWrite = hasRole('Admin', 'Moderator', 'School Admin', 'Department Admin');

  usePageHeader({ title: 'Program Outcome Management', subtitle: 'PEOs, POs & PSOs owned by each Program (OBE)' });

  const [schools, setSchools] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [schoolId, setSchoolId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');

  const [activeType, setActiveType] = useState('PO');
  const [outcomes, setOutcomes] = useState([]); // working copy: [{ id?, code, title, description, displayOrder, isActive }]
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Cascading loads ──
  useEffect(() => {
    fetchSchools().then((r) => setSchools(r.data.data || [])).catch(() => setSchools([]));
  }, []);

  useEffect(() => {
    setDepartments([]); setDepartmentId(''); setPrograms([]); setProgramId('');
    if (!schoolId) return;
    fetchDepartments(schoolId).then((r) => setDepartments(r.data.data || [])).catch(() => setDepartments([]));
  }, [schoolId]);

  useEffect(() => {
    setPrograms([]); setProgramId('');
    if (!departmentId) return;
    fetchPrograms(departmentId).then((r) => setPrograms(r.data.data || [])).catch(() => setPrograms([]));
  }, [departmentId]);

  const selectedProgram = useMemo(() => programs.find((p) => String(p.id) === String(programId)), [programs, programId]);

  // Load outcome definitions whenever program or type changes
  useEffect(() => {
    if (!programId) { setOutcomes([]); return; }
    setLoading(true);
    fetchProgramOutcomes(programId, activeType)
      .then((r) => {
        setOutcomes((r.data.data || []).map((o) => ({
          id: o.id, code: o.code, title: o.title || '', description: o.description || '',
          displayOrder: o.display_order ?? 0, isActive: o.is_active !== 0,
          target: o.target ?? '',
        })));
      })
      .catch(() => toast.error('Could not load outcome definitions.'))
      .finally(() => setLoading(false));
  }, [programId, activeType]);

  const updateRow = (idx, patch) => {
    setOutcomes((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const addRow = () => {
    const nextNum = outcomes.length + 1;
    setOutcomes((prev) => [...prev, {
      id: null, code: `${activeType}${nextNum}`, title: '', description: '',
      displayOrder: outcomes.length, isActive: true, target: '',
    }]);
  };

  const removeRow = (idx) => setOutcomes((prev) => prev.filter((_, i) => i !== idx));

  const saveAll = async () => {
    if (!programId) return;
    setSaving(true);
    try {
      await saveProgramOutcomesBulk(programId, activeType, outcomes);
      toast.success(`${activeType} definitions saved for ${selectedProgram?.name || 'program'}.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save outcome definitions.');
    } finally {
      setSaving(false);
    }
  };

  // ── Excel template download ──
  const fileInputRef = useRef(null);

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const headers = ['Code', 'Title', 'Description', 'Target (%)', 'Display Order', 'Active (1/0)'];
    const example = [`${activeType}1`, `Example ${activeType} title`, 'Graduates will be able to…', 60, 1, 1];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    // Set column widths
    ws['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 50 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, `${activeType} Template`);
    XLSX.writeFile(wb, `${activeType}_import_template_${selectedProgram?.code || programId}.xlsx`);
  };

  // ── Excel import ──
  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) { toast.error('No sheet found in the workbook.'); return; }

        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (rawRows.length === 0) { toast.error('No data rows found.'); return; }

        const norm = (v) => String(v ?? '').toLowerCase().replace(/[\s._%-]/g, '');
        const headers = Object.keys(rawRows[0]);
        const findCol = (aliases) => headers.find((h) => aliases.some((a) => norm(h).includes(a)));

        const codeCol = findCol(['code']);
        const titleCol = findCol(['title', 'name']);
        const descCol = findCol(['description', 'desc']);
        const targetCol = findCol(['target']);
        const orderCol = findCol(['order', 'displayorder']);
        const activeCol = findCol(['active', 'isactive', 'enabled']);

        if (!codeCol) { toast.error('Could not find a "Code" column in the file.'); return; }

        const warnings = [];
        const imported = rawRows.map((row, idx) => {
          const code = String(row[codeCol] || '').trim();
          if (!code) { warnings.push(`Row ${idx + 2}: missing Code — skipped.`); return null; }
          return {
            id: null, // Will be matched/merged by code below
            code,
            title: titleCol ? String(row[titleCol] || '').trim() : '',
            description: descCol ? String(row[descCol] || '').trim() : '',
            target: targetCol ? (parseFloat(row[targetCol]) || '') : '',
            displayOrder: orderCol ? (parseInt(row[orderCol], 10) || 0) : 0,
            isActive: activeCol ? row[activeCol] !== 0 && row[activeCol] !== '0' && row[activeCol] !== false : true,
          };
        }).filter(Boolean);

        if (imported.length === 0) { toast.error('No valid outcome rows found in the file.'); return; }

        // Merge: update existing rows by code, append new ones
        setOutcomes((prev) => {
          const byCode = new Map(prev.map((o) => [o.code.toUpperCase(), o]));
          const updated = imported.map((imp) => {
            const existing = byCode.get(imp.code.toUpperCase());
            return existing ? { ...existing, ...imp, id: existing.id } : imp;
          });
          // Preserve existing rows not in the import file
          const importedCodes = new Set(imported.map((i) => i.code.toUpperCase()));
          const untouched = prev.filter((o) => !importedCodes.has(o.code.toUpperCase()));
          return [...untouched, ...updated];
        });

        if (warnings.length > 0) {
          toast.warning(`Imported ${imported.length} rows with ${warnings.length} warning(s): ${warnings.slice(0, 3).join('; ')}`);
        } else {
          toast.success(`Imported ${imported.length} ${activeType} rows. Review and click Save All to persist.`);
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to parse the Excel file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const typeMeta = TYPES.find((t) => t.key === activeType) || TYPES[0];
  const TypeIcon = typeMeta.icon;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header card */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-primary/10 to-primary/5 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Program Outcome Management</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Programs own their PEO / PO / PSO definitions. Courses reference them in the CO-PO/PSO Articulation Matrix.
              </p>
            </div>
          </div>
        </div>

        {/* Program selector */}
        <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">School</span>
            <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} className={fieldClass}>
              <option value="">Select School</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Department</span>
            <select value={departmentId} disabled={!schoolId} onChange={(e) => setDepartmentId(e.target.value)} className={fieldClass}>
              <option value="">Select Department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Program</span>
            <select value={programId} disabled={!departmentId} onChange={(e) => setProgramId(e.target.value)} className={fieldClass}>
              <option value="">Select Program</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.degree ? `(${p.degree})` : ''} · {p.duration || '?'} yr
                </option>
              ))}
            </select>
          </label>
        </div>

        {!programId ? (
          <EmptyState
            icon={Target}
            title="Select a Program to manage its outcomes"
            description="Choose School → Department → Program. The articulation matrix and attainment views automatically use these definitions."
          />
        ) : (
          <>
            {/* Type tabs */}
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveType(t.key)}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                      activeType === t.key
                        ? 'border-primary bg-primary text-primary-foreground shadow-md'
                        : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                    {activeType === t.key && <Badge variant="outline" className="ml-1 border-primary-foreground/30 text-primary-foreground">{outcomes.length}</Badge>}
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
                <div>
                  <h4 className="flex items-center gap-2 text-base font-bold text-foreground">
                    <TypeIcon className="h-4 w-4 text-primary" />
                    {typeMeta.label} — {selectedProgram?.name || `Program #${programId}`}
                  </h4>
                  <p className="text-xs text-muted-foreground">{typeMeta.hint}. Stored per Program — every program can define its own set.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canWrite && (
                    <>
                      {/* Hidden file input for Excel import */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={handleImportExcel}
                      />
                      <button
                        onClick={downloadTemplate}
                        title={`Download ${activeType} import template`}
                        className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-secondary"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        Template
                      </button>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        title={`Import ${activeType} definitions from Excel`}
                        className="flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold transition hover:bg-secondary/80"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Import Excel
                      </button>
                      <button onClick={addRow} className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20">
                        <Plus className="h-3.5 w-3.5" /> Add {activeType}
                      </button>
                      <button
                        onClick={saveAll}
                        disabled={saving}
                        className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md transition hover:bg-primary-hover disabled:opacity-60"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        {saving ? 'Saving…' : 'Save All'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {loading ? (
                <Skeleton className="mt-4 h-64 rounded-xl" />
              ) : outcomes.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No {activeType} definitions yet.
                  {canWrite ? ' Use "Add" to create the first one.' : ''}
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className={thClass} style={{ width: 110 }}>Code</th>
                        <th className={thClass}>Title</th>
                        <th className={thClass}>Description</th>
                        <th className={`${thClass} text-center`} style={{ width: 70 }}>Order</th>
                          <th className={`${thClass} text-center`} style={{ width: 80 }}>Target</th>
                        <th className={`${thClass} text-center`} style={{ width: 80 }}>Active</th>
                        {canWrite && <th className={`${thClass} text-center`} style={{ width: 60 }}>Remove</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {outcomes.map((o, idx) => (
                        <tr key={o.id || `new-${idx}`} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                          <td className="border-r border-border px-3 py-2">
                            <input
                              value={o.code}
                              onChange={(e) => updateRow(idx, { code: e.target.value })}
                              disabled={!canWrite}
                              className={`${fieldClass} font-mono font-semibold`}
                            />
                          </td>
                          <td className="border-r border-border px-3 py-2">
                            <input
                              value={o.title}
                              onChange={(e) => updateRow(idx, { title: e.target.value })}
                              disabled={!canWrite}
                              placeholder={`${o.code} title`}
                              className={fieldClass}
                            />
                          </td>
                          <td className="border-r border-border px-3 py-2">
                            <input
                              value={o.description}
                              onChange={(e) => updateRow(idx, { description: e.target.value })}
                              disabled={!canWrite}
                              placeholder={`${o.code} description / statement`}
                              className={fieldClass}
                            />
                          </td>
                          <td className="border-r border-border px-3 py-2 text-center">
                            <input
                              type="number"
                              min="0"
                              value={o.displayOrder}
                              onChange={(e) => updateRow(idx, { displayOrder: parseInt(e.target.value, 10) || 0 })}
                              disabled={!canWrite}
                              className={`${fieldClass} w-16 text-center`}
                            />
                          </td>
                          <td className="border-r border-border px-3 py-2 text-center">
                            <input
                              type="number"
                              min="0"
                              max="3"
                              step="0.1"
                              value={o.target}
                              onChange={(e) => updateRow(idx, { target: e.target.value === '' ? '' : e.target.value })}
                              disabled={!canWrite}
                              placeholder="—"
                              title={`${o.code} attainment target (0–3 level scale). Leave empty for no target.`}
                              className={`${fieldClass} w-16 text-center`}
                            />
                          </td>
                          <td className="border-r border-border px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => canWrite && updateRow(idx, { isActive: !o.isActive })}
                              disabled={!canWrite}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out disabled:cursor-not-allowed ${o.isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                              title={o.isActive ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                            >
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${o.isActive ? 'translate-x-4' : 'translate-x-1'}`} />
                            </button>
                          </td>
                          {canWrite && (
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => removeRow(idx)}
                                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                                title={`Remove ${o.code}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                <RefreshCw className="mr-1 inline h-3 w-3" />
                Deactivating an outcome hides it from new articulation-matrix views while historical mappings and attainment remain intact.
              </p>
            </div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
