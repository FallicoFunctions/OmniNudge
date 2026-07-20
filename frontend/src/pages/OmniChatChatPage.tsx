import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import PersonaAvatar from '../components/omnichat/PersonaAvatar';
import SearchOverlay from '../components/omnichat/SearchOverlay';
import ChatSettingsModal from '../components/omnichat/ChatSettingsModal';
import OmniChatMessageContent from '../components/omnichat/OmniChatMessageContent';
import OmniChatShell from '../components/omnichat/OmniChatShell';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { useAuth } from '../contexts/AuthContext';
import { omnichatService, omnichatQueryKeys } from '../services/omnichatService';
import type {
  BotConversation,
  BotConversationDetail,
  BotMessage,
  BotPersona,
  OmniChatRegenerationTokenPayload,
  OmniChatTokenPayload,
} from '../types/omnichat';
import {
  clearGuestMessages,
  getGuestPersonaIds,
  loadGuestMessages,
  saveGuestMessages,
} from '../utils/omnichatGuestStorage';
import {
  getOmniChatPreviewText,
  normalizeOmniChatMessageContent,
} from '../utils/omnichatMessageFormatting';
import { loadOmniChatDefaults } from '../utils/omnichatDefaults';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { OMNICHAT_PERSONA_TRANSITION_NAME } from '../utils/omnichatViewTransitions';

type ChatFilter = 'all' | 'unread' | 'favorites';
type ProfileTab = 'profile' | 'gallery';
type MobileChatPane = 'list' | 'chat' | 'profile';
type ActiveBotConversation = BotConversation & { persona: BotPersona };
type PreviewDeleteScope = 'one' | 'all';

