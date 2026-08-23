import { Button } from './button';

export function GradientButton({ className = '', children, ...props }) {
  return (
    <Button
      {...props}
      className={`bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:opacity-95 ${className}`}
    >
      {children}
    </Button>
  );
}

export function SecondaryButton({ className = '', children, ...props }) {
  return (
    <Button
      variant="secondary"
      {...props}
      className={`bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 ${className}`}
    >
      {children}
    </Button>
  );
}

export function IconButton({ className = '', children, ...props }) {
  return (
    <Button
      variant="outline"
      size="icon"
      {...props}
      className={`rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 ${className}`}
    >
      {children}
    </Button>
  );
}
