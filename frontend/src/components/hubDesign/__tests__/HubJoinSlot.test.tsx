import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HubCreateSlot, HubJoinSlot } from '../HubDesignSlots';

const mockSubscribeToHub = vi.fn();
const mockUnsubscribeFromHub = vi.fn();

vi.mock('../../../services/subscriptionService', () => ({
  subscriptionService: {
    subscribeToHub: (...args: unknown[]) => mockSubscribeToHub(...args),
    unsubscribeFromHub: (...args: unknown[]) => mockUnsubscribeFromHub(...args),
  },
}));

describe('HubJoinSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribeToHub.mockResolvedValue({ is_subscribed: true });
    mockUnsubscribeFromHub.mockResolvedValue({ is_subscribed: false });
  });

  it('reacts to isSubscribed prop changes', () => {
    const { rerender } = render(
      <HubJoinSlot hubName="testHub" isSubscribed={false} userId={123} />,
    );

    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();

    rerender(<HubJoinSlot hubName="testHub" isSubscribed userId={123} />);

    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeInTheDocument();
  });

  it('uses the real unsubscribe endpoint contract and updates the label', async () => {
    render(<HubJoinSlot hubName="testHub" isSubscribed userId={123} />);

    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));

    await waitFor(() => {
      expect(mockUnsubscribeFromHub).toHaveBeenCalledWith('testHub');
      expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();
    });
  });
});

describe('HubCreateSlot', () => {
  it('sends unauthenticated users to the correct create-post redirect target', () => {
    const events: CustomEvent[] = [];
    const handler = (event: Event) => {
      events.push(event as CustomEvent);
    };
    window.addEventListener('open-auth-modal', handler as EventListener);

    render(<HubCreateSlot hubName="test hub" userId={null} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ create post/i }));

    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({
      mode: 'login',
      redirectTo: '/posts/create?hub=test%20hub',
    });

    window.removeEventListener('open-auth-modal', handler as EventListener);
  });

  it('navigates authenticated users to the real create-post route', () => {
    const originalLocation = window.location;
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        assign: assignSpy,
      },
    });

    render(<HubCreateSlot hubName="test hub" userId={123} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ create post/i }));

    expect(assignSpy).toHaveBeenCalledWith('/posts/create?hub=test%20hub');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });
});
