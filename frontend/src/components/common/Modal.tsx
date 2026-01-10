import type { ReactNode } from 'react';

type ModalProps = {
  isOpen: boolean;
  onClose?: () => void;
  children: ReactNode;
  overlayClassName?: string;
  className?: string;
  closeOnOverlayClick?: boolean;
};

export function Modal({
  isOpen,
  onClose,
  children,
  overlayClassName = 'bg-black/50',
  className = '',
  closeOnOverlayClick = false,
}: ModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 ${overlayClassName}`}
      onClick={
        closeOnOverlayClick
          ? () => {
              onClose?.();
            }
          : undefined
      }
    >
      <div
        className={className}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
}
