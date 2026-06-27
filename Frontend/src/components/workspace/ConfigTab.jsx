import React from 'react';
import { Settings, Edit3, BookOpen, Save, Loader2 } from 'lucide-react';

export default function ConfigTab({
  config,
  coDescriptions,
  course,
  saving,
  handleConfigChange,
  handleCoDescChange,
  saveConfigAndCos
}) {
  // Guard: config not yet loaded from server
  if (!config || !course) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
        <span className="text-sm">Loading configuration...</span>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Target & Weights */}
      <div className="md:col-span-2 space-y-6">
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 space-y-4">
          <h4 className="font-bold text-lg text-slate-100 flex items-center gap-2 border-b border-slate-700/50 pb-2">
            <Settings className="h-5 w-5 text-blue-400" />
            Attainment Targets & Component Weightages
          </h4>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Internal config */}
            <div className="space-y-3 p-4 rounded-xl border border-slate-700/40 bg-slate-900/30">
              <h5 className="font-bold text-sm text-slate-300">Internal Exam targets (MTT)</h5>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Threshold Success rate %</label>
                <input
                  type="number"
                  name="threshold_percent_internal"
                  value={config.threshold_percent_internal}
                  onChange={handleConfigChange}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] text-slate-500">Level 1 %</label>
                  <input
                    type="number"
                    name="level1_criteria_internal"
                    value={config.level1_criteria_internal}
                    onChange={handleConfigChange}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500">Level 2 %</label>
                  <input
                    type="number"
                    name="level2_criteria_internal"
                    value={config.level2_criteria_internal}
                    onChange={handleConfigChange}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500">Level 3 %</label>
                  <input
                    type="number"
                    name="level3_criteria_internal"
                    value={config.level3_criteria_internal}
                    onChange={handleConfigChange}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* External config */}
            <div className="space-y-3 p-4 rounded-xl border border-slate-700/40 bg-slate-900/30">
              <h5 className="font-bold text-sm text-slate-300">External Exam targets (ETT)</h5>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Threshold Success rate %</label>
                <input
                  type="number"
                  name="threshold_percent_external"
                  value={config.threshold_percent_external}
                  onChange={handleConfigChange}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] text-slate-500">Level 1 %</label>
                  <input
                    type="number"
                    name="level1_criteria_external"
                    value={config.level1_criteria_external}
                    onChange={handleConfigChange}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500">Level 2 %</label>
                  <input
                    type="number"
                    name="level2_criteria_external"
                    value={config.level2_criteria_external}
                    onChange={handleConfigChange}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500">Level 3 %</label>
                  <input
                    type="number"
                    name="level3_criteria_external"
                    value={config.level3_criteria_external}
                    onChange={handleConfigChange}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-100 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-slate-700/50">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Internal Exam Weightage %</label>
              <input
                type="number"
                name="internal_weight"
                value={config.internal_weight}
                onChange={(e) => {
                  const w = parseFloat(e.target.value) || 0;
                  handleConfigChange({
                    target: {
                      name: 'internal_weight',
                      value: w
                    }
                  });
                  handleConfigChange({
                    target: {
                      name: 'external_weight',
                      value: Math.max(0, 100 - w)
                    }
                  });
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">External Exam Weightage %</label>
              <input
                type="number"
                name="external_weight"
                value={config.external_weight}
                onChange={(e) => {
                  const w = parseFloat(e.target.value) || 0;
                  handleConfigChange({
                    target: {
                      name: 'external_weight',
                      value: w
                    }
                  });
                  handleConfigChange({
                    target: {
                      name: 'internal_weight',
                      value: Math.max(0, 100 - w)
                    }
                  });
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Maximum Marks configuration */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 space-y-4">
          <h4 className="font-bold text-lg text-slate-100 flex items-center gap-2 border-b border-slate-700/50 pb-2">
            <Edit3 className="h-5 w-5 text-blue-400" />
            CO Maximum Marks Split Configurations
          </h4>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-6">
            {Array.from({ length: course.num_cos }).map((_, i) => (
              <div key={i} className="p-3 border border-slate-700/50 rounded-xl bg-slate-900/20 text-center space-y-2">
                <p className="text-xs font-bold text-blue-400">CO{i + 1}</p>
                <div>
                  <label className="block text-[9px] text-slate-500">Max for Int</label>
                  <input
                    type="number"
                    value={config[`co${i + 1}_max_internal`] ?? 10}
                    onChange={(e) => handleConfigChange({
                      target: {
                        name: `co${i + 1}_max_internal`,
                        value: parseInt(e.target.value) || 0
                      }
                    })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-1 text-center text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-500">Max for Ext</label>
                  <input
                    type="number"
                    value={config[`co${i + 1}_max_external`] ?? 20}
                    onChange={(e) => handleConfigChange({
                      target: {
                        name: `co${i + 1}_max_external`,
                        value: parseInt(e.target.value) || 0
                      }
                    })}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-1 text-center text-xs text-white"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CO Descriptions list */}
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 space-y-4 h-full flex flex-col justify-between">
          <div className="space-y-4">
            <h4 className="font-bold text-lg text-slate-100 flex items-center gap-2 border-b border-slate-700/50 pb-2">
              <BookOpen className="h-5 w-5 text-blue-400" />
              CO Description statements
            </h4>
            <div className="space-y-3 overflow-y-auto max-h-[350px] pr-1">
              {coDescriptions.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <label className="block text-xs font-bold text-slate-400">CO{item.co_number} Statement</label>
                  <textarea
                    value={item.description}
                    onChange={(e) => handleCoDescChange(idx, e.target.value)}
                    rows={2}
                    placeholder="Describe learning outcomes..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 text-xs focus:border-blue-500 focus:outline-none resize-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={saveConfigAndCos}
            disabled={saving}
            className="w-full mt-4 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition shadow-lg shadow-blue-600/15"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Setup Configurations
          </button>
        </div>
      </div>
    </div>
  );
}
