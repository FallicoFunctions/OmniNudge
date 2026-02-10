import { useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Users } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { trackEvent } from '../../utils/analytics';

interface CreateMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Bottom sheet for create actions
 * Includes: Create Post, Create Hub, Crosspost from Reddit
 */
export function CreateMenuSheet({ isOpen, onClose }: CreateMenuSheetProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Track sheet opens
  useEffect(() => {
    if (isOpen) {
      trackEvent('MobileNavigation', 'OpenCreateMenu');
    }
  }, [isOpen]);

  const handleNavigate = (path: string, label: string) => {
    trackEvent('MobileNavigation', 'CreateMenuClick', label);
    navigate(path);
    onClose();
  };

  const items = useMemo(() => [
    {
      icon: FileText,
      label: t('create.post'),
      onClick: () => handleNavigate('/posts/create', 'CreatePost'),
      testId: 'create-post-button'
    },
    {
      icon: Users,
      label: t('create.hub'),
      onClick: () => handleNavigate('/hubs/create', 'CreateHub'),
      testId: 'create-hub-button'
    }
  ], [t, handleNavigate]);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t('nav.create')}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          className="flex items-center w-full px-4 py-4 text-left active:bg-[var(--color-hover)] transition-colors"
          data-testid={item.testId}
        >
          <item.icon size={24} className="mr-3 text-[var(--color-text-secondary)]" />
          <span className="text-base font-medium text-[var(--color-text-primary)]">
            {item.label}
          </span>
        </button>
      ))}
    </BottomSheet>
  );
}
