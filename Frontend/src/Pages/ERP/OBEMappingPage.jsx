import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  fetchSubjects, 
  fetchPOs, 
  fetchPSOs, 
  fetchCOs, 
  saveCOs, 
  fetchCOPOMappings, 
  saveCOPOMappings 
} from '../../Api/erpApi';
import { Layers, HelpCircle, Save } from 'lucide-react';

export default function OBEMappingPage() {
  const [searchParams] = useSearchParams();
  const subjectQueryParam = searchParams.get('subject_id');

  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  
  const [cos, setCos] = useState([]);
  const [pos, setPOs] = useState([]);
  const [psos, setPSOs] = useState([]);
  const [mappings, setMappings] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadInitialData = async () => {
    try {
      const subRes = await fetchSubjects();
      setSubjects(subRes.data.data);
      if (subjectQueryParam) {
        setSelectedSubjectId(subjectQueryParam);
      } else if (subRes.data.data.length > 0) {
        setSelectedSubjectId(subRes.data.data[0].id);
      }
      
      const poRes = await fetchPOs();
      setPOs(poRes.data.data);
      
      const psoRes = await fetchPSOs();
      setPSOs(psoRes.data.data);
    } catch (err) {
      setError('Failed to fetch initial academic mapping assets');
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadSubjectOBE = async () => {
    if (!selectedSubjectId) return;
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      
      const cosRes = await fetchCOs(selectedSubjectId);
      setCos(cosRes.data.data);

      const mapRes = await fetchCOPOMappings(selectedSubjectId);
      setMappings(mapRes.data.data);
    } catch (err) {
      setError('Failed to load outcomes mappings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubjectOBE();
  }, [selectedSubjectId]);

  const handleCODescriptionChange = (index, value) => {
    setCos(prev => {
      const updated = [...prev];
      updated[index].description = value;
      return updated;
    });
  };

  const handleCOBloomChange = (index, value) => {
    setCos(prev => {
      const updated = [...prev];
      updated[index].bloom_level = value;
      return updated;
    });
  };

  const handleCOTargetChange = (index, value) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
    setCos(prev => {
      const updated = [...prev];
      updated[index].target_percentage = value;
      return updated;
    });
  };

  const getMappingValue = (coId, poId, psoId) => {
    const match = mappings.find(m => 
      m.co_id === coId && 
      (poId ? m.po_id === poId : m.pso_id === psoId)
    );
    return match ? match.mapping_value : '0';
  };

  const handleMappingChange = (coId, poId, psoId, value) => {
    setMappings(prev => {
      // Remove existing mapping
      const filtered = prev.filter(m => 
        !(m.co_id === coId && (poId ? m.po_id === poId : m.pso_id === psoId))
      );
      if (value === '' || value === '0') return filtered;

      return [
        ...filtered,
        {
          co_id: coId,
          po_id: poId || null,
          pso_id: psoId || null,
          mapping_value: parseInt(value)
        }
      ];
    });
  };

  const handleSaveAll = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      // Validation check: Every CO must map to at least one PO or PSO
      for (const co of cos) {
        const hasMapping = mappings.some(
          m => m.co_id === co.id && (m.po_id || m.pso_id) && m.mapping_value > 0
        );
        if (!hasMapping) {
          setError(`Validation Error: Every Course Outcome (${co.co_number}) must map to at least one PO or PSO.`);
          setLoading(false);
          return;
        }
      }

      // Save COs descriptions/blooms
      await saveCOs({
        subject_id: selectedSubjectId,
        cos
      });

      // Save CO-PO matrix
      await saveCOPOMappings({
        subject_id: selectedSubjectId,
        mappings
      });

      setSuccess('Outcomes & CO-PO/PSO Matrix Mappings saved successfully!');
      loadSubjectOBE();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save mappings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">OBE Mapping Matrix</h1>
          <p className="text-slate-500 text-sm">Define Course Outcomes (COs) and map them to Program Outcomes (POs/PSOs).</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            className="border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-blue-500 font-bold text-slate-800"
          >
            <option value="">Select Subject</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </select>
          <button
            onClick={handleSaveAll}
            disabled={loading || !selectedSubjectId}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 transition-all"
          >
            <Save className="h-4 w-4" />
            <span>Save OBE Mappings</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-semibold border border-red-200 animate-fade-in">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 text-emerald-600 px-4 py-3 rounded-xl text-sm font-semibold border border-emerald-200 animate-fade-in">
          {success}
        </div>
      )}

      {loading ? (
        <div className="h-48 flex items-center justify-center text-slate-500 font-medium">Loading outcome maps...</div>
      ) : selectedSubjectId ? (
        <div className="space-y-6">
          {/* CO Descriptions */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-500" />
              <span>1. Course Outcomes (COs) Configuration</span>
            </h2>
            <div className="space-y-4">
              {cos.map((co, index) => (
                <div key={co.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="md:col-span-1 text-sm font-extrabold text-blue-600">{co.co_number}</div>
                  <div className="md:col-span-6">
                    <input
                      type="text"
                      value={co.description}
                      onChange={(e) => handleCODescriptionChange(index, e.target.value)}
                      className="w-full bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <select
                      value={co.bloom_level}
                      onChange={(e) => handleCOBloomChange(index, e.target.value)}
                      className="w-full bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-sm font-semibold"
                    >
                      <option value="Remembering">L1 - Remembering</option>
                      <option value="Understanding">L2 - Understanding</option>
                      <option value="Applying">L3 - Applying</option>
                      <option value="Analyzing">L4 - Analyzing</option>
                      <option value="Evaluating">L5 - Evaluating</option>
                      <option value="Creating">L6 - Creating</option>
                    </select>
                  </div>
                   <div className="md:col-span-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={co.target_percentage}
                      onChange={(e) => handleCOTargetChange(index, e.target.value)}
                      onBlur={() => {
                        const val = co.target_percentage;
                        let numericVal = parseFloat(val);
                        if (isNaN(numericVal) || val === '') {
                          numericVal = 40.00;
                        }
                        setCos(prev => {
                          const updated = [...prev];
                          updated[index].target_percentage = numericVal.toFixed(2);
                          return updated;
                        });
                      }}
                      className="w-20 bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-sm text-center font-bold text-slate-800"
                    />
                    <span className="text-sm font-semibold text-slate-500">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mapping Matrix */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-500" />
              <span>2. CO - PO / PSO Correlation Matrix</span>
            </h2>
            <p className="text-xs text-slate-400 font-medium">Select mapping values: 1 (Low correlation), 2 (Medium correlation), 3 (High correlation), or leave blank for no correlation.</p>
            
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Course Outcome</th>
                    {pos.map(po => (
                      <th key={po.id} className="px-2 py-3" title={po.description}>{po.po_number}</th>
                    ))}
                    {psos.map(pso => (
                      <th key={pso.id} className="px-2 py-3" title={pso.description}>{pso.pso_number}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cos.map(co => (
                    <tr key={co.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3 text-left font-extrabold text-blue-600 bg-slate-50/30">{co.co_number}</td>
                      {pos.map(po => (
                        <td key={po.id} className="px-1 py-2">
                          <select
                            value={getMappingValue(co.id, po.id, null)}
                            onChange={(e) => handleMappingChange(co.id, po.id, null, e.target.value)}
                            className="bg-white border border-slate-200 rounded px-1 py-1 text-xs font-extrabold text-slate-700 focus:outline-none focus:border-blue-500 w-12 text-center"
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                          </select>
                        </td>
                      ))}
                      {psos.map(pso => (
                        <td key={pso.id} className="px-1 py-2 bg-blue-50/10">
                          <select
                            value={getMappingValue(co.id, null, pso.id)}
                            onChange={(e) => handleMappingChange(co.id, null, pso.id, e.target.value)}
                            className="bg-white border border-slate-200 rounded px-1 py-1 text-xs font-extrabold text-slate-700 focus:outline-none focus:border-blue-500 w-12 text-center"
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                          </select>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-2xl text-center text-slate-400 font-semibold border border-slate-200 shadow-sm">
          Please select a subject from the top dropdown to configure outcome mapping matrices.
        </div>
      )}
    </div>
  );
}
