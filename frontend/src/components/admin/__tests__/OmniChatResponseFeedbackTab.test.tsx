import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import OmniChatResponseFeedbackTab from '../OmniChatResponseFeedbackTab';
import { adminService } from '../../../services/adminService';

vi.mock('../../../services/adminService', () => ({ adminService: { listOmniChatResponseFeedback: vi.fn(), getOmniChatResponseFeedback: vi.fn(), updateOmniChatResponseFeedbackStatus: vi.fn() } }));

const renderTab = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OmniChatResponseFeedbackTab /></QueryClientProvider>);

describe('OmniChatResponseFeedbackTab', () => {
  it('filters a bounded queue, safely displays snapshots, and updates a selected item status', async () => {
    const feedback = {
      id: 'feedback-1',
      status: 'new' as const,
      reason: 'character_mismatch' as const,
      conversation_id: 3,
      message_id: 9,
      persona_id: 23,
      created_at: '2026-07-22T12:00:00Z',
      updated_at: '2026-07-22T12:00:00Z',
    };
    vi.mocked(adminService.listOmniChatResponseFeedback).mockResolvedValue({ feedback: [feedback], total: 1 });
    const detail = {
      ...feedback,
      note: 'Wrong voice',
      response_snapshot: '<script>unsafe</script>',
      prior_user_snapshot: 'Prior text',
      scene_state_snapshot: { setting: 'harbor' },
    };
    vi.mocked(adminService.getOmniChatResponseFeedback).mockResolvedValue({ feedback: detail });
    vi.mocked(adminService.updateOmniChatResponseFeedbackStatus).mockResolvedValue({ feedback: { ...detail, status: 'reviewed' } });
    renderTab();
    await screen.findByRole('button', { name: /character mismatch/i });
    expect(adminService.listOmniChatResponseFeedback).toHaveBeenCalledWith('new', undefined, 25, 0);
    fireEvent.click(screen.getByRole('button', { name: /character mismatch/i }));
    await waitFor(() => expect(adminService.getOmniChatResponseFeedback).toHaveBeenCalledWith('feedback-1'));
    await screen.findByText('Prior text');
    expect(document.querySelector('pre')).toHaveTextContent('<script>unsafe</script>');
    expect(screen.queryByRole('script')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^reviewed$/i }));
    await waitFor(() => expect(adminService.updateOmniChatResponseFeedbackStatus).toHaveBeenCalledWith('feedback-1', 'reviewed'));
  });

  it('resets paging when a reason filter changes', async () => {
    vi.mocked(adminService.listOmniChatResponseFeedback).mockResolvedValue({ feedback: [], total: 0 });
    renderTab();
    await screen.findByText(/no response feedback/i);
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'other' } });
    await waitFor(() => expect(adminService.listOmniChatResponseFeedback).toHaveBeenLastCalledWith('new', 'other', 25, 0));
  });
});
