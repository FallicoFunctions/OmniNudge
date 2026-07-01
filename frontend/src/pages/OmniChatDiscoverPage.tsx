import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { omnichatService, omnichatQueryKeys } from '../services/omnichatService';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { useOmniChatLayoutMode } from '../hooks/useOmniChatLayoutMode';
import type { BotConversation, BotPersona, PersonaCategory } from '../types/omnichat';

// Stable reference so the useMemo hooks below don't see a "new" array on
// every render while personas are still loading.
const EMPTY_PERSONAS: BotPersona[] = [];

// Only the four categories shown in the design — extend as more are added.
const CATEGORIES: { value: PersonaCategory | 'all'; labelKey: string }[] = [
  { value: 'all', labelKey: 'omnichat.categories.all' },
  { value: 'roleplay', labelKey: 'omnichat.categories.roleplay' },
  { value: 'helper', labelKey: 'omnichat.categories.helper' },
  { value: 'romance', labelKey: 'omnichat.categories.romance' },
];

// --- Gradient helpers -------------------------------------------------------

// Per-slug gradients that match the design screenshot exactly.
const SLUG_GRADIENTS: Record<string, string> = {
  'after-dark':
    'radial-gradient(ellipse at 30% 30%, #c46a1a 0%, #7a3a0a 55%, #3d1a06 100%)',
  'chat-buddy':
    'radial-gradient(ellipse at 40% 25%, #c0256e 0%, #7a1050 55%, #3a0830 100%)',
  'dungeon-master':
    'radial-gradient(ellipse at 35% 30%, #0f7a5a 0%, #074d3a 55%, #022820 100%)',
  narrator:
    'radial-gradient(ellipse at 40% 25%, #8a1a30 0%, #5a0f20 55%, #2e0510 100%)',
  companion:
    'radial-gradient(ellipse at 35% 30%, #3b2a7a 0%, #21184a 55%, #100c28 100%)',
};

// Category fallback gradients — used for any persona that doesn't have a
// slug-specific entry above.
const CATEGORY_GRADIENTS: Record<string, string[]> = {
  roleplay: [
    'radial-gradient(ellipse at 35% 30%, #3b2a7a 0%, #21184a 55%, #100c28 100%)',
    'radial-gradient(ellipse at 40% 25%, #1a3a6e 0%, #0e1f42 55%, #060f22 100%)',
  ],
  helper: [
    'radial-gradient(ellipse at 40% 25%, #0f5e6e 0%, #073845 55%, #031c24 100%)',
    'radial-gradient(ellipse at 35% 30%, #1a4a2e 0%, #0d2a1a 55%, #061510 100%)',
  ],
  romance: [
    'radial-gradient(ellipse at 40% 25%, #7a1040 0%, #4a0a28 55%, #240512 100%)',
    'radial-gradient(ellipse at 35% 30%, #8a1a30 0%, #5a0f20 55%, #2e0510 100%)',
  ],
  original: [
    'radial-gradient(ellipse at 35% 30%, #5a3a10 0%, #382408 55%, #1c1204 100%)',
    'radial-gradient(ellipse at 40% 25%, #3a1a5a 0%, #220e38 55%, #11071e 100%)',
  ],
  anime_game: [
    'radial-gradient(ellipse at 40% 25%, #1a5a2e 0%, #0e3a1c 55%, #071d0f 100%)',
    'radial-gradient(ellipse at 35% 30%, #4a1a6a 0%, #2c0e42 55%, #170721 100%)',
  ],
  fiction_media: [
    'radial-gradient(ellipse at 40% 25%, #1a3a6e 0%, #0e2244 55%, #061120 100%)',
    'radial-gradient(ellipse at 35% 30%, #5a2a10 0%, #381808 55%, #1c0c04 100%)',
  ],
};

const DEFAULT_GRADIENTS = [
  'radial-gradient(ellipse at 35% 30%, #2a2a5a 0%, #181830 55%, #0c0c18 100%)',
  'radial-gradient(ellipse at 40% 25%, #1a3a2e 0%, #0e2018 55%, #07100c 100%)',
];

