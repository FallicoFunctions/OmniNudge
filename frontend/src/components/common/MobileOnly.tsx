import type { ReactNode } from 'react';

interface MobileOnlyProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper component that shows content only on mobile devices (< lg breakpoint).
 * Hidden on desktop (≥ 1024px).
 */
export function MobileOnly({ children, className = '' }: MobileOnlyProps) {
  return <div className={`block w-full lg:hidden ${className}`}>{children}</div>;
}
