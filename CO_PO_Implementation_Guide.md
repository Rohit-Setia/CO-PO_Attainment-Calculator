# CO-PO Attainment Calculator: Implementation Guide

This guide provides a comprehensive roadmap and technical specifications to transition the current application from a **session-based CO calculator** into a **persistent, full-fledged CO-PO Attainment Calculator**.

---

## 1. Database Schema Extensions (MySQL)

Currently, the database only has the `teachers` table. To persist courses, mappings, student marks, and attainment results, create the following tables.

Add these schema definitions to new files in the `Backend/models/` directory (e.g., `courseModel.js`, `marksModel.js`, `mappingModel.js`).

```sql
-- 1. Courses Table
CREATE TABLE IF NOT EXISTS courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  school VARCHAR(100) NOT NULL,
  department VARCHAR(100) NOT NULL,
  subject_name VARCHAR(100) NOT NULL,
  course_code VARCHAR(50) NOT NULL,
  semester INT NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

-- 2. Student Marks Table
-- Stores student profiles and marks per course for both Internal (MTT) and External (ETT) exams
CREATE TABLE IF NOT EXISTS student_marks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  student_name VARCHAR(100) NOT NULL,
  reg_no VARCHAR(50) NOT NULL,
  exam_type ENUM('MTT', 'ETT') NOT NULL,
  co1 DECIMAL(5,2) DEFAULT 0.0,
  co2 DECIMAL(5,2) DEFAULT 0.0,
  co3 DECIMAL(5,2) DEFAULT 0.0,
  co4 DECIMAL(5,2) DEFAULT 0.0,
  co5 DECIMAL(5,2) DEFAULT 0.0,
  total_marks DECIMAL(6,2) DEFAULT 0.0,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE KEY unique_student_exam (course_id, reg_no, exam_type)
);

-- 3. CO-PO Mapping Table
-- Stores the correlation levels (0 to 3) between COs (CO1-CO5) and POs (PO1-PO12, PSO1-PSO3)
CREATE TABLE IF NOT EXISTS co_po_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL UNIQUE,
  -- CO1 Mappings
  co1_po1 INT DEFAULT 0, co1_po2 INT DEFAULT 0, co1_po3 INT DEFAULT 0, co1_po4 INT DEFAULT 0, co1_po5 INT DEFAULT 0,
  co1_po6 INT DEFAULT 0, co1_po7 INT DEFAULT 0, co1_po8 INT DEFAULT 0, co1_po9 INT DEFAULT 0, co1_po10 INT DEFAULT 0,
  co1_po11 INT DEFAULT 0, co1_po12 INT DEFAULT 0, co1_pso1 INT DEFAULT 0, co1_pso2 INT DEFAULT 0, co1_pso3 INT DEFAULT 0,
  -- CO2 Mappings
  co2_po1 INT DEFAULT 0, co2_po2 INT DEFAULT 0, co2_po3 INT DEFAULT 0, co2_po4 INT DEFAULT 0, co2_po5 INT DEFAULT 0,
  co2_po6 INT DEFAULT 0, co2_po7 INT DEFAULT 0, co2_po8 INT DEFAULT 0, co2_po9 INT DEFAULT 0, co2_po10 INT DEFAULT 0,
  co2_po11 INT DEFAULT 0, co2_po12 INT DEFAULT 0, co2_pso1 INT DEFAULT 0, co2_pso2 INT DEFAULT 0, co2_pso3 INT DEFAULT 0,
  -- CO3 Mappings
  co3_po1 INT DEFAULT 0, co3_po2 INT DEFAULT 0, co3_po3 INT DEFAULT 0, co3_po4 INT DEFAULT 0, co3_po5 INT DEFAULT 0,
  co3_po6 INT DEFAULT 0, co3_po7 INT DEFAULT 0, co3_po8 INT DEFAULT 0, co3_po9 INT DEFAULT 0, co3_po10 INT DEFAULT 0,
  co3_po11 INT DEFAULT 0, co3_po12 INT DEFAULT 0, co3_pso1 INT DEFAULT 0, co3_pso2 INT DEFAULT 0, co3_pso3 INT DEFAULT 0,
  -- CO4 Mappings
  co4_po1 INT DEFAULT 0, co4_po2 INT DEFAULT 0, co4_po3 INT DEFAULT 0, co4_po4 INT DEFAULT 0, co4_po5 INT DEFAULT 0,
  co4_po6 INT DEFAULT 0, co4_po7 INT DEFAULT 0, co4_po8 INT DEFAULT 0, co4_po9 INT DEFAULT 0, co4_po10 INT DEFAULT 0,
  co4_po11 INT DEFAULT 0, co4_po12 INT DEFAULT 0, co4_pso1 INT DEFAULT 0, co4_pso2 INT DEFAULT 0, co4_pso3 INT DEFAULT 0,
  -- CO5 Mappings
  co5_po1 INT DEFAULT 0, co5_po2 INT DEFAULT 0, co5_po3 INT DEFAULT 0, co5_po4 INT DEFAULT 0, co5_po5 INT DEFAULT 0,
  co5_po6 INT DEFAULT 0, co5_po7 INT DEFAULT 0, co5_po8 INT DEFAULT 0, co5_po9 INT DEFAULT 0, co5_po10 INT DEFAULT 0,
  co5_po11 INT DEFAULT 0, co5_po12 INT DEFAULT 0, co5_pso1 INT DEFAULT 0, co5_pso2 INT DEFAULT 0, co5_pso3 INT DEFAULT 0,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- 4. Course Configurations Table
-- Persists configurations like threshold % and Level Criteria levels
CREATE TABLE IF NOT EXISTS course_configs (
  course_id INT PRIMARY KEY,
  threshold_percent DECIMAL(5,2) DEFAULT 40.0,
  level1_criteria DECIMAL(5,2) DEFAULT 50.0,
  level2_criteria DECIMAL(5,2) DEFAULT 60.0,
  level3_criteria DECIMAL(5,2) DEFAULT 70.0,
  co1_max INT DEFAULT 10,
  co2_max INT DEFAULT 10,
  co3_max INT DEFAULT 10,
  co4_max INT DEFAULT 15,
  co5_max INT DEFAULT 15,
  total_max INT DEFAULT 60,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
```

