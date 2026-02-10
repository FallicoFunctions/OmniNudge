/**
 * Coordinated body scroll lock with reference counting.
 *
 * Multiple components (BottomSheet, AuthModal, etc.) can request a scroll lock
 * independently. The body is locked when the first consumer calls lockScroll()
 * and restored only when the last consumer calls unlockScroll(). This prevents
 * the "nested modal" bug where the inner modal's cleanup restores 'hidden'
 * after the outer modal already restored ''.
 */

let lockCount = 0;
let originalOverflow = '';

export function lockScroll(): void {
  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount++;
}

export function unlockScroll(): void {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow;
    originalOverflow = '';
  }
}
