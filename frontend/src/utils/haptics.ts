import { MOBILE_HAPTICS } from '../constants/mobileDesignTokens';

/**
 * Haptic feedback utilities for mobile touch interfaces
 * Uses the Web Vibration API when available
 */

/**
 * Trigger a light haptic feedback
 * Used for: Tab taps, button presses, list item selection
 */
export function lightHaptic(): void {
  if (navigator.vibrate) {
    navigator.vibrate(MOBILE_HAPTICS.LIGHT);
  }
}

/**
 * Trigger a medium haptic feedback
 * Used for: Opening sheets, toggling switches, completing actions
 */
export function mediumHaptic(): void {
  if (navigator.vibrate) {
    navigator.vibrate(MOBILE_HAPTICS.MEDIUM);
  }
}

/**
 * Trigger a heavy haptic feedback
 * Used for: Errors, destructive actions, warnings
 */
export function heavyHaptic(): void {
  if (navigator.vibrate) {
    navigator.vibrate(MOBILE_HAPTICS.HEAVY);
  }
}

/**
 * Trigger a success haptic feedback (pattern)
 * Used for: Successful form submission, completed actions
 */
export function successHaptic(): void {
  if (navigator.vibrate) {
    navigator.vibrate([...MOBILE_HAPTICS.SUCCESS]);
  }
}
