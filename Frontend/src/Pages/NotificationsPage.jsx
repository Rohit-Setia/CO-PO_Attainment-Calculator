import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff, Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePageHeader } from '../context/PageHeaderContext';
import EmptyState from '../components/ui/EmptyState';
import PageTransition from '../components/ui/PageTransition';
import { fetchNotifications, markNotificationRead } from '../Api/examinationApi';

// Maps a notification's related_entity_type to the page that shows that entity.
// Every examination notification today points at a question_paper (see
// examinationRoutes.js notify() calls), but this stays a lookup so a future
// entity type only needs a new key here, not a rewrite of the click handler.
const ENTITY_ROUTES = {
  question_paper: (id) => `/examinations/papers/${id}`,
};

export default function NotificationsPage() {
  usePageHeader({ title: 'Notifications', subtitle: '' });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetchNotifications()
      .then((res) => setRows(res.data?.data || []))
      .catch(() => toast.error('Could not load notifications.'))
      .finally(() => setLoading(false));
  }, []);

  const handleClick = async (n) => {
    if (!n.is_read) {
      setRows((prev) => prev.map((r) => (r.id === n.id ? { ...r, is_read: 1 } : r)));
      try { await markNotificationRead(n.id); } catch { /* non-critical */ }
    }
    const buildPath = n.related_entity_type && ENTITY_ROUTES[n.related_entity_type];
    if (buildPath && n.related_entity_id) {
      navigate(buildPath(n.related_entity_id));
    }
  };

  if (loading) {
    return <PageTransition><div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></PageTransition>;
  }

  if (rows.length === 0) {
    return (
      <PageTransition>
        <EmptyState
          icon={BellOff}
          title="No notifications yet"
          description="You'll see updates here when you're assigned a question paper, when marks entry opens, and other examination events."
        />
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-2">
      {rows.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => handleClick(n)}
          className={`flex w-full items-start gap-3 rounded-xl border border-border p-4 text-left transition ${n.is_read ? 'bg-card' : 'bg-primary/5'} ${ENTITY_ROUTES[n.related_entity_type] ? 'cursor-pointer hover:border-primary/40' : ''}`}
        >
          <Bell className={`mt-0.5 h-4 w-4 shrink-0 ${n.is_read ? 'text-muted-foreground' : 'text-primary'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{n.title}</p>
            {n.message && <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
          </div>
        </button>
      ))}
    </PageTransition>
  );
}
