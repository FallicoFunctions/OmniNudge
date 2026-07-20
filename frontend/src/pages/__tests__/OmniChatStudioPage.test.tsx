import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OmniChatStudioPage from '../OmniChatStudioPage';

const {
  mockListMyPersonas,
  mockGetPersonaDefinition,
  mockCreatePersona,
  mockUpdatePersona,
  mockDeletePersona,
  mockCreateConversation,
  mockImportPersona,
  mockUploadMedia,
} = vi.hoisted(() => ({
  mockListMyPersonas: vi.fn(),
  mockGetPersonaDefinition: vi.fn(),
  mockCreatePersona: vi.fn(),
  mockUpdatePersona: vi.fn(),
  mockDeletePersona: vi.fn(),
  mockCreateConversation: vi.fn(),
  mockImportPersona: vi.fn(),
  mockUploadMedia: vi.fn(),
}));

let mockIsAuthenticated = true;
let mockIsLoading = false;

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated, isLoading: mockIsLoading }),
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
  omnichatService: {
    listMyPersonas: (...args: unknown[]) => mockListMyPersonas(...args),
    getPersonaDefinition: (...args: unknown[]) => mockGetPersonaDefinition(...args),
    createPersona: (...args: unknown[]) => mockCreatePersona(...args),
    updatePersona: (...args: unknown[]) => mockUpdatePersona(...args),
    deletePersona: (...args: unknown[]) => mockDeletePersona(...args),
    createConversation: (...args: unknown[]) => mockCreateConversation(...args),
    importPersona: (...args: unknown[]) => mockImportPersona(...args),
    exportPersona: vi.fn(),
  },
}));

