# Database Design

MySQL 8.0. Tables are created and auto-migrated at server startup by the `models/*.js` files — there is no separate migration tool or SQL schema file; the code in each model's `create*Table()` function is the source of truth. This document mirrors that code as of this writing.

**There are 7 tables.** No `departments`, `programs`, `semesters`, `pos`, `psos`, `cos`, `assessments`, `question_papers`, `attainment_records`, `classrooms`, or `subjects` tables exist, regardless of what any other document or AI-generated description may claim.

## `teachers`
The single user table for every role (Admin, Examination Team, Teacher, Viewer).

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AUTO_INCREMENT | |
| `name` | VARCHAR(100) | |
| `email` | VARCHAR(120) UNIQUE | |
| `password` | VARCHAR(255) | bcrypt hash |
| `role` | ENUM('Admin','Examination Team','Teacher','Viewer') | defaults `'Viewer'` on signup |
| `is_active` | BOOLEAN | defaults `FALSE` — Admin must approve |
| `created_at` | TIMESTAMP | |

## `courses`
| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AUTO_INCREMENT | |
| `teacher_id` | INT FK → teachers.id | course creator/owner, `ON DELETE CASCADE` |
| `school`, `department` | VARCHAR(100) | free-form text, populated from a fixed frontend dropdown — not backed by separate tables |
| `subject_name`, `course_code` | VARCHAR | |
| `semester` | INT | |
| `academic_year` | VARCHAR(20) | |
| `num_cos` | INT | 1–6, defaults 5 |
| `created_at` | TIMESTAMP | |

## `co_descriptions`
| Column | Type | Notes |
|---|---|---|
| `id` | INT PK | |
| `course_id` | INT FK → courses.id, `ON DELETE CASCADE` | |
| `co_number` | INT | |
| `description` | TEXT | |
| unique | `(course_id, co_number)` | |

## `user_course_assignments`
Fine-grained RBAC: which non-owner users can access a course, and at what level.

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK | |
| `user_id` | INT FK → teachers.id | |
| `course_id` | INT FK → courses.id | |
| `assigned_role` | ENUM('Teacher','Viewer') | |
| `assigned_at` | TIMESTAMP | |
| unique | `(user_id, course_id)` | |

## `co_po_mappings`
One row per course. **Denormalized/fixed-width**, not a normalized mapping table: every CO×PO and CO×PSO cell is its own column.

- `course_id` — INT PK, FK → courses.id
- `co{1..6}_po{1..12}` — INT, default 0 (72 columns)
- `co{1..6}_pso{1..3}` — INT, default 0 (18 columns)
- `avg_po{1..12}`, `avg_pso{1..3}` — DECIMAL(5,2), server-computed column averages, recalculated on every save

## `course_configs`
One row per course — attainment thresholds, level criteria, max marks, weightages.

- `course_id` — INT PK, FK → courses.id
- `threshold_percent_internal` / `_external` — DECIMAL(5,2), default 40.0
- `level1_criteria_internal/external`, `level2_...`, `level3_...` — DECIMAL(5,2), defaults 50/60/70
- `co{1..6}_max_internal` (default 10), `co{1..6}_max_external` (default 100)
- `total_max_internal` (default 60), `total_max_external` (default 100)
- `internal_weight` (default 30.0), `external_weight` (default 70.0)
- `questions_config_internal`, `questions_config_external` — TEXT, JSON-stringified array of `{id, label, co, maxMarks}` for question-wise entry mode

## `student_marks`
One row per student, per course, per exam type. **There is no separate `students` table** — a student only exists as rows in this table.

| Column | Type | Notes |
|---|---|---|
| `id` | INT PK | |
| `course_id` | INT FK → courses.id, `ON DELETE CASCADE` | |
| `name`, `reg_no` | VARCHAR | |
| `exam_type` | ENUM('MTT','ETT') | Internal / External |
| `co1`..`co6` | DECIMAL(5,2) | per-CO marks, default 0 |
| `total_marks` | DECIMAL(6,2) | |
| `question_marks` | TEXT | JSON-stringified `{questionId: mark}`, only populated in question-wise entry mode |
| unique | `(course_id, reg_no, exam_type)` | re-uploading replaces the row (`ON DUPLICATE KEY UPDATE`) |

## Relationships

```
teachers 1──* courses (teacher_id = owner)
teachers *──* courses  (via user_course_assignments, non-owner access)
courses  1──* co_descriptions
courses  1──1 co_po_mappings
courses  1──1 course_configs
courses  1──* student_marks
```

All foreign keys use `ON DELETE CASCADE` — deleting a course permanently removes its config, mapping, CO descriptions, and every student mark row. There is no soft-delete or undo.
