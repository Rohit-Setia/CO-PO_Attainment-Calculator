import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Settings, BookOpen, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import ConfirmDialog from '../ui/ConfirmDialog';
import { addCourseOutcome, archiveCourseOutcome } from '../../Api/AttainmentApi';

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const smallInputClass =
  'w-full rounded-lg border border-input bg-background p-2 text-xs text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

export default function ConfigTab({
  courseId,
  config,
  courseOutcomes,
  saving,
  handleConfigChange,
  handleCoFieldChange,
  saveConfigAndCos,
  onOutcomesChanged,
  readOnly = false
}) {
  const [addingCo, setAddingCo] = useState(false);
  const [pendingArchive, setPendingArchive] = useState(null); // { id, co_number }
  const [archiving, setArchiving] = useState(false);
  const maxCos = 30;

  // Guard: config not yet loaded from server
  if (!config || !courseOutcomes) {
    return (
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const handleAddCo = async () => {
    setAddingCo(true);
    try {
      const res = await addCourseOutcome(courseId, {});
      toast.success(`CO${res.data.data.co_number} added.`);
      await onOutcomesChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add Course Outcome.');
    } finally {
      setAddingCo(false);
    }
  };

  const confirmArchive = async () => {
    if (!pendingArchive) return;
    setArchiving(true);
    try {
      const res = await archiveCourseOutcome(courseId, pendingArchive.id);
      const { hadActiveQuestions, hadStudentMarks } = res.data.data || {};
      toast.success(
        hadActiveQuestions || hadStudentMarks
          ? `CO${pendingArchive.co_number} archived. Existing questions/marks referencing it are preserved.`
          : `CO${pendingArchive.co_number} archived.`
      );
      await onOutcomesChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to archive Course Outcome.');
    } finally {
      setArchiving(false);
      setPendingArchive(null);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="md:col-span-2 space-y-6">
        {/* Course Outcomes — dynamic list */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
            <h4 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <BookOpen className="h-5 w-5 text-primary" />
              Course Outcomes ({courseOutcomes.length})
            </h4>
            {!readOnly && (
              <button
                onClick={handleAddCo}
                disabled={addingCo || courseOutcomes.length >= maxCos}
                title={courseOutcomes.length >= maxCos ? `Maximum of ${maxCos} COs reached` : 'Add a new Course Outcome'}
                className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingCo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add Course Outcome
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {courseOutcomes.map((co) => (
              <motion.div
                key={co.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-3 rounded-xl border border-border bg-muted/30 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-primary">CO{co.co_number}</span>
                  {!readOnly && (
                    <button
                      onClick={() => setPendingArchive(co)}
                      className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                      title={`Archive CO${co.co_number}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <textarea
                  disabled={readOnly}
                  value={co.description || ''}
                  onChange={(e) => handleCoFieldChange(co.id, 'description', e.target.value)}
                  rows={2}
                  placeholder="Describe this course outcome..."
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground">Internal Max</label>
                    <input
                      type="number"
                      disabled={readOnly}
                      value={co.max_internal}
                      onChange={(e) => handleCoFieldChange(co.id, 'max_internal', parseFloat(e.target.value) || 0)}
                      className={smallInputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground">External Max</label>
                    <input
                      type="number"
                      disabled={readOnly}
                      value={co.max_external}
                      onChange={(e) => handleCoFieldChange(co.id, 'max_external', parseFloat(e.target.value) || 0)}
                      className={smallInputClass}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {!readOnly && (
            <button
              onClick={saveConfigAndCos}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-lg shadow-primary/15 transition hover:bg-primary-hover disabled:opacity-70"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Descriptions & Maximum Marks
            </button>
          )}
        </div>

        {/* Target & Weights */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h4 className="flex items-center gap-2 border-b border-border pb-2 text-lg font-bold text-foreground">
            <Settings className="h-5 w-5 text-primary" />
            Attainment Targets & Component Weightages
          </h4>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
              <h5 className="text-sm font-bold text-foreground">Internal Exam targets (MTT)</h5>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Threshold Success rate %</label>
                <input type="number" name="threshold_percent_internal" disabled={readOnly} value={config.threshold_percent_internal} onChange={handleConfigChange} className={inputClass} />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] text-muted-foreground">Level 1 %</label>
                  <input type="number" name="level1_criteria_internal" disabled={readOnly} value={config.level1_criteria_internal} onChange={handleConfigChange} className={smallInputClass} />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground">Level 2 %</label>
                  <input type="number" name="level2_criteria_internal" disabled={readOnly} value={config.level2_criteria_internal} onChange={handleConfigChange} className={smallInputClass} />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground">Level 3 %</label>
                  <input type="number" name="level3_criteria_internal" disabled={readOnly} value={config.level3_criteria_internal} onChange={handleConfigChange} className={smallInputClass} />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">Total Component Max:</span>
                <input type="number" name="total_max_internal" disabled={readOnly} value={config.total_max_internal} onChange={handleConfigChange} className="w-16 rounded border border-input bg-background px-2 py-1 text-center font-bold text-primary disabled:opacity-60" />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Weightage in Final CO %:</span>
                <input type="number" name="internal_weight" disabled={readOnly} value={config.internal_weight} onChange={handleConfigChange} className="w-16 rounded border border-input bg-background px-2 py-1 text-center font-bold text-warning disabled:opacity-60" />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
              <h5 className="text-sm font-bold text-foreground">External Exam targets (ETT)</h5>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Threshold Success rate %</label>
                <input type="number" name="threshold_percent_external" disabled={readOnly} value={config.threshold_percent_external} onChange={handleConfigChange} className={inputClass} />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] text-muted-foreground">Level 1 %</label>
                  <input type="number" name="level1_criteria_external" disabled={readOnly} value={config.level1_criteria_external} onChange={handleConfigChange} className={smallInputClass} />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground">Level 2 %</label>
                  <input type="number" name="level2_criteria_external" disabled={readOnly} value={config.level2_criteria_external} onChange={handleConfigChange} className={smallInputClass} />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground">Level 3 %</label>
                  <input type="number" name="level3_criteria_external" disabled={readOnly} value={config.level3_criteria_external} onChange={handleConfigChange} className={smallInputClass} />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">Total Component Max:</span>
                <input type="number" name="total_max_external" disabled={readOnly} value={config.total_max_external} onChange={handleConfigChange} className="w-16 rounded border border-input bg-background px-2 py-1 text-center font-bold text-primary disabled:opacity-60" />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Weightage in Final CO %:</span>
                <input type="number" name="external_weight" disabled={readOnly} value={config.external_weight} onChange={handleConfigChange} className="w-16 rounded border border-input bg-background px-2 py-1 text-center font-bold text-warning disabled:opacity-60" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <p className="font-bold text-foreground mb-2">How this works</p>
          <p>Each Course Outcome you add here immediately becomes available across the whole workspace — question mapping, CO-PO/PSO mapping, marks entry, attainment, charts, and exports all read the current CO list directly from the server, not a fixed count.</p>
        </div>
      </div>

      <ConfirmDialog
        open={pendingArchive !== null}
        title={pendingArchive ? `Archive CO${pendingArchive.co_number}?` : ''}
        description="This removes it from active configuration, dropdowns, and new attainment calculations. Any questions, student marks, and CO-PO/PSO mappings already recorded against it are kept, not deleted."
        confirmLabel="Archive"
        danger
        loading={archiving}
        onConfirm={confirmArchive}
        onCancel={() => setPendingArchive(null)}
      />
    </div>
  );
}
