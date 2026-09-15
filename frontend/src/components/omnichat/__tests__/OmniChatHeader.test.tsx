import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import OmniChatHeader from '../OmniChatHeader';
import { OmniChatCallContext, type OmniChatCallContextValue } from '../OmniChatCallProvider';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 7, username: 'caller' },
    logout: vi.fn(),
    isAuthenticated: true,
  }),
}));

// The balance, and its chevron, are the credits menu's own tests.
vi.mock('../OmniChatCreditsMenu', () => ({ default: () => <div data-testid="credits" /> }));

vi.mock('../OmniChatDefaultsModal', () => ({ default: () => null }));

function renderHeader(calls: Partial<OmniChatCallContextValue>) {
  const value: OmniChatCallContextValue = {
    call: null,
    failure: '',
    startVoiceCall: async () => undefined,
    endCall: () => undefined,
    toggleMute: () => undefined,
    dismissFailure: () => undefined,
    ...calls,
  };
  return render(
    <MemoryRouter>
      <OmniChatCallContext.Provider value={value}>
        <OmniChatHeader
          defaults={{ user_name: '', user_age: '', user_gender: '' }}
          onSaveDefaults={() => undefined}
          onSignIn={() => undefined}
        />
      </OmniChatCallContext.Provider>
    </MemoryRouter>
  );
}

const logo = () => screen.getByRole('link', { name: 'OmniChat' });
const exit = () => screen.getByRole('link', { name: /exit|site/i });
const phoneHidden = (element: HTMLElement) =>
  element.classList.contains('hidden') && element.classList.contains('sm:flex');
// Measured at 360 px: signed in with a five-digit balance, the header had no
// room for it, with or without a call.
const accountChevronHiddenOnPhones = () => {
  const chevron = screen
    .getByText('caller')
    .closest('button')!
    .querySelector('.lucide-chevron-down')!;
  return chevron.classList.contains('hidden') && chevron.classList.contains('sm:block');
};

// A phone has room for the call or the whole header, not both. Measured at 360
// to 390 px: with everything shown the row needs 444 px.
describe('OmniChatHeader on a phone', () => {
  it('gives the logo and the exit to a call in progress', () => {
    renderHeader({
      call: {
        conversationId: 42,
        persona: { id: 9, name: 'Sadie' },
        startedAt: Date.now(),
        state: 'listening',
        muted: false,
      },
    });

    expect(screen.getByRole('button', { name: 'End the call with Sadie' })).toBeInTheDocument();
    expect(phoneHidden(logo())).toBe(true);
    // Not only on a phone: at 640 px the exit's full label pushed the logo onto
    // the hang-up button, so it waits for a desktop-wide header.
    expect(exit().classList.contains('hidden')).toBe(true);
    expect(exit().classList.contains('lg:flex')).toBe(true);
    expect(accountChevronHiddenOnPhones()).toBe(true);
  });

  it('hangs a failed call below the header, and keeps the logo and the exit', () => {
    renderHeader({ failure: 'The call could not be connected. Try again.' });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('could not be connected');
    // Measured: inside the row, a long reason wrapped to 172 px in a 72 px header.
    expect(alert.classList.contains('absolute')).toBe(true);
    expect(alert.classList.contains('top-full')).toBe(true);
    expect(phoneHidden(logo())).toBe(false);
    expect(phoneHidden(exit())).toBe(false);
    expect(accountChevronHiddenOnPhones()).toBe(true);
  });

  it('shows the whole header when there is no call', () => {
    renderHeader({});

    expect(phoneHidden(logo())).toBe(false);
    expect(phoneHidden(exit())).toBe(false);
    expect(accountChevronHiddenOnPhones()).toBe(true);
    // Measured: in a shrinking row the logo's box fell to 44 px and the credits
    // button sat on top of the word.
    expect(logo().classList.contains('shrink-0')).toBe(true);
  });
});
