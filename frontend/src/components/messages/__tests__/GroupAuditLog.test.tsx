import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GroupAuditLog } from '../GroupAuditLog';

vi.mock('../../../services/adminGroupsService', () => ({
  adminGroupsService: {
    getAuditLog: vi.fn(async () => ({
      audit_log: [
        {
          id: 1,
          conversation_id: 47,
          admin_username: 'DERRF',
          action_type: 'ban_member',
          target_username: 'seed_user_2',
          details: { reason: 'spam', delete_messages: true },
          created_at: '2026-09-24T20:00:00Z',
        },
        {
          id: 2,
          conversation_id: 47,
          admin_username: 'DERRF',
          action_type: 'mute_member',
          target_username: 'TestUser',
          details: { reason: '', duration_minutes: 1440 },
          created_at: '2026-09-24T20:01:00Z',
        },
        {
          id: 4,
          conversation_id: 47,
          admin_username: 'DERRF',
          action_type: 'unban_member',
          target_username: 'seed_user_2',
          details: { via: 'invite' },
          created_at: '2026-09-24T20:03:00Z',
        },
        {
          id: 3,
          conversation_id: 47,
          admin_username: 'DERRF',
          action_type: 'set_slow_mode',
          target_username: null,
          details: { seconds: 0 },
          created_at: '2026-09-24T20:02:00Z',
        },
      ],
      next_cursor: null,
    })),
  },
}));

function renderLog() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GroupAuditLog conversationId={47} />
    </QueryClientProvider>
  );
}

describe('GroupAuditLog', () => {
  // The details column printed the stored JSON, {"reason":"spam",...}.
  it('shows what each action saved as readable text', async () => {
    renderLog();
    expect(
      await screen.findByText('Reason: spam · Their messages were deleted')
    ).toBeInTheDocument();
    expect(screen.getByText('For 1 day')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByText('Lifted by inviting them back')).toBeInTheDocument();
    expect(screen.queryByText(/"reason"/)).not.toBeInTheDocument();
  });

  it('shows the raw details when asked', async () => {
    renderLog();
    await screen.findByText('Reason: spam · Their messages were deleted');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show raw details' }));

    expect(screen.getByText('{"reason":"spam","delete_messages":true}')).toBeInTheDocument();
    expect(
      screen.queryByText('Reason: spam · Their messages were deleted')
    ).not.toBeInTheDocument();
  });
});
