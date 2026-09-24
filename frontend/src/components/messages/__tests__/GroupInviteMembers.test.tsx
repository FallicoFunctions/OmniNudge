import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GroupInviteMembers } from '../GroupInviteMembers';

const { mockCreateInvite } = vi.hoisted(() => ({ mockCreateInvite: vi.fn() }));

vi.mock('../../../services/groupsService', () => ({
  groupsService: {
    createInvite: (...args: unknown[]) => mockCreateInvite(...args),
  },
}));

const found = [
  { id: 3, username: 'already_in' },
  { id: 47, username: 'seed_user_2' },
];

function renderControl() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GroupInviteMembers conversationId={9} memberIds={[1, 3]} searchUsers={async () => found} />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add Members' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'seed' } });
}

beforeEach(() => {
  mockCreateInvite.mockReset();
});

describe('GroupInviteMembers', () => {
  it('offers only people who are not in the group yet', async () => {
    renderControl();
    expect(await screen.findByRole('button', { name: /seed_user_2/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /already_in/ })).not.toBeInTheDocument();
  });

  it('invites the person picked, to this group, and says so', async () => {
    mockCreateInvite.mockResolvedValue({ id: 5 });
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: /seed_user_2/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('seed_user_2');
    expect(mockCreateInvite).toHaveBeenCalledWith(9, { user_id: 47 });
  });

  it('says so when the invite fails', async () => {
    mockCreateInvite.mockRejectedValue(new Error('403'));
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: /seed_user_2/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to send invite');
  });
});
