import { useState } from 'react';
import { ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TYPE_LABEL = {
  co_mapping_missing: 'CO Mapping Missing',
  po_mapping_missing: 'PO Mapping Missing',
  enrollment_missing: 'Enrollment Missing',
  marks_missing: 'Marks Missing',
  department_mismatch: 'Department Mismatch',
};

// Every warning here is a real, computed data-quality signal from the dashboard aggregation
// service — never a fabricated zero standing in for missing data. Collapsed by default past
// a handful of items so it stays informative without overwhelming the page.
export default function DataQualityPanel({ warnings = [] }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  if (warnings.length === 0) return null;

  const visible = expanded ? warnings : warnings.slice(0, 5);

  return (
    <div className="rounded-2xl border border-amber-300/40 bg-amber-50/60 p-5 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <h3 className="text-sm font-bold text-amber-900 dark:text-amber-300">
          Data Quality Warnings ({warnings.length})
        </h3>
      </div>
      <ul className="mt-3 space-y-1.5">
        {visible.map((w, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200/90">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
            <button
              onClick={() => navigate(`/courses/${w.courseId}`)}
              className="text-left hover:underline"
              title={TYPE_LABEL[w.type] || w.type}
            >
              {w.message}
            </button>
          </li>
        ))}
      </ul>
      {warnings.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
        >
          {expanded ? <>Show less <ChevronUp className="h-3 w-3" /></> : <>Show {warnings.length - 5} more <ChevronDown className="h-3 w-3" /></>}
        </button>
      )}
    </div>
  );
}
