import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { useTheme } from '../../context/ThemeContext';

export default function AttainmentTab({
  attainment,
  getCOBarChartData,
  getPORadarChartData
}) {
  const { isDark } = useTheme();
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipStyle = {
    backgroundColor: isDark ? '#1e293b' : '#ffffff',
    border: `1px solid ${gridColor}`,
    color: isDark ? '#f1f5f9' : '#0f172a',
    borderRadius: 8,
  };

  return (
    <div className="space-y-8">
      {/* Overall Attainment Score Card */}
      {attainment && (
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          <div className="flex min-h-[120px] flex-col justify-between rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Combined Direct CO Attainment</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-primary">{attainment.overallCourseAttainment}</span>
              <span className="text-sm text-muted-foreground">/ 3.0</span>
            </div>
          </div>
          <div className="flex min-h-[120px] flex-col justify-between rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Internal (MTT) Average</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-foreground">{attainment.mttAttainment ? attainment.mttAttainment.CO : 'N/A'}</span>
              <span className="text-sm text-muted-foreground">/ 3.0</span>
            </div>
          </div>
          <div className="flex min-h-[120px] flex-col justify-between rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">External (ETT) Average</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-foreground">{attainment.ettAttainment ? attainment.ettAttainment.CO : 'N/A'}</span>
              <span className="text-sm text-muted-foreground">/ 3.0</span>
            </div>
          </div>
          <div className="flex min-h-[120px] flex-col justify-between rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Direct Calculation Weightage</p>
            <div className="mt-2 text-foreground">
              <span className="text-base font-bold">{attainment.internalWeight}%</span> Internal + <span className="text-base font-bold">{attainment.externalWeight}%</span> External
            </div>
          </div>
        </div>
      )}

      {/* Attainment Levels Grid */}
      <div className="grid gap-6 md:grid-cols-2">

        {/* CO Attainment Level Table */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h4 className="border-b border-border pb-2 text-lg font-bold text-foreground">Course Outcome (CO) Attainment Levels</h4>

          {attainment ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse text-center text-sm">
                <thead className="bg-muted/60 font-bold text-muted-foreground">
                  <tr>
                    <th className="border-b border-r border-border bg-muted/60 px-4 py-2.5 text-left">CO</th>
                    <th className="border-b border-r border-border px-4 py-2.5">MTT Level</th>
                    <th className="border-b border-r border-border px-4 py-2.5">ETT Level</th>
                    <th className="border-b border-border bg-primary/10 px-4 py-2.5 text-primary">Combined Direct</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: attainment.numCos }).map((_, i) => {
                    const coKey = `CO${i + 1}`;
                    const val = attainment.combinedCO[coKey] || {};
                    return (
                      <tr key={coKey} className="border-b border-border hover:bg-muted/30">
                        <td className="border-r border-border bg-muted/20 px-4 py-2 text-left font-bold text-foreground">{coKey}</td>
                        <td className="border-r border-border px-4 py-2 text-foreground">{val.internalLevel ?? 0}</td>
                        <td className="border-r border-border px-4 py-2 text-foreground">{val.externalLevel ?? 0}</td>
                        <td className="bg-primary/5 px-4 py-2 font-semibold text-primary">{val.combinedLevel ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Calculate or upload grades to view calculations.</p>
          )}
        </div>

        {/* CO Attainment Levels Bar Chart */}
        <div className="flex min-h-[300px] flex-col justify-between rounded-2xl border border-border bg-card p-6">
          <h4 className="border-b border-border pb-2 text-lg font-bold text-foreground">CO Component Comparison</h4>
          {attainment ? (
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getCOBarChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="name" stroke={axisColor} />
                  <YAxis stroke={axisColor} domain={[0, 3]} ticks={[0, 1, 2, 3]} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ color: axisColor }} />
                  <Bar dataKey="Internal" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="External" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Combined" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Charts will display once attainment data is processed.</p>
          )}
        </div>
      </div>

      {/* PO Attainment & Radar Chart */}
      {attainment && (
        <div className="grid gap-6 md:grid-cols-3">

          {/* PO/PSO Attainment List */}
          <div className="space-y-4 rounded-2xl border border-border bg-card p-6 md:col-span-2">
            <h4 className="border-b border-border pb-2 text-lg font-bold text-foreground">Program Outcome (PO/PSO) Attainment Summary</h4>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {/* POs */}
              {Array.from({ length: 12 }).map((_, i) => {
                const poKey = `po${i + 1}`;
                const val = attainment.poResults[poKey] || 0.00;
                return (
                  <div key={i} className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                    <p className="text-xs font-bold text-muted-foreground">PO{i + 1}</p>
                    <p className="mt-1 text-lg font-extrabold text-primary">{val}</p>
                  </div>
                );
              })}
              {/* PSOs */}
              {Array.from({ length: 3 }).map((_, i) => {
                const psoKey = `pso${i + 1}`;
                const val = attainment.poResults[psoKey] || 0.00;
                return (
                  <div key={i} className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                    <p className="text-xs font-bold text-muted-foreground">PSO{i + 1}</p>
                    <p className="mt-1 text-lg font-extrabold text-warning">{val}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PO Radar Chart Profile */}
          <div className="flex min-h-[300px] flex-col justify-between rounded-2xl border border-border bg-card p-6">
            <h4 className="border-b border-border pb-2 text-lg font-bold text-foreground">PO Attainment Profile</h4>
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={getPORadarChartData()}>
                  <PolarGrid stroke={gridColor} />
                  <PolarAngleAxis dataKey="subject" stroke={axisColor} fontSize={10} />
                  <PolarRadiusAxis angle={30} domain={[0, 3]} stroke={axisColor} fontSize={8} />
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
