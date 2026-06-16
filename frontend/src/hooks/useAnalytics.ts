/**
 * P0-027: Analytics Hook
 *
 * React hook for tracking analytics events.
 */

import { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  analyticsService,
  type EventName,
  type EventProperties,
} from '../services/analyticsService';

export function useAnalytics() {
  const track = useCallback((event: EventName, properties?: EventProperties) => {
    analyticsService.track(event, properties);
  }, []);

  const identify = useCallback((userId: string, traits?: EventProperties) => {
    analyticsService.identify(userId, traits);
  }, []);

  const reset = useCallback(() => {
    analyticsService.reset();
  }, []);

  const setUserProperties = useCallback((properties: EventProperties) => {
    analyticsService.setUserProperties(properties);
  }, []);

  return {
    track,
    identify,
    reset,
    setUserProperties,
  };
}

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
