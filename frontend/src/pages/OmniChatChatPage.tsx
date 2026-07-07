import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Plus,
  Search,
  Send,
  Settings,
  Video,
} from 'lucide-react';
import { format } from 'date-fns';
import PersonaAvatar from '../components/omnichat/PersonaAvatar';
import SearchOverlay from '../components/omnichat/SearchOverlay';
import ChatSettingsModal from '../components/omnichat/ChatSettingsModal';
import OmniChatShell from '../components/omnichat/OmniChatShell';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { useAuth } from '../contexts/AuthContext';
import { omnichatService, omnichatQueryKeys } from '../services/omnichatService';
import type { BotConversation, BotConversationDetail, BotMessage, BotPersona, OmniChatTokenPayload } from '../types/omnichat';
import {
  clearGuestMessages,
  getGuestPersonaIds,
  loadGuestMessages,
  saveGuestMessages,
} from '../utils/omnichatGuestStorage';
import { getOmniChatPreviewText, parseOmniChatMessage } from '../utils/omnichatMessageFormatting';
import { loadOmniChatDefaults } from '../utils/omnichatDefaults';

type ChatFilter = 'all' | 'unread' | 'favorites';
type ProfileTab = 'profile' | 'gallery';

const PROFILE_PANE_COLLAPSED_KEY = 'omnichat_profile_pane_collapsed';
const PROFILE_PANE_WIDTH = 380;

function MessageContent({ content }: { content: string }) {
  const segments = parseOmniChatMessage(content);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {segments.map((segment, index) => (
        <span
          key={index}
          className={`${segment.bold ? 'font-semibold' : ''} ${segment.italic ? 'italic text-white/55' : ''}`.trim()}
        >
          {segment.text}
        </span>
      ))}
    </p>
  );
}

function GeneratingIndicator() {
  return (
    <div className="flex gap-1 px-1 py-2">
      <span className="h-2 w-2 animate-bounce-dot rounded-full bg-white/45" />
      <span className="h-2 w-2 animate-bounce-dot rounded-full bg-white/45" style={{ animationDelay: '0.15s' }} />
      <span className="h-2 w-2 animate-bounce-dot rounded-full bg-white/45" style={{ animationDelay: '0.3s' }} />
    </div>
  );
}

function formatChatTimestamp(dateStr: string) {
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    return format(date, 'h:mm a');
  } catch {
    return '';
  }
}

function getConversationPreview(preview: string | undefined, fallback: string) {
  const normalizedPreview = preview?.trim();
  if (!normalizedPreview) {
    return fallback;
  }

  return getOmniChatPreviewText(normalizedPreview);
}

