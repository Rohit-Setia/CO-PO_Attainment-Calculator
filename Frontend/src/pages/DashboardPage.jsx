import { useEffect, useState } from 'react';
import { fetchDashboard } from '../api/authApi';
import { useAuth } from '../context/AuthContext';

const DashboardPage = () => {
  const { user, setUser, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetchDashboard();
        setUser(response.data.data);
      } catch (apiError) {
        setError(apiError.response?.data?.message || 'Could not load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [setUser]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-600">Loading dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Teacher Dashboard</h1>
            <p className="text-sm text-slate-500">Protected area accessible only to authenticated teachers.</p>
          </div>

          <button
            type="button"
            onClick={logout}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            Logout
          </button>
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs uppercase text-slate-500">Name</p>
            <p className="mt-1 text-base font-medium text-slate-900">{user?.name || 'N/A'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs uppercase text-slate-500">Email</p>
            <p className="mt-1 text-base font-medium text-slate-900">{user?.email || 'N/A'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
