// ─────────────────────────────────────────────────────────────────────────────
// Phase 13 — Program OBE Analytics & Reporting routes.
//
// These endpoints expose the program-level OBE pipeline (CO/PO/PSO attainment,
// course contributions, validation, weak outcomes, improvement plans, reports and
// exports). They are thin HTTP wrappers over obeModel + obeAssessmentService — the
// backend remains the single authoritative source of the attainment calculations.
//
// RBAC: reads require any authenticated user (matching the existing program-outcomes
// read behavior). Writes (action plans, outcome versions) require academic-write
// roles via authorizeAcademicWrite('program') — a Teacher can never modify program
// outcomes or versions.
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const protect = require('../middlewares/authMiddleware');
const { authorizeAcademicWrite } = require('../middlewares/scopeMiddleware');
const {
  getProgramDashboard, getCourseCOStudentDrilldown,
  getActionPlans, createActionPlan, updateActionPlan, deleteActionPlan,
  listOutcomeVersions, createOutcomeVersion, getProgramContext,
} = require('../models/obeModel');

// batchId and sessionId both describe the academic session ("batch") for this system.
const resolveFilters = (query) => ({
  sessionId: query.sessionId || query.batchId || null,
  semester: query.semester && query.semester !== 'all' ? query.semester : null,
  batchId: query.batchId || null,
  versionLabel: query.versionLabel || null,
});
const requireProgram = async (programId, res, next) => {
  try {
    const program = await getProgramContext(programId);
    if (!program) { res.status(404).json({ success: false, message: 'Program not found.' }); return null; }
    return program;
  } catch (err) { next(err); return null; }
};

