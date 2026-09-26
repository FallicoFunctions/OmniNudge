import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import OmniChatShell from '../components/omnichat/OmniChatShell';
import PersonaAvatar from '../components/omnichat/PersonaAvatar';
import { useOmniChatNavigation } from '../components/omnichat/useOmniChatNavigation';
import { Modal } from '../components/common/Modal';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { useAuth } from '../contexts/AuthContext';
import { omnichatService } from '../services/omnichatService';
import type { BotPersona } from '../types/omnichat';

export default function OmniChatStudioPage() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authIsLoading } = useAuth();
  const navigate = useNavigate();
  const onTabChange = useOmniChatNavigation();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<BotPersona | null>(null);

  const personasQuery = useQuery({
    queryKey: ['omnichat', 'my-personas'],
    queryFn: () => omnichatService.listMyPersonas(),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (authIsLoading || isAuthenticated) return;
    window.dispatchEvent(
      new CustomEvent('open-auth-modal', {
        detail: { mode: 'login', redirectTo: '/omnichat/studio' },
      })
    );
    navigate('/omnichat', { replace: true });
  }, [authIsLoading, isAuthenticated, navigate]);

  const startChatMutation = useMutation({
    mutationFn: (personaId: number) =>
      omnichatService.createConversation(personaId, undefined, true),
    onSuccess: (conversation) => navigate(`/omnichat/c/${conversation.id}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (personaId: number) => omnichatService.deletePersona(personaId),
    onSuccess: async (_, personaId) => {
      setDeleteTarget(null);
      queryClient.setQueryData<BotPersona[]>(['omnichat', 'my-personas'], (personas) =>
        personas?.filter((persona) => persona.id !== personaId)
      );
      queryClient.removeQueries({ queryKey: ['omnichat', 'persona-definition', personaId] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['omnichat', 'my-personas'] }),
        queryClient.invalidateQueries({ queryKey: ['omnichat', 'personas'] }),
        queryClient.invalidateQueries({ queryKey: ['omnichat', 'conversations'] }),
      ]);
    },
  });

  const closeDelete = () => {
    if (!deleteMutation.isPending) setDeleteTarget(null);
  };

  if (!authIsLoading && !isAuthenticated) return null;

  return (
    <OmniChatShell activeTab="characters" onTabChange={onTabChange}>
      <div className="min-h-[calc(100dvh-72px)] bg-[var(--color-background)]">
        <div className="mx-auto max-w-[1400px] px-6 pb-8 pt-20 lg:px-10 lg:pt-8">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
                {t('omnichat.studio.title')}
              </h1>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                {t('omnichat.studio.description')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/omnichat/new-roleplay')}
              disabled={authIsLoading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              <Plus size={16} />
              {t('omnichat.studio.actions.createRoleplay')}
            </button>
          </div>

          {(authIsLoading || personasQuery.isLoading) && (
            <LoadingMessage>{t('omnichat.studio.loadingPersonas')}</LoadingMessage>
          )}
          {personasQuery.isError && (
            <ErrorMessage>{t('omnichat.studio.loadPersonasError')}</ErrorMessage>
          )}
          {startChatMutation.isError && (
            <ErrorMessage>{t('omnichat.studio.openChatError')}</ErrorMessage>
          )}
          {!authIsLoading && personasQuery.isSuccess && personasQuery.data.length === 0 && (
            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-8 text-center text-sm text-[var(--color-text-secondary)]">
              {t('omnichat.studio.empty')}
            </div>
          )}

          {!authIsLoading && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {(personasQuery.data ?? []).map((persona) => (
                <article
                  key={persona.id}
                  aria-label={persona.name}
                  className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
                >
                  <PersonaAvatar
                    persona={persona}
                    className="aspect-[4/5] w-full !rounded-none [&_img]:object-top"
                    hideOverlay
                  />
                  <div className="p-4">
                    <h2 className="truncate text-lg font-semibold text-[var(--color-text-primary)]">
                      {persona.name}
                    </h2>
                    {persona.description && (
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                        {persona.description}
                      </p>
                    )}
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startChatMutation.mutate(persona.id)}
                        disabled={startChatMutation.isPending}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-3 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-60"
                      >
                        <MessageSquare size={16} />
                        {startChatMutation.isPending && startChatMutation.variables === persona.id
                          ? t('omnichat.studio.actions.openingChat')
                          : t('omnichat.studio.actions.openChat')}
                      </button>
                      <button
                        type="button"
                        aria-label={t('omnichat.studio.actions.deleteNamed', {
                          name: persona.name,
                        })}
                        onClick={() => {
                          deleteMutation.reset();
                          setDeleteTarget(persona);
                        }}
                        disabled={deleteMutation.isPending}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/25 px-3 py-2.5 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
                      >
                        <Trash2 size={16} />
                        {t('omnichat.studio.actions.delete')}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={deleteTarget !== null}
        onClose={closeDelete}
        closeOnOverlayClick
        ariaLabelledBy="omnichat-delete-character-title"
        ariaDescribedBy="omnichat-delete-character-description"
        ariaBusy={deleteMutation.isPending}
        className="w-full max-w-md rounded-3xl bg-[var(--color-background)] p-6 shadow-2xl"
        overlayClassName="bg-black/60"
      >
        <h3
          id="omnichat-delete-character-title"
          className="text-lg font-semibold text-[var(--color-text-primary)]"
        >
          {t('omnichat.studio.deleteModal.title')}
        </h3>
        <p
          id="omnichat-delete-character-description"
          className="mt-2 text-sm text-[var(--color-text-secondary)]"
        >
          {deleteTarget?.response_style_profile === 'direct_message'
            ? t('omnichat.personaDetails.dangerZone.omniaiDescription')
            : t('omnichat.studio.deleteModal.descriptionNamed', { name: deleteTarget?.name })}
        </p>
        {deleteMutation.isError && (
          <ErrorMessage>{t('omnichat.studio.deleteModal.error')}</ErrorMessage>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeDelete}
            disabled={deleteMutation.isPending}
            className="rounded-2xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-primary)] disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
            }}
            disabled={deleteMutation.isPending || !deleteTarget}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            <Trash2 size={16} />
            {t('omnichat.studio.deleteModal.confirm')}
          </button>
        </div>
      </Modal>
    </OmniChatShell>
  );
}
