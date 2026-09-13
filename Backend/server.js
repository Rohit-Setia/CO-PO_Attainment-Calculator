require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const excelRouter = require('./routes/excelExport');
const authRouter = require('./routes/authRoutes');
const courseRouter = require('./routes/courseRoutes');
const dashboardRouter = require('./routes/dashboardRoutes');
const academicRouter = require('./routes/academicRoutes');
const studentRouter = require('./routes/studentRoutes');
const obeRouter = require('./routes/obeRoutes');
const teacherRouter = require('./routes/teacherRoutes');
const examinationRouter = require('./routes/examinationRoutes');
const errorHandler = require('./middlewares/errorMiddleware');

const { createUsersTable, addRoleScopingColumns } = require('./models/userModel');
const pool = require('./config/db');
const { createCoursesTable, createUserCourseAssignmentsTable, addCourseStatusColumn } = require('./models/courseModel');
const { createMappingTables, createCoPoValueTable, migrateLegacyMappingToCoPoValues } = require('./models/mappingModel');
const {
  createMarksTable, createStudentCoMarksTable, createStudentQuestionMarksTable, migrateLegacyStudentMarks,
  addStudentIdToMarks,
} = require('./models/marksModel');
const { createCourseOutcomeTables, migrateLegacyCoursesToOutcomes } = require('./models/courseOutcomeModel');
const { createQuestionConfigTable, migrateLegacyQuestionConfigs } = require('./models/questionConfigModel');
const {
  createUniversityTables, migrateLegacyUniversityData, normalizeLegacyStudentsTable, normalizeProgramsTable,
  normalizeLegacyStudentSchemaForMaster, addProgramDegreeColumn, addPhase7DuplicatePreventionConstraints,
  addStudentContextUniqueness,
} = require('./models/universityModel');
const { createProgramOutcomesTable, seedDefaultProgramOutcomes } = require('./models/programOutcomeModel');
const { ensureOBESchema } = require('./models/obeModel');
const { createStudentTables, migrateLegacyStudentData } = require('./models/studentModel');
const { createAdminAuditTable } = require('./models/adminAuditModel');
const { runPendingMigrations } = require('./utils/migrationRunner');
const { ensureIndex } = require('./models/platformMigrations');
require('./models/examWorkflowMigrations');
require('./models/examAllocationMigrations');

const app = express();
let httpServer;
let shutdownStarted = false;

app.use(
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (!isProduction && (/^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin))) {
        return callback(null, true);
      }
      return callback(Object.assign(new Error('Not allowed by CORS'), { status: 403 }));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);
// 5mb JSON limit — the Excel import flow posts client-parsed mark grids as JSON, and a large
// workbook (e.g. 2000+ students × 30 CO columns) comfortably exceeds Express's 100kb default.
app.use(express.json({ limit: '5mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// Phase 8 — health check: reports service health WITHOUT exposing database credentials,
// schema details, or any internal configuration. A DB failure surfaces as status "degraded".
app.get('/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    if (!rows || rows[0].ok !== 1) throw new Error('db check failed');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', detail: 'database unavailable' });
  }
});

app.get('/api/health/db', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    if (!rows || rows[0]?.ok !== 1) throw new Error('db check failed');
    res.json({ success: true, database: 'connected' });
  } catch (err) {
    console.error('[health] database check failed:', err.message);
    res.status(503).json({ success: false, database: 'disconnected' });
  }
});

app.use('/api', excelRouter);
app.use('/api', authRouter);
app.use('/api', courseRouter);
app.use('/api', dashboardRouter);
app.use('/api', academicRouter);
app.use('/api', studentRouter);
app.use('/api', obeRouter);
app.use('/api/admin', teacherRouter);
app.use('/api', examinationRouter);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Phase 8 — production guards. Never log the actual secret value, only its presence/length.
if (isProduction) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    // Fail-fast in production: a predictable/weak signing secret is a critical
    // security hole, not a warning. Set a strong, random JWT_SECRET before deploying.
    console.error('[SECURITY] JWT_SECRET is missing or shorter than 32 characters. Set a strong, random secret in production. Refusing to start.');
    process.exit(1);
  }
  if (!process.env.CLIENT_URL) {
    console.warn('[SECURITY] CLIENT_URL is not set in production. Only same-origin requests will be accepted.');
  }
}

// Sequential initialization of tables, then a one-time additive migration into the normalized
// dynamic-CO schema (course_outcomes, co_po_values, question_configs, student_co_marks,
// student_question_marks). Every migration step is idempotent (skips courses/rows already
// migrated) and never modifies or drops the legacy tables/columns it reads from.
createUsersTable()
  .then(() => createUniversityTables())
  .then(() => addRoleScopingColumns())
  .then(() => addPhase7DuplicatePreventionConstraints())
  .then(() => createProgramOutcomesTable())
  .then(() => seedDefaultProgramOutcomes())
  .then(() => createCoursesTable())
  .then(() => addCourseStatusColumn())
  .then(() => createStudentTables())
  .then(() => addStudentContextUniqueness())
  .then(() => migrateLegacyUniversityData())
  .then(() => normalizeLegacyStudentsTable())
  .then(() => normalizeProgramsTable())
  .then(() => addProgramDegreeColumn())
  .then(() => normalizeLegacyStudentSchemaForMaster())
  .then(() => createUserCourseAssignmentsTable())
  .then(() => createMappingTables())
  .then(() => createMarksTable())
  .then(() => addStudentIdToMarks())
  .then(() => migrateLegacyStudentData())
  .then(() => createCourseOutcomeTables())
  .then(() => migrateLegacyCoursesToOutcomes())
  .then(() => createCoPoValueTable())
  .then(() => migrateLegacyMappingToCoPoValues())
  .then(() => createQuestionConfigTable())
  .then(() => migrateLegacyQuestionConfigs())
  .then(() => createStudentCoMarksTable())
  .then(() => createStudentQuestionMarksTable())
  .then(() => migrateLegacyStudentMarks())
  .then(() => createAdminAuditTable())
  .then(() => ensureOBESchema())
  // Phase 0 — versioned migrations (only pending ones run, recorded in schema_migrations).
  .then(() => runPendingMigrations())
  .then(() => {
    httpServer = app.listen(PORT, () => console.log('Server running on', PORT));
  })
  .catch((error) => {
    // Log full error (stack and object) to help diagnose DB init failures
    console.error('Failed to initialize database tables:');
    console.error(error && error.stack ? error.stack : error);
    // If this error was augmented with an original driver error, log it too
    if (error && error.original) {
      console.error('Original error:');
      console.error(error.original && error.original.stack ? error.original.stack : error.original);
    }
    pool.end().catch((closeError) => console.error('[shutdown] failed to close database pool:', closeError.message));
    process.exit(1);
  });

const shutdown = (signal) => {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`[shutdown] ${signal} received; closing HTTP server and database pool.`);

  const closeHttpServer = httpServer
    ? new Promise((resolve) => httpServer.close(resolve))
    : Promise.resolve();

  closeHttpServer
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[shutdown] graceful shutdown failed:', error.message);
      process.exit(1);
    });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
