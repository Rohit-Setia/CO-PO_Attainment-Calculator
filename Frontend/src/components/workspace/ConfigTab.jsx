import { Settings, Edit3, BookOpen, Save, Loader2 } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const smallInputClass =
  'w-full rounded-lg border border-input bg-background p-2 text-xs text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

export default function ConfigTab({
  config,
  coDescriptions,
  course,
  saving,
  handleConfigChange,
  handleCoDescChange,
  saveConfigAndCos,
  readOnly = false
}) {
  // Guard: config not yet loaded from server
  if (!config || !course) {
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

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Target & Weights */}
      <div className="md:col-span-2 space-y-6">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h4 className="flex items-center gap-2 border-b border-border pb-2 text-lg font-bold text-foreground">
            <Settings className="h-5 w-5 text-primary" />
            Attainment Targets & Component Weightages
          </h4>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Internal config */}
            <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
              <h5 className="text-sm font-bold text-foreground">Internal Exam targets (MTT)</h5>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Threshold Success rate %</label>
                <input
                  type="number"
                  name="threshold_percent_internal"
                  disabled={readOnly}
                  value={config.threshold_percent_internal}
                  onChange={handleConfigChange}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] text-muted-foreground">Level 1 %</label>
                  <input
                    type="number"
                    name="level1_criteria_internal"
                    disabled={readOnly}
                    value={config.level1_criteria_internal}
                    onChange={handleConfigChange}
                    className={smallInputClass}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground">Level 2 %</label>
                  <input
                    type="number"
                    name="level2_criteria_internal"
                    disabled={readOnly}
                    value={config.level2_criteria_internal}
                    onChange={handleConfigChange}
                    className={smallInputClass}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground">Level 3 %</label>
                  <input
                    type="number"
                    name="level3_criteria_internal"
                    disabled={readOnly}
                    value={config.level3_criteria_internal}
                    onChange={handleConfigChange}
                    className={smallInputClass}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">Total Component Max:</span>
                <input
                  type="number"
                  name="total_max_internal"
                  disabled={readOnly}
                  value={config.total_max_internal}
                  onChange={handleConfigChange}
                  className="w-16 rounded border border-input bg-background px-2 py-1 text-center font-bold text-primary disabled:opacity-60"
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Weightage in Final CO %:</span>
                <input
                  type="number"
                  name="internal_weight"
                  disabled={readOnly}
                  value={config.internal_weight}
                  onChange={handleConfigChange}
                  className="w-16 rounded border border-input bg-background px-2 py-1 text-center font-bold text-warning disabled:opacity-60"
                />
              </div>
            </div>

            {/* External config */}
            <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
              <h5 className="text-sm font-bold text-foreground">External Exam targets (ETT)</h5>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Threshold Success rate %</label>
                <input
                  type="number"
                  name="threshold_percent_external"
                  disabled={readOnly}
                  value={config.threshold_percent_external}
                  onChange={handleConfigChange}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] text-muted-foreground">Level 1 %</label>
                  <input
                    type="number"
                    name="level1_criteria_external"
                    disabled={readOnly}
                    value={config.level1_criteria_external}
                    onChange={handleConfigChange}
                    className={smallInputClass}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground">Level 2 %</label>
                  <input
                    type="number"
                    name="level2_criteria_external"
                    disabled={readOnly}
                    value={config.level2_criteria_external}
                    onChange={handleConfigChange}
                    className={smallInputClass}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground">Level 3 %</label>
                  <input
                    type="number"
                    name="level3_criteria_external"
                    disabled={readOnly}
                    value={config.level3_criteria_external}
                    onChange={handleConfigChange}
                    className={smallInputClass}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">Total Component Max:</span>
                <input
                  type="number"
                  name="total_max_external"
                  disabled={readOnly}
                  value={config.total_max_external}
                  onChange={handleConfigChange}
                  className="w-16 rounded border border-input bg-background px-2 py-1 text-center font-bold text-primary disabled:opacity-60"
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Weightage in Final CO %:</span>
                <input
                  type="number"
                  name="external_weight"
                  disabled={readOnly}
                  value={config.external_weight}
                  onChange={handleConfigChange}
                  className="w-16 rounded border border-input bg-background px-2 py-1 text-center font-bold text-warning disabled:opacity-60"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Maximum Marks configuration */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h4 className="flex items-center gap-2 border-b border-border pb-2 text-lg font-bold text-foreground">
            <Edit3 className="h-5 w-5 text-primary" />
            CO Maximum Marks Split Configurations
          </h4>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
            {Array.from({ length: course.num_cos }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-center">
                <p className="text-xs font-bold text-primary">CO{i + 1}</p>
                <div>
                  <label className="block text-[9px] text-muted-foreground">Max for Int</label>
                  <input
                    type="number"
                    disabled={readOnly}
                    value={config[`co${i + 1}_max_internal`] ?? 10}
                    onChange={(e) => handleConfigChange({
                      target: {
                        name: `co${i + 1}_max_internal`,
                        value: parseInt(e.target.value) || 0
                      }
                    })}
                    className="w-full rounded border border-input bg-background p-1 text-center text-xs text-foreground disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-muted-foreground">Max for Ext</label>
                  <input
                    type="number"
                    disabled={readOnly}
                    value={config[`co${i + 1}_max_external`] ?? 20}
                    onChange={(e) => handleConfigChange({
                      target: {
                        name: `co${i + 1}_max_external`,
                        value: parseInt(e.target.value) || 0
                      }
                    })}
                    className="w-full rounded border border-input bg-background p-1 text-center text-xs text-foreground disabled:opacity-60"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CO Descriptions list */}
      <div className="space-y-6">
        <div className="flex h-full flex-col justify-between space-y-4 rounded-2xl border border-border bg-card p-6">
          <div className="space-y-4">
            <h4 className="flex items-center gap-2 border-b border-border pb-2 text-lg font-bold text-foreground">
              <BookOpen className="h-5 w-5 text-primary" />
              CO Description statements
            </h4>
            <div className="max-h-[350px] space-y-3 overflow-y-auto pr-1">
              {coDescriptions.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <label className="block text-xs font-bold text-muted-foreground">CO{item.co_number} Statement</label>
                  <textarea
                    disabled={readOnly}
                    value={item.description}
                    onChange={(e) => handleCoDescChange(idx, e.target.value)}
                    rows={2}
                    placeholder="Describe learning outcomes..."
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground transition focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              ))}
            </div>
          </div>

          {!readOnly && (
            <button
              onClick={saveConfigAndCos}
              disabled={saving}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground shadow-lg shadow-primary/15 transition hover:bg-primary-hover disabled:opacity-70"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Setup Configurations
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
