import { useTranslation } from 'react-i18next';
import { useFormat } from '../../hooks/useFormat';

export interface SystemMessageData {
  id: string | number;
  text: string;
  created_at: string;
}

interface SystemMessageProps {
  message: SystemMessageData;
}

/**
 * Displays a system-generated group event message (e.g. "Alice added Bob").
 * Centered, subdued, non-interactive.
 */
export function SystemMessage({ message }: SystemMessageProps) {
  const { formatDate } = useFormat();

  return (
    <div className="flex flex-col items-center py-2 px-4">
      <p className="text-xs text-[var(--color-text-muted)] italic text-center">
        {message.text}
      </p>
      <time
        dateTime={message.created_at}
        className="text-[10px] text-[var(--color-text-muted)] opacity-70 mt-0.5"
      >
        {formatDate(message.created_at, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
      </time>
    </div>
  );
}

/** Helper to build system message text for common group events */
export function buildSystemMessageText(
  type: string,
  actorName: string,
  targetName?: string,
  t?: (key: string, opts?: Record<string, unknown>) => string
): string {
  if (!t) return '';
  switch (type) {
    case 'member_added':
      return t('groups.systemMessages.memberAdded', { actor: actorName, target: targetName });
    case 'member_removed':
      return t('groups.systemMessages.memberRemoved', { actor: actorName, target: targetName });
    case 'user_left':
      return t('groups.systemMessages.userLeft', { actor: actorName });
    case 'role_changed':
      return t('groups.systemMessages.roleChanged', { actor: actorName, target: targetName });
    case 'group_updated':
      return t('groups.systemMessages.groupUpdated', { actor: actorName });
    case 'ownership_transferred':
      return t('groups.systemMessages.ownershipTransferred', { actor: actorName, target: targetName });
    default:
      return '';
  }
}