const PROFILE_PANE_COLLAPSED_KEY = 'omnichat_profile_pane_collapsed';
const CHAT_LIST_COLLAPSED_KEY = 'omnichat_chat_list_collapsed';
const PROFILE_PANE_WIDTH = 304;
const PROFILE_DRAWER_WIDTH = 360;
const CHAT_LIST_WIDTH_WIDE = 340;
const CHAT_LIST_WIDTH_COMPACT = 320;
const CHAT_LIST_WIDTH_COLLAPSED = 88;

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
  onDeleteOne,
  onDeleteAll,
  isDeleting = false,
  compact = false,
}: {
  conversation: BotConversation;
  preview: string;
  active: boolean;
  onClick: () => void;
  onDeleteOne: () => void;
  onDeleteAll: () => void;
  isDeleting?: boolean;
  compact?: boolean;
}) {
  const timestamp = formatChatTimestamp(conversation.last_message_at);
  const [deleteStage, setDeleteStage] = useState<'scope' | 'confirm' | null>(null);
  const [deleteScope, setDeleteScope] = useState<PreviewDeleteScope>('one');
  const [deleteZoneHovered, setDeleteZoneHovered] = useState(false);

  const beginConfirm = (scope: PreviewDeleteScope) => {
    setDeleteScope(scope);
    setDeleteStage('confirm');
  };

  const confirmDelete = () => {
    if (deleteScope === 'all') {
      onDeleteAll();
      return;
    }
    onDeleteOne();
  };

  return (
    <div
      className="relative w-full transition-transform duration-300"
      style={{ perspective: '1000px' }}
    >
      <div
        className="relative w-full transition-transform duration-500 ease-in-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: deleteStage ? 'rotateX(-180deg)' : 'rotateX(0deg)',
        }}
      >
        <div
          className="relative flex w-full items-center overflow-hidden rounded-[24px]"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <button
            type="button"
            onClick={onClick}
            title={compact ? conversation.title || conversation.persona?.name || 'Unknown' : undefined}
            className={`flex w-full items-center rounded-[24px] border text-left transition ${
              compact ? 'justify-center px-2 py-3' : 'gap-3 px-5 py-2.5'
            } ${
              deleteZoneHovered
                ? 'border-red-400/30 bg-red-500/10 text-white'
                : active
                ? 'border-white/15 bg-white/8 shadow-[0_18px_60px_rgba(0,0,0,0.22)]'
                : 'border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.04]'
            }`}
          >
            {conversation.persona && (
              <PersonaAvatar persona={conversation.persona} className="h-10 w-10 flex-shrink-0 rounded-full" />
            )}
            {!compact && (
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate text-[0.98rem] font-semibold text-white">
                    {conversation.title || conversation.persona?.name || 'Unknown'}
                  </p>
                  {timestamp && <span className="text-xs text-white/45">{timestamp}</span>}
                </div>
                <p className="mt-0.5 truncate text-sm text-white/60">{preview}</p>
              </div>
            )}
          </button>

          {!compact && (
            <button
              type="button"
              aria-label="Delete chat history"
              title="Delete chat history"
              onMouseEnter={() => setDeleteZoneHovered(true)}
              onMouseLeave={() => setDeleteZoneHovered(false)}
              onFocus={() => setDeleteZoneHovered(true)}
              onBlur={() => setDeleteZoneHovered(false)}
              onClick={(event) => {
                event.stopPropagation();
                setDeleteStage('scope');
              }}
              disabled={isDeleting}
              className="absolute inset-y-0 right-0 flex w-14 items-center justify-center rounded-r-[24px] text-white/40 opacity-0 transition hover:bg-red-500/16 hover:text-red-300 hover:opacity-100 focus:opacity-100 disabled:opacity-60"
            >
              {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
          )}
        </div>

        <div
          className="absolute inset-0 flex items-center justify-center gap-2 rounded-[24px] border border-red-400/30 bg-red-500/10 px-3 py-2"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}
        >
          {deleteStage === 'scope' ? (
            <>
              <button
                type="button"
                onClick={() => setDeleteStage(null)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/8 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => beginConfirm('one')}
                className="rounded-full border border-red-300/30 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-400/15"
              >
                This chat
              </button>
              <button
                type="button"
                onClick={() => beginConfirm('all')}
                className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
              >
                All chats
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setDeleteStage('scope')}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/8 hover:text-white"
              >
                Back
              </button>
              <span className="text-xs font-semibold text-red-50">
                Delete {deleteScope === 'all' ? 'all chats?' : 'this chat?'}
              </span>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-60"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : 'Delete'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
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
  const arrivedFromQuickChat = Boolean(
    (location.state as Record<string, unknown> | null)?.fromQuickChat
  );

  const isGuest = conversationId === 'guest';
  const routeConversationId = Number(conversationId);
  const guestPersonaId = useMemo(() => {
    if (!isGuest) return null;
    const fromQuery = searchParams.get('persona');
    const statePersonaId = (location.state as Record<string, unknown> | null)?.personaId;
    const id = fromQuery ? Number(fromQuery) : Number(statePersonaId);
    return Number.isFinite(id) ? id : null;
  }, [isGuest, searchParams, location.state]);

  useEffect(() => {
    if (!arrivedFromQuickChat) return;
    const timer = window.setTimeout(() => {
      navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true, state: null }
      );
    }, 900);
    return () => window.clearTimeout(timer);
  }, [arrivedFromQuickChat, location.pathname, location.search, navigate]);

  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryFilter, setDirectoryFilter] = useState<ChatFilter>('all');
  const [galleryTab, setGalleryTab] = useState<ProfileTab>('profile');
  const [draft, setDraft] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [regenerationText, setRegenerationText] = useState('');
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<number | null>(null);
  const [regenerationError, setRegenerationError] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editError, setEditError] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [newChatMenuOpen, setNewChatMenuOpen] = useState(false);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [guestMessages, setGuestMessages] = useState<BotMessage[]>([]);
  const [guestPersona, setGuestPersona] = useState<BotPersona | null>(null);
  const [guestPersonaLoading, setGuestPersonaLoading] = useState(false);
  const [guestIsGenerating, setGuestIsGenerating] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [isAvatarHovered, setIsAvatarHovered] = useState(false);
  const [profilePaneCollapsed, setProfilePaneCollapsed] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(PROFILE_PANE_COLLAPSED_KEY) === 'true';
  });
  const [chatListCollapsed, setChatListCollapsed] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(CHAT_LIST_COLLAPSED_KEY) === 'true';
  });
  const profileDrawerMode = useMediaQuery('(min-width: 1024px) and (max-width: 1499px)');
  const mobileChatMode = useMediaQuery('(max-width: 1023px)');
  const [mobilePane, setMobilePane] = useState<MobileChatPane>(() =>
    conversationId ? 'chat' : 'list'
  );
  const [storedGuestPersonaIds, setStoredGuestPersonaIds] = useState<number[]>(() => getGuestPersonaIds());
  const persistedGuest = useRef(false);
  const nextOptimisticId = useRef(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const personasQuery = useQuery({
    queryKey: omnichatQueryKeys.personas(),
    queryFn: () => omnichatService.listPersonas(),
  });

  const conversationsQuery = useQuery({
    queryKey: omnichatQueryKeys.conversations,
    queryFn: () => omnichatService.listConversations(),
    enabled: isAuthenticated,
  });

  const activePersonaById = useMemo(
    () => new Map((personasQuery.data ?? []).map((persona) => [Number(persona.id), persona])),
    [personasQuery.data]
  );

  const filteredConversations = useMemo(() => {
    const all = conversationsQuery.data ?? [];
    const withMessages = all
      .filter((c) => c.last_message_preview)
      .map((conversation) => {
        const latestPersona = activePersonaById.get(Number(conversation.persona_id));
        if (!latestPersona) return null;
        return {
          ...conversation,
          persona: { ...(conversation.persona ?? latestPersona), ...latestPersona },
        };
      })
      .filter((conversation): conversation is ActiveBotConversation => conversation !== null);
    const newestByPersona = new Map<number, ActiveBotConversation>();

    for (const conversation of withMessages) {
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
  }, [activePersonaById, conversationsQuery.data, directoryQuery]);

  const selectedConversationId = useMemo(() => {
    if (isGuest || !isAuthenticated) return null;
    if (Number.isFinite(routeConversationId)) {
      return filteredConversations.some((conversation) => conversation.id === routeConversationId)
        ? routeConversationId
        : null;
    }
    return filteredConversations[0]?.id ?? null;
  }, [filteredConversations, isAuthenticated, isGuest, routeConversationId]);

  const conversationQuery = useQuery({
    queryKey: omnichatQueryKeys.conversation(selectedConversationId ?? -1),
    queryFn: () => omnichatService.getConversation(selectedConversationId as number),
    enabled: selectedConversationId !== null && !isGuest,
  });

  useEffect(() => {
    setStoredGuestPersonaIds(getGuestPersonaIds());
  }, [guestMessages.length, guestPersonaId]);

  const guestPersonaIds = useMemo(() => {
    if (!isGuest || guestPersonaId == null) return storedGuestPersonaIds;
    return storedGuestPersonaIds.includes(guestPersonaId)
      ? storedGuestPersonaIds
      : [...storedGuestPersonaIds, guestPersonaId];
  }, [guestPersonaId, isGuest, storedGuestPersonaIds]);

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
        : filteredConversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [filteredConversations, selectedConversationId]
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
    if (!isGuest || !guestPersona || guestMessages.length > 0) return;
    const openingMessage = guestPersona.first_message?.trim();
    if (!openingMessage) return;

    setGuestMessages([
      {
        id: nextOptimisticId.current--,
        conversation_id: 0,
        role: 'assistant',
        content: openingMessage,
        failed: false,
        created_at: new Date().toISOString(),
      },
    ]);
  }, [guestMessages.length, guestPersona, isGuest]);

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
    const onRegenerationToken = (event: Event) => {
      const detail = (event as CustomEvent<OmniChatRegenerationTokenPayload>).detail;
      if (detail.conversation_id !== selectedConversationId) return;
      setRegeneratingMessageId(detail.message_id);
      setRegenerationText((prev) => prev + detail.token);
    };
    const onRegenerated = (event: Event) => {
      const detail = (event as CustomEvent<BotMessage>).detail;
      if (detail.conversation_id !== selectedConversationId) return;
      setRegeneratingMessageId((current) => (current === detail.id ? null : current));
      setRegenerationText('');
      setRegenerationError(false);
    };

    window.addEventListener('omnichat-token', onToken);
    window.addEventListener('omnichat-message-complete', onComplete);
    window.addEventListener('omnichat-regeneration-token', onRegenerationToken);
    window.addEventListener('omnichat-message-regenerated', onRegenerated);
    return () => {
      window.removeEventListener('omnichat-token', onToken);
      window.removeEventListener('omnichat-message-complete', onComplete);
      window.removeEventListener('omnichat-regeneration-token', onRegenerationToken);
      window.removeEventListener('omnichat-message-regenerated', onRegenerated);
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
  }, [conversationQuery.data?.messages, guestMessages, regenerationText, streamingText]);

  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 36), 160);
    textarea.style.height = `${nextHeight}px`;
  }, [draft]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    if (profileDrawerMode || mobileChatMode) return;
    localStorage.setItem(PROFILE_PANE_COLLAPSED_KEY, String(profilePaneCollapsed));
  }, [mobileChatMode, profileDrawerMode, profilePaneCollapsed]);

  useEffect(() => {
    if (typeof localStorage === 'undefined' || mobileChatMode) return;
    localStorage.setItem(CHAT_LIST_COLLAPSED_KEY, String(chatListCollapsed));
  }, [chatListCollapsed, mobileChatMode]);

  useEffect(() => {
    if (profileDrawerMode) {
      setProfilePaneCollapsed(true);
      return;
    }
    if (typeof localStorage === 'undefined') {
      setProfilePaneCollapsed(false);
      return;
    }
    setProfilePaneCollapsed(localStorage.getItem(PROFILE_PANE_COLLAPSED_KEY) === 'true');
  }, [profileDrawerMode]);

  useEffect(() => {
    if (!mobileChatMode) return;
    setMobilePane(conversationId ? 'chat' : 'list');
  }, [conversationId, mobileChatMode]);

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
      queryClient.invalidateQueries({
        queryKey: omnichatQueryKeys.conversation(selectedConversationId as number),
      });
      queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
    },
  });

  const regenerateMessageMutation = useMutation({
    mutationFn: ({ messageId }: { messageId: number }) =>
      omnichatService.regenerateMessage(selectedConversationId as number, messageId),
    onMutate: ({ messageId }) => {
      setRegenerationError(false);
      setRegenerationText('');
      setRegeneratingMessageId(messageId);
    },
    onSuccess: (message) => {
      queryClient.setQueryData<BotConversationDetail | undefined>(
        omnichatQueryKeys.conversation(message.conversation_id),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((candidate) =>
              candidate.id === message.id ? message : candidate
            ),
          };
        }
      );
      queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
      setRegeneratingMessageId(null);
      setRegenerationText('');
    },
    onError: () => {
      setRegeneratingMessageId(null);
      setRegenerationText('');
      setRegenerationError(true);
      queryClient.invalidateQueries({
        queryKey: omnichatQueryKeys.conversation(selectedConversationId as number),
      });
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: ({ messageId, content }: { messageId: number; content: string }) =>
      omnichatService.editMessage(selectedConversationId as number, messageId, content),
    onSuccess: (message) => {
      queryClient.setQueryData<BotConversationDetail | undefined>(
        omnichatQueryKeys.conversation(message.conversation_id),
        (prev) => prev
          ? {
              ...prev,
              messages: prev.messages.map((candidate) =>
                candidate.id === message.id ? message : candidate
              ),
            }
          : prev
      );
      queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
      setEditingMessageId(null);
      setEditDraft('');
      setEditError(false);
    },
    onError: () => setEditError(true),
  });

  const deletePreviewMutation = useMutation({
    mutationFn: ({ scope, conversation }: { scope: PreviewDeleteScope; conversation: ActiveBotConversation }) =>
      scope === 'all'
        ? omnichatService.deletePersonaConversations(conversation.persona_id)
        : omnichatService.deleteConversation(conversation.id),
    onSuccess: (_data, variables) => {
      const { scope, conversation } = variables;
      const remainingConversations = (conversationsQuery.data ?? [])
        .filter((candidate) => {
          if (scope === 'all') {
            return candidate.persona_id !== conversation.persona_id;
          }
          return candidate.id !== conversation.id;
        })
        .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

      queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
      queryClient.removeQueries({ queryKey: omnichatQueryKeys.conversation(conversation.id) });
      if (scope === 'all') {
        for (const candidate of conversationsQuery.data ?? []) {
          if (candidate.persona_id === conversation.persona_id) {
            queryClient.removeQueries({ queryKey: omnichatQueryKeys.conversation(candidate.id) });
          }
        }
      }

      const deletedActiveConversation = selectedConversationId === conversation.id;
      const deletedActivePersona = activePersona?.id === conversation.persona_id;
      if (deletedActiveConversation || (scope === 'all' && deletedActivePersona)) {
        const nextConversation = remainingConversations[0];
        if (nextConversation) {
          navigate(`/omnichat/c/${nextConversation.id}`, { replace: true });
        } else {
          navigate('/omnichat/chat', { replace: true });
        }
      }
    },
  });

  const handleSelectPersona = useCallback(
    (persona: BotPersona) => {
      if (!isAuthenticated) {
        if (mobileChatMode) setMobilePane('chat');
        navigate(`/omnichat/c/guest?persona=${persona.id}`, { state: { personaId: persona.id } });
        return;
      }

      const existingConversation = (conversationsQuery.data ?? []).find(
        (conversation) => conversation.persona_id === persona.id
      );
      if (existingConversation) {
        if (mobileChatMode) setMobilePane('chat');
        navigate(`/omnichat/c/${existingConversation.id}`);
        return;
      }

      omnichatService
        .createConversation(persona.id, undefined, false, loadOmniChatDefaults('authenticated'))
        .then((conversation) => {
          queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
          if (mobileChatMode) setMobilePane('chat');
          navigate(`/omnichat/c/${conversation.id}`);
        })
        .catch(() => {
          // ignore
        });
    },
    [conversationsQuery.data, isAuthenticated, mobileChatMode, navigate, queryClient]
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
  }, [conversationQuery.data?.conversation.persona_id, guestPersona, isGuest, navigate, queryClient, selectedConversation?.persona_id]);

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

  const activePersona = isGuest
    ? guestPersona
    : activePersonaById.get(
        Number(conversationQuery.data?.conversation.persona_id ?? selectedConversation?.persona_id)
      ) ?? null;

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const content = draft.trim();
      if (!content) return;

      setDraft('');
      setStreamingText('');
      setRegenerationError(false);

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
          .sendPreviewMessage({
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

      if (!selectedConversationId || !activePersona) return;

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
    [activePersona, draft, guestMessages, guestPersona, isGuest, queryClient, selectedConversationId, sendMessageMutation]
  );

  const galleryUrls = (activePersona?.gallery_urls ?? []).filter(Boolean);
  const hasGallery = galleryUrls.length > 0;
  const hasVideo = Boolean(activePersona?.preview_video_url);

  useEffect(() => {
    if (!hasGallery && galleryTab === 'gallery') {
      setGalleryTab('profile');
    }
  }, [hasGallery, galleryTab]);

  useEffect(() => {
    setShowVideo(false);
  }, [activePersona?.id]);

  const activeMessages = isGuest
    ? guestMessages
    : selectedConversationId !== null && activePersona
      ? (conversationQuery.data?.messages ?? [])
      : [];
  const latestMessage = activeMessages.at(-1);
  const previousMessage = activeMessages.at(-2);
  const regeneratableMessageId =
    latestMessage?.role === 'assistant' && previousMessage?.role === 'user'
      ? latestMessage.id
      : null;

  const handleRegenerate = useCallback(
    async (messageId: number) => {
      if (messageId !== regeneratableMessageId || regeneratingMessageId !== null) return;

      setRegenerationError(false);
      if (!isGuest) {
        if (!selectedConversationId) return;
        regenerateMessageMutation.mutate({ messageId });
        return;
      }

      if (!guestPersona) return;
      const targetIndex = guestMessages.findIndex((message) => message.id === messageId);
      const userMessage = guestMessages[targetIndex - 1];
      if (targetIndex < 1 || userMessage?.role !== 'user') return;

      setRegeneratingMessageId(messageId);
      setRegenerationText('');
      try {
        const response = await omnichatService.sendPreviewMessage({
          persona_id: guestPersona.id,
          content: userMessage.content,
          history: guestMessages
            .slice(0, targetIndex - 1)
            .map((message) => ({ role: message.role, content: message.content })),
        });
        if (response.failed || !response.content.trim()) {
          throw new Error('Guest regeneration failed');
        }
        setGuestMessages((messages) =>
          messages.map((message) =>
            message.id === messageId
              ? { ...message, content: response.content, failed: false }
              : message
          )
        );
      } catch {
        setRegenerationError(true);
      } finally {
        setRegeneratingMessageId(null);
        setRegenerationText('');
      }
    },
    [
      guestMessages,
      guestPersona,
      isGuest,
      regenerateMessageMutation,
      regeneratableMessageId,
      regeneratingMessageId,
      selectedConversationId,
    ]
  );

  const beginEdit = useCallback((message: BotMessage) => {
    if (message.id !== regeneratableMessageId || regeneratingMessageId !== null) return;
    setEditingMessageId(message.id);
    setEditDraft(message.content);
    setEditError(false);
  }, [regeneratableMessageId, regeneratingMessageId]);

  const cancelEdit = useCallback(() => {
    if (editMessageMutation.isPending) return;
    setEditingMessageId(null);
    setEditDraft('');
    setEditError(false);
  }, [editMessageMutation.isPending]);

  const saveEdit = useCallback((messageId: number) => {
    const content = editDraft.trim();
    if (!content || content.length > 4000 || editMessageMutation.isPending) return;
    setEditError(false);
    if (isGuest) {
      setGuestMessages((messages) => messages.map((message) =>
        message.id === messageId ? { ...message, content, failed: false } : message
      ));
      setEditingMessageId(null);
      setEditDraft('');
      return;
    }
    if (!selectedConversationId) return;
    editMessageMutation.mutate({ messageId, content });
  }, [editDraft, editMessageMutation, isGuest, selectedConversationId]);

  const activeConversationSettings = conversationQuery.data?.conversation.settings;
  const isLoadingConversation = isGuest ? guestPersonaLoading : conversationQuery.isLoading;
  const isSendingMessage = sendMessageMutation.isPending || guestIsGenerating;
  const isGenerating = isSendingMessage || regeneratingMessageId !== null;
  const isEditing = editingMessageId !== null;
  const normalizedStreamingText = normalizeOmniChatMessageContent(streamingText);
  const normalizedRegenerationText = normalizeOmniChatMessageContent(regenerationText);
  const effectiveChatListCollapsed = !mobileChatMode && chatListCollapsed;
  const chatListWidth = effectiveChatListCollapsed
    ? CHAT_LIST_WIDTH_COLLAPSED
    : profileDrawerMode
      ? CHAT_LIST_WIDTH_COMPACT
      : CHAT_LIST_WIDTH_WIDE;
  const chatGridColumns = profileDrawerMode
    ? `${chatListWidth}px minmax(520px, 1fr) 0px`
    : `${chatListWidth}px minmax(520px, 1fr) ${profilePaneCollapsed ? 0 : PROFILE_PANE_WIDTH}px`;
  const showMobileListPane = !mobileChatMode || mobilePane === 'list';
  const showMobileChatPane = !mobileChatMode || mobilePane === 'chat';
  const showMobileProfilePane = mobileChatMode && mobilePane === 'profile';
  const profilePaneInDrawer = profileDrawerMode && !mobileChatMode;
  const profilePaneInDesktopGrid = !profileDrawerMode && !mobileChatMode;

  return (
    <OmniChatShell
      activeTab="chat"
      onTabChange={(tab) => {
        if (tab === 'discover') navigate('/omnichat');
        if (tab === 'search') setSearchOverlayOpen(true);
        if (tab === 'chat') navigate('/omnichat/chat');
        if (tab === 'studio') navigate('/omnichat/studio');
      }}
    >
      <div className="h-[calc(100dvh-72px)] overflow-hidden bg-[#111114]">
        <div
          data-testid="omnichat-chat-grid"
          className="grid h-full grid-cols-1 lg:grid-cols-[var(--omnichat-chat-grid-columns)]"
          style={
            {
              ['--omnichat-chat-grid-columns' as string]: chatGridColumns,
            } as CSSProperties
          }
        >
          <aside
            data-testid="omnichat-chat-list-pane"
            className={`min-h-0 border-r border-white/10 bg-[#18181d] ${
              showMobileListPane ? 'flex' : 'hidden lg:flex'
            }`}
          >
            <div className={`flex h-full w-full flex-col overflow-hidden py-4 ${effectiveChatListCollapsed ? 'px-2' : ''}`}>
              <div className={`flex items-center justify-between gap-3 ${effectiveChatListCollapsed ? 'px-0' : 'px-4'}`}>
                {effectiveChatListCollapsed ? (
                  <button
                    type="button"
                    onClick={() => setChatListCollapsed(false)}
                    aria-label="Expand chat list"
                    className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <ChevronRight size={18} />
                  </button>
                ) : (
                  <>
                    <h1 className="text-[1.8rem] font-semibold tracking-tight text-white">
                      {t('omnichat.conversationsPage.title')}
                    </h1>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleNewChat}
                        className="rounded-full bg-white/12 px-4 py-2 text-[0.92rem] font-semibold text-white transition hover:bg-[var(--color-primary)]"
                      >
                        + {t('omnichat.chat.newChat')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatListCollapsed(true)}
                        aria-label="Collapse chat list"
                        className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white lg:flex"
                      >
                        <ChevronLeft size={18} />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {!effectiveChatListCollapsed && (
                <>
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
                </>
              )}

              <div className={`min-h-0 flex-1 space-y-1.5 overflow-y-auto ${effectiveChatListCollapsed ? 'mt-4' : 'mt-5'}`}>
                {!isAuthenticated ? personasQuery.isLoading ? (
                  <LoadingMessage>{t('common.loading')}</LoadingMessage>
                ) : personasQuery.isError ? (
                  <ErrorMessage>{t('omnichat.discover.loadError')}</ErrorMessage>
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
                      title={effectiveChatListCollapsed ? persona.name : undefined}
                      className={`flex w-full items-center rounded-[24px] border border-transparent text-left transition hover:border-white/10 hover:bg-white/[0.04] ${
                        effectiveChatListCollapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-3'
                      }`}
                    >
                      <PersonaAvatar persona={persona} className="h-12 w-12 flex-shrink-0 rounded-full" />
                      {!effectiveChatListCollapsed && (
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold text-white">{persona.name}</p>
                          <p className="mt-0.5 truncate text-sm text-white/58">
                            {guestMessagePreviews.get(persona.id) || t('omnichat.conversationsPage.noMessages')}
                          </p>
                        </div>
                      )}
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
                      compact={effectiveChatListCollapsed}
                      isDeleting={
                        deletePreviewMutation.isPending &&
                        deletePreviewMutation.variables?.conversation.id === conversation.id
                      }
                      onClick={() => {
                        navigate(`/omnichat/c/${conversation.id}`);
                        if (mobileChatMode) setMobilePane('chat');
                      }}
                      onDeleteOne={() => deletePreviewMutation.mutate({ scope: 'one', conversation })}
                      onDeleteAll={() => deletePreviewMutation.mutate({ scope: 'all', conversation })}
                    />
                  ))
                )}
              </div>
            </div>
          </aside>

          <section
            data-testid="omnichat-message-pane"
            className={`relative min-h-0 flex-col bg-[#121216] lg:min-w-[520px] ${
              showMobileChatPane ? 'flex' : 'hidden lg:flex'
            } ${profilePaneCollapsed ? '' : 'border-r border-white/10'}`}
          >
            <div className="flex items-center border-b border-white/10 px-5 h-16">
              <div className="flex w-full items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  {mobileChatMode && (
                    <button
                      type="button"
                      onClick={() => setMobilePane('list')}
                      aria-label="Back to chats"
                      className="ml-12 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/75 transition hover:bg-white/[0.08] hover:text-white lg:ml-0"
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}
                  {activePersona && mobileChatMode && (
                    <button
                      type="button"
                      onClick={() => setMobilePane('profile')}
                      className="flex-shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2"
                      aria-label="Open profile pane"
                    >
                      <PersonaAvatar
                        persona={activePersona}
                        className={`h-14 w-14 rounded-full ${arrivedFromQuickChat ? 'omnichat-chat-avatar-arrival' : ''}`}
                        style={
                          arrivedFromQuickChat
                            ? { viewTransitionName: OMNICHAT_PERSONA_TRANSITION_NAME }
                            : undefined
                        }
                      />
                    </button>
                  )}
                  {activePersona && !mobileChatMode && (
                    <PersonaAvatar
                      persona={activePersona}
                      className={`h-14 w-14 flex-shrink-0 rounded-full ${arrivedFromQuickChat ? 'omnichat-chat-avatar-arrival' : ''}`}
                      style={
                        arrivedFromQuickChat
                          ? { viewTransitionName: OMNICHAT_PERSONA_TRANSITION_NAME }
                          : undefined
                      }
                    />
                  )}
                  <div className="min-w-0 overflow-hidden">
                    <h2 className="truncate text-xl font-semibold tracking-tight text-white xl:text-2xl">
                      {activePersona?.name ?? ''}
                    </h2>
                  </div>
                </div>

                {!mobileChatMode && (
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
                )}
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
                {activeMessages.map((message) => {
                  const canRegenerate = message.id === regeneratableMessageId;
                  const isRegenerating = message.id === regeneratingMessageId;
                  const isEditingMessage = message.id === editingMessageId;
                  return (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} ${
                        canRegenerate ? 'pb-8' : ''
                      }`}
                    >
                      <div className="group/message relative max-w-[min(82%,720px)]">
                        <div
                          className={`rounded-[26px] px-4 py-3 text-[0.95rem] ${
                            message.role === 'user'
                              ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                              : 'border border-white/8 bg-white/[0.06] text-white'
                          }`}
                        >
                          {isEditingMessage ? (
                            <div className="min-w-[min(70vw,440px)] space-y-2">
                              <textarea
                                autoFocus
                                value={editDraft}
                                maxLength={4000}
                                aria-label={t('omnichat.chat.editResponse')}
                                onChange={(event) => {
                                  setEditDraft(event.target.value);
                                  if (editError) setEditError(false);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Escape') cancelEdit();
                                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                                    event.preventDefault();
                                    saveEdit(message.id);
                                  }
                                }}
                                className="min-h-28 w-full resize-y rounded-2xl border border-white/15 bg-black/20 px-3 py-2 text-sm leading-relaxed text-white outline-none focus:border-blue-400/70 focus:ring-2 focus:ring-blue-400/20"
                              />
                              <p className="text-[11px] text-white/45">{t('omnichat.chat.editLearningHint')}</p>
                              {editError && <p className="text-xs text-rose-400">{t('omnichat.chat.editFailed')}</p>}
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={editMessageMutation.isPending}
                                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-white/65 hover:bg-white/10 hover:text-white disabled:opacity-40"
                                >
                                  <X size={13} /> {t('omnichat.chat.cancelEdit')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveEdit(message.id)}
                                  disabled={!editDraft.trim() || editMessageMutation.isPending}
                                  className="flex items-center gap-1 rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-40"
                                >
                                  {editMessageMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                  {t('omnichat.chat.saveEdit')}
                                </button>
                              </div>
                            </div>
                          ) : isRegenerating ? (
                            normalizedRegenerationText ? (
                              <OmniChatMessageContent content={normalizedRegenerationText} />
                            ) : (
                              <GeneratingIndicator />
                            )
                          ) : (
                            <OmniChatMessageContent content={message.content} />
                          )}
                        </div>

                        {canRegenerate && !isEditingMessage && (
                          <div className="absolute left-1 top-full mt-1 flex gap-1 opacity-60 transition md:opacity-0 md:group-hover/message:opacity-100">
                            <button
                              type="button"
                              onClick={() => void handleRegenerate(message.id)}
                              disabled={isGenerating || isEditing}
                              aria-label={t('omnichat.chat.regenerateResponse')}
                              title={t('omnichat.chat.regenerateResponse')}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#24242a] text-white/60 shadow-lg shadow-black/25 transition hover:border-white/20 hover:bg-[#2d2d34] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <RotateCcw size={14} className={isRegenerating ? 'animate-spin' : ''} />
                            </button>
                            <button
                              type="button"
                              onClick={() => beginEdit(message)}
                              disabled={isGenerating || isEditing}
                              aria-label={t('omnichat.chat.editResponse')}
                              title={t('omnichat.chat.editResponse')}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#24242a] text-white/60 shadow-lg shadow-black/25 transition hover:border-white/20 hover:bg-[#2d2d34] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Pencil size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isSendingMessage && (
                  <div className="flex justify-start">
                    <div className="rounded-[26px] border border-white/8 bg-white/[0.06] px-4 py-3 text-white">
                      {normalizedStreamingText ? (
                        <OmniChatMessageContent content={normalizedStreamingText} />
                      ) : (
                        <GeneratingIndicator />
                      )}
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
                  {regenerationError && (
                    <p className="mb-3 text-xs text-rose-400">
                      {t('omnichat.chat.regenerationFailed')}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <textarea
                      ref={composerRef}
                      value={draft}
                      onChange={(event) => {
                        setDraft(event.target.value);
                        if (rateLimitError) setRateLimitError(null);
                        if (regenerationError) setRegenerationError(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          const form = event.currentTarget.form;
                          if (form) form.requestSubmit();
                        }
                      }}
                      placeholder={t('omnichat.chat.inputPlaceholder')}
                      disabled={isGenerating || !activePersona}
                      rows={1}
                      style={{ minHeight: '36px', maxHeight: '160px' }}
                      className="ml-4 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-3 py-2 text-sm leading-6 text-white placeholder:text-white/35 outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isGenerating || !draft.trim() || !activePersona}
                      className="flex h-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] px-5 text-sm font-medium text-white transition hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
                    >
                      {isGenerating ? <Loader2 size={14} className="animate-spin" /> : 'Send'}
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setNewChatMenuOpen((open) => !open)}
                        title={t('omnichat.chat.newChat')}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white/75 transition hover:bg-[var(--color-primary)] hover:text-white"
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
            style={
              {
                ['--omnichat-profile-drawer-width' as string]: `${PROFILE_DRAWER_WIDTH}px`,
              } as CSSProperties
            }
            className={`min-h-0 flex-col bg-[#121216] transition-transform duration-300 ${
              profilePaneInDrawer
                ? 'fixed bottom-0 right-0 top-[72px] z-40 flex w-[var(--omnichat-profile-drawer-width)] max-w-[calc(100vw-24px)] border-l border-white/10 shadow-2xl'
                : showMobileProfilePane
                  ? 'flex w-full'
                  : profilePaneInDesktopGrid
                    ? 'hidden w-[304px] lg:flex'
                    : 'hidden'
            } ${
              profilePaneCollapsed && !showMobileProfilePane
                ? 'pointer-events-none translate-x-full'
                : 'pointer-events-auto translate-x-0'
            }`}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 h-16">
              <div className="flex min-w-0 items-center gap-3">
                {mobileChatMode && (
                  <button
                    type="button"
                    onClick={() => setMobilePane('chat')}
                    aria-label="Back to chat"
                    className="ml-12 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/75 transition hover:bg-white/[0.08] hover:text-white lg:ml-0"
                  >
                    <ChevronLeft size={18} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setGalleryTab('profile')}
                  className={`text-[1.8rem] font-semibold ${galleryTab === 'profile' ? 'text-white' : 'text-white/45'}`}
                >
                  {t('omnichat.chat.profile')}
                </button>
                {hasGallery && (
                  <button
                    type="button"
                    onClick={() => setGalleryTab('gallery')}
                    className={`text-[1.8rem] font-semibold ${galleryTab === 'gallery' ? 'text-white' : 'text-white/45'}`}
                  >
                    {t('omnichat.chat.gallery')}
                  </button>
                )}
              </div>
              {!mobileChatMode && (
                <button
                  type="button"
                  onClick={() => setProfilePaneCollapsed(true)}
                  aria-label="Collapse profile pane"
                  className="rounded-full p-2.5 text-white/75 hover:bg-white/5 hover:text-white"
                >
                  <ChevronRight size={20} />
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {activePersona ? (
                <>
                  <div
                    className="group/avatar relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]"
                    onMouseEnter={() => setIsAvatarHovered(true)}
                    onMouseLeave={() => setIsAvatarHovered(false)}
                  >
                    {hasVideo ? (
                      <div className="relative aspect-[4/5] w-full">
                        <div
                          className="absolute inset-0 transition-transform duration-500 ease-in-out"
                          style={{ transform: `translateX(${showVideo ? '-100%' : '0%'})` }}
                        >
                          <PersonaAvatar
                            persona={activePersona}
                            className="h-full w-full rounded-none"
                            hideOverlay
                          />
                        </div>
                        <div
                          className="absolute inset-0 transition-transform duration-500 ease-in-out"
                          style={{ transform: `translateX(${showVideo ? '0%' : '100%'})` }}
                        >
                          <PersonaAvatar
                            persona={activePersona}
                            className="h-full w-full rounded-none"
                            previewEnabled
                            previewActive
                            hideOverlay
                          />
                        </div>
                      </div>
                    ) : (
                      <PersonaAvatar
                        persona={activePersona}
                        className="aspect-[4/5] w-full"
                      />
                    )}
                    <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    {hasVideo && isAvatarHovered && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowVideo(false)}
                          className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white/50 backdrop-blur-sm transition-all hover:bg-black/80 hover:text-white"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowVideo(true)}
                          className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white/50 backdrop-blur-sm transition-all hover:bg-black/80 hover:text-white"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="mt-5 flex items-start justify-between gap-3">
                    <div className="overflow-hidden">
                      <h3 className="break-words text-[2.1rem] font-semibold leading-none text-white">
                        {activePersona.name}
                      </h3>
                      {activePersona.description && (
                        <p className="mt-3 text-base leading-7 text-white/62">{activePersona.description}</p>
                      )}
                    </div>
                  </div>

                  {galleryTab === 'gallery' && (
                    <div className="mt-6 grid grid-cols-2 gap-3">
                      {galleryUrls.map((url, index) => (
                        <div key={index} className="overflow-hidden rounded-[20px] border border-white/10">
                          <img
                            src={resolveMediaUrl(url)}
                            alt={`${activePersona.name} gallery ${index + 1}`}
                            className="aspect-[4/5] w-full object-cover"
                          />
                        </div>
                      ))}
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

      {activePersona && (selectedConversationId !== null || isGuest) && (
        <ChatSettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          conversationId={selectedConversationId}
          persona={activePersona}
          currentSettings={isGuest ? loadOmniChatDefaults('guest') : activeConversationSettings}
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
