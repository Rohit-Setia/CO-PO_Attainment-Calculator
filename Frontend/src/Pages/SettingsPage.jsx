import { User, Mail, ShieldCheck, Moon, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { usePageHeader } from '../context/PageHeaderContext';
import PageTransition from '../components/ui/PageTransition';
import { Badge } from '../components/ui/badge';

export default function SettingsPage() {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  usePageHeader({ title: 'Settings', subtitle: 'Your account and preferences' });

  return (
    <PageTransition className="max-w-2xl space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-4 text-base font-bold text-foreground">Profile</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white">
              {(user?.name || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-foreground">{user?.name}</p>
              <Badge variant="secondary" className="mt-0.5">{user?.role}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" /> Name: <span className="text-foreground">{user?.name}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" /> Email: <span className="text-foreground">{user?.email}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Role: <span className="text-foreground">{user?.role}</span>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          To change your name, email, or password, contact an Administrator — self-service profile editing isn&apos;t available yet.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-4 text-base font-bold text-foreground">Appearance</h3>
        <button
          onClick={toggleTheme}
          className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left transition hover:bg-secondary"
        >
          <div className="flex items-center gap-3">
            {isDark ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-primary" />}
            <div>
              <p className="text-sm font-semibold text-foreground">Theme</p>
              <p className="text-xs text-muted-foreground">Currently {isDark ? 'Dark' : 'Light'} mode</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-primary">Switch to {isDark ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </PageTransition>
  );
}
