import { Upload, Users, Loader2, Save, Plus, Info, Sparkles, Scale } from "lucide-react";
import StudentTable from "../StudentTable";
import QuestionWiseTable from "../QuestionWiseTable";
import QuestionConfigPanel from "./QuestionConfigPanel";
import EmptyState from "../ui/EmptyState";
import { getCoWeightageBreakdown, calculateExamTotalMax } from "../../utils/marksDistribution";
import { useAuth } from "../../context/AuthContext";

const segmentBtn = (active) =>
  `rounded-xl border px-3 py-2 text-xs font-semibold transition text-center ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
  }`;

export default function MarksTab({
  courseOutcomes = [],
  students,
  activeExamType,
  setActiveExamType,
  entryMode,
  setEntryMode,
  draftQuestions,
  addQuestion,
  removeQuestion,
  updateQuestion,
  saveQuestions,
  savingQuestions,
  maxQuestionsAllowed,
  savedQuestions,
  handleExcelUpload,
  saving,
  saveMarksList,
  updateMark,
  updateTotalMark,
  updateStudentInfo,
  removeStudent,
  addStudentRow,
  readOnly = false,
  questionsLocked = false,
  course = null,
  hierarchy = null,
  studentsAutoLoaded = false,
}) {
  const isInternal = activeExamType === 'MTT';
  const contextStudents = hierarchy?.linked && studentsAutoLoaded;
  const weightages = getCoWeightageBreakdown(courseOutcomes, isInternal);
  const examTotalMax = calculateExamTotalMax(courseOutcomes, isInternal);
  const { hasRole } = useAuth();
  const canChooseEntryMode = hasRole('Admin', 'Moderator', 'School Admin', 'Department Admin', 'Examination Team');

  return (
    <div className="space-y-6">
      {/* Top controls: Component selection and Entry Mode selector */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h4 className="border-b border-border pb-2 text-base font-bold text-foreground">
            Exam Component
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setActiveExamType("MTT")} className={segmentBtn(activeExamType === "MTT")}>
              MTT (Internal)
            </button>
            <button type="button" onClick={() => setActiveExamType("ETT")} className={segmentBtn(activeExamType === "ETT")}>
              ETT (External)
            </button>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h4 className="border-b border-border pb-2 text-base font-bold text-foreground">
            Data Entry Mode
          </h4>
          {canChooseEntryMode ? (
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setEntryMode("co")} className={segmentBtn(entryMode === "co")}>
                Direct CO-Wise
              </button>
              <button type="button" onClick={() => setEntryMode("question")} className={segmentBtn(entryMode === "question")}>
                Question-Wise
              </button>
              <button type="button" onClick={() => setEntryMode("total")} className={segmentBtn(entryMode === "total")}>
                Total Marks (Auto)
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Question-Wise Entry Mode</span>
            </div>
          )}
        </div>
      </div>

      {entryMode === "question" && (
        <QuestionConfigPanel
          courseOutcomes={courseOutcomes}
          isInternal={isInternal}
          draftQuestions={draftQuestions}
          addQuestion={addQuestion}
          removeQuestion={removeQuestion}
          updateQuestion={updateQuestion}
          saveQuestions={saveQuestions}
          savingQuestions={savingQuestions}
          maxAllowed={maxQuestionsAllowed}
          readOnly={readOnly}
          locked={questionsLocked}
        />
      )}

      {entryMode === "total" && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <h5 className="flex items-center gap-1.5 font-bold text-foreground text-sm">
                  <span>Proportional CO Weightage Distribution</span>
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {activeExamType} Total Max: {examTotalMax} Marks
                  </span>
                </h5>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Entering each student's Total Marks in the table below automatically distributes marks to active Course Outcomes in exact proportion to their configured weightages:
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-primary/10">
            {weightages.map((w) => (
              <div key={w.coId} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs shadow-sm">
                <span className="font-bold text-foreground">CO{w.coNumber}</span>
                <span className="text-muted-foreground">({w.maxMarks} max)</span>
                <span className="font-semibold text-primary">→ {w.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main spreadsheet interface card */}
      <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-center">
          <div>
            <h4 className="text-lg font-bold text-foreground">
              {activeExamType === "MTT" ? "MTT Assessment Grades Sheet" : "End-Sem ETT Grades Sheet"}
            </h4>
            {hierarchy?.linked && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
                Students automatically loaded from the academic context:
                {hierarchy.programName}{hierarchy.programCode ? ` (${hierarchy.programCode})` : ''}
                {' · '}Semester {course?.semester} · {hierarchy.sessionName}
                {' · '}{students.length} student{students.length === 1 ? '' : 's'}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {entryMode === 'question'
                ? 'Marks are entered per question below, using the Question Paper Configuration above.'
                : entryMode === 'total'
                ? 'Enter each student\'s total exam score in the Total column below — CO marks will auto-distribute proportionally based on weightage.'
                : 'Enter each student\'s total marks directly per Course Outcome.'}
            </p>
          </div>

          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary" title="Optional: bulk import/update marks from an Excel file">
                <Upload className="h-3.5 w-3.5" /> Import Excel
                <input type="file" accept=".xlsx, .xls" onChange={handleExcelUpload} className="hidden" />
              </label>
              {!contextStudents && (
                <button
                  onClick={addStudentRow}
                  className="flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
                  title={hierarchy?.linked ? 'Students load automatically from Student Management — add rows only for exceptional cases.' : 'Add a manual student row (course not linked to the academic hierarchy).'}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Student Row
                </button>
              )}
              <button
                onClick={saveMarksList}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-md transition hover:bg-primary-hover disabled:opacity-70"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save All Grades
              </button>
            </div>
          )}
        </div>

        {entryMode === 'question' && savedQuestions.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Configure the question paper first"
            description="Add and save at least one question above before entering question-wise marks."
          />
        ) : students.length === 0 ? (
          <EmptyState
            icon={Users}
            title={hierarchy?.linked ? "No students are enrolled in this academic context" : "No student rows yet"}
            description={hierarchy?.linked
              ? "Upload the student Excel in the Student Management section above, or ask an Administrator to enroll students into this Program / Semester."
              : "This course is not linked to the academic hierarchy. Add rows manually or import via Excel to start entering marks."}
          />
        ) : entryMode === "question" ? (
          <div className="overflow-x-auto">
            <QuestionWiseTable
              students={students}
              questions={savedQuestions}
              updateMark={updateMark}
              updateStudentInfo={updateStudentInfo}
              removeStudent={removeStudent}
              readOnly={readOnly}
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <StudentTable
              students={students}
              updateMark={updateMark}
              updateTotalMark={updateTotalMark}
              updateStudentInfo={updateStudentInfo}
              removeStudent={removeStudent}
              courseOutcomes={courseOutcomes}
              isInternal={isInternal}
              readOnly={readOnly}
              entryMode={entryMode}
            />
          </div>
        )}
      </div>
    </div>
  );
}
