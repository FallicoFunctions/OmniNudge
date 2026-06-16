import { v4 as uuidv4 } from 'uuid';
import { api } from '../lib/api';

/**
 * P0-027: Analytics Service
 *
 * Frontend event tracking service.
 * Connects to backend analytics endpoints and manages session lifecycle.
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
  // Settings
  | 'theme_changed'
  | 'language_changed'
  | 'notification_toggled'
  // Feature Rollout
  | 'feature_rollout_evaluated'
  | 'user_properties_updated'
  | 'page_view'
  // Errors
  | 'error_occurred';

export interface EventProperties {
  [key: string]: string | number | boolean | null | undefined | string[];
}

export interface AnalyticsConfig {
  enabled: boolean;
  debug?: boolean;
}

class AnalyticsService {
  private config: AnalyticsConfig = {
    enabled: true, // Default to true, respect user preferences elsewhere if needed
    debug: import.meta.env.DEV,
  };

  private anonymousId: string;
  private sessionId: string;
  private activeFlags: string[] = [];
  private queue: Array<{ event: EventName; properties?: EventProperties }> = [];
  private isInitialized = false;

  constructor() {
    this.anonymousId = this.getOrCreateAnonymousId();
    this.sessionId = this.startNewSession();
    this.setupSessionListeners();
  }

  /**
   * Initialize analytics with configuration
   */
  init(config: Partial<AnalyticsConfig>) {
    this.config = { ...this.config, ...config };
    this.isInitialized = true;

    if (this.config.debug) {
      console.log('[Analytics] Initialized:', {
        config: this.config,
        anonymousId: this.anonymousId,
        sessionId: this.sessionId,
      });
    }

    // Flush queued events
    if (this.config.enabled && this.queue.length > 0) {
      this.queue.forEach(({ event, properties }) => this.track(event, properties));
      this.queue = [];
    }
  }

  /**
   * Set currently active feature flags to be included in all events
   */
  setActiveFeatureFlags(flags: string[]) {
    this.activeFlags = flags;
    if (this.config.debug) {
      console.log('[Analytics] Active Flags Updated:', flags);
    }
  }

  /**
   * Track an event
   */
  async track(event: EventName, properties?: EventProperties) {
    if (!this.config.enabled) {
      if (this.config.debug) {
        console.log('[Analytics] Skipped (disabled):', event);
      }
      return;
    }

    if (!this.isInitialized) {
      this.queue.push({ event, properties });
      return;
    }

    const payload = {
      event,
      properties: {
        ...properties,
        active_flags: this.activeFlags,
      },
      anonymous_id: this.anonymousId,
      session_id: this.sessionId,
    };

    if (this.config.debug) {
      console.log('[Analytics] Track:', payload);
    }

    try {
      await api.post('/analytics/track', payload);
      // Update activity on track
      this.updateActivityTimestamp();
    } catch (error) {
      // Fail silently for analytics to avoid disrupting UX
      if (this.config.debug) {
        console.error('[Analytics] Failed to track event:', error);
      }
    }
  }

  /**
   * Identify a user (Alias anonymous ID to User ID)
   */
  async identify(userId: string, traits?: EventProperties) {
    if (!this.config.enabled) return;

    if (this.config.debug) {
      console.log('[Analytics] Identify:', userId, traits);
    }

    try {
      await api.post('/analytics/identify', {
        anonymous_id: this.anonymousId,
      });

      // Optionally track traits as a separate event or user property update
      if (traits) {
        this.setUserProperties(traits);
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('[Analytics] Failed to identify user:', error);
      }
    }
  }

  /**
   * Reset user identity (on logout)
   * We keep the anonymous ID but might want to rotate session
   */
  reset() {
    if (this.config.debug) {
      console.log('[Analytics] Reset');
    }
    // Rotate session on logout to separate authenticated from unauthenticated activity
    this.sessionId = this.startNewSession();
  }

  /**
   * Set user properties
   * (Currently just tracks a 'user_properties_updated' event for simplicity,
   * or could be expanded to a dedicated endpoint)
   */
  setUserProperties(properties: EventProperties) {
    // For now, tracking as an event. Ideally, use a dedicated endpoint if needed.
    this.track('user_properties_updated', properties);
  }

  /**
   * Track page view
   */
  page(path: string, properties?: EventProperties) {
    this.track('page_view', { ...properties, path });
  }

  // --- Session Management ---

  private getOrCreateAnonymousId(): string {
    const STORAGE_KEY = 'omni_analytics_aid';
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = uuidv4();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  private startNewSession(): string {
    const id = uuidv4();
    this.sessionId = id;
    this.startSessionBackend(id);
    return id;
  }

  private async startSessionBackend(sessionId: string) {
    try {
      this.updateActivityTimestamp();
      // Don't await this, let it happen in background
      api
        .post('/analytics/session/start', {
          session_id: sessionId,
          anonymous_id: this.anonymousId,
        })
        .catch((err) => {
          if (this.config.debug) console.warn('[Analytics] Failed to start session:', err);
        });
    } catch {
      // Ignore
    }
  }

  private updateActivityTimestamp() {
    localStorage.setItem('omni_analytics_last_active', Date.now().toString());
  }

  private setupSessionListeners() {
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    const checkSessionTimeout = () => {
      const lastActiveStr = localStorage.getItem('omni_analytics_last_active');
      if (lastActiveStr) {
        const lastActive = parseInt(lastActiveStr, 10);
        const now = Date.now();
        if (now - lastActive > SESSION_TIMEOUT_MS) {
          if (this.config.debug) console.log('[Analytics] Session timed out, starting new one');
          this.endSessionBackend(); // End old one if possible
          this.startNewSession(); // Start new one
        }
      }
      this.updateActivityTimestamp();
    };

    // Handle visibility change to end/resume sessions
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.endSessionBackend();
      } else {
        // Check if session expired and start new one
        checkSessionTimeout();
      }
    });

    // Update activity on user interactions to keep session alive
    const updateActivity = () => {
      this.updateActivityTimestamp();
    };
    // Debounce or just set it; localStorage is fast enough for low freq events
    // but maybe don't add too many listeners.
    // Just relying on track() and visibility change is often enough,
    // but adding a few key ones covers "reading" time.
    window.addEventListener('click', updateActivity);
    window.addEventListener('keydown', updateActivity);
  }

  private endSessionBackend() {
    // specific endpoint for ending session
    // utilizing beacon if possible in future, but for now standard fetch/api
    const data = { session_id: this.sessionId };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = `${import.meta.env.VITE_API_URL || '/api/v1'}/analytics/session/end`;

    // Use navigator.sendBeacon if available for reliable flush
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, blob);
    } else {
      // Fallback
      api.post('/analytics/session/end', data).catch(() => {});
    }
  }
}

export const analyticsService = new AnalyticsService();
