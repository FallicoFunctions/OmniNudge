import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OmniChatPersonaBlocksTab from '../OmniChatPersonaBlocksTab';
import type { AdminOmniChatPersonaBlock } from '../../../types/admin';

const mockList = vi.fn();
const mockOverturn = vi.fn();

vi.mock('../../../services/adminService', () => ({
  adminService: {
    listOmniChatPersonaBlocks: (...args: unknown[]) => mockList(...args),
    overturnOmniChatPersonaBlock: (...args: unknown[]) => mockOverturn(...args),
  },
}));

function block(overrides: Partial<AdminOmniChatPersonaBlock>): AdminOmniChatPersonaBlock {
  return {
    id: 1,
    persona_id: 9,
    user_id: 3,
    tier: 1,
    expires_at: new Date(Date.now() + 600000).toISOString(),
    reason: 'kept pushing after being told no',
    created_at: new Date().toISOString(),
    persona_name: 'Jesse',
    persona_slug: 'jesse',
    username: 'someone',
    in_force: true,
    ...overrides,
  };
}

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OmniChatPersonaBlocksTab />
    </QueryClientProvider>
  );
}

describe('OmniChatPersonaBlocksTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOverturn.mockResolvedValue(undefined);
  });

  // A queue of only-live blocks would never show a ten-minute one, and those
  // are the likeliest to have been unfair.
  it('lists blocks in every state and distinguishes them', async () => {
    mockList.mockResolvedValue({
      total: 3,
      blocks: [
        block({ id: 1, reason: 'kept going', tier: 4, expires_at: null, in_force: true }),
        block({ id: 2, reason: 'already lapsed', in_force: false }),
        block({
          id: 3,
          reason: 'misread a joke',
          in_force: false,
          overturned_at: new Date().toISOString(),
          overturn_note: 'not an offence',
        }),
      ],
    });

    renderTab();

    await waitFor(() => expect(screen.getAllByTestId('admin-persona-block')).toHaveLength(3));
    expect(screen.getByText('In force')).toBeInTheDocument();
    expect(screen.getByText('Lapsed')).toBeInTheDocument();
    expect(screen.getByText('Overturned')).toBeInTheDocument();
    expect(screen.getByText('Indefinite')).toBeInTheDocument();
    expect(screen.getByText(/not an offence/)).toBeInTheDocument();
  });

  it('sends the review note when overturning', async () => {
    mockList.mockResolvedValue({ total: 1, blocks: [block({ id: 7 })] });

    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /overturn/i }));
    fireEvent.change(screen.getByLabelText(/why was this unfair/i), {
      target: { value: 'this was not an offence' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Overturn' }));

    await waitFor(() => expect(mockOverturn).toHaveBeenCalledWith(7, 'this was not an offence'));
  });

  // An overturned block cannot be overturned again: a second reversal would
  // rewrite who reversed it and when.
  it('offers no overturn control on a block already reversed', async () => {
    mockList.mockResolvedValue({
      total: 1,
      blocks: [block({ id: 4, overturned_at: new Date().toISOString(), in_force: false })],
    });

    renderTab();

    await screen.findByTestId('admin-persona-block');
    expect(screen.queryByRole('button', { name: /overturn/i })).toBeNull();
  });
});
