# CO-PO Attainment Calculator & OBE Analytics Platform

A full-stack, enterprise-grade web application built for educational institutions to calculate, analyze, and report **Course Outcome (CO)** and **Program Outcome (PO)** attainment for **Outcome-Based Education (OBE)** and accreditation compliance (NBA / NAAC).

This platform empowers administrators, examination teams, subject coordinators, and faculty to manage academic courses, configure question-level and outcome-level mappings, import student records via Excel, visualize attainment metrics with interactive charts, and export professionally formatted reports with live Excel formulas.

---

## 🚀 Key Features

* **🛡️ Role-Based Access Control (RBAC)**:
  * Four institutional privilege tiers: **Admin**, **Examination Team**, **Teacher**, and **Viewer**.
  * User approval workflows (`is_active` validation) preventing unapproved access.
  * Dedicated **Admin Control Panel** (`/admin`) for account approvals, role assignments, and user management.
  * Fine-grained course access control with multi-user course assignments.
* **🎓 Comprehensive Course Workspace**:
  * **Setup & Configurations**: Configure component weightages (e.g. 30% Internal MTT : 70% External ETT), threshold success criteria (e.g. 40%), Level 1/2/3 achievement percentages (e.g. 50%, 60%, 70%), CO maximum mark splits, and custom CO learning outcome statements.
  * **CO-PO Articulation Matrix**: Map Course Outcomes ($CO_1 \dots CO_6$) to 12 Program Outcomes ($PO_1 \dots PO_{12}$) and 3 Program Specific Outcomes ($PSO_1 \dots PSO_3$) with auto-computed average correlation ratings.
  * **Two Robust Data Entry Modes**:
    * **Question-Wise Mode**: Configure 1–30 questions, assign individual question maximums, tag specific COs, and enter question marks with automated auto-summing and real-time boundary validation.
    * **Direct CO-Wise Mode**: Enter consolidated student totals per CO column with live percentage calculations.
  * **Attainment & Analytics Engine**: Computes Internal, External, and Direct Course Attainment levels alongside interactive **Recharts** visualizations (Attainment Level Bar Charts and PO Articulation Radar Charts).
* **📊 Advanced Excel & Snapshot Integration**:
  * **Smart Excel Parser**: Automatically detects varying header variations for Student Name, Roll/Reg No, Question Marks ($Q_1 \dots Q_{30}$), and CO Marks ($CO_1 \dots CO_6$) from `.xlsx` / `.csv` files.
  * **Live Formula Excel Export**: Generates beautifully styled, color-coded workbooks using **ExcelJS** containing student lists, threshold matrices, and embedded Excel formulas (`COUNTIF`, `COUNTA`, `AVERAGE`, `ROUND`, `IF`).
  * **Portable JSON Course Snapshots**: Export complete course snapshots (structure, configs, descriptions, mappings, and marks) as a JSON file and import them across departments or faculty accounts.
* **⚡ Self-Healing Database & Zero-Config Schema**:
  * The backend automatically creates and updates MySQL tables (`teachers`, `courses`, `co_descriptions`, `user_course_assignments`, `co_po_mappings`, `course_configs`, `student_marks`) on startup using dynamic `INFORMATION_SCHEMA` migrations.

---

## 📂 Project Directory Structure

