import React, { useEffect, useState } from 'react';
import { fetchClassrooms, fetchSubjects, fetchAttainmentHistory } from '../../Api/erpApi';
import { fetchCOs, fetchPOs, fetchPSOs, fetchCOPOMappings } from '../../Api/erpApi';
import { Layers, Calendar, CalendarRange, TrendingUp, Award, Activity } from 'lucide-react';

export default function AnalyticsReportsPage() {
  const [classrooms, setClassrooms] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  
  const [history, setHistory] = useState([]);
  const [activeRecord, setActiveRecord] = useState(null);
  const [subjectCOs, setSubjectCOs] = useState([]);
  const [pos, setPOs] = useState([]);
  const [psos, setPSOs] = useState([]);
  const [mappings, setMappings] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('attainment');

  useEffect(() => {
    const loadDropdowns = async () => {
      try {
        const classRes = await fetchClassrooms();
        setClassrooms(classRes.data.data);
        if (classRes.data.data.length > 0) {
          setSelectedClassroomId(classRes.data.data[0].id);
          setSelectedSubjectId(classRes.data.data[0].subject_id);
        }
        
        const subRes = await fetchSubjects();
        setSubjects(subRes.data.data);
      } catch (err) {
        setError('Failed to load classrooms');
      }
    };
    loadDropdowns();
  }, []);

  const loadHistoryAndMatrix = async () => {
    if (!selectedClassroomId || !selectedSubjectId) return;
    try {
      setLoading(true);
      setError('');
      
      const histRes = await fetchAttainmentHistory(selectedSubjectId, selectedClassroomId);
      setHistory(histRes.data.data);
      if (histRes.data.data.length > 0) {
        setActiveRecord(histRes.data.data[0]);
      } else {
        setActiveRecord(null);
      }

      const cosRes = await fetchCOs(selectedSubjectId);
      setSubjectCOs(cosRes.data.data);

      const posRes = await fetchPOs();
      setPOs(posRes.data.data);

      const psosRes = await fetchPSOs();
      setPSOs(psosRes.data.data);

      const mapRes = await fetchCOPOMappings(selectedSubjectId);
      setMappings(mapRes.data.data);
    } catch (err) {
      setError('Failed to load historical analytics records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistoryAndMatrix();
  }, [selectedClassroomId, selectedSubjectId]);

  const handleClassroomChange = (id) => {
    setSelectedClassroomId(id);
    const cls = classrooms.find(c => String(c.id) === String(id));
    if (cls) {
      setSelectedSubjectId(cls.subject_id);
    }
  };

  // Determine PO attainment based on CO-PO mappings and CO attainment percentages
  const calculatePOAttainments = (record) => {
    if (!record || !pos.length || !mappings.length || !subjectCOs.length) return [];
    
    const coLevels = {}; // CO_ID -> level (0,1,2,3)
    subjectCOs.forEach(co => {
      const coKey = co.co_number.toUpperCase();
      coLevels[co.id] = record.results.perCO?.[coKey]?.level ?? 0;
    });

    const poAttainmentList = pos.map(po => {
      // Find all mappings linking to this PO
      const links = mappings.filter(m => m.po_id === po.id);
      if (links.length === 0) return { ...po, level: 0, mappedCount: 0 };

      let weightedSum = 0;
      let weightTotal = 0;

      links.forEach(link => {
        const coLvl = coLevels[link.co_id] ?? 0;
        weightedSum += coLvl * link.mapping_value;
        weightTotal += link.mapping_value;
      });

      const avgLevel = weightTotal > 0 ? (weightedSum / weightTotal) : 0;

      return {
        ...po,
        level: parseFloat(avgLevel.toFixed(2)),
        mappedCount: links.length
      };
    });

    return poAttainmentList.filter(po => po.mappedCount > 0);
  };

  const calculatePSOAttainments = (record) => {
    if (!record || !psos.length || !mappings.length || !subjectCOs.length) return [];
    
    const coLevels = {}; // CO_ID -> level (0,1,2,3)
    subjectCOs.forEach(co => {
      const coKey = co.co_number.toUpperCase();
      coLevels[co.id] = record.results.perCO?.[coKey]?.level ?? 0;
    });

    const psoAttainmentList = psos.map(pso => {
      // Find all mappings linking to this PSO
      const links = mappings.filter(m => m.pso_id === pso.id);
      if (links.length === 0) return { ...pso, level: 0, mappedCount: 0 };

      let weightedSum = 0;
      let weightTotal = 0;

      links.forEach(link => {
        const coLvl = coLevels[link.co_id] ?? 0;
        weightedSum += coLvl * link.mapping_value;
        weightTotal += link.mapping_value;
      });

      const avgLevel = weightTotal > 0 ? (weightedSum / weightTotal) : 0;

      return {
        ...pso,
        level: parseFloat(avgLevel.toFixed(2)),
        mappedCount: links.length
      };
    });

    return psoAttainmentList.filter(pso => pso.mappedCount > 0);
  };

  const activePOAttainments = calculatePOAttainments(activeRecord);
  const activePSOAttainments = calculatePSOAttainments(activeRecord);

  // Helper color indicators
  const getLevelColor = (level) => {
    if (level >= 2.5) return 'bg-emerald-500 text-white';
    if (level >= 1.5) return 'bg-blue-500 text-white';
    if (level >= 0.5) return 'bg-amber-500 text-white';
    return 'bg-rose-500 text-white';
  };

  const getLevelBarColor = (level) => {
    if (level >= 2.5) return 'from-emerald-400 to-emerald-600';
    if (level >= 1.5) return 'from-blue-400 to-blue-600';
    if (level >= 0.5) return 'from-amber-400 to-amber-600';
    return 'from-rose-400 to-rose-600';
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4 print:border-none print:shadow-none">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 print:text-xl">OBE Reports & Analytics</h1>
          <p className="text-slate-500 text-sm print:text-xs">Visualize outcome achievements, review historical records, and inspect PO attainments.</p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <select
            value={selectedClassroomId}
            onChange={(e) => handleClassroomChange(e.target.value)}
            className="border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800"
          >
            <option value="">Select Classroom</option>
            {classrooms.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.subject_name})</option>
            ))}
          </select>
          <button
            onClick={handlePrint}
            disabled={!activeRecord}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-lg transition-all"
          >
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-semibold border border-red-200 print:hidden">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-48 flex items-center justify-center text-slate-500 font-medium">Loading reports console...</div>
      ) : activeRecord ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* History selection column */}
          <div className="lg:col-span-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4 print:hidden">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <CalendarRange className="h-4 w-4" />
              <span>Attainment Records History</span>
            </h3>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {history.map(hist => (
                <button
                  key={hist.id}
                  onClick={() => setActiveRecord(hist)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    activeRecord.id === hist.id
                      ? 'border-blue-500 bg-blue-50/50 text-blue-900 font-bold'
                      : 'border-slate-100 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <p className="text-sm truncate">{hist.assessment_name}</p>
                  <div className="flex justify-between items-center mt-2 text-[10px] text-slate-400">
                    <span>{hist.assessment_type}</span>
                    <span>{new Date(hist.calculation_date).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Visualization Console */}
          <div className="lg:col-span-3 print:col-span-4 print:w-full space-y-6">
            {/* Header statistics cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 print:border-none print:shadow-none">
                <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 print:hidden">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase leading-none mb-1">Average CO Level</p>
                  <p className="text-2xl font-extrabold text-slate-800 leading-none">
                    {activeRecord.results.CO}
                  </p>
                </div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 print:border-none print:shadow-none">
                <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 print:hidden">
                  <Award className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase leading-none mb-1">Students Tested</p>
                  <p className="text-2xl font-extrabold text-slate-800 leading-none">
                    {activeRecord.results.totalStudents}
                  </p>
                </div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 print:border-none print:shadow-none">
                <div className="h-12 w-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 print:hidden">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase leading-none mb-1">Assessment Type</p>
                  <p className="text-2xl font-extrabold text-slate-800 leading-none">
                    {activeRecord.assessment_type}
                  </p>
                </div>
              </div>
            </div>

            {/* Tabs Selector */}
            <div className="flex border-b border-slate-200 gap-4 print:hidden">
              <button
                onClick={() => setActiveTab('attainment')}
                className={`pb-3 text-sm font-extrabold transition-all border-b-2 ${
                  activeTab === 'attainment'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Outcome Attainments
              </button>
              <button
                onClick={() => setActiveTab('charts')}
                className={`pb-3 text-sm font-extrabold transition-all border-b-2 ${
                  activeTab === 'charts'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Comparison Charts
              </button>
              <button
                onClick={() => setActiveTab('heatmap')}
                className={`pb-3 text-sm font-extrabold transition-all border-b-2 ${
                  activeTab === 'heatmap'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Correlation Heatmap
              </button>
            </div>

            {/* Outcome Attainments (CO, PO, PSO summary cards) */}
            <div className={`${activeTab === 'attainment' ? 'block' : 'hidden'} print:block space-y-6`}>
              {/* CO Attainment Level Bars */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 print:border-none print:shadow-none">
                <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <Layers className="h-5 w-5 text-blue-500 print:hidden" />
                  <span>Course Outcome (CO) Achievement Percentages</span>
                </h2>

                <div className="space-y-4 pt-2">
                  {Object.entries(activeRecord.results.perCO || {}).map(([coKey, coData]) => (
                    <div key={coKey} className="space-y-1">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-blue-600">{coKey} ({coData.maxMarks} Marks)</span>
                        <span className="text-slate-600">{coData.percentAbove}% (L{coData.level})</span>
                      </div>
                      <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${getLevelBarColor(coData.level)} transition-all duration-500`}
                          style={{ width: `${coData.percentAbove}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Program Outcomes (PO) Indirect Attainment */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 print:border-none print:shadow-none">
                <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <Layers className="h-5 w-5 text-blue-500 print:hidden" />
                  <span>Program Outcome (PO) Indirect Attainments</span>
                </h2>
                
                {activePOAttainments.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 pt-2 print:grid-cols-6">
                    {activePOAttainments.map(po => (
                      <div key={po.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col items-center justify-center text-center shadow-sm print:bg-white print:border print:border-slate-200">
                        <span className="text-xs font-extrabold text-slate-400 leading-none">{po.po_number}</span>
                        <span className="text-base font-black text-slate-800 my-2">{po.level}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${getLevelColor(po.level)}`}>
                          Level {Math.round(po.level)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-400 font-semibold border border-slate-100">
                    No mapped PO links detected in the subject's OBE mapping matrix. Map COs to POs to view PO attainments.
                  </div>
                )}
              </div>

              {/* Program Specific Outcomes (PSO) Indirect Attainment */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 print:border-none print:shadow-none">
                <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <Layers className="h-5 w-5 text-blue-500 print:hidden" />
                  <span>Program Specific Outcome (PSO) Indirect Attainments</span>
                </h2>
                
                {activePSOAttainments.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 print:grid-cols-3">
                    {activePSOAttainments.map(pso => (
                      <div key={pso.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col items-center justify-center text-center shadow-sm print:bg-white print:border print:border-slate-200">
                        <span className="text-xs font-extrabold text-slate-400 leading-none">{pso.pso_number}</span>
                        <span className="text-base font-black text-slate-800 my-2">{pso.level}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${getLevelColor(pso.level)}`}>
                          Level {Math.round(pso.level)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-400 font-semibold border border-slate-100">
                    No mapped PSO links detected in the subject's OBE mapping matrix. Map COs to PSOs to view PSO attainments.
                  </div>
                )}
              </div>
            </div>

            {/* SVG Comparison Charts */}
            <div className={`${activeTab === 'charts' ? 'block' : 'hidden'} print:block space-y-6 print:break-before-page`}>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 print:border-none print:shadow-none">
                <h2 className="text-base font-extrabold text-slate-800">
                  PO Attainment: Target vs. Actual Comparison
                </h2>
                
                {activePOAttainments.length > 0 ? (
                  <div className="space-y-4">
                    <div className="w-full overflow-x-auto">
                      <svg viewBox="0 0 600 250" className="w-full min-w-[500px] h-auto">
                        <line x1="40" y1="20" x2="580" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="40" y1="80" x2="580" y2="80" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="40" y1="140" x2="580" y2="140" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="40" y1="200" x2="580" y2="200" stroke="#e2e8f0" strokeWidth="1.5" />
                        <line x1="40" y1="20" x2="40" y2="200" stroke="#e2e8f0" strokeWidth="1.5" />

                        <text x="30" y="25" textAnchor="end" className="text-[10px] font-bold text-slate-400">3.0</text>
                        <text x="30" y="85" textAnchor="end" className="text-[10px] font-bold text-slate-400">2.0</text>
                        <text x="30" y="145" textAnchor="end" className="text-[10px] font-bold text-slate-400">1.0</text>
                        <text x="30" y="205" textAnchor="end" className="text-[10px] font-bold text-slate-400">0.0</text>

                        {activePOAttainments.map((po, idx) => {
                          const n = activePOAttainments.length;
                          const itemWidth = 540 / n;
                          const itemX = 40 + idx * itemWidth + itemWidth / 2;
                          
                          const targetValue = Number(po.target_level) || 2.00;
                          const actualValue = po.level;
                          
                          const targetHeight = (targetValue / 3.0) * 180;
                          const actualHeight = (actualValue / 3.0) * 180;
                          
                          const barWidth = Math.min(16, itemWidth / 3);

                          return (
                            <g key={po.id}>
                              <rect
                                x={itemX - barWidth - 2}
                                y={200 - targetHeight}
                                width={barWidth}
                                height={targetHeight}
                                fill="#cbd5e1"
                                rx="2"
                              />
                              <rect
                                x={itemX + 2}
                                y={200 - actualHeight}
                                width={barWidth}
                                height={actualHeight}
                                fill={actualValue >= 2.5 ? '#10b981' : (actualValue >= 1.5 ? '#3b82f6' : (actualValue >= 0.5 ? '#f59e0b' : '#f43f5e'))}
                                rx="2"
                              />
                              <text
                                x={itemX}
                                y="220"
                                textAnchor="middle"
                                className="text-[10px] font-extrabold text-slate-600"
                              >
                                {po.po_number}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>

                    <div className="flex justify-center gap-6 text-xs font-bold text-slate-500">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-3 bg-[#cbd5e1] rounded"></div>
                        <span>Target Level (NBA Threshold)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-3 bg-blue-500 rounded"></div>
                        <span>Actual Attainment Level (Average)</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-400 font-semibold border border-slate-100">
                    No mapped PO links detected in the subject's OBE mapping matrix.
                  </div>
                )}
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 print:border-none print:shadow-none">
                <h2 className="text-base font-extrabold text-slate-800">
                  PSO Attainment: Target vs. Actual Comparison
                </h2>

                {activePSOAttainments.length > 0 ? (
                  <div className="space-y-4">
                    <div className="w-full overflow-x-auto">
                      <svg viewBox="0 0 600 250" className="w-full min-w-[500px] h-auto">
                        <line x1="40" y1="20" x2="580" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="40" y1="80" x2="580" y2="80" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="40" y1="140" x2="580" y2="140" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="40" y1="200" x2="580" y2="200" stroke="#e2e8f0" strokeWidth="1.5" />
                        <line x1="40" y1="20" x2="40" y2="200" stroke="#e2e8f0" strokeWidth="1.5" />

                        <text x="30" y="25" textAnchor="end" className="text-[10px] font-bold text-slate-400">3.0</text>
                        <text x="30" y="85" textAnchor="end" className="text-[10px] font-bold text-slate-400">2.0</text>
                        <text x="30" y="145" textAnchor="end" className="text-[10px] font-bold text-slate-400">1.0</text>
                        <text x="30" y="205" textAnchor="end" className="text-[10px] font-bold text-slate-400">0.0</text>

                        {activePSOAttainments.map((pso, idx) => {
                          const n = activePSOAttainments.length;
                          const itemWidth = 540 / n;
                          const itemX = 40 + idx * itemWidth + itemWidth / 2;
                          
                          const targetValue = 2.00;
                          const actualValue = pso.level;
                          
                          const targetHeight = (targetValue / 3.0) * 180;
                          const actualHeight = (actualValue / 3.0) * 180;
                          
                          const barWidth = Math.min(24, itemWidth / 3);

                          return (
                            <g key={pso.id}>
                              <rect
                                x={itemX - barWidth - 2}
                                y={200 - targetHeight}
                                width={barWidth}
                                height={targetHeight}
                                fill="#cbd5e1"
                                rx="2"
                              />
                              <rect
                                x={itemX + 2}
                                y={200 - actualHeight}
                                width={barWidth}
                                height={actualHeight}
                                fill={actualValue >= 2.5 ? '#10b981' : (actualValue >= 1.5 ? '#3b82f6' : (actualValue >= 0.5 ? '#f59e0b' : '#f43f5e'))}
                                rx="2"
                              />
                              <text
                                x={itemX}
                                y="220"
                                textAnchor="middle"
                                className="text-[10px] font-extrabold text-slate-600"
                              >
                                {pso.pso_number}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>

                    <div className="flex justify-center gap-6 text-xs font-bold text-slate-500">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-3 bg-[#cbd5e1] rounded"></div>
                        <span>Target Level (Threshold)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-3 bg-blue-500 rounded"></div>
                        <span>Actual Attainment Level (Average)</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-400 font-semibold border border-slate-100">
                    No mapped PSO links detected in the subject's OBE mapping matrix.
                  </div>
                )}
              </div>
            </div>

            {/* CO-PO/PSO Matrix Heatmap */}
            <div className={`${activeTab === 'heatmap' ? 'block' : 'hidden'} print:block space-y-6 print:break-before-page`}>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 print:border-none print:shadow-none">
                <h2 className="text-base font-extrabold text-slate-800">
                  CO-PO/PSO Matrix Mapping Correlation Heatmap
                </h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider print:hidden">Color Legend: Dark Blue (3 - High), Blue (2 - Medium), Light Blue (1 - Low), Gray (0 - No Mapping)</p>

                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                        <th className="px-4 py-3 text-left w-20">CO</th>
                        {pos.map(po => (
                          <th key={po.id} className="px-2 py-3 w-12" title={po.description}>{po.po_number}</th>
                        ))}
                        {psos.map(pso => (
                          <th key={pso.id} className="px-2 py-3 w-12 bg-blue-50/20" title={pso.description}>{pso.pso_number}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {subjectCOs.map(co => (
                        <tr key={co.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-4 py-3 text-left font-extrabold text-blue-600 bg-slate-50/30">{co.co_number}</td>
                          {pos.map(po => {
                            const val = mappings.find(m => m.co_id === co.id && m.po_id === po.id)?.mapping_value || 0;
                            return (
                              <td
                                key={po.id}
                                className={`px-1 py-3 text-xs font-black transition-all ${
                                  val === 3 ? 'bg-blue-600 text-white' :
                                  val === 2 ? 'bg-blue-400 text-white' :
                                  val === 1 ? 'bg-blue-100 text-blue-800' :
                                  'bg-slate-50 text-slate-400'
                                }`}
                              >
                                {val}
                              </td>
                            );
                          })}
                          {psos.map(pso => {
                            const val = mappings.find(m => m.co_id === co.id && m.pso_id === pso.id)?.mapping_value || 0;
                            return (
                              <td
                                key={pso.id}
                                className={`px-1 py-3 text-xs font-black transition-all ${
                                  val === 3 ? 'bg-indigo-600 text-white' :
                                  val === 2 ? 'bg-indigo-400 text-white' :
                                  val === 1 ? 'bg-indigo-100 text-indigo-800' :
                                  'bg-slate-50 text-slate-400'
                                }`}
                              >
                                {val}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : (
        <div className="bg-white p-12 text-center text-slate-400 font-semibold rounded-2xl border border-slate-200 shadow-sm print:border-none print:shadow-none">
          No historical calculations recorded yet. Go to Marks Entry, grade student assessments, and click Compute Attainment to log details.
        </div>
      )}
    </div>
  );
}
