import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardPage from './Pages/DashboardPage';
import LoginPage from './Pages/LoginPage';
import SignupPage from './Pages/SignupPage';
import Student from './Pages/student';
import SelectionPage from './Pages/SelectDetails';

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/select"
        element={
          <ProtectedRoute>
            <SelectionPage />
          </ProtectedRoute>
        }
        />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student"
        element={
          <ProtectedRoute>
            <Student />
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
