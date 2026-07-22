import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, MessageCircle, Plus, Search as SearchIcon } from 'lucide-react';
import { omnichatService, omnichatQueryKeys } from '../services/omnichatService';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { useAuth } from '../contexts/AuthContext';
import PersonaAvatar from '../components/omnichat/PersonaAvatar';
import SearchOverlay from '../components/omnichat/SearchOverlay';
import OmniChatShell from '../components/omnichat/OmniChatShell';
import QuickChatDialog from '../components/omnichat/QuickChatDialog';
import CharacterRouletteButton from '../components/omnichat/CharacterRouletteButton';
import type { SidebarTab } from '../components/omnichat/OmniChatSidebar';
import type { BotConversation, BotMessage, BotPersona } from '../types/omnichat';
import { loadOmniChatDefaults } from '../utils/omnichatDefaults';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  getNextPreviewState,
  getPreviewEligibleIds,
  getResumePreviewState,
  type MobilePreviewState,
  type PreviewResumeMode,
} from '../utils/omnichatMobilePreview';
import {
  findPersonaTransitionElement,
  OMNICHAT_PERSONA_TRANSITION_NAME,
  runPersonaSharedElementTransition,
} from '../utils/omnichatViewTransitions';

// Stable reference so the useMemo hooks below don't see a "new" array on
// every render while personas are still loading.
const EMPTY_PERSONAS: BotPersona[] = [];

// --- Card component ---------------------------------------------------------

function useMobilePreviewSequence(
  items: BotPersona[],
  isMobile: boolean,
  resumeMode: PreviewResumeMode
) {
  const cardRefs = useRef(new Map<number, HTMLButtonElement | null>());
  const [visibleIds, setVisibleIds] = useState<number[]>([]);
  const [activePreview, setActivePreview] = useState<MobilePreviewState | null>(null);
  const [expandedDescriptionId, setExpandedDescriptionId] = useState<number | null>(null);
  const activePreviewRef = useRef<MobilePreviewState | null>(null);
  const collapseTimerRef = useRef<number | null>(null);

  const previewEligibleIds = useMemo(() => getPreviewEligibleIds(items), [items]);

  useEffect(() => {
    activePreviewRef.current = activePreview;
  }, [activePreview]);

  const setCardRef = useCallback((personaId: number, node: HTMLButtonElement | null) => {
    if (node) {
      cardRefs.current.set(personaId, node);
      return;
    }
    cardRefs.current.delete(personaId);
  }, []);

  useEffect(() => {
    if (!isMobile || previewEligibleIds.length === 0) {
      setVisibleIds((current) => (current.length === 0 ? current : []));
      setActivePreview((current) => (current === null ? current : null));
      setExpandedDescriptionId((current) => (current === null ? current : null));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleIds((current) => {
          const next = new Set(current);
          for (const entry of entries) {
            const personaId = Number((entry.target as HTMLElement).dataset.personaId);
            if (entry.isIntersecting && entry.intersectionRatio >= 0.15) {
              next.add(personaId);
            } else {
              next.delete(personaId);
            }
          }
          return previewEligibleIds.filter((id) => next.has(id));
        });
      },
      { threshold: [0.15] }
    );

    for (const personaId of previewEligibleIds) {
      const node = cardRefs.current.get(personaId);
      if (node) {
        observer.observe(node);
      }
    }

    return () => observer.disconnect();
  }, [isMobile, previewEligibleIds]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }
    if (expandedDescriptionId !== null) {
      return;
    }
    setActivePreview((current) => getNextPreviewState(visibleIds, current));
  }, [expandedDescriptionId, isMobile, visibleIds]);

  const handlePreviewEnded = useCallback(
    (personaId: number) => {
      if (!isMobile) {
        return;
      }
      const currentPreview = activePreviewRef.current;
      setActivePreview(null);
      setExpandedDescriptionId(personaId);

      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
      }

      collapseTimerRef.current = window.setTimeout(() => {
        setExpandedDescriptionId((current) => (current === personaId ? null : current));
        setActivePreview(getResumePreviewState(visibleIds, personaId, currentPreview, resumeMode));
        collapseTimerRef.current = null;
      }, 3000);
    },
    [isMobile, resumeMode, visibleIds]
  );

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
      }
    };
  }, []);

  return {
    activePreview,
    expandedDescriptionId,
    setCardRef,
    handlePreviewEnded,
  };
}

