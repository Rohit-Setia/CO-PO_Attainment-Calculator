import { Upload, Users, Loader2, Save, Plus } from "lucide-react";
import StudentTable from "../StudentTable";
import QuestionWiseTable from "../QuestionWiseTable";
import QuestionConfigPanel from "./QuestionConfigPanel";
import EmptyState from "../ui/EmptyState";

const segmentBtn = (active) =>
  `rounded-xl border px-3 py-2 text-xs font-semibold transition ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
  }`;

export default function MarksTab({
  courseOutcomes,
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
  updateStudentInfo,
  removeStudent,
  addStudentRow,
  readOnly = false,
}) {
  const isInternal = activeExamType === 'MTT';

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
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setEntryMode("co")} className={segmentBtn(entryMode === "co")}>
              Direct CO-Wise
            </button>
            <button type="button" onClick={() => setEntryMode("question")} className={segmentBtn(entryMode === "question")}>
              Question-Wise
            </button>
          </div>
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
        />
      )}

      {/* Main spreadsheet interface card */}
      <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-center">
          <div>
            <h4 className="text-lg font-bold text-foreground">
              {activeExamType === "MTT" ? "MTT Assessment Grades Sheet" : "End-Sem ETT Grades Sheet"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {entryMode === 'question'
                ? 'Marks are entered per question below, using the Question Paper Configuration above.'
                : 'Enter each student\'s total marks directly per Course Outcome.'}
            </p>
          </div>

          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary">
                <Upload className="h-3.5 w-3.5" /> Import Excel
                <input type="file" accept=".xlsx, .xls" onChange={handleExcelUpload} className="hidden" />
              </label>
              <button
                onClick={addStudentRow}
                className="flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
              >
                <Plus className="h-3.5 w-3.5" /> Add Student Row
              </button>
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
            title="No student rows yet"
            description="Add rows manually or import via Excel to start entering marks."
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
              updateStudentInfo={updateStudentInfo}
              removeStudent={removeStudent}
              courseOutcomes={courseOutcomes}
              isInternal={isInternal}
              readOnly={readOnly}
            />
          </div>
        )}
      </div>
    </div>
  );
}
