import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ClipboardList, Grid3x3, Target, Calculator, Upload, FileBarChart } from 'lucide-react';
import './App.css';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { Skeleton } from './components/ui/skeleton';
import LoginPage from './Pages/LoginPage';
import SignupPage from './Pages/SignupPage';

// Phase 8 — route-level lazy loading via React.lazy() for every page except Login/Signup
// (which are the first page most users see and are small enough to keep as eager imports).
const Dashboard = lazy(() => import('./Pages/Dashboard'));
const CoursesPage = lazy(() => import('./Pages/CoursesPage'));
const StudentsPage = lazy(() => import('./Pages/StudentsPage'));
const CoursePickerPage = lazy(() => import('./Pages/CoursePickerPage'));
const InternalMarksPage = lazy(() => import('./Pages/InternalMarksPage'));
const SettingsPage = lazy(() => import('./Pages/SettingsPage'));
const NotificationsPage = lazy(() => import('./Pages/NotificationsPage'));
const CourseWorkspace = lazy(() => import('./Pages/CourseWorkspace'));
const AdminPanel = lazy(() => import('./Pages/AdminPanel'));
const StudentMappingPage = lazy(() => import('./Pages/StudentMappingPage'));
const CourseEnrollmentPage = lazy(() => import('./Pages/CourseEnrollmentPage'));
const AcademicAdministrationPage = lazy(() => import('./Pages/AcademicAdministrationPage'));
const StudentMasterPage = lazy(() => import('./Pages/StudentMasterPage'));
const ProgramOutcomeManagement = lazy(() => import('./Pages/ProgramOutcomeManagement'));
const ProgramOBEDashboard = lazy(() => import('./Pages/ProgramOBEDashboard'));

const ADMIN_ROLES = ['Admin', 'School Admin', 'Department Admin'];

const PageFallback = () => (
  <div className="space-y-3">
    <Skeleton className="h-10 w-72" />
    <Skeleton className="h-96 rounded-2xl" />
  </div>
);

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Suspense fallback={<PageFallback />}>
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
          <Route
            path="/admin/program-outcomes"
            element={
              <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                <ProgramOutcomeManagement />
              </ProtectedRoute>
            }
          />
          <Route path="/obe-dashboard" element={<ProgramOBEDashboard />} />
        </Route>

        <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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