function PersonaCard({
  persona,
  onSelect,
  featured = false,
  allowMobileAutoplay = false,
  mobilePreviewActive = false,
  mobilePreviewVersion = 0,
  mobileDescriptionExpanded = false,
  onPreviewEnded,
  cardRef,
}: {
  persona: BotPersona;
  onSelect: (persona: BotPersona, trigger?: HTMLElement) => void;
  featured?: boolean;
  allowMobileAutoplay?: boolean;
  mobilePreviewActive?: boolean;
  mobilePreviewVersion?: number;
  mobileDescriptionExpanded?: boolean;
  onPreviewEnded?: () => void;
  cardRef?: (node: HTMLButtonElement | null) => void;
}) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [isHovered, setIsHovered] = useState(false);
  const [desktopDescriptionExpanded, setDesktopDescriptionExpanded] = useState(false);
  const previewEnabled = Boolean(persona.preview_video_url) && (!isMobile || allowMobileAutoplay);
  const previewActive = isMobile ? mobilePreviewActive : isHovered;
  const descriptionExpanded = isMobile ? mobileDescriptionExpanded : desktopDescriptionExpanded;
  const holdPreviewFrame = isMobile && mobileDescriptionExpanded;

  return (
    <button
      ref={cardRef}
      data-persona-id={persona.id}
      type="button"
      onClick={(event) => onSelect(persona, event.currentTarget)}
      onMouseEnter={(event) => {
        setIsHovered(true);
        if (!isMobile) {
          const bounds = event.currentTarget.getBoundingClientRect();
          setDesktopDescriptionExpanded(event.clientY - bounds.top >= bounds.height / 2);
        }
      }}
      onMouseMove={(event) => {
        if (!isMobile) {
          const bounds = event.currentTarget.getBoundingClientRect();
          setDesktopDescriptionExpanded(event.clientY - bounds.top >= bounds.height / 2);
        }
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setDesktopDescriptionExpanded(false);
      }}
      className={`group relative w-full overflow-hidden rounded-[26px] border border-white/[0.08] bg-white/[0.035] text-left shadow-[0_18px_45px_rgba(0,0,0,0.18)] transition-all duration-500 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_24px_70px_rgba(0,0,0,0.38)] active:translate-y-0 active:scale-[0.985] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2 ${
        featured ? 'aspect-[16/10]' : 'aspect-[4/5]'
      }`}
    >
      <PersonaAvatar
        persona={persona}
        className="absolute inset-0 h-full w-full"
        previewEnabled={previewEnabled}
        previewActive={previewActive}
        previewVisibleWhenInactive={holdPreviewFrame}
        resetOnInactive={!holdPreviewFrame}
        loopPreview={!isMobile}
        previewVersion={mobilePreviewVersion}
        onPreviewEnded={onPreviewEnded}
      />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgba(255,255,255,0.11)_50%,transparent_65%)] bg-[length:240%_100%] bg-[position:120%_0] opacity-0 transition-all duration-700 group-hover:bg-[position:-30%_0] group-hover:opacity-100" />

      {/* 18+ badge */}
      {persona.is_nsfw && (
        <span className="absolute right-2.5 top-2.5 rounded-full bg-red-600/90 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
          18+
        </span>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p
              className={`${featured ? 'text-base sm:text-lg' : 'text-sm sm:text-base'} truncate font-bold tracking-[-0.02em] text-white drop-shadow-sm`}
            >
              {persona.name}
            </p>
          </div>
          <span className="flex h-8 w-8 flex-shrink-0 translate-y-2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white opacity-0 backdrop-blur-md transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <ArrowRight size={14} />
          </span>
        </div>
        {persona.description && (
          <p
            className={`overflow-hidden text-xs leading-relaxed text-white/75 transition-all duration-300 ${
              descriptionExpanded
                ? 'mt-2 max-h-24 translate-y-0 opacity-100'
                : 'mt-0 max-h-0 translate-y-2 opacity-0'
            }`}
          >
            {persona.description}
          </p>
        )}
      </div>
    </button>
  );
}

