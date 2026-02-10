import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { StatusMessage } from './common/StatusMessage';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  // Track if the user was ever authenticated in this component's lifetime.
  // Prevents firing the login modal when a user explicitly signs out.
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (isAuthenticated) {
      wasAuthenticated.current = true;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !wasAuthenticated.current) {
      window.dispatchEvent(new CustomEvent('open-auth-modal', {
        detail: { mode: 'login', redirectTo: location.pathname },
      }));
    }
  }, [isLoading, isAuthenticated, location.pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <StatusMessage>Loading...</StatusMessage>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
