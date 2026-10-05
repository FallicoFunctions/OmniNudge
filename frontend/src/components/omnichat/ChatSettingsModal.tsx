import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Brain,
  Copy,
  History,
  Loader2,
  MessageSquare,
  Save,
  ArrowRight,
  ScrollText,
  Trash2,
  X,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import PersonaDetailsModal from './PersonaDetailsModal';
import MemoriesModal from './MemoriesModal';
import { omnichatService, omnichatQueryKeys } from '../../services/omnichatService';
import { saveOmniChatDefaults } from '../../utils/omnichatDefaults';
import { getOmniChatPreviewText } from '../../utils/omnichatMessageFormatting';
import { useAuth } from '../../contexts/AuthContext';
import type { BotPersona, ConversationSettings } from '../../types/omnichat';

export default function ChatSettingsModal({
  isOpen,
  onClose,
  conversationId,
  persona,
  currentSettings,
}: {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number | null;
  persona: BotPersona;
  currentSettings?: ConversationSettings;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const [name, setName] = useState(currentSettings?.user_name ?? '');
  const [age, setAge] = useState(currentSettings?.user_age ?? '');
  const [gender, setGender] = useState(currentSettings?.user_gender ?? '');
  const [localSaveSuccess, setLocalSaveSuccess] = useState(false);
  const [flippedId, setFlippedId] = useState<number | null>(null);
  const [slidingOutId, setSlidingOutId] = useState<number | null>(null);
  const [isPersonaDetailsOpen, setIsPersonaDetailsOpen] = useState(false);
  const [isMemoriesOpen, setIsMemoriesOpen] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const deletionTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (deletionTimerRef.current !== null) {
        window.clearTimeout(deletionTimerRef.current);
      }
    },
    []
  );

  // Sync form state with currentSettings when modal opens or conversation changes
  useEffect(() => {
    if (isOpen) {
      setName(currentSettings?.user_name ?? '');
      setAge(currentSettings?.user_age ?? '');
      setGender(currentSettings?.user_gender ?? '');
    }
  }, [isOpen, currentSettings]);

  const historyQuery = useQuery({
    queryKey: [...omnichatQueryKeys.conversations, 'persona', persona.id],
    queryFn: () => omnichatService.listConversations(persona.id),
    enabled: isOpen && conversationId !== null,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (settings: ConversationSettings) =>
      omnichatService.updateSettings(conversationId as number, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: omnichatQueryKeys.conversation(conversationId as number),
      });
    },
  });

  const forkMutation = useMutation({
    mutationFn: () => omnichatService.forkConversation(conversationId as number),
    onSuccess: (newConv) => {
      queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
      navigate(`/omnichat/c/${newConv.id}`);
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (convId: number) => omnichatService.deleteConversation(convId),
    onMutate: () => setDeleteError(false),
    onSuccess: (_data, convId) => {
      setFlippedId(null);
      setSlidingOutId(convId);
      if (deletionTimerRef.current !== null) {
        window.clearTimeout(deletionTimerRef.current);
      }
      deletionTimerRef.current = window.setTimeout(() => {
        setSlidingOutId(null);
        void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
        void queryClient.invalidateQueries({
          queryKey: [...omnichatQueryKeys.conversations, 'persona', persona.id],
        });
        deletionTimerRef.current = null;
      }, 300);
    },
    onError: () => setDeleteError(true),
  });

  const handleSave = () => {
    const settings: ConversationSettings = { user_name: name, user_age: age, user_gender: gender };
    if (conversationId === null) {
      saveOmniChatDefaults(settings, 'guest');
      setLocalSaveSuccess(true);
    } else {
      updateSettingsMutation.mutate(settings);
    }
  };

  const otherConversations = (historyQuery.data ?? []).filter((c) => c.id !== conversationId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnOverlayClick
      className="w-full max-w-lg rounded-2xl bg-background p-0 shadow-2xl"
      overlayClassName="bg-black/50 flex items-center justify-center"
    >
      <div className="max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <h2 className="text-lg font-bold text-text-primary">{t('omnichat.chat.settings')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-(--color-text-muted) hover:bg-(--color-surface-hover) hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-4">
          {/* Settings form */}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                {t('omnichat.chat.settingsName')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-(--color-text-muted) focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                {t('omnichat.chat.settingsAge')}
              </label>
              <input
                type="text"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-(--color-text-muted) focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                {t('omnichat.chat.settingsGender')}
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20"
              >
                <option value="">{t('omnichat.chat.settingsGenderN')}</option>
                <option value="M">{t('omnichat.chat.settingsGenderM')}</option>
                <option value="F">{t('omnichat.chat.settingsGenderF')}</option>
                <option value="T">{t('omnichat.chat.settingsGenderT')}</option>
                <option value="A">{t('omnichat.chat.settingsGenderA')}</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={updateSettingsMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {updateSettingsMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              {t('omnichat.chat.settingsSave')}
            </button>

            {(updateSettingsMutation.isSuccess || localSaveSuccess) && (
              <p className="text-center text-xs text-green-500">
                {t('omnichat.chat.settingsSaved')}
              </p>
            )}
            {updateSettingsMutation.isError && (
              <p className="text-center text-xs text-red-500">
                {t('omnichat.chat.settingsSaveError')}
              </p>
            )}
          </div>

          <div className="border-t border-border" />

          <div>
            <button
              type="button"
              onClick={() => setIsPersonaDetailsOpen(true)}
              className="flex w-full items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left text-sm hover:bg-(--color-surface-hover)"
            >
              <ScrollText size={18} className="text-text-secondary" />
              <div className="flex-1">
                <p className="font-medium text-text-primary">
                  {t('omnichat.chat.viewCharacterForm')}
                </p>
                <p className="text-xs text-(--color-text-muted)">
                  {t('omnichat.chat.viewCharacterFormDescription')}
                </p>
              </div>
              <ArrowRight size={16} className="text-text-secondary" />
            </button>
          </div>

          {conversationId !== null && (
            <div>
              <button
                type="button"
                onClick={() => setIsMemoriesOpen(true)}
                className="flex w-full items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left text-sm hover:bg-(--color-surface-hover)"
              >
                <Brain size={18} className="text-text-secondary" />
                <div className="flex-1">
                  <p className="font-medium text-text-primary">
                    {t('omnichat.memories.title', { name: persona.name })}
                  </p>
                  <p className="text-xs text-(--color-text-muted)">
                    {t('omnichat.memories.entryDescription')}
                  </p>
                </div>
                <ArrowRight size={16} className="text-text-secondary" />
              </button>
            </div>
          )}

          {conversationId !== null && (
            <>
              <div className="border-t border-border" />

              <div>
                <button
                  type="button"
                  onClick={() => forkMutation.mutate()}
                  disabled={forkMutation.isPending}
                  className="flex w-full items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left text-sm hover:bg-(--color-surface-hover) disabled:opacity-50"
                >
                  <Copy size={18} className="text-text-secondary" />
                  <div className="flex-1">
                    <p className="font-medium text-text-primary">{t('omnichat.chat.forkChat')}</p>
                    <p className="text-xs text-(--color-text-muted)">
                      {t('omnichat.chat.forkChatDesc')}
                    </p>
                  </div>
                  {forkMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin text-text-secondary" />
                  ) : (
                    <ArrowRight size={16} className="text-text-secondary" />
                  )}
                </button>
              </div>

              <div className="border-t border-border" />

              <div>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <History size={16} />
                  {t('omnichat.chat.history')}
                </h3>

                {historyQuery.isLoading && (
                  <div className="flex justify-center py-4">
                    <Loader2 size={20} className="animate-spin text-(--color-text-muted)" />
                  </div>
                )}

                {historyQuery.isError && (
                  <p className="text-xs text-red-500">{t('omnichat.chat.historyLoadError')}</p>
                )}
                {deleteError && (
                  <p role="alert" className="mt-2 text-xs text-red-500">
                    {t('omnichat.chat.historyDeleteError')}
                  </p>
                )}

                {historyQuery.isSuccess && otherConversations.length === 0 && (
                  <p className="py-4 text-center text-xs text-(--color-text-muted)">
                    {t('omnichat.chat.historyEmpty')}
                  </p>
                )}

                {otherConversations.length > 0 && (
                  <ul className="space-y-2 overflow-hidden">
                    {otherConversations.map((conv) => (
                      <li
                        key={conv.id}
                        className={
                          slidingOutId === conv.id
                            ? 'transition-all duration-300 -translate-x-full opacity-0'
                            : ''
                        }
                      >
                        <div style={{ perspective: '1000px' }}>
                          <div
                            className="relative w-full transition-transform duration-500 ease-in-out"
                            style={{
                              transformStyle: 'preserve-3d',
                              transform:
                                flippedId === conv.id ? 'rotateX(-180deg)' : 'rotateX(0deg)',
                            }}
                          >
                            {/* Front face */}
                            <div
                              className="flex w-full items-stretch rounded-md border border-border text-left text-sm"
                              style={{ backfaceVisibility: 'hidden' }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  navigate(`/omnichat/c/${conv.id}`);
                                  onClose();
                                }}
                                className="group/left flex min-w-0 flex-1 items-center gap-3 rounded-l-md px-3 py-2 hover:bg-(--color-surface-hover)"
                              >
                                <MessageSquare
                                  size={16}
                                  className="shrink-0 text-(--color-text-muted) group-hover/left:text-primary"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium text-text-primary group-hover/left:text-primary">
                                    {conv.last_message_preview
                                      ? getOmniChatPreviewText(conv.last_message_preview)
                                      : (conv.title ?? persona.name)}
                                  </p>
                                  <p className="truncate text-xs text-(--color-text-muted) group-hover/left:text-primary">
                                    {conv.last_message_preview
                                      ? formatRelativeTime(conv.last_message_at)
                                      : (conv.title ?? persona.name)}
                                  </p>
                                </div>
                                <ArrowRight
                                  size={14}
                                  className="shrink-0 text-(--color-text-muted) group-hover/left:text-primary"
                                />
                              </button>
                              <div className="h-4 w-px self-center bg-border" />
                              <button
                                type="button"
                                onClick={() => setFlippedId(conv.id)}
                                className="group flex items-center rounded-r-md px-3 py-2"
                              >
                                {deleteMutation.isPending &&
                                deleteMutation.variables === conv.id ? (
                                  <Loader2
                                    size={14}
                                    className="animate-spin text-(--color-text-muted)"
                                  />
                                ) : (
                                  <Trash2
                                    size={14}
                                    className="text-(--color-text-muted) group-hover:text-red-500"
                                  />
                                )}
                              </button>
                            </div>

                            {/* Back face */}
                            <div
                              className="absolute inset-0 flex items-center justify-center gap-3 rounded-md border border-border px-3 py-2"
                              style={{
                                backfaceVisibility: 'hidden',
                                transform: 'rotateX(180deg)',
                                backgroundColor: 'var(--color-surface)',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => setFlippedId(null)}
                                className="rounded-md px-4 py-1.5 text-sm font-medium text-text-secondary hover:bg-(--color-surface-hover)"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!isAuthenticated) return;
                                  deleteMutation.mutate(conv.id);
                                }}
                                className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                              >
                                {deleteMutation.isPending &&
                                deleteMutation.variables === conv.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  'Delete'
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <MemoriesModal
        isOpen={isMemoriesOpen}
        onClose={() => setIsMemoriesOpen(false)}
        conversationId={conversationId}
        personaName={persona.name}
      />
      <PersonaDetailsModal
        isOpen={isPersonaDetailsOpen}
        onClose={() => setIsPersonaDetailsOpen(false)}
        persona={persona}
        onDeleted={() => {
          setIsPersonaDetailsOpen(false);
          onClose();
          navigate('/omnichat/studio');
        }}
      />
    </Modal>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
