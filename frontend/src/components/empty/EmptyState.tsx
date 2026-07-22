import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox, Search, AlertCircle, Lock, MessageSquare, type LucideIcon } from 'lucide-react';

type EmptyStateIllustrationVariant =
  | 'noData'
  | 'noResults'
  | 'error'
  | 'permission'
  | 'messages'
  | 'posts'
  | 'media'
  | 'members'
  | 'notifications';

interface EmptyStateProps {
  icon?: LucideIcon;
  iconNode?: ReactNode;
  illustration?: EmptyStateIllustrationVariant;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  className?: string;
  children?: ReactNode;
}

function EmptyStateIllustration({
  variant,
  className = '',
}: {
  variant: EmptyStateIllustrationVariant;
  className?: string;
}) {
  switch (variant) {
    case 'noResults':
      return (
        <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
          <circle cx="60" cy="50" r="26" fill="var(--color-surface-elevated)" />
          <circle
            cx="60"
            cy="50"
            r="16"
            fill="none"
            stroke="var(--color-text-secondary)"
            strokeWidth="4"
          />
          <line
            x1="74"
            y1="64"
            x2="102"
            y2="92"
            stroke="var(--color-text-secondary)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <line
            x1="112"
            y1="24"
            x2="136"
            y2="24"
            stroke="var(--color-border)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <line
            x1="112"
            y1="40"
            x2="128"
            y2="40"
            stroke="var(--color-border)"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'error':
      return (
        <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
          <path d="M80 18l48 76H32z" fill="var(--color-error)" opacity="0.15" />
          <path d="M80 26l38 60H42z" fill="none" stroke="var(--color-error)" strokeWidth="4" />
          <line
            x1="80"
            y1="48"
            x2="80"
            y2="66"
            stroke="var(--color-error)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <circle cx="80" cy="77" r="4" fill="var(--color-error)" />
        </svg>
      );
    case 'permission':
      return (
        <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
          <rect x="36" y="42" width="88" height="46" rx="10" fill="var(--color-surface-elevated)" />
          <rect
            x="36"
            y="42"
            width="88"
            height="46"
            rx="10"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="4"
          />
          <path
            d="M56 42V32a24 24 0 0148 0v10"
            fill="none"
            stroke="var(--color-text-secondary)"
            strokeWidth="4"
          />
          <circle cx="80" cy="62" r="6" fill="var(--color-text-secondary)" />
          <line
            x1="80"
            y1="68"
            x2="80"
            y2="76"
            stroke="var(--color-text-secondary)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'messages':
      return (
        <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
          <rect x="26" y="24" width="68" height="42" rx="10" fill="var(--color-surface-elevated)" />
          <rect
            x="26"
            y="24"
            width="68"
            height="42"
            rx="10"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="4"
          />
          <path
            d="M52 66l-2 14 14-10"
            fill="var(--color-surface-elevated)"
            stroke="var(--color-border)"
            strokeWidth="4"
          />
          <rect x="76" y="44" width="58" height="34" rx="8" fill="var(--color-surface-elevated)" />
          <rect
            x="76"
            y="44"
            width="58"
            height="34"
            rx="8"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="4"
          />
        </svg>
      );
    case 'posts':
      return (
        <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
          <rect x="34" y="20" width="92" height="72" rx="10" fill="var(--color-surface-elevated)" />
          <rect
            x="34"
            y="20"
            width="92"
            height="72"
            rx="10"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="4"
          />
          <line
            x1="50"
            y1="40"
            x2="110"
            y2="40"
            stroke="var(--color-text-secondary)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <line
            x1="50"
            y1="56"
            x2="98"
            y2="56"
            stroke="var(--color-border)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <line
            x1="50"
            y1="72"
            x2="90"
            y2="72"
            stroke="var(--color-border)"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'media':
      return (
        <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
          <rect
            x="26"
            y="22"
            width="108"
            height="66"
            rx="10"
            fill="var(--color-surface-elevated)"
          />
          <rect
            x="26"
            y="22"
            width="108"
            height="66"
            rx="10"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="4"
          />
          <circle cx="54" cy="44" r="8" fill="var(--color-primary)" opacity="0.4" />
          <path
            d="M42 78l24-24 16 16 16-12 20 20"
            fill="none"
            stroke="var(--color-text-secondary)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'members':
      return (
        <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
          <circle cx="64" cy="42" r="14" fill="var(--color-surface-elevated)" />
          <circle cx="64" cy="42" r="14" fill="none" stroke="var(--color-border)" strokeWidth="4" />
          <circle cx="98" cy="46" r="11" fill="var(--color-surface-elevated)" />
          <circle cx="98" cy="46" r="11" fill="none" stroke="var(--color-border)" strokeWidth="4" />
          <path
            d="M42 86c6-16 38-16 44 0"
            fill="none"
            stroke="var(--color-text-secondary)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M88 84c5-12 27-12 32 0"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'notifications':
      return (
        <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
          <path
            d="M80 24c-14 0-24 10-24 24v16l-8 12h64l-8-12V48c0-14-10-24-24-24z"
            fill="var(--color-surface-elevated)"
          />
          <path
            d="M80 24c-14 0-24 10-24 24v16l-8 12h64l-8-12V48c0-14-10-24-24-24z"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="4"
          />
          <circle cx="80" cy="86" r="8" fill="var(--color-text-secondary)" />
          <circle cx="116" cy="28" r="10" fill="var(--color-primary)" opacity="0.6" />
        </svg>
      );
    case 'noData':
    default:
      return (
        <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
          <rect x="34" y="24" width="92" height="62" rx="10" fill="var(--color-surface-elevated)" />
          <rect
            x="34"
            y="24"
            width="92"
            height="62"
            rx="10"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="4"
          />
          <line
            x1="50"
            y1="44"
            x2="110"
            y2="44"
            stroke="var(--color-border)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <line
            x1="50"
            y1="60"
            x2="94"
            y2="60"
            stroke="var(--color-border)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx="118" cy="78" r="12" fill="var(--color-primary)" opacity="0.35" />
        </svg>
      );
  }
}

export function EmptyState({
  icon: Icon,
  iconNode,
  illustration,
  title,
  description,
  action,
  secondaryAction,
  className = '',
  children,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-10 text-center ${className}`}
    >
      {illustration ? (
        <EmptyStateIllustration variant={illustration} className="mb-3 h-28 w-40" />
      ) : iconNode ? (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface-elevated)]">
          {iconNode}
        </div>
      ) : (
        Icon && (
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface-elevated)]">
            <Icon size={32} className="text-[var(--color-text-secondary)]" />
          </div>
        )
      )}

      <h3 className="mb-2 text-xl font-semibold text-[var(--color-text-primary)]">{title}</h3>

      {description && (
        <p className="mb-6 max-w-md text-[var(--color-text-secondary)]">{description}</p>
      )}

      {children}

      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 transition hover:bg-[var(--color-surface-elevated)] disabled:cursor-not-allowed disabled:opacity-60"
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
      illustration="messages"
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
      illustration="noResults"
      title={t('emptyStates.searchResults.title')}
      description={
        query
          ? t('emptyStates.searchResults.descriptionWithQuery', { query })
          : t('emptyStates.searchResults.descriptionNoQuery')
      }
    />
  );
}

export function EmptyConversations({ onCreate }: { onCreate?: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={MessageSquare}
      illustration="messages"
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
      illustration="error"
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
      illustration="permission"
      title={t('emptyStates.permissionDenied.title')}
      description={t('emptyStates.permissionDenied.description', { resource: resolvedResource })}
      action={
        onRequestAccess
          ? {
              label: t('emptyStates.permissionDenied.actions.requestAccess'),
              onClick: onRequestAccess,
            }
          : undefined
      }
    />
  );
}
