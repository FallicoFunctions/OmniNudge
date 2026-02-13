import { useState, useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MOBILE_TIMING, MOBILE_SIZES, MOBILE_HAPTICS } from '../../constants/mobileDesignTokens';

interface TabBarItemProps {
  icon: LucideIcon;
  translationKey: string;
  active: boolean;
  onClick: () => void;
  onLongPress?: () => void;
  badge?: number;
  testId?: string;
}

/**
 * Individual tab bar button
 * Features:
 * - Icon (24px)
 * - Label (12px, from i18n)
 * - Active state: primary color + 2px top border
 * - Inactive state: text-secondary
 * - Badge support (unread count)
 * - Touch optimized (no iOS 300ms delay)
 * - Smooth color transition (150ms)
 */
export function TabBarItem({
  icon: Icon,
  translationKey,
  active,
  onClick,
  onLongPress,
  badge,
  testId,
}: TabBarItemProps) {
  const { t } = useTranslation();
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const prevBadgeRef = useRef(badge);
  const longPressTimerRef = useRef<number | null>(null);

  const label = t(translationKey);
  const badgeLabel = badge && badge > 0 ? t('ariaLabels.unreadMessages', { count: badge }) : '';
  const longPressHint = onLongPress ? t('ariaLabels.longPressForMoreOptions') : '';
  const badgeSuffix = badgeLabel ? t('ariaLabels.tabBarItem.badgeSuffix', { badgeLabel }) : '';
  const longPressSuffix = longPressHint
    ? t('ariaLabels.tabBarItem.longPressSuffix', { longPressHint })
    : '';
  const ariaLabel = `${label}${badgeSuffix}${longPressSuffix}`;

  // Animate badge only when count changes
  useEffect(() => {
    if (badge && badge > 0 && prevBadgeRef.current !== badge) {
      setShouldAnimate(true);
      const timer = setTimeout(() => setShouldAnimate(false), MOBILE_TIMING.TAP_FEEDBACK);
      prevBadgeRef.current = badge;
      return () => clearTimeout(timer);
    }
    prevBadgeRef.current = badge;
  }, [badge]);

  // Long-press handling
  const handleTouchStart = () => {
    if (onLongPress) {
      longPressTimerRef.current = window.setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(MOBILE_HAPTICS.HEAVY);
        onLongPress();
      }, MOBILE_TIMING.LONG_PRESS);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`
        relative flex flex-1 flex-col items-center justify-center gap-1 py-2 px-1
        transition-colors duration-150
        active:bg-[var(--color-hover)]
        ${active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}
      `}
      style={{ touchAction: 'manipulation' }}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      data-testid={testId}
    >
      {/* Active indicator - 2px border at TOP of tab bar */}
      {active && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--color-primary)]" />
      )}

      {/* Icon with badge */}
      <div className="relative flex items-center justify-center w-6 h-6">
        <Icon size={MOBILE_SIZES.ICON_SIZE} strokeWidth={2} />

        {/* Badge - only rendered when count > 0 */}
        {badge && badge > 0 && (
          <span
            className={`absolute -top-1 -right-1 flex items-center justify-center px-1 text-[10px] font-semibold text-white bg-[var(--color-error)] rounded-full ${shouldAnimate ? 'animate-scale-in' : ''}`}
            style={{
              minWidth: `${MOBILE_SIZES.BADGE_SIZE}px`,
              height: `${MOBILE_SIZES.BADGE_SIZE}px`,
            }}
            aria-hidden="true"
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>

      {/* Label */}
      <span className={`text-xs leading-none ${active ? 'font-semibold' : 'font-medium'}`}>
        {label}
      </span>
    </button>
  );
}
