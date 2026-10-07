require('dotenv').config();
const pool = require('../config/db');

const { createUsersTable, addRoleScopingColumns } = require('../models/userModel');
const { createCoursesTable, createUserCourseAssignmentsTable, addCourseStatusColumn } = require('../models/courseModel');
const { createMappingTables, createCoPoValueTable, migrateLegacyMappingToCoPoValues } = require('../models/mappingModel');
const {
  createMarksTable,
  createStudentCoMarksTable,
  createStudentQuestionMarksTable,
  migrateLegacyStudentMarks,
  addStudentIdToMarks,
} = require('../models/marksModel');
const { createCourseOutcomeTables, migrateLegacyCoursesToOutcomes } = require('../models/courseOutcomeModel');
const { createQuestionConfigTable, migrateLegacyQuestionConfigs } = require('../models/questionConfigModel');
const {
  createUniversityTables,
  migrateLegacyUniversityData,
  normalizeLegacyStudentsTable,
  normalizeProgramsTable,
  normalizeLegacyStudentSchemaForMaster,
  addProgramDegreeColumn,
  addPhase7DuplicatePreventionConstraints,
  addStudentContextUniqueness,
} = require('../models/universityModel');
const { createProgramOutcomesTable, seedDefaultProgramOutcomes } = require('../models/programOutcomeModel');
const { ensureOBESchema } = require('../models/obeModel');
const { createStudentTables, migrateLegacyStudentData } = require('../models/studentModel');
const { createAdminAuditTable } = require('../models/adminAuditModel');
const { runPendingMigrations } = require('../utils/migrationRunner');

require('../models/examWorkflowMigrations');
require('../models/examAllocationMigrations');

const runDatabaseInit = async () => {
  console.log('[db-init] Starting complete database initialization...');
  const steps = [
    ['createUsersTable', createUsersTable],
    ['createUniversityTables', createUniversityTables],
    ['addRoleScopingColumns', addRoleScopingColumns],
    ['addPhase7DuplicatePreventionConstraints', addPhase7DuplicatePreventionConstraints],
    ['createProgramOutcomesTable', createProgramOutcomesTable],
    ['seedDefaultProgramOutcomes', seedDefaultProgramOutcomes],
    ['createCoursesTable', createCoursesTable],
    ['addCourseStatusColumn', addCourseStatusColumn],
    ['createStudentTables', createStudentTables],
    ['addStudentContextUniqueness', addStudentContextUniqueness],
    ['migrateLegacyUniversityData', migrateLegacyUniversityData],
    ['normalizeLegacyStudentsTable', normalizeLegacyStudentsTable],
    ['normalizeProgramsTable', normalizeProgramsTable],
    ['addProgramDegreeColumn', addProgramDegreeColumn],
    ['normalizeLegacyStudentSchemaForMaster', normalizeLegacyStudentSchemaForMaster],
    ['createUserCourseAssignmentsTable', createUserCourseAssignmentsTable],
    ['createMappingTables', createMappingTables],
    ['createMarksTable', createMarksTable],
    ['addStudentIdToMarks', addStudentIdToMarks],
    ['migrateLegacyStudentData', migrateLegacyStudentData],
    ['createCourseOutcomeTables', createCourseOutcomeTables],
    ['migrateLegacyCoursesToOutcomes', migrateLegacyCoursesToOutcomes],
    ['createCoPoValueTable', createCoPoValueTable],
    ['migrateLegacyMappingToCoPoValues', migrateLegacyMappingToCoPoValues],
    ['createQuestionConfigTable', createQuestionConfigTable],
    ['migrateLegacyQuestionConfigs', migrateLegacyQuestionConfigs],
    ['createStudentCoMarksTable', createStudentCoMarksTable],
    ['createStudentQuestionMarksTable', createStudentQuestionMarksTable],
    ['migrateLegacyStudentMarks', migrateLegacyStudentMarks],
    ['createAdminAuditTable', createAdminAuditTable],
    ['ensureOBESchema', ensureOBESchema],
    ['runPendingMigrations', runPendingMigrations],
  ];

  for (let i = 0; i < steps.length; i++) {
    const [name, fn] = steps[i];
    console.log(`[db-init] [${i + 1}/${steps.length}] Running ${name}...`);
    const start = Date.now();
    await fn();
    console.log(`[db-init] [${i + 1}/${steps.length}] Finished ${name} (${Date.now() - start}ms)`);
  }

  console.log('[db-init] Database initialization finished successfully.');
};

// If run directly from CLI (e.g. `node scripts/initDb.js` or `npm run db:init`)
if (require.main === module) {
  runDatabaseInit()
    .then(() => {
      console.log('[db-init] Process complete.');
      pool.end();
      process.exit(0);
    })
    .catch((error) => {
      console.error('[db-init] Initialization failed:');
      console.error(error);
      pool.end();
      process.exit(1);
    });
}

module.exports = { runDatabaseInit };
