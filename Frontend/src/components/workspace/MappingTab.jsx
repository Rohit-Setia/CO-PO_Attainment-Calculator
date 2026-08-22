import { Save, Loader2 } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';

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

// courseOutcomes: [{ id, co_number }] — the course's actual active COs, any count/numbering.
// mappingValues: [{ co_id, po1..po12, pso1..pso3 }] and mappingAverages: { avg_po1..avg_pso3 }.
export default function MappingTab({
  courseOutcomes,
  mappingValues,
  mappingAverages,
  saving,
  handleMappingChange,
  saveMappingMatrix,
  readOnly = false
}) {
  if (!courseOutcomes || !mappingValues) {
    return <Skeleton className="h-96 rounded-2xl" />;
  }

  const valuesByCoId = new Map(mappingValues.map((v) => [v.co_id, v]));

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

      {courseOutcomes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Add at least one Course Outcome in Setup & Configs before mapping to POs.</p>
      ) : (
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
              {courseOutcomes.map((co) => {
                const row = valuesByCoId.get(co.id) || {};
                return (
                  <tr key={co.id} className="border-b border-border hover:bg-muted/30">
                    <td className="border-r border-border bg-muted/20 px-4 py-3 text-left font-bold text-foreground">CO{co.co_number}</td>
                    {Array.from({ length: 12 }).map((_, poIdx) => {
                      const poNum = poIdx + 1;
                      return (
                        <td key={poIdx} className="border-r border-border p-1">
                          <MappingSelect
                            disabled={readOnly}
                            value={row[`po${poNum}`]}
                            label={`CO${co.co_number} → PO${poNum}`}
                            onChange={(e) => handleMappingChange(co.id, `po${poNum}`, e.target.value)}
                          />
                        </td>
                      );
                    })}
                    {['pso1', 'pso2', 'pso3'].map((psoKey, psoIdx) => (
                      <td key={psoKey} className={`${psoIdx < 2 ? 'border-r' : ''} border-border p-1`}>
                        <MappingSelect
                          disabled={readOnly}
                          value={row[psoKey]}
                          label={`CO${co.co_number} → ${psoKey.toUpperCase()}`}
                          onChange={(e) => handleMappingChange(co.id, psoKey, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr className="border-t border-border bg-muted/30 font-bold">
                <td className="border-r border-border px-4 py-3 text-left text-foreground">Average</td>
                {Array.from({ length: 12 }).map((_, poIdx) => (
                  <td key={poIdx} className="border-r border-border px-2 py-3 text-xs text-warning">
                    {(mappingAverages?.[`avg_po${poIdx + 1}`] ?? 0).toFixed(2)}
                  </td>
                ))}
                {['pso1', 'pso2', 'pso3'].map((psoKey, i) => (
                  <td key={psoKey} className={`${i < 2 ? 'border-r' : ''} border-border px-2 py-3 text-xs text-warning`}>
                    {(mappingAverages?.[`avg_${psoKey}`] ?? 0).toFixed(2)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
