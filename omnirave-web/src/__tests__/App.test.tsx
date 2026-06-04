import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const mockWorldSession = {
  session: {
    playerId: 'guest-42',
    playerName: 'Guest-42',
    worldSocketUrl: 'ws://localhost:8092/ws',
    mode: 'guest' as 'guest' | 'account',
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
    zoneEvents: [],
    players: [
      {
        id: 'guest-42',
        playerName: 'Guest-42',
        mode: 'guest' as 'guest' | 'account',
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
  pendingVenue: null as 'main_stage' | 'underground' | 'plurr_partay' | null,
  isVenueTransitioning: false,
  settings: {
    uiTheme: 'Luminous Panels',
    graphicsMode: 'auto' as const,
    graphicsLevel: 7,
    displayNames: true,
    chatCollapsed: false,
    crouchMode: 'hold' as const,
    cameraFollow: 'free' as const,
  },
  updateSettings: vi.fn(),
  authPopupMode: null as 'login' | 'signup' | null,
  openAuthPopup: vi.fn(),
  switchAuthPopupMode: vi.fn(),
  closeAuthPopup: vi.fn(),
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
  isAuthSubmitting: false,
  welcomeCardState: null as null | { isOpen: boolean; variant: 'login' | 'signup' },
  dismissWelcomeCard: vi.fn(),
  requestGuestSprintUnlock: vi.fn(),
  moveToZone: vi.fn(),
  respawn: vi.fn(),
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

vi.mock('../components/WorldScene', () => ({
  WorldScene: () => <div aria-label="OmniRave 3D runtime" />,
}));

describe('App', () => {
  beforeEach(() => {
    mockWorldSession.session.mode = 'guest';
    mockWorldSession.session.playerName = 'Guest-42';
    mockWorldSession.session.activeZone = 'main_stage';
    mockWorldSession.session.zoneEvents = [];
    mockWorldSession.authPopupMode = null;
    mockWorldSession.welcomeCardState = null;
    mockWorldSession.openAuthPopup.mockClear();
    mockWorldSession.switchAuthPopupMode.mockClear();
    mockWorldSession.closeAuthPopup.mockClear();
    mockWorldSession.dismissWelcomeCard.mockClear();
    mockWorldSession.logout.mockClear();
  });

  it('renders the persistent OmniRave HUD anchors', async () => {
    mockWorldSession.pendingVenue = null;
    mockWorldSession.settings.chatCollapsed = false;
    mockWorldSession.session.settings.chatCollapsed = false;

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Avatar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log In' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.getByText('Current Venue')).toBeInTheDocument();
    expect(screen.getByText('DJ Hyperbeam warming up')).toBeInTheDocument();
    expect(screen.getByText('OmniRavers: 84')).toBeInTheDocument();
    expect(screen.getByText('Front Rail: 27')).toBeInTheDocument();
    expect(screen.getByLabelText('OmniRave 3D runtime')).toBeInTheDocument();
  });

  it('initializes the chat shell from saved runtime settings', async () => {
    mockWorldSession.pendingVenue = null;
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
    mockWorldSession.pendingVenue = null;
    mockWorldSession.updateSettings.mockClear();
    const nextSettings = {
      ...mockWorldSession.settings,
      uiTheme: 'Hybrid Premium' as const,
    };

    const view = render(<App />);

    fireEvent.click(await within(view.container).findByRole('button', { name: 'Settings' }));
    fireEvent.change(within(view.container).getByLabelText('Theme'), {
      target: { value: 'Hybrid Premium' },
    });

    expect(mockWorldSession.updateSettings).toHaveBeenCalledWith(nextSettings);
  });

  it('shows pending venue copy during the one-second handoff', async () => {
    mockWorldSession.pendingVenue = 'underground';

    render(<App />);

    expect(await screen.findByText('Crossing into The Underground')).toBeInTheDocument();

    mockWorldSession.pendingVenue = null;
  });

  it('shows the fireworks countdown on the stage screen during main-stage lead-in', async () => {
    mockWorldSession.session.zoneEvents = [
      { zoneId: 'main_stage', phase: 'lead_in', eventName: 'fireworks', countdownSeconds: 10 },
    ];

    render(<App />);

    expect(await screen.findByText('Fireworks begin in')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('routes the settings respawn action through the runtime session hook', async () => {
    mockWorldSession.respawn.mockClear();
    const view = render(<App />);

    fireEvent.click(await within(view.container).findByRole('button', { name: 'Settings' }));
    fireEvent.click(within(view.container).getByRole('button', { name: 'Respawn' }));

    expect(mockWorldSession.respawn).toHaveBeenCalledTimes(1);
    expect(within(view.container).queryByRole('button', { name: 'Respawn' })).not.toBeInTheDocument();
  });

  it('lets the settings panel close from its own close control', async () => {
    const view = render(<App />);

    fireEvent.click(await within(view.container).findByRole('button', { name: 'Settings' }));
    fireEvent.click(within(view.container).getByRole('button', { name: 'Close settings' }));

    expect(within(view.container).queryByRole('button', { name: 'Respawn' })).not.toBeInTheDocument();
  });

  it('opens signup instead of the avatar shell when a guest clicks Avatar', async () => {
    mockWorldSession.openAuthPopup.mockClear();
    const view = render(<App />);

    fireEvent.click(await within(view.container).findByRole('button', { name: 'Avatar' }));

    expect(mockWorldSession.openAuthPopup).toHaveBeenCalledWith('signup', 'guest_avatar');
    expect(within(view.container).queryByLabelText('Avatar editor foundation')).not.toBeInTheDocument();
  });

  it('closes the welcome card and opens the avatar shell from Edit Avatar', async () => {
    mockWorldSession.session.mode = 'account';
    mockWorldSession.welcomeCardState = { isOpen: true, variant: 'signup' };
    mockWorldSession.dismissWelcomeCard.mockClear();

    const view = render(<App />);

    fireEvent.click(await within(view.container).findByRole('button', { name: 'Edit Avatar' }));

    expect(mockWorldSession.dismissWelcomeCard).toHaveBeenCalledTimes(1);
    expect(within(view.container).getByLabelText('Avatar editor foundation')).toBeInTheDocument();

    mockWorldSession.session.mode = 'guest';
    mockWorldSession.welcomeCardState = null;
  });

  it('dismisses the welcome card before opening settings', async () => {
    mockWorldSession.session.mode = 'account';
    mockWorldSession.welcomeCardState = { isOpen: true, variant: 'login' };
    mockWorldSession.dismissWelcomeCard.mockClear();

    const view = render(<App />);

    fireEvent.click(await within(view.container).findByRole('button', { name: 'Settings' }));

    expect(mockWorldSession.dismissWelcomeCard).toHaveBeenCalledTimes(1);
    expect(within(view.container).getByRole('button', { name: 'Respawn' })).toBeInTheDocument();

    mockWorldSession.session.mode = 'guest';
    mockWorldSession.welcomeCardState = null;
  });
});
