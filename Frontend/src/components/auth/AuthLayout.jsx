import { motion } from 'framer-motion';
import { Award } from 'lucide-react';
import ThemeToggle from '../ui/ThemeToggle';

const AuthLayout = ({ title, subtitle, children }) => (
  <div className="relative min-h-screen bg-background px-4 py-10 flex items-center justify-center overflow-hidden">
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,hsl(var(--primary)/0.18),transparent)]"
    />

    <div className="absolute right-4 top-4">
      <ThemeToggle />
    </div>

    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="relative w-full max-w-md"
    >
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
          <Award className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-muted-foreground">CO-PO Attainment Calculator</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </motion.div>
  </div>
);

export default AuthLayout;
