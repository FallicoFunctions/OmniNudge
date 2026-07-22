import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import './i18n/config'; // Initialize i18n
import App from './App.tsx';
import { ThemeProvider } from './contexts/ThemeContext';
import ErrorBoundary from './ErrorBoundary';
import { getFirebaseMessagingWorkerRegistration } from './lib/firebaseMessagingWorker';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes - data considered fresh
      gcTime: 1000 * 60 * 30, // 30 minutes - keep in cache
      retry: 1, // Only retry failed requests once
      refetchOnWindowFocus: false, // Don't refetch on tab switch (better UX)
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void getFirebaseMessagingWorkerRegistration();
  });
}

if (!import.meta.env.PROD && 'serviceWorker' in navigator) {
  // In dev, ensure old SWs/caches do not serve stale bundles (Safari is sticky).
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister().catch(() => {
        // Ignore cleanup errors in dev.
      });
    });
  });

  if ('caches' in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        caches.delete(key).catch(() => {
          // Ignore cleanup errors in dev.
        });
      });
    });
  }
}
