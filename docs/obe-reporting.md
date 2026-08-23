# OBE Analytics & Reporting (Phase 13)

Phase 13 completes the program-level pipeline on top of the Phase 1–12 architecture:

```
Student Marks → CO Attainment → CO–PO/PSO Mapping → PO/PSO Attainment
             → Program OBE Dashboard → Analytics / Heatmap → OBE Reports
             → Improvement / Action Plans
```

## What was added

| Layer | File(s) | Purpose |
|---|---|---|
| Service | `Backend/utils/obeAssessmentService.js` | Pure, reusable helpers — target status (`statusFor`), weak-outcome identification, achievement summary, student-weighted PO/PSO aggregation, data-completeness validation. No DB I/O, no duplicated formulas. |
| Model | `Backend/models/obeModel.js` | Additive schema (`outcome_versions`, `improvement_action_plans`, `program_outcomes.target` + `.outcome_version_id`, `course_outcomes.target_percent`) plus program dashboard orchestration that reuses the unmodified `calculateCourseAttainment()` engine. |
| Routes | `Backend/routes/obeRoutes.js` | Program OBE endpoints (below). Writes gated by the existing academic-write RBAC; a Teacher can never modify program outcomes or outcome versions. |
| Frontend | `Frontend/src/Pages/ProgramOBEDashboard.jsx` | Program OBE dashboard: filters (School/Department/Program/Batch/Semester), achievement summary, PO/PSO attainment with course-contribution drill-down, per-course CO attainment with student drill-down, heatmap, weak outcomes, validation panel, Excel/CSV/PDF(print) export. |
| Management | `ProgramOutcomeManagement.jsx` | New **Target** column — configurable PO/PSO targets on the 0–3 scale. |

## API surface

```
GET    /api/programs/:id/obe/dashboard?sessionId=&semester=&versionLabel=
GET    /api/programs/:id/obe/co-attainment
GET    /api/programs/:id/obe/po-attainment
GET    /api/programs/:id/obe/pso-attainment
GET    /api/programs/:id/obe/course-contributions?po=PO3      (or ?pso=PSO1)
GET    /api/programs/:id/obe/validation
GET    /api/programs/:id/obe/course/:courseId/co/:coNumber/students   (drill-down)
GET    /api/programs/:id/obe/report?format=json|excel|csv|pdf
GET    /api/programs/:id/obe/action-plans          POST/PUT/DELETE same path
GET    /api/programs/:id/obe/outcome-versions      POST same path
```

## Formulas (single source of truth)

Course-level CO/PO/PSO values are produced exclusively by the existing engine — see
[calculation-methodology.md](calculation-methodology.md). Phase 13 adds only these
aggregation/classification layers:

**CO target status**
```
actualPercent(CO) = combinedLevel / 3 × 100        # level scale → percent
status = Achieved if actualPercent >= targetPercent else Not Achieved
         (No Data if no marks, No Target if none configured)
```

**Program PO/PSO attainment** — student-weighted mean across contributing courses:
```
Attainment(PO_j) = Σ_course( value_c(PO_j) × students_c ) / Σ_course( students_c )
                   over courses where value_c(PO_j) > 0
```
A course with no mapping to an outcome contributes nothing and never drags the program
value toward zero — *a missing mapping ≠ 0 attainment*. Per-course contributions are
returned so any program figure can be traced back to its courses.

**Weak outcomes** — strictly below configured target, data-driven; outcomes without a
target or without data are excluded (never silently counted as failures).

## Missing-data rules

`Not Mapped` ≠ `No Students` ≠ `No Assessment` ≠ `Missing Marks` ≠ `Zero Attainment`.
The validation pass reports each condition explicitly instead of coercing zeros, e.g.
"`MGT104`: CO-PO / CO-PSO articulation matrix is not mapped", "`MGT104`: 3 enrolled
student(s) have no recorded marks".

## Historical reproducibility (outcome versions)

`outcome_versions` groups definitions under a label (default `current`). Reports accept
`?versionLabel=` to resolve PEO/PO/PSO titles/descriptions from that version's rows, so
editing today's PO description cannot rewrite an older report's content.

## Tests

```
cd Backend
node migration-snapshots/phase13-obe-service-unit-test.js     # offline, pure functions
node migration-snapshots/phase13-obe-analytics-test.js        # live end-to-end (spawns server)
```

The integration suite verifies against real data: the 2.22 / 2.5 course-attainment
regression stays exact, BBA dashboards contain no CSE/B.Tech courses, RBAC rejects
Teacher writes with 403, all four report formats respond correctly, and historical
outcome-version snapshots stay isolated.