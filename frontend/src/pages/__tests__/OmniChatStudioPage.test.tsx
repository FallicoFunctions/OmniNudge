import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OmniChatStudioPage from '../OmniChatStudioPage';

const {
  mockListMyPersonas,
  mockGetPersonaDefinition,
  mockCreatePersona,
  mockUpdatePersona,
  mockDeletePersona,
  mockCreateConversation,
  mockListVoicePresets,
  mockGetPersonaVoice,
  mockUpdatePersonaVoice,
  mockPreviewVoicePreset,
} = vi.hoisted(() => ({
  mockListMyPersonas: vi.fn(),
  mockGetPersonaDefinition: vi.fn(),
  mockCreatePersona: vi.fn(),
  mockUpdatePersona: vi.fn(),
  mockDeletePersona: vi.fn(),
  mockCreateConversation: vi.fn(),
  mockListVoicePresets: vi.fn(),
  mockGetPersonaVoice: vi.fn(),
  mockUpdatePersonaVoice: vi.fn(),
  mockPreviewVoicePreset: vi.fn(),
}));

let mockIsAuthenticated = true;
let mockIsLoading = false;
let mockRole: 'admin' | 'user' = 'admin';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 7, role: mockRole },
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
  }),
}));

vi.mock('../../components/omnichat/OmniChatShell', () => ({
  default: ({
    activeTab,
    onTabChange,
    children,
  }: {
    activeTab: string;
    onTabChange: (tab: 'discover' | 'search' | 'chat' | 'studio') => void;
    children: React.ReactNode;
  }) => (
    <div>
      <div data-testid="active-tab">{activeTab}</div>
      <button type="button" onClick={() => onTabChange('search')}>
        Sidebar Search
      </button>
      {children}
    </div>
  ),
}));

vi.mock('../../services/omnichatService', () => ({
  omnichatQueryKeys: {
    voicePresets: ['omnichat', 'voice-presets'],
    personaVoice: (id: number) => ['omnichat', 'persona-voice', id],
  },
  omnichatService: {
    listMyPersonas: (...args: unknown[]) => mockListMyPersonas(...args),
    getPersonaDefinition: (...args: unknown[]) => mockGetPersonaDefinition(...args),
    updatePersona: (...args: unknown[]) => mockUpdatePersona(...args),
    deletePersona: (...args: unknown[]) => mockDeletePersona(...args),
    createConversation: (...args: unknown[]) => mockCreateConversation(...args),
    exportPersona: vi.fn(),
    listVoicePresets: (...args: unknown[]) => mockListVoicePresets(...args),
    getPersonaVoice: (...args: unknown[]) => mockGetPersonaVoice(...args),
    updatePersonaVoice: (...args: unknown[]) => mockUpdatePersonaVoice(...args),
    previewVoicePreset: (...args: unknown[]) => mockPreviewVoicePreset(...args),
  },
}));

