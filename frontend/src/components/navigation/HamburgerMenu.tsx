import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface MenuItem {
  label: string;
  to?: string;
  onClick?: () => void;
  badge?: number;
  icon?: React.ReactNode;
  className?: string;
}

interface HamburgerMenuProps {
  items: MenuItem[];
}

export function HamburgerMenu({ items }: HamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      {/* Hamburger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-md bg-[var(--color-surface-elevated)] px-2 py-1 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border)] transition-colors"
        aria-label="Menu"
        aria-expanded={isOpen}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg overflow-hidden z-50">
          {items.map((item, index) => {
            const content = (
              <div className="flex items-center justify-between w-full px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs text-white">
                    {item.badge}
                  </span>
                )}
              </div>
            );

            if (item.to) {
              return (
                <Link
                  key={index}
                  to={item.to}
                  onClick={() => setIsOpen(false)}
                  className={`block text-left text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-colors ${
                    item.className || ''
                  }`}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={index}
                type="button"
                onClick={() => {
                  item.onClick?.();
                  setIsOpen(false);
                }}
                className={`w-full text-left text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-colors ${
                  item.className || ''
                }`}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
