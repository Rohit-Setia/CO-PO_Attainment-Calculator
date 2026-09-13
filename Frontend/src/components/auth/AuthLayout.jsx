import { Award } from 'lucide-react';
import ThemeToggle from '../ui/ThemeToggle';

const AuthLayout = ({ title, subtitle, children }) => (
  <div className="relative min-h-screen bg-[#eaf2fb] dark:bg-background px-4 py-10 flex items-center justify-center overflow-hidden transition-colors">
    <div className="absolute right-4 top-4">
      <ThemeToggle />
    </div>

    <div className="animate-in fade-in slide-in-from-top-4 duration-300 relative w-full max-w-md">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
          <Award className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-muted-foreground">CO-PO Attainment Calculator</p>
        </div>
      </div>

      <div className="relative">
        {/* Luminous glow effect behind login popup */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-r from-blue-500/20 via-sky-400/20 to-indigo-500/20 blur-xl opacity-75 dark:opacity-30"
        />

        <div className="relative rounded-2xl border border-border/80 bg-card p-6 shadow-xl shadow-blue-500/5 dark:shadow-none sm:p-8 backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  </div>
);

export default AuthLayout;
