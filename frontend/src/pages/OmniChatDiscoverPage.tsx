import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { omnichatService, omnichatQueryKeys } from '../services/omnichatService';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { useOmniChatLayoutMode } from '../hooks/useOmniChatLayoutMode';
import { useAuth } from '../contexts/AuthContext';
import PersonaAvatar from '../components/omnichat/PersonaAvatar';
import OmniChatSidebar from '../components/omnichat/OmniChatSidebar';
import SearchOverlay from '../components/omnichat/SearchOverlay';
import type { SidebarTab } from '../components/omnichat/OmniChatSidebar';
import type { BotConversation, BotPersona, PersonaCategory } from '../types/omnichat';

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

function PersonaCard({
  persona,
  onSelect,
  featured = false,
}: {
  persona: BotPersona;
  onSelect: (persona: BotPersona) => void;
  featured?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(persona)}
      className={`group relative w-full overflow-hidden text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2 rounded-2xl ${
        featured ? 'aspect-[16/10]' : 'aspect-[3/4]'
      }`}
    >
      <PersonaAvatar persona={persona} className="absolute inset-0 h-full w-full" />

      {/* 18+ badge */}
      {persona.is_nsfw && (
        <span className="absolute right-2.5 top-2.5 rounded-full bg-red-600/90 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
          18+
        </span>
      )}

      {/* Card label at bottom */}
      <div className="absolute inset-x-3 bottom-3">
        <p className="truncate text-sm font-semibold text-white drop-shadow-sm">
          {persona.name}
        </p>
        {featured && persona.description && (
          <p className="truncate text-xs text-white/65 mt-0.5">
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
  const { mode: layoutMode } = useOmniChatLayoutMode();
  const { isAuthenticated } = useAuth();
  const [category, setCategory] = useState<PersonaCategory | 'all'>('all');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('discover');
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

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
    } else if (tab === 'conversations') {
      navigate('/omnichat/conversations');
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
    mutationFn: (personaId: number) => omnichatService.createConversation(personaId),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: omnichatQueryKeys.conversations });
      navigate(`/omnichat/c/${conversation.id}`);
    },
  });

  const personas = personasQuery.data ?? EMPTY_PERSONAS;
  const conversations = conversationsQuery.data ?? [];

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

  const handleSignIn = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('open-auth-modal', {
        detail: { mode: 'login', redirectTo: '/omnichat' },
      })
    );
  }, []);

  return (
    <div className="omnichat-theme flex h-screen bg-[var(--color-background)]">
      <OmniChatSidebar
        activeTab={sidebarTab}
        onTabChange={handleSidebarTabChange}
        isAuthenticated={isAuthenticated}
        onSignIn={handleSignIn}
        mobileOpen={mobileSidebarOpen}
        onMobileOpen={() => setMobileSidebarOpen(true)}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <SearchOverlay
        isOpen={searchOverlayOpen}
        onClose={() => setSearchOverlayOpen(false)}
        personas={personas}
        onSelectPersona={handleSelect}
      />

      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* ── Header ── */}
        {layoutMode === 'immersive' && (
          <div className="px-4 pt-4 pb-2">
            <div className="mx-auto max-w-7xl">
              <div className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-5 py-3">
                <span className="text-base font-bold text-[var(--color-text-primary)]">
                  OmniChat
                </span>
                <Link
                  to="/"
                  className="text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                >
                  {t('omnichat.exitToSite')}
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="mx-auto w-full max-w-7xl px-4 py-6">

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
              <PersonaCard key={persona.id} persona={persona} onSelect={handleSelect} />
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
    </div>
  );
}