function getPersonaGradient(persona: BotPersona): string {
  if (SLUG_GRADIENTS[persona.slug]) {
    return SLUG_GRADIENTS[persona.slug];
  }
  const pool = CATEGORY_GRADIENTS[persona.category] ?? DEFAULT_GRADIENTS;
  return pool[persona.id % pool.length];
}

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
  const gradient = getPersonaGradient(persona);

  return (
    <button
      type="button"
      onClick={() => onSelect(persona)}
      className={`group relative w-full overflow-hidden text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--oc-primary)] focus-visible:outline-offset-2 rounded-2xl ${
        featured ? 'aspect-[16/10]' : 'aspect-[3/4]'
      }`}
    >
      {/* Background: avatar image or rich gradient */}
      {persona.avatar_url ? (
        <img
          src={persona.avatar_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: gradient }}
        />
      )}

      {/* Subtle vignette overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

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
        {/* Only show description on featured (wide) cards */}
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
  const [category, setCategory] = useState<PersonaCategory | 'all'>('all');

  const personasQuery = useQuery({
    queryKey: omnichatQueryKeys.personas(),
    queryFn: () => omnichatService.listPersonas(),
  });

  const conversationsQuery = useQuery({
    queryKey: omnichatQueryKeys.conversations,
    queryFn: () => omnichatService.listConversations(),
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
    const existing = findConversationForPersona(persona.id);
    if (existing) {
      navigate(`/omnichat/c/${existing.id}`);
      return;
    }
    // Backend get-or-create returns an existing thread if the conversations
    // list hasn't loaded yet (or was stale) when the user tapped the tile.
    createConversationMutation.mutate(persona.id);
  };

  return (
    <div className="omnichat-theme min-h-screen" style={{ background: 'var(--oc-bg)' }}>

      {/* ── Header ── */}
      {layoutMode === 'immersive' && (
        <div className="px-4 pt-4 pb-2">
          <div className="mx-auto max-w-7xl">
            <div
              className="flex items-center justify-between rounded-2xl px-5 py-3"
              style={{
                background: 'var(--oc-surface-elevated)',
                border: '1px solid var(--oc-border)',
              }}
            >
              <span className="text-base font-bold" style={{ color: 'var(--oc-text-primary)' }}>
                OmniChat
              </span>
              <Link
                to="/"
                className="text-sm font-medium transition-colors"
                style={{ color: 'var(--oc-text-secondary)' }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = 'var(--oc-text-primary)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = 'var(--oc-text-secondary)')
                }
              >
                {t('omnichat.exitToSite')}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="mx-auto max-w-7xl px-4 py-6">

        {/* Continue Chatting section — hidden until we have a resolvable persona card */}
        {!conversationsQuery.isLoading && continueChatting.length > 0 && (
          <section className="mb-8">
            <h2
              className="mb-4 text-xl font-bold"
              style={{ color: 'var(--oc-text-primary)' }}
            >
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
            <p
              className="mb-0.5 text-sm font-medium"
              style={{ color: 'var(--oc-text-secondary)' }}
            >
              {t('omnichat.discover.featuredEyebrow')}
            </p>
            <h1
              className="mb-4 text-2xl font-bold"
              style={{ color: 'var(--oc-text-primary)' }}
            >
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
                className="rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150"
                style={
                  isActive
                    ? {
                        background: 'var(--oc-primary)',
                        color: '#ffffff',
                        border: '1px solid transparent',
                      }
                    : {
                        background: 'transparent',
                        color: 'var(--oc-text-primary)',
                        border: '1px solid var(--oc-border)',
                      }
                }
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
          <p className="text-sm" style={{ color: 'var(--oc-text-secondary)' }}>
            {t('omnichat.discover.empty')}
          </p>
        )}

        {/* Persona grid — 4 columns on desktop, matching the screenshot */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((persona) => (
            <PersonaCard key={persona.id} persona={persona} onSelect={handleSelect} />
          ))}
        </div>
      </div>

      {/* Starting chat overlay */}
      {createConversationMutation.isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div
            className="rounded-2xl px-6 py-4 shadow-2xl"
            style={{
              background: 'var(--oc-surface-elevated)',
              border: '1px solid var(--oc-border)',
            }}
          >
            <LoadingMessage>{t('omnichat.discover.startingChat')}</LoadingMessage>
          </div>
        </div>
      )}
    </div>
  );
}
