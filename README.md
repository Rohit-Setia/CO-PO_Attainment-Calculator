# CO-PO Attainment Calculator

A full-stack, MERN-style web application (using MySQL instead of MongoDB) designed for educational institutions to calculate, analyze, and report **Course Outcome (CO)** and **Program Outcome (PO)** attainment. 

This platform allows faculty members to securely log in, set up academic structures, choose between detailed data entry modes (Question-Wise vs. CO-Wise), import student data via Excel, and export professionally formatted reports with live Excel formulas.

---

## 🚀 Key Features

*   **Secure Authentication**: Role-based access for teachers with bcrypt-hashed passwords, JWT authentication, and client-side protected routing.
*   **Academic Selection Dashboard**: Set program parameters including School, Department, Subject, Semester, and Exam Type (Mid Term Test - MTT, End Term Test - ETT).
*   **Two Robust Data Entry Modes**:
    *   **Question-Wise Mode**: Configure 5–30 questions, set max marks for each, and map each question to specific Course Outcomes (CO1 to CO5). Auto-sums question marks into CO totals per student with boundary checking.
    *   **CO-Wise Mode**: Input overall CO maximum marks and student totals directly.
*   **Advanced Excel Integration**:
    *   **Flexible Import Parsing**: Upload student records in `.xlsx` or `.csv`. The smart parser automatically detects column mappings for Student Name, Reg No, Questions ($Q_1 \dots Q_{30}$), and COs ($CO_1 \dots CO_5$) even with varying headers.
    *   **Rich Excel Export**: Download highly styled, color-coded spreadsheets containing student performance records, attainment matrices, target criteria levels, and dynamic Excel formulas (`COUNTIF`, `COUNTA`, `IF`, `AVERAGE`, `ROUND`).
*   **Aesthetic & Responsive UI**: Styled with Tailwind CSS and glassmorphism elements, offering clear status updates and real-time visualization of attainment percentages and achievement levels (Level 1, 2, or 3).

---

## 📂 Project Directory Structure

```text
CO-PO Attainment/
├── Backend/
│   ├── config/
│   │   └── db.js                 # MySQL Database Connection Pool
│   ├── controllers/
│   │   └── authController.js     # Signup, Login, and Profile Controllers
│   ├── middlewares/
│   │   ├── authMiddleware.js     # JWT Verification Middleware
│   │   ├── errorMiddleware.js    # Express Error Handling Middleware
│   │   └── validateRequest.js     # Request Schema Validation Middleware
│   ├── models/
│   │   └── userModel.js          # DB Queries & Automatic Table Creation
│   ├── routes/
│   │   ├── authRoutes.js         # Routes for Authentication
│   │   ├── calculate.js          # API for CO Attainment Calculations
│   │   └── excelExport.js        # API for Generating Styled Excel Reports
│   ├── utils/
│   │   └── generateToken.js      # JWT Token Generation Utility
│   ├── package.json
│   └── server.js                 # Backend Server Entry Point
├── Frontend/
│   ├── src/
│   │   ├── Api/
│   │   │   ├── authApi.js        # Auth-related API Calls
│   │   │   └── AttainmentApi.js  # Attainment Calculations & Export Calls
│   │   ├── components/
│   │   │   ├── auth/             # ProtectedRoute and AuthLayout
│   │   │   ├── ui/               # Reusable UI Elements (Card, Button, etc.)
│   │   │   ├── AttainmentResult.jsx # Attainment Level Cards & Table
│   │   │   ├── CoMaxEditor.jsx   # Configuration Panel for CO Maximums
│   │   │   ├── FileActions.jsx   # Import/Export Button Handling
│   │   │   ├── QuestionWiseTable.jsx # Grid for Question Marks Entry
│   │   │   └── StudentTable.jsx  # Grid for CO Marks Entry
│   │   ├── context/
│   │   │   └── AuthContext.jsx   # Global Authentication Context
│   │   ├── Pages/
│   │   │   ├── DashboardPage.jsx # Protected Teacher Profile Dashboard
│   │   │   ├── LoginPage.jsx     # User Sign-In Screen
│   │   │   ├── SignupPage.jsx    # User Registration Screen
│   │   │   ├── SelectDetails.jsx # Course & Mode Selection Screen
│   │   │   ├── QuestionSetup.jsx # Setup for Question Weights & Mapping
│   │   │   └── student.jsx       # Student Marks Grid & Results View
│   │   ├── App.jsx               # Route Management
│   │   ├── index.css             # Main Styling File
│   │   └── main.jsx              # Vite React Entry Point
│   ├── package.json
│   └── tailwind.config.js        # Custom Tailwind Configuration
├── test_question_wise.csv        # Sample CSV for Question-Wise Uploads
├── test_question_wise.xlsx       # Sample Excel Sheet for Question-Wise Uploads
└── README.md                     # Documentation
```

