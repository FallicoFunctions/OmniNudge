import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Info, Loader2, Plus, Send, Settings, X } from 'lucide-react';
import { omnichatService, omnichatQueryKeys } from '../services/omnichatService';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import PersonaAvatar from '../components/omnichat/PersonaAvatar';
import ChatSettingsModal from '../components/omnichat/ChatSettingsModal';
import OmniChatSidebar from '../components/omnichat/OmniChatSidebar';
import SearchOverlay from '../components/omnichat/SearchOverlay';
import type { SidebarTab } from '../components/omnichat/OmniChatSidebar';
import { useOmniChatLayoutMode } from '../hooks/useOmniChatLayoutMode';
import { useAuth } from '../contexts/AuthContext';
import type { BotConversationDetail, BotMessage, BotPersona, OmniChatTokenPayload } from '../types/omnichat';
import {
  clearGuestMessages,
  getOmniChatAuthRedirectTarget,
  loadGuestMessages,
  saveGuestMessages,
} from '../utils/omnichatGuestStorage';

const ACTION_TEXT_SPLIT_PATTERN = /(\([^)]*\)|\*[^*]+\*)/g;
const ACTION_TEXT_WHOLE_PATTERN = /^(\([^)]*\)|\*[^*]+\*)$/;

function MessageContent({ content }: { content: string }) {
  const segments = content.split(ACTION_TEXT_SPLIT_PATTERN).filter(Boolean);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {segments.map((segment, i) =>
        ACTION_TEXT_WHOLE_PATTERN.test(segment) ? (
          <span key={i} className="italic text-[var(--color-text-secondary)]">
            {segment}
          </span>
        ) : (
          <span key={i}>{segment}</span>
        )
      )}
    </p>
  );
}

function GeneratingIndicator() {
  return (
    <div className="flex gap-1 px-1 py-2">
      <span className="h-2 w-2 animate-bounce-dot rounded-full bg-[var(--color-text-muted)]" />
      <span
        className="h-2 w-2 animate-bounce-dot rounded-full bg-[var(--color-text-muted)]"
        style={{ animationDelay: '0.15s' }}
      />
      <span
        className="h-2 w-2 animate-bounce-dot rounded-full bg-[var(--color-text-muted)]"
        style={{ animationDelay: '0.3s' }}
      />
    </div>
  );
}