---

## 2. Backend Logic (Routing & Calculations)

Create a new file `Backend/routes/courseRoutes.js` and a calculations middleware/helper to handle Course operations, Mapping updates, and Attainment calculations.

### A. Saving and Fetching Mappings
```javascript
// POST /api/courses/:id/mapping
router.post('/courses/:id/mapping', protect, async (req, res) => {
  const courseId = req.params.id;
  const mappings = req.body; // Expects co1-co5 mappings to po1-po12/pso1-pso3

  try {
    // Generate SQL query to INSERT or UPDATE on Duplicate Key
    // ... Database insert query ...
    res.json({ message: "CO-PO mapping saved successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### B. Weighted Attainment Calculations
When both MTT (Internal) and ETT (External) marks exist, final Course Outcome attainment is a weighted average of their individual attainment levels.

Add this logic in `Backend/routes/calculate.js`:
```javascript
function computeCOAttainment(students, coMaxMarks, thresholdPercent, levelCriteria) {
  const result = {};
  const coKeys = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'];
  const totalStudents = students.length;

  coKeys.forEach((co) => {
    const thresholdMark = (thresholdPercent / 100) * coMaxMarks[co];
    let aboveThresholdCount = 0;

    students.forEach((student) => {
      const mark = student[co.toLowerCase()] || 0;
      if (mark >= thresholdMark) aboveThresholdCount++;
    });

    const percentAbove = totalStudents ? (aboveThresholdCount / totalStudents) * 100 : 0;
    
    let level = 0;
    if (percentAbove >= levelCriteria.level3) level = 3;
    else if (percentAbove >= levelCriteria.level2) level = 2;
    else if (percentAbove >= levelCriteria.level1) level = 1;

    result[co] = { percentAbove, level, thresholdMark };
  });

  return result;
}

