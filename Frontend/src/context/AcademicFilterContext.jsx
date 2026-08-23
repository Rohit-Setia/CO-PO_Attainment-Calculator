import { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import { fetchSchools, fetchDepartments, fetchPrograms, fetchSessions, fetchClasses } from '../Api/AttainmentApi';

const AcademicFilterContext = createContext(null);

// Global Semester/Session selection (header dropdowns). 'all' means no filter. Options are
// populated by whichever page loads real course data first (via setAvailableSemesters/
// setAvailableSessions) — never a fabricated fixed list, always derived from real courses.
//
// Phase 6 additionally provides a cascading University hierarchy filter — School →
// Department → Program → Academic Session → Semester → Section/Class — backed by the real
// /schools, /departments, /programs, /sessions, /classes APIs. Selecting a parent level
// always resets every child selection and clears its stale option list, so the UI can never
// show children that don't belong to the newly-selected parent.
export const AcademicFilterProvider = ({ children }) => {
  const [semester, setSemester] = useState('all');
  const [session, setSession] = useState('all');
  const [availableSemesters, setAvailableSemesters] = useState([]);
  const [availableSessions, setAvailableSessions] = useState([]);

  const [schools, setSchools] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [academicSessions, setAcademicSessions] = useState([]);
  const [classes, setClasses] = useState([]);

  const [schoolId, setSchoolIdRaw] = useState('all');
  const [departmentId, setDepartmentIdRaw] = useState('all');
  const [programId, setProgramIdRaw] = useState('all');
  const [academicSessionId, setAcademicSessionIdRaw] = useState('all');
  const [hierarchySemester, setHierarchySemesterRaw] = useState('all');
  const [classId, setClassIdRaw] = useState('all');

  const [loadingHierarchy, setLoadingHierarchy] = useState(false);
  const [hierarchyError, setHierarchyError] = useState('');

  // Top-level lists (School, Academic Session) are independent of any other selection —
  // load them once, on first mount of any page that uses the filter.
  useEffect(() => {
    let cancelled = false;
    // Deferred so the loading reset isn't a synchronous setState inside the effect
    // body (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => { if (!cancelled) setLoadingHierarchy(true); });
    Promise.all([fetchSchools(), fetchSessions()])
      .then(([schoolsRes, sessionsRes]) => {
        if (cancelled) return;
        setSchools(schoolsRes.data.data || []);
        setAcademicSessions(sessionsRes.data.data || []);
        setHierarchyError('');
      })
      .catch(() => { if (!cancelled) setHierarchyError('Could not load academic hierarchy filters.'); })
      .finally(() => { if (!cancelled) setLoadingHierarchy(false); });
    return () => { cancelled = true; };
  }, []);

  const setSchoolId = useCallback((id) => {
    setSchoolIdRaw(id);
    setDepartmentIdRaw('all');
    setProgramIdRaw('all');
    setClassIdRaw('all');
    setDepartments([]);
    setPrograms([]);
    setClasses([]);
    if (id === 'all') return;
    fetchDepartments(id).then((res) => setDepartments(res.data.data || [])).catch(() => setDepartments([]));
  }, []);

  const setDepartmentId = useCallback((id) => {
    setDepartmentIdRaw(id);
    setProgramIdRaw('all');
    setClassIdRaw('all');
    setPrograms([]);
    setClasses([]);
    if (id === 'all') return;
    fetchPrograms(id).then((res) => setPrograms(res.data.data || [])).catch(() => setPrograms([]));
  }, []);

  const reloadClasses = useCallback((overrides = {}) => {
    const params = {
      programId: overrides.programId ?? (programId !== 'all' ? programId : undefined),
      sessionId: overrides.academicSessionId ?? (academicSessionId !== 'all' ? academicSessionId : undefined),
      semester: overrides.hierarchySemester ?? (hierarchySemester !== 'all' ? hierarchySemester : undefined),
    };
    if (!params.programId) { setClasses([]); return; }
    fetchClasses(params).then((res) => setClasses(res.data.data || [])).catch(() => setClasses([]));
  }, [programId, academicSessionId, hierarchySemester]);

  const setProgramId = useCallback((id) => {
    setProgramIdRaw(id);
    setClassIdRaw('all');
    setClasses([]);
    if (id === 'all') return;
    reloadClasses({ programId: id });
  }, [reloadClasses]);

  const setAcademicSessionId = useCallback((id) => {
    setAcademicSessionIdRaw(id);
    setClassIdRaw('all');
    if (programId === 'all') { setClasses([]); return; }
    reloadClasses({ academicSessionId: id });
  }, [programId, reloadClasses]);

  const setHierarchySemester = useCallback((sem) => {
    setHierarchySemesterRaw(sem);
    setClassIdRaw('all');
    if (programId === 'all') { setClasses([]); return; }
    reloadClasses({ hierarchySemester: sem });
  }, [programId, reloadClasses]);

  const setClassId = useCallback((id) => setClassIdRaw(id), []);

  const resetHierarchyFilter = useCallback(() => {
    setSchoolIdRaw('all'); setDepartmentIdRaw('all'); setProgramIdRaw('all');
    setAcademicSessionIdRaw('all'); setHierarchySemesterRaw('all'); setClassIdRaw('all');
    setDepartments([]); setPrograms([]); setClasses([]);
  }, []);

  const hierarchyActive = schoolId !== 'all' || departmentId !== 'all' || programId !== 'all'
    || academicSessionId !== 'all' || hierarchySemester !== 'all';

  const value = useMemo(() => ({
    semester, setSemester,
    session, setSession,
    availableSemesters, setAvailableSemesters,
    availableSessions, setAvailableSessions,

    schools, departments, programs, academicSessions, classes,
    schoolId, departmentId, programId, academicSessionId, hierarchySemester, classId,
    setSchoolId, setDepartmentId, setProgramId, setAcademicSessionId, setHierarchySemester, setClassId,
    resetHierarchyFilter, hierarchyActive,
    loadingHierarchy, hierarchyError,
  }), [
    semester, session, availableSemesters, availableSessions,
    schools, departments, programs, academicSessions, classes,
    schoolId, departmentId, programId, academicSessionId, hierarchySemester, classId,
    setSchoolId, setDepartmentId, setProgramId, setAcademicSessionId, setHierarchySemester, setClassId,
    resetHierarchyFilter, hierarchyActive, loadingHierarchy, hierarchyError,
  ]);

  return <AcademicFilterContext.Provider value={value}>{children}</AcademicFilterContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components -- hook lives alongside the provider by convention
export const useAcademicFilter = () => {
  const ctx = useContext(AcademicFilterContext);
  if (!ctx) throw new Error('useAcademicFilter must be used within AcademicFilterProvider');
  return ctx;
};

// Applies the current semester/session selection to a real course array.
// eslint-disable-next-line react-refresh/only-export-components
export const filterCoursesByAcademicSelection = (courses, semester, session) =>
  courses.filter((c) => (semester === 'all' || String(c.semester) === String(semester))
    && (session === 'all' || c.academic_year === session));
