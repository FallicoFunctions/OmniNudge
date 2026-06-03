import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorldScene } from '../WorldScene';

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

    expect(screen.getByLabelText('OmniRave room view')).toBeInTheDocument();
  });
});
