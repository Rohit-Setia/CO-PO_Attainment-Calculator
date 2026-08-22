# Calculation Methodology

This document describes the **actual formulas implemented** in [`Backend/utils/attainmentCalculator.js`](../Backend/utils/attainmentCalculator.js), verified directly against the source code — not an idealized or textbook OBE formula. If your institution's prescribed methodology differs, treat this as the starting point for a comparison, not as a substitute for it.

**The formulas below are unchanged from the original implementation.** What changed in the dynamic-CO migration is only *where the numbers come from* — every `for CO = 1 to numCos` in the old code assumed a fixed CO1-6 range; the current code iterates the course's actual active `course_outcomes` rows (any count, any numbering, possibly non-sequential after archiving). See [database.md](database.md) for the schema.

## Inputs

Per course:

| Field | Meaning | Source | Default |
|---|---|---|---|
| `threshold_percent_internal` / `_external` | % of max marks a student must reach to "attain" a CO on that component | `course_configs` | 40% |
| `level1_criteria_internal` / `_external` | % of students meeting threshold required for Level 1 | `course_configs` | 50% |
| `level2_criteria_internal` / `_external` | % of students meeting threshold required for Level 2 | `course_configs` | 60% |
| `level3_criteria_internal` / `_external` | % of students meeting threshold required for Level 3 | `course_configs` | 70% |
| `max_internal` / `max_external` per CO | Max marks for that specific CO on that component | `course_outcomes` (per-CO row, teacher-editable, no two COs required to match) | 10 / 20 |
| `internal_weight` / `external_weight` | Weightage of MTT vs ETT in the combined CO score | `course_configs` | 30 / 70 |

## Step 1 — Per-CO, per-component attainment level

For each CO and each component (Internal/MTT, External/ETT) independently:

```
thresholdMarks = (thresholdPercent / 100) × maxMarks
studentsAboveThreshold = count of students with rawMarks >= thresholdMarks
percentAbove = (studentsAboveThreshold / totalStudents) × 100

level = 3 if percentAbove >= level3Criteria
        2 if percentAbove >= level2Criteria
        1 if percentAbove >= level1Criteria
        0 otherwise
```

This produces an **integer level 0–3** per CO per component — not a continuous score. A component with zero submitted marks is skipped entirely (its `mttAttainment`/`ettAttainment` is `null`, contributing 0 to the combined score below).

## Step 2 — Combined CO attainment (per CO)

```
combinedLevel(CO) = internalLevel(CO) × (internalWeight / 100)
                   + externalLevel(CO) × (externalWeight / 100)
```

## Step 3 — Overall course attainment

```
overallCourseAttainment = average of combinedLevel(CO) across all COs
```

A single number (0–3 scale) representing the whole course's direct attainment.

## Step 4 — PO / PSO attainment

This is the part most likely to surprise someone expecting a textbook NBA formula. The code does **not** compute a per-CO weighted sum against the articulation matrix. Instead:

```
avgCorrelation(PO_j) = (sum of non-zero CO→PO_j mapping values across active COs) / (count of non-zero mappings)
                        — computed live on every read (getCoPoAveragesForCourse), never stored,
                        so it can't go stale relative to the per-CO mapping values

Attainment(PO_j) = avgCorrelation(PO_j) × overallCourseAttainment
```

Every PO and PSO for a given course is `(that PO's average articulation strength) × (the same single overall course attainment number)`. This means:

- PO/PSO attainment values for one course are all proportional to each other, scaled only by the mapping matrix's column averages.
- It does **not** weight each CO's *individual* attainment by its correlation strength to that specific PO — a CO with low attainment but a strong PO mapping is not distinguished from a CO with high attainment and the same mapping strength, because only the *aggregate* course attainment enters the formula.

**If your accreditation methodology (e.g. a specific NBA/NAAC template) requires the conventional per-CO weighted-sum formula** —
```
Attainment(PO_j) = Σ(CO_i attainment × Mapping(CO_i, PO_j)) / Σ Mapping(CO_i, PO_j)
```
— this codebase does not currently implement it. That would be a deliberate, reviewed change to `calculateCourseAttainment()` in `attainmentCalculator.js`, not a bug fix, since it changes reported numbers. Flag this explicitly to whoever owns the OBE methodology before relying on the PO/PSO figures for an actual accreditation submission.

## Question-wise mode: how a CO score is derived

When a course uses Question-Wise entry (Marks Entry tab), the teacher explicitly maps each question to exactly one CO in the persisted Question Paper Configuration (`question_configs` — see [database.md](database.md)). Nothing in the app infers this mapping. On marks save, the backend sums a student's marks across every question mapped to a given CO to produce that CO's score (`student_co_marks`) — e.g. if Q1 (→CO1, max 10) and Q2 (→CO1, max 10) are both answered, CO1's score is `Q1_mark + Q2_mark` out of 20. That derived CO score then feeds Steps 1–4 above exactly the same way a Direct CO-wise entry would — the attainment engine itself doesn't know or care which entry mode produced the CO score it's looking at.

## What this system does *not* model

- **Indirect attainment** (surveys, exit feedback) — not implemented. Only direct (marks-based) attainment exists.
- **Configurable PO/PSO count** — fixed at 12 POs + 3 PSOs. CO count is dynamic (teacher adds/archives COs freely, up to a 30-CO practical cap) — see [database.md](database.md).
