import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { omnichatService, omnichatQueryKeys } from '../services/omnichatService';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { useAuth } from '../contexts/AuthContext';
import PersonaAvatar from '../components/omnichat/PersonaAvatar';
import SearchOverlay from '../components/omnichat/SearchOverlay';
import OmniChatShell from '../components/omnichat/OmniChatShell';
import type { SidebarTab } from '../components/omnichat/OmniChatSidebar';
import type { BotConversation, BotPersona, PersonaCategory } from '../types/omnichat';
import { loadOmniChatDefaults } from '../utils/omnichatDefaults';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  getNextPreviewState,
  getPreviewEligibleIds,
  getResumePreviewState,
  type MobilePreviewState,
  type PreviewResumeMode,
} from '../utils/omnichatMobilePreview';

// Stable reference so the useMemo hooks below don't see a "new" array on
// every render while personas are still loading.
const EMPTY_PERSONAS: BotPersona[] = [];

// All PersonaCategory values are represented as filter pills.
const CATEGORIES: { value: PersonaCategory | 'all'; labelKey: string }[] = [
  { value: 'all', labelKey: 'omnichat.categories.all' },
  { value: 'roleplay', labelKey: 'omnichat.categories.roleplay' },
  { value: 'helper', labelKey: 'omnichat.categories.helper' },
  { value: 'romance', labelKey: 'omnichat.categories.romance' },
  { value: 'original', labelKey: 'omnichat.categories.original' },
  { value: 'anime_game', labelKey: 'omnichat.categories.animeGame' },
  { value: 'fiction_media', labelKey: 'omnichat.categories.fictionMedia' },
];

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
        setActivePreview(
          getResumePreviewState(visibleIds, personaId, currentPreview, resumeMode)
        );
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
  onSelect: (persona: BotPersona) => void;
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
  const hasDescription = Boolean(persona.description);

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={() => onSelect(persona)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseMove={(event) => {
        if (isMobile || !hasDescription) {
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        const offsetY = event.clientY - bounds.top;
        setDesktopDescriptionExpanded(offsetY >= bounds.height / 2);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setDesktopDescriptionExpanded(false);
      }}
      className={`group relative w-full overflow-hidden text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2 rounded-2xl ${
        featured ? 'aspect-[16/10]' : 'aspect-[3/4]'
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

      {/* 18+ badge */}
      {persona.is_nsfw && (
        <span className="absolute right-2.5 top-2.5 rounded-full bg-red-600/90 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
          18+
        </span>
      )}

      {/* Card label at bottom */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        <p className="px-3 pb-1 text-sm font-semibold text-white drop-shadow-sm">
          {persona.name}
        </p>
        {persona.description && (
          <p
            className={`overflow-hidden rounded-t-2xl border-t border-white/10 bg-black/60 px-3 text-xs text-white/85 backdrop-blur-sm transition-all duration-300 ${
              descriptionExpanded
                ? 'max-h-24 translate-y-0 py-2 opacity-100'
                : featured
                  ? 'max-h-4 translate-y-0 py-0.5 opacity-100 truncate'
                  : 'max-h-0 translate-y-2 py-0 opacity-0'
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
  const { isAuthenticated } = useAuth();
  const [category, setCategory] = useState<PersonaCategory | 'all'>('all');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('discover');
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useMediaQuery('(max-width: 767px)');

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

  const handleSidebarTabChange = useCallback((tab: SidebarTab) => {
    setSidebarTab(tab);
    if (tab === 'search') {
      setSearchOverlayOpen(true);
      // Reset to discover tab after opening overlay
      setSidebarTab('discover');
    } else if (tab === 'chat') {
      navigate('/omnichat/chat');
    }
  }, [navigate]);

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
    mutationFn: (personaId: number) =>
      omnichatService.createConversation(
        personaId,
        undefined,
        false,
        loadOmniChatDefaults('authenticated')
      ),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
      navigate(`/omnichat/c/${conversation.id}`);
    },
  });

  const personas = personasQuery.data ?? EMPTY_PERSONAS;
  const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);

  const featured = useMemo(
    () =>
      [...personas]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3),
    [personas]
  );

  const filtered = useMemo(
    () => (category === 'all' ? personas : personas.filter((p) => p.category === category)),
    [personas, category]
  );

  // One card per persona — conversations arrive newest-first from the API,
  // so the first row for each persona_id is the thread to resume.
  const continueChatting = useMemo(() => {
    const seen = new Set<number>();
    const items: Array<BotConversation & { persona: BotPersona }> = [];

    for (const conv of conversations) {
      const persona =
        conv.persona ?? personas.find((p) => Number(p.id) === Number(conv.persona_id));
      if (!persona) continue;
      if (seen.has(conv.persona_id)) continue;
      seen.add(conv.persona_id);
      items.push({ ...conv, persona });
    }

    return items.sort(
      (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );
  }, [conversations, personas]);

  const continueChattingPersonas = useMemo(
    () => continueChatting.map((conversation) => conversation.persona),
    [continueChatting]
  );

  const featuredPreview = useMobilePreviewSequence(featured, isMobile, 'sequential');
  const continuePreview = useMobilePreviewSequence(
    continueChattingPersonas,
    isMobile,
    'sequential'
  );
  const gridPreview = useMobilePreviewSequence(filtered, isMobile, 'sequential');

  const findConversationForPersona = (personaId: number) =>
    conversations.find((c) => Number(c.persona_id) === Number(personaId));

  const handleSelect = (persona: BotPersona) => {
    if (!isAuthenticated) {
      navigate(`/omnichat/c/guest?persona=${persona.id}`, {
        state: { personaId: persona.id },
      });
      return;
    }
    const existing = findConversationForPersona(persona.id);
    if (existing) {
      navigate(`/omnichat/c/${existing.id}`);
      return;
    }
    createConversationMutation.mutate(persona.id);
  };

  return (
    <OmniChatShell activeTab={sidebarTab} onTabChange={handleSidebarTabChange}>
      <SearchOverlay
        isOpen={searchOverlayOpen}
        onClose={() => setSearchOverlayOpen(false)}
        personas={personas}
        onSelectPersona={handleSelect}
      />

      <div className="h-[calc(100dvh-72px)] overflow-y-auto">
        <div className="mx-auto w-full max-w-[1600px] px-6 py-8 lg:px-10">

          {/* Continue Chatting section */}
          {!conversationsQuery.isLoading && continueChatting.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-4 text-xl font-bold text-[var(--color-text-primary)]">
                {t('omnichat.discover.continueChatting')}
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar">
                {continueChatting.map((conv) => (
                  <div key={conv.id} className="w-32 shrink-0 sm:w-40">
                    <PersonaCard
                      persona={conv.persona}
                      onSelect={() => navigate(`/omnichat/c/${conv.id}`)}
                      allowMobileAutoplay
                      mobilePreviewActive={isMobile && continuePreview.activePreview?.id === conv.persona.id}
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
                        if (node) {
                          node.dataset.personaId = String(conv.persona.id);
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Featured section */}
          {featured.length > 0 && (
            <section className="mb-8">
              <p className="mb-0.5 text-sm font-medium text-[var(--color-text-secondary)]">
                {t('omnichat.discover.featuredEyebrow')}
              </p>
              <h1 className="mb-4 text-2xl font-bold text-[var(--color-text-primary)]">
                {t('omnichat.discover.featuredTitle')}
              </h1>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {featured.map((persona) => (
                  <PersonaCard
                    key={persona.id}
                    persona={persona}
                    onSelect={handleSelect}
                    featured
                    allowMobileAutoplay
                    mobilePreviewActive={isMobile && featuredPreview.activePreview?.id === persona.id}
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
                      if (node) {
                        node.dataset.personaId = String(persona.id);
                      }
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Category filter pills */}
          <div className="mb-5 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const isActive = category === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-[var(--color-primary)] text-white border border-transparent'
                      : 'bg-transparent text-[var(--color-text-primary)] border border-[var(--color-border)]'
                  }`}
                >
                  {t(c.labelKey)}
                </button>
              );
            })}
          </div>

          {/* Status messages */}
          {personasQuery.isLoading && (
            <LoadingMessage>{t('omnichat.discover.loading')}</LoadingMessage>
          )}
          {personasQuery.isError && (
            <ErrorMessage>{t('omnichat.discover.loadError')}</ErrorMessage>
          )}
          {conversationsQuery.isError && (
            <ErrorMessage>{t('omnichat.discover.conversationsLoadError')}</ErrorMessage>
          )}
          {createConversationMutation.isError && (
            <ErrorMessage>{t('omnichat.discover.startError')}</ErrorMessage>
          )}
          {!personasQuery.isLoading && !personasQuery.isError && filtered.length === 0 && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('omnichat.discover.empty')}
            </p>
          )}

          {/* Persona grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {filtered.map((persona) => (
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
                  if (node) {
                    node.dataset.personaId = String(persona.id);
                  }
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Starting chat overlay */}
      {createConversationMutation.isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-6 py-4 shadow-2xl">
            <LoadingMessage>{t('omnichat.discover.startingChat')}</LoadingMessage>
          </div>
        </div>
      )}
    </OmniChatShell>
  );
}
