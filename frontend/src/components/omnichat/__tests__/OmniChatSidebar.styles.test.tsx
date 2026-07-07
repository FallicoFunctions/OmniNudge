import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../../../tailwind.config.js';
import OmniChatSidebar from '../OmniChatSidebar';

async function generateUtilityCss(rawMarkup: string) {
  const result = await postcss([
    tailwindcss({
      ...tailwindConfig,
      content: [{ raw: rawMarkup, extension: 'html' }],
    }),
  ]).process('@tailwind utilities;', { from: undefined });

  return result.css;
}

async function hasGeneratedBaseTextColor(className: string) {
  const baseTextTokens = className
    .split(/\s+/)
    .filter((token) => token.startsWith('text-') && !token.includes(':'));

  for (const token of baseTextTokens) {
    const css = await generateUtilityCss(`<button class="${token}"></button>`);
    if (css.includes('color:')) {
      return true;
    }
  }

  return false;
}

describe('OmniChatSidebar color utilities', () => {
  it('renders inactive navigation labels with a generated base text color utility', async () => {
    render(
      <OmniChatSidebar
        activeTab="discover"
        onTabChange={() => {}}
        isAuthenticated
        onSignIn={() => {}}
        mobileOpen={false}
        onMobileOpen={() => {}}
        onMobileClose={() => {}}
        desktopCollapsed={false}
        onDesktopCollapsedChange={() => {}}
      />
    );

    const searchButton = screen.getByRole('button', { name: 'Search' });
    expect(await hasGeneratedBaseTextColor(searchButton.className)).toBe(true);
  });

  it('renders the guest sign-in button with a generated base text color utility', async () => {
    render(
      <OmniChatSidebar
        activeTab="discover"
        onTabChange={() => {}}
        isAuthenticated={false}
        onSignIn={() => {}}
        mobileOpen={false}
        onMobileOpen={() => {}}
        onMobileClose={() => {}}
        desktopCollapsed={false}
        onDesktopCollapsedChange={() => {}}
      />
    );

    const signInButton = screen.getByRole('button', { name: 'Sign in' });
    expect(await hasGeneratedBaseTextColor(signInButton.className)).toBe(true);
  });

  it('shows the guest save-chat prompt above the sign-in button', () => {
    render(
      <OmniChatSidebar
        activeTab="discover"
        onTabChange={() => {}}
        isAuthenticated={false}
        onSignIn={() => {}}
        mobileOpen={false}
        onMobileOpen={() => {}}
        onMobileClose={() => {}}
        desktopCollapsed={false}
        onDesktopCollapsedChange={() => {}}
      />
    );

    expect(screen.getByText('Sign in to save your chat')).toBeInTheDocument();
  });

  it('hides the guest save-chat prompt for authenticated users', () => {
    render(
      <OmniChatSidebar
        activeTab="discover"
        onTabChange={() => {}}
        isAuthenticated
        onSignIn={() => {}}
        mobileOpen={false}
        onMobileOpen={() => {}}
        onMobileClose={() => {}}
        desktopCollapsed={false}
        onDesktopCollapsedChange={() => {}}
      />
    );

    expect(screen.queryByText('Sign in to save your chat')).not.toBeInTheDocument();
  });
});
