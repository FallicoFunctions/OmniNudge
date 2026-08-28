import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import CCPAPage from '../CCPAPage';
import PrivacyPage from '../PrivacyPage';
import PrivacyPolicyPage from '../PrivacyPolicyPage';
import TermsOfServicePage from '../TermsOfServicePage';
import TermsPage from '../TermsPage';

/**
 * These five pages had a test each, and every one of them mocked t() to return
 * its argument and then asserted the key was on screen:
 *
 *   vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }))
 *   expect(screen.getByText('termsPage.title')).toBeInTheDocument()
 *
 * So they demanded the broken output. en.json had no termsPage, privacyPage or
 * ccpaPage section at all -- the i18n conversion in e44379e9f replaced the copy
 * with keys nobody ever wrote -- and all five tests stayed green while readers
 * got "termsPage.sections.limitation.body" where the liability clause belongs.
 *
 * They also mocked formatDate to return the right answer, which hid a real bug:
 * new Date('2026-02-01') is UTC midnight, so the CCPA page printed
 * "Last Updated: January 2026" to everybody west of UTC.
 *
 * So: the real en.json (test-setup loads it), the real useFormat, and a
 * timezone where a date-only string can go wrong.
 */
const PAGES = [
  { name: 'TermsPage', Component: TermsPage, heading: 'Terms of Service' },
  { name: 'TermsOfServicePage', Component: TermsOfServicePage, heading: 'Terms of Service' },
  { name: 'PrivacyPage', Component: PrivacyPage, heading: 'Privacy Policy' },
  { name: 'PrivacyPolicyPage', Component: PrivacyPolicyPage, heading: 'Privacy Policy' },
  { name: 'CCPAPage', Component: CCPAPage, heading: 'Your California Privacy Rights' },
];

/** dotted.lower.camelCase with no spaces is a key that reached the page. */
const RAW_KEY = /^[a-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+){1,5}$/;

function renderedKeys(root: HTMLElement): string[] {
  const found = new Set<string>();
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const text = node.textContent?.trim() ?? '';
    if (RAW_KEY.test(text) && !text.includes('@')) found.add(text);
  }
  return [...found];
}

describe('legal pages', () => {
  const original = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });

  afterAll(() => {
    process.env.TZ = original;
  });

  it.each(PAGES)('$name shows its heading, not a key', ({ Component, heading }) => {
    render(
      <MemoryRouter>
        <Component />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it.each(PAGES)('$name renders no translation key anywhere', ({ Component }) => {
    const { container } = render(
      <MemoryRouter>
        <Component />
      </MemoryRouter>
    );
    expect(renderedKeys(container)).toEqual([]);
  });

  it('the terms still say what the terms said', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>
    );
    expect(screen.getByText('1. Acceptance')).toBeInTheDocument();
    expect(
      screen.getByText(/OmniNudge is not liable for any indirect, incidental, or consequential/)
    ).toBeInTheDocument();
    expect(screen.getByText(/During the beta phase, OmniNudge uses A\.I\. Agents/)).toBeInTheDocument();
  });

  it('the privacy policy still says it does not sell personal data', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/We do not sell your personal data\./)).toBeInTheDocument();
  });

  it('dates the pages the day they are dated, not the day before', () => {
    const { unmount } = render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Effective date: January 10, 2026')).toBeInTheDocument();
    unmount();

    render(
      <MemoryRouter>
        <CCPAPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Last Updated: February 2026')).toBeInTheDocument();
  });
});