vi.mock('../../utils/mediaUrl', () => ({
  resolveMediaUrl: (value?: string) => value,
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
  }

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

describe('OmniChatStudioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = true;
    mockIsLoading = false;
    mockRole = 'admin';
    mockListMyPersonas.mockResolvedValue([]);
    mockGetPersonaDefinition.mockResolvedValue(null);
    mockCreatePersona.mockResolvedValue({
      id: 77,
      slug: 'u7-launch-wizard',
      name: 'Launch Wizard',
      description: 'Helps with launch readiness.',
      category: 'helper',
      owner_user_id: 7,
      visibility: 'private',
      source_format: 'native',
      system_prompt: '',
      personality: 'Calm',
      scenario: '',
      first_message: 'Hello there.',
      example_dialogue: '',
      response_style_profile: 'natural_dialogue',
      post_history_instructions: '',
      alternate_greetings: [],
      creator_notes: '',
      tags: ['launch'],
      creator_name: 'Owner',
      character_version: '1.0',
      avatar_url: '',
      preview_video_url: '',
      gallery_urls: [],
      is_nsfw: false,
      is_active: true,
      character_book_json: {},
      extensions_json: {},
      created_at: '2026-07-11T00:00:00Z',
      updated_at: '2026-07-11T00:00:00Z',
    });
    mockUpdatePersona.mockImplementation((_personaId, payload) =>
      Promise.resolve({
        id: 77,
        slug: 'u7-launch-wizard',
        owner_user_id: 7,
        visibility: 'private',
        source_format: 'native',
        is_nsfw: false,
        is_active: true,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:01Z',
        ...payload,
      })
    );
    mockDeletePersona.mockResolvedValue(undefined);
    mockCreateConversation.mockResolvedValue({ id: 88 });
    mockListVoicePresets.mockResolvedValue({
      voicebox_available: true,
      voice_cloning_enabled: false,
      presets: [
        ...['Heart', 'Bella', 'Nova', 'Sarah', 'Sky', 'Emma'].map((name, index) => ({
          id: ['af_heart', 'af_bella', 'af_nova', 'af_sarah', 'af_sky', 'bf_emma'][index],
          name,
          gender: 'female' as const,
          provider: 'voicebox' as const,
          voice_id: ['af_heart', 'af_bella', 'af_nova', 'af_sarah', 'af_sky', 'bf_emma'][index],
          model_id: 'kokoro',
          language_code: 'en',
        })),
        ...['Adam', 'Echo', 'Eric', 'Liam', 'Onyx', 'George'].map((name, index) => ({
          id: ['am_adam', 'am_echo', 'am_eric', 'am_liam', 'am_onyx', 'bm_george'][index],
          name,
          gender: 'male' as const,
          provider: 'voicebox' as const,
          voice_id: ['am_adam', 'am_echo', 'am_eric', 'am_liam', 'am_onyx', 'bm_george'][index],
          model_id: 'kokoro',
          language_code: 'en',
        })),
      ],
    });
    mockGetPersonaVoice.mockResolvedValue({
      persona_id: 77,
      provider: 'voicebox',
      voice_id: 'af_heart',
      voice_name: 'Heart',
      model_id: 'kokoro',
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      speed: 1,
      pitch: 1,
      language_code: 'en',
      active: true,
    });
    mockUpdatePersonaVoice.mockResolvedValue(undefined);
    mockPreviewVoicePreset.mockResolvedValue(new Blob(['wav'], { type: 'audio/wav' }));
  });

  it('routes sidebar search to discover with the search overlay query flag', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Sidebar Search' }));

    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/omnichat?search=1');
  });

  it('redirects guests to discover and opens auth when visiting studio directly', async () => {
    mockIsAuthenticated = false;
    const authEventListener = vi.fn();
    window.addEventListener('open-auth-modal', authEventListener);

    renderPage();

    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/omnichat');
    expect(authEventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('open-auth-modal', authEventListener);
  });

  it('opens guided creation without showing the raw character form or import', async () => {
    renderPage();
    expect(await screen.findByText('You have no roleplay characters yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.queryByText('Upload .png or .json')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Roleplay AI' }));
    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/omnichat/new-roleplay');
  });

  it('keeps raw character instructions hidden from members while allowing voice selection', async () => {
    mockRole = 'user';
    const persona = await mockCreatePersona();
    mockListMyPersonas.mockResolvedValue([persona]);
    mockGetPersonaDefinition.mockResolvedValue(persona);
    renderPage();
    expect(
      await screen.findByText(/Free-text character editing is unavailable/)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(document.querySelector('textarea')).toBeNull();
    const voiceSelect = screen.getByLabelText('Character voice');
    await waitFor(() => expect(voiceSelect).toHaveValue('af_heart'));
    fireEvent.change(voiceSelect, { target: { value: 'af_bella' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save voice' }));
    await waitFor(() => expect(mockUpdatePersonaVoice).toHaveBeenCalledTimes(1));
    expect(mockUpdatePersona).not.toHaveBeenCalled();
  });

  it('offers six female and six male server voices while keeping cloning gated', async () => {
    const persona = await mockCreatePersona();
    mockListMyPersonas.mockResolvedValue([persona]);
    mockGetPersonaDefinition.mockResolvedValue(persona);
    renderPage();

    const voiceSelect = await screen.findByLabelText('Character voice');
    await waitFor(() => expect(voiceSelect).toHaveValue('af_heart'));
    expect(
      screen.getByRole('group', { name: 'Female voices' }).querySelectorAll('option')
    ).toHaveLength(6);
    expect(
      screen.getByRole('group', { name: 'Male voices' }).querySelectorAll('option')
    ).toHaveLength(6);
    expect(screen.getByText('Custom voice cloning is coming later.')).toBeInTheDocument();
  });

  it('maps a saved provider voice ID back to its stable catalog option ID', async () => {
    const savedPersona = await mockCreatePersona();
    mockListMyPersonas.mockResolvedValue([savedPersona]);
    mockGetPersonaDefinition.mockResolvedValue(savedPersona);
    mockListVoicePresets.mockResolvedValue({
      voicebox_available: true,
      voice_cloning_enabled: false,
      presets: [
        {
          id: 'heart-catalog-v2',
          name: 'Heart',
          gender: 'female',
          provider: 'voicebox',
          voice_id: 'provider-heart-v1',
          model_id: 'kokoro',
          language_code: 'en',
        },
      ],
    });
    mockGetPersonaVoice.mockResolvedValue({
      persona_id: 77,
      provider: 'voicebox',
      voice_id: 'provider-heart-v1',
      voice_name: 'Heart',
      model_id: 'kokoro',
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      speed: 1,
      pitch: 1,
      language_code: 'en',
      active: true,
    });

    renderPage();

    await screen.findByDisplayValue('Hello there.');
    await waitFor(() =>
      expect(screen.getByLabelText('Character voice')).toHaveValue('heart-catalog-v2')
    );
  });

  it('persists the browser fallback when no local preset is selected', async () => {
    const persona = await mockCreatePersona();
    mockListMyPersonas.mockResolvedValue([persona]);
    mockGetPersonaDefinition.mockResolvedValue(persona);
    renderPage();
    const voice = await screen.findByLabelText('Character voice');
    await waitFor(() => expect(voice).toHaveValue('af_heart'));
    fireEvent.change(voice, { target: { value: '' } });
    expect(voice).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Opening Message'), {
      target: { value: 'Hello from the browser voice.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(mockUpdatePersonaVoice).toHaveBeenCalledWith(
        77,
        expect.objectContaining({ provider: 'browser', voice_id: 'browser-77' })
      )
    );
  });

  it('releases preview audio when browser playback fails', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:voice-preview');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
    const pause = vi.fn();
    class RejectedAudio {
      pause = pause;
      addEventListener = vi.fn();
      play = vi.fn().mockRejectedValue(new Error('Playback blocked'));
    }
    vi.stubGlobal('Audio', RejectedAudio);

    try {
      const persona = await mockCreatePersona();
      mockListMyPersonas.mockResolvedValue([persona]);
      mockGetPersonaDefinition.mockResolvedValue(persona);
      renderPage();
      await waitFor(() => expect(screen.getByLabelText('Character voice')).toHaveValue('af_heart'));
      fireEvent.click(await screen.findByRole('button', { name: 'Preview voice' }));

      expect(await screen.findByText('Playback blocked')).toBeInTheDocument();
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(pause).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:voice-preview');
    } finally {
      vi.unstubAllGlobals();
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });

  it('retries a failed voice assignment on the same character', async () => {
    const persona = await mockCreatePersona();
    mockListMyPersonas.mockResolvedValue([persona]);
    mockGetPersonaDefinition.mockResolvedValue(persona);
    mockUpdatePersonaVoice
      .mockRejectedValueOnce(new Error('Voice service unavailable'))
      .mockResolvedValueOnce(undefined);
    renderPage();
    await screen.findByDisplayValue('Hello there.');
    await waitFor(() => expect(screen.getByLabelText('Character voice')).toHaveValue('af_heart'));
    fireEvent.change(screen.getByLabelText('Opening Message'), {
      target: { value: 'Retry this character.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByText('Voice service unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mockUpdatePersonaVoice).toHaveBeenCalledTimes(2));
    expect(mockUpdatePersona).toHaveBeenCalledTimes(2);
  });

  it('requires a prepared opening when editing a character', async () => {
    const persona = { ...(await mockCreatePersona()), first_message: '', alternate_greetings: [] };
    mockListMyPersonas.mockResolvedValue([persona]);
    mockGetPersonaDefinition.mockResolvedValue(persona);
    renderPage();
    await screen.findByDisplayValue('Launch Wizard');
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(
      await screen.findByText('Add an opening message or at least one alternate greeting.')
    ).toBeInTheDocument();
    expect(mockUpdatePersona).not.toHaveBeenCalled();
  });

  it('opens a chat for the selected persona and navigates to the conversation page', async () => {
    mockListMyPersonas.mockResolvedValue([
      {
        id: 77,
        slug: 'u7-launch-wizard',
        name: 'Launch Wizard',
        description: 'Helps with launch readiness.',
        category: 'helper',
        visibility: 'private',
        owner_user_id: 7,
        is_nsfw: false,
        is_active: true,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
      },
    ]);
    mockGetPersonaDefinition.mockResolvedValue({
      id: 77,
      slug: 'u7-launch-wizard',
      name: 'Launch Wizard',
      description: 'Helps with launch readiness.',
      category: 'helper',
      owner_user_id: 7,
      visibility: 'private',
      source_format: 'native',
      system_prompt: '',
      personality: '',
      scenario: '',
      first_message: 'Ready when you are.',
      example_dialogue: '',
      response_style_profile: 'natural_dialogue',
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
      created_at: '2026-07-11T00:00:00Z',
      updated_at: '2026-07-11T00:00:00Z',
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Open Chat' }));

    await waitFor(() => {
      expect(mockCreateConversation).toHaveBeenCalledWith(77, undefined, true);
    });
    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/omnichat/c/88');
  });

  it('shows a saved confirmation after updating a selected persona', async () => {
    mockListMyPersonas.mockResolvedValue([
      {
        id: 77,
        slug: 'u7-launch-wizard',
        name: 'Launch Wizard',
        description: 'Helps with launch readiness.',
        category: 'helper',
        visibility: 'private',
        owner_user_id: 7,
        is_nsfw: false,
        is_active: true,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
      },
    ]);
    mockGetPersonaDefinition.mockResolvedValue({
      id: 77,
      slug: 'u7-launch-wizard',
      name: 'Launch Wizard',
      description: 'Helps with launch readiness.',
      category: 'helper',
      owner_user_id: 7,
      visibility: 'private',
      source_format: 'native',
      system_prompt: '',
      personality: '',
      scenario: '',
      first_message: 'Ready when you are.',
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
      created_at: '2026-07-11T00:00:00Z',
      updated_at: '2026-07-11T00:00:00Z',
    });

    renderPage();

    await screen.findByDisplayValue('Ready when you are.');
    fireEvent.change(await screen.findByLabelText('Description'), {
      target: { value: 'Updated launch helper.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockUpdatePersona).toHaveBeenCalledWith(
        77,
        expect.objectContaining({ description: 'Updated launch helper.' })
      );
    });
    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
  });

  it('does not offer character media uploads or send media fields on edit', async () => {
    const persona = {
      ...(await mockCreatePersona()),
      avatar_url: '/uploads/existing-avatar.png',
      preview_video_url: '/uploads/existing-video.mp4',
      gallery_urls: ['/uploads/existing-gallery.png'],
    };
    mockListMyPersonas.mockResolvedValue([persona]);
    mockGetPersonaDefinition.mockResolvedValue(persona);
    renderPage();
    await screen.findByDisplayValue('Hello there.');
    expect(document.querySelector('input[type="file"]')).toBeNull();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Edited description' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mockUpdatePersona).toHaveBeenCalled());
    const payload = mockUpdatePersona.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('avatar_url');
    expect(payload).not.toHaveProperty('preview_video_url');
    expect(payload).not.toHaveProperty('gallery_urls');
    expect(payload).not.toHaveProperty('extensions_json');
  });

  it('shows the delete actions when a persona is selected', async () => {
    mockListMyPersonas.mockResolvedValue([
      {
        id: 77,
        slug: 'u7-launch-wizard',
        name: 'Launch Wizard',
        description: 'Helps with launch readiness.',
        category: 'helper',
        visibility: 'private',
        owner_user_id: 7,
        is_nsfw: false,
        is_active: true,
        created_at: '2026-07-11T00:00:00Z',
        updated_at: '2026-07-11T00:00:00Z',
      },
    ]);
    mockGetPersonaDefinition.mockResolvedValue({
      id: 77,
      slug: 'u7-launch-wizard',
      name: 'Launch Wizard',
      description: 'Helps with launch readiness.',
      category: 'helper',
      owner_user_id: 7,
      visibility: 'private',
      source_format: 'native',
      system_prompt: '',
      personality: '',
      scenario: '',
      first_message: 'Ready when you are.',
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
      created_at: '2026-07-11T00:00:00Z',
      updated_at: '2026-07-11T00:00:00Z',
    });

    renderPage();

    expect(await screen.findByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Character' })).toBeInTheDocument();
  });
});
