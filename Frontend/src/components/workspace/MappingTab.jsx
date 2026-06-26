import React from 'react';
import { Save, Loader2 } from 'lucide-react';

export default function MappingTab({
  course,
  mapping,
  saving,
  handleMappingChange,
  getColAvg,
  saveMappingMatrix
}) {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/50 pb-4">
        <div>
          <h4 className="font-bold text-lg text-slate-100">CO-PO Articulation Matrix</h4>
          <p className="text-xs text-slate-400">Establish the correlation between Course Outcomes (COs) and Program Outcomes (POs/PSOs).</p>
        </div>
        <button
          onClick={saveMappingMatrix}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-md transition"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Mappings
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full text-sm text-center border-collapse">
          <thead className="bg-slate-900 font-bold text-slate-300">
            <tr>
              <th className="border-r border-b border-slate-700/60 px-4 py-3 text-left bg-slate-900/50 w-24">CO / PO</th>
              {Array.from({ length: 12 }).map((_, i) => (
                <th key={i} className="border-r border-b border-slate-700/60 px-2 py-3 text-xs">PO{i + 1}</th>
              ))}
              <th className="border-r border-b border-slate-700/60 px-2 py-3 text-xs">PSO1</th>
              <th className="border-r border-b border-slate-700/60 px-2 py-3 text-xs">PSO2</th>
              <th className="border-b border-slate-700/60 px-2 py-3 text-xs">PSO3</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: course.num_cos }).map((_, coIdx) => {
              const coNum = coIdx + 1;
              return (
                <tr key={coNum} className="hover:bg-slate-800/20 border-b border-slate-700/40">
                  <td className="border-r border-slate-700/60 px-4 py-3 font-bold text-left bg-slate-900/20 text-slate-300">CO{coNum}</td>
                  {Array.from({ length: 12 }).map((_, poIdx) => {
                    const poNum = poIdx + 1;
                    const key = `co${coNum}_po${poNum}`;
                    return (
                      <td key={poIdx} className="border-r border-slate-700/60 p-1">
                        <select
                          value={mapping[key] || 0}
                          onChange={(e) => handleMappingChange(coNum, `PO${poNum}`, e.target.value)}
                          className="w-full bg-transparent border-0 text-center font-semibold text-slate-200 focus:outline-none focus:ring-0 cursor-pointer text-xs"
                        >
                          <option value={0} className="bg-slate-800 text-slate-400">-</option>
                          <option value={1} className="bg-slate-800 text-slate-200">1</option>
                          <option value={2} className="bg-slate-800 text-slate-200">2</option>
                          <option value={3} className="bg-slate-800 text-slate-200">3</option>
                        </select>
                      </td>
                    );
                  })}
                  {/* PSOs */}
                  {['pso1', 'pso2', 'pso3'].map((psoKey, psoIdx) => {
                    const key = `co${coNum}_${psoKey}`;
                    return (
                      <td key={psoKey} className={`${psoIdx < 2 ? 'border-r' : ''} border-slate-700/60 p-1`}>
                        <select
                          value={mapping[key] || 0}
                          onChange={(e) => handleMappingChange(coNum, psoKey.toUpperCase(), e.target.value)}
                          className="w-full bg-transparent border-0 text-center font-semibold text-slate-200 focus:outline-none focus:ring-0 cursor-pointer text-xs"
                        >
                          <option value={0} className="bg-slate-800 text-slate-400">-</option>
                          <option value={1} className="bg-slate-800 text-slate-200">1</option>
                          <option value={2} className="bg-slate-800 text-slate-200">2</option>
                          <option value={3} className="bg-slate-800 text-slate-200">3</option>
                        </select>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Articulation Averages row */}
            <tr className="bg-slate-900/30 border-t border-slate-700 font-bold">
              <td className="border-r border-slate-700 px-4 py-3 text-left text-slate-300">Average</td>
              {Array.from({ length: 12 }).map((_, poIdx) => {
                const poNum = poIdx + 1;
                return (
                  <td key={poIdx} className="border-r border-slate-700 px-2 py-3 text-xs text-amber-400">
                    {getColAvg(`PO${poNum}`)}
                  </td>
                );
              })}
              <td className="border-r border-slate-700 px-2 py-3 text-xs text-amber-400">{getColAvg('PSO1')}</td>
              <td className="border-r border-slate-700 px-2 py-3 text-xs text-amber-400">{getColAvg('PSO2')}</td>
              <td className="px-2 py-3 text-xs text-amber-400">{getColAvg('PSO3')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
