import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  ArrowRight,
  Layers,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Info,
} from "lucide-react";
import { Badge } from "../ui/badge";
import {
  fetchSchools,
  fetchDepartments,
  fetchPrograms,
  fetchSessions,
} from "../../Api/AttainmentApi";
import {
  previewBulkQuestionPapers,
  importBulkQuestionPapers,
} from "../../Api/examinationApi";

const CONFIDENCE_BADGE = {
  HIGH: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  MEDIUM: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  NONE: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

export default function BulkPaperUploadPanel({ onImportFinished }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Filter & hierarchy states
  const [schools, setSchools] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [sessions, setSessions] = useState([]);

  const [schoolId, setSchoolId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [programId, setProgramId] = useState("");
  const [examType, setExamType] = useState("MTT");
  const [academicYear, setAcademicYear] = useState("");

  // Files & Preview states
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [stagedItems, setStagedItems] = useState([]);

  // Import Execution states
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);

  // Load initial hierarchy data
  useEffect(() => {
    fetchSchools()
      .then((res) => setSchools(res.data?.data || []))
      .catch(() => {});
    fetchSessions()
      .then((res) => setSessions(res.data?.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!schoolId) {
      setDepartments([]);
      setDepartmentId("");
      return;
    }
    fetchDepartments(schoolId)
      .then((res) => setDepartments(res.data?.data || []))
      .catch(() => {});
  }, [schoolId]);

  useEffect(() => {
    if (!departmentId) {
      setPrograms([]);
      setProgramId("");
      return;
    }
    fetchPrograms(departmentId)
      .then((res) => setPrograms(res.data?.data || []))
      .catch(() => {});
  }, [departmentId]);

  // Handle files selected via input or drop
  const handleFilesAdded = (filesList) => {
    const validFiles = Array.from(filesList).filter((f) =>
      /\.(pdf|docx|doc|xlsx|xls|csv)$/i.test(f.name),
    );
    if (validFiles.length === 0) {
      toast.error(
        "No supported document files selected (DOCX, PDF, XLSX, CSV).",
      );
      return;
    }

    // Deduplicate against already selected by name & size
    const merged = [...selectedFiles];
    validFiles.forEach((file) => {
      if (!merged.some((m) => m.name === file.name && m.size === file.size)) {
        merged.push(file);
      }
    });

    setSelectedFiles(merged);
    setAnalyzed(false);
    setStagedItems([]);
    setImportSummary(null);
  };

  const handleRemoveFile = (index) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
    setStagedItems((prev) => prev.filter((item) => item.fileIndex !== index));
    if (updated.length === 0) {
      setAnalyzed(false);
    }
  };

  const handleAnalyze = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Please select at least one question paper file first.");
      return;
    }

    setAnalyzing(true);
    try {
      const res = await previewBulkQuestionPapers(selectedFiles, {
        departmentId: departmentId || undefined,
        programId: programId || undefined,
        examType,
        academicYear: academicYear || undefined,
      });

      const data = res.data?.data;
      setAvailableCourses(data?.courses || []);
      setStagedItems(data?.previews || []);
      setAnalyzed(true);

      const highMatch = (data?.previews || []).filter(
        (p) => p.matchConfidence === "HIGH",
      ).length;
      toast.success(
        `Analyzed ${data?.previews?.length || 0} files: ${highMatch} matched automatically with high confidence.`,
      );
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to analyze question papers.",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCourseMappingChange = (fileIndex, newCourseId) => {
    setStagedItems((prev) =>
      prev.map((item) => {
        if (item.fileIndex === fileIndex) {
          const matched = availableCourses.find(
            (c) => String(c.id) === String(newCourseId),
          );
          return {
            ...item,
            matchedCourseId: newCourseId,
            matchedCourse: matched || null,
            matchConfidence: matched ? "HIGH" : "NONE",
          };
        }
        return item;
      }),
    );
  };

  const handleSetChange = (fileIndex, newSet) => {
    setStagedItems((prev) =>
      prev.map((item) =>
        item.fileIndex === fileIndex
          ? { ...item, detectedPaperSet: newSet }
          : item,
      ),
    );
  };

  const handleExamTypeChange = (fileIndex, nextType) => {
    setStagedItems((prev) =>
      prev.map((item) =>
        item.fileIndex === fileIndex
          ? { ...item, detectedExamType: nextType }
          : item,
      ),
    );
  };

  const handleExecuteImport = async () => {
    // Check if every staged item has a course selected
    const unmapped = stagedItems.filter((item) => !item.matchedCourseId);
    if (unmapped.length > 0) {
      toast.error(
        `${unmapped.length} paper(s) do not have a course selected. Please assign a course to all papers.`,
      );
      return;
    }

    setImporting(true);
    try {
      const mappings = stagedItems.map((item) => ({
        fileIndex: item.fileIndex,
        courseId: Number(item.matchedCourseId),
        examType: item.detectedExamType || examType || "MTT",
        paperSet: item.detectedPaperSet || "Set 1",
      }));

      const res = await importBulkQuestionPapers(selectedFiles, mappings);
      const summary = res.data?.data;
      setImportSummary(summary);
      toast.success(
        `Successfully imported and extracted ${summary?.successfulCount || 0} question papers into review drafts!`,
      );
      onImportFinished?.();
    } catch (err) {
      toast.error(err.response?.data?.message || "Bulk import failed.");
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setStagedItems([]);
    setAnalyzed(false);
    setImportSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      {/* ── Header Card ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Layers className="h-5 w-5 text-primary" /> Bulk Question Paper
              Upload
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload all question papers for a department or program together.
              The system auto-detects subject codes, matches them with existing
              courses, and extracts questions directly into review drafts.
            </p>
          </div>
          {analyzed && !importSummary && (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Start Over
            </button>
          )}
        </div>

        {/* ── Step 1: Department & Exam Scope ─────────────────────────────────── */}
        {!importSummary && (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5 border-t border-border pt-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                School
              </label>
              <select
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="">All Schools</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Department
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                disabled={!schoolId && departments.length === 0}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs disabled:opacity-50"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Program (optional)
              </label>
              <select
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                disabled={!departmentId && programs.length === 0}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs disabled:opacity-50"
              >
                <option value="">All Programs</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Default Exam Type
              </label>
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="MTT">MTT (Mid-Term)</option>
                <option value="ETT">ETT (End-Term)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Academic Session
              </label>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              >
                <option value="">All Sessions</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.academic_year || s.name}>
                    {s.name || s.academic_year}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Step 2: Multi-File Dropzone & Upload ───────────────────────────────── */}
      {!analyzed && !importSummary && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFilesAdded(e.dataTransfer.files);
            }}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-muted/20 p-8 text-center transition hover:border-primary/50 hover:bg-muted/30"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UploadCloud className="h-7 w-7" />
            </div>
            <h4 className="mt-3 text-sm font-bold text-foreground">
              Drop multiple question papers here, or browse files
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Supports DOCX, PDF, XLSX, and CSV documents (up to 50 files
              simultaneously).
            </p>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xlsx,.xls,.csv"
              onChange={(e) =>
                e.target.files && handleFilesAdded(e.target.files)
              }
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 shadow-sm"
            >
              Choose Question Papers
            </button>
          </div>

          {selectedFiles.length > 0 && (
            <div className="mt-6 border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Selected Files ({selectedFiles.length})
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedFiles([])}
                  className="text-xs text-destructive hover:underline"
                >
                  Clear all
                </button>
              </div>

              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                {selectedFiles.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground shadow-sm"
                  >
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span className="max-w-[200px] truncate font-medium">
                      {f.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      ({(f.size / 1024).toFixed(0)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(i)}
                      className="ml-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 shadow-md"
                >
                  {analyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {analyzing
                    ? "Analyzing & Matching Papers…"
                    : `Analyze & Match All (${selectedFiles.length} Papers)`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Staging & Mapping Table ─────────────────────────────────── */}
      {analyzed && !importSummary && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-bold text-foreground">
                Review & Confirm Course Mappings
              </h4>
              <p className="text-xs text-muted-foreground">
                Verify auto-detected courses. You can change any course mapping
                or paper set from the dropdowns before importing.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Ready to import:{" "}
                <b>
                  {stagedItems.filter((i) => i.matchedCourseId).length} /{" "}
                  {stagedItems.length}
                </b>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Auto-Detected</th>
                  <th className="px-4 py-3">Target Course (Department)</th>
                  <th className="px-3 py-3">Exam Type</th>
                  <th className="px-3 py-3">Paper Set</th>
                  <th className="px-3 py-3">Match</th>
                  <th className="px-3 py-3 text-center">Questions</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stagedItems.map((item) => (
                  <tr
                    key={item.fileIndex}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <div className="font-semibold text-foreground max-w-xs truncate">
                            {item.fileName}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {(item.fileSize / 1024).toFixed(0)} KB
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {item.detectedCode ? (
                        <div>
                          <span className="font-mono font-bold text-primary">
                            {item.detectedCode}
                          </span>
                          {item.detectedTitle && (
                            <div className="text-[10px] text-muted-foreground max-w-[150px] truncate">
                              {item.detectedTitle}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="italic text-muted-foreground text-[11px]">
                          Not printed in header
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 min-w-[240px]">
                      <select
                        value={item.matchedCourseId || ""}
                        onChange={(e) =>
                          handleCourseMappingChange(
                            item.fileIndex,
                            e.target.value,
                          )
                        }
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-xs ${
                          item.matchedCourseId
                            ? "border-border bg-background"
                            : "border-rose-500 bg-rose-500/5 text-rose-600 font-semibold"
                        }`}
                      >
                        <option value="">⚠️ Select a course…</option>
                        {availableCourses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.course_code} — {c.subject_name}{" "}
                            {c.semester ? `(Sem ${c.semester})` : ""}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-3 py-3">
                      <select
                        value={item.detectedExamType}
                        onChange={(e) =>
                          handleExamTypeChange(item.fileIndex, e.target.value)
                        }
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                      >
                        <option value="MTT">MTT</option>
                        <option value="ETT">ETT</option>
                      </select>
                    </td>

                    <td className="px-3 py-3">
                      <input
                        type="text"
                        value={item.detectedPaperSet}
                        onChange={(e) =>
                          handleSetChange(item.fileIndex, e.target.value)
                        }
                        className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-xs"
                      />
                    </td>

                    <td className="px-3 py-3">
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase font-bold ${CONFIDENCE_BADGE[item.matchConfidence]}`}
                      >
                        {item.matchConfidence}
                      </Badge>
                    </td>

                    <td className="px-3 py-3 text-center">
                      {item.extractionStatus === "extracted" ? (
                        <span className="font-bold text-foreground">
                          {item.questionCount}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">
                          Pending
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(item.fileIndex)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-4 w-4 text-primary" />
              Extraction will create draft question mappings ready for
              Examination Cell review and publishing.
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                disabled={importing}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={
                  importing || stagedItems.some((i) => !i.matchedCourseId)
                }
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-md"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {importing
                  ? "Importing & Extracting…"
                  : `Confirm & Import ${stagedItems.length} Papers`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 4: Import Results Summary ──────────────────────────────────── */}
      {importSummary && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-foreground">
                Bulk Import Completed!
              </h4>
              <p className="text-xs text-muted-foreground">
                Successfully created and extracted{" "}
                {importSummary.successfulCount} of {importSummary.total}{" "}
                question papers into draft review state.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Paper File</th>
                  <th className="px-4 py-3">Exam</th>
                  <th className="px-4 py-3">Set</th>
                  <th className="px-4 py-3">Questions Extracted</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {importSummary.results.map((res, idx) => (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {res.fileName}
                    </td>
                    <td className="px-4 py-3">{res.examType || "MTT"}</td>
                    <td className="px-4 py-3">{res.paperSet || "Set 1"}</td>
                    <td className="px-4 py-3 font-bold text-primary">
                      {res.questionCount || 0} questions
                    </td>
                    <td className="px-4 py-3">
                      {res.success ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]"
                        >
                          EXTRACTED DRAFT
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-rose-500/10 text-rose-600 border-rose-500/30 text-[10px]"
                        >
                          FAILED: {res.error}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {res.paperId && (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/examinations/papers/${res.paperId}`)
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-secondary"
                        >
                          Review & Confirm <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary"
            >
              Upload Another Batch
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
