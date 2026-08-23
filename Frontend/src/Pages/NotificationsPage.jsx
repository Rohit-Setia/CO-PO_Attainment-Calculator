import { BellOff } from 'lucide-react';
import { usePageHeader } from '../context/PageHeaderContext';
import EmptyState from '../components/ui/EmptyState';
import PageTransition from '../components/ui/PageTransition';

// No notification/activity-log system exists in the backend yet. Showing an honest empty state
// rather than fabricated notification entries.
export default function NotificationsPage() {
  usePageHeader({ title: 'Notifications', subtitle: '' });

  return (
    <PageTransition>
      <EmptyState
        icon={BellOff}
        title="No notifications yet"
        description="Notifications aren't wired up to a backend event system yet — this is a placeholder for a future release, not missing data."
      />
    </PageTransition>
  );
}
