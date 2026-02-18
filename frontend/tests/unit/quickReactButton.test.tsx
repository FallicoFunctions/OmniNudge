import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuickReactButton } from '../../src/components/messages/QuickReactButton';
import { reactionsService } from '../../src/services/reactionsService';

vi.mock('../../src/services/reactionsService', () => ({
  reactionsService: {
    addReaction: vi.fn(),
    getReactions: vi.fn(),
    removeReaction: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('QuickReactButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens emoji picker and adds reaction on selection', async () => {
    vi.mocked(reactionsService.addReaction).mockResolvedValue({
      id: 11,
      message_id: 7,
      user_id: 1,
      username: 'me',
      emoji: '👍',
      created_at: new Date().toISOString(),
    });

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <QuickReactButton
          messageId={7}
          conversationId={5}
          isOwnMessage={false}
          currentUserId={1}
          currentUsername="me"
        />
      </Wrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add reaction' }));
    expect(screen.getByRole('dialog', { name: 'Emoji picker' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'React with 👍' }));

    await waitFor(() => {
      expect(reactionsService.addReaction).toHaveBeenCalledWith(7, '👍');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Emoji picker' })).not.toBeInTheDocument();
    });
  });
});

