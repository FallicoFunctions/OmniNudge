import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GroupInvitesList } from '../GroupInviteCard';

vi.mock('../../../services/groupsService', () => ({
  groupsService: {
    getMyInvites: async () => [
      {
        id: 5,
        conversation_id: 9,
        group_name: 'Test',
        status: 'pending',
        invited_by_username: 'DERRF',
      },
    ],
    acceptInvite: async () => {
      throw new Error('400');
    },
  },
}));

describe('GroupInvitesList', () => {
  // Accept answered 400 for every invite, and the button did nothing at all.
  it('says so when accepting an invite fails', async () => {
    const opened = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GroupInvitesList onConversationOpened={opened} />
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not answer the invite');
    expect(opened).not.toHaveBeenCalled();
  });
});
