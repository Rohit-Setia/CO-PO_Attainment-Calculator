import React from 'react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

export default function AttainmentTab({
  attainment,
  getCOBarChartData,
  getPORadarChartData
}) {
  return (
    <div className="space-y-8">
      {/* Overall Attainment Score Card */}
      {attainment && (
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 flex flex-col justify-between min-h-[120px]">
            <p className="text-xs uppercase font-bold tracking-wider text-slate-400">Combined Direct CO Attainment</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-blue-400">{attainment.overallCourseAttainment}</span>
              <span className="text-sm text-slate-500">/ 3.0</span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 flex flex-col justify-between min-h-[120px]">
            <p className="text-xs uppercase font-bold tracking-wider text-slate-400">Internal (MTT) Average</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-slate-300">{attainment.mttAttainment ? attainment.mttAttainment.CO : 'N/A'}</span>
              <span className="text-sm text-slate-500">/ 3.0</span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 flex flex-col justify-between min-h-[120px]">
            <p className="text-xs uppercase font-bold tracking-wider text-slate-400">External (ETT) Average</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-slate-300">{attainment.ettAttainment ? attainment.ettAttainment.CO : 'N/A'}</span>
              <span className="text-sm text-slate-500">/ 3.0</span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 flex flex-col justify-between min-h-[120px]">
            <p className="text-xs uppercase font-bold tracking-wider text-slate-400">Direct Calculation Weightage</p>
            <div className="mt-2 text-slate-200">
              <span className="text-base font-bold">{attainment.internalWeight}%</span> Internal + <span className="text-base font-bold">{attainment.externalWeight}%</span> External
            </div>
          </div>
        </div>
      )}

      {/* Attainment Levels Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        
        {/* CO Attainment Level Table */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 space-y-4">
          <h4 className="font-bold text-lg text-slate-100 border-b border-slate-700/50 pb-2">Course Outcome (CO) Attainment Levels</h4>
          
          {attainment ? (
            <div className="overflow-x-auto rounded-xl border border-slate-700/40">
              <table className="w-full text-sm text-center border-collapse">
                <thead className="bg-slate-900 font-bold text-slate-300">
                  <tr>
                    <th className="border-r border-b border-slate-700/60 px-4 py-2.5 text-left bg-slate-900/50">CO</th>
                    <th className="border-r border-b border-slate-700/60 px-4 py-2.5">MTT Level</th>
                    <th className="border-r border-b border-slate-700/60 px-4 py-2.5">ETT Level</th>
                    <th className="border-b border-slate-700/60 px-4 py-2.5 bg-blue-500/10 text-blue-400">Combined Direct</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: attainment.numCos }).map((_, i) => {
                    const coKey = `CO${i + 1}`;
                    const val = attainment.combinedCO[coKey] || {};
                    return (
                      <tr key={coKey} className="hover:bg-slate-800/10 border-b border-slate-700/40">
                        <td className="border-r border-slate-700/60 px-4 py-2 font-bold text-left bg-slate-900/20 text-slate-300">{coKey}</td>
                        <td className="border-r border-slate-700/60 px-4 py-2 text-slate-300">{val.internalLevel ?? 0}</td>
                        <td className="border-r border-slate-700/60 px-4 py-2 text-slate-300">{val.externalLevel ?? 0}</td>
                        <td className="px-4 py-2 text-blue-300 font-semibold bg-blue-500/5">{val.combinedLevel ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-500 text-sm text-center py-6">Calculate or upload grades to view calculations.</p>
          )}
        </div>

        {/* CO Attainment Levels Bar Chart */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 flex flex-col justify-between min-h-[300px]">
          <h4 className="font-bold text-lg text-slate-100 border-b border-slate-700/50 pb-2">CO Component Comparison</h4>
          {attainment ? (
            <div className="w-full h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getCOBarChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                  <XAxis dataKey="name" stroke="#cbd5e1" />
                  <YAxis stroke="#cbd5e1" domain={[0, 3]} ticks={[0, 1, 2, 3]} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#fff' }} />
                  <Legend wrapperStyle={{ color: '#fff' }} />
                  <Bar dataKey="Internal" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="External" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Combined" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-slate-500 text-sm text-center py-6">Charts will display once attainment data is processed.</p>
          )}
        </div>
      </div>

      {/* PO Attainment & Radar Chart */}
      {attainment && (
        <div className="grid gap-6 md:grid-cols-3">
          
          {/* PO/PSO Attainment List */}
          <div className="md:col-span-2 rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 space-y-4">
            <h4 className="font-bold text-lg text-slate-100 border-b border-slate-700/50 pb-2">Program Outcome (PO/PSO) Attainment Summary</h4>
            <div className="grid gap-2 grid-cols-3 sm:grid-cols-5">
              {/* POs */}
              {Array.from({ length: 12 }).map((_, i) => {
                const poKey = `po${i + 1}`;
                const val = attainment.poResults[poKey] || 0.00;
                return (
                  <div key={i} className="p-3 border border-slate-700/40 rounded-xl bg-slate-900/30 text-center">
                    <p className="text-xs font-bold text-slate-400">PO{i + 1}</p>
                    <p className="text-lg font-extrabold text-blue-400 mt-1">{val}</p>
                  </div>
                );
              })}
              {/* PSOs */}
              {Array.from({ length: 3 }).map((_, i) => {
                const psoKey = `pso${i + 1}`;
                const val = attainment.poResults[psoKey] || 0.00;
                return (
                  <div key={i} className="p-3 border border-slate-700/40 rounded-xl bg-slate-900/30 text-center">
                    <p className="text-xs font-bold text-slate-400">PSO{i + 1}</p>
                    <p className="text-lg font-extrabold text-amber-400 mt-1">{val}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PO Radar Chart Profile */}
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 flex flex-col justify-between min-h-[300px]">
            <h4 className="font-bold text-lg text-slate-100 border-b border-slate-700/50 pb-2">PO Attainment Profile</h4>
            <div className="w-full h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={getPORadarChartData()}>
                  <PolarGrid stroke="#475569" />
                  <PolarAngleAxis dataKey="subject" stroke="#cbd5e1" fontSize={10} />
                  <PolarRadiusAxis angle={30} domain={[0, 3]} stroke="#cbd5e1" fontSize={8} />
                  <Radar name="PO Attainment" dataKey="Attainment" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
