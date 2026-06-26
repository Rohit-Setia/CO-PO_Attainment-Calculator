# CO-PO Attainment Calculator: Final TO-DO List & Rationale

This document establishes the definitive, merged list of **MUST-DO** and **SHOULD-DO** tasks to transform your project into a complete, persistent **CO-PO Attainment Calculator**. 

It removes all unnecessary, out-of-scope features found in the reference project (such as attendance, student portals, and complaint modules) to focus exclusively on Course and Program Outcome Attainment.

---

## 🚫 Features Excluded (Unwanted / Out-of-Scope)
We have removed the following features from the reference project because they belong to general School Management Systems (ERPs) rather than a specialized Outcome-Based Education (OBE) Attainment Calculator:
* **Student Logins & Portals**: Students do not input data. Teachers handle all marks uploads, and final outputs are distributed via Excel or PDF reports.
* **Attendance Tracking**: Has no mathematical impact on CO-PO attainment calculations.
* **Notice Boards & Complaints**: Unnecessary administrative overhead that does not contribute to OBE reporting.
* **Admin-Driven Subject Allocation**: Implementing a separate Admin role to assign subjects to teachers adds complexity. Instead, we recommend a **Decentralized Teacher Dashboard** where teachers can create, edit, and manage their own list of courses.

---

## 🔴 The "MUST-DO" List (Critical Core Features)
These tasks are absolutely required to deliver a compliant and functioning CO-PO Attainment Calculator.

### 1. MySQL Database Schema Expansion
* **Tasks**:
  - [ ] Create `courses` table (fields: `id`, `teacher_id`, `subject_name`, `course_code`, `semester`, `academic_year`).
  - [ ] Create `co_descriptions` table (fields: `id`, `course_id`, `co_number`, `description`).
  - [ ] Create `co_po_mappings` table (fields: `course_id`, mapping cells from `co1_po1` to `co5_pso3`, and computed column averages `avg_po1` to `avg_pso3`).
  - [ ] Create `course_configs` table (fields: `course_id`, `co_max` values, `threshold_percent`, Level 1/2/3 targets for both Internal/UT and External/End-Sem exams).
  - [ ] Create `student_marks` table (fields: `id`, `course_id`, `name`, `reg_no`, separate columns for internal CO1–CO6 marks, and external End-Sem/SPPU marks).
* **Why We Need It**: Currently, your project is session-only. If a teacher logs out or refreshes, all configurations and student marks lists are lost. Database persistence ensures teachers can save, reload, and edit their calculations at any time.

### 2. Interactive CO-PO Mapping (Articulation Matrix)
* **Tasks**:
  - [ ] Build a responsive grid component in the frontend allowing teachers to enter values (`0` or `-`, `1`, `2`, `3`) mapping CO1–CO6 rows to PO1–PO12 and PSO1–PSO3 columns.
  - [ ] Compute the average of non-zero entries in each column on the fly.
  - [ ] Create backend endpoints to save and load these mappings.
* **Why We Need It**: This matrix is the core linkage of Outcome-Based Education. Without it, you cannot translate Course Outcome (CO) attainment into Program Outcome (PO) attainment. Column averages show the direct correlation strength of the curriculum to specific program outcomes.

### 3. Dual-Target Configuration Panel
* **Tasks**:
  - [ ] Upgrade the configuration panel to support entering separate target attainment percentages (Level 1, 2, and 3 criteria) for:
    1. **Internal Exams (Unit Tests / Mid-Terms)** (e.g. UT target levels: 50%, 60%, 70%).
    2. **External Exams (University / End-Sem)** (e.g. End-Sem target levels: 60%, 70%, 80%).
* **Why We Need It**: In accreditation standards, university exams (external) and college exams (internal) are graded differently. External exams are typically harder, so universities allow departments to set separate achievement benchmarks for them.

### 4. Combined Weightage Attainment Engine
* **Tasks**:
  - [ ] Refactor the uploader and table parser to let teachers import student grades containing both **Internal CO marks** and **External End-Sem marks** in a single file or in consecutive uploads.
  - [ ] Refactor the backend `/api/calculate` logic to:
    1. Calculate success rates for Internal CO marks (student count scoring $\ge \text{threshold } \times \text{CO max}$).
    2. Calculate success rates for External End-Sem marks (student count scoring $\ge \text{threshold } \times \text{End-Sem max}$).
    3. Determine component attainment levels (L1, L2, L3) and normalize them.
    4. Compute final Direct CO Attainment using weights (e.g. `30% Internal + 70% External`).
