import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Save, Loader2, ClipboardList } from 'lucide-react';

// Teacher-controlled Question Paper Configuration — the single place question count, question
// maximum marks, and question -> CO mapping are set. Nothing elsewhere in the app invents a
// default mapping; Marks Entry only ever reads what was explicitly saved here.
export default function QuestionConfigPanel({
  courseOutcomes,
  isInternal,
  draftQuestions,
  addQuestion,
  removeQuestion,
  updateQuestion,
  saveQuestions,
  savingQuestions,
  maxAllowed = 50,
  readOnly = false,
}) {
  const totalMarks = draftQuestions.reduce((sum, q) => sum + (parseFloat(q.max_marks) || 0), 0);

  const allocationByCoId = new Map();
  draftQuestions.forEach((q) => {
    if (!q.co_id) return;
    allocationByCoId.set(q.co_id, (allocationByCoId.get(q.co_id) || 0) + (parseFloat(q.max_marks) || 0));
  });

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-3 sm:flex-row sm:items-center">
        <h4 className="flex items-center gap-2 text-base font-bold text-foreground">
          <ClipboardList className="h-4 w-4 text-primary" />
          Question Paper Configuration
        </h4>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addQuestion}
              disabled={draftQuestions.length >= maxAllowed}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add Question
            </button>
            <button
              type="button"
              onClick={saveQuestions}
              disabled={savingQuestions || draftQuestions.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-primary-hover disabled:opacity-60"
            >
              {savingQuestions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Question Configuration
            </button>
          </div>
        )}
      </div>

      {courseOutcomes.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Add at least one Course Outcome in Setup & Configs first.</p>
      ) : draftQuestions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No questions configured yet. Click "Add Question" to start building the paper.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="border-b border-r border-border px-3 py-2 text-left text-xs">Question</th>
                  <th className="border-b border-r border-border px-3 py-2 text-left text-xs">Course Outcome</th>
                  <th className="border-b border-r border-border px-3 py-2 text-left text-xs">Maximum Marks</th>
                  {!readOnly && <th className="border-b border-border px-3 py-2 text-center text-xs">Remove</th>}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {draftQuestions.map((q, idx) => (
                    <motion.tr
                      key={q.key}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-border last:border-0"
                    >
                      <td className="border-r border-border px-3 py-2 font-semibold text-foreground">Q{q.question_number}</td>
                      <td className="border-r border-border px-3 py-2">
                        <select
                          disabled={readOnly}
                          value={q.co_id || ''}
                          onChange={(e) => updateQuestion(idx, 'co_id', parseInt(e.target.value, 10))}
                          className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="" disabled>Select CO</option>
                          {courseOutcomes.map((co) => (
                            <option key={co.id} value={co.id}>CO{co.co_number}</option>
                          ))}
                        </select>
                      </td>
                      <td className="border-r border-border px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          disabled={readOnly}
                          value={q.max_marks}
                          onChange={(e) => updateQuestion(idx, 'max_marks', e.target.value)}
                          className="w-24 rounded-lg border border-input bg-background px-2 py-1.5 text-center text-xs font-semibold text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </td>
                      {!readOnly && (
                        <td className="px-3 py-2 text-center">
                          <button type="button" onClick={() => removeQuestion(idx)} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive" title="Remove question">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-semibold text-foreground">Total Questions: {draftQuestions.length}</span>
            <span className="font-semibold text-foreground">Total Paper Marks: {totalMarks}</span>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">CO Allocation Summary</p>
            <div className="flex flex-wrap gap-2">
              {courseOutcomes.map((co) => {
                const allocated = allocationByCoId.get(co.id) || 0;
                const max = parseFloat(isInternal ? co.max_internal : co.max_external);
                const overAllocated = allocated > max;
                return (
                  <span
                    key={co.id}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                      overAllocated
                        ? 'border-destructive/40 bg-destructive/10 text-destructive'
                        : allocated === max && allocated > 0
                          ? 'border-success/40 bg-success/10 text-success'
                          : 'border-border bg-muted/40 text-muted-foreground'
                    }`}
                    title={overAllocated ? `Exceeds configured maximum of ${max}` : undefined}
                  >
                    CO{co.co_number}: {allocated} / {max}
                  </span>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
