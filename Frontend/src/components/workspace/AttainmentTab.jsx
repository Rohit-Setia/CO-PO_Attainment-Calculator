import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Info, TrendingUp, Award, Grid, Target } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import EmptyState from '../ui/EmptyState';

const getLevelBadge = (level) => {
  if (level === null || level === undefined) {
    return <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Pending</span>;
  }
  if (level === 3) {
    return <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">Level 3</span>;
  }
  if (level === 2) {
    return <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-600 dark:text-blue-400">Level 2</span>;
  }
  if (level === 1) {
    return <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">Level 1</span>;
  }
  return <span className="inline-flex items-center rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-600 dark:text-rose-400">Level 0</span>;
};

export default function AttainmentTab({
  attainment,
  courseOutcomes = [],
  programOutcomes,
  config,
}) {
  const { isDark } = useTheme();
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const axisColor = isDark ? '#94a3b8' : '#64748b';

  const hasData = Boolean(attainment?.hasData);
  const hasMttData = Boolean(attainment?.hasMttData ?? (attainment?.mttAttainment !== null));
  const hasEttData = Boolean(attainment?.hasEttData ?? (attainment?.ettAttainment !== null));

  // Determine if valid PO mapping exists
  const hasPoData = useMemo(() => {
    if (attainment?.hasPoData !== undefined) return attainment.hasPoData;
    if (!attainment?.poResults) return false;
    return Object.values(attainment.poResults).some((val) => parseFloat(val) > 0);
  }, [attainment]);

  // Real CO comparison bar chart data derived from backend calculation
  const coComparisonData = useMemo(() => {
    if (!attainment || !courseOutcomes || courseOutcomes.length === 0) return [];
    return courseOutcomes.map((co) => {
      const mtt = attainment.mttAttainment?.perCo?.[co.id];
      const ett = attainment.ettAttainment?.perCo?.[co.id];
      const combined = attainment.combinedCO?.[co.id];

      return {
        id: co.id,
        name: `CO${co.co_number}`,
        co_number: co.co_number,
        description: co.description || `Course Outcome ${co.co_number}`,
        Internal: hasMttData && mtt ? mtt.level : null,
        External: hasEttData && ett ? ett.level : null,
        Combined: combined ? combined.combinedLevel : null,
        mttPercent: mtt ? mtt.percentAbove : null,
        mttAbove: mtt ? mtt.studentsAboveThreshold : null,
        mttTotal: mtt ? mtt.totalStudents : null,
        mttThreshold: mtt ? mtt.thresholdMarks : null,
        mttMax: mtt ? mtt.maxMarks : null,
        ettPercent: ett ? ett.percentAbove : null,
        ettAbove: ett ? ett.studentsAboveThreshold : null,
        ettTotal: ett ? ett.totalStudents : null,
        ettThreshold: ett ? ett.thresholdMarks : null,
        ettMax: ett ? ett.maxMarks : null,
      };
    });
  }, [attainment, courseOutcomes, hasMttData, hasEttData]);

  // PO & PSO radar/bar chart data — labels come from the program's own outcome definitions
  // when available (never a hardcoded list), falling back to PO1..PO12 / PSO1..PSO3.
  const poChartData = useMemo(() => {
    if (!attainment?.poResults || !hasPoData) return [];
    const poDefs = (programOutcomes?.PO || []).filter((d) => /^po\d+$/i.test(d.code));
    const psoDefs = (programOutcomes?.PSO || []).filter((d) => /^pso\d+$/i.test(d.code));
    const data = [];
    poDefs.forEach((def, idx) => {
      const key = `po${idx + 1}`;
      data.push({
        subject: def.code || `PO${idx + 1}`,
        title: def.title || '',
        Attainment: parseFloat(attainment.poResults[key]) || 0,
        averageCorrelation: attainment.poAverages ? (parseFloat(attainment.poAverages[key]) || 0) : null,
        fullMark: 3,
      });
    });
    if (poDefs.length === 0) {
      for (let po = 1; po <= 12; po++) {
        const key = `po${po}`;
        data.push({
          subject: `PO${po}`,
          Attainment: parseFloat(attainment.poResults[key]) || 0,
          averageCorrelation: attainment.poAverages ? (parseFloat(attainment.poAverages[key]) || 0) : null,
          fullMark: 3,
        });
      }
    }
    psoDefs.forEach((def, idx) => {
      const key = `pso${idx + 1}`;
      data.push({
        subject: def.code || `PSO${idx + 1}`,
        title: def.title || '',
        Attainment: parseFloat(attainment.poResults[key]) || 0,
        averageCorrelation: attainment.poAverages ? (parseFloat(attainment.poAverages[key]) || 0) : null,
        fullMark: 3,
      });
    });
    if (psoDefs.length === 0) {
      for (let pso = 1; pso <= 3; pso++) {
        const key = `pso${pso}`;
        data.push({
          subject: `PSO${pso}`,
          Attainment: parseFloat(attainment.poResults[key]) || 0,
          averageCorrelation: attainment.poAverages ? (parseFloat(attainment.poAverages[key]) || 0) : null,
          fullMark: 3,
        });
      }
    }
    return data;
  }, [attainment, hasPoData, programOutcomes]);

  if (!courseOutcomes || courseOutcomes.length === 0) {
    return (
      <EmptyState
        icon={Info}
        title="Complete course configuration before calculating attainment."
        description="Add at least one Course Outcome in Setup & Configs to begin."
      />
    );
  }

  if (!hasData) {
    return (
      <EmptyState
        icon={Info}
        title="No attainment data available yet."
        description="Enter and save MTT or ETT marks in the Marks Entry tab to calculate real attainment results."
      />
    );
  }

  const overallScore = attainment.overallCourseAttainment ?? 0;
  const mttAvg = hasMttData ? attainment.mttAttainment?.CO : null;
  const ettAvg = hasEttData ? attainment.ettAttainment?.CO : null;
  const intWeight = attainment.internalWeight ?? 30;
  const extWeight = attainment.externalWeight ?? 70;

  return (
    <div className="space-y-8">
      {/* ── KPI Summary Cards ────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Combined Direct Attainment</p>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-primary">{overallScore}</span>
            <span className="text-sm font-medium text-muted-foreground">/ 3.00</span>
          </div>
          <div className="mt-2 text-xs font-medium text-muted-foreground">
            {hasMttData && hasEttData ? (
              <span className="text-emerald-600 dark:text-emerald-400">Complete Evaluation (MTT + ETT)</span>
            ) : hasMttData ? (
              <span className="text-amber-600 dark:text-amber-400">Internal Evaluation (MTT Only)</span>
            ) : (
              <span className="text-cyan-600 dark:text-cyan-400">External Evaluation (ETT Only)</span>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Internal (MTT) Average</p>
            <Award className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-foreground">{mttAvg !== null ? mttAvg : '—'}</span>
            {mttAvg !== null && <span className="text-sm font-medium text-muted-foreground">/ 3.00</span>}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {hasMttData ? `Threshold: ${config?.threshold_percent_internal || 40}% of max marks` : 'Marks not entered'}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">External (ETT) Average</p>
            <Award className="h-4 w-4 text-cyan-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-foreground">{ettAvg !== null ? ettAvg : '—'}</span>
            {ettAvg !== null && <span className="text-sm font-medium text-muted-foreground">/ 3.00</span>}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {hasEttData ? `Threshold: ${config?.threshold_percent_external || 40}% of max marks` : 'Marks not entered'}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Evaluation Weightage</p>
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-3 flex items-baseline gap-1.5 text-foreground">
            <span className="text-2xl font-extrabold">{intWeight}%</span>
            <span className="text-xs text-muted-foreground">MTT</span>
            <span className="text-muted-foreground">+</span>
            <span className="text-2xl font-extrabold">{extWeight}%</span>
            <span className="text-xs text-muted-foreground">ETT</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Level 3 Criteria: ≥ {config?.level3_criteria_internal || 70}% students
          </div>
        </div>
      </div>

      {/* ── CO Attainment Levels Table ────────────────────────────────────── */}
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
          <div>
            <h4 className="text-lg font-bold text-foreground">Course Outcome (CO) Attainment Matrix</h4>
            <p className="text-xs text-muted-foreground">Calculated student success rates and attainment levels per Course Outcome</p>
          </div>
          <span className="inline-flex w-fit items-center rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            {courseOutcomes.length} Active CO{courseOutcomes.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/60 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="border-b border-r border-border px-4 py-3">CO</th>
                <th className="border-b border-r border-border px-4 py-3">Description</th>
                <th className="border-b border-r border-border px-4 py-3 text-center">MTT Level</th>
                <th className="border-b border-r border-border px-4 py-3 text-center">MTT Students Met (%)</th>
                <th className="border-b border-r border-border px-4 py-3 text-center">ETT Level</th>
                <th className="border-b border-r border-border px-4 py-3 text-center">ETT Students Met (%)</th>
                <th className="border-b border-r border-border bg-primary/10 px-4 py-3 text-center text-primary">Combined Direct</th>
                <th className="border-b border-r border-border px-4 py-3 text-center">Target</th>
                <th className="border-b border-border px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {courseOutcomes.map((co) => {
                const mtt = attainment.mttAttainment?.perCo?.[co.id];
                const ett = attainment.ettAttainment?.perCo?.[co.id];
                const combined = attainment.combinedCO?.[co.id];

                return (
                  <tr key={co.id} className="hover:bg-muted/30 transition-colors">
                    <td className="border-r border-border bg-muted/20 px-4 py-3 font-bold text-foreground">
                      CO{co.co_number}
                    </td>
                    <td className="border-r border-border px-4 py-3 text-xs text-muted-foreground max-w-xs truncate" title={co.description}>
                      {co.description || `Course Outcome ${co.co_number}`}
                    </td>
                    <td className="border-r border-border px-4 py-3 text-center">
                      {hasMttData && mtt ? getLevelBadge(mtt.level) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="border-r border-border px-4 py-3 text-center text-xs">
                      {hasMttData && mtt ? (
                        <div>
                          <span className="font-semibold text-foreground">{mtt.percentAbove}%</span>
                          <span className="block text-[10px] text-muted-foreground">({mtt.studentsAboveThreshold}/{mtt.totalStudents} ≥ {mtt.thresholdMarks}m)</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="border-r border-border px-4 py-3 text-center">
                      {hasEttData && ett ? getLevelBadge(ett.level) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="border-r border-border px-4 py-3 text-center text-xs">
                      {hasEttData && ett ? (
                        <div>
                          <span className="font-semibold text-foreground">{ett.percentAbove}%</span>
                          <span className="block text-[10px] text-muted-foreground">({ett.studentsAboveThreshold}/{ett.totalStudents} ≥ {ett.thresholdMarks}m)</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="border-r border-border bg-primary/5 px-4 py-3 text-center font-bold text-primary">
                      {combined ? combined.combinedLevel.toFixed(2) : '0.00'}
                    </td>
                    <td className="border-r border-border px-4 py-3 text-center text-xs italic text-muted-foreground" title="No target attainment level is configured anywhere in this system yet — nothing is assumed.">
                      Not configured
                    </td>
                    <td className="px-4 py-3 text-center text-xs italic text-muted-foreground">
                      N/A
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3 shrink-0" />
          Target attainment levels are not yet configurable in this system, so Target/Status are shown honestly as not configured rather than assumed.
        </p>
      </div>

      {/* ── Charts Grid ─────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart 1: CO Attainment Component Comparison */}
        <div className="flex min-h-[380px] flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="border-b border-border pb-3">
            <h4 className="text-base font-bold text-foreground">CO Attainment Breakdown by Component</h4>
            <p className="text-xs text-muted-foreground">Internal (MTT) vs External (ETT) vs Combined Direct score per CO</p>
          </div>
          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={coComparisonData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis
                  dataKey="name"
                  stroke={axisColor}
                  tick={{ fill: axisColor, fontSize: 12 }}
                  interval={0}
                />
                <YAxis stroke={axisColor} domain={[0, 3]} ticks={[0, 1, 2, 3]} tick={{ fill: axisColor, fontSize: 12 }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="rounded-xl border border-border bg-popover p-3 shadow-lg text-xs space-y-2 text-popover-foreground">
                        <p className="font-bold text-primary text-sm">{label}: {item.description}</p>
                        <div className="space-y-1 divide-y divide-border/60">
                          {hasMttData && item.Internal !== null && (
                            <div className="pt-1 flex justify-between gap-4">
                              <span className="text-amber-500 font-medium">Internal (MTT):</span>
                              <span className="font-bold">Level {item.Internal} ({item.mttPercent}% students)</span>
                            </div>
                          )}
                          {hasEttData && item.External !== null && (
                            <div className="pt-1 flex justify-between gap-4">
                              <span className="text-cyan-500 font-medium">External (ETT):</span>
                              <span className="font-bold">Level {item.External} ({item.ettPercent}% students)</span>
                            </div>
                          )}
                          <div className="pt-1 flex justify-between gap-4">
                            <span className="text-primary font-bold">Combined Direct:</span>
                            <span className="font-extrabold">{item.Combined} / 3.00</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ color: axisColor, fontSize: 12, paddingTop: 10 }} />
                {hasMttData && <Bar dataKey="Internal" name="MTT (Internal)" fill="#f59e0b" radius={[4, 4, 0, 0]} />}
                {hasEttData && <Bar dataKey="External" name="ETT (External)" fill="#06b6d4" radius={[4, 4, 0, 0]} />}
                <Bar dataKey="Combined" name="Combined Direct" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: CO Performance vs NBA Benchmark Levels */}
        <div className="flex min-h-[380px] flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="border-b border-border pb-3">
            <h4 className="text-base font-bold text-foreground">CO Direct Attainment vs Target Benchmarks</h4>
            <p className="text-xs text-muted-foreground">Attainment levels against NBA Level 1 (1.0), Level 2 (2.0), and Level 3 (3.0) criteria</p>
          </div>
          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={coComparisonData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis
                  dataKey="name"
                  stroke={axisColor}
                  tick={{ fill: axisColor, fontSize: 12 }}
                  interval={0}
                />
                <YAxis stroke={axisColor} domain={[0, 3]} ticks={[0, 1, 2, 3]} tick={{ fill: axisColor, fontSize: 12 }} />
                <ReferenceLine y={3} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'L3 (3.0)', fill: '#10b981', fontSize: 10, position: 'insideTopRight' }} />
                <ReferenceLine y={2} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: 'L2 (2.0)', fill: '#3b82f6', fontSize: 10, position: 'insideTopRight' }} />
                <ReferenceLine y={1} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'L1 (1.0)', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="rounded-xl border border-border bg-popover p-3 shadow-lg text-xs space-y-1.5 text-popover-foreground">
                        <p className="font-bold text-primary">{label}</p>
                        <p className="text-muted-foreground text-[11px]">{item.description}</p>
                        <p className="font-extrabold text-foreground text-sm">Direct Attainment: {item.Combined} / 3.00</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="Combined" name="Attainment Level" radius={[6, 6, 0, 0]}>
                  {coComparisonData.map((entry) => {
                    const val = entry.Combined || 0;
                    let fill = '#ef4444';
                    if (val >= 2.5) fill = '#10b981';
                    else if (val >= 1.8) fill = '#3b82f6';
                    else if (val >= 1.0) fill = '#f59e0b';
                    return <Cell key={`cell-${entry.id}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── PO/PSO Attainment Section ────────────────────────────────────── */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Grid className="h-5 w-5 text-primary" />
          <div>
            <h4 className="text-lg font-bold text-foreground">Program Outcome (PO / PSO) Attainment</h4>
            <p className="text-xs text-muted-foreground">Mapped outcome attainment based on course articulation matrix and overall course score</p>
          </div>
        </div>

        {hasPoData ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-2">
              <h5 className="text-sm font-bold text-foreground uppercase tracking-wider text-muted-foreground">PO & PSO Attainment Grid</h5>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
                {(programOutcomes?.PO?.length
                  ? programOutcomes.PO.filter((d) => /^po\d+$/i.test(d.code))
                  : Array.from({ length: 12 }, (_, i) => ({ code: `PO${i + 1}`, title: '' }))
                ).map((def) => {
                  const poNum = parseInt(def.code.slice(2), 10);
                  const poKey = `po${poNum}`;
                  const val = attainment.poResults?.[poKey] ?? 0.00;
                  const avg = attainment.poAverages?.[poKey];
                  return (
                    <div key={poKey} className="rounded-xl border border-border bg-muted/30 p-3 text-center hover:border-primary/40 transition-colors" title={def.title || def.description || ''}>
                      <p className="text-xs font-bold text-muted-foreground">{def.code}</p>
                      <p className="mt-1 text-xl font-extrabold text-primary">{Number(val).toFixed(2)}</p>
                      {avg !== undefined && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Avg: {Number(avg).toFixed(2)}</p>
                      )}
                    </div>
                  );
                })}
                {(programOutcomes?.PSO?.length
                  ? programOutcomes.PSO.filter((d) => /^pso\d+$/i.test(d.code))
                  : Array.from({ length: 3 }, (_, i) => ({ code: `PSO${i + 1}`, title: '' }))
                ).map((def) => {
                  const psoNum = parseInt(def.code.slice(3), 10);
                  const psoKey = `pso${psoNum}`;
                  const val = attainment.poResults?.[psoKey] ?? 0.00;
                  const avg = attainment.poAverages?.[psoKey];
                  return (
                    <div key={psoKey} className="rounded-xl border border-border bg-muted/30 p-3 text-center hover:border-warning/40 transition-colors" title={def.title || def.description || ''}>
                      <p className="text-xs font-bold text-muted-foreground">{def.code}</p>
                      <p className="mt-1 text-xl font-extrabold text-amber-500">{Number(val).toFixed(2)}</p>
                      {avg !== undefined && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Avg: {Number(avg).toFixed(2)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex min-h-[320px] flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h5 className="text-sm font-bold text-foreground uppercase tracking-wider text-muted-foreground">PO Attainment Radar Profile</h5>
              <div className="mt-2 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={poChartData}>
                    <PolarGrid stroke={gridColor} />
                    <PolarAngleAxis dataKey="subject" stroke={axisColor} fontSize={10} />
                    <PolarRadiusAxis angle={30} domain={[0, 3]} stroke={axisColor} fontSize={8} />
                    <Radar name="PO Attainment" dataKey="Attainment" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-xl border border-border bg-popover p-2.5 shadow-lg text-xs text-popover-foreground">
                            <p className="font-bold text-primary">{data.subject}</p>
                            <p className="font-bold">Attainment: {data.Attainment} / 3.00</p>
                            {data.averageCorrelation !== null && (
                              <p className="text-muted-foreground text-[10px]">Avg Correlation: {data.averageCorrelation}</p>
                            )}
                          </div>
                        );
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
              <Grid className="h-6 w-6" />
            </div>
            <h5 className="mt-3 text-base font-bold text-foreground">PO / PSO Attainment Not Configured</h5>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              PO/PSO attainment will appear automatically after you map Course Outcomes to Program Outcomes in the <strong>Articulation Matrix</strong> tab.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
