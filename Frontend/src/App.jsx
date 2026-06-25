import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';

import DashboardPage from './Pages/DashboardPage';
import LoginPage from './Pages/LoginPage';
import SignupPage from './Pages/SignupPage';
import Student from './Pages/student';
import SelectionPage from './Pages/SelectDetails';
import QuestionSetup from './Pages/QuestionSetup';

// ERP Pages
import DepartmentsPage from './Pages/ERP/DepartmentsPage';
import ProgramsPage from './Pages/ERP/ProgramsPage';
import SemestersPage from './Pages/ERP/SemestersPage';
import ClassroomsPage from './Pages/ERP/ClassroomsPage';
import SubjectsPage from './Pages/ERP/SubjectsPage';
import StudentsPage from './Pages/ERP/StudentsPage';
import OBEMappingPage from './Pages/ERP/OBEMappingPage';
import AssessmentsPage from './Pages/ERP/AssessmentsPage';
import MarksEntryPage from './Pages/ERP/MarksEntryPage';
import AnalyticsReportsPage from './Pages/ERP/AnalyticsReportsPage';

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      
      {/* ERP Modules - Wrapped in DashboardLayout */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <DashboardPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/departments"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <DepartmentsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/programs"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <ProgramsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/semesters"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <SemestersPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <ClassroomsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/subjects"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <SubjectsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/students"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <StudentsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/obe"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <OBEMappingPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/assessments"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <AssessmentsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/grading"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <MarksEntryPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <AnalyticsReportsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Classic Calculator Flows (Wrapped in DashboardLayout to maintain theme consistency) */}
      <Route
        path="/select"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <SelectionPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/setup-questions"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <QuestionSetup />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Student />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