---

## 🛠️ System Requirements & Installation

### Prerequisite Services
Ensure you have the following installed and running on your machine:
*   [Node.js](https://nodejs.org/) (v16+ recommended)
*   [MySQL Server](https://dev.mysql.com/downloads/installer/) (configured locally or accessible remotely)

---

### Step 1: Backend Setup

1.  **Navigate to the Backend directory**:
    ```bash
    cd Backend
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure environment variables**:
    Create a `.env` file in the `Backend/` directory and configure the database credentials to match your local/remote MySQL setup:
    ```env
    PORT=5000
    CLIENT_URL=http://localhost:5173
    DB_HOST=localhost
    DB_USER=root
    DB_PASSWORD=your_mysql_password
    DB_NAME=teacher_auth
    JWT_SECRET=super_secret_key
    ```
    *Note: Ensure the database `teacher_auth` (or whatever DB_NAME you choose) exists in your MySQL instance before running.*

4.  **Run the Backend server**:
    ```bash
    npm run dev
    ```
    *The server automatically attempts to establish a connection with MySQL and creates the necessary database tables (`teachers`) on startup.*

---

### Step 2: Frontend Setup

1.  **Navigate to the Frontend directory**:
    ```bash
    cd Frontend
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure environment variables**:
    Create a `.env` file in the `Frontend/` directory:
    ```env
    VITE_API_BASE_URL=http://localhost:5000/api
    ```

4.  **Start the Frontend dev server**:
    ```bash
    npm run dev
    ```
    *The React application will be accessible at [http://localhost:5173](http://localhost:5173).*

---

## 🔌 API Endpoints Reference

### 🔐 Authentication (`/api/auth`)

| Method | Endpoint | Description | Request Body / Headers |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/signup` | Register a new teacher profile | `{ name, email, password }` |
| `POST` | `/api/auth/login` | Log in and receive JWT token | `{ email, password }` |
| `GET` | `/api/auth/dashboard` | Fetch logged-in teacher info | Headers: `Authorization: Bearer <JWT_TOKEN>` |

### 📊 Attainment & Export (`/api`)

| Method | Endpoint | Description | Request Body |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/calculate` | Compute attainment percentages and levels per CO | `{ students, coMaxMarks, thresholdPercent, levelCriteria }` |
| `POST` | `/api/export-excel` | Generate a styled Excel workbook with live formulas | `{ students, coMaxMarks, results, levelCriteria, thresholdPercent, courseInfo }` |

---

## 🎯 How It Works: Attainment Logic

### 1. Calculation Pipeline
*   **Threshold Value**: Faculty specifies a threshold percentage (e.g. $40\%$). The calculator calculates the threshold marks for each CO as:
    $$\text{Threshold Marks}_{CO_i} = \frac{\text{Threshold Percent}}{100} \times \text{Max Marks}_{CO_i}$$
*   **Student Success**: A student is marked as "achieving threshold" for $CO_i$ if their score $\ge \text{Threshold Marks}_{CO_i}$.
*   **Attainment Level**:
    *   **Level 3 (Very Good)**: Achieved if $\ge \text{Level 3 Criteria \%}$ (e.g., $70\%$) of students exceed the threshold.
    *   **Level 2 (Good)**: Achieved if $\ge \text{Level 2 Criteria \%}$ (e.g., $60\%$) of students exceed the threshold.
    *   **Level 1 (Poor)**: Achieved if $\ge \text{Level 1 Criteria \%}$ (e.g., $50\%$) of students exceed the threshold.
    *   **Level 0**: Achieved if student success rate falls below the Level 1 criteria.

### 2. Live Excel Integration
When exporting the Excel sheet:
*   The raw data is populated directly into rows.
*   Formulas are injected into summary rows (e.g., calculating percentage of students above the threshold using `=IF(COUNT_CELLS > 0, SUCCESSFUL / COUNT, 0)`).
*   This ensures that if grades are edited or adjusted after downloading the report, the attainment levels automatically update inside Excel!

---

## 📁 Excel Template Guidelines

To import records successfully using the Excel/CSV uploader, ensure the column headers contain matching names:
*   **Registration Number**: Headers matching `reg`, `roll`, or `registration`
*   **Student Name**: Headers matching `name` or `studentname`
*   **Course Outcome Marks (CO-Wise)**: Headers matching `co1`, `co2`, `co3`, `co4`, `co5`
*   **Question Marks (Question-Wise)**: Headers matching `q1`, `q2`, `q3` ... `q30` (or `question1` etc.)