// GET /api/programs/:id/obe/dashboard?sessionId=&semester=&batchId=
router.get('/programs/:id/obe/dashboard', protect, async (req, res, next) => {
  try {
    const program = await requireProgram(req.params.id, res, next);
    if (!program) return;
    const data = await getProgramDashboard(req.params.id, resolveFilters(req.query));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/programs/:id/obe/co-attainment — CO section of the dashboard
router.get('/programs/:id/obe/co-attainment', protect, async (req, res, next) => {
  try {
    const program = await requireProgram(req.params.id, res, next);
    if (!program) return;
    const data = await getProgramDashboard(req.params.id, resolveFilters(req.query));
    res.json({
      success: true,
      data: {
        program: data.program, outcomeVersion: data.outcomeVersion, filters: data.filters,
        coAttainment: data.coAttainment, weakOutcomes: data.weakOutcomes?.CO || [],
        achievementSummary: data.achievementSummary?.CO,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/programs/:id/obe/po-attainment
router.get('/programs/:id/obe/po-attainment', protect, async (req, res, next) => {
  try {
    const program = await requireProgram(req.params.id, res, next);
    if (!program) return;
    const data = await getProgramDashboard(req.params.id, resolveFilters(req.query));
    res.json({
      success: true,
      data: {
        program: data.program, outcomeVersion: data.outcomeVersion,
        poAttainment: data.poAttainment, weakOutcomes: data.weakOutcomes?.PO,
        achievementSummary: data.achievementSummary?.PO,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/programs/:id/obe/pso-attainment
router.get('/programs/:id/obe/pso-attainment', protect, async (req, res, next) => {
  try {
    const program = await requireProgram(req.params.id, res, next);
    if (!program) return;
    const data = await getProgramDashboard(req.params.id, resolveFilters(req.query));
    res.json({
      success: true,
      data: {
        program: data.program, outcomeVersion: data.outcomeVersion,
        psoAttainment: data.psoAttainment, weakOutcomes: data.weakOutcomes?.PSO,
        achievementSummary: data.achievementSummary?.PSO,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/programs/:id/obe/course-contributions?po=PO3  (or ?pso=PSO1)
router.get('/programs/:id/obe/course-contributions', protect, async (req, res, next) => {
  try {
    const program = await requireProgram(req.params.id, res, next);
    if (!program) return;
    const data = await getProgramDashboard(req.params.id, resolveFilters(req.query));
    const code = req.query.po || req.query.pso || req.query.outcome;
    if (!code) return res.status(400).json({ success: false, message: 'Specify ?po=PO3 (or ?pso=PSO1).' });
    const isPso = /^pso/i.test(code);
    const nodes = isPso ? data.psoAttainment : data.poAttainment;
    const node = nodes.find((n) => n.code === code.toUpperCase());
    if (!node) return res.status(404).json({ success: false, message: `${code} is not configured for this program.` });
    res.json({ success: true, data: { outcome: node, courses: node.contributions, program: data.program, filters: data.filters } });
  } catch (err) { next(err); }
});

// GET /api/programs/:id/obe/validation
router.get('/programs/:id/obe/validation', protect, async (req, res, next) => {
  try {
    const program = await requireProgram(req.params.id, res, next);
    if (!program) return;
    const data = await getProgramDashboard(req.params.id, resolveFilters(req.query));
    res.json({ success: true, data: { program: data.program, filters: data.filters, validation: data.validation, outcomeVersion: data.outcomeVersion } });
  } catch (err) { next(err); }
});

// ── Improvement / action plans ───────────────────────────────────────────────
router.get('/programs/:id/obe/action-plans', protect, async (req, res, next) => {
  try {
    const rows = await getActionPlans(req.params.id, resolveFilters(req.query));
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/programs/:id/obe/action-plans', protect, authorizeAcademicWrite('program'), async (req, res, next) => {
  try {
    if (!req.body.outcomeCode) return res.status(400).json({ success: false, message: 'outcomeCode is required (e.g. PO3).' });
    const row = await createActionPlan(req.params.id, req.body, req.user.id);
    res.status(201).json({ success: true, message: 'Improvement plan recorded.', data: row });
  } catch (err) { next(err); }
});

router.put('/programs/:id/obe/action-plans/:planId', protect, authorizeAcademicWrite('program'), async (req, res, next) => {
  try {
    const updated = await updateActionPlan(req.params.id, req.params.planId, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Plan not found.' });
    res.json({ success: true, message: 'Improvement plan updated.' });
  } catch (err) { next(err); }
});

router.delete('/programs/:id/obe/action-plans/:planId', protect, authorizeAcademicWrite('program'), async (req, res, next) => {
  try {
    const removed = await deleteActionPlan(req.params.id, req.params.planId);
    if (!removed) return res.status(404).json({ success: false, message: 'Plan not found.' });
    res.json({ success: true, message: 'Improvement plan removed.' });
  } catch (err) { next(err); }
});

// ── Outcome versions ─────────────────────────────────────────────────────────
router.get('/programs/:id/obe/outcome-versions', protect, async (req, res, next) => {
  try {
    const rows = await listOutcomeVersions(req.params.id);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/programs/:id/obe/outcome-versions', protect, authorizeAcademicWrite('program'), async (req, res, next) => {
  try {
    const row = await createOutcomeVersion(req.params.id, req.body);
    res.status(201).json({ success: true, message: `Outcome version "${row.label}" created.`, data: row });
  } catch (err) { next(err); }
});
router.get('/programs/:id/obe/course/:courseId/co/:coNumber/students', protect, async (req, res, next) => {
  try {
    const data = await getCourseCOStudentDrilldown(req.params.courseId, req.params.coNumber);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});
// ── Report export ────────────────────────────────────────────────────────────
// GET /api/programs/:id/obe/report?format=json|excel|csv|pdf
// json -> structured payload; excel/csv -> downloadable file; pdf -> printable HTML
// (browser "Save as PDF" produces the PDF artifact — no server-side PDF library).
router.get('/programs/:id/obe/report', protect, async (req, res, next) => {
  try {
    const program = await requireProgram(req.params.id, res, next);
    if (!program) return;
    const filters = resolveFilters(req.query);
    const data = await getProgramDashboard(req.params.id, filters);
    const format = (req.query.format || 'json').toLowerCase();

    if (format === 'json') return res.json({ success: true, data });

    if (format === 'excel') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('OBE Report');
      ws.addRow([`OBE ATTAINMENT REPORT — ${data.program.name || ''}`]);
      ws.addRow(['Program Code', data.program.code || '']);
      ws.addRow(['Degree', data.program.degree || '']);
      ws.addRow(['Outcome Version', data.outcomeVersion?.label || 'N/A']);
      ws.addRow(['Semester', filters.semester || 'All']);
      ws.addRow([]);
      writeExcellReportSheet(ws, data);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="OBE_Report_${(data.program.code || 'program').replace(/[^A-Za-z0-9_-]/g, '_')}_${timestamp}.xlsx"`);
      await wb.xlsx.write(res);
      return res.end();
    }

    if (format === 'csv') {
      const lines = [];
      const push = (vals) => lines.push(vals.map((v) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','));
      push(['OBE ATTAINMENT REPORT', data.program.name || '']);
      push(['Program Code', data.program.code || '']);
      push(['Degree', data.program.degree || '']);
      push(['Outcome Version', data.outcomeVersion?.label || 'N/A']);
      push(['Semester', filters.semester || 'All']);
      push([]);
      (data.poAttainment || []).forEach((p) => push(['PO', p.code, p.attainment, p.target, p.status]));
      (data.psoAttainment || []).forEach((p) => push(['PSO', p.code, p.attainment, p.target, p.status]));
      push([]);
      push(['Course', 'CO', 'Attainment %', 'Target %', 'Status']);
      (data.coAttainment || []).forEach((c) =>
        (c.cos || []).forEach((co) => push([c.courseCode, co.code, co.actualPercent, co.targetPercent, co.status])));
      const csv = '\uFEFF' + lines.join('\r\n');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="OBE_Report_${(data.program.code || 'program').replace(/[^A-Za-z0-9_-]/g, '_')}_${timestamp}.csv"`);
      return res.send(csv);
    }

    if (format === 'html' || format === 'pdf') {
      const html = buildPrintableReportHtml(data);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `inline; filename="OBE_Report_${(data.program.code || 'program').replace(/[^A-Za-z0-9_-]/g, '_')}_${timestamp}.html"`);
      return res.send(html);
    }

    return res.status(400).json({ success: false, message: 'Unknown report format. Use json, excel, csv, html or pdf.' });
  } catch (err) { next(err); }
});
// Section-by-section worksheet writer for the Excel export.
const writeExcellReportSheet = (ws, d) => {
  const outcomeNodes = (items, kind) => {
    ws.addRow([`${kind} Attainment`]);
    ws.addRow(['Code', 'Title', 'Description', 'Attainment', 'Target', 'Status']);
    (items || []).forEach((p) => ws.addRow([p.code, p.title || '', p.description || '', p.attainment, p.target, p.status]));
    ws.addRow([]);
  };
  outcomeNodes(d.poAttainment, '3. Program Outcomes (PO)');
  outcomeNodes(d.psoAttainment, '4. Program Specific Outcomes (PSO)');

  ws.addRow(['8. Course Outcome Attainment']);
  ws.addRow(['Course', 'CO', 'Attainment %', 'Target %', 'Status']);
  (d.coAttainment || []).forEach((c) => {
    (c.cos || []).forEach((co) => ws.addRow([c.courseCode, co.code, co.actualPercent, co.targetPercent, co.status]));
  });
  ws.addRow([]);
  ws.addRow(['9. Achievement Summary']);
  ws.addRow(['POs Achieved', d.achievementSummary?.PO?.achieved ?? 'n/a', 'of', d.achievementSummary?.PO?.total ?? 'n/a']);
  ws.addRow(['PSOs Achieved', d.achievementSummary?.PSO?.achieved ?? 'n/a', 'of', d.achievementSummary?.PSO?.total ?? 'n/a']);
  ws.addRow(['COs Achieved', d.achievementSummary?.CO?.achieved ?? 'n/a', 'of', d.achievementSummary?.CO?.total ?? 'n/a']);
};
// Printable (PDF-friendly) HTML report — the app's PDF export path.
const buildPrintableReportHtml = (d) => {
  const esc = (v) => String(v ?? '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
  const poRows = (d.poAttainment || []).map((p) => `<tr><td>${esc(p.code)}</td><td>${esc(p.title || '')}</td><td>${esc(p.attainment)}</td><td>${esc(p.target)}</td><td>${esc(p.status)}</td></tr>`).join('');
  const psoRows = (d.psoAttainment || []).map((p) => `<tr><td>${esc(p.code)}</td><td>${esc(p.title || '')}</td><td>${esc(p.attainment)}</td><td>${esc(p.target)}</td><td>${esc(p.status)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>OBE Report</title>
  <style>body{font-family:Georgia,serif;color:#222;padding:20px}table{border-collapse:collapse;width:100%;margin-bottom:24px}td,th{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#eef} h1{font-size:20px} h2{font-size:14px;margin-top:28px}</style></head><body>
  <h1>OBE ATTAINMENT REPORT</h1>
  <p><b>Program:</b> ${esc(d.program?.name)} &nbsp; <b>Code:</b> ${esc(d.program?.code)} &nbsp;
  <b>Degree:</b> ${esc(d.program?.degree)} &nbsp; <b>Outcome Version:</b> ${esc(d.outcomeVersion?.label)}</p>
  <p><b>Filters:</b> Semester: ${esc(d.filters?.semester || 'All')} &nbsp; Session/Batch: ${esc(d.filters?.sessionId || 'All')}</p>
  <h2>Program Outcomes</h2>
  <table><tr><th>Code</th><th>Title</th><th>Attainment</th><th>Target</th><th>Status</th></tr>${poRows || '<tr><td colspan="5">No data</td></tr>'}</table>
  <h2>Program Specific Outcomes</h2>
  <table><tr><th>Code</th><th>Title</th><th>Attainment</th><th>Target</th><th>Status</th></tr>${psoRows || '<tr><td colspan="5">No data</td></tr>'}</table>
  </body></html>`;
};

module.exports = router;