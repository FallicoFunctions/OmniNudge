import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

    const chatButton = screen.getByRole('button', { name: 'Chat' });
    expect(await hasGeneratedBaseTextColor(chatButton.className)).toBe(true);
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

  it('locks background scrolling and closes the mobile drawer with Escape', () => {
    const onMobileClose = vi.fn();
    document.body.style.overflow = 'clip';
    const { unmount } = render(
      <OmniChatSidebar
        activeTab="discover"
        onTabChange={() => {}}
        isAuthenticated
        onSignIn={() => {}}
        mobileOpen
        onMobileOpen={() => {}}
        onMobileClose={onMobileClose}
        desktopCollapsed={false}
        onDesktopCollapsedChange={() => {}}
      />
    );

    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onMobileClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.body.style.overflow).toBe('clip');
    document.body.style.overflow = '';
  });

  it('contains keyboard focus in the mobile drawer and restores the menu trigger', () => {
    const props = {
      activeTab: 'discover' as const,
      onTabChange: () => {},
      isAuthenticated: true,
      onSignIn: () => {},
      onMobileOpen: () => {},
      onMobileClose: () => {},
      desktopCollapsed: false,
      onDesktopCollapsedChange: () => {},
    };
    const { rerender } = render(<OmniChatSidebar {...props} mobileOpen={false} />);
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    trigger.focus();

    rerender(<OmniChatSidebar {...props} mobileOpen />);
    const drawer = screen.getByRole('dialog', { name: 'Open menu' });
    expect(drawer).toHaveFocus();

    // Whatever is last, rather than a tab named here. Naming one made this test
    // about the tab list instead of about the focus trap, so it broke the day a
    // tab was added after it -- which says nothing about whether Tab wraps.
    const drawerButtons = within(drawer).getAllByRole('button');
    const lastDrawerButton = drawerButtons[drawerButtons.length - 1];
    lastDrawerButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(within(drawer).getByRole('button', { name: 'Close menu' })).toHaveFocus();

    rerender(<OmniChatSidebar {...props} mobileOpen={false} />);
    expect(trigger).toHaveFocus();
  });
});
