import { Upload, Users, Loader2, Save, Plus, HelpCircle } from "lucide-react";
import StudentTable from "../StudentTable";
import QuestionWiseTable from "../QuestionWiseTable";
import EmptyState from "../ui/EmptyState";

const segmentBtn = (active) =>
  `rounded-xl border px-3 py-2 text-xs font-semibold transition ${
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
  }`;

export default function MarksTab({
  coMax = {},
  numCos = 5,
  students,
  activeExamType,
  setActiveExamType,
  entryMode,
  setEntryMode,
  questions,
  setQuestions,
  numQuestionsInput,
  setNumQuestionsInput,
  handleExcelUpload,
  saving,
  saveMarksList,
  updateMark,
  updateQuestionConfig,
  updateStudentInfo,
  removeStudent,
  addStudentRow,
  readOnly = false,
}) {
  return (
    <div className="space-y-6">
      {/* Top controls: Component selection and Entry Mode selector */}
      <div className="grid gap-6 md:grid-cols-4">
        {/* Component Selector */}
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

        {/* Data Entry Mode Selector */}
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

        {/* Question Wise config fields (Visible only in question mode) */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6 md:col-span-2">
          {entryMode === "question" ? (
            <>
              <h4 className="border-b border-border pb-2 text-base font-bold text-foreground">
                Questions Count
              </h4>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  disabled={readOnly}
                  value={numQuestionsInput}
                  onChange={(e) => {
                    const valStr = e.target.value;
                    setNumQuestionsInput(valStr);
                    const val = parseInt(valStr);
                    if (!isNaN(val) && val >= 1 && val <= 30) {
                      // Adjust questions count
                      setQuestions((prev) => {
                        if (prev.length === val) return prev;
                        if (prev.length < val) {
                          const added = Array.from(
                            { length: val - prev.length },
                            (_, i) => ({
                              id: prev.length + i + 1,
                              label: `Q${prev.length + i + 1}`,
                              co: "co1",
                              maxMarks: 10,
                            }),
                          );
                          return [...prev, ...added];
                        } else {
                          return prev.slice(0, val);
                        }
                      });
                    }
                  }}
                  className="w-20 rounded-lg border border-input bg-background px-2 py-1.5 text-center text-sm font-bold text-primary transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
                <span className="text-xs text-muted-foreground">
                  (Specify questions count from 1 to 30)
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center gap-1.5 py-2 text-xs italic text-muted-foreground">
              <HelpCircle className="h-4 w-4" />
              Direct mode inputs totals per CO column directly.
            </div>
          )}
        </div>
      </div>

      {/* Main spreadsheet interface card */}
      <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-center">
          <div>
            <h4 className="text-lg font-bold text-foreground">
              {activeExamType === "MTT"
                ? "MTT Assessment Grades Sheet"
                : "End-Sem ETT Grades Sheet"}
            </h4>
            <p className="text-xs text-muted-foreground">
              Configure question layouts, input marks per column, or upload
              Excel spreadsheets to populate.
            </p>
          </div>

          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary">
                <Upload className="h-3.5 w-3.5" /> Import Excel
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleExcelUpload}
                  className="hidden"
                />
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
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save All Grades
              </button>
            </div>
          )}
        </div>

        {/* Data list view */}
        {students.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No student rows yet"
            description="Add rows manually or import via Excel to start entering marks."
          />
        ) : entryMode === "question" ? (
          <div className="overflow-x-auto">
            <QuestionWiseTable
              students={students}
              questions={questions}
              updateMark={updateMark}
              updateQuestionConfig={updateQuestionConfig}
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
              numCos={numCos}
              coMax={coMax}
              readOnly={readOnly}
            />
          </div>
        )}
      </div>
    </div>
  );
}
