import { ChevronDown, RotateCcw, Building2 } from 'lucide-react';
import { useAcademicFilter } from '../../context/AcademicFilterContext';

function FilterSelect({ label, value, onChange, disabled, placeholder, options, getKey, getValue, getLabel }) {
  return (
    <div className="relative flex min-w-[9rem] flex-1 flex-col">
      <span className="mb-0.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <div className="relative flex items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-9 w-full appearance-none rounded-lg border border-input bg-background pl-2.5 pr-7 text-xs font-medium text-foreground shadow-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring hover:border-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="all">{placeholder}</option>
          {options.map((opt) => (
            <option key={getKey(opt)} value={getKey(opt)}>{getLabel(opt)}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-muted-foreground" />
      </div>
    </div>
  );
}

// Cascading School → Department → Program → Academic Session → Semester → Section/Class
// filter bar. Each level is disabled until its parent is chosen (except School), and picking
// a parent always resets/re-fetches its children (handled centrally in AcademicFilterContext)
// so the UI never shows options that don't actually belong to the current selection.
export default function HierarchyFilterBar({ semesterOptions = [] }) {
  const {
    schools, departments, programs, academicSessions, classes,
    schoolId, departmentId, programId, academicSessionId, hierarchySemester, classId,
    setSchoolId, setDepartmentId, setProgramId, setAcademicSessionId, setHierarchySemester, setClassId,
    resetHierarchyFilter, hierarchyActive, hierarchyError,
  } = useAcademicFilter();

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Academic Filter</h3>
        </div>
        {hierarchyActive && (
          <button
            type="button"
            onClick={resetHierarchyFilter}
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>

      {hierarchyError && (
        <p className="mb-3 text-xs text-destructive">{hierarchyError}</p>
      )}

      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label="School"
          value={schoolId}
          onChange={setSchoolId}
          placeholder="All Schools"
          options={schools}
          getKey={(s) => s.id}
          getValue={(s) => s.id}
          getLabel={(s) => s.name}
        />
        <FilterSelect
          label="Department"
          value={departmentId}
          onChange={setDepartmentId}
          disabled={schoolId === 'all'}
          placeholder={schoolId === 'all' ? 'Select School first' : 'All Departments'}
          options={departments}
          getKey={(d) => d.id}
          getValue={(d) => d.id}
          getLabel={(d) => d.name}
        />
        <FilterSelect
          label="Program"
          value={programId}
          onChange={setProgramId}
          disabled={departmentId === 'all'}
          placeholder={departmentId === 'all' ? 'Select Department first' : 'All Programs'}
          options={programs}
          getKey={(p) => p.id}
          getValue={(p) => p.id}
          getLabel={(p) => p.name}
        />
        <FilterSelect
          label="Session"
          value={academicSessionId}
          onChange={setAcademicSessionId}
          placeholder="All Sessions"
          options={academicSessions}
          getKey={(s) => s.id}
          getValue={(s) => s.id}
          getLabel={(s) => s.name}
        />
        <FilterSelect
          label="Semester"
          value={hierarchySemester}
          onChange={setHierarchySemester}
          placeholder="All Semesters"
          options={semesterOptions.map((s) => ({ id: s }))}
          getKey={(s) => s.id}
          getValue={(s) => s.id}
          getLabel={(s) => `Semester ${s.id}`}
        />
        <FilterSelect
          label="Section / Class"
          value={classId}
          onChange={setClassId}
          disabled={programId === 'all'}
          placeholder={programId === 'all' ? 'Select Program first' : 'All Sections'}
          options={classes}
          getKey={(c) => c.id}
          getValue={(c) => c.id}
          getLabel={(c) => `Sem ${c.semester}${c.section ? ` • ${c.section}` : ''}`}
        />
      </div>
    </div>
  );
}
