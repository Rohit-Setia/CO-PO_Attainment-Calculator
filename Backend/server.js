require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const excelRouter = require('./routes/excelExport');
const authRouter = require('./routes/authRoutes');
const courseRouter = require('./routes/courseRoutes');
const errorHandler = require('./middlewares/errorMiddleware');

const { createUsersTable } = require('./models/userModel');
const { createCoursesTable, createUserCourseAssignmentsTable } = require('./models/courseModel');
const { createMappingTables, createCoPoValueTable, migrateLegacyMappingToCoPoValues } = require('./models/mappingModel');
const {
  createMarksTable, createStudentCoMarksTable, createStudentQuestionMarksTable, migrateLegacyStudentMarks,
} = require('./models/marksModel');
const { createCourseOutcomeTables, migrateLegacyCoursesToOutcomes } = require('./models/courseOutcomeModel');
const { createQuestionConfigTable, migrateLegacyQuestionConfigs } = require('./models/questionConfigModel');

const app = express();

// API-only server, no HTML views — CSP default-src 'none' is safe and disables the
// noisy cross-origin-resource-policy default that otherwise blocks the Excel file download.
app.use(
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// Support one or more comma-separated origins via CLIENT_URL (e.g. for staging + prod).
// Unlike a bare `origin: true`/wildcard, unlisted origins are rejected outright.
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser tools (curl/Postman send no Origin header) and any listed origin.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(Object.assign(new Error('Not allowed by CORS'), { status: 403 }));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', excelRouter);
app.use('/api', authRouter);
app.use('/api', courseRouter);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Sequential initialization of tables, then a one-time additive migration into the normalized
// dynamic-CO schema (course_outcomes, co_po_values, question_configs, student_co_marks,
// student_question_marks). Every migration step is idempotent (skips courses/rows already
// migrated) and never modifies or drops the legacy tables/columns it reads from.
createUsersTable()
  .then(() => createCoursesTable())
  .then(() => createUserCourseAssignmentsTable())
  .then(() => createMappingTables())
  .then(() => createMarksTable())
  .then(() => createCourseOutcomeTables())
  .then(() => migrateLegacyCoursesToOutcomes())
  .then(() => createCoPoValueTable())
  .then(() => migrateLegacyMappingToCoPoValues())
  .then(() => createQuestionConfigTable())
  .then(() => migrateLegacyQuestionConfigs())
  .then(() => createStudentCoMarksTable())
  .then(() => createStudentQuestionMarksTable())
  .then(() => migrateLegacyStudentMarks())
  .then(() => {
    app.listen(PORT, () => console.log('Server running on', PORT));
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
    process.exit(1);
  });
