import type { ReactNode, ElementType } from 'react';

type PanelProps<T extends ElementType = 'div'> = {
  as?: T;
  className?: string;
  children: ReactNode;
};

export function Panel<T extends ElementType = 'div'>({
  as,
  className = '',
  children,
}: PanelProps<T>) {
  const Component = as ?? 'div';
  return (
    <Component className={`rounded-lg border border-border bg-surface p-6 ${className}`}>
      {children}
    </Component>
  );
}
