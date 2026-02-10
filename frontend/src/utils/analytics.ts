/**
 * Analytics tracking utilities
 * Provides a simple interface for tracking user events
 * Can be extended to integrate with Google Analytics, Mixpanel, PostHog, etc.
 */

export interface AnalyticsEvent {
  category: string;
  action: string;
  label?: string;
  value?: number;
}

/**
 * Track a user event
 * @param category - Event category (e.g., 'Navigation', 'UserAction')
 * @param action - Event action (e.g., 'TabClick', 'ButtonClick')
 * @param label - Optional event label (e.g., 'HomeTab', 'CreatePost')
 * @param value - Optional numeric value
 */
export function trackEvent(
  category: string,
  action: string,
  label?: string,
  value?: number
): void {
  // Log in development for debugging
  if (import.meta.env.DEV) {
    console.log('[Analytics]', {
      category,
      action,
      label,
      value,
      timestamp: new Date().toISOString()
    });
  }

  // TODO: Integrate with analytics service
  // Example for Google Analytics:
  // if (typeof gtag !== 'undefined') {
  //   gtag('event', action, {
  //     event_category: category,
  //     event_label: label,
  //     value: value
  //   });
  // }

  // Example for Mixpanel:
  // if (typeof mixpanel !== 'undefined') {
  //   mixpanel.track(action, {
  //     category,
  //     label,
  //     value
  //   });
  // }
}

/**
 * Track a page view
 * @param path - Page path (e.g., '/home', '/messages')
 * @param title - Optional page title
 */
export function trackPageView(path: string, title?: string): void {
  if (import.meta.env.DEV) {
    console.log('[Analytics] PageView', { path, title });
  }

  // TODO: Integrate with analytics service
  // Example for Google Analytics:
  // if (typeof gtag !== 'undefined') {
  //   gtag('config', 'GA_MEASUREMENT_ID', {
  //     page_path: path,
  //     page_title: title
  //   });
  // }
}
