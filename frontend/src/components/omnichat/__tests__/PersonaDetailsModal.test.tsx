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