```text
CO-PO Attainment/
├── Backend/
│   ├── config/
│   │   └── db.js                        # MySQL Connection Pool (mysql2/promise)
│   ├── controllers/
│   │   └── authController.js            # Registration, Login, Profile & User Management
│   ├── middlewares/
│   │   ├── authMiddleware.js            # JWT Bearer Token Verification
│   │   ├── errorMiddleware.js           # Centralized Express Error Handling
│   │   ├── roleMiddleware.js            # RBAC Role Guards & Course Ownership Authorization
│   │   └── validateRequest.js            # express-validator Schema Verification
│   ├── models/
│   │   ├── courseModel.js               # Course CRUD, Assignments & Auto-Migrations
│   │   ├── mappingModel.js              # CO-PO Matrix & Threshold Config Persistence
│   │   ├── marksModel.js                # Student Marks (MTT/ETT) Persistence
│   │   └── userModel.js                 # User Model, RBAC Migrations & Admin Queries
│   ├── routes/
│   │   ├── authRoutes.js                # Auth & Admin Management Endpoints
│   │   ├── calculate.js                 # Standalone Attainment Calculation API
│   │   ├── courseRoutes.js               # Full Course Workspace, Marks & Snapshot APIs
│   │   └── excelExport.js               # ExcelJS Styled Workbook Generation API
│   ├── utils/
│   │   ├── attainmentCalculator.js      # Direct Attainment & PO Computation Engine
│   │   ├── excelHelpers.js              # Workbook Styling & Excel Formula Builders
│   │   └── generateToken.js             # JWT Signing Utility with Embedded Role
│   ├── package.json
│   └── server.js                        # Express Server & Sequential DB Bootstrapper
├── Frontend/
│   ├── src/
│   │   ├── Api/
│   │   │   ├── authApi.js               # Auth & Profile API Calls
│   │   │   └── AttainmentApi.js         # Course Workspace, Calculation & Export APIs
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   │   ├── AuthLayout.jsx       # Authentication Page Container
│   │   │   │   └── ProtectedRoute.jsx   # Role-Aware Route Guard
│   │   │   ├── dashboard/
│   │   │   │   ├── CourseCard.jsx       # Course Grid Card with Status Indicators
│   │   │   │   └── CreateCourseModal.jsx # Academic Course Setup Modal
│   │   │   ├── ui/                      # Reusable UI Primitives (Card, Button, Alert, Input)
│   │   │   ├── workspace/
│   │   │   │   ├── AttainmentTab.jsx    # Attainment Metrics, Level Table & Charts
│   │   │   │   ├── ConfigTab.jsx        # Target Criteria & CO Max Splits Form
│   │   │   │   ├── MappingTab.jsx       # CO-PO / PSO Articulation Matrix Grid
│   │   │   │   └── MarksTab.jsx         # Marks Spreadsheet, MTT/ETT & Mode Switcher
│   │   │   ├── AttainmentResult.jsx     # Attainment Cards & Level Matrix
│   │   │   ├── CoMaxEditor.jsx          # Max Marks & Target Threshold Editor
│   │   │   ├── FileActions.jsx          # Excel Import & Export Action Bar
│   │   │   ├── QuestionConfig.jsx       # Question Setup Configuration Control
│   │   │   ├── QuestionWiseTable.jsx    # Question Marks Entry Spreadsheet
│   │   │   └── StudentTable.jsx         # Direct CO Marks Entry Spreadsheet
│   │   ├── context/
│   │   │   └── AuthContext.jsx          # Global Auth State & hasRole() Helper
│   │   ├── Pages/
│   │   │   ├── AdminPanel.jsx           # User Management, Approvals & Role Assignment
│   │   │   ├── CourseWorkspace.jsx      # Tabbed Course Workspace
│   │   │   ├── DashboardPage.jsx        # Faculty Dashboard & Course Management
│   │   │   ├── LoginPage.jsx            # Sign In Screen
│   │   │   ├── QuestionSetup.jsx        # Standalone Question Weights & Mapping Page
│   │   │   ├── SelectDetails.jsx        # Standalone Academic Details Setup Page
│   │   │   ├── SignupPage.jsx           # User Registration Screen
│   │   │   └── student.jsx              # Standalone Student Marks & Live Attainment Page
│   │   ├── utils/
│   │   │   ├── calculations.js          # CO Constants & Math Helpers
│   │   │   └── excelParser.js           # Multi-Header XLSX / CSV Import Engine
│   │   ├── App.jsx                      # Client Route Definitions with RBAC Guards
│   │   ├── index.css                    # Tailwind CSS & Global Glassmorphism Styles
│   │   └── main.jsx                     # Vite React Application Entry Point
│   ├── package.json
│   ├── tailwind.config.js               # Tailwind Design Tokens & Configuration
│   └── vite.config.js                   # Vite Bundler Setup
├── test_question_wise.xlsx              # Sample Question-Wise Import Spreadsheet
├── test_question_wise.csv               # Sample CSV Import Spreadsheet
└── README.md                            # Comprehensive Platform Documentation
```

---

## 🛠️ System Requirements & Installation

