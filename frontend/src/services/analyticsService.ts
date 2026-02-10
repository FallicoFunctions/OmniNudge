/**
 * P0-027: Analytics Service
 *
 * Frontend event tracking service.
 * Provider-agnostic - ready for Mixpanel, Amplitude, PostHog, or custom backend.
 */

export type EventName =
  // Authentication
  | 'user_signup'
  | 'user_login'
  | 'user_logout'
  // Content
  | 'post_created'
  | 'post_viewed'
  | 'comment_created'
  | 'vote_cast'
  // Messaging
  | 'message_sent'
  | 'conversation_started'
  // Engagement
  | 'hub_joined'
  | 'hub_created'
  | 'subreddit_subscribed'
  | 'search_performed'
  | 'feedback_submitted'
  // Settings
  | 'theme_changed'
  | 'language_changed'
  | 'notification_toggled'
  // Feature Rollout
  | 'feature_rollout_evaluated'
  // Errors
  | 'error_occurred';

export interface EventProperties {
  [key: string]: string | number | boolean | null | undefined;
}

export interface AnalyticsConfig {
  enabled: boolean;
  provider?: 'mixpanel' | 'amplitude' | 'posthog' | 'custom';
  apiKey?: string;
  debug?: boolean;
}

class AnalyticsService {
  private config: AnalyticsConfig = {
    enabled: false,
    debug: import.meta.env.DEV,
  };

  private queue: Array<{ event: EventName; properties?: EventProperties }> = [];

  /**
   * Initialize analytics with configuration
   */
  init(config: AnalyticsConfig) {
    this.config = { ...this.config, ...config };
    
    if (this.config.debug) {
      console.log('[Analytics] Initialized with config:', this.config);
    }

    // Flush queued events
    if (this.config.enabled && this.queue.length > 0) {
      this.queue.forEach(({ event, properties }) => this.track(event, properties));
      this.queue = [];
    }
  }

  /**
   * Track an event
   */
  track(event: EventName, properties?: EventProperties) {
    // Queue events if not initialized
    if (!this.config.enabled) {
      if (this.config.debug) {
        console.log('[Analytics] Event queued (not enabled):', event, properties);
      }
      this.queue.push({ event, properties });
      return;
    }

    // Debug logging
    if (this.config.debug) {
      console.log('[Analytics] Track:', event, properties);
    }

    // TODO: Integrate with provider when ready
    // switch (this.config.provider) {
    //   case 'mixpanel':
    //     mixpanel.track(event, properties);
    //     break;
    //   case 'amplitude':
    //     amplitude.track(event, properties);
    //     break;
    //   case 'posthog':
    //     posthog.capture(event, properties);
    //     break;
    //   case 'custom':
    //     // Send to custom backend endpoint
    //     break;
    // }
  }

  /**
   * Identify a user
   */
  identify(userId: string, traits?: EventProperties) {
    if (!this.config.enabled) return;

    if (this.config.debug) {
      console.log('[Analytics] Identify:', userId, traits);
    }

    // TODO: Integrate with provider
  }

  /**
   * Reset user identity (on logout)
   */
  reset() {
    if (!this.config.enabled) return;

    if (this.config.debug) {
      console.log('[Analytics] Reset');
    }

    // TODO: Integrate with provider
  }

  /**
   * Set user properties
   */
  setUserProperties(properties: EventProperties) {
    if (!this.config.enabled) return;

    if (this.config.debug) {
      console.log('[Analytics] Set user properties:', properties);
    }

    // TODO: Integrate with provider
  }

  /**
   * Track page view
   */
  page(path: string, properties?: EventProperties) {
    if (!this.config.enabled) return;

    if (this.config.debug) {
      console.log('[Analytics] Page view:', path, properties);
    }

    // TODO: Integrate with provider
  }
}

export const analyticsService = new AnalyticsService();
