import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MOBILE_Z_INDEX, MOBILE_THRESHOLDS } from '../../constants/mobileDesignTokens';
import { lockScroll, unlockScroll } from '../../utils/scrollLock';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

/**
 * Bottom sheet modal component
 * Features:
 * - Slides up from bottom with animation
 * - Backdrop overlay (dismissible)
 * - Escape key to close
 * - Body scroll lock when open
 * - iOS safe area support
 * - Accessibility (ARIA attributes)
 *
 * ACCESSIBILITY WARNING:
 * Current implementation has basic focus management but does NOT include
 * full focus trapping. Keyboard users can Tab out of the sheet to elements
 * behind it. For production-grade accessibility, integrate react-focus-lock
 * or similar library to trap focus within the sheet while open.
 *
 * This limitation is acceptable for MVP but should be addressed before
 * WCAG AA compliance audits.
 */
export function BottomSheet({ isOpen, onClose, children, title }: BottomSheetProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef<number>(0);
  const touchStartScrollTopRef = useRef<number>(0);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      lockScroll();
      return () => unlockScroll();
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Focus management - move focus into sheet when opened
  useEffect(() => {
    if (isOpen && sheetRef.current) {
      const focusableElements = sheetRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }
  }, [isOpen]);

  // Swipe down to dismiss
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchStartScrollTopRef.current = sheetRef.current?.scrollTop || 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartYRef.current;
    const currentScrollTop = sheetRef.current?.scrollTop || 0;

    // Only allow swipe-to-dismiss when at top of sheet AND swiping down
    if (currentScrollTop === 0 && touchStartScrollTopRef.current === 0 && deltaY > MOBILE_THRESHOLDS.SWIPE_TO_DISMISS) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity duration-200"
        style={{ zIndex: MOBILE_Z_INDEX.BOTTOM_SHEET_BACKDROP }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        className="fixed bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto bg-[var(--color-surface)] rounded-t-2xl shadow-xl animate-slide-up"
        style={{
          zIndex: MOBILE_Z_INDEX.BOTTOM_SHEET,
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'bottom-sheet-title' : undefined}
      >
        {/* Header */}
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
            <h2 id="bottom-sheet-title" className="text-lg font-semibold text-[var(--color-text-primary)]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg active:bg-[var(--color-hover)] transition-colors"
              aria-label={t('ariaLabels.closeMenu')}
            >
              <X size={24} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="py-2">
          {children}
        </div>
      </div>
    </>
  );
}
