import { LogOut, ShieldCheck, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../ui/ThemeToggle';

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout, hasRole } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">CO-PO Attainment</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Calculator</p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {hasRole('Admin') && (
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin
            </button>
          )}

          <ThemeToggle />

          <div className="hidden items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:flex dark:border-slate-700 dark:bg-slate-800">
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{user?.name || 'User'}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">{user?.role || 'Member'}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
