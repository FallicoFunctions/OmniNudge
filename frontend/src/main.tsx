import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { i18nReady } from './i18n/config';
import App from './App.tsx';
import { ThemeProvider } from './contexts/ThemeContext';
import ErrorBoundary from './ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes - data considered fresh
      gcTime: 1000 * 60 * 30,    // 30 minutes - keep in cache
      retry: 1,                  // Only retry failed requests once
      refetchOnWindowFocus: false, // Don't refetch on tab switch (better UX)
    },
  },
});

async function mountApp(): Promise<void> {
  try {
    // The first render contains translated loading fallbacks. Waiting for the
    // locale namespace prevents a visible key flash and false missing-key
    // warnings during normal startup.
    await i18nReady;
  } catch (error) {
    // i18next can still serve fallback keys after a backend load failure; do
    // not turn a locale outage into a blank application shell.
    console.error('[i18n] Initialization failed; rendering with fallbacks.', error);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

void mountApp();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // EMERGENCY FIX: Unregister all service workers and clear caches
    // This fixes module import errors caused by stale service worker caches
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });

    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    }

    // Service worker registration temporarily disabled
    // Will re-enable after fixing cache invalidation strategy

    // Register Firebase Cloud Messaging service worker (still needed for notifications)
    setTimeout(() => {
      navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => {
        // Ignore registration errors to avoid blocking app load.
      });
    }, 2000); // Delay to ensure unregistration completes
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
