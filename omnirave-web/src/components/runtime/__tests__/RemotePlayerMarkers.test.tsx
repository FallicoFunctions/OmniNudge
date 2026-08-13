import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemotePlayerMarkers } from '../RemotePlayerMarkers';

vi.mock('@react-three/drei', () => ({
  Html: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
});

describe('RemotePlayerMarkers', () => {
  it('renders remote player nameplates when display names are enabled', () => {
    render(
      <RemotePlayerMarkers
        currentPlayerId="guest-1"
        displayNames={true}
        players={[
          {
            id: 'account-2',
            playerName: 'Nick',
            mode: 'account',
            zone: 'main_stage',
            position: { x: 3, y: 0, z: 2 },
            loadout: {},
          },
        ]}
      />,
    );

    expect(screen.getByText('Nick')).toBeInTheDocument();
  });

  it('does not render nameplates when display names are disabled', () => {
    render(
      <RemotePlayerMarkers
        currentPlayerId="guest-1"
        displayNames={false}
        players={[
          {
            id: 'account-2',
            playerName: 'Nick',
            mode: 'account',
            zone: 'main_stage',
            position: { x: 3, y: 0, z: 2 },
            loadout: {},
          },
        ]}
      />,
    );

    expect(screen.queryByText('Nick')).not.toBeInTheDocument();
  });
});
