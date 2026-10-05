import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import OmniChatSidebar from '../OmniChatSidebar';

async function generateUtilityCss(token: string) {
  const from = resolve('src/index.css');
  const stylesheet = readFileSync(from, 'utf8').replace(/^@source .*;\n/gm, '');
  return postcss([tailwindcss({ optimize: false })]).process(
    `${stylesheet}\n@source inline(${JSON.stringify(token)});`,
    { from }
  );
}

async function hasGeneratedBaseTextColor(className: string) {
  const baseTextTokens = className
    .split(/\s+/)
    .filter((token) => token.startsWith('text-') && !token.includes(':'));

  for (const token of baseTextTokens) {
    const css = await generateUtilityCss(token);
    const selector = `.${token.replace(/[^a-zA-Z0-9_-]/g, '\\$&')}`;
    let hasColor = false;
    css.root.walkRules(selector, (rule) => {
      rule.walkDecls('color', () => {
        hasColor = true;
      });
    });
    if (hasColor) return true;
  }

  return false;
}

describe('OmniChatSidebar color utilities', () => {
  it('requires a color declaration on the requested utility, not another stylesheet rule', async () => {
    expect(await hasGeneratedBaseTextColor('text-not-a-real-color')).toBe(false);
    expect(await hasGeneratedBaseTextColor('text-text-primary')).toBe(true);
  });

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
