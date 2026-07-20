import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../../hooks/useDialogFocus';

type ModalProps = {
  isOpen: boolean;
  onClose?: () => void;
  children: ReactNode;
  overlayClassName?: string;
  className?: string;
  closeOnOverlayClick?: boolean;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  animation?: 'default' | 'quick-chat' | 'none';
  restoreFocusTo?: HTMLElement | null;
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
  animation = 'default',
  restoreFocusTo,
}: ModalProps) {
  const modalRef = useDialogFocus({ isActive: isOpen, onEscape: onClose, restoreFocusTo });

  if (!isOpen) return null;

  const overlayAnimationClass =
    animation === 'quick-chat'
      ? 'omnichat-quick-chat-overlay-enter'
      : animation === 'default'
        ? 'animate-fadeIn'
        : '';
  const dialogAnimationClass =
    animation === 'quick-chat' ? 'omnichat-quick-chat-dialog-enter' : '';

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 ${overlayClassName} ${overlayAnimationClass}`}
      style={animation === 'default' ? { animation: 'fadeIn 150ms ease-out' } : undefined}
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
        className={`outline-none ${dialogAnimationClass} ${className}`}
        style={animation === 'default' ? { animation: 'scaleIn 200ms ease-out' } : undefined}
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
