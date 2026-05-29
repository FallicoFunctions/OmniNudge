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

  it('highlights the AI designer and omits the old messaging roadmap section', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('aboutPage.aiDesigner.title')).toBeInTheDocument();
    expect(screen.getByText('aboutPage.aiDesigner.paragraph1')).toBeInTheDocument();
    expect(screen.queryByText('aboutPage.roadmap.messaging.title')).not.toBeInTheDocument();
  });
});
