import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GroupInviteMembers } from '../GroupInviteMembers';

const { mockCreateInvite, mockHistory } = vi.hoisted(() => ({
  mockCreateInvite: vi.fn(),
  mockHistory: vi.fn(),
}));

vi.mock('../../../services/groupsService', () => ({
  groupsService: {
    createInvite: (...args: unknown[]) => mockCreateInvite(...args),
  },
}));

vi.mock('../../../services/newcomerHistory', () => ({
  historyForNewcomer: (...args: unknown[]) => mockHistory(...args),
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
  mockHistory.mockReset().mockResolvedValue({ 1: 'v1-for-47' });
});

describe('GroupInviteMembers', () => {
  it('offers only people who are not in the group yet', async () => {
    renderControl();
    expect(await screen.findByRole('button', { name: /seed_user_2/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /already_in/ })).not.toBeInTheDocument();
  });

  it('invites the person picked, to this group, with its history, and says so', async () => {
    mockCreateInvite.mockResolvedValue({ id: 5 });
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: /seed_user_2/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('seed_user_2');
    expect(mockHistory).toHaveBeenCalledWith(9, 47);
    expect(mockCreateInvite).toHaveBeenCalledWith(9, { user_id: 47, history: { 1: 'v1-for-47' } });
  });

  it('says so when the invite fails', async () => {
    mockCreateInvite.mockRejectedValue(new Error('403'));
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: /seed_user_2/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to send invite');
  });

  // Someone invited earlier, then removed, was hidden from every later search
  // while the panel stayed open, so they could not be invited again.
  it('still offers someone who was invited before', async () => {
    mockCreateInvite.mockResolvedValue({ id: 5 });
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: /seed_user_2/ }));
    await screen.findByRole('status');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'seed' } });
    expect(await screen.findByRole('button', { name: /seed_user_2/ })).toBeInTheDocument();
  });

  it('invites the first match on Enter', async () => {
    mockCreateInvite.mockResolvedValue({ id: 5 });
    renderControl();
    await screen.findByRole('button', { name: /seed_user_2/ });

    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });

    await waitFor(() =>
      expect(mockCreateInvite).toHaveBeenCalledWith(9, { user_id: 47, history: { 1: 'v1-for-47' } })
    );
  });

  it('says why when the user is banned', async () => {
    mockCreateInvite.mockRejectedValue({ response: { data: { code: 'group_user_banned' } } });
    renderControl();
    fireEvent.click(await screen.findByRole('button', { name: /seed_user_2/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This user is banned from the group. Only an owner or admin can invite them back.'
    );
  });
});
