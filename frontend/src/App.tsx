import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { authApi } from './api/auth';
import { useAuthStore } from './store/authStore';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { UploadPage } from './pages/UploadPage';
import { ForecastPage } from './pages/ForecastPage';
import { HistoryPage } from './pages/HistoryPage';
import { LoadingSpinner } from './components/ui/LoadingSpinner';

function AuthGuard({ children }: { children: ReactNode }) {
  const { token } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  const { token, setUser, logout } = useAuthStore();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (token) {
      authApi
        .me()
        .then(setUser)
        .catch(() => logout())
        .finally(() => setInitialized(true));
    } else {
      setInitialized(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={
            <AuthGuard>
              <DashboardPage />
            </AuthGuard>
          }
        />
        <Route
          path="/upload"
          element={
            <AuthGuard>
              <UploadPage />
            </AuthGuard>
          }
        />
        <Route
          path="/forecast"
          element={
            <AuthGuard>
              <ForecastPage />
            </AuthGuard>
          }
        />
        <Route
          path="/history"
          element={
            <AuthGuard>
              <HistoryPage />
            </AuthGuard>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
