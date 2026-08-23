import { ChevronRight, AlertTriangle } from 'lucide-react';

// Real academic-context breadcrumb — every segment is either a genuine hierarchy name
// resolved server-side, or explicitly omitted (never a fabricated placeholder). When the
// course predates the hierarchy migration (`linked: false`), a single honest notice is
// shown instead of guessing School/Department/Program from free text.
export default function Breadcrumb({ segments = [], unlinkedNotice }) {
  const real = segments.filter((s) => s && s.label);

  if (real.length === 0) {
    return unlinkedNotice ? (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {unlinkedNotice}
      </div>
    ) : null;
  }

  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground" aria-label="Academic context">
      {real.map((seg, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
          <span className={i === real.length - 1 ? 'font-semibold text-foreground' : ''}>{seg.label}</span>
        </span>
      ))}
    </nav>
  );
}
