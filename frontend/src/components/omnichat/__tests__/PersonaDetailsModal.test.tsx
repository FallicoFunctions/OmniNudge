import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import PersonaDetailsModal from '../PersonaDetailsModal';

const { mockGetPersonaDefinition } = vi.hoisted(() => ({
  mockGetPersonaDefinition: vi.fn(),
}));

vi.mock('../../../services/omnichatService', () => ({
  omnichatService: {
    getPersonaDefinition: (...args: unknown[]) => mockGetPersonaDefinition(...args),
  },
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, isAuthenticated: true }),
}));

vi.mock('../../../utils/mediaUrl', () => ({
  resolveMediaUrl: (value: string) => value,
}));

describe('PersonaDetailsModal', () => {
  it('loads and renders the full persona definition', async () => {
    mockGetPersonaDefinition.mockResolvedValue({
      id: 17,
      slug: 'bob',
      name: 'Bob',
      description: 'Dungeon guide',
      category: 'roleplay',
      owner_user_id: 1,
      visibility: 'private',
      system_prompt: 'Stay in character.',
      personality: 'Cautious and theatrical.',
      scenario: 'A cavern entrance.',
      first_message: 'Choose your path.',
      example_dialogue: 'Bob: The tunnel narrows.',
      post_history_instructions: 'Keep the tone tense.',
      alternate_greetings: ['Back again?'],
      creator_notes: 'Internal note',
      tags: ['fantasy', 'guide'],
      creator_name: 'Nick',
      character_version: '1.0',
      avatar_url: 'https://example.com/avatar.png',
      preview_video_url: '',
      gallery_urls: ['https://example.com/1.png'],
      is_nsfw: false,
      is_active: true,
      character_book_json: { lore: ['cavern'] },
      extensions_json: { voice: 'calm' },
      created_at: '2026-07-01T10:00:00Z',
      updated_at: '2026-07-01T10:00:00Z',
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PersonaDetailsModal
          isOpen
          onClose={() => undefined}
          persona={{
            id: 17,
            slug: 'bob',
            name: 'Bob',
            category: 'roleplay',
            is_nsfw: false,
            is_active: true,
            created_at: '2026-07-01T10:00:00Z',
            updated_at: '2026-07-01T10:00:00Z',
          }}
        />
      </QueryClientProvider>
    );

    expect(await screen.findByDisplayValue('Cautious and theatrical.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Stay in character.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('fantasy, guide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Character' })).toBeInTheDocument();
    expect(mockGetPersonaDefinition).toHaveBeenCalledWith(17);
  });

  it('hides destructive controls for non-owners', async () => {
    mockGetPersonaDefinition.mockResolvedValue({
      id: 21,
      slug: 'public-guide',
      name: 'Public Guide',
      description: 'A public helper bot',
      category: 'helper',
      owner_user_id: undefined,
      visibility: 'public',
      system_prompt: '',
      personality: '',
      scenario: '',
      first_message: '',
      example_dialogue: '',
      post_history_instructions: '',
      alternate_greetings: [],
      creator_notes: '',
      tags: [],
      creator_name: '',
      character_version: '',
      avatar_url: '',
      preview_video_url: '',
      gallery_urls: [],
      is_nsfw: false,
      is_active: true,
      character_book_json: {},
      extensions_json: {},
      created_at: '2026-07-01T10:00:00Z',
      updated_at: '2026-07-01T10:00:00Z',
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PersonaDetailsModal
          isOpen
          onClose={() => undefined}
          persona={{
            id: 21,
            slug: 'public-guide',
            name: 'Public Guide',
            category: 'helper',
            is_nsfw: false,
            is_active: true,
            created_at: '2026-07-01T10:00:00Z',
            updated_at: '2026-07-01T10:00:00Z',
          }}
        />
      </QueryClientProvider>
    );

    expect(await screen.findByDisplayValue('public')).toBeInTheDocument();
    expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Character' })).not.toBeInTheDocument();
  });
});

describe('deleting an OmniAI', () => {
  const definition = (profile: string) => ({
    id: 31,
    slug: 'nadia',
    name: 'Nadia',
    description: 'x',
    category: 'original',
    owner_user_id: 1,
    visibility: 'private',
    system_prompt: '',
    personality: 'p',
    scenario: '',
    first_message: '',
    example_dialogue: '',
    post_history_instructions: '',
    alternate_greetings: [],
    creator_notes: '',
    tags: [],
    creator_name: '',
    character_version: '',
    response_style_profile: profile,
  });

  const renderFor = (profile: string) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PersonaDetailsModal
          isOpen
          onClose={() => undefined}
          persona={
            {
              id: 31,
              slug: 'nadia',
              name: 'Nadia',
              category: 'original',
              is_nsfw: false,
              is_active: true,
              created_at: '2026-07-01T10:00:00Z',
              updated_at: '2026-07-01T10:00:00Z',
              response_style_profile: profile,
            } as never
          }
        />
      </QueryClientProvider>
    );
  };

  it('says what happens to her, and claims nothing about her memory', async () => {
    mockGetPersonaDefinition.mockResolvedValue(definition('direct_message'));
    renderFor('direct_message');

    // Her conversation memories are self tier -- persona-global, and untouched
    // by leaving. Telling somebody they were deleted would be false, and would
    // contradict the notice this product already shows: she remembers across
    // everyone and may repeat what you said. So the screen says neither.
    const copy = await screen.findByText(/removed from your characters/);
    expect(copy).toBeInTheDocument();
    expect(copy.textContent).toMatch(/general nursery/);
    expect(screen.queryByText(/memor/i)).toBeNull();
    expect(screen.queryByText(/forget/i)).toBeNull();

    // Nor does it promise they can never speak again. If she is kept and joins
    // the community, they can -- as somebody she has no relationship with.
    expect(screen.queryByText(/never (talk|speak)/i)).toBeNull();
  });

  it('leaves a roleplay character with the wording for a card', async () => {
    mockGetPersonaDefinition.mockResolvedValue(definition('natural_dialogue'));
    renderFor('natural_dialogue');

    expect(await screen.findByText(/private persona library/)).toBeInTheDocument();
    expect(screen.queryByText(/general nursery/)).toBeNull();
  });
});
