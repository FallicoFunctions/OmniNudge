import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('../../components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../services/omnigameService', () => ({
  omnigameService: {
    getCatalog: () => [
      {
        slug: 'omnirave',
        name: 'OmniRave',
        summaryKey: 'games.omnirave.summary',
        runtimeUrl: 'http://localhost:4173/omnirave',
      },
    ],
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'gamesPage.eyebrow': 'OmniGame',
          'gamesPage.title': 'OmniGame',
          'gamesPage.viewGame': 'View game',
          'games.omnirave.summary': 'A virtual EDM festival',
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

import GamesPage from '../GamesPage';

describe('GamesPage', () => {
  it('renders the OmniGame heading and links to the OmniRave detail page', () => {
    render(
      <MemoryRouter initialEntries={['/games']}>
        <Routes>
          <Route path="/games" element={<GamesPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'OmniGame' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View game' })).toHaveAttribute(
      'href',
      '/games/omnirave'
    );
    expect(screen.getByText('OmniRave')).toBeInTheDocument();
    expect(screen.getByText('A virtual EDM festival')).toBeInTheDocument();
  });
});
