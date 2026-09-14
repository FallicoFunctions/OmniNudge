import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LiveCallControls, { formatCallTime } from '../LiveCallControls';
import { OmniChatCallContext, type OmniChatCallContextValue } from '../OmniChatCallProvider';

function renderWith(value: Partial<OmniChatCallContextValue> | null) {
  const full: OmniChatCallContextValue | null = value && {
    call: null,
    failure: '',
    startVoiceCall: vi.fn(),
    endCall: vi.fn(),
    toggleMute: vi.fn(),
    dismissFailure: vi.fn(),
    ...value,
  };
  render(
    <OmniChatCallContext.Provider value={full}>
      <LiveCallControls />
    </OmniChatCallContext.Provider>
  );
  return full;
}

describe('LiveCallControls', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats the time the way a phone does', () => {
    expect(formatCallTime(0)).toBe('0:00');
    expect(formatCallTime(65_400)).toBe('1:05');
    expect(formatCallTime(3_725_000)).toBe('1:02:05');
    expect(formatCallTime(-5)).toBe('0:00');
  });

  it('is nothing when there is no provider and no call', () => {
    const { container } = render(<LiveCallControls />);
    expect(container).toBeEmptyDOMElement();
    renderWith({});
    expect(screen.queryByRole('button')).toBeNull();
  });

  // The timer counts from the press, as the first minute is charged from it.
  it('counts up from when the phone was pressed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
    renderWith({
      call: {
        conversationId: 12,
        persona: { id: 9, name: 'Sadie' },
        startedAt: Date.now() - 62_000,
        state: 'listening',
        muted: false,
      },
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen.getByRole('button', { name: /end the call with sadie, 1:03/i })
    ).toHaveTextContent('1:03');
  });

  it('mutes from the button to the left, and hangs up from the live icon', () => {
    const value = renderWith({
      call: {
        conversationId: 12,
        persona: { id: 9, name: 'Sadie' },
        startedAt: Date.now(),
        state: 'speaking',
        muted: false,
      },
    });
    const [mute, live] = screen.getAllByRole('button');
    expect(mute).toHaveAccessibleName('Mute the microphone');
    expect(mute).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(mute);
    expect(value!.toggleMute).toHaveBeenCalledOnce();

    fireEvent.click(live);
    expect(value!.endCall).toHaveBeenCalledOnce();
  });

  it('says why a call ended on its own, and lets it be dismissed', () => {
    vi.useFakeTimers();
    const value = renderWith({ failure: 'The call dropped. End the call and try again.' });
    expect(screen.getByRole('alert')).toHaveTextContent(/dropped/);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(value!.dismissFailure).toHaveBeenCalledOnce();

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(value!.dismissFailure).toHaveBeenCalledTimes(2);
  });
});
