import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, 
  Building2, 
  BookOpen, 
  Users, 
  GraduationCap, 
  ClipboardList, 
  Calculator, 
  LogOut, 
  School,
  Calendar,
  Layers,
  TrendingUp
} from 'lucide-react';

export default function Sidebar() {
  const { logout, user } = useAuth();

  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Departments', path: '/departments', icon: Building2 },
    { name: 'Programs', path: '/programs', icon: GraduationCap },
    { name: 'Semesters', path: '/semesters', icon: Calendar },
    { name: 'Classrooms', path: '/classrooms', icon: School },
    { name: 'Subjects', path: '/subjects', icon: BookOpen },
    { name: 'Students', path: '/students', icon: Users },
    { name: 'OBE Mappings', path: '/obe', icon: Layers },
    { name: 'Assessments', path: '/assessments', icon: ClipboardList },
    { name: 'Marks Entry', path: '/grading', icon: ClipboardList },
    { name: 'Analytics & Reports', path: '/reports', icon: TrendingUp },
    { name: 'Classic Calculator', path: '/select', icon: Calculator },
  ];

  return (
    <aside className="w-64 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between min-h-screen border-r border-slate-800/60 shadow-xl relative overflow-hidden select-none">
      {/* Background radial glow */}
      <div className="absolute top-0 left-[-50px] w-48 h-48 rounded-full bg-blue-500/5 blur-[80px] pointer-events-none"></div>

      <div>
        {/* Header Branding */}
        <div className="p-6 border-b border-slate-800/40 flex items-center gap-3 relative">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-black text-base text-white tracking-tight leading-none">CT OBE ERP</h1>
            <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-widest block mt-1">Management Hub</span>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="p-4 space-y-1 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all duration-300 ${
                  isActive 
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/25 border-l-4 border-blue-400 font-black' 
                    : 'text-slate-500 hover:bg-slate-900 hover:text-slate-100 border-l-4 border-transparent'
                }`
              }
            >
              <item.icon className="h-4.5 w-4.5 shrink-0 transition-transform group-hover:scale-110 duration-300" />
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Faculty Profile Card */}
      <div className="p-4 border-t border-slate-800/40 bg-slate-950/40 relative">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center font-black text-white uppercase text-base shadow-inner">
            {user?.name ? user.name[0] : 'T'}
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-slate-200 truncate leading-none mb-1">{user?.name || 'Faculty Member'}</p>
            <p className="text-[10px] text-slate-500 truncate leading-none">{user?.email || 'faculty@ct.edu'}</p>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-xl text-xs font-bold uppercase tracking-wider border border-red-500/10 hover:border-red-500/25 transition-all duration-300"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
