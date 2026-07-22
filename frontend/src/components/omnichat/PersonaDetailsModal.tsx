import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { omnichatService } from '../../services/omnichatService';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import type { BotPersona } from '../../types/omnichat';

function ReadOnlyField({
  label,
  value,
  rows = 4,
  mono = false,
}: {
  label: string;
  value?: string | null;
  rows?: number;
  mono?: boolean;
}) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-medium text-[var(--color-text-primary)]">{label}</span>
      <textarea
        readOnly
        value={value || ''}
        rows={rows}
        className={`w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] ${
          mono ? 'font-mono text-xs' : ''
        }`}
      />
    </label>
  );
}

function ReadOnlyInput({ label, value }: { label: string; value?: string | null }) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-medium text-[var(--color-text-primary)]">{label}</span>
      <input
        readOnly
        type="text"
        value={value || ''}
        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
      />
    </label>
  );
}

function stringifyJSON(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value || {}, null, 2);
}

export default function PersonaDetailsModal({
  isOpen,
  onClose,
  persona,
  onDeleted,
}: {
  isOpen: boolean;
  onClose: () => void;
  persona: BotPersona;
  onDeleted?: (personaId: number) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const personaQuery = useQuery({
    queryKey: ['omnichat', 'persona-definition', persona.id],
    queryFn: () => omnichatService.getPersonaDefinition(persona.id),
    enabled: isOpen,
  });

  const deleteMutation = useMutation({
    mutationFn: (personaId: number) => omnichatService.deletePersona(personaId),
    onSuccess: async (_, personaId) => {
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'my-personas'] });
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'personas'] });
      await queryClient.invalidateQueries({ queryKey: ['omnichat', 'conversations'] });
      queryClient.removeQueries({ queryKey: ['omnichat', 'persona-definition', personaId] });
      setIsConfirmingDelete(false);
      onClose();
      onDeleted?.(personaId);
    },
  });

  const definition = personaQuery.data;
  const isOwner = !!definition?.owner_user_id && definition.owner_user_id === user?.id;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnOverlayClick
      className="w-full max-w-5xl rounded-3xl bg-[var(--color-background)] p-0 shadow-2xl"
      overlayClassName="bg-black/60 flex items-center justify-center"
    >
      <div className="max-h-[88vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-background)] px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              {t('omnichat.personaDetails.title')}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--color-text-primary)]">
              {persona.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
            aria-label="Close character form"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {personaQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--color-text-secondary)]">
              <Loader2 size={18} className="animate-spin" />
              {t('omnichat.personaDetails.loading')}
            </div>
          )}

          {personaQuery.isError && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {t('omnichat.personaDetails.loadError')}
            </div>
          )}

          {definition && (
            <>
              <div className="grid gap-4 md:grid-cols-[200px,1fr]">
                <div className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                  {definition.avatar_url ? (
                    <img
                      src={resolveMediaUrl(definition.avatar_url, definition.updated_at)}
                      alt={definition.name}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center text-sm text-[var(--color-text-secondary)]">
                      {t('omnichat.personaDetails.noAvatar')}
                    </div>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <ReadOnlyInput
                    label={t('omnichat.personaDetails.fields.name')}
                    value={definition.name}
                  />
                  <ReadOnlyInput
                    label={t('omnichat.personaDetails.fields.category')}
                    value={definition.category.replace('_', ' ')}
                  />
                  <ReadOnlyField
                    label={t('omnichat.personaDetails.fields.description')}
                    value={definition.description}
                    rows={3}
                  />
                  <div className="grid gap-4">
                    <ReadOnlyInput
                      label={t('omnichat.personaDetails.fields.visibility')}
                      value={definition.visibility || 'private'}
                    />
                    <ReadOnlyInput
                      label={t('omnichat.personaDetails.fields.nsfw')}
                      value={definition.is_nsfw ? t('common.yes') : t('common.no')}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ReadOnlyField
                  label={t('omnichat.personaDetails.fields.personality')}
                  value={definition.personality}
                  rows={5}
                />
                <ReadOnlyField
                  label={t('omnichat.personaDetails.fields.scenario')}
                  value={definition.scenario}
                  rows={5}
                />
                <ReadOnlyField
                  label={t('omnichat.personaDetails.fields.openingMessage')}
                  value={definition.first_message}
                  rows={4}
                />
                <ReadOnlyField
                  label={t('omnichat.personaDetails.fields.exampleDialogue')}
                  value={definition.example_dialogue}
                  rows={5}
                />
                <div className="md:col-span-2">
                  <ReadOnlyField
                    label={t('omnichat.personaDetails.fields.systemPrompt')}
                    value={definition.system_prompt}
                    rows={4}
                  />
                </div>
                <div className="md:col-span-2">
                  <ReadOnlyField
                    label={t('omnichat.personaDetails.fields.postHistoryInstructions')}
                    value={definition.post_history_instructions}
                    rows={4}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ReadOnlyField
                  label={t('omnichat.personaDetails.fields.alternateGreetings')}
                  value={(definition.alternate_greetings || []).join('\n')}
                  rows={4}
                />
                <ReadOnlyField
                  label={t('omnichat.personaDetails.fields.tags')}
                  value={(definition.tags || []).join(', ')}
                  rows={4}
                />
                <ReadOnlyInput
                  label={t('omnichat.personaDetails.fields.creatorName')}
                  value={definition.creator_name}
                />
                <ReadOnlyInput
                  label={t('omnichat.personaDetails.fields.characterVersion')}
                  value={definition.character_version}
                />
                <div className="md:col-span-2">
                  <ReadOnlyField
                    label={t('omnichat.personaDetails.fields.creatorNotes')}
                    value={definition.creator_notes}
                    rows={4}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ReadOnlyInput
                  label={t('omnichat.personaDetails.fields.avatarUrl')}
                  value={definition.avatar_url}
                />
                <ReadOnlyInput
                  label={t('omnichat.personaDetails.fields.previewVideoUrl')}
                  value={definition.preview_video_url}
                />
                <div className="md:col-span-2">
                  <ReadOnlyField
                    label={t('omnichat.personaDetails.fields.galleryUrls')}
                    value={(definition.gallery_urls || []).join('\n')}
                    rows={4}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ReadOnlyField
                  label={t('omnichat.personaDetails.fields.characterBookJson')}
                  value={stringifyJSON(definition.character_book_json)}
                  rows={8}
                  mono
                />
                <ReadOnlyField
                  label={t('omnichat.personaDetails.fields.extensionsJson')}
                  value={stringifyJSON(definition.extensions_json)}
                  rows={8}
                  mono
                />
              </div>

              {isOwner && (
                <div className="rounded-3xl border border-red-500/25 bg-red-500/10 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-red-200">
                        {t('omnichat.personaDetails.dangerZone.title')}
                      </h3>
                      <p className="mt-1 text-sm text-red-200/80">
                        {t('omnichat.personaDetails.dangerZone.description')}
                      </p>
                    </div>
                    {!isConfirmingDelete ? (
                      <button
                        type="button"
                        onClick={() => setIsConfirmingDelete(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-400/40 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/10"
                      >
                        <Trash2 size={16} />
                        {t('omnichat.personaDetails.dangerZone.delete')}
                      </button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsConfirmingDelete(false)}
                          disabled={deleteMutation.isPending}
                          className="rounded-2xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-primary)] disabled:opacity-60"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(persona.id)}
                          disabled={deleteMutation.isPending}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                          {t('omnichat.personaDetails.dangerZone.confirmDelete')}
                        </button>
                      </div>
                    )}
                  </div>
                  {deleteMutation.isError && (
                    <p className="mt-3 text-sm text-red-200">
                      {deleteMutation.error instanceof Error
                        ? deleteMutation.error.message
                        : t('omnichat.personaDetails.dangerZone.deleteError')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
