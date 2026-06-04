import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';

vi.mock('../hooks/useWorldSession', () => ({
  useWorldSession: () => ({
    session: {
      playerId: 'guest-42',
      playerName: 'Guest-42',
      worldSocketUrl: 'ws://localhost:8092/ws',
      mode: 'guest',
      activeZone: 'main_stage',
      lastVenue: 'main_stage',
      settings: {
        uiTheme: 'Luminous Panels',
        graphicsMode: 'auto',
        graphicsLevel: 7,
        displayNames: true,
        chatCollapsed: false,
        crouchMode: 'hold',
        cameraFollow: 'free',
      },
      loadout: { hair: 'buzz', top: 'black_mesh' },
      zoneMedia: [
        { zoneId: 'main_stage', videoId: 'abc', playlistIndex: 0, playheadSeconds: 12 },
        { zoneId: 'underground', videoId: 'def', playlistIndex: 0, playheadSeconds: 4 },
        { zoneId: 'plurr_partay', videoId: 'ghi', playlistIndex: 0, playheadSeconds: 8 },
      ],
      players: [
        {
          id: 'guest-42',
          zone: 'main_stage',
          position: { x: 0, y: 0, z: 0 },
          loadout: { hair: 'buzz', top: 'black_mesh' },
        },
      ],
    },
    chatMessages: [],
    error: '',
    isLoading: false,
    hasJoinedWorld: true,
    isSavingLoadout: false,
    settings: {
      uiTheme: 'Luminous Panels',
      graphicsMode: 'auto',
      graphicsLevel: 7,
      displayNames: true,
      chatCollapsed: false,
      crouchMode: 'hold',
      cameraFollow: 'free',
    },
    setSettings: vi.fn(),
    moveToZone: vi.fn(),
    saveLoadout: vi.fn(),
    sendChatMessage: vi.fn(),
  }),
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
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Avatar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log In' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.getByText('Current Venue')).toBeInTheDocument();
    expect(screen.getByText('Track metadata pending')).toBeInTheDocument();
  });
});
