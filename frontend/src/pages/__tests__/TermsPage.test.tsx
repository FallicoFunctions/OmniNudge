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

import TermsPage from '../TermsPage';

describe('TermsPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    );
    expect(document.body).toBeTruthy();
  });

  it('renders terms page title translation key', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('termsPage.title')).toBeInTheDocument();
  });

  it('renders acceptance section', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('termsPage.sections.acceptance.title')).toBeInTheDocument();
  });
});
