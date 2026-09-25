import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GroupDetailsSidebar, muteTimeLeft } from '../GroupDetailsSidebar';
import { adminGroupsService } from '../../../services/adminGroupsService';
import type { Conversation } from '../../../types/messages';

const NOW = new Date('2026-09-25T12:00:00Z').getTime();

vi.mock('../../../hooks/useGroupConversation', () => ({
  useGroupConversation: () => ({
    participants: [
      { user_id: 7, username: 'DERRF', role: 'owner' },
      { user_id: 8, username: 'TestUser', role: 'member' },
      { user_id: 9, username: 'seed_user_1', role: 'member' },
    ],
    loadingParticipants: false,
    settings: undefined,
    currentUserRole: 'owner',
    isAdmin: true,
    isOwner: true,
    removeParticipant: vi.fn(),
    changeRole: vi.fn(),
    updateGroup: vi.fn(),
    updateSettings: vi.fn(),
    leaveGroup: vi.fn(),
    isLeavingGroup: false,
    isUpdatingGroup: false,
    isUpdatingSettings: false,
  }),
}));

vi.mock('../../../services/adminGroupsService', () => ({
  adminGroupsService: {
    getRestrictions: vi.fn(async () => [
      {
        id: 1,
        conversation_id: 47,
        user_id: 8,
        restriction_type: 'mute',
        expires_at: new Date(NOW + 125 * 60_000).toISOString(),
      },
    ]),
    unmuteUser: vi.fn(async () => undefined),
    muteUser: vi.fn(),
    banUser: vi.fn(),
    setSlowMode: vi.fn(),
  },
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPanel() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GroupDetailsSidebar
        conversation={{ id: 47, conversation_type: 'group', group_name: 'Test' } as Conversation}
        currentUserId={7}
        onClose={vi.fn()}
        searchUsers={async () => []}
      />
    </QueryClientProvider>
  );
}

describe('the member menu of a muted member', () => {
  // A muted member's menu offered Mute again, with no way to undo it and no
  // sign of how long it had left.
  it('offers Unmute with the time left, counting down by the minute', async () => {
    renderPanel();
    await vi.waitFor(() => expect(adminGroupsService.getRestrictions).toHaveBeenCalled());
    // The owner's own row has no menu: TestUser's comes first.
    const [mutedMenu] = screen.getAllByRole('button', { name: 'Participant actions' });

    fireEvent.click(mutedMenu);
    const unmute = await screen.findByRole('button', { name: /Unmute/ });
    expect(unmute).toHaveTextContent('2h 5m left');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('button', { name: /Unmute/ })).toHaveTextContent('2h 4m left');

    fireEvent.click(screen.getByRole('button', { name: /Unmute/ }));
    await vi.waitFor(() => expect(adminGroupsService.unmuteUser).toHaveBeenCalledWith(47, 8));
  });

  it('offers Mute to a member who is not muted', async () => {
    renderPanel();
    await vi.waitFor(() => expect(adminGroupsService.getRestrictions).toHaveBeenCalled());
    const [, notMuted] = screen.getAllByRole('button', { name: 'Participant actions' });

    fireEvent.click(notMuted);

    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unmute/ })).not.toBeInTheDocument();
  });
});

describe('muteTimeLeft', () => {
  it.each([
    [12, '12m'],
    [60, '1h 0m'],
    [125, '2h 5m'],
    [1440 * 3 + 240, '3d 4h'],
  ])('reads %i minutes as %s', (minutes, expected) => {
    expect(muteTimeLeft(new Date(NOW + minutes * 60_000).toISOString(), NOW)).toBe(expected);
  });
});
