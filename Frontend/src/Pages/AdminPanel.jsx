import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Users, ShieldCheck, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { fetchAllUsers, updateUserRoleStatus } from '../Api/authApi';

import AppHeader from '../components/layout/AppHeader';
import MetricCard from '../components/ui/MetricCard';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/skeleton';
import { Badge } from '../components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import PageTransition from '../components/ui/PageTransition';

const ROLES = ['Admin', 'Examination Team', 'Teacher', 'Viewer'];

const AdminPanel = () => {
  const { user } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState({}); // { [userId]: true } for per-row loading

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: json } = await fetchAllUsers();
      if (!json.success) throw new Error(json.message);
      setUsers(json.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const updateUser = async (userId, patch) => {
    setSaving((prev) => ({ ...prev, [userId]: true }));
    try {
      const { data: json } = await updateUserRoleStatus(userId, patch);
      if (!json.success) throw new Error(json.message);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...patch } : u))
      );
      toast.success(
        patch.is_active !== undefined
          ? `User ${patch.is_active ? 'approved' : 'deactivated'}.`
          : 'Role updated.'
      );
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Update failed.');
    } finally {
      setSaving((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const pendingCount = users.filter((u) => !u.is_active).length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader backTo="/dashboard" title="Admin Console" subtitle="User management & approvals" />

      <PageTransition>
        <main className="max-w-6xl mx-auto px-6 py-10">
          {/* Page header */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-destructive/10 to-primary/10 p-8 mb-8 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-xl">
                <ShieldCheck className="h-8 w-8 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">User Management</h2>
                <p className="mt-1 text-sm text-muted-foreground">Approve accounts, assign roles, and control access</p>
              </div>
            </div>
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition hover:bg-secondary"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Stats — real counts derived from the loaded user list */}
          {!loading && users.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
              <MetricCard label="Pending Approval" value={pendingCount} tone="warning" index={0} />
              {ROLES.map((role, i) => (
                <MetricCard key={role} label={role} value={users.filter((u) => u.role === role).length} index={i + 1} />
              ))}
            </div>
          )}

          {/* User Table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-6 py-4">
              <Users className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">All Registered Users ({users.length})</h3>
            </div>

            {loading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="p-6">
                <ErrorState description={error} onRetry={fetchUsers} />
              </div>
            ) : users.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={Users} title="No users found." />
              </div>
            ) : (
              <Table className="rounded-none border-0">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u, i) => {
                    const isSelf = u.id === user?.id;
                    const isBusy = saving[u.id];
                    return (
                      <motion.tr
                        key={u.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2, delay: Math.min(i, 10) * 0.02 }}
                        className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                      >
                        <TableCell className="font-medium">
                          {u.name}
                          {isSelf && <span className="ml-2 text-xs font-normal text-primary">(you)</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Select
                            value={u.role}
                            disabled={isSelf || isBusy}
                            onValueChange={(value) => updateUser(u.id, { role: value })}
                          >
                            <SelectTrigger className="h-8 w-40 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((r) => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.is_active ? 'success' : 'warning'}>
                            {u.is_active ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {u.is_active ? 'Active' : 'Pending'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell className="text-right">
                          {isBusy ? (
                            <Loader2 className="ml-auto h-4 w-4 animate-spin text-primary" />
                          ) : isSelf ? (
                            <span className="text-xs italic text-muted-foreground">your account</span>
                          ) : (
                            <button
                              onClick={() => updateUser(u.id, { is_active: !u.is_active })}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                                u.is_active
                                  ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
                                  : 'border-success/40 text-success hover:bg-success/10'
                              }`}
                            >
                              {u.is_active ? 'Deactivate' : 'Approve'}
                            </button>
                          )}
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Changes to role and status take effect immediately on next login.
          </p>
        </main>
      </PageTransition>
    </div>
  );
};

export default AdminPanel;
