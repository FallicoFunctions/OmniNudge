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
  it('keeps chat and loadout out of the entry view until the player opens them', () => {
    render(<App />);

    expect(screen.queryByRole('heading', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Loadout' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    expect(screen.getByRole('heading', { name: 'Chat' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Style' }));
    expect(screen.getByRole('heading', { name: 'Loadout' })).toBeInTheDocument();
  });
});
