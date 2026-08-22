# Calculation Methodology

This document describes the **actual formulas implemented** in [`Backend/utils/attainmentCalculator.js`](../Backend/utils/attainmentCalculator.js), verified directly against the source code — not an idealized or textbook OBE formula. If your institution's prescribed methodology differs, treat this as the starting point for a comparison, not as a substitute for it.

## Inputs

Per course, configured in `course_configs` (Course Workspace → *Setup & Configs* tab):

| Field | Meaning | Default |
|---|---|---|
| `threshold_percent_internal` / `_external` | % of max marks a student must reach to "attain" a CO on that component | 40% |
| `level1_criteria_internal` / `_external` | % of students meeting threshold required for Level 1 | 50% |
| `level2_criteria_internal` / `_external` | % of students meeting threshold required for Level 2 | 60% |
| `level3_criteria_internal` / `_external` | % of students meeting threshold required for Level 3 | 70% |
| `co{N}_max_internal` / `_external` | Max marks for CO*N* on that component | varies |
| `internal_weight` / `external_weight` | Weightage of MTT vs ETT in the combined CO score | 30 / 70 |

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
avgCorrelation(PO_j) = (sum of non-zero CO→PO_j mapping values) / (count of non-zero mappings)
                        — computed and stored server-side whenever the mapping matrix is saved

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

## What this system does *not* model

- **Indirect attainment** (surveys, exit feedback) — not implemented. Only direct (marks-based) attainment exists.
- **Per-question CO tagging in the final score** — question-wise entry mode lets a teacher assign each question to a CO and auto-sums into `co{N}` totals, but attainment is still computed from those CO totals via Steps 1–4 above, not from raw question data.
- **Configurable PO/PSO count** — fixed at 12 POs + 3 PSOs, CO count configurable 1–6.
