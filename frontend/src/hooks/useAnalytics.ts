/**
 * P0-027: Analytics Hook
 *
 * React hook for tracking analytics events.
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { analyticsService } from '../services/analyticsService';

/**
 * Hook to automatically track page views
 */
export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    analyticsService.page(location.pathname + location.search, {
      path: location.pathname,
      search: location.search,
      hash: location.hash,
    });
  }, [location]);
}
