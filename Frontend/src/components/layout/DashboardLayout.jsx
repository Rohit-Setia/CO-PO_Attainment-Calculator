import React from 'react';
import Sidebar from './Sidebar';

export default function DashboardLayout({ children }) {
  return (
    <div className="flex bg-slate-50 min-h-screen relative overflow-hidden font-sans">
      {/* Sidebar navigation */}
      <Sidebar />

      {/* Main content grid */}
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto relative">
        {/* Ambient radial glows */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-[100px] pointer-events-none"></div>

        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60 px-8 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-[10px] text-slate-500 font-extrabold tracking-widest uppercase">OBE Server Online</span>
          </div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </header>

        <div className="flex-1 p-8 relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}
