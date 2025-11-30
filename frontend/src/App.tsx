import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import ThemesPage from './pages/ThemesPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected routes */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<HomePage />} />
            <Route path="/themes" element={<ThemesPage />} />
            {/* Placeholder routes for features we'll build */}
            <Route path="/reddit" element={<div className="p-8 text-center text-[var(--color-text-secondary)]">Reddit feed coming soon...</div>} />
            <Route path="/posts" element={<div className="p-8 text-center text-[var(--color-text-secondary)]">Posts feed coming soon...</div>} />
            <Route path="/messages" element={<div className="p-8 text-center text-[var(--color-text-secondary)]">Messages coming soon...</div>} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
