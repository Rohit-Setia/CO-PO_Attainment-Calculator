import { useNavigate } from 'react-router-dom';
import { Menu, Bell, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePageHeaderContext } from '../../context/PageHeaderContext';
import { useAcademicFilter } from '../../context/AcademicFilterContext';
import ThemeToggle from '../ui/ThemeToggle';

// Compact styled select control with a floating label above it
function CompactSelect({ label, value, onChange, children, title }) {
  return (
    <div className="relative hidden flex-col sm:flex">
      <span className="mb-0.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <div className="relative flex items-center">
        <select
          value={value}
          onChange={onChange}
          title={title}
          className="h-8 appearance-none rounded-lg border border-input bg-background pl-2.5 pr-7 text-xs font-medium text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring transition-colors hover:border-ring/50"
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-muted-foreground" />
      </div>
    </div>
  );
}

export default function Header({ onMenuClick }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { header } = usePageHeaderContext();
  const { semester, setSemester, session, setSession, availableSemesters, availableSessions } = useAcademicFilter();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur-md sm:gap-3 sm:px-6">
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title + subtitle */}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold leading-tight text-foreground sm:text-[17px]">
          {header.title || 'Dashboard'}
        </h1>
        {header.subtitle && (
          <p className="hidden truncate text-[12px] text-muted-foreground sm:block">
            {header.subtitle}
          </p>
        )}
      </div>

      {/* Page-level actions (e.g. buttons injected by individual pages) */}
      {header.actions && (
        <div className="hidden items-center gap-2 md:flex">{header.actions}</div>
      )}

      {/* Academic filters */}
      {availableSemesters.length > 0 && (
        <CompactSelect
          label="Semester"
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          title="Filter by semester"
        >
          <option value="all">All Semesters</option>
          {availableSemesters.map((s) => (
            <option key={s} value={s}>Semester {s}</option>
          ))}
        </CompactSelect>
      )}

      {availableSessions.length > 0 && (
        <CompactSelect
          label="Session"
          value={session}
          onChange={(e) => setSession(e.target.value)}
          title="Filter by academic session"
          className="hidden lg:flex"
        >
          <option value="all">All Sessions</option>
          {availableSessions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </CompactSelect>
      )}

      {/* Notifications */}
      <button
        type="button"
        onClick={() => navigate('/notifications')}
        className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
      </button>

      {/* Theme toggle */}
      <ThemeToggle />

      {/* User profile chip */}
      <button
        type="button"
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 rounded-lg border border-border bg-card py-1.5 pl-1.5 pr-3 transition hover:bg-secondary"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-bold text-white">
          {(user?.name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="hidden text-left sm:block">
          <p className="text-xs font-semibold leading-tight text-foreground">{user?.name || 'User'}</p>
          <p className="text-[10px] leading-tight text-muted-foreground">{user?.role || 'Member'}</p>
        </div>
      </button>
    </header>
  );
}
