import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const mockedFns = vi.hoisted(() => ({
  createOmniRaveLaunch: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
}));

vi.mock('../../components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../services/omnigameService', () => ({
  omnigameService: {
    getGame: () => ({
      slug: 'omnirave',
      name: 'OmniRave',
      summaryKey: 'games.omnirave.summary',
      heroKey: 'games.omnirave.hero',
      runtimeUrl: 'http://localhost:4173/omnirave',
    }),
    createOmniRaveLaunch: mockedFns.createOmniRaveLaunch,
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'gameDetailPage.eyebrow': 'OmniGame / OmniRave',
          'gameDetailPage.play': 'Play',
          'gameDetailPage.playing': 'Entering OmniRave...',
          'gameDetailPage.launchError': 'Unable to launch OmniRave right now.',
          'games.omnirave.summary': 'Shared world rave.',
          'games.omnirave.hero': 'One world. Three stages. Shared playheads.',
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

import GameDetailPage from '../GameDetailPage';

describe('GameDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
    authState.isLoading = false;
  });

  it('renders only the title and one Play button', () => {
    render(
      <MemoryRouter initialEntries={['/games/omnirave']}>
        <Routes>
          <Route path="/games/omnirave" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'OmniRave' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Play' })).toHaveLength(1);
    // The summary and hero lines belong to the games list, not this page.
    expect(screen.queryByText('Shared world rave.')).not.toBeInTheDocument();
    expect(
      screen.queryByText('One world. Three stages. Shared playheads.')
    ).not.toBeInTheDocument();
  });

  it('launches guest mode when the player is unauthenticated', async () => {
    mockedFns.createOmniRaveLaunch.mockImplementation(() => new Promise(() => undefined));

    render(
      <MemoryRouter initialEntries={['/games/omnirave']}>
        <Routes>
          <Route path="/games/omnirave" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    await waitFor(() => {
      expect(mockedFns.createOmniRaveLaunch).toHaveBeenCalledWith('guest');
    });
  });

  it('waits for OmniNudge authentication detection before enabling Play', () => {
    authState.isLoading = true;

    render(
      <MemoryRouter initialEntries={['/games/omnirave']}>
        <Routes>
          <Route path="/games/omnirave" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(mockedFns.createOmniRaveLaunch).not.toHaveBeenCalled();
  });

  it('launches account mode when the player is authenticated', async () => {
    authState.isAuthenticated = true;
    mockedFns.createOmniRaveLaunch.mockImplementation(() => new Promise(() => undefined));

    render(
      <MemoryRouter initialEntries={['/games/omnirave']}>
        <Routes>
          <Route path="/games/omnirave" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    await waitFor(() => {
      expect(mockedFns.createOmniRaveLaunch).toHaveBeenCalledWith('account');
    });
  });
});
