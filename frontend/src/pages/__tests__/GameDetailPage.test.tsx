import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockedFns = vi.hoisted(() => ({
  createOmniRaveLaunch: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
}));

const dispatchEventSpy = vi.hoisted(() => vi.fn());

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
      descriptionKeys: [
        'games.omnirave.description.0',
        'games.omnirave.description.1',
      ],
      highlightKeys: ['games.omnirave.highlights.0', 'games.omnirave.highlights.1', 'games.omnirave.highlights.2'],
      gallery: [
        {
          titleKey: 'games.omnirave.gallery.0.title',
          captionKey: 'games.omnirave.gallery.0.caption',
        },
      ],
    }),
    createOmniRaveLaunch: mockedFns.createOmniRaveLaunch,
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          'gameDetailPage.eyebrow': 'OmniGame / OmniRave',
          'gameDetailPage.play': 'Play',
          'gameDetailPage.playGuest': 'Play as Guest',
          'gameDetailPage.signIn': 'Sign In to Play',
          'gameDetailPage.playing': 'Entering OmniRave...',
          'gameDetailPage.heroTitle': 'Enter the room without any lobby shell.',
          'gameDetailPage.heroBody':
            'Play should feel immediate: black-in, live crowd, stage lights, and the room already moving.',
          'gameDetailPage.accountHint': 'Account launch will restore your return point.',
          'gameDetailPage.guestHint': 'Guests drop straight into Main Stage.',
          'gameDetailPage.signInHint': 'Sign in to restore your return point and loadout.',
          'gameDetailPage.highlightsTitle': 'What makes the room feel real',
          'gameDetailPage.launchError': 'Unable to launch OmniRave right now.',
          'games.omnirave.summary': 'Shared world rave.',
          'games.omnirave.hero': 'One world. Three stages. Shared playheads.',
          'games.omnirave.description.0': 'Three stages pulse inside one authoritative world.',
          'games.omnirave.description.1':
            'Drop in instantly as a guest or return with your account identity automatically.',
          'games.omnirave.highlights.0': 'Main Stage spawn',
          'games.omnirave.highlights.1': 'Saved return points',
          'games.omnirave.highlights.2': 'Authoritative zone audio',
          'games.omnirave.gallery.0.title': 'Main Stage',
          'games.omnirave.gallery.0.caption': 'Main Stage light wall',
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

import GameDetailPage from '../GameDetailPage';

describe('GameDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
    dispatchEventSpy.mockReset();
    vi.spyOn(window, 'dispatchEvent').mockImplementation(dispatchEventSpy);
  });

  it('renders translated OmniRave content plus guest and sign-in CTAs for logged-out players', () => {
    render(
      <MemoryRouter initialEntries={['/games/omnirave']}>
        <Routes>
          <Route path="/games/omnirave" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'OmniRave' })).toBeInTheDocument();
    expect(screen.getByText('Shared world rave.')).toBeInTheDocument();
    expect(screen.getByText('One world. Three stages. Shared playheads.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play as Guest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In to Play' })).toBeInTheDocument();
  });

  it('launches guest mode when the player is unauthenticated', async () => {
    mockedFns.createOmniRaveLaunch.mockImplementation(() => new Promise(() => undefined));

    render(
      <MemoryRouter initialEntries={['/games/omnirave']}>
        <Routes>
          <Route path="/games/omnirave" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play as Guest' }));

    await waitFor(() => {
      expect(mockedFns.createOmniRaveLaunch).toHaveBeenCalledWith('guest');
    });
  });

  it('opens the auth modal when a logged-out player chooses the signed-in path', () => {
    render(
      <MemoryRouter initialEntries={['/games/omnirave']}>
        <Routes>
          <Route path="/games/omnirave" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign In to Play' }));

    expect(mockedFns.createOmniRaveLaunch).not.toHaveBeenCalled();
    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
  });

  it('launches account mode when the player is authenticated', async () => {
    authState.isAuthenticated = true;
    mockedFns.createOmniRaveLaunch.mockImplementation(() => new Promise(() => undefined));

    render(
      <MemoryRouter initialEntries={['/games/omnirave']}>
        <Routes>
          <Route path="/games/omnirave" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    await waitFor(() => {
      expect(mockedFns.createOmniRaveLaunch).toHaveBeenCalledWith('account');
    });
  });
});