function ConversationRow({
  conversation,
  preview,
  active,
  onClick,
}: {
  conversation: BotConversation;
  preview: string;
  active: boolean;
  onClick: () => void;
}) {
  const timestamp = formatChatTimestamp(conversation.last_message_at);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[24px] border px-5 py-2.5 text-left transition ${
        active
          ? 'border-white/15 bg-white/8 shadow-[0_18px_60px_rgba(0,0,0,0.22)]'
          : 'border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.04]'
      }`}
    >
      {conversation.persona && (
        <PersonaAvatar persona={conversation.persona} className="h-10 w-10 flex-shrink-0 rounded-full" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="truncate text-[0.98rem] font-semibold text-white">
            {conversation.title || conversation.persona?.name || 'Unknown'}
          </p>
          {timestamp && <span className="text-xs text-white/45">{timestamp}</span>}
        </div>
        <p className="mt-0.5 truncate text-sm text-white/60">{preview}</p>
      </div>
    </button>
  );
}

export default function OmniChatChatPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { isAuthenticated } = useAuth();

  const isGuest = conversationId === 'guest';
  const routeConversationId = Number(conversationId);
  const guestPersonaId = useMemo(() => {
    if (!isGuest) return null;
    const fromQuery = searchParams.get('persona');
    const statePersonaId = (location.state as Record<string, unknown> | null)?.personaId;
    const id = fromQuery ? Number(fromQuery) : Number(statePersonaId);
    return Number.isFinite(id) ? id : null;
  }, [isGuest, searchParams, location.state]);

  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryFilter, setDirectoryFilter] = useState<ChatFilter>('all');
  const [galleryTab, setGalleryTab] = useState<ProfileTab>('profile');
  const [draft, setDraft] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [newChatMenuOpen, setNewChatMenuOpen] = useState(false);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [guestMessages, setGuestMessages] = useState<BotMessage[]>([]);
  const [guestPersona, setGuestPersona] = useState<BotPersona | null>(null);
  const [guestPersonaLoading, setGuestPersonaLoading] = useState(false);
  const [guestIsGenerating, setGuestIsGenerating] = useState(false);
  const [profilePaneCollapsed, setProfilePaneCollapsed] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(PROFILE_PANE_COLLAPSED_KEY) === 'true';
  });
  const persistedGuest = useRef(false);
  const nextOptimisticId = useRef(-1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const personasQuery = useQuery({
    queryKey: omnichatQueryKeys.personas(),
    queryFn: () => omnichatService.listPersonas(),
  });

  const conversationsQuery = useQuery({
    queryKey: omnichatQueryKeys.conversations,
    queryFn: () => omnichatService.listConversations(),
    enabled: isAuthenticated,
  });

  const selectedConversationId = useMemo(() => {
    if (isGuest) return null;
    if (Number.isFinite(routeConversationId)) return routeConversationId;
    return conversationsQuery.data?.[0]?.id ?? null;
  }, [isGuest, routeConversationId, conversationsQuery.data]);

  const conversationQuery = useQuery({
    queryKey: omnichatQueryKeys.conversation(selectedConversationId ?? -1),
    queryFn: () => omnichatService.getConversation(selectedConversationId as number),
    enabled: selectedConversationId !== null && !isGuest,
  });

  const filteredConversations = useMemo(() => {
    const all = conversationsQuery.data ?? [];
    const newestByPersona = new Map<number, BotConversation>();

    for (const conversation of all) {
      const existing = newestByPersona.get(conversation.persona_id);
      if (!existing) {
        newestByPersona.set(conversation.persona_id, conversation);
        continue;
      }

      if (
        new Date(conversation.last_message_at).getTime() >
        new Date(existing.last_message_at).getTime()
      ) {
        newestByPersona.set(conversation.persona_id, conversation);
      }
    }

    return Array.from(newestByPersona.values()).filter((conversation) => {
      if (!directoryQuery.trim()) return true;
      const query = directoryQuery.toLowerCase();
      const preview = getConversationPreview(conversation.last_message_preview, '');
      return (
        (conversation.title || '').toLowerCase().includes(query) ||
        (conversation.persona?.name || '').toLowerCase().includes(query) ||
        preview.toLowerCase().includes(query)
      );
    });
  }, [conversationsQuery.data, directoryQuery]);

  const guestPersonaIds = getGuestPersonaIds();

  const filteredGuestPersonas = useMemo(() => {
    if (guestPersonaIds.length === 0) return [];
    const all = personasQuery.data ?? [];
    return all.filter((persona) => {
      if (!guestPersonaIds.includes(persona.id)) return false;
      if (!directoryQuery.trim()) return true;
      const query = directoryQuery.toLowerCase();
      return (
        persona.name.toLowerCase().includes(query) ||
        (persona.description || '').toLowerCase().includes(query)
      );
    });
  }, [directoryQuery, guestPersonaIds, personasQuery.data]);

  const guestMessagePreviews = useMemo(() => {
    const previews = new Map<number, string>();
    for (const id of guestPersonaIds) {
      const messages = id === guestPersonaId ? guestMessages : loadGuestMessages(id);
      const last = messages.at(-1);
      if (last?.content) {
        const text = getOmniChatPreviewText(last.content);
        if (text) previews.set(id, text);
      }
    }
    return previews;
  }, [guestPersonaIds, guestMessages, guestPersonaId]);

  const selectedConversation = useMemo(
    () =>
      selectedConversationId === null
        ? null
        : (conversationsQuery.data ?? []).find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversationsQuery.data, selectedConversationId]
  );

  const conversationPreviewQueries = useQueries({
    queries: filteredConversations.map((conversation) => ({
      queryKey: omnichatQueryKeys.conversation(conversation.id),
      queryFn: () => omnichatService.getConversation(conversation.id),
      enabled:
        isAuthenticated &&
        !isGuest &&
        !conversation.last_message_preview,
      staleTime: 60_000,
    })),
  });

  const conversationPreviewById = useMemo(() => {
    const previews = new Map<number, string>();

    for (let index = 0; index < filteredConversations.length; index += 1) {
      const conversation = filteredConversations[index];
      const fallback = t('omnichat.conversationsPage.noMessages');
      const listPreview = getConversationPreview(conversation.last_message_preview, '');
      if (listPreview) {
        previews.set(conversation.id, listPreview);
        continue;
      }

      const detailPreview =
        conversationPreviewQueries[index]?.data?.messages.at(-1)?.content;
      previews.set(conversation.id, getConversationPreview(detailPreview, fallback));
    }

    return previews;
  }, [conversationPreviewQueries, filteredConversations, t]);

  useEffect(() => {
    if (!isGuest) return;
    const state = location.state as { forkedMessages?: BotMessage[] } | null;
    if (state?.forkedMessages) {
      setGuestMessages(state.forkedMessages);
      saveGuestMessages(guestPersonaId, state.forkedMessages);
      window.history.replaceState({}, '');
    } else {
      setGuestMessages(loadGuestMessages(guestPersonaId));
    }
  }, [isGuest, guestPersonaId, location.state]);

  useEffect(() => {
    if (!isGuest || !guestPersonaId) return;
    setGuestPersonaLoading(true);
    omnichatService
      .listPersonas()
      .then((personas) => {
        setGuestPersona(personas.find((persona) => persona.id === guestPersonaId) ?? null);
      })
      .finally(() => {
        setGuestPersonaLoading(false);
      });
  }, [guestPersonaId, isGuest]);

  useEffect(() => {
    if (!isGuest || !isAuthenticated || !guestPersona || guestMessages.length === 0 || persistedGuest.current) {
      return;
    }

    persistedGuest.current = true;
    omnichatService
      .createConversationWithMessages(guestPersona.id, guestMessages, undefined, loadOmniChatDefaults('authenticated'))
      .then((conversation) => {
        clearGuestMessages(guestPersona.id);
        queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
        navigate(`/omnichat/c/${conversation.id}`, { replace: true });
      })
      .catch(() => {
        persistedGuest.current = false;
      });
  }, [guestMessages, guestPersona, isAuthenticated, isGuest, navigate, queryClient]);

  useEffect(() => {
    if (isGuest) return;
    const onToken = (event: Event) => {
      const detail = (event as CustomEvent<OmniChatTokenPayload>).detail;
      if (detail.conversation_id !== selectedConversationId) return;
      setStreamingText((prev) => prev + detail.token);
    };
    const onComplete = (event: Event) => {
      const detail = (event as CustomEvent<BotMessage>).detail;
      if (detail.conversation_id !== selectedConversationId) return;
      setStreamingText('');
    };

    window.addEventListener('omnichat-token', onToken);
    window.addEventListener('omnichat-message-complete', onComplete);
    return () => {
      window.removeEventListener('omnichat-token', onToken);
      window.removeEventListener('omnichat-message-complete', onComplete);
    };
  }, [isGuest, selectedConversationId]);

  useEffect(() => {
    if (!isGuest) return;
    try {
      saveGuestMessages(guestPersonaId, guestMessages);
    } catch {
      // ignore storage failures
    }
  }, [guestMessages, guestPersonaId, isGuest]);

  useEffect(() => {
    if (!scrollRef.current || typeof scrollRef.current.scrollTo !== 'function') return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [conversationQuery.data?.messages, guestMessages, streamingText]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PROFILE_PANE_COLLAPSED_KEY, String(profilePaneCollapsed));
  }, [profilePaneCollapsed]);

  useEffect(() => {
    if (!newChatMenuOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!target || !document.contains(target)) return;
      setNewChatMenuOpen(false);
    };
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [newChatMenuOpen]);

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => omnichatService.sendMessage(selectedConversationId as number, content),
    onSuccess: (assistantMessage) => {
      queryClient.setQueryData<BotConversationDetail | undefined>(
        omnichatQueryKeys.conversation(selectedConversationId as number),
        (prev) => {
          if (!prev) return prev;
          if (prev.messages.some((message) => message.id === assistantMessage.id)) return prev;
          return { ...prev, messages: [...prev.messages, assistantMessage] };
        }
      );
      queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
      setStreamingText('');
    },
    onError: (error) => {
      setStreamingText('');
      const err = error as Error & { status?: number };
      setRateLimitError(err.status === 429 ? 'rateLimited' : null);
      queryClient.setQueryData<BotConversationDetail | undefined>(
        omnichatQueryKeys.conversation(selectedConversationId as number),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.filter((message) => message.id > 0 || message.role !== 'user'),
          };
        }
      );
    },
  });

  const handleSelectPersona = useCallback(
    (persona: BotPersona) => {
      if (!isAuthenticated) {
        navigate(`/omnichat/c/guest?persona=${persona.id}`, { state: { personaId: persona.id } });
        return;
      }

      const existingConversation = (conversationsQuery.data ?? []).find(
        (conversation) => conversation.persona_id === persona.id
      );
      if (existingConversation) {
        navigate(`/omnichat/c/${existingConversation.id}`);
        return;
      }

      omnichatService
        .createConversation(persona.id, undefined, false, loadOmniChatDefaults('authenticated'))
        .then((conversation) => {
          queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
          navigate(`/omnichat/c/${conversation.id}`);
        })
        .catch(() => {
          // ignore
        });
    },
    [conversationsQuery.data, isAuthenticated, navigate, queryClient]
  );

  const handleNewChat = useCallback(() => {
    if (isGuest && guestPersona) {
      setGuestMessages([]);
      clearGuestMessages(guestPersona.id);
      return;
    }

    const personaId = conversationQuery.data?.conversation.persona_id ?? selectedConversation?.persona_id;
    if (!personaId) return;

    omnichatService.createConversation(
      personaId,
      undefined,
      true,
      loadOmniChatDefaults('authenticated')
    ).then((conversation) => {
      queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
      navigate(`/omnichat/c/${conversation.id}`);
    });
  }, [conversationQuery.data?.conversation.persona_id, guestPersona, isAuthenticated, isGuest, navigate, queryClient, selectedConversation?.persona_id]);

  const handleForkChat = useCallback(() => {
    setNewChatMenuOpen(false);
    if (isGuest && guestPersona) {
      const forked = guestMessages;
      if (guestPersonaId) clearGuestMessages(guestPersonaId);
      navigate(`/omnichat/c/guest?persona=${guestPersona.id}`, {
        state: { forkedMessages: forked },
      });
      return;
    }
    if (!selectedConversationId) return;
    omnichatService
      .forkConversation(selectedConversationId)
      .then((conversation) => {
        queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
        navigate(`/omnichat/c/${conversation.id}`);
      });
  }, [isGuest, guestPersona, guestPersonaId, guestMessages, selectedConversationId, navigate, queryClient]);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const content = draft.trim();
      if (!content) return;

      setDraft('');
      setStreamingText('');

      if (isGuest && guestPersona) {
        const optimisticMessage: BotMessage = {
          id: nextOptimisticId.current--,
          conversation_id: 0,
          role: 'user',
          content,
          failed: false,
          created_at: new Date().toISOString(),
        };

        setGuestMessages((prev) => [...prev, optimisticMessage]);
        setGuestIsGenerating(true);

        omnichatService
          .sendAnonymousMessage({
            persona_id: guestPersona.id,
            content,
            history: guestMessages.map((message) => ({ role: message.role, content: message.content })),
          })
          .then((response) => {
            setGuestMessages((prev) => [
              ...prev,
              {
                id: nextOptimisticId.current--,
                conversation_id: 0,
                role: 'assistant',
                content: response.content,
                failed: response.failed,
                created_at: new Date().toISOString(),
              },
            ]);
          })
          .finally(() => {
            setGuestIsGenerating(false);
          });
        return;
      }

      if (!selectedConversationId) return;

      queryClient.setQueryData<BotConversationDetail | undefined>(
        omnichatQueryKeys.conversation(selectedConversationId),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: nextOptimisticId.current--,
                conversation_id: selectedConversationId,
                role: 'user',
                content,
                failed: false,
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
      );

      sendMessageMutation.mutate(content);
    },
    [draft, guestMessages, guestPersona, isGuest, queryClient, selectedConversationId, sendMessageMutation]
  );

  const activePersona = isGuest ? guestPersona : conversationQuery.data?.conversation.persona ?? selectedConversation?.persona ?? null;
  const activeMessages = isGuest ? guestMessages : conversationQuery.data?.messages ?? [];
  const activeConversationSettings = conversationQuery.data?.conversation.settings;
  const isLoadingConversation = isGuest ? guestPersonaLoading : conversationQuery.isLoading;
  const isGenerating = sendMessageMutation.isPending || guestIsGenerating;

  return (
    <OmniChatShell
      activeTab="chat"
      onTabChange={(tab) => {
        if (tab === 'discover') navigate('/omnichat');
        if (tab === 'search') setSearchOverlayOpen(true);
        if (tab === 'chat') navigate('/omnichat/chat');
      }}
    >
      <div className="h-[calc(100dvh-72px)] overflow-hidden bg-[#111114]">
        <div
          className="grid h-full grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)_var(--omnichat-profile-pane-width)]"
          style={
            {
              ['--omnichat-profile-pane-width' as string]: `${profilePaneCollapsed ? 0 : PROFILE_PANE_WIDTH}px`,
            } as CSSProperties
          }
        >
          <aside className="min-h-0 border-r border-white/10 bg-[#18181d]">
            <div className="flex h-full flex-col overflow-hidden py-4">
              <div className="flex items-center justify-between gap-3 px-4">
                <h1 className="text-[1.8rem] font-semibold tracking-tight text-white">
                  {t('omnichat.conversationsPage.title')}
                </h1>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="rounded-full bg-white/8 px-4 py-2 text-[0.92rem] font-semibold text-white transition hover:bg-white/12"
                >
                  + {t('omnichat.chat.newChat')}
                </button>
              </div>

              <div className="relative mt-5 px-4">
                <Search size={16} className="absolute left-8 top-1/2 -translate-y-1/2 text-white/35" />
                <input
                  type="text"
                  value={directoryQuery}
                  onChange={(event) => setDirectoryQuery(event.target.value)}
                  placeholder={t('omnichat.conversationsPage.searchPlaceholder')}
                  className="h-12 w-full rounded-[22px] border border-white/10 bg-white/[0.06] pl-[3.25rem] pr-4 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-[var(--color-primary)]"
                />
              </div>

              <div className="mt-4 flex gap-2.5 px-4">
                {(['all', 'unread', 'favorites'] as const).map((filter) => {
                  const supported = filter === 'all';
                  const active = directoryFilter === filter;
                  return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => {
                      if (supported) setDirectoryFilter(filter);
                    }}
                    disabled={!supported}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? 'border-rose-400 bg-transparent text-white'
                        : supported
                          ? 'border-transparent bg-white/[0.06] text-white/70 hover:bg-white/[0.09]'
                          : 'border-transparent bg-white/[0.04] text-white/35'
                    }`}
                  >
                    {t(`omnichat.conversationsPage.filters.${filter}`)}
                  </button>
                  );
                })}
              </div>

              <div className="mt-5 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                {!isAuthenticated ? personasQuery.isLoading ? (
                  <LoadingMessage>{t('common.loading')}</LoadingMessage>
                ) : personasQuery.isError ? (
                  <ErrorMessage>{t('omnichat.discover.personasLoadError')}</ErrorMessage>
                ) : filteredGuestPersonas.length === 0 ? (
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                    {t('omnichat.conversationsPage.empty')}
                  </div>
                ) : (
                  filteredGuestPersonas.map((persona) => (
                    <button
                      key={persona.id}
                      type="button"
                      onClick={() => handleSelectPersona(persona)}
                      className="flex w-full items-center gap-3 rounded-[24px] border border-transparent px-3 py-3 text-left transition hover:border-white/10 hover:bg-white/[0.04]"
                    >
                      <PersonaAvatar persona={persona} className="h-12 w-12 flex-shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-white">{persona.name}</p>
                        <p className="mt-0.5 truncate text-sm text-white/58">
                          {guestMessagePreviews.get(persona.id) || t('omnichat.conversationsPage.noMessages')}
                        </p>
                      </div>
                    </button>
                  ))
                ) : conversationsQuery.isLoading ? (
                  <LoadingMessage>{t('common.loading')}</LoadingMessage>
                ) : conversationsQuery.isError ? (
                  <ErrorMessage>{t('omnichat.discover.conversationsLoadError')}</ErrorMessage>
                ) : filteredConversations.length === 0 ? (
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
                    {t('omnichat.conversationsPage.empty')}
                  </div>
                ) : (
                  filteredConversations.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      preview={
                        conversationPreviewById.get(conversation.id) ??
                        t('omnichat.conversationsPage.noMessages')
                      }
                      active={conversation.persona_id === activePersona?.id}
                      onClick={() => navigate(`/omnichat/c/${conversation.id}`)}
                    />
                  ))
                )}
              </div>
            </div>
          </aside>

          <section className={`relative flex min-h-0 flex-col bg-[#121216] ${profilePaneCollapsed ? '' : 'border-r border-white/10'}`}>
            <div className="flex items-center border-b border-white/10 px-5 h-16">
              <div className="flex w-full items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {activePersona && (
                    <PersonaAvatar persona={activePersona} className="h-14 w-14 rounded-full" />
                  )}
                  <div>
                    <h2 className="text-[2rem] font-semibold tracking-tight text-white">
                      {activePersona?.name ?? t('omnichat.chat.loadingPersona')}
                    </h2>
                  </div>
                </div>

                <div className="hidden items-center gap-3 lg:flex">
                  <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    title={t('omnichat.chat.settings')}
                    className="rounded-full p-2.5 text-white/75 hover:bg-white/5 hover:text-white"
                  >
                    <Settings size={20} />
                  </button>
                  {profilePaneCollapsed && (
                    <button
                      type="button"
                      onClick={() => setProfilePaneCollapsed(false)}
                      aria-label="Open profile pane"
                      className="rounded-full p-2.5 text-white/75 hover:bg-white/5 hover:text-white"
                    >
                      <ChevronLeft size={20} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {isLoadingConversation && <LoadingMessage>{t('omnichat.chat.loading')}</LoadingMessage>}
              {!isLoadingConversation && activeMessages.length === 0 && (
                <div className="flex h-full items-center justify-center text-white/35">
                  {t('omnichat.chat.emptyWorkspace')}
                </div>
              )}

              <div className="space-y-4">
                {activeMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[72%] rounded-[26px] px-4 py-3 text-[0.95rem] ${
                        message.role === 'user'
                          ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                          : 'border border-white/8 bg-white/[0.06] text-white'
                      }`}
                    >
                      <MessageContent content={message.content} />
                    </div>
                  </div>
                ))}

                {isGenerating && (
                  <div className="flex justify-start">
                    <div className="rounded-[26px] border border-white/8 bg-white/[0.06] px-4 py-3 text-white">
                      {streamingText ? <MessageContent content={streamingText} /> : <GeneratingIndicator />}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-white/10 px-5 py-4">
              <form
                onSubmit={handleSubmit}
                className="rounded-[28px] border border-white/10 bg-white/[0.06] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.22)]"
              >
                <div className="relative">
                  {rateLimitError && (
                    <p className="mb-3 text-xs text-rose-400">{t(`omnichat.chat.${rateLimitError}`)}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <textarea
                      value={draft}
                      onChange={(event) => {
                        setDraft(event.target.value);
                        if (rateLimitError) setRateLimitError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          const form = event.currentTarget.form;
                          if (form) form.requestSubmit();
                        }
                      }}
                      placeholder={t('omnichat.chat.inputPlaceholder')}
                      disabled={isGenerating || (isGuest && !guestPersona)}
                      rows={1}
                      style={{ height: '36px', minHeight: '36px', maxHeight: '36px' }}
                      className="flex-1 resize-none border-0 bg-transparent px-3 py-0 text-sm leading-9 text-white placeholder:text-white/35 outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isGenerating || !draft.trim()}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-white transition hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
                      title={t('omnichat.chat.send')}
                      aria-label={t('omnichat.chat.send')}
                    >
                      {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setNewChatMenuOpen((open) => !open)}
                        title={t('omnichat.chat.newChat')}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/6 text-white/75 transition hover:bg-white/10 hover:text-white"
                      >
                        <Plus size={14} />
                      </button>
                      {newChatMenuOpen && (
                        <div className="absolute bottom-full right-0 mb-2 w-48 rounded-2xl border border-white/10 bg-[#191920] p-2 shadow-2xl">
                          <button
                            type="button"
                            onClick={() => {
                              setNewChatMenuOpen(false);
                              handleNewChat();
                            }}
                            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
                          >
                            {t('omnichat.chat.newChat')}
                          </button>
                          {activeMessages.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setNewChatMenuOpen(false);
                                handleForkChat();
                              }}
                              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-white/80 transition hover:bg-white/5 hover:text-white"
                            >
                              {t('omnichat.chat.forkChat')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </section>

          <aside
            data-testid="omnichat-profile-pane"
            className={`hidden min-h-0 w-[380px] flex-col bg-[#121216] transition-transform duration-300 lg:flex ${
              profilePaneCollapsed ? 'translate-x-full' : 'translate-x-0'
            }`}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 h-16">
              <div className="flex gap-7">
                <button
                  type="button"
                  onClick={() => setGalleryTab('profile')}
                  className={`text-[1.8rem] font-semibold ${galleryTab === 'profile' ? 'text-white' : 'text-white/45'}`}
                >
                  Profile
                </button>
                <button
                  type="button"
                  onClick={() => setGalleryTab('gallery')}
                  className={`text-[1.8rem] font-semibold ${galleryTab === 'gallery' ? 'text-white' : 'text-white/45'}`}
                >
                  Gallery
                </button>
              </div>
              <button
                type="button"
                onClick={() => setProfilePaneCollapsed(true)}
                aria-label="Collapse profile pane"
                className="rounded-full p-2.5 text-white/75 hover:bg-white/5 hover:text-white"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {activePersona ? (
                <>
                  <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]">
                    <PersonaAvatar persona={activePersona} className="aspect-[4/5] w-full" />
                  </div>

                  <div className="mt-5 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[2.1rem] font-semibold leading-none text-white">
                        {activePersona.name}
                      </h3>
                      {activePersona.description && (
                        <p className="mt-3 text-base leading-7 text-white/62">{activePersona.description}</p>
                      )}
                    </div>
                  </div>

                  {galleryTab === 'gallery' && (
                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <div className="overflow-hidden rounded-[20px] border border-white/10">
                        <PersonaAvatar persona={activePersona} className="aspect-[4/5] w-full" />
                      </div>
                      <div className="overflow-hidden rounded-[20px] border border-white/10">
                        <PersonaAvatar persona={activePersona} className="aspect-[4/5] w-full" />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6 text-white/55">
                  {t('omnichat.chat.noPersonaSelected')}
                </div>
              )}
            </div>

          </aside>
        </div>
      </div>

      {!isGuest && activePersona && selectedConversationId !== null && (
        <ChatSettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          conversationId={selectedConversationId}
          persona={activePersona}
          currentSettings={activeConversationSettings}
        />
      )}

      <SearchOverlay
        isOpen={searchOverlayOpen}
        onClose={() => setSearchOverlayOpen(false)}
        personas={personasQuery.data ?? []}
        onSelectPersona={handleSelectPersona}
      />
    </OmniChatShell>
  );
}
