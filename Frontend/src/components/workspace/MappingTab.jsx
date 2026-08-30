import { useMemo, useRef } from 'react';
import { Save, Loader2, Upload, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
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

// The matrix columns are derived from the course's mapping rows combined with the PROGRAM's
// own outcome definitions (programOutcomes.PO / programOutcomes.PSO). Definition code → column
// key is matched exactly ("PO5" → po5), so a program with a different outcome set (e.g. only
// PO1–PO8, or a deactivated PO) adapts automatically. Falls back to the stored po1..poN /
// pso1..psoM keys when no definitions are supplied.
const buildColumns = (mappingValues, programOutcomes) => {
  const first = mappingValues?.[0] || {};
  const poKeys = Object.keys(first).filter((k) => /^po\d+$/.test(k)).sort((a, b) => parseInt(a.slice(2), 10) - parseInt(b.slice(2), 10));
  const psoKeys = Object.keys(first).filter((k) => /^pso\d+$/.test(k)).sort((a, b) => parseInt(a.slice(3), 10) - parseInt(b.slice(3), 10));

  const defMap = (defs) => {
    const map = {};
    (defs || []).forEach((d) => {
      const m = String(d.code || '').match(/^(PO|PSO)(\d+)$/i);
      if (m) map[`${m[1].toLowerCase()}${m[2]}`] = d;
    });
    return map;
  };

  const poDefs = programOutcomes?.PO ? defMap(programOutcomes.PO) : null;
  const psoDefs = programOutcomes?.PSO ? defMap(programOutcomes.PSO) : null;

  const withDefs = (keys, defs) => keys
    .filter((k) => !defs || defs[k])
    .map((k) => ({ key: k, code: defs?.[k]?.code || k.toUpperCase(), title: defs?.[k]?.title || '', description: defs?.[k]?.description || '' }));

  return {
    poCols: withDefs(poKeys, poDefs),
    psoCols: withDefs(psoKeys, psoDefs),
  };
};

// courseOutcomes: [{ id, co_number }] — the course's actual active COs, any count/numbering.
// mappingValues: [{ co_id, po1..po12, pso1..pso3 }] and mappingAverages: { avg_po1..avg_pso3 }.
// programOutcomes: { PO: [{code,title,description}], PSO: [...] } — the program's own definitions.
export default function MappingTab({
  courseOutcomes,
  mappingValues,
  programOutcomes,
  saving,
  handleMappingChange,
  handleBulkMappingChange,
  saveMappingMatrix,
  readOnly = false
}) {
  const fileInputRef = useRef(null);
  const valuesByCoId = new Map((mappingValues || []).map((v) => [v.co_id, v]));
  const { poCols, psoCols } = buildColumns(mappingValues, programOutcomes);

  // Live averages computed from the CURRENT selections (including unsaved edits) — updates
  // immediately when a dropdown changes. Unmapped (0/'-') values are ignored, matching the
  // backend's getCoPoAveragesForCourse behaviour. Columns are re-derived inside the memo so
  // the dependency stays a single stable value (mappingValues).
  const liveAverages = useMemo(() => {
    const avgs = {};
    const vals = mappingValues || [];
    const { poCols: po, psoCols: pso } = buildColumns(mappingValues, programOutcomes);
    [...po, ...pso].forEach(({ key }) => {
      const nonZero = vals.map((v) => parseInt(v[key], 10) || 0).filter((v) => v > 0);
      avgs[`avg_${key}`] = nonZero.length > 0
        ? parseFloat((nonZero.reduce((a, b) => a + b, 0) / nonZero.length).toFixed(2))
        : 0;
    });
    return avgs;
  }, [mappingValues, programOutcomes]);

  const downloadTemplate = () => {
    if (!courseOutcomes || courseOutcomes.length === 0) {
      toast.error('No Course Outcomes configured for this course.');
      return;
    }
    const wb = XLSX.utils.book_new();
    const headers = ['CO / PO', ...poCols.map((c) => c.code), ...psoCols.map((c) => c.code)];
    const rows = courseOutcomes.map((co) => {
      const row = valuesByCoId.get(co.id) || {};
      return [
        `CO${co.co_number}`,
        ...poCols.map((c) => (row[c.key] !== undefined && row[c.key] !== null && row[c.key] !== 0 ? row[c.key] : '')),
        ...psoCols.map((c) => (row[c.key] !== undefined && row[c.key] !== null && row[c.key] !== 0 ? row[c.key] : '')),
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [{ wch: 12 }, ...poCols.map(() => ({ wch: 8 })), ...psoCols.map(() => ({ wch: 8 }))];
    XLSX.utils.book_append_sheet(wb, ws, 'CO-PO Matrix');
    XLSX.writeFile(wb, 'CO_PO_Matrix_Template.xlsx');
  };

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) {
          toast.error('No sheet found in workbook.');
          return;
        }

        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rows.length === 0) {
          toast.error('No data found in sheet.');
          return;
        }

        // 1. Locate header row: row that has PO/PSO or CO columns
        let headerRowIdx = -1;
        for (let r = 0; r < Math.min(rows.length, 10); r++) {
          const rowText = (rows[r] || []).map((c) => String(c || '').trim().toUpperCase());
          if (rowText.some((c) => /^PO\d+$/i.test(c) || /^PSO\d+$/i.test(c) || c === 'CO / PO' || c === 'CO')) {
            headerRowIdx = r;
            break;
          }
        }

        if (headerRowIdx === -1) {
          toast.error('Could not find header row with PO/PSO columns.');
          return;
        }

        const headerRow = rows[headerRowIdx];
        const colMap = {};
        let coColIdx = 0;
        headerRow.forEach((cell, idx) => {
          const norm = String(cell || '').trim().toLowerCase().replace(/[\s/_-]/g, '');
          if (norm === 'copo' || norm === 'co' || norm === 'courseoutcome') {
            coColIdx = idx;
          }
          const mPo = norm.match(/^po(\d+)$/);
          if (mPo) colMap[idx] = `po${mPo[1]}`;
          const mPso = norm.match(/^pso(\d+)$/);
          if (mPso) colMap[idx] = `pso${mPso[1]}`;
        });

        // 2. Parse CO rows
        const coByNumber = new Map(courseOutcomes.map((co) => [co.co_number, co]));
        const newValuesByCoId = new Map((mappingValues || []).map((v) => [v.co_id, { ...v }]));
        let importedCount = 0;

        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;
          const coCell = String(row[coColIdx] || '').trim();
          const mCo = coCell.match(/^(?:co)?\s*(\d+)$/i);
          if (!mCo) continue;
          const coNum = parseInt(mCo[1], 10);
          const co = coByNumber.get(coNum);
          if (!co) continue;

          const existingRow = newValuesByCoId.get(co.id) || { co_id: co.id };
          Object.entries(colMap).forEach(([idxStr, key]) => {
            const rawVal = row[parseInt(idxStr, 10)];
            if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
              const num = parseInt(rawVal, 10);
              if (!isNaN(num) && num >= 0 && num <= 3) {
                existingRow[key] = num;
              } else if (rawVal === '-' || rawVal === 0 || rawVal === '0') {
                existingRow[key] = 0;
              }
            }
          });
          newValuesByCoId.set(co.id, existingRow);
          importedCount++;
        }

        if (importedCount === 0) {
          toast.error('No matching CO rows found in file.');
          return;
        }

        const updatedList = Array.from(newValuesByCoId.values());
        if (handleBulkMappingChange) {
          handleBulkMappingChange(updatedList);
        } else {
          updatedList.forEach((row) => {
            Object.entries(row).forEach(([k, v]) => {
              if (k !== 'co_id') handleMappingChange(row.co_id, k, v);
            });
          });
        }
        toast.success(`Imported CO-PO mappings for ${importedCount} COs. Click "Save Mappings" to persist.`);
      } catch (err) {
        console.error(err);
        toast.error('Failed to parse Excel file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  if (!courseOutcomes || !mappingValues) {
    return <Skeleton className="h-96 rounded-2xl" />;
  }

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-center">
        <div>
          <h4 className="text-lg font-bold text-foreground">CO-PO Articulation Matrix</h4>
          <p className="text-xs text-muted-foreground">Establish the correlation between Course Outcomes (COs) and Program Outcomes (POs/PSOs). 0 = none, 1 = low, 2 = medium, 3 = high.</p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportExcel}
            />
            <button
              onClick={downloadTemplate}
              title="Download CO-PO Matrix Excel template"
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-secondary"
            >
              <FileDown className="h-3.5 w-3.5" />
              Template
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import CO-PO Matrix from Excel"
              className="flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold transition hover:bg-secondary/80"
            >
              <Upload className="h-3.5 w-3.5" />
              Import Excel
            </button>
            <button
              onClick={saveMappingMatrix}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md transition hover:bg-primary-hover disabled:opacity-70"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Mappings
            </button>
          </div>
        )}
      </div>

      {courseOutcomes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Add at least one Course Outcome in Setup & Configs before mapping to POs.</p>
      ) : poCols.length === 0 && psoCols.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No PO/PSO definitions were returned for this course's academic context.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-center text-sm">
            <thead className="bg-muted/60 font-bold text-muted-foreground">
              <tr>
                <th className="w-24 border-b border-r border-border bg-muted/60 px-4 py-3 text-left">CO / PO</th>
                {poCols.map((col) => (
                  <th key={col.key} className="border-b border-r border-border px-2 py-3 text-xs" title={col.title || col.description || ''}>
                    {col.code}
                  </th>
                ))}
                {psoCols.map((col, i) => (
                  <th key={col.key} className={`border-b ${i < psoCols.length - 1 ? 'border-r' : ''} border-border px-2 py-3 text-xs`} title={col.title || col.description || ''}>
                    {col.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {courseOutcomes.map((co) => {
                const row = valuesByCoId.get(co.id) || {};
                return (
                  <tr key={co.id} className="border-b border-border hover:bg-muted/30">
                    <td className="border-r border-border bg-muted/20 px-4 py-3 text-left font-bold text-foreground">CO{co.co_number}</td>
                    {poCols.map((col) => (
                      <td key={col.key} className="border-r border-border p-1">
                        <MappingSelect
                          disabled={readOnly}
                          value={row[col.key]}
                          label={`CO${co.co_number} → ${col.code}`}
                          onChange={(e) => handleMappingChange(co.id, col.key, e.target.value)}
                        />
                      </td>
                    ))}
                    {psoCols.map((col) => (
                      <td key={col.key} className="border-r border-border p-1">
                        <MappingSelect
                          disabled={readOnly}
                          value={row[col.key]}
                          label={`CO${co.co_number} → ${col.code}`}
                          onChange={(e) => handleMappingChange(co.id, col.key, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr className="border-t border-border bg-muted/30 font-bold">
                <td className="border-r border-border px-4 py-3 text-left text-foreground">Average</td>
                {poCols.map((col) => (
                  <td key={col.key} className="border-r border-border px-2 py-3 text-xs text-warning">
                    {(liveAverages[`avg_${col.key}`] ?? 0).toFixed(2)}
                  </td>
                ))}
                {psoCols.map((col) => (
                  <td key={col.key} className="border-r border-border px-2 py-3 text-xs text-warning">
                    {(liveAverages[`avg_${col.key}`] ?? 0).toFixed(2)}
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
