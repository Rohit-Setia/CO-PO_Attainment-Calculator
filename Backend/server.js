require('dotenv').config();
const express = require('express');
const cors = require('cors');
const calculate = require('./routes/calculate');
const excelRouter = require('./routes/excelExport');
const authRouter = require('./routes/authRoutes');
const courseRouter = require('./routes/courseRoutes');
const errorHandler = require('./middlewares/errorMiddleware');

const { createUsersTable } = require('./models/userModel');
const { createCoursesTable, createUserCourseAssignmentsTable } = require('./models/courseModel');
const { createMappingTables } = require('./models/mappingModel');
const { createMarksTable } = require('./models/marksModel');

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
  }),
);
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', calculate);
app.use('/api', excelRouter);
app.use('/api', authRouter);
app.use('/api', courseRouter);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Sequential initialization of tables
createUsersTable()
  .then(() => createCoursesTable())
  .then(() => createUserCourseAssignmentsTable())
  .then(() => createMappingTables())
  .then(() => createMarksTable())
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