// Route to calculate combined Direct CO Attainment
router.post('/calculate-combined', protect, async (req, res) => {
  const { courseId, internalWeight = 40, externalWeight = 60 } = req.body;

  // 1. Fetch MTT & ETT marks for this course from database
  // 2. Fetch configurations (max marks, threshold, levels)
  // 3. Compute separately:
  const mttAttainment = computeCOAttainment(mttStudents, coMax, threshold, levelCriteria);
  const ettAttainment = computeCOAttainment(ettStudents, coMax, threshold, levelCriteria);

  // 4. Combine them using weights
  const combinedCO = {};
  ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].forEach(co => {
    const internalLevel = mttAttainment[co].level;
    const externalLevel = ettAttainment[co].level;
    const combinedLevel = (internalLevel * (internalWeight / 100)) + (externalLevel * (externalWeight / 100));
    
    combinedCO[co] = {
      internalLevel,
      externalLevel,
      combinedLevel: parseFloat(combinedLevel.toFixed(2))
    };
  });

  res.json({ combinedCO });
});
```

### C. PO Attainment Calculation Formula
PO attainment for a Program Outcome ($PO_j$) is calculated using the weighted mappings of COs that map to that PO.

$$\text{PO}_j \text{ Attainment} = \frac{\sum_{i=1}^{5} \left( \text{Combined CO}_i \text{ Attainment} \times \text{Mapping Correlation}(\text{CO}_i, \text{PO}_j) \right)}{\sum_{i=1}^{5} \text{Mapping Correlation}(\text{CO}_i, \text{PO}_j)}$$

```javascript
// Helper to calculate PO & PSO Attainment
function calculatePOAttainment(combinedCOAttainments, mappings) {
  const poResults = {};
  const pos = ['po1', 'po2', 'po3', 'po4', 'po5', 'po6', 'po7', 'po8', 'po9', 'po10', 'po11', 'po12', 'pso1', 'pso2', 'pso3'];

  pos.forEach((po) => {
    let weightedSum = 0;
    let mappingSum = 0;

    for (let i = 1; i <= 5; i++) {
      const coKey = `CO${i}`;
      const coLevel = combinedCOAttainments[coKey].combinedLevel; // Combined Attainment level (e.g. 2.4)
      const correlation = mappings[`co${i}_${po}`] || 0; // Correlation value: 0 (or null), 1, 2, 3

      if (correlation > 0) {
        weightedSum += coLevel * correlation;
        mappingSum += correlation;
      }
    }

    // If no COs map to this PO, attainment is set to 0 or null
    poResults[po] = mappingSum > 0 ? parseFloat((weightedSum / mappingSum).toFixed(2)) : 0;
  });

  return poResults;
}
```

---

## 3. Frontend UI Upgrades (React)

To integrate these features, modify components and add interfaces for course management and CO-PO mapping.

### A. Dashboard Integration (`Frontend/src/Pages/DashboardPage.jsx`)
*   Replace the static dashboard details with a list of courses fetched from `/api/courses`.
*   Add a **"Create New Course"** modal to define School, Department, Subject, Code, Semester, and Academic Year.
*   Selecting a course loads its profile and redirects to the Setup and Calculator interfaces with the context of `course_id`.

### B. CO-PO Mapping Matrix Component (`Frontend/src/components/CoPoMapping.jsx`)
Create an interactive grid matching COs (rows) against POs/PSOs (columns) allowing teachers to assign correlation weights:

```jsx
import React from 'react';

const PO_LIST = Array.from({ length: 12 }, (_, i) => `PO${i + 1}`).concat(['PSO1', 'PSO2', 'PSO3']);
const CO_LIST = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'];

