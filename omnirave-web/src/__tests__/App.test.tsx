import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';

const mockWorldSession = {
  session: {
    playerId: 'guest-42',
    playerName: 'Guest-42',
    worldSocketUrl: 'ws://localhost:8092/ws',
    mode: 'guest' as const,
    activeZone: 'main_stage' as const,
    lastVenue: 'main_stage' as const,
    settings: {
      uiTheme: 'Luminous Panels',
      graphicsMode: 'auto' as const,
      graphicsLevel: 7,
      displayNames: true,
      chatCollapsed: false,
      crouchMode: 'hold' as const,
      cameraFollow: 'free' as const,
    },
    loadout: { hair: 'buzz', top: 'black_mesh' },
    zoneMedia: [
      { zoneId: 'main_stage' as const, videoId: 'abc', playlistIndex: 0, playheadSeconds: 12 },
      { zoneId: 'underground' as const, videoId: 'def', playlistIndex: 0, playheadSeconds: 4 },
      { zoneId: 'plurr_partay' as const, videoId: 'ghi', playlistIndex: 0, playheadSeconds: 8 },
    ],
    players: [
      {
        id: 'guest-42',
        zone: 'main_stage' as const,
        position: { x: 0, y: 0, z: 0 },
        loadout: { hair: 'buzz', top: 'black_mesh' },
      },
    ],
    venueStatus: {
      currentTrackLabel: 'DJ Hyperbeam warming up',
      totalPlayers: 84,
      venuePlayers: 27,
      audienceLabel: 'Front Rail',
    },
  },
  chatMessages: [],
  error: '',
  isLoading: false,
  hasJoinedWorld: true,
  isSavingLoadout: false,
  settings: {
    uiTheme: 'Luminous Panels',
    graphicsMode: 'auto' as const,
    graphicsLevel: 7,
    displayNames: true,
    chatCollapsed: false,
    crouchMode: 'hold' as const,
    cameraFollow: 'free' as const,
  },
  setSettings: vi.fn(),
  moveToZone: vi.fn(),
  saveLoadout: vi.fn(),
  sendChatMessage: vi.fn(),
};

vi.mock('../hooks/useWorldSession', () => ({
  useWorldSession: () => mockWorldSession,
}));

vi.mock('../hooks/useMobileMediaUnlock', () => ({
  useMobileMediaUnlock: () => ({
    unlocked: true,
    isTouchDevice: false,
    unlock: vi.fn(),
  }),
}));

vi.mock('../components/StageAudioDeck', () => ({
  StageAudioDeck: () => null,
}));

describe('App', () => {
  it('renders the persistent OmniRave HUD anchors', async () => {
    mockWorldSession.settings.chatCollapsed = false;
    mockWorldSession.session.settings.chatCollapsed = false;

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Avatar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log In' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.getByText('Current Venue')).toBeInTheDocument();
    expect(screen.getByText('DJ Hyperbeam warming up')).toBeInTheDocument();
    expect(screen.getByText('OmniRavers: 84')).toBeInTheDocument();
    expect(screen.getByText('Front Rail: 27')).toBeInTheDocument();
  });

  it('initializes the chat shell from saved runtime settings', async () => {
    mockWorldSession.settings.chatCollapsed = true;
    mockWorldSession.session.settings.chatCollapsed = true;

    const view = render(<App />);

    expect(await within(view.container).findByRole('button', { name: /Expand chat history/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(view.container).getByPlaceholderText('Type message...')).toBeVisible();

    mockWorldSession.settings.chatCollapsed = false;
    mockWorldSession.session.settings.chatCollapsed = false;
  });

  it('applies theme changes immediately through the settings panel', async () => {
    mockWorldSession.setSettings.mockClear();
    const nextSettings = {
      ...mockWorldSession.settings,
      uiTheme: 'Hybrid Premium' as const,
    };

    const view = render(<App />);

    fireEvent.click(await within(view.container).findByRole('button', { name: 'Settings' }));
    fireEvent.change(within(view.container).getByLabelText('Theme'), {
      target: { value: 'Hybrid Premium' },
    });

    expect(mockWorldSession.setSettings).toHaveBeenCalledWith(nextSettings);
  });
});
