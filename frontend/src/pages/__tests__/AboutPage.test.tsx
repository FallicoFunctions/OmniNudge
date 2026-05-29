import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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
      </MemoryRouter>,
    );
    expect(document.body).toBeTruthy();
  });

  it('places the AI designer ahead of the overview cards and shows the messaging encryption section', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    );

    const body = document.body.textContent ?? '';
    expect(body.indexOf('aboutPage.aiDesigner.title')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('aboutPage.availableToday.title')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('aboutPage.vision.title')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('aboutPage.aiDesigner.title')).toBeLessThan(
      body.indexOf('aboutPage.availableToday.title'),
    );
    expect(body.indexOf('aboutPage.aiDesigner.title')).toBeLessThan(
      body.indexOf('aboutPage.vision.title'),
    );

    expect(screen.getByText('aboutPage.messagingEncryption.title')).toBeInTheDocument();
    expect(screen.getByText('aboutPage.messagingEncryption.paragraph1')).toBeInTheDocument();
    expect(screen.queryByText('aboutPage.roadmap.messaging.title')).not.toBeInTheDocument();
  });
});
