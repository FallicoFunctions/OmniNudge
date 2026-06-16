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
    formatDate: () => 'February 2026',
    formatNumber: (n: number) => String(n),
    formatRelativeTime: () => 'just now',
  }),
}));

import CCPAPage from '../CCPAPage';

describe('CCPAPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <CCPAPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });

  it('renders the CCPA page title translation key', () => {
    render(
      <MemoryRouter>
        <CCPAPage />
      </MemoryRouter>
    );
    expect(screen.getByText('ccpaPage.title')).toBeInTheDocument();
  });

  it('renders CCPA section content', () => {
    render(
      <MemoryRouter>
        <CCPAPage />
      </MemoryRouter>
    );
    expect(screen.getByText('ccpaPage.sections.ccpa.title')).toBeInTheDocument();
  });
});
