import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { hubsService } from '../services/hubsService';
import { useAuth } from '../contexts/AuthContext';
import { useHubDetails } from '../hooks/useHubDetails';
import { useHubModerators } from '../hooks/useHubModerators';
import { useHubSettings } from '../hooks/useHubSettings';
import { isUserHubModerator } from '../utils/moderation';
import { MarkdownRenderer } from '../components/common/MarkdownRenderer';
import { MarkdownInput } from '../components/common/MarkdownInput';
import { LoadingMessage, ErrorMessage } from '../components/common/StatusMessage';

export default function HubWikiPage() {
  const { t } = useTranslation();
  const { hubname, pagePath } = useParams<{ hubname: string; pagePath?: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const slug = pagePath && pagePath.trim() !== '' ? pagePath : 'index';
  const hub = hubname ?? '';

  const { data: hubDetails } = useHubDetails(hub, Boolean(hub));
  const { data: hubSettings } = useHubSettings(hub, Boolean(hub));
  const { moderators } = useHubModerators(hub, Boolean(hub));

  const isModerator = useMemo(
    () => isUserHubModerator(user, moderators, hubDetails),
    [user, moderators, hubDetails]
  );

  const {
    data: wikiPage,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['hub-wiki', hub, slug],
    queryFn: () => hubsService.getHubWikiPage(hub, slug),
    enabled: Boolean(hub),
    retry: false,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!wikiPage || isEditing) return;
    setDraft(wikiPage.content ?? '');
  }, [wikiPage, isEditing]);

  const updateMutation = useMutation({
    mutationFn: (content: string) => hubsService.updateHubWikiPage(hub, slug, content),
    onSuccess: (data) => {
      queryClient.setQueryData(['hub-wiki', hub, slug], data);
      setIsEditing(false);
    },
  });

  if (!hub) {
    return null;
  }

  if (hubSettings && !hubSettings.enable_wiki) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{t('hubWikiPage.title')}</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {t('hubWikiPage.wikiDisabled')}
        </p>
        <Link to={`/h/${hub}`} className="mt-4 inline-block text-sm text-[var(--color-primary)]">
          {t('hubWikiPage.actions.backToHub')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {t('hubWikiPage.headerTitle', { hub })}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {slug === 'index' ? t('hubWikiPage.subtitle.home') : t('hubWikiPage.subtitle.page', { slug })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/h/${hub}`}
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
          >
            {t('hubWikiPage.actions.backToHub')}
          </Link>
          {isModerator && !isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
            >
              {t('hubWikiPage.actions.editWiki')}
            </button>
          )}
        </div>
      </div>

      {isLoading && <LoadingMessage>{t('hubWikiPage.status.loading')}</LoadingMessage>}
      {isError && (
        <ErrorMessage>
          {error instanceof Error ? error.message : t('hubWikiPage.errors.unableToLoad')}
        </ErrorMessage>
      )}
      {!isLoading && !isError && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          {isEditing ? (
            <div className="space-y-4">
              <MarkdownInput
                label={t('hubWikiPage.editor.label')}
                value={draft}
                onChange={setDraft}
                placeholder={t('hubWikiPage.editor.placeholder')}
                rows={10}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateMutation.mutate(draft)}
                  disabled={updateMutation.isPending}
                  className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                >
                  {updateMutation.isPending ? t('hubWikiPage.status.saving') : t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(wikiPage?.content ?? '');
                    setIsEditing(false);
                  }}
                  className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <>
              {wikiPage?.content?.trim() ? (
                <MarkdownRenderer content={wikiPage.content} className="text-[var(--color-text-primary)]" />
              ) : (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {t('hubWikiPage.empty')}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