* **Why We Need It**: A single exam type is insufficient for NBA/ABET criteria. Real-world course attainment requires a weighted calculation combining continuous internal assessments with final semester-end grades.

### 5. PO / PSO Attainment Engine
* **Tasks**:
  - [ ] Implement backend calculations to compute PO/PSO attainment for all 15 outcomes:
    $$\text{PO}_j \text{ Attainment} = \text{Articulation Matrix Column Average }(\text{PO}_j) \times \text{Overall Course Attainment}$$
* **Why We Need It**: This is the final mathematical step of the calculator. It evaluates how much the subject contributed to the graduation outcomes (POs) of the students.

### 6. Dynamic CO Setup (Descriptions)
* **Tasks**:
  - [ ] Allow teachers to dynamically configure whether they are using **5 or 6 COs**.
  - [ ] Add text inputs so teachers can write custom description statements for each CO (e.g. *"Design database schemas using normal forms"*).
* **Why We Need It**: Course outcomes are audited by accreditation boards. Storing only numbers is insufficient; the actual description text must be printed on final reports.

### 7. Upgraded Excel Report Exporter
* **Tasks**:
  - [ ] Rewrite `/api/export-excel` using `exceljs` to generate a workbook with two sheets:
    * **Sheet 1**: Student marks grid, threshold configurations, and final combined CO attainment table.
    * **Sheet 2**: The CO-PO Articulation Matrix and final PO/PSO attainment values, computed dynamically using live Excel formulas (`SUM`, `SUMPRODUCT`, `AVERAGE`).
* **Why We Need It**: Teachers must submit these reports to academic audit committees. Having live Excel formulas ensures that if a grade is modified in Excel later, the PO results will automatically recalculate.

---

## 🟡 The "SHOULD-DO" List (Recommended Enhancements)
These tasks improve usability, dashboard management, and reporting.

### 8. Teacher Dashboard & Subject Management UI
* **Tasks**:
  - [ ] Add a clean dashboard listing all active subjects for the logged-in teacher (e.g. "Data Structures - Semester 3 - 2026").
  - [ ] Allow teachers to add new subjects, edit configurations, and check setup status (e.g., *"Step 2: Articulation Matrix is missing"*).
* **Why We Need It**: Currently, the selection page is hardcoded and temporary. A real dashboard lets a teacher manage multiple classes, semesters, and historical records without re-uploading everything.

### 9. Visual Analytics Charts (Radar & Bar)
* **Tasks**:
  - [ ] Add `Recharts` to the frontend and build:
    1. A **Bar Chart** comparing UT and SPPU attainment levels per CO.
    2. A **Radar Chart** displaying the final PO/PSO attainment profile.
* **Why We Need It**: Graphs make it easy for teachers to visually identify which learning outcomes (COs) or program goals (POs) students are struggling with, enabling rapid corrective actions.

### 10. Department-wide Attainment Consolidation
* **Tasks**:
  - [ ] Create an API and UI dashboard that aggregates PO attainment across all subjects of a class/department.
* **Why We Need It**: Program coordinators need to see the average PO profile of the entire graduating batch. This feature aggregates the averages of all subjects to output the department-level attainment matrix.

### 11. Visual Appeal & Premium UI Polish
* **Tasks**:
  - [ ] Apply modern styling enhancements including smooth gradients, balanced HSL color palettes (vibrant blues, emeralds, indigos), and glassmorphism cards.
  - [ ] Implement clear visual states, loading indicator animations, and micro-interactions on buttons, checkboxes, and select menus.
  - [ ] Polish typography, spacing, and responsive padding to ensure the app looks premium and professional on all screen sizes.
* **Why We Need It**: A professional, visually stunning, and highly presentable interface increases user trust, makes complex data entry tasks easier for faculty members, and ensures the system looks like a premium, state-of-the-art enterprise solution.
