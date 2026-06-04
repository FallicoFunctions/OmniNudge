import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RUNTIME_SETTINGS } from '../../lib/settings';
import { WorldScene } from '../WorldScene';

vi.mock('@react-three/fiber', () => ({
  Canvas: () => <div data-testid="mock-r3f-canvas" />,
}));

vi.mock('@react-three/drei', () => ({
  Environment: () => null,
}));

describe('WorldScene', () => {
  it('renders the room view even when a player arrives without a populated loadout object', () => {
    render(
      <WorldScene
        unlocked={true}
        session={{
          playerId: 'guest-42',
          playerName: 'Guest-42',
          worldSocketUrl: 'ws://localhost:8092/ws',
          mode: 'guest',
          activeZone: 'main_stage',
          lastVenue: 'main_stage',
          settings: DEFAULT_RUNTIME_SETTINGS,
          players: [
            {
              id: 'guest-42',
              zone: 'main_stage',
              position: { x: 0, y: 0, z: 0 },
              loadout: null as unknown as Record<string, string>,
            },
          ],
        }}
      />,
    );

    expect(screen.getByLabelText('OmniRave 3D runtime')).toBeInTheDocument();
  });
});
