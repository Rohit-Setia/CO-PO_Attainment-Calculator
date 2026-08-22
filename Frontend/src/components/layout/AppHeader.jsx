import { useNavigate } from 'react-router-dom';
import { Award, ArrowLeft, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ThemeToggle from '../ui/ThemeToggle';
import { Badge } from '../ui/badge';

const ROLE_BADGE_VARIANT = {
  Admin: 'destructive',
  'Examination Team': 'default',
  Teacher: 'success',
  Viewer: 'secondary',
};

// Shared top bar for every authenticated screen (Dashboard, Course Workspace, Admin Panel) —
// one implementation keeps identity, theme toggle, and nav actions consistent across the app.
export default function AppHeader({ backTo, backLabel = 'Dashboard', title, subtitle, actions }) {
  const navigate = useNavigate();
  const { user, logout, hasRole } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex flex-col gap-4 border-b border-border bg-background/80 px-6 py-4 backdrop-blur-md md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        {backTo && (
          <button
            onClick={() => navigate(backTo)}
            className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            title={`Back to ${backLabel}`}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/25">
          <Award className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">{title || 'CO-PO Attainment Calculator'}</h1>
          <p className="text-xs text-muted-foreground">{subtitle || 'Course & Program Outcome Attainment'}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {actions}

        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-foreground">{user?.name}</p>
          <div className="mt-0.5 flex items-center justify-end gap-1.5">
            <span className="text-xs text-muted-foreground">{user?.email}</span>
            {user?.role && (
              <Badge variant={ROLE_BADGE_VARIANT[user.role] || 'secondary'}>{user.role}</Badge>
            )}
          </div>
        </div>

        <ThemeToggle />

        {hasRole('Admin') && !backTo && (
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive transition hover:bg-destructive/10"
            title="Open Admin Panel"
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Admin</span>
          </button>
        )}

        <button
          onClick={logout}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
