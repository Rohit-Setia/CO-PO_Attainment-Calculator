/**
 * chartGenerator.js — pure Node.js SVG chart builder for Excel embedding.
 *
 * ExcelJS can embed images from a Buffer. We generate SVG markup strings,
 * then return them as UTF-8 Buffers. No canvas or native modules required.
 */

const XML_ESC = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildBarChartSvg({ title='', labels=[], values=[], targets=[], maxValue=3,
  barColor='#4472C4', targetColor='#FF0000', highlightAbove=true, width=700, height=350 }) {
  if (labels.length === 0) return null;
  const marginLeft=55, marginRight=20, marginTop=50, marginBottom=80;
  const chartW = width - marginLeft - marginRight;
  const chartH = height - marginTop - marginBottom;
  const n = labels.length;
  const groupW = chartW / n;
  const barW = Math.max(12, Math.min(40, groupW * 0.55));
  const yScale = (v) => chartH - (Math.min(v, maxValue) / maxValue) * chartH;
  const ySteps = maxValue <= 3 ? [0,1,2,3] : [0, Math.round(maxValue*0.25), Math.round(maxValue*0.5), Math.round(maxValue*0.75), maxValue];
  const gridLines = ySteps.map((step) => {
    const y = marginTop + yScale(step);
    return `<line x1="${marginLeft}" y1="${y}" x2="${marginLeft+chartW}" y2="${y}" stroke="#E0E0E0" stroke-width="1" stroke-dasharray="4,3"/>
      <text x="${marginLeft-6}" y="${y+4}" text-anchor="end" font-size="10" fill="#666">${step}</text>`;
  }).join('');
  const bars = labels.map((label, i) => {
    const x = marginLeft + i * groupW + (groupW - barW) / 2;
    const val = typeof values[i]==='number' ? values[i] : 0;
    const target = targets.length > 0 ? (typeof targets[i]==='number' ? targets[i] : targets[0]) : maxValue*0.6;
    const isAbove = val >= target;
    const color = highlightAbove ? (isAbove ? '#70AD47' : barColor) : barColor;
    const barH = Math.max(2, (val/maxValue)*chartH);
    const barY = marginTop + yScale(val);
    const targetY = marginTop + yScale(target);
    const markerLine = targets.length > 0
      ? `<line x1="${x-3}" y1="${targetY}" x2="${x+barW+3}" y2="${targetY}" stroke="${targetColor}" stroke-width="2" stroke-dasharray="4,2"/>`
      : '';
    const valLabel = val > 0
      ? `<text x="${x+barW/2}" y="${barY-4}" text-anchor="middle" font-size="9" font-weight="bold" fill="${color}">${typeof val.toFixed==='function' ? val.toFixed(2) : val}</text>`
      : '';
    const labelX = x + barW/2;
    const labelY = marginTop + chartH + 16;
    const rotate = n > 8 ? `rotate(-35, ${labelX}, ${labelY})` : '';
    const anchor = n > 8 ? 'end' : 'middle';
    return `<rect x="${x}" y="${barY}" width="${barW}" height="${barH}" fill="${color}" rx="3"/>
      ${markerLine}${valLabel}
      <text x="${labelX}" y="${labelY}" text-anchor="${anchor}" font-size="9" fill="#444" transform="${rotate}">${XML_ESC(label)}</text>`;
  }).join('');
  const legend = targets.length > 0 ? `
    <rect x="${marginLeft}" y="${height-22}" width="12" height="12" fill="${barColor}" rx="2"/>
    <text x="${marginLeft+16}" y="${height-13}" font-size="10" fill="#444">Attainment</text>
    <line x1="${marginLeft+90}" y1="${height-16}" x2="${marginLeft+108}" y2="${height-16}" stroke="${targetColor}" stroke-width="2" stroke-dasharray="4,2"/>
    <text x="${marginLeft+112}" y="${height-13}" font-size="10" fill="#444">Target</text>
    <rect x="${marginLeft+160}" y="${height-22}" width="12" height="12" fill="#70AD47" rx="2"/>
    <text x="${marginLeft+176}" y="${height-13}" font-size="10" fill="#444">Achieved</text>` : '';
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="white"/>
  <text x="${width/2}" y="22" text-anchor="middle" font-size="13" font-weight="bold" fill="#333" font-family="Calibri,Arial,sans-serif">${XML_ESC(title)}</text>
  <line x1="${marginLeft}" y1="${marginTop}" x2="${marginLeft}" y2="${marginTop+chartH}" stroke="#999" stroke-width="1"/>
  <line x1="${marginLeft}" y1="${marginTop+chartH}" x2="${marginLeft+chartW}" y2="${marginTop+chartH}" stroke="#999" stroke-width="1"/>
  <text x="14" y="${marginTop+chartH/2}" text-anchor="middle" font-size="11" fill="#555" font-family="Calibri,Arial,sans-serif" transform="rotate(-90,14,${marginTop+chartH/2})">Attainment Level</text>
  ${gridLines}${bars}${legend}
</svg>`, 'utf-8');
}

function buildAttainmentChartBuffers({ courseOutcomes, mttStudents, ettStudents, config, coPoValues }) {
  if (!courseOutcomes || courseOutcomes.length === 0) return { coChartBuffer: null, poChartBuffer: null };
  const thresholdI = config.threshold_percent_internal;
  const thresholdE = config.threshold_percent_external;
  const lcInt = { l1: config.level1_criteria_internal, l2: config.level2_criteria_internal, l3: config.level3_criteria_internal };
  const lcExt = { l1: config.level1_criteria_external, l2: config.level2_criteria_external, l3: config.level3_criteria_external };
  const levelOf = (pct, lc) => pct >= lc.l3 ? 3 : pct >= lc.l2 ? 2 : pct >= lc.l1 ? 1 : 0;

  const coLabels = courseOutcomes.map((co) => `CO${co.co_number}`);
  const coValues = courseOutcomes.map((co) => {
    const lInt = mttStudents.length === 0 ? 0 : levelOf(
      (mttStudents.filter((s) => (parseFloat(s.coMarks?.[co.id]) || 0) >= (thresholdI/100)*co.max_internal).length / mttStudents.length) * 100, lcInt);
    const lExt = ettStudents.length === 0 ? 0 : levelOf(
      (ettStudents.filter((s) => (parseFloat(s.coMarks?.[co.id]) || 0) >= (thresholdE/100)*co.max_external).length / ettStudents.length) * 100, lcExt);
    return parseFloat((lInt*(config.internal_weight/100) + lExt*(config.external_weight/100)).toFixed(2));
  });

  const coChartBuffer = buildBarChartSvg({
    title: 'Course Outcome (CO) Direct Attainment Levels',
    labels: coLabels, values: coValues, targets: coValues.map(() => 2),
    maxValue: 3, barColor: '#4472C4', width: Math.max(500, coLabels.length*70+100), height: 300,
  });

  const poPsoKeys = [...Array.from({length:12},(_,i)=>`po${i+1}`),'pso1','pso2','pso3'];
  const poPsoLabels = [...Array.from({length:12},(_,i)=>`PO${i+1}`),'PSO1','PSO2','PSO3'];
  const overallCoAvg = coValues.length > 0 ? coValues.reduce((a,b)=>a+b,0)/coValues.length : 0;
  const defined = poPsoKeys.map((key, i) => {
    const nonZero = (coPoValues||[]).map((v)=>v[key]||0).filter((v)=>v>0);
    const art = nonZero.length > 0 ? nonZero.reduce((a,b)=>a+b,0)/nonZero.length : 0;
    return { label: poPsoLabels[i], value: parseFloat((art*overallCoAvg).toFixed(2)) };
  }).filter((x)=>x.value>0);

  const poChartBuffer = defined.length === 0 ? null : buildBarChartSvg({
    title: 'PO / PSO Attainment Levels',
    labels: defined.map((d)=>d.label), values: defined.map((d)=>d.value), targets: defined.map(()=>2),
    maxValue: 3, barColor: '#ED7D31', width: Math.min(800, Math.max(500, defined.length*55+100)), height: 300,
  });

  return { coChartBuffer, poChartBuffer };
}

module.exports = { buildBarChartSvg, buildAttainmentChartBuffers };
