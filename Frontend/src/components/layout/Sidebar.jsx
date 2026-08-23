import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, Users, ClipboardList, Grid3x3, Target,
  Calculator, FileBarChart, Upload, Settings, ShieldCheck,
  HelpCircle, LogOut, X, Building2, UserCog,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const NAV_SECTIONS = [
  {
    heading: 'Academic Program Management',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, end: true },
      { label: 'Courses & Programs', to: '/courses', icon: BookOpen },
      { label: 'Students', to: '/students', icon: Users },
    ],
  },
  {
    heading: 'Academic Records',
    items: [
      { label: 'Internal Marks', to: '/internal-marks', icon: ClipboardList },
      { label: 'CO Mapping', to: '/co-mapping', icon: Grid3x3 },
      { label: 'PO Mapping', to: '/po-mapping', icon: Target },
      { label: 'CO-PO Calculation', to: '/co-po-calculation', icon: Calculator },
    ],
  },
  {
    heading: 'Output',
    items: [
      { label: 'Reports', to: '/reports', icon: FileBarChart },
      { label: 'Upload Excel', to: '/upload-excel', icon: Upload },
    ],
  },
];

const navLinkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
    isActive
      ? 'bg-sidebar-active text-white shadow-sm shadow-sidebar-active/40'
      : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground'
  }`;

const roleLabel = (role) => {
  if (!role) return 'Member';
  if (role === 'Admin') return 'Administrator';
  return role;
};

export default function Sidebar({ open, onClose }) {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      {/* Mobile scrim */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/*
        LAYOUT FIX:
        - On desktop (lg:): use `sticky top-0 h-screen` so the sidebar tracks
          the page scroll without creating its own scrollbar track.
        - `flex flex-col` + `overflow-hidden` on the <aside> so the aside
          itself never generates a scrollbar — only the inner <nav> scrolls.
        - On mobile: fixed drawer, slides in/out.
      */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* ── Brand header ─────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-col items-center border-b border-sidebar-border px-4 py-4">
          {/* Click the whole brand area to go home */}
          <button
            type="button"
            onClick={() => { navigate('/dashboard'); onClose?.(); }}
            className="w-full text-center"
          >
            <div className="mx-auto flex items-center justify-center pb-2">
              <img
                src="/ct-university-emblem.png"
                alt="CT University"
                style={{ width: '110px', height: 'auto' }}
                className="object-contain"
              />
            </div>
          </button>

          {/* Subtitle — secondary, never competing with the logo */}
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-sidebar-muted/70">
            Academic Management System
          </p>

          {/* Mobile close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-sidebar-muted hover:bg-sidebar-hover hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Navigation (scrollable, hidden scrollbar) ─────────────────── */}
        <nav
          className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-3 py-4"
        >

          <div className="space-y-6">
            {NAV_SECTIONS.map((section, i) => (
              <div key={i}>
                {section.heading && (
                  <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-muted/60">
                    {section.heading}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={navLinkClass}
                      onClick={onClose}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}

            {/* Administration — University Admin (unscoped) / School Admin (own School) /
                Department Admin (own Department); the backend enforces the actual scope on
                every request these pages make, this only decides whether to show the links. */}
            {hasRole('Admin', 'School Admin', 'Department Admin') && (
              <div>
                <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-muted/60">
                  Administration
                </p>
                <div className="space-y-0.5">
                  <NavLink to="/admin/academic-structure" className={navLinkClass} onClick={onClose}>
                    <Building2 className="h-4 w-4 shrink-0" />
                    Academic Structure
                  </NavLink>
                  <NavLink to="/admin/student-master" className={navLinkClass} onClick={onClose}>
                    <UserCog className="h-4 w-4 shrink-0" />
                    Student Master
                  </NavLink>
                  <NavLink to="/admin/student-mapping" className={navLinkClass} onClick={onClose}>
                    <Users className="h-4 w-4 shrink-0" />
                    Student Mapping
                  </NavLink>
                  <NavLink to="/admin/course-enrollment" className={navLinkClass} onClick={onClose}>
                    <BookOpen className="h-4 w-4 shrink-0" />
                    Course Enrollment
                  </NavLink>
                </div>
              </div>
            )}

            {/* System section */}
            <div>
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-muted/60">
                System
              </p>
              <div className="space-y-0.5">
                <NavLink to="/settings" className={navLinkClass} onClick={onClose}>
                  <Settings className="h-4 w-4 shrink-0" />
                  Settings
                </NavLink>
                <NavLink to="/notifications" className={navLinkClass} onClick={onClose}>
                  <HelpCircle className="h-4 w-4 shrink-0" />
                  Help &amp; Support
                </NavLink>
                {hasRole('Admin') && (
                  <NavLink to="/admin" className={navLinkClass} onClick={onClose}>
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    User Management
                  </NavLink>
                )}
              </div>
            </div>
          </div>
        </nav>

        {/* ── User profile (always visible at bottom) ───────────────────── */}
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-xl bg-sidebar-hover/60 p-3">
            {/* Avatar */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white ring-2 ring-sidebar-border">
              {(user?.name || '?').charAt(0).toUpperCase()}
            </div>
            {/* Name + role */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-white">
                {user?.name || 'User'}
              </p>
              <p className="truncate text-[11px] font-medium text-sidebar-muted">
                {roleLabel(user?.role)}
              </p>
            </div>
            {/* Logout */}
            <button
              type="button"
              onClick={logout}
              title="Logout"
              className="shrink-0 rounded-lg p-2 text-sidebar-muted transition hover:bg-sidebar-border hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
