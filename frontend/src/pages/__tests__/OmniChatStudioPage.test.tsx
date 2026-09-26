import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BotPersona } from '../../types/omnichat';
import OmniChatStudioPage from '../OmniChatStudioPage';

const {
  mockListMyPersonas,
  mockGetPersonaDefinition,
  mockDeletePersona,
  mockCreateConversation,
  mockListVoicePresets,
} = vi.hoisted(() => ({
  mockListMyPersonas: vi.fn(),
  mockGetPersonaDefinition: vi.fn(),
  mockDeletePersona: vi.fn(),
  mockCreateConversation: vi.fn(),
  mockListVoicePresets: vi.fn(),
}));

let mockIsAuthenticated = true;
let mockIsLoading = false;
let mockRole = 'admin';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 7, role: mockRole },
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
  }),
}));

vi.mock('../../components/omnichat/OmniChatShell', () => ({
  default: ({
    children,
    onTabChange,
  }: {
    children: React.ReactNode;
    onTabChange: (tab: 'search') => void;
  }) => (
    <div>
      <button onClick={() => onTabChange('search')}>Sidebar Search</button>
      {children}
    </div>
  ),
}));

vi.mock('../../services/omnichatService', () => ({
  omnichatService: {
    listMyPersonas: (...args: unknown[]) => mockListMyPersonas(...args),
    getPersonaDefinition: (...args: unknown[]) => mockGetPersonaDefinition(...args),
    deletePersona: (...args: unknown[]) => mockDeletePersona(...args),
    createConversation: (...args: unknown[]) => mockCreateConversation(...args),
    listVoicePresets: (...args: unknown[]) => mockListVoicePresets(...args),
  },
}));

const characters: BotPersona[] = [
  {
    id: 77,
    slug: 'maya-hart',
    name: 'Maya Hart',
    description: 'A private investigator.',
    category: 'roleplay',
    owner_user_id: 7,
    visibility: 'private',
    response_style_profile: 'natural_dialogue',
    is_nsfw: false,
    is_active: true,
    created_at: '2026-09-25T00:00:00Z',
    updated_at: '2026-09-25T00:00:00Z',
  },
  {
    id: 78,
    slug: 'jonas-reed',
    name: 'Jonas Reed',
    description: 'A musician.',
    category: 'roleplay',
    owner_user_id: 7,
    visibility: 'private',
    response_style_profile: 'natural_dialogue',
    is_nsfw: false,
    is_active: true,
    created_at: '2026-09-25T00:00:00Z',
    updated_at: '2026-09-25T00:00:00Z',
  },
];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/omnichat/studio']}>
        <Routes>
          <Route path="/omnichat/studio" element={<OmniChatStudioPage />} />
          <Route path="/omnichat/new-roleplay" element={<LocationProbe />} />
          <Route path="/omnichat" element={<LocationProbe />} />
          <Route path="/omnichat/c/:conversationId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('My Characters', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockRole = 'admin';
    mockListMyPersonas.mockResolvedValue(characters);
    mockCreateConversation.mockResolvedValue({ id: 88 });
    mockDeletePersona.mockImplementation(async (id: number) => {
      mockListMyPersonas.mockResolvedValue(characters.filter((persona) => persona.id !== id));
    });
  });

  it.each(['admin', 'user'])(
    'shows the library without an editor for %s accounts',
    async (role) => {
      mockRole = role;
      renderPage();
      expect(screen.getByRole('heading', { name: 'My Characters' })).toBeInTheDocument();
      expect(await screen.findByRole('article', { name: 'Maya Hart' })).toBeInTheDocument();
      expect(screen.getByRole('article', { name: 'Jonas Reed' })).toBeInTheDocument();
      expect(screen.queryByText('Persona Editor')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Export JSON' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
      expect(document.querySelector('input, textarea, select')).toBeNull();
      expect(mockGetPersonaDefinition).not.toHaveBeenCalled();
      expect(mockListVoicePresets).not.toHaveBeenCalled();
    }
  );

  it('opens guided creation from the empty library', async () => {
    mockListMyPersonas.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('You have no characters yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Roleplay AI' }));
    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/omnichat/new-roleplay');
  });

  it('opens a chat for the chosen card rather than the first character', async () => {
    renderPage();
    const card = await screen.findByRole('article', { name: 'Jonas Reed' });
    fireEvent.click(within(card).getByRole('button', { name: 'Open Chat' }));
    await waitFor(() => expect(mockCreateConversation).toHaveBeenCalledWith(78, undefined, true));
    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/omnichat/c/88');
  });

  it('allows another attempt when opening a chat fails', async () => {
    mockCreateConversation.mockRejectedValueOnce(new Error('Network failed'));
    renderPage();
    const card = await screen.findByRole('article', { name: 'Maya Hart' });
    fireEvent.click(within(card).getByRole('button', { name: 'Open Chat' }));
    expect(
      await screen.findByText('Unable to open this chat. Please try again.')
    ).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Open Chat' }));
    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/omnichat/c/88');
  });

  it('confirms deletion for the chosen card and retains the other characters', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Jonas Reed' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete character?' });
    expect(
      within(dialog).getByText('This will remove Jonas Reed from My Characters.')
    ).toBeInTheDocument();
    expect(mockDeletePersona).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Character' }));
    await waitFor(() => expect(mockDeletePersona).toHaveBeenCalledWith(78));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('article', { name: 'Jonas Reed' })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Maya Hart' })).toBeInTheDocument();
  });

  it('cancels deletion without removing a character', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Maya Hart' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockDeletePersona).not.toHaveBeenCalled();
    expect(screen.getByRole('article', { name: 'Maya Hart' })).toBeInTheDocument();
  });

  it('keeps a failed deletion available to retry', async () => {
    mockDeletePersona.mockRejectedValueOnce(new Error('Network failed'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Jonas Reed' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Character' }));
    expect(
      await screen.findByText('Unable to delete this character. Please try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Jonas Reed' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Character' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockDeletePersona).toHaveBeenCalledTimes(2);
  });

  it('preserves the different removal explanation for an OmniAI', async () => {
    mockListMyPersonas.mockResolvedValue([
      { ...characters[0], response_style_profile: 'direct_message' },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Maya Hart' }));
    expect(
      within(screen.getByRole('dialog')).getByText(/OmniNudge may keep her/)
    ).toBeInTheDocument();
  });

  it('distinguishes a failed list request from an empty library', async () => {
    mockListMyPersonas.mockRejectedValue(new Error('Network failed'));
    renderPage();
    expect(await screen.findByText('Unable to load your characters.')).toBeInTheDocument();
    expect(screen.queryByText('You have no characters yet.')).not.toBeInTheDocument();
  });

  it('uses shared sidebar navigation for search', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Sidebar Search' }));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/omnichat?search=open');
  });

  it('redirects guests to discover and opens sign-in without fetching characters', async () => {
    mockIsAuthenticated = false;
    const authEventListener = vi.fn();
    window.addEventListener('open-auth-modal', authEventListener);
    try {
      renderPage();
      expect(await screen.findByTestId('location-probe')).toHaveTextContent('/omnichat');
      expect(authEventListener).toHaveBeenCalledTimes(1);
      expect(mockListMyPersonas).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('open-auth-modal', authEventListener);
    }
  });
});