export default function OmniChatPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { conversationId } = useParams<{ conversationId: string }>();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { mode: layoutMode } = useOmniChatLayoutMode();

  const isGuest = conversationId === 'guest';
  const personaIdFromQuery = searchParams.get('persona');

  const [draft, setDraft] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const nextOptimisticId = useRef(-1);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('discover');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);

  const personasQuery = useQuery({
    queryKey: omnichatQueryKeys.personas(),
    queryFn: () => omnichatService.listPersonas(),
  });

  // Guest-only state — lazy init from sessionStorage so messages survive refresh
  const [guestMessages, setGuestMessages] = useState<BotMessage[]>([]);
  const [guestPersona, setGuestPersona] = useState<BotPersona | null>(null);
  const [guestPersonaLoading, setGuestPersonaLoading] = useState(false);
  const [guestIsGenerating, setGuestIsGenerating] = useState(false);
  const persistedGuest = useRef(false);

  const id = Number(conversationId);
  const guestPersonaId = useMemo(() => {
    if (!isGuest) return null;
    const pid = personaIdFromQuery ? Number(personaIdFromQuery) : (location.state as Record<string, unknown>)?.personaId as number | undefined;
    return pid && Number.isFinite(pid) ? pid : null;
  }, [isGuest, personaIdFromQuery, location.state]);

  // Reset guest state when navigating between personas.
  // Ref is initialised to the current persona ID so the effect won't fire on
  // the very first render (which would wipe messages just restored from
  // sessionStorage).
  const prevGuestPersonaId = useRef<number | null>(
    isGuest && guestPersonaId ? guestPersonaId : null
  );
  useEffect(() => {
    if (!isGuest) return;
    if (guestPersonaId && guestPersonaId !== prevGuestPersonaId.current) {
      prevGuestPersonaId.current = guestPersonaId;
      setGuestMessages(loadGuestMessages(guestPersonaId));
      setGuestPersona(null);
      setGuestIsGenerating(false);
      setStreamingText('');
    }
  }, [isGuest, guestPersonaId]);

  useEffect(() => {
    if (!isGuest) return;
    setGuestMessages(loadGuestMessages(guestPersonaId));
  }, [isGuest, guestPersonaId]);

  // Load persona in guest mode
  useEffect(() => {
    if (!isGuest || !guestPersonaId) return;

    setGuestPersonaLoading(true);
    omnichatService.listPersonas().then((personas) => {
      const persona = personas.find((p) => p.id === guestPersonaId) ?? null;
      setGuestPersona(persona);
    }).catch(() => {
      // Persona load failed silently — will show loading state
    }).finally(() => {
      setGuestPersonaLoading(false);
    });
  }, [isGuest, guestPersonaId]);

  // Persist guest conversation on sign-in
  useEffect(() => {
    if (!isGuest || !isAuthenticated || guestMessages.length === 0 || !guestPersona || persistedGuest.current) return;
    persistedGuest.current = true;

    omnichatService.createConversationWithMessages(guestPersona.id, guestMessages)
      .then((conv) => {
        clearGuestMessages(guestPersona.id);
        queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
        navigate(`/omnichat/c/${conv.id}`, { replace: true });
      })
      .catch(() => {
        persistedGuest.current = false;
      });
  }, [isGuest, isAuthenticated, guestMessages, guestPersona, queryClient, navigate]);

  // Authenticated conversation query
  const conversationQuery = useQuery({
    queryKey: omnichatQueryKeys.conversation(id),
    queryFn: () => omnichatService.getConversation(id),
    enabled: Number.isFinite(id) && !isGuest,
  });

  const sendMessageMutation = useMutation({
    mutationFn: (content: string) => omnichatService.sendMessage(id, content),
    onSuccess: (assistantMessage) => {
      queryClient.setQueryData<BotConversationDetail | undefined>(
        omnichatQueryKeys.conversation(id),
        (prev) => {
          if (!prev) return prev;
          if (prev.messages.some((m) => m.id === assistantMessage.id)) return prev;
          return { ...prev, messages: [...prev.messages, assistantMessage] };
        }
      );
      queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
      setStreamingText('');
    },
    onError: (error) => {
      setStreamingText('');
      const err = error as Error & { status?: number };
      if (err.status === 429) {
        setRateLimitError('rateLimited');
      } else {
        setRateLimitError(null);
      }
      queryClient.setQueryData<BotConversationDetail | undefined>(
        omnichatQueryKeys.conversation(id),
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.filter((m) => m.id > 0 || m.role !== 'user'),
          };
        }
      );
    },
  });

  const newChatMutation = useMutation({
    mutationFn: () =>
      omnichatService.createConversation(
        conversationQuery.data?.conversation.persona_id ?? 0,
        undefined,
        true,
      ),
    onSuccess: (newConv) => {
      queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
      navigate(`/omnichat/c/${newConv.id}`);
    },
  });

  const isGenerating = sendMessageMutation.isPending || guestIsGenerating;

  useEffect(() => {
    if (isGuest) return;
    const onToken = (event: Event) => {
      const detail = (event as CustomEvent<OmniChatTokenPayload>).detail;
      if (detail.conversation_id !== id) return;
      setStreamingText((prev) => prev + detail.token);
    };
    const onComplete = (event: Event) => {
      const message = (event as CustomEvent<BotMessage>).detail;
      if (message.conversation_id !== id) return;
      setStreamingText('');
    };

    window.addEventListener('omnichat-token', onToken);
    window.addEventListener('omnichat-message-complete', onComplete);
    return () => {
      window.removeEventListener('omnichat-token', onToken);
      window.removeEventListener('omnichat-message-complete', onComplete);
    };
  }, [id, isGuest]);

  // Persist guest messages to sessionStorage so they survive refresh
  useEffect(() => {
    if (!isGuest) return;
    try {
      saveGuestMessages(guestPersonaId, guestMessages);
    } catch {
      // Storage full or unavailable — messages stay in memory only
    }
  }, [isGuest, guestPersonaId, guestMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [conversationQuery.data?.messages, streamingText, guestMessages]);

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || isGenerating) return;
    if (isGuest && !guestPersona) return;

    setDraft('');
    setStreamingText('');

    if (isGuest) {
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

      const history = guestMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      omnichatService.sendAnonymousMessage({
        persona_id: guestPersona!.id,
        content,
        history,
      })
        .then((response) => {
          const assistantMessage: BotMessage = {
            id: nextOptimisticId.current--,
            conversation_id: 0,
            role: 'assistant',
            content: response.content,
            failed: response.failed,
            created_at: new Date().toISOString(),
          };
          setGuestMessages((prev) => [...prev, assistantMessage]);
        })
        .catch(() => {
          setGuestMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticMessage.id ? { ...m, failed: true } : m
            )
          );
        })
        .finally(() => {
          setGuestIsGenerating(false);
        });
      return;
    }

    queryClient.setQueryData<BotConversationDetail | undefined>(
      omnichatQueryKeys.conversation(id),
      (prev) => {
        if (!prev) return prev;
        const optimisticMessage: BotMessage = {
          id: nextOptimisticId.current--,
          conversation_id: id,
          role: 'user',
          content,
          failed: false,
          created_at: new Date().toISOString(),
        };
        return { ...prev, messages: [...prev.messages, optimisticMessage] };
      }
    );

    sendMessageMutation.mutate(content);
  }, [draft, isGenerating, isGuest, guestMessages, guestPersona, id, sendMessageMutation, queryClient]);

  const persona = isGuest ? guestPersona : conversationQuery.data?.conversation.persona;
  const messages = isGuest ? guestMessages : (conversationQuery.data?.messages ?? []);
  const isLoading = isGuest ? guestPersonaLoading : conversationQuery.isLoading;
  const isError = isGuest ? false : conversationQuery.isError;
  const showGuestNoPersona = isGuest && !guestPersonaId && !guestPersonaLoading;
  const showGuestPersonaNotFound = isGuest && guestPersonaId && !guestPersona && !guestPersonaLoading;

  const handleSignIn = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('open-auth-modal', {
        detail: {
          mode: 'login',
          redirectTo: getOmniChatAuthRedirectTarget(location.pathname, location.search),
        },
      })
    );
  }, [location.pathname, location.search]);

  const handleSidebarTabChange = useCallback((tab: SidebarTab) => {
    setSidebarTab(tab);
    if (tab === 'discover') {
      navigate('/omnichat');
    } else if (tab === 'search') {
      setSearchOverlayOpen(true);
      setSidebarTab('discover');
    } else if (tab === 'conversations') {
      navigate('/omnichat/conversations');
    }
  }, [navigate]);

  const handleNewChat = useCallback(() => {
    if (isGuest && guestPersona) {
      setGuestMessages([]);
      clearGuestMessages(guestPersona.id);
      return;
    }
    newChatMutation.mutate();
  }, [isGuest, guestPersona, newChatMutation]);

  if (!isGuest && !Number.isFinite(id)) {
    return (
      <div className="omnichat-theme min-h-screen bg-[var(--color-background)] p-4">
        <ErrorMessage>{t('omnichat.chat.invalidConversation')}</ErrorMessage>
      </div>
    );
  }

  const infoPanel = persona && (
    <>
      <PersonaAvatar persona={persona} className="aspect-square w-full" />
      <div className="mt-4 space-y-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            {persona.name}
          </h2>
          {persona.is_nsfw && (
            <span className="text-xs font-medium text-red-500">{t('omnichat.chat.nsfwTag')}</span>
          )}
        </div>
        {persona.description && (
          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {persona.description}
          </p>
        )}
      </div>
    </>
  );

  return (
    <div
      className={`omnichat-theme flex flex-col bg-[var(--color-background)] ${
        layoutMode === 'immersive' ? 'h-screen' : 'h-[calc(100vh-64px)]'
      }`}
    >
      <div className="flex flex-1 overflow-hidden">
        <OmniChatSidebar
          activeTab={sidebarTab}
          onTabChange={handleSidebarTabChange}
          isAuthenticated={isAuthenticated}
          onSignIn={handleSignIn}
          mobileOpen={mobileSidebarOpen}
          onMobileOpen={() => setMobileSidebarOpen(true)}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <div className="flex w-full flex-1 flex-col overflow-hidden px-4">
          <div className="flex items-center gap-3 border-b border-[var(--color-border)] py-3">
            <button
              type="button"
              onClick={() => navigate('/omnichat')}
              aria-label={t('omnichat.chat.back')}
              className="rounded-md p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {persona?.name ?? t('omnichat.chat.loadingPersona')}
              </p>
              {persona?.is_nsfw && (
                <span className="text-xs font-medium text-red-500">{t('omnichat.chat.nsfwTag')}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowInfo(true)}
              aria-label="Persona info"
              className="rounded-md p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] lg:hidden"
            >
              <Info size={20} />
            </button>
          </div>

          {isLoading && <LoadingMessage>{t('omnichat.chat.loading')}</LoadingMessage>}
          {isError && <ErrorMessage>{t('omnichat.chat.loadError')}</ErrorMessage>}
          {showGuestNoPersona && (
            <div className="py-10 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">
                {t('omnichat.chat.noPersonaSelected')}
              </p>
            </div>
          )}
          {showGuestPersonaNotFound && (
            <div className="py-10 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">
                {t('omnichat.chat.personaNotFound')}
              </p>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 ${
                    message.failed
                      ? 'border border-red-400 bg-[var(--color-surface)]'
                      : message.role === 'user'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'border border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  <MessageContent content={message.content} />
                </div>
              </div>
            ))}

            {isGenerating && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                  {streamingText ? <MessageContent content={streamingText} /> : <GeneratingIndicator />}
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2 border-t border-[var(--color-border)] py-3">
            <div className="relative flex-1">
              {rateLimitError && (
                <p className="absolute -top-6 left-0 text-xs text-red-400">{t(`omnichat.chat.${rateLimitError}`)}</p>
              )}
              <input
                type="text"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (rateLimitError) setRateLimitError(null);
                }}
                placeholder={rateLimitError ? '' : t('omnichat.chat.inputPlaceholder')}
                disabled={isGenerating || (isGuest && !guestPersona)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              />
            </div>
            <button
              type="submit"
              disabled={isGenerating || !draft.trim()}
              aria-label={t('omnichat.chat.send')}
              className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </form>
        </div>

        {persona && (
          <div className="hidden w-72 flex-shrink-0 flex-col overflow-y-auto border-l border-[var(--color-border)] p-4 lg:flex">
            {infoPanel}
          </div>
        )}
      </div>

      {showInfo && persona && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="flex-1 bg-black/50"
            onClick={() => setShowInfo(false)}
          />
          <div className="w-72 flex-shrink-0 overflow-y-auto bg-[var(--color-background)] p-4 shadow-xl">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="rounded-md p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
              >
                <X size={20} />
              </button>
            </div>
            {infoPanel}
          </div>
        </div>
      )}

      {persona && (
        <div className="fixed bottom-6 right-6 z-40 flex gap-3">
          <button
            type="button"
            onClick={handleNewChat}
            disabled={newChatMutation.isPending}
            aria-label={t('omnichat.chat.newChat')}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-lg hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
          >
            {newChatMutation.isPending ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Plus size={20} />
            )}
          </button>
          {!isGuest && (
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label={t('omnichat.chat.settings')}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-text-secondary)] shadow-lg hover:bg-[var(--color-surface-hover)]"
            >
              <Settings size={20} />
            </button>
          )}
        </div>
      )}

      {!isGuest && persona && (
        <ChatSettingsModal
          key={id}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          conversationId={id}
          persona={persona}
          currentSettings={conversationQuery.data?.conversation.settings}
        />
      )}

      <SearchOverlay
        isOpen={searchOverlayOpen}
        onClose={() => setSearchOverlayOpen(false)}
        personas={personasQuery.data ?? []}
        onSelectPersona={(selectedPersona) => {
          if (isGuest) {
            navigate(`/omnichat/c/guest?persona=${selectedPersona.id}`);
          } else {
            omnichatService.createConversation(selectedPersona.id).then((conv) => {
              queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
              navigate(`/omnichat/c/${conv.id}`);
            }).catch(() => {
              // Conversation creation failed — user will see no change, can retry
            });
          }
        }}
      />
    </div>
  );
}
