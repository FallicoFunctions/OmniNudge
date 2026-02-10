/**
 * Mobile Design Tokens
 * Centralized constants for mobile UI to eliminate magic numbers
 * and maintain consistency across mobile components
 */

export const MOBILE_Z_INDEX = {
  /** Main tab bar at bottom of screen */
  TAB_BAR: 50,
  /** About modal and similar overlays */
  MODAL: 60,
  /** Bottom sheet backdrop (dimmed overlay) */
  BOTTOM_SHEET_BACKDROP: 80,
  /** Bottom sheet content */
  BOTTOM_SHEET: 90,
  /** Loading bar at top of screen */
  LOADING_BAR: 100,
} as const;

export const MOBILE_TIMING = {
  /** Tap feedback animation duration (ms) */
  TAP_FEEDBACK: 150,
  /** Bottom sheet slide animation duration (ms) */
  SHEET_ANIMATION: 250,
  /** Loading bar display duration (ms) */
  LOADING_BAR: 400,
  /** Long-press activation threshold (ms) */
  LONG_PRESS: 500,
} as const;

export const MOBILE_SIZES = {
  /** Height of bottom tab bar (px) */
  TAB_BAR_HEIGHT: 56,
  /** Standard icon size in tab bar (px) */
  ICON_SIZE: 24,
  /** Badge size for notifications (px) */
  BADGE_SIZE: 18,
} as const;

export const MOBILE_THRESHOLDS = {
  /** Swipe distance to trigger dismiss (px) */
  SWIPE_TO_DISMISS: 100,
  /** Breakpoint for mobile view (px) */
  MOBILE_BREAKPOINT: 767,
} as const;

export const MOBILE_HAPTICS = {
  /** Light haptic feedback duration (ms) */
  LIGHT: 10,
  /** Medium haptic feedback duration (ms) */
  MEDIUM: 15,
  /** Heavy haptic feedback duration (ms) */
  HEAVY: 20,
  /** Success haptic pattern [vibrate, pause, vibrate] (ms) */
  SUCCESS: [10, 50, 10],
} as const;
