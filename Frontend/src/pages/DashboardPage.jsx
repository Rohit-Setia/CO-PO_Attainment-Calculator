import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDashboard } from '../Api/authApi';
import { fetchERPDashboardStats } from '../Api/erpApi';
import { useAuth } from '../context/AuthContext';
import { 
  Building2, 
  GraduationCap, 
  Users, 
  School, 
  ClipboardList, 
  Award, 
  ArrowRight, 
  Sparkles, 
  CalendarCheck2 
} from 'lucide-react';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { setUser, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const userRes = await fetchDashboard();
      setUserInfo(userRes.data.data);
      setUser(userRes.data.data);

      const statsRes = await fetchERPDashboardStats();
      setStats(statsRes.data.data);
    } catch (err) {
      setError('Could not load dashboard telemetry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-semibold">
        Loading ERP telemetry...
      </div>
    );
  }

  const statCards = [
    { name: 'Departments', value: stats?.counts?.departments ?? 0, icon: Building2, color: 'text-blue-600 bg-blue-50', path: '/departments' },
    { name: 'Classrooms', value: stats?.counts?.classrooms ?? 0, icon: School, color: 'text-indigo-600 bg-indigo-50', path: '/classrooms' },
    { name: 'Subjects Offered', value: stats?.counts?.subjects ?? 0, icon: GraduationCap, color: 'text-emerald-600 bg-emerald-50', path: '/subjects' },
    { name: 'Total Faculty', value: stats?.counts?.teachers ?? 0, icon: Users, color: 'text-amber-600 bg-amber-50', path: '/subjects' },
    { name: 'Students Enrolled', value: stats?.counts?.students ?? 0, icon: Users, color: 'text-violet-600 bg-violet-50', path: '/students' },
    { name: 'Evaluations Completed', value: stats?.counts?.exams ?? 0, icon: ClipboardList, color: 'text-rose-600 bg-rose-50', path: '/assessments' }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-900 rounded-2xl p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row md:justify-between md:items-center gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            <span>OBE Portal Dashboard</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">Welcome, {userInfo?.name || 'Professor'}!</h1>
          <p className="text-blue-100 text-sm max-w-xl">
            Manage your outcomes assessment grid, analyze attainment vectors, and download accredited evidence reports.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/grading')}
            className="bg-white hover:bg-slate-100 text-blue-900 font-extrabold text-sm px-5 py-3 rounded-xl transition shadow-lg"
          >
            Enter Marks
          </button>
          <button
            onClick={logout}
            className="bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-5 py-3 rounded-xl border border-white/10 transition"
          >
            Log Out
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-semibold border border-red-200">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((c) => (
          <button
            key={c.name}
            onClick={() => navigate(c.path)}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 hover:shadow-lg hover:border-blue-500 hover:-translate-y-0.5 transition-all text-left w-full focus:outline-none"
          >
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${c.color}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">{c.name}</p>
              <p className="text-2xl font-black text-slate-800 leading-none">{c.value}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activities */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
            <CalendarCheck2 className="h-5 w-5 text-blue-500" />
            <span>Recent Assessment Schedules</span>
          </h2>
          <div className="divide-y divide-slate-100">
            {stats?.recentActivities?.map((act, index) => (
              <div key={index} className="py-3 flex justify-between items-center text-sm">
                <div>
                  <p className="font-bold text-slate-800">{act.name} ({act.type})</p>
                  <p className="text-xs text-slate-500 font-medium">{act.subject_name} — {act.class_name}</p>
                </div>
                <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                  act.status === 'Evaluated' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {act.status}
                </span>
              </div>
            ))}
            {(!stats?.recentActivities || stats.recentActivities.length === 0) && (
              <p className="py-6 text-center text-slate-400 font-semibold text-xs">No recent assessment records logged.</p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
            <Award className="h-5 w-5 text-blue-500" />
            <span>Academic Workflows</span>
          </h2>
          <div className="space-y-2">
            {[
              { label: 'Register Subjects', path: '/subjects' },
              { label: 'Setup Classrooms', path: '/classrooms' },
              { label: 'Manage Students', path: '/students' },
              { label: 'Configure OBE Mapping', path: '/obe' },
              { label: 'Classic Calculator', path: '/select' }
            ].map(act => (
              <button
                key={act.label}
                onClick={() => navigate(act.path)}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/20 text-slate-700 hover:text-blue-900 text-xs font-bold transition-all text-left"
              >
                <span>{act.label}</span>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
