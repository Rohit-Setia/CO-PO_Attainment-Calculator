import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePageHeaderContext } from '../../context/PageHeaderContext';
import { useAcademicFilter } from '../../context/AcademicFilterContext';
import { fetchNotifications } from '../../Api/examinationApi';
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
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const loadUnread = () => {
      fetchNotifications(true)
        .then((res) => {
          if (isMounted) {
            const list = res.data?.data || [];
            const count = list.filter((n) => !n.is_read).length;
            setUnreadCount(count);
          }
        })
        .catch(() => { /* non-critical fallback */ });
    };

    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user]);

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
        className="relative rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground group"
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      >
        <Bell className={`h-5 w-5 transition-transform duration-200 ${unreadCount > 0 ? 'text-rose-500 group-hover:rotate-12' : ''}`} />
        {unreadCount > 0 && (
          <>
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-background z-10"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-rose-500 opacity-75 animate-ping pointer-events-none"
            />
          </>
        )}
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
