/**
 * The banned-invite message went unseen because the control read the error
 * the way an Axios error looks, and lib/api throws something else. Here the
 * real client parses the server's real 403 body.
 */
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GroupInviteMembers } from '../GroupInviteMembers';

vi.mock('../../../services/newcomerHistory', () => ({ historyForNewcomer: async () => undefined }));
vi.mock('../../../services/authSession', () => ({
  authenticatedFetch: vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          error: 'This user is banned from the group. Only an owner or admin can bring them back.',
          code: 'group_user_banned',
          message:
            'This user is banned from the group. Only an owner or admin can bring them back.',
          request_id: 'd2bcc42a-a528-4eb1-a43b-1eed301881df',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
  ),
}));

describe('GroupInviteMembers with the real api client', () => {
  it("names the ban when the server refuses a banned user's invite", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GroupInviteMembers
          conversationId={47}
          memberIds={[7, 47]}
          searchUsers={async () => [{ id: 37, username: 'seed_user_1' }]}
        />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Members' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'seed' } });
    fireEvent.click(await screen.findByRole('button', { name: /seed_user_1/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This user is banned from the group. Only an owner or admin can invite them back.'
    );
  });
});
