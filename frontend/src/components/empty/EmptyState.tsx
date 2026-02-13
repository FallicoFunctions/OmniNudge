import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Inbox,
  Search,
  AlertCircle,
  Lock,
  MessageSquare,
  Users,
  FileText,
  Image,
  Bell,
  type LucideIcon,
} from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className = '',
  children,
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-4 ${className}`}>
      {Icon && (
        <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mb-4">
          <Icon size={32} className="text-secondary" />
        </div>
      )}

      <h3 className="text-xl font-semibold mb-2">{title}</h3>

      {description && (
        <p className="text-secondary max-w-md mb-6">{description}</p>
      )}

      {children}

      {(action || secondaryAction) && (
        <div className="flex gap-3 mt-6">
          {action && (
            <button
              onClick={action.onClick}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-4 py-2 border border-border rounded hover:bg-secondary/10"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Pre-configured empty state variants
export function EmptyInbox({ onCompose }: { onCompose?: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={Inbox}
      title={t('emptyStates.inbox.title')}
      description={t('emptyStates.inbox.description')}
      action={
        onCompose
          ? { label: t('emptyStates.inbox.actions.newMessage'), onClick: onCompose }
          : undefined
      }
    />
  );
}

export function EmptySearchResults({ query }: { query?: string }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={Search}
      title={t('emptyStates.searchResults.title')}
      description={
        query
          ? t('emptyStates.searchResults.descriptionWithQuery', { query })
          : t('emptyStates.searchResults.descriptionNoQuery')
      }
    />
  );
}

export function EmptyNotifications() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={Bell}
      title={t('emptyStates.notifications.title')}
      description={t('emptyStates.notifications.description')}
    />
  );
}

export function EmptyConversations({ onCreate }: { onCreate?: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={MessageSquare}
      title={t('emptyStates.conversations.title')}
      description={t('emptyStates.conversations.description')}
      action={
        onCreate
          ? { label: t('emptyStates.conversations.actions.start'), onClick: onCreate }
          : undefined
      }
    />
  );
}

export function EmptyPosts({ onCreate }: { onCreate?: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={FileText}
      title={t('emptyStates.posts.title')}
      description={t('emptyStates.posts.description')}
      action={
        onCreate
          ? { label: t('emptyStates.posts.actions.create'), onClick: onCreate }
          : undefined
      }
    />
  );
}

export function EmptyGallery({ onUpload }: { onUpload?: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={Image}
      title={t('emptyStates.gallery.title')}
      description={t('emptyStates.gallery.description')}
      action={
        onUpload
          ? { label: t('emptyStates.gallery.actions.upload'), onClick: onUpload }
          : undefined
      }
    />
  );
}

export function EmptyMembers({ onInvite }: { onInvite?: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={Users}
      title={t('emptyStates.members.title')}
      description={t('emptyStates.members.description')}
      action={
        onInvite
          ? { label: t('emptyStates.members.actions.invite'), onClick: onInvite }
          : undefined
      }
    />
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('emptyStates.error.title');
  const resolvedDescription = description ?? t('emptyStates.error.description');
  return (
    <EmptyState
      icon={AlertCircle}
      title={resolvedTitle}
      description={resolvedDescription}
      action={
        onRetry ? { label: t('emptyStates.error.actions.tryAgain'), onClick: onRetry } : undefined
      }
    />
  );
}

export function PermissionDenied({
  resource,
  onRequestAccess,
}: {
  resource?: string;
  onRequestAccess?: () => void;
}) {
  const { t } = useTranslation();
  const resolvedResource = resource ?? t('emptyStates.permissionDenied.defaultResource');
  return (
    <EmptyState
      icon={Lock}
      title={t('emptyStates.permissionDenied.title')}
      description={t('emptyStates.permissionDenied.description', { resource: resolvedResource })}
      action={
        onRequestAccess
          ? { label: t('emptyStates.permissionDenied.actions.requestAccess'), onClick: onRequestAccess }
          : undefined
      }
    />
  );
}
