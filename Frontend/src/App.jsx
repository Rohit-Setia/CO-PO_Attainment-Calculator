import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ClipboardList, Grid3x3, Target, Calculator, Upload, FileBarChart } from 'lucide-react';
import './App.css';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import Dashboard from './Pages/Dashboard';
import CoursesPage from './Pages/CoursesPage';
import StudentsPage from './Pages/StudentsPage';
import CoursePickerPage from './Pages/CoursePickerPage';
import InternalMarksPage from './Pages/InternalMarksPage';
import SettingsPage from './Pages/SettingsPage';
import NotificationsPage from './Pages/NotificationsPage';
import LoginPage from './Pages/LoginPage';
import SignupPage from './Pages/SignupPage';
import CourseWorkspace from './Pages/CourseWorkspace';
import AdminPanel from './Pages/AdminPanel';
import StudentMappingPage from './Pages/StudentMappingPage';
import CourseEnrollmentPage from './Pages/CourseEnrollmentPage';
import AcademicAdministrationPage from './Pages/AcademicAdministrationPage';
import StudentMasterPage from './Pages/StudentMasterPage';

// Phase 7 — Schools/Departments/Programs/Sessions/Classes and the Student Master are managed
// by University Admin, School Admin, or Department Admin (each additionally scoped server-side
// to their own School/Department — the route guard here is coarse, the backend is authoritative).
const ADMIN_ROLES = ['Admin', 'School Admin', 'Department Admin'];

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/:id" element={<CourseWorkspace />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route
          path="/internal-marks"
          element={<InternalMarksPage />}
        />
        <Route
          path="/co-mapping"
          element={<CoursePickerPage title="CO Mapping" description="Select a course to manage its Course Outcomes" icon={Grid3x3} targetTab="config" actionLabel="Manage COs" />}
        />
        <Route
          path="/po-mapping"
          element={<CoursePickerPage title="PO Mapping" description="Select a course to edit its CO-PO/PSO articulation matrix" icon={Target} targetTab="mapping" actionLabel="Open Matrix" />}
        />
        <Route
          path="/co-po-calculation"
          element={<CoursePickerPage title="CO-PO Calculation" description="Select a course to view its attainment calculation" icon={Calculator} targetTab="attainment" actionLabel="View Attainment" />}
        />
        <Route
          path="/upload-excel"
          element={<CoursePickerPage title="Upload Excel" description="Select a course to import student marks from Excel" icon={Upload} targetTab="marks" actionLabel="Upload" />}
        />
        <Route
          path="/reports"
          element={<CoursePickerPage title="Reports" description="Select a course to export its Excel/JSON report" icon={FileBarChart} targetTab="attainment" actionLabel="Export" />}
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['Admin']}>
              <AdminPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/student-mapping"
          element={
            <ProtectedRoute allowedRoles={ADMIN_ROLES}>
              <StudentMappingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/course-enrollment"
          element={
            <ProtectedRoute allowedRoles={ADMIN_ROLES}>
              <CourseEnrollmentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/academic-structure"
          element={
            <ProtectedRoute allowedRoles={ADMIN_ROLES}>
              <AcademicAdministrationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/student-master"
          element={
            <ProtectedRoute allowedRoles={ADMIN_ROLES}>
              <StudentMasterPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const ThemedToaster = () => {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="top-right"
      toastOptions={{
        style: {
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          color: 'hsl(var(--card-foreground))',
        },
      }}
    />
  );
};

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <ThemedToaster />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
