/**
 * P0-012: Feature Flag Definitions
 *
 * Centralized list of all feature flags in the application.
 * Add new flags here when they're created in the backend.
 */

export const FEATURE_FLAGS = {
  // UI/UX Features
  NEW_MESSAGING_UI: 'new_messaging_ui',
  REDESIGNED_FEED: 'redesigned_feed',
  COMPACT_MODE: 'compact_mode',

  // Beta Features
  VOICE_CALLS: 'voice_calls',
  VIDEO_CALLS: 'video_calls',
  SCREEN_SHARE: 'screen_share',
  GROUP_CALLS: 'group_calls',

  // Performance Optimizations
  LAZY_LOAD_IMAGES: 'lazy_load_images',
  PREFETCH_POSTS: 'prefetch_posts',
  VIRTUAL_SCROLLING: 'virtual_scrolling',

  // Experimental Features
  AI_MODERATION: 'ai_moderation',
  SMART_RECOMMENDATIONS: 'smart_recommendations',
  COLLABORATIVE_FILTERING: 'collaborative_filtering',

  // Gradual Rollout Features
  NEW_SEARCH_ALGORITHM: 'new_search_algorithm',
  IMPROVED_CACHING: 'improved_caching',
  ENHANCED_NOTIFICATIONS: 'enhanced_notifications',
} as const;
