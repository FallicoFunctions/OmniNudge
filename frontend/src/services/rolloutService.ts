/**
 * P0-028: Feature Rollout Strategy
 *
 * Gradual rollout system for feature flags.
 * Enables controlled rollout: 1% → 5% → 10% → 25% → 50% → 100%
 */

import { analyticsService } from './analyticsService';

export type RolloutPercentage = 1 | 5 | 10 | 25 | 50 | 100;

export interface RolloutConfig {
  featureName: string;
  rolloutPercentage: RolloutPercentage;
  enabledForUserIds?: number[];
  disabledForUserIds?: number[];
}

class RolloutService {
  /**
   * Check if a feature is enabled for a user based on rollout percentage
   * Uses consistent hashing to ensure same user always gets same result
   */
  isEnabledForUser(
    userId: number | string,
    featureName: string,
    rolloutPercentage: RolloutPercentage,
    enabledUserIds?: number[],
    disabledUserIds?: number[]
  ): boolean {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;

    // Check explicit lists first
    if (enabledUserIds && enabledUserIds.includes(userIdNum)) {
      this.trackRolloutDecision(featureName, true, 'explicit_enable');
      return true;
    }

    if (disabledUserIds && disabledUserIds.includes(userIdNum)) {
      this.trackRolloutDecision(featureName, false, 'explicit_disable');
      return false;
    }

    // Use consistent hashing for percentage-based rollout
    const hash = this.hashUserFeature(userIdNum, featureName);
    const bucket = hash % 100; // 0-99
    const enabled = bucket < rolloutPercentage;

    this.trackRolloutDecision(featureName, enabled, 'percentage_rollout', {
      bucket,
      rolloutPercentage,
    });

    return enabled;
  }

  /**
   * Hash function for consistent user-feature bucketing
   * Same user + feature will always produce same hash
   */
  private hashUserFeature(userId: number, featureName: string): number {
    const str = `${userId}:${featureName}`;
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash);
  }

  /**
   * Track rollout decisions for analytics
   */
  private trackRolloutDecision(
    featureName: string,
    enabled: boolean,
    reason: string,
    metadata?: Record<string, unknown>
  ) {
    if (import.meta.env.DEV) {
      console.log(`[Rollout] ${featureName}: ${enabled} (${reason})`, metadata);
    }

    // Track to analytics (if enabled)
    analyticsService.track('feature_rollout_evaluated', {
      feature: featureName,
      enabled,
      reason,
      ...metadata,
    });
  }

  /**
   * Get rollout bucket for a user (0-99)
   * Useful for debugging or showing users their rollout status
   */
  getUserBucket(userId: number | string, featureName: string): number {
    const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    const hash = this.hashUserFeature(userIdNum, featureName);
    return hash % 100;
  }

  /**
   * Helper to determine next rollout percentage
   */
  getNextRolloutStage(current: RolloutPercentage): RolloutPercentage | null {
    const stages: RolloutPercentage[] = [1, 5, 10, 25, 50, 100];
    const currentIndex = stages.indexOf(current);

    if (currentIndex === -1 || currentIndex === stages.length - 1) {
      return null; // Already at 100%
    }

    return stages[currentIndex + 1];
  }

  /**
   * Calculate expected user count for rollout percentage
   */
  estimateAffectedUsers(totalUsers: number, rolloutPercentage: RolloutPercentage): number {
    return Math.floor((totalUsers * rolloutPercentage) / 100);
  }
}

export const rolloutService = new RolloutService();
