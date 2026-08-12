import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Brain, Loader2, Trash2, X } from 'lucide-react';
import { Modal } from '../common/Modal';
import { omnichatService, omnichatQueryKeys } from '../../services/omnichatService';
import type { OmniChatMemory } from '../../types/omnichat';

/**
 * Shows what a character has concluded about the user, and lets them take any
 * of it back.
 *
 * A user can always scroll up to see what they typed. Until this existed they
 * could not see what was inferred from it, which is the part that actually
 * shapes later replies. Each entry shows the turn it came from so a wrong
 * conclusion can be traced rather than just disputed.
 */
export default function MemoriesModal({
  isOpen,
  onClose,
  conversationId,
  personaName,
}: {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number | null;
  personaName: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: omnichatQueryKeys.conversationMemories(conversationId ?? 0),
    queryFn: () => omnichatService.listConversationMemories(conversationId as number),
    enabled: isOpen && typeof conversationId === 'number' && conversationId > 0,
  });

  const forget = useMutation({
    mutationFn: (memoryId: number) => omnichatService.forgetMemory(memoryId),
    onSuccess: () => {
      if (typeof conversationId === 'number') {
        void queryClient.invalidateQueries({
          queryKey: omnichatQueryKeys.conversationMemories(conversationId),
        });
      }
    },
  });

  // Hidden memories stay in the record but no longer influence replies, so the
  // list a user reviews should reflect what the character can still draw on.
  const memories = (data?.memories ?? []).filter(
    (memory: OmniChatMemory) => memory.status === 'active'
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnOverlayClick
      className="w-full max-w-2xl rounded-3xl bg-[var(--color-background)] p-0 shadow-2xl"
      overlayClassName="bg-black/60 flex items-center justify-center"
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-[var(--color-primary)]" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {t('omnichat.memories.title', { name: personaName })}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('omnichat.memories.close')}
          className="rounded-full p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          {t('omnichat.memories.description', { name: personaName })}
        </p>

        {isLoading && (
          <div className="flex items-center justify-center py-10 text-[var(--color-text-secondary)]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span className="ml-2 text-sm">{t('omnichat.memories.loading')}</span>
          </div>
        )}

        {isError && (
          <p role="alert" className="py-8 text-center text-sm text-[var(--color-error)]">
            {t('omnichat.memories.loadError')}
          </p>
        )}

        {!isLoading && !isError && memories.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
            {t('omnichat.memories.empty', { name: personaName })}
          </p>
        )}

        <ul className="space-y-3">
          {memories.map((memory) => (
            <li
              key={memory.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-medium text-[var(--color-text)]">{memory.title}</h3>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    {memory.summary}
                  </p>
                  <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                    {t('omnichat.memories.recordedAt', {
                      date: new Date(memory.recorded_at).toLocaleDateString(),
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => forget.mutate(memory.id)}
                  disabled={forget.isPending}
                  aria-label={t('omnichat.memories.forgetLabel', { title: memory.title })}
                  className="shrink-0 rounded-full p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-background)] hover:text-[var(--color-error)] disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {forget.isError && (
          <p role="alert" className="mt-3 text-sm text-[var(--color-error)]">
            {t('omnichat.memories.forgetFailed')}
          </p>
        )}
      </div>
    </Modal>
  );
}
