# Database Design

MySQL 8.0. Tables are created and auto-migrated at server startup by the `models/*.js` files — there is no separate migration tool or SQL schema file; the code in each model's `create*Table()` function is the source of truth. This document mirrors that code as of this writing.

**As of the dynamic-CO migration, the schema is normalized, not fixed-width.** A course can have any number of Course Outcomes (up to a configurable cap, 30 by default) — there is no `co1..co6` column anywhere in the tables the application actually reads from. The previous version of this document (and of the schema itself) hard-capped every course at 6 COs via literal `co1_po1`, `co5_max_internal`-style columns; those legacy tables/columns still physically exist (for backward compatibility and as the migration's data source) but are no longer read or written by any route.

## Active (authoritative) tables

### `teachers`
The single user table for every role (Admin, Examination Team, Teacher, Viewer). `id, name, email, password (bcrypt), role, is_active, created_at`.

### `courses`
`id, teacher_id (FK owner), school, department, subject_name, course_code, semester, academic_year, num_cos (legacy — see below), created_at`.

`school`/`department` are free-form text from a fixed frontend dropdown, not backed by separate tables. `num_cos` is a leftover column from before the dynamic-CO migration — it is no longer read as authoritative anywhere; the real CO count is `COUNT(*) FROM course_outcomes WHERE course_id = ? AND is_active = 1`.

### `course_outcomes` — the dynamic CO list
| Column | Type | Notes |
|---|---|---|
| `id` | INT PK | referenced by every other CO-scoped table as `co_id` |
| `course_id` | INT FK → courses.id | |
| `co_number` | INT | sequential per course, **never reused** — always `MAX(co_number ever used)+1`, even after archiving, so "CO3" always means the same CO |
| `description` | TEXT | teacher-editable |
| `max_internal`, `max_external` | DECIMAL(6,2) | per-CO maximum marks, independently configurable |
| `is_active` | BOOLEAN | archived (not deleted) COs set this to 0 — they drop out of active dropdowns/calculations but every row referencing their `id` elsewhere is preserved |
| unique | `(course_id, co_number)` | |

A course is capped at 30 active+archived COs (`MAX_COS_PER_COURSE` in `courseOutcomeModel.js`) — a practical limit, not an architectural one.

### `co_po_values` — CO-PO/PSO mapping
One row **per CO** (not per course): `co_id PK/FK → course_outcomes.id, po1..po12, pso1..pso3` (INT, default 0). PO/PSO stay fixed-width at 12+3 columns — only the CO dimension needed to become dynamic. Column-level averages (`avg_po1` etc.) are computed live by joining this table against active `course_outcomes`, not stored — they can never go stale.

### `question_configs` — the Question Paper Configuration
| Column | Type | Notes |
|---|---|---|
| `id` | INT PK | |
| `course_id` | INT FK | |
| `exam_type` | ENUM('MTT','ETT') | |
| `question_number` | INT | sequential per (course, exam_type), never renumbered when a question is removed — a removed question's slot is archived, not reused, to avoid silently redefining a question students already have marks against |
| `co_id` | INT FK → course_outcomes.id | **explicitly set by the teacher** — nothing in the app infers this |
| `max_marks` | DECIMAL(6,2) | |
| `is_active` | BOOLEAN | archived (not deleted) when a question is removed from the paper |
| unique | `(course_id, exam_type, question_number)` | |

Capped at 50 questions per exam component (`MAX_QUESTIONS_PER_EXAM`).

### `student_marks` — the base per-student-per-exam row
`id, course_id, name, reg_no, exam_type, total_marks, co1..co6 (legacy, see below), question_marks (legacy TEXT, see below)`. Still the row students are keyed off (there's no separate `students` table). Unique on `(course_id, reg_no, exam_type)`.

### `student_co_marks` — normalized per-CO marks
`id, student_mark_id FK → student_marks.id, co_id FK → course_outcomes.id, marks`. Unique `(student_mark_id, co_id)`. This is what attainment, marks display, and Excel export actually read — supports any CO, any count.

### `student_question_marks` — normalized per-question marks
`id, student_mark_id FK, question_config_id FK → question_configs.id, marks`. Unique `(student_mark_id, question_config_id)`. In question-wise entry mode, `student_co_marks` for a given CO is *derived* by the backend as the sum of this table's rows for questions mapped to that CO — never independently trusted from the client.

## Legacy (inert) tables/columns — kept, not read/written

These exist only because dropping them would be a destructive schema change this environment couldn't safely verify against a live database. They are never queried by any route as of the dynamic-CO migration:

- `co_descriptions` (course_id, co_number, description) — migration source for `course_outcomes.description`
- `course_configs.co{1-6}_max_internal` / `co{1-6}_max_external` — migration source for `course_outcomes.max_internal/external`
- `course_configs.questions_config_internal` / `_external` (JSON TEXT) — migration source for `question_configs`
- `co_po_mappings` (one row per course, `co1_po1..co6_pso3` columns) — migration source for `co_po_values`
- `student_marks.co1..co6` — best-effort mirrored on every marks save for anyone inspecting raw SQL, but never read back
- `student_marks.question_marks` (JSON TEXT) — superseded by `student_question_marks`, no longer written

`course_configs` itself is still active for the fields that were never CO-specific: `threshold_percent_internal/external`, `level1/2/3_criteria_internal/external`, `total_max_internal/external`, `internal_weight`, `external_weight`.

## Migration

At server startup, after every legacy and new table exists, `server.js` runs a strictly additive, idempotent migration chain (`migrateLegacyCoursesToOutcomes` → `migrateLegacyMappingToCoPoValues` → `migrateLegacyQuestionConfigs` → `migrateLegacyStudentMarks`). Each step is skipped per-course (or per-row) if its target table already has data there, so it's safe to run on every boot. None of it drops, truncates, or overwrites the legacy tables it reads from — see [architecture.md](architecture.md) for the full ordering and reasoning.

## Relationships

```
courses 1──* course_outcomes
course_outcomes 1──1 co_po_values
courses 1──* question_configs *──1 course_outcomes (co_id)
courses 1──* student_marks
student_marks 1──* student_co_marks *──1 course_outcomes (co_id)
student_marks 1──* student_question_marks *──1 question_configs
```

All foreign keys use `ON DELETE CASCADE` from `courses`/`student_marks`/`question_configs` downward — deleting a course still permanently removes everything under it. There is no soft-delete at the course level, only at the CO/question level (`is_active`).
