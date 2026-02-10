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

export type FeatureFlagKey = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

/**
 * Feature flag metadata for documentation
 */
export const FEATURE_FLAG_METADATA: Record<string, { description: string; owner: string }> = {
  [FEATURE_FLAGS.NEW_MESSAGING_UI]: {
    description: 'New messaging interface with improved UX',
    owner: 'product-team',
  },
  [FEATURE_FLAGS.VOICE_CALLS]: {
    description: '1-on-1 voice calling feature',
    owner: 'engineering-team',
  },
  [FEATURE_FLAGS.VIDEO_CALLS]: {
    description: '1-on-1 video calling feature',
    owner: 'engineering-team',
  },
  [FEATURE_FLAGS.AI_MODERATION]: {
    description: 'AI-powered content moderation',
    owner: 'trust-safety-team',
  },
  [FEATURE_FLAGS.LAZY_LOAD_IMAGES]: {
    description: 'Defer image loading for better performance',
    owner: 'performance-team',
  },
  [FEATURE_FLAGS.NEW_SEARCH_ALGORITHM]: {
    description: 'Improved search relevance algorithm',
    owner: 'search-team',
  },
};