### Prerequisite Services
* [Node.js](https://nodejs.org/) (v18+ recommended)
* [MySQL Server](https://dev.mysql.com/downloads/installer/) (v8.0+ recommended)

---

### Step 1: Backend Setup

1. **Navigate to the Backend directory**:
   ```bash
   cd Backend
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure environment variables**:
   Create a `.env` file in the `Backend/` directory:
   ```env
   PORT=5000
   CLIENT_URL=http://localhost:5173
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=teacher_auth
   DB_PORT=3306
   JWT_SECRET=your_super_secret_jwt_key
   ```
   *Note: Ensure the database `teacher_auth` exists in MySQL before launching (`CREATE DATABASE IF NOT EXISTS teacher_auth;`).*

4. **Start the Backend server**:
   ```bash
   npm run dev
   ```
   *The server initializes the database pool and automatically executes schema migrations on startup.*

---

### Step 2: Frontend Setup

1. **Navigate to the Frontend directory**:
   ```bash
   cd Frontend
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure environment variables**:
   Create a `.env` file in the `Frontend/` directory:
   ```env
   VITE_API_URL=http://localhost:5000/api
   ```
4. **Start the Frontend development server**:
   ```bash
   npm run dev
   ```
   *Access the web application at [http://localhost:5173](http://localhost:5173).*

---

### Step 3: First-Time Setup & Admin Bootstrapping

To safeguard student records and institutional configurations, all new user registrations default to `role = 'Viewer'` and `is_active = FALSE`. 

To activate your initial Administrator account:

1. **Sign up** at `http://localhost:5173/signup` using your Admin credentials.
2. **Activate and assign the Admin role** via a single query in your MySQL client:
   ```sql
   UPDATE teachers 
   SET role = 'Admin', is_active = TRUE 
   WHERE email = 'your-admin@email.com';
   ```
3. **Log in** at `http://localhost:5173/login`. 
4. The **Admin Control Panel** button (`/admin`) will appear in the navigation bar, allowing you to approve accounts, toggle statuses, and assign roles directly from the interface.

---

## 👥 Role-Based Access Control (RBAC) Matrix

| Feature / Capability | Admin | Examination Team | Teacher (Owner/Assigned) | Viewer (Auditor/HOD) |
| :--- | :---: | :---: | :---: | :---: |
| **Manage Users & Role Assignment (`/admin`)** | ✅ Full Access | ❌ No | ❌ No | ❌ No |
| **Course Visibility** | All Courses | All Courses | Owned / Assigned Only | Assigned Only |
| **Create New Course** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| **Configure Thresholds & Component Weights** | ✅ Yes | ✅ Yes | ✅ Yes | 👁️ Read-Only |
| **Edit CO-PO Articulation Matrix** | ✅ Yes | ✅ Yes | ✅ Yes | 👁️ Read-Only |
| **Enter Student Marks (Question/CO-Wise)** | ✅ Yes | ✅ Yes | ✅ Yes | 👁️ Read-Only |
| **Import Student Records via Excel** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| **Assign Co-Teachers / Viewers to Courses** | ✅ Yes | ✅ Yes | ✅ Yes (Creator) | ❌ No |
| **Delete Courses or Marks Records** | ✅ Yes | ❌ No | ✅ Yes (Creator) | ❌ No |
| **Run Attainment Calculations & View Charts** | ✅ Yes | ✅ Yes | ✅ Yes | 👁️ Yes (In-Memory) |
| **Export Styled Excel & Portable JSON** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |

---

## 🔌 API Endpoints Reference

### 🔐 Authentication & User Management (`/api/auth`)

| Method | Endpoint | Description | Access Level |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/signup` | Register a new user (defaults to inactive `Viewer`) | Public |
| `POST` | `/api/auth/login` | Log in and receive JWT token (active accounts only) | Public |
| `GET` | `/api/auth/dashboard` | Fetch current user profile | Authenticated |
| `GET` | `/api/auth/admin/users` | List all registered users | Admin only |
| `PUT` | `/api/auth/admin/users/:id` | Update user role and `is_active` status | Admin only |

### 📚 Course Workspace & Management (`/api/courses`)

| Method | Endpoint | Description | Access Level |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/courses` | Retrieve courses (filtered by user role and assignments) | Authenticated |
| `POST` | `/api/courses` | Create a new course with default configs | Admin, Exam Team, Teacher |
| `DELETE` | `/api/courses/:id` | Delete a course and all associated data | Admin, Course Creator |
| `GET` | `/api/courses/:id/config` | Retrieve course configuration & CO descriptions | Assigned / Admin |
| `POST` | `/api/courses/:id/config` | Save threshold criteria, weights, & CO descriptions | Admin, Exam Team, Teacher |
| `GET` | `/api/courses/:id/mapping` | Fetch CO-PO articulation matrix | Assigned / Admin |
| `POST` | `/api/courses/:id/mapping` | Save CO-PO articulation matrix | Admin, Exam Team, Teacher |
| `GET` | `/api/courses/:id/marks` | Fetch normalized student marks (MTT & ETT) | Assigned / Admin |
| `POST` | `/api/courses/:id/marks` | Save/replace student marks for MTT or ETT | Admin, Exam Team, Teacher |
| `GET` | `/api/courses/:id/attainment` | Execute OBE attainment calculation engine | Assigned / Admin |
| `GET` | `/api/courses/:id/export-json` | Export full course as a portable JSON snapshot | Assigned / Admin |
| `POST` | `/api/courses/import-json` | Import course from snapshot under current user | Admin, Exam Team, Teacher |
| `GET` | `/api/courses/:id/assignments` | List all users assigned to the course | Assigned / Admin |
| `POST` | `/api/courses/:id/assign` | Assign a user to a course with role | Admin, Exam Team, Teacher |
| `DELETE`| `/api/courses/:id/assign/:userId` | Remove a user assignment from a course | Admin, Exam Team, Teacher |

### 📊 Standalone Calculations & Export (`/api`)

| Method | Endpoint | Description | Request Body |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/calculate` | Compute attainment percentages and levels per CO | `{ students, coMaxMarks, thresholdPercent, levelCriteria }` |
| `POST` | `/api/export-excel` | Generate a styled Excel workbook with live formulas | `{ students, coMaxMarks, results, levelCriteria, thresholdPercent, courseInfo }` |

---

## 🎯 How It Works: Attainment Engine Logic

### 1. Component Threshold Calculation
For each Course Outcome $CO_i$, the passing threshold marks are calculated based on the configured component threshold percentage (e.g. $40\%$):
$$\text{Threshold Marks}_{CO_i} = \frac{\text{Threshold \%}}{100} \times \text{Max Marks}_{CO_i}$$

### 2. Attainment Level Assessment
A student satisfies the outcome if their score $\ge \text{Threshold Marks}_{CO_i}$. The percentage of students meeting the threshold determines the attainment level:
* **Level 3 (High / Substantial)**: $\ge \text{Level 3 Criteria \%}$ (default $\ge 70\%$) of students achieve threshold.
* **Level 2 (Moderate / Medium)**: $\ge \text{Level 2 Criteria \%}$ (default $\ge 60\%$) of students achieve threshold.
* **Level 1 (Slight / Low)**: $\ge \text{Level 1 Criteria \%}$ (default $\ge 50\%$) of students achieve threshold.
* **Level 0 (Not Attained)**: $< \text{Level 1 Criteria \%}$ of students achieve threshold.

### 3. Direct Course Outcome Attainment
Direct Course Outcome Attainment combines the Internal (MTT) and External (ETT) attainment levels using their respective component weights:
$$\text{Final Attainment}_{CO_i} = \left(\text{Internal Level}_{CO_i} \times \frac{\text{Internal Weight}}{100}\right) + \left(\text{External Level}_{CO_i} \times \frac{\text{External Weight}}{100}\right)$$

### 4. Direct Program Outcome (PO) Attainment
PO and PSO attainment is computed by projecting each CO's attainment level onto the articulation matrix:
$$\text{Attainment}_{PO_j} = \frac{\sum_{i=1}^{n} \left(\text{Final Attainment}_{CO_i} \times \text{Mapping}_{CO_i, PO_j}\right)}{\sum_{i=1}^{n} \text{Mapping}_{CO_i, PO_j}}$$

---

## 📁 Excel Import Guidelines

The smart parser automatically maps incoming spreadsheets by scanning header names (case-insensitive):
* **Registration / Roll Number**: `roll`, `reg`, `reg no`, `registration`, `roll no`, `id`
* **Student Name**: `name`, `student name`, `student_name`, `candidate`
* **Course Outcomes (CO-Wise)**: `co1`, `co2`, `co3`, `co4`, `co5`, `co6`
* **Question Columns (Question-Wise)**: `q1`, `q2`, `q3` ... `q30` (or `question 1`, `question_1`)

---

## 🔒 Security & Privacy

* **Password Security**: Passwords are encrypted using `bcryptjs` with 10 salt rounds.
* **Privacy Assurance**: Sensitive user attributes (e.g. password hashes) are never embedded into JWT tokens or sent to client state.
* **Input Validation**: Request bodies are validated using `express-validator` to enforce schema constraints.
* **Fine-Grained Route Guards**: SQL ownership and assignment checks prevent unauthorized cross-tenant data access.

