import React from 'react';
import { GraduationCap } from 'lucide-react';

const AuthLayout = ({ title, subtitle, children }) => (
  <div className="min-h-screen bg-slate-950 relative overflow-hidden flex flex-col justify-center items-center px-4 py-12">
    {/* Visual background glows */}
    <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none"></div>
    <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none"></div>

    <div className="w-full max-w-md space-y-6">
      {/* Brand logo header */}
      <div className="flex flex-col items-center gap-2 mb-4 text-center">
        <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <GraduationCap className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-xl font-extrabold text-white">CT ERP System</h2>
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Outcome Based Education Hub</p>
      </div>

      {/* Glassmorphic Auth Card */}
      <div className="bg-slate-900/60 backdrop-blur-xl p-8 rounded-2xl border border-slate-800 shadow-2xl space-y-6 relative">
        <div>
          <h1 className="text-2xl font-black text-white">{title}</h1>
          <p className="mt-1.5 text-xs text-slate-400 font-medium">{subtitle}</p>
        </div>
        <div>{children}</div>
      </div>
    </div>
  </div>
);

export default AuthLayout;
