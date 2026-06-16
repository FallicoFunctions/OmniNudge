import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LoadingMessage, ErrorMessage } from '../common/StatusMessage';
import { EmptyState } from '../empty';
import type { HubModerator } from '../../types/hubSettings';
import { getHubModeratorRoleLabel } from '../../utils/moderation';

type HubModeratorsPanelProps = {
  moderators: HubModerator[];
  isLoading: boolean;
  isError: boolean;
  hubName?: string | null;
  onMessageMods?: () => void;
  showMessageButton?: boolean;
};

export default function HubModeratorsPanel({
  moderators,
  isLoading,
  isError,
  hubName,
  onMessageMods,
  showMessageButton = false,
}: HubModeratorsPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {t('hubModeratorsPanel.title')}
        </h3>
        {moderators.length > 0 && (
          <span className="text-xs text-[var(--color-text-secondary)]">{moderators.length}</span>
        )}
      </div>
      {isLoading ? (
        <LoadingMessage>{t('hubModeratorsPanel.loading')}</LoadingMessage>
      ) : isError ? (
        <ErrorMessage>{t('hubModeratorsPanel.errors.unableToLoad')}</ErrorMessage>
      ) : moderators.length === 0 ? (
        <EmptyState illustration="members" title={t('hubModeratorsPanel.empty')} className="py-6" />
      ) : (
        <ul className="mt-3 space-y-2">
          {moderators.map((moderator) => {
            const displayName =
              moderator.username ?? t('common.userNumber', { id: moderator.user_id });
            return (
              <li
                key={`${moderator.user_id}-${moderator.role}`}
                className="flex items-center gap-3"
              >
                {moderator.avatar_url ? (
                  <img
                    src={moderator.avatar_url}
                    alt={displayName}
                    className="h-8 w-8 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-border)] text-sm font-semibold text-[var(--color-text-secondary)]">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Link
                    to={`/users/${displayName}`}
                    className="text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
                  >
                    {displayName}
                  </Link>
                  <span className="text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                    {getHubModeratorRoleLabel(moderator.role, t)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {showMessageButton && hubName && onMessageMods && (
        <button
          onClick={onMessageMods}
          className="mt-4 w-full rounded-lg border border-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
        >
          {t('hubModeratorsPanel.actions.messageMods')}
        </button>
      )}
    </div>
  );
}