vi.mock('../../services/mediaService', () => ({
  mediaService: {
    uploadMedia: (...args: unknown[]) => mockUploadMedia(...args),
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
    mockImportPersona.mockResolvedValue({
      id: 91,
      slug: 'u7-imported-wizard',
      name: 'Imported Wizard',
      description: 'Imported from PNG.',
      category: 'roleplay',
      owner_user_id: 7,
      visibility: 'private',
      source_format: 'chara_card_v2',
      system_prompt: '',
      personality: '',
      scenario: '',
      first_message: '',
      example_dialogue: '',
      response_style_profile: 'character_only',
      post_history_instructions: '',
      alternate_greetings: [],
      creator_notes: '',
      tags: ['imported'],
      creator_name: 'Importer',
      character_version: '1.0',
      avatar_url: '/uploads/imported-avatar.png',
      preview_video_url: '',
      gallery_urls: [],
      is_nsfw: false,
      is_active: true,
      character_book_json: {},
      extensions_json: {},
      import_source_filename: 'card.png',
      created_at: '2026-07-11T00:00:00Z',
      updated_at: '2026-07-11T00:00:00Z',
    });
    mockUploadMedia.mockResolvedValue({
      storage_url: '/uploads/imported-avatar.png',
      storage_path: 'uploads/imported-avatar.png',
    });
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

  it('creates a character from the editor form', async () => {
    renderPage();

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Launch Wizard' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Helps with launch readiness.' },
    });
    fireEvent.change(screen.getByLabelText('Personality'), {
      target: { value: 'Calm' },
    });
    fireEvent.change(screen.getByLabelText('Creator Name'), {
      target: { value: 'Owner' },
    });
    fireEvent.change(screen.getByLabelText('Character Version'), {
      target: { value: '1.0' },
    });
    fireEvent.change(screen.getByLabelText('Tags'), {
      target: { value: 'launch, helper, launch' },
    });
    fireEvent.change(screen.getByLabelText('Response Style'), {
      target: { value: 'professional' },
    });
    fireEvent.change(screen.getByLabelText('Example Dialogue'), {
      target: { value: '<START>\n{{User}}: Help me launch.\n{{Char}}: Show me the checklist.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create Character' }));

    await waitFor(() => {
      expect(mockCreatePersona).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Launch Wizard',
          description: 'Helps with launch readiness.',
          personality: 'Calm',
          creator_name: 'Owner',
          character_version: '1.0',
          tags: ['launch', 'helper', 'launch'],
          response_style_profile: 'professional',
          example_dialogue: '<START>\n{{User}}: Help me launch.\n{{Char}}: Show me the checklist.',
        })
      );
    });
  });

  it('imports a PNG card by uploading the avatar and forwarding the uploaded media URL', async () => {
    renderPage();

    const importLabel = screen.getByText('Upload .png or .json').closest('label');
    const importInput = importLabel?.querySelector('input[type="file"]') as HTMLInputElement | null;

    expect(importInput).not.toBeNull();

    const pngFile = new File([new Uint8Array([137, 80, 78, 71])], 'card.png', {
      type: 'image/png',
    });
    fireEvent.change(importInput!, { target: { files: [pngFile] } });

    await waitFor(() => {
      expect(mockUploadMedia).toHaveBeenCalledWith(pngFile);
      expect(mockImportPersona).toHaveBeenCalledWith(pngFile, {
        avatarUrl: '/uploads/imported-avatar.png',
      });
    });
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
      first_message: '',
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
      created_at: '2026-07-11T00:00:00Z',
      updated_at: '2026-07-11T00:00:00Z',
    });

    renderPage();

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

  it('uploads avatar, preview video, and gallery images into the save payload', async () => {
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
      created_at: '2026-07-11T00:00:00Z',
      updated_at: '2026-07-11T00:00:00Z',
    });
    mockUploadMedia
      .mockResolvedValueOnce({ storage_url: '/uploads/avatar.png', storage_path: 'uploads/avatar.png' })
      .mockResolvedValueOnce({ storage_url: '/uploads/preview.mp4', storage_path: 'uploads/preview.mp4' })
      .mockResolvedValueOnce({ storage_url: '/uploads/gallery.png', storage_path: 'uploads/gallery.png' });

    renderPage();

    await screen.findByRole('button', { name: 'Save Changes' });

    const avatarInput = document.getElementById('omnichat-studio-avatar-file') as HTMLInputElement;
    const videoInput = document.getElementById('omnichat-studio-preview-video-file') as HTMLInputElement;
    const galleryInput = document.getElementById('omnichat-studio-gallery-file') as HTMLInputElement;

    fireEvent.change(avatarInput, {
      target: { files: [new File(['avatar'], 'avatar.png', { type: 'image/png' })] },
    });
    fireEvent.change(videoInput, {
      target: { files: [new File(['video'], 'preview.mp4', { type: 'video/mp4' })] },
    });
    fireEvent.change(galleryInput, {
      target: { files: [new File(['gallery'], 'gallery.png', { type: 'image/png' })] },
    });

    await waitFor(() => {
      expect(mockUploadMedia).toHaveBeenCalledTimes(3);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockUpdatePersona).toHaveBeenCalledWith(
        77,
        expect.objectContaining({
          avatar_url: '/uploads/avatar.png',
          preview_video_url: '/uploads/preview.mp4',
          gallery_urls: ['/uploads/gallery.png'],
        })
      );
    });
  });

  it('removes uploaded media before saving', async () => {
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
      first_message: '',
      example_dialogue: '',
      post_history_instructions: '',
      alternate_greetings: [],
      creator_notes: '',
      tags: [],
      creator_name: '',
      character_version: '',
      avatar_url: '/uploads/avatar.png',
      preview_video_url: '/uploads/preview.mp4',
      gallery_urls: ['/uploads/gallery.png'],
      is_nsfw: false,
      is_active: true,
      character_book_json: {},
      extensions_json: {},
      created_at: '2026-07-11T00:00:00Z',
      updated_at: '2026-07-11T00:00:00Z',
    });

    renderPage();

    await screen.findByRole('button', { name: 'Save Changes' });
    await screen.findByAltText('Avatar Image');
    await screen.findByAltText('Gallery image 1');

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove image' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove video' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockUpdatePersona).toHaveBeenCalledWith(
        77,
        expect.objectContaining({
          avatar_url: undefined,
          preview_video_url: undefined,
          gallery_urls: [],
        })
      );
    });
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
      created_at: '2026-07-11T00:00:00Z',
      updated_at: '2026-07-11T00:00:00Z',
    });

    renderPage();

    expect(await screen.findByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Character' })).toBeInTheDocument();
  });
});
