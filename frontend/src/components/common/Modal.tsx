import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ModalProps = {
  isOpen: boolean;
  onClose?: () => void;
  children: ReactNode;
  overlayClassName?: string;
  className?: string;
  closeOnOverlayClick?: boolean;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
};

export function Modal({
  isOpen,
  onClose,
  children,
  overlayClassName = 'bg-black/50', // Standard 50% overlay darkness (MODAL-2)
  className = '',
  closeOnOverlayClick = false,
  ariaLabelledBy,
  ariaDescribedBy,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus trap implementation (WCAG 2.4.3)
  useEffect(() => {
    if (!isOpen) return;

    // Store the element that was focused before modal opened
    previouslyFocusedElement.current = document.activeElement as HTMLElement;

    // Focus the modal container
    if (modalRef.current) {
      modalRef.current.focus();
    }

    // Handle keyboard navigation
    const handleKeyDown = (event: KeyboardEvent) => {
      // ESC key closes modal
      if (event.key === 'Escape' && onCloseRef.current) {
        onCloseRef.current();
        return;
      }

      // Tab key handling for focus trap
      if (event.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const focusableArray = Array.from(focusableElements);

        if (focusableArray.length === 0) {
          // No focusable elements, keep focus on modal container
          event.preventDefault();
          return;
        }

        const firstElement = focusableArray[0];
        const lastElement = focusableArray[focusableArray.length - 1];
        const activeElement = document.activeElement;

        // Shift+Tab: wrap to last element if on first or outside modal
        if (event.shiftKey) {
          if (activeElement === firstElement || !modalRef.current.contains(activeElement)) {
            event.preventDefault();
            lastElement.focus();
          }
        }
        // Tab: wrap to first element if on last or outside modal
        else {
          if (activeElement === lastElement || !modalRef.current.contains(activeElement)) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Cleanup: restore focus when modal closes
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocusedElement.current) {
        previouslyFocusedElement.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 ${overlayClassName} animate-fadeIn`}
      style={{
        animation: 'fadeIn 150ms ease-out',
      }}
      onClick={
        closeOnOverlayClick
          ? () => {
              onClose?.();
            }
          : undefined
      }
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`outline-none ${className}`}
        style={{
          animation: 'scaleIn 200ms ease-out',
        }}
        onClick={(event) => {
          event.stopPropagation();
        }}
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        role="dialog"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
