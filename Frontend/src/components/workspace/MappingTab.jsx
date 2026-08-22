import { Save, Loader2 } from 'lucide-react';

// Heatmap intensity per correlation level — 0 = no fill, 3 = strongest —
// so the matrix reads as a heatmap at a glance, not just a grid of numbers.
const CELL_TONE = {
  0: 'bg-transparent text-muted-foreground',
  1: 'bg-primary/10 text-primary',
  2: 'bg-primary/25 text-primary',
  3: 'bg-primary/45 text-primary font-bold',
};

const LEVEL_LABEL = { 0: 'No correlation', 1: 'Low', 2: 'Medium', 3: 'High' };

function MappingSelect({ value, onChange, disabled, label }) {
  const v = value || 0;
  return (
    <select
      disabled={disabled}
      value={v}
      onChange={onChange}
      title={`${label}: ${LEVEL_LABEL[v]}`}
      className={`w-full border-0 text-center text-xs font-semibold outline-none transition-colors focus:ring-1 focus:ring-ring ${CELL_TONE[v]} ${disabled ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
    >
      <option value={0} className="bg-popover text-muted-foreground">-</option>
      <option value={1} className="bg-popover text-popover-foreground">1</option>
      <option value={2} className="bg-popover text-popover-foreground">2</option>
      <option value={3} className="bg-popover text-popover-foreground">3</option>
    </select>
  );
}

export default function MappingTab({
  course,
  mapping,
  saving,
  handleMappingChange,
  getColAvg,
  saveMappingMatrix,
  readOnly = false
}) {
  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-center">
        <div>
          <h4 className="text-lg font-bold text-foreground">CO-PO Articulation Matrix</h4>
          <p className="text-xs text-muted-foreground">Establish the correlation between Course Outcomes (COs) and Program Outcomes (POs/PSOs). 0 = none, 1 = low, 2 = medium, 3 = high.</p>
        </div>
        {!readOnly && (
          <button
            onClick={saveMappingMatrix}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary-hover disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Mappings
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-center text-sm">
          <thead className="bg-muted/60 font-bold text-muted-foreground">
            <tr>
              <th className="w-24 border-b border-r border-border bg-muted/60 px-4 py-3 text-left">CO / PO</th>
              {Array.from({ length: 12 }).map((_, i) => (
                <th key={i} className="border-b border-r border-border px-2 py-3 text-xs">PO{i + 1}</th>
              ))}
              <th className="border-b border-r border-border px-2 py-3 text-xs">PSO1</th>
              <th className="border-b border-r border-border px-2 py-3 text-xs">PSO2</th>
              <th className="border-b border-border px-2 py-3 text-xs">PSO3</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: course.num_cos }).map((_, coIdx) => {
              const coNum = coIdx + 1;
              return (
                <tr key={coNum} className="border-b border-border hover:bg-muted/30">
                  <td className="border-r border-border bg-muted/20 px-4 py-3 text-left font-bold text-foreground">CO{coNum}</td>
                  {Array.from({ length: 12 }).map((_, poIdx) => {
                    const poNum = poIdx + 1;
                    const key = `co${coNum}_po${poNum}`;
                    return (
                      <td key={poIdx} className="border-r border-border p-1">
                        <MappingSelect
                          disabled={readOnly}
                          value={mapping[key]}
                          label={`CO${coNum} → PO${poNum}`}
                          onChange={(e) => handleMappingChange(coNum, `PO${poNum}`, e.target.value)}
                        />
                      </td>
                    );
                  })}
                  {/* PSOs */}
                  {['pso1', 'pso2', 'pso3'].map((psoKey, psoIdx) => {
                    const key = `co${coNum}_${psoKey}`;
                    return (
                      <td key={psoKey} className={`${psoIdx < 2 ? 'border-r' : ''} border-border p-1`}>
                        <MappingSelect
                          disabled={readOnly}
                          value={mapping[key]}
                          label={`CO${coNum} → ${psoKey.toUpperCase()}`}
                          onChange={(e) => handleMappingChange(coNum, psoKey.toUpperCase(), e.target.value)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Articulation Averages row */}
            <tr className="border-t border-border bg-muted/30 font-bold">
              <td className="border-r border-border px-4 py-3 text-left text-foreground">Average</td>
              {Array.from({ length: 12 }).map((_, poIdx) => {
                const poNum = poIdx + 1;
                return (
                  <td key={poIdx} className="border-r border-border px-2 py-3 text-xs text-warning">
                    {getColAvg(`PO${poNum}`)}
                  </td>
                );
              })}
              <td className="border-r border-border px-2 py-3 text-xs text-warning">{getColAvg('PSO1')}</td>
              <td className="border-r border-border px-2 py-3 text-xs text-warning">{getColAvg('PSO2')}</td>
              <td className="px-2 py-3 text-xs text-warning">{getColAvg('PSO3')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