export default function CoPoMapping({ mapping, onChange }) {
  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow border border-slate-200 p-4">
      <table className="w-full text-sm text-center border-collapse">
        <thead className="bg-slate-50 font-bold text-slate-700">
          <tr>
            <th className="border px-3 py-2 text-left bg-slate-100">CO / PO</th>
            {PO_LIST.map((po) => (
              <th key={po} className="border px-2 py-2 text-xs">{po}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CO_LIST.map((co) => (
            <tr key={co} className="hover:bg-slate-50">
              <td className="border px-3 py-2 font-semibold text-left bg-slate-100">{co}</td>
              {PO_LIST.map((po) => {
                const key = `${co.toLowerCase()}_${po.toLowerCase()}`;
                return (
                  <td key={po} className="border p-1">
                    <select
                      value={mapping[key] || 0}
                      onChange={(e) => onChange(key, parseInt(e.target.value))}
                      className="w-full bg-transparent border-0 text-center font-semibold text-slate-800 focus:outline-none"
                    >
                      <option value={0}>-</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### C. Combined Direct Attainment Screen (`Frontend/src/Pages/CombinedAttainment.jsx`)
*   Provide tabs or toggles to switch between **Internal (MTT)** upload and **External (ETT)** upload.
*   Once both datasets are uploaded/saved:
    *   Display a slider/input to adjust weightages (default: `40% CIA` vs `60% ETT`).
    *   Show a final **Direct CO Attainment** calculation output.
    *   Show the resulting **PO Attainment** computed dynamically using the mapping matrix.
    *   Display a bar chart or radar chart visualization using a library like `recharts` or `chart.js`.

---

## 4. Excel Report Upgrades (ExcelJS)

In `Backend/routes/excelExport.js`, append a second sheet to the generated workbook specifically dedicated to **CO-PO Mapping and PO Attainment**.

```javascript
// Add a sheet for CO-PO Mapping & PO Attainment
const poSheet = workbook.addWorksheet('CO-PO Attainment');

// Define columns
poSheet.columns = [
  { width: 12 }, // CO
  ...Array.from({ length: 12 }, (_, i) => ({ width: 8, header: `PO${i+1}` })),
  { width: 10, header: 'PSO1' },
  { width: 10, header: 'PSO2' },
  { width: 10, header: 'PSO3' }
];

// Add headers & merge configurations
// Write the mapping values into cells
// In the attainment summary row at the bottom, write dynamic Excel formulas:
// =SUMPRODUCT(B2:B6, CO_ATTAINMENT_CELLS) / SUM(B2:B6)
// This will calculate PO Attainment dynamically using formulas inside Excel!
```

---

## 5. Summary of Recommended Implementation Steps (Todo List)

1. [ ] **Backend Database Migration**: Expand MySQL schema to include the new tables (`courses`, `student_marks`, `co_po_mappings`, `course_configs`).
2. [ ] **Course Management API**: Implement Backend routes for CRUD operations on courses, retrieving specific configurations, and authentication protection.
3. [ ] **Mapping Storage API**: Build `/api/courses/:id/mapping` to store and update matrices.
4. [ ] **Calculate Route Refactor**: Extend `/api/calculate` to support saving marks, compiling MTT + ETT data, and calculating combined weighted CO attainment.
5. [ ] **PO Attainment Calculations**: Implement the PO attainment weighted sum logic on the backend.
6. [ ] **Dashboard Frontend Page**: Create UI dashboard showing active/past courses for the teacher.
7. [ ] **CO-PO Mapping Grid**: Build the matrix selection grid UI matching 5 COs to 12 POs & 3 PSOs.
8. [ ] **Internal/External Combined UI**: Implement toggles for uploading internal and external scores, choosing weightages, and displaying charts.
9. [ ] **Enhanced ExcelJS Export**: Update report download to generate a multi-sheet spreadsheet including mapping data and PO attainment calculations.
