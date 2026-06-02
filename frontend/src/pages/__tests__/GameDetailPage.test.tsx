import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockedFns = vi.hoisted(() => ({
  createOmniRaveLaunch: vi.fn(),
}));

vi.mock('../../components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../services/omnigameService', () => ({
  omnigameService: {
    getGame: () => ({
      slug: 'omnirave',
      name: 'OmniRave',
      summary: 'Shared world rave.',
      hero: 'One world. Three stages. Shared playheads.',
      runtimeUrl: 'http://localhost:4173/omnirave',
      supportsGuestLaunch: true,
      signedInDescription: 'Signed-in launch',
      guestDescription: 'Guest launch',
    }),
    createOmniRaveLaunch: mockedFns.createOmniRaveLaunch,
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          'gameDetailPage.eyebrow': 'OmniGame / OmniRave',
          'gameDetailPage.signedInTitle': 'Signed-in launch',
          'gameDetailPage.guestTitle': 'Guest launch',
          'gameDetailPage.launchSignedIn': 'Launch OmniRave',
          'gameDetailPage.launchGuest': 'Launch as Guest',
          'gameDetailPage.launchingSignedIn': 'Launching OmniRave...',
          'gameDetailPage.launchingGuest': 'Launching guest session...',
          'gameDetailPage.zoneLabel': 'Zones',
          'gameDetailPage.zoneValue': 'main_stage, techno_room, neon_room',
          'gameDetailPage.mediaLabel': 'Media',
          'gameDetailPage.mediaValue': 'Server-owned zone audio boundaries with synced YouTube stages',
          'gameDetailPage.mobileLabel': 'Mobile',
          'gameDetailPage.mobileValue': 'Explicit media unlock before stage audio starts',
          'gameDetailPage.launchError': 'Unable to launch OmniRave right now.',
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

import GameDetailPage from '../GameDetailPage';

describe('GameDetailPage', () => {
  it('offers both account and guest launch buttons on the OmniRave detail page', () => {
    render(
      <MemoryRouter initialEntries={['/games/omnirave']}>
        <Routes>
          <Route path="/games/omnirave" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'OmniRave' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Launch OmniRave' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Launch as Guest' })).toBeInTheDocument();
  });

  it('prompts for login instead of calling signed-in launch when the user is unauthenticated', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <MemoryRouter initialEntries={['/games/omnirave']}>
        <Routes>
          <Route path="/games/omnirave" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Launch OmniRave' }));

    expect(mockedFns.createOmniRaveLaunch).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    dispatchSpy.mockRestore();
  });
});
