import { motion } from 'framer-motion';

const toneMap = {
  default: {
    icon: 'bg-primary/10 text-primary',
    accent: 'bg-primary',
  },
  success: {
    icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    accent: 'bg-emerald-500',
  },
  warning: {
    icon: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
    accent: 'bg-amber-500',
  },
  muted: {
    icon: 'bg-muted text-muted-foreground',
    accent: 'bg-muted-foreground/40',
  },
  error: {
    icon: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400',
    accent: 'bg-red-500',
  },
};

/**
 * Premium metric card for the dashboard.
 * @param {React.ElementType} icon   - Lucide icon component
 * @param {string}  label            - Card label (e.g. "Total Students")
 * @param {string|number} value      - Primary large value
 * @param {string}  [subLabel]       - Optional small status text below value (e.g. "Not Configured")
 * @param {'default'|'success'|'warning'|'muted'|'error'} [tone]
 * @param {number}  [index]          - Animation stagger index
 */
export default function MetricCard({ icon: Icon, label, value, subLabel, tone = 'default', index = 0 }) {
  const t = toneMap[tone] || toneMap.default;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.06, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      {/* Top accent stripe */}
      <div className={`absolute left-0 top-0 h-0.5 w-full ${t.accent} opacity-70`} />

      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {Icon && (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t.icon}`}>
            <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
          </div>
        )}
      </div>

      <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">{value}</p>

      {subLabel && (
        <p className="mt-1 text-[11px] font-medium text-muted-foreground">{subLabel}</p>
      )}
    </motion.div>
  );
}
