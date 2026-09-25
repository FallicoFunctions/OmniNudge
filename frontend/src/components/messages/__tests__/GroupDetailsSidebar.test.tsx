import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GroupDetailsSidebar } from '../GroupDetailsSidebar';
import type { Conversation } from '../../../types/messages';

vi.mock('../../../hooks/useGroupConversation', () => ({
  useGroupConversation: () => ({
    participants: [],
    loadingParticipants: false,
    settings: undefined,
    currentUserRole: 'member',
    isAdmin: false,
    isOwner: false,
    removeParticipant: vi.fn(),
    changeRole: vi.fn(),
    updateGroup: vi.fn(),
    updateSettings: vi.fn(),
    leaveGroup: vi.fn(async () => undefined),
    isLeavingGroup: false,
    isUpdatingGroup: false,
    isUpdatingSettings: false,
  }),
}));

describe('GroupDetailsSidebar', () => {
  // Leaving closed the panel and left the group open behind it, on a phone
  // until a refresh.
  it('tells the page once this user has left', async () => {
    const onLeft = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GroupDetailsSidebar
          conversation={{ id: 47, conversation_type: 'group', group_name: 'Test' } as Conversation}
          currentUserId={7}
          onClose={vi.fn()}
          onLeft={onLeft}
          searchUsers={async () => []}
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Leave Group' }));

    await waitFor(() => expect(onLeft).toHaveBeenCalledTimes(1));
  });
});
