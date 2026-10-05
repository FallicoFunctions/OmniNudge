import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('../../components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AboutPage from '../AboutPage';

describe('AboutPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });

  it('introduces OmniRave before the existing features and keeps background on the About page', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );

    const body = document.body.textContent ?? '';
    expect(body.indexOf('aboutPage.omnirave.title')).toBeLessThan(
      body.indexOf('aboutPage.availableToday.title')
    );
    expect(screen.getByRole('link', { name: 'aboutPage.omnirave.link' })).toHaveAttribute(
      'href',
      '/games/omnirave'
    );
    expect(screen.getByText('aboutPage.features.messaging.description')).toBeInTheDocument();
    expect(screen.getByText('aboutPage.roadmap.dungeonMaster')).toBeInTheDocument();
    expect(screen.getByText('aboutPage.vision.description')).toBeInTheDocument();
    expect(screen.getByText('aboutPage.messagingEncryption.paragraph1')).toBeInTheDocument();
    expect(screen.getByText('aboutPage.customization.paragraph1')).toBeInTheDocument();
    expect(
      screen.queryByText('aboutPage.roadmap.social.items.friendsFollowers')
    ).not.toBeInTheDocument();
  });
});