// --- Page ------------------------------------------------------------------

export default function OmniChatDiscoverPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('discover');
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [quickChatPersona, setQuickChatPersona] = useState<BotPersona | null>(null);
  const [quickChatFocusReturn, setQuickChatFocusReturn] = useState<HTMLElement | null>(null);
  const quickChatOriginRef = useRef<HTMLElement | null>(null);
  const heroAvatarRef = useRef<HTMLDivElement | null>(null);
  const searchReturnRef = useRef<HTMLButtonElement | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Initialize search overlay from URL (e.g. /omnichat?search=foo from chat page search tab)
  useEffect(() => {
    const q = searchParams.get('search');
    if (q) {
      setSearchOverlayOpen(true);
      // Clear the search parameter to prevent overlay from reopening on revisits
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('search');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleOpenStudio = useCallback(() => {
    if (isAuthenticated) {
      navigate('/omnichat/studio');
      return;
    }
    window.dispatchEvent(
      new CustomEvent('open-auth-modal', {
        detail: {
          mode: 'login',
          redirectTo: '/omnichat/studio',
        },
      })
    );
  }, [isAuthenticated, navigate]);

  const handleSidebarTabChange = useCallback(
    (tab: SidebarTab) => {
      if (tab === 'search') {
        searchReturnRef.current = null;
        setSearchOverlayOpen(true);
        // Reset to discover tab after opening overlay
        setSidebarTab('discover');
        return;
      }

      if (tab === 'characters') {
        if (isAuthenticated) {
          setSidebarTab('characters');
          navigate('/omnichat/studio');
          return;
        }
        handleOpenStudio();
        setSidebarTab('discover');
        return;
      }

      setSidebarTab(tab);
      if (tab === 'chat') {
        navigate('/omnichat/chat');
      } else if (tab === 'groups') {
        navigate('/omnichat/groups');
      }
      if (tab === 'create') navigate('/omnichat/create');
      if (tab === 'explore') navigate('/omnichat/explore');
    },
    [handleOpenStudio, isAuthenticated, navigate]
  );

  const personasQuery = useQuery({
    queryKey: omnichatQueryKeys.personas(),
    queryFn: () => omnichatService.listPersonas(),
  });

  const conversationsQuery = useQuery({
    queryKey: omnichatQueryKeys.conversations,
    queryFn: () => omnichatService.listConversations(),
    enabled: isAuthenticated,
  });

  const createConversationMutation = useMutation({
    mutationFn: ({ personaId, messages }: { personaId: number; messages: BotMessage[] }) =>
      omnichatService.createConversationWithMessages(
        personaId,
        messages,
        undefined,
        loadOmniChatDefaults('authenticated')
      ),
  });

  const personas = personasQuery.data ?? EMPTY_PERSONAS;
  const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);
  const activePersonaById = useMemo(
    () => new Map(personas.map((persona) => [Number(persona.id), persona])),
    [personas]
  );

  const featured = useMemo(
    () =>
      [...personas]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3),
    [personas]
  );

  const heroPersona = useMemo(
    () => featured.find((persona) => Boolean(persona.avatar_url)) ?? featured[0],
    [featured]
  );

  // One card per persona — conversations arrive newest-first from the API,
  // so the first row for each persona_id is the thread to resume.
  const continueChatting = useMemo(() => {
    const seen = new Set<number>();
    const items: Array<BotConversation & { persona: BotPersona }> = [];

    for (const conv of conversations) {
      if (!conv.last_message_preview) continue;
      const latestPersona = activePersonaById.get(Number(conv.persona_id));
      if (!latestPersona) continue;
      const persona = { ...(conv.persona ?? latestPersona), ...latestPersona };
      if (seen.has(conv.persona_id)) continue;
      seen.add(conv.persona_id);
      items.push({ ...conv, persona });
    }

    return items.sort(
      (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );
  }, [activePersonaById, conversations]);

  const continueChattingPersonas = useMemo(
    () => continueChatting.map((conversation) => conversation.persona),
    [continueChatting]
  );

  const ownedPersonas = useMemo(() => {
    if (!isAuthenticated || !user) {
      return [];
    }
    return personas.filter((persona) => persona.owner_user_id === user.id);
  }, [isAuthenticated, personas, user]);

  const featuredPreview = useMobilePreviewSequence(featured, isMobile, 'sequential');
  const continuePreview = useMobilePreviewSequence(
    continueChattingPersonas,
    isMobile,
    'sequential'
  );
  const gridPreview = useMobilePreviewSequence(personas, isMobile, 'sequential');

  const findConversationForPersona = (personaId: number) =>
    conversations.find((c) => Number(c.persona_id) === Number(personaId));

  const handleSelect = (
    persona: BotPersona,
    trigger?: HTMLElement,
    returnTarget?: HTMLElement,
    focusReturnTarget?: HTMLElement
  ) => {
    const source = findPersonaTransitionElement(trigger ?? null);
    const selectedFromSearch = Boolean(trigger?.closest('[data-omnichat-search-overlay="true"]'));
    quickChatOriginRef.current =
      findPersonaTransitionElement(returnTarget ?? null) ??
      returnTarget ??
      (selectedFromSearch ? searchReturnRef.current : null) ??
      source;
    setQuickChatFocusReturn(
      focusReturnTarget ??
        returnTarget ??
        (selectedFromSearch ? searchReturnRef.current : null) ??
        trigger?.closest<HTMLElement>('button, a, [tabindex]:not([tabindex="-1"])') ??
        null
    );
    runPersonaSharedElementTransition({
      source,
      sourceState: 'old',
      disabled: reduceMotion,
      counterpart: () =>
        document.querySelector<HTMLElement>('[data-quick-chat-shared-avatar="true"]'),
      update: () => {
        flushSync(() => setQuickChatPersona(persona));
      },
    });
  };

  const handleCloseQuickChat = () => {
    runPersonaSharedElementTransition({
      source: quickChatOriginRef.current,
      sourceState: 'new',
      disabled: reduceMotion,
      counterpart: () =>
        document.querySelector<HTMLElement>('[data-quick-chat-shared-avatar="true"]'),
      update: () => {
        flushSync(() => setQuickChatPersona(null));
      },
    });
  };

  const navigateFromQuickChat = (to: string, state?: Record<string, unknown>) => {
    const destinationState = { ...state, fromQuickChat: true };
    const quickChatAvatar = document.querySelector<HTMLElement>(
      '[data-quick-chat-shared-avatar="true"]'
    );

    runPersonaSharedElementTransition({
      source: quickChatAvatar,
      sourceState: 'old',
      disabled: reduceMotion,
      counterpart: () =>
        document.querySelector<HTMLElement>(
          `[data-persona-avatar="true"][style*="${OMNICHAT_PERSONA_TRANSITION_NAME}"]`
        ),
      update: () => {
        flushSync(() => navigate(to, { state: destinationState }));
      },
    });
  };

  const handleContinueQuickChat = async (messages: BotMessage[]) => {
    if (!quickChatPersona) return;
    if (!isAuthenticated) {
      navigateFromQuickChat(`/omnichat/c/guest?persona=${quickChatPersona.id}`, {
        forkedMessages: messages,
      });
      return;
    }
    const conversation = await createConversationMutation.mutateAsync({
      personaId: quickChatPersona.id,
      messages,
    });
    const conversationWithPersona = { ...conversation, persona: quickChatPersona };
    queryClient.setQueryData<BotConversation[]>(omnichatQueryKeys.conversations, (current = []) => [
      conversationWithPersona,
      ...current.filter((candidate) => candidate.id !== conversation.id),
    ]);
    queryClient.setQueryData(omnichatQueryKeys.conversation(conversation.id), {
      conversation: conversationWithPersona,
      messages,
    });
    void queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
    navigateFromQuickChat(`/omnichat/c/${conversation.id}`);
  };

  return (
    <OmniChatShell activeTab={sidebarTab} onTabChange={handleSidebarTabChange}>
      <SearchOverlay
        isOpen={searchOverlayOpen}
        onClose={() => setSearchOverlayOpen(false)}
        personas={personas}
        onSelectPersona={handleSelect}
        restoreFocusRef={searchReturnRef}
      />
      <QuickChatDialog
        isOpen={Boolean(quickChatPersona)}
        persona={quickChatPersona}
        existingConversation={
          quickChatPersona ? findConversationForPersona(quickChatPersona.id) : undefined
        }
        onClose={handleCloseQuickChat}
        onContinue={handleContinueQuickChat}
        onResume={(conversation) => navigateFromQuickChat(`/omnichat/c/${conversation.id}`)}
        reduceMotion={reduceMotion}
        sharedElementName={OMNICHAT_PERSONA_TRANSITION_NAME}
        restoreFocusTo={quickChatFocusReturn}
      />

      <div className="h-[calc(100dvh-var(--omnichat-header-offset))] overscroll-y-contain overflow-y-auto scroll-smooth">
        <div className="mx-auto w-full max-w-[1540px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8 xl:px-10">
          {heroPersona && (
            <section
              aria-labelledby="omnichat-hero-title"
              className="relative mb-7 min-h-[420px] overflow-hidden rounded-[34px] border border-white/10 bg-[#151620] shadow-[0_32px_100px_rgba(0,0,0,0.38)] sm:min-h-[440px]"
            >
              <div className="absolute inset-0 sm:left-[38%]">
                <PersonaAvatar
                  persona={heroPersona}
                  rootRef={heroAvatarRef}
                  className="h-full w-full !rounded-none"
                  previewEnabled={Boolean(heroPersona.preview_video_url) && !isMobile}
                  previewActive={!isMobile}
                  hideOverlay
                />
              </div>
              <div className="absolute inset-0 bg-[linear-gradient(90deg,#11121a_0%,rgba(17,18,26,0.98)_34%,rgba(17,18,26,0.58)_66%,rgba(17,18,26,0.08)_100%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(9,10,15,0.9)_0%,transparent_48%)] sm:bg-none" />
              <div
                className="omnichat-float absolute -right-14 -top-16 h-52 w-52 rounded-full border border-blue-300/10 bg-blue-500/10 blur-sm"
                aria-hidden="true"
              />

              <div className="relative z-10 flex min-h-[420px] max-w-2xl flex-col justify-end p-6 sm:min-h-[440px] sm:justify-center sm:p-10 lg:p-12">
                <div className="mb-5 flex w-fit items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-100 backdrop-blur-md">
                  {t('omnichat.discover.heroEyebrow')}
                </div>
                <h1
                  id="omnichat-hero-title"
                  className="max-w-xl text-[2.55rem] font-black leading-[0.98] tracking-[-0.055em] text-white sm:text-5xl lg:text-[3.65rem]"
                >
                  {t('omnichat.discover.heroTitle')}
                </h1>
                <p className="mt-5 max-w-lg text-sm leading-relaxed text-white/65 sm:text-base">
                  {t('omnichat.discover.heroDescription')}
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={(event) =>
                      handleSelect(
                        heroPersona,
                        heroAvatarRef.current ?? undefined,
                        undefined,
                        event.currentTarget
                      )
                    }
                    className="group flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#101118] shadow-[0_12px_30px_rgba(255,255,255,0.14)] transition hover:-translate-y-0.5 hover:bg-blue-50 active:translate-y-0 active:scale-[0.98]"
                  >
                    {t('omnichat.discover.enterPersona', { name: heroPersona.name })}
                    <ArrowRight
                      size={16}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </button>
                  <button
                    ref={searchReturnRef}
                    type="button"
                    onClick={(event) => {
                      searchReturnRef.current = event.currentTarget;
                      setSearchOverlayOpen(true);
                    }}
                    className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-black/20 px-5 text-sm font-semibold text-white backdrop-blur-md transition hover:border-white/30 hover:bg-white/10 active:scale-[0.98]"
                  >
                    <SearchIcon size={16} />
                    {t('omnichat.discover.searchCharacters')}
                  </button>
                  <CharacterRouletteButton
                    personas={personas}
                    onSelect={handleSelect}
                    reduceMotion={reduceMotion}
                  />
                </div>
                <div className="mt-7 flex items-center gap-3 text-xs text-white/45">
                  <span className="h-px w-8 bg-gradient-to-r from-blue-400 to-transparent" />
                  {t('omnichat.discover.spotlight', { name: heroPersona.name })}
                </div>
              </div>
            </section>
          )}

          {isAuthenticated && !conversationsQuery.isLoading && continueChatting.length > 0 && (
            <section className="mb-9 rounded-[30px] border border-white/[0.08] bg-white/[0.025] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.19em] text-emerald-200/70">
                    <span className="omnichat-live-dot h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    {t('omnichat.discover.continueEyebrow')}
                  </div>
                  <h2 className="text-xl font-bold tracking-[-0.03em] text-[var(--color-text-primary)]">
                    {t('omnichat.discover.continueChatting')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/omnichat/chat')}
                  className="omnichat-touch-target hidden items-center gap-2 rounded-full border border-white/10 px-4 text-xs font-semibold text-white/65 transition hover:border-white/20 hover:bg-white/5 hover:text-white sm:flex"
                >
                  <MessageCircle size={14} />
                  {t('omnichat.discover.viewChats')}
                </button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-1 hide-scrollbar">
                {continueChatting.map((conv) => (
                  <div key={conv.id} className="w-36 shrink-0 sm:w-40">
                    <PersonaCard
                      persona={conv.persona}
                      onSelect={() => navigate(`/omnichat/c/${conv.id}`)}
                      allowMobileAutoplay
                      mobilePreviewActive={
                        isMobile && continuePreview.activePreview?.id === conv.persona.id
                      }
                      mobilePreviewVersion={
                        isMobile && continuePreview.activePreview?.id === conv.persona.id
                          ? continuePreview.activePreview.version
                          : 0
                      }
                      onPreviewEnded={() => continuePreview.handlePreviewEnded(conv.persona.id)}
                      mobileDescriptionExpanded={
                        isMobile && continuePreview.expandedDescriptionId === conv.persona.id
                      }
                      cardRef={(node) => {
                        continuePreview.setCardRef(conv.persona.id, node);
                        if (node) node.dataset.personaId = String(conv.persona.id);
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {featured.length > 0 && (
            <section className="mb-10">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.19em] text-blue-200/65">
                    {t('omnichat.discover.featuredEyebrow')}
                  </p>
                  <h2 className="text-2xl font-black tracking-[-0.04em] text-[var(--color-text-primary)] sm:text-3xl">
                    {t('omnichat.discover.featuredTitle')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleOpenStudio}
                  className="group flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white/75 transition hover:border-blue-300/30 hover:bg-blue-400/10 hover:text-white"
                >
                  <Plus size={16} className="transition-transform group-hover:rotate-90" />
                  {t('omnichat.discover.createOrImport')}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {featured.map((persona) => (
                  <PersonaCard
                    key={persona.id}
                    persona={persona}
                    onSelect={handleSelect}
                    featured
                    allowMobileAutoplay
                    mobilePreviewActive={
                      isMobile && featuredPreview.activePreview?.id === persona.id
                    }
                    mobilePreviewVersion={
                      isMobile && featuredPreview.activePreview?.id === persona.id
                        ? featuredPreview.activePreview.version
                        : 0
                    }
                    onPreviewEnded={() => featuredPreview.handlePreviewEnded(persona.id)}
                    mobileDescriptionExpanded={
                      isMobile && featuredPreview.expandedDescriptionId === persona.id
                    }
                    cardRef={(node) => {
                      featuredPreview.setCardRef(persona.id, node);
                      if (node) node.dataset.personaId = String(persona.id);
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {isAuthenticated && ownedPersonas.length > 0 && (
            <section className="mb-10 rounded-[30px] border border-white/[0.08] bg-gradient-to-br from-blue-500/[0.06] to-transparent p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                    {t('omnichat.discover.privateCollection')}
                  </p>
                  <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-[var(--color-text-primary)]">
                    {t('omnichat.discover.myCharacters')}
                  </h2>
                </div>
                <Link
                  to="/omnichat/studio"
                  className="omnichat-touch-target flex items-center gap-2 rounded-full border border-white/10 px-4 text-xs font-semibold text-white/70 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                >
                  {t('omnichat.discover.manageStudio')} <ArrowRight size={14} />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
                {ownedPersonas.map((persona) => (
                  <PersonaCard
                    key={persona.id}
                    persona={persona}
                    onSelect={handleSelect}
                    allowMobileAutoplay
                  />
                ))}
              </div>
            </section>
          )}

          <section
            id="discover-characters"
            aria-labelledby="discover-characters-title"
            className="pb-10"
          >
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-blue-200/60">
                  {t('omnichat.discover.exploreEyebrow')}
                </p>
                <h2
                  id="discover-characters-title"
                  className="mt-1.5 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl"
                >
                  {t('omnichat.discover.exploreTitle')}
                </h2>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  searchReturnRef.current = event.currentTarget;
                  setSearchOverlayOpen(true);
                }}
                className="omnichat-touch-target flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-xs font-semibold text-white/65 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
              >
                <SearchIcon size={14} />
                {t('omnichat.discover.searchAll')}
              </button>
            </div>

            {personasQuery.isLoading && (
              <LoadingMessage>{t('omnichat.discover.loading')}</LoadingMessage>
            )}
            {personasQuery.isError && (
              <ErrorMessage>{t('omnichat.discover.loadError')}</ErrorMessage>
            )}
            {conversationsQuery.isError && (
              <ErrorMessage>{t('omnichat.discover.conversationsLoadError')}</ErrorMessage>
            )}
            {!personasQuery.isLoading && !personasQuery.isError && personas.length === 0 && (
              <div className="rounded-[26px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center text-sm text-[var(--color-text-secondary)]">
                {t('omnichat.discover.empty')}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5">
              {personas.map((persona) => (
                <PersonaCard
                  key={persona.id}
                  persona={persona}
                  onSelect={handleSelect}
                  allowMobileAutoplay
                  mobilePreviewActive={isMobile && gridPreview.activePreview?.id === persona.id}
                  mobilePreviewVersion={
                    isMobile && gridPreview.activePreview?.id === persona.id
                      ? gridPreview.activePreview.version
                      : 0
                  }
                  onPreviewEnded={() => gridPreview.handlePreviewEnded(persona.id)}
                  mobileDescriptionExpanded={
                    isMobile && gridPreview.expandedDescriptionId === persona.id
                  }
                  cardRef={(node) => {
                    gridPreview.setCardRef(persona.id, node);
                    if (node) node.dataset.personaId = String(persona.id);
                  }}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </OmniChatShell>
  );
}
