import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, _opts?: object) => key,
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

// PrivacyPolicyPage re-exports PrivacyPage
import PrivacyPolicyPage from '../PrivacyPolicyPage';

describe('PrivacyPolicyPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <PrivacyPolicyPage />
      </MemoryRouter>,
    );
    expect(document.body).toBeTruthy();
  });

  it('renders privacy content (re-exports PrivacyPage)', () => {
    render(
      <MemoryRouter>
        <PrivacyPolicyPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('privacyPage.title')).toBeInTheDocument();
  });
});
