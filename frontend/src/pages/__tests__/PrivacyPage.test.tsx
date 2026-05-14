import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatDate: () => 'January 10, 2026',
    formatNumber: (n: number) => String(n),
    formatRelativeTime: () => 'just now',
  }),
}));

vi.mock('../../components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import PrivacyPage from '../PrivacyPage';

describe('PrivacyPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    );
    expect(document.body).toBeTruthy();
  });

  it('renders the privacy page title translation key', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('privacyPage.title')).toBeInTheDocument();
  });

  it('renders collect section', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('privacyPage.sections.collect.title')).toBeInTheDocument();
  });
});
