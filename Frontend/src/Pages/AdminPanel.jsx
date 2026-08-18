import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Award, ArrowLeft, Users, ShieldCheck, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const ROLES = ['Admin', 'Examination Team', 'Teacher', 'Viewer'];

const ROLE_COLORS = {
  'Admin': 'bg-red-500/20 text-red-300 border-red-500/30',
  'Examination Team': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'Teacher': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Viewer': 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

const AdminPanel = () => {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState({}); // { [userId]: true } for per-row loading

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setUsers(json.data);
    } catch (err) {
      setError(err.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const updateUser = async (userId, patch) => {
    setSaving((prev) => ({ ...prev, [userId]: true }));
    try {
      const res = await fetch(`${API_BASE}/auth/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      // Optimistically update the local state
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...patch } : u))
      );
    } catch (err) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setSaving((prev) => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white font-sans antialiased">
      {/* Navbar */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-slate-900/60 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Award className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-200 bg-clip-text text-transparent">CO-PO Attainment Calculator</h1>
            <p className="text-xs text-slate-400">Admin Control Panel</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400 hidden sm:block">{user?.name}</span>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800/80 transition duration-200 text-sm font-medium text-slate-300"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-800/60 hover:bg-red-900/20 transition duration-200 text-sm font-medium text-red-400"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Page Header */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-red-600/20 to-indigo-600/20 border border-slate-700/50 p-8 mb-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-red-500 to-indigo-500 flex items-center justify-center shadow-xl">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">User Management</h2>
              <p className="text-slate-400 text-sm mt-1">Approve accounts, assign roles, and control access</p>
            </div>
          </div>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-sm font-medium transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {ROLES.map((role) => {
            const count = users.filter((u) => u.role === role).length;
            return (
              <div key={role} className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4 text-center">
                <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${ROLE_COLORS[role].split(' ')[1]}`}>{role}</p>
                <p className="text-3xl font-bold text-white">{count}</p>
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
            <XCircle className="h-4 w-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* User Table */}
        <div className="rounded-2xl bg-slate-800/40 border border-slate-700/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700/50 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-200">All Registered Users ({users.length})</h3>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading users...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-slate-500 text-sm">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">Name</th>
                    <th className="px-6 py-3 text-left">Email</th>
                    <th className="px-6 py-3 text-left">Role</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-left">Joined</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {users.map((u) => {
                    const isSelf = u.id === user?.id;
                    const isBusy = saving[u.id];
                    return (
                      <tr key={u.id} className="hover:bg-slate-700/20 transition-colors group">
                        <td className="px-6 py-4 font-medium text-slate-200">
                          {u.name}
                          {isSelf && <span className="ml-2 text-xs text-indigo-400 font-normal">(you)</span>}
                        </td>
                        <td className="px-6 py-4 text-slate-400 text-xs">{u.email}</td>
                        <td className="px-6 py-4">
                          <select
                            value={u.role}
                            disabled={isSelf || isBusy}
                            onChange={(e) => updateUser(u.id, { role: e.target.value })}
                            className={`text-xs font-semibold rounded-lg px-2 py-1 border cursor-pointer
                              bg-slate-900/60 disabled:opacity-50 disabled:cursor-not-allowed
                              ${ROLE_COLORS[u.role]} focus:outline-none focus:ring-1 focus:ring-indigo-500`}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r} className="bg-slate-900 text-white">{r}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 border ${
                            u.is_active
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          }`}>
                            {u.is_active ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {u.is_active ? 'Active' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 text-xs">
                          {new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin text-blue-400 ml-auto" />
                          ) : isSelf ? (
                            <span className="text-slate-600 text-xs italic">your account</span>
                          ) : (
                            <button
                              onClick={() => updateUser(u.id, { is_active: !u.is_active })}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                                u.is_active
                                  ? 'border-red-800/50 text-red-400 hover:bg-red-900/20'
                                  : 'border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/20'
                              }`}
                            >
                              {u.is_active ? 'Deactivate' : 'Approve'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-center text-slate-600 text-xs mt-8">
          Changes to role and status take effect immediately on next login.
        </p>
      </main>
    </div>
  );
};

export default AdminPanel;
