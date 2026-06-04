import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RUNTIME_SETTINGS } from '../../lib/settings';
import type { RuntimeSession } from '../../lib/session';
import { WorldScene } from '../WorldScene';

const markerPropsSpy = vi.hoisted(() => vi.fn());
const localRigPropsSpy = vi.hoisted(() => vi.fn());

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: ReactNode }) => (
    <div data-testid="mock-r3f-canvas">{children}</div>
  ),
}));

vi.mock('@react-three/drei', () => ({
  Environment: () => null,
}));

vi.mock('../runtime/FestivalBlockout', () => ({
  FestivalBlockout: () => null,
}));

vi.mock('../runtime/RemotePlayerMarkers', () => ({
  RemotePlayerMarkers: (props: unknown) => {
    markerPropsSpy(props);
    return <div data-testid="remote-player-markers" />;
  },
}));

vi.mock('../runtime/LocalPlayerRig', () => ({
  LocalPlayerRig: (props: unknown) => {
    localRigPropsSpy(props);
    return <div data-testid="local-player-rig" />;
  },
}));

afterEach(() => {
  cleanup();
});

describe('WorldScene', () => {
  it('threads display-name and guest-sprint props into the runtime scene', () => {
    const onGuestSprintAttempt = vi.fn();
    const session: RuntimeSession = {
      playerId: 'guest-42',
      playerName: 'Guest-42',
      worldSocketUrl: 'ws://localhost:8092/ws',
      mode: 'guest' as const,
      activeZone: 'main_stage' as const,
      lastVenue: 'main_stage' as const,
      settings: DEFAULT_RUNTIME_SETTINGS,
      players: [
        {
          id: 'guest-42',
          playerName: 'Guest-42',
          mode: 'guest' as const,
          zone: 'main_stage' as const,
          position: { x: 0, y: 0, z: 0 },
          loadout: {},
        },
        {
          id: 'account-7',
          playerName: 'Nick',
          mode: 'account' as const,
          zone: 'main_stage' as const,
          position: { x: 2, y: 0, z: 3 },
          loadout: { body: 'spark' },
        },
      ],
    };

    render(<WorldScene unlocked={true} session={session} onGuestSprintAttempt={onGuestSprintAttempt} />);

    expect(markerPropsSpy).toHaveBeenCalledWith({
      currentPlayerId: 'guest-42',
      displayNames: true,
      players: session.players,
    });
    expect(localRigPropsSpy).toHaveBeenCalledWith({
      onGuestSprintAttempt,
      session,
    });
  });

  it('renders the room view even when a player arrives without a populated loadout object', () => {
    markerPropsSpy.mockClear();
    localRigPropsSpy.mockClear();

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
              playerName: 'Guest-42',
              mode: 'guest',
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
