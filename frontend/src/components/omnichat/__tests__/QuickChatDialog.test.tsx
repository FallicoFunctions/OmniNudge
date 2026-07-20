import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuickChatDialog from '../QuickChatDialog';
import type { BotPersona } from '../../../types/omnichat';

const { mockSendPreviewMessage } = vi.hoisted(() => ({
  mockSendPreviewMessage: vi.fn(),
}));

vi.mock('../../../services/omnichatService', () => ({
  omnichatService: {
    sendPreviewMessage: (...args: unknown[]) => mockSendPreviewMessage(...args),
  },
}));

vi.mock('../PersonaAvatar', () => ({
  default: ({ persona }: { persona: BotPersona }) => <div data-testid={`avatar-${persona.id}`} />,
}));

const persona: BotPersona = {
  id: 12,
  slug: 'archivist',
  name: 'The Archivist',
  description: 'Keeper of a strange library.',
  first_message: '*Closes a heavy book.* You are late.',
  category: 'roleplay',
  visibility: 'public',
  is_nsfw: false,
  is_active: true,
  created_at: '2026-07-01T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
};

describe('QuickChatDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendPreviewMessage.mockResolvedValue({
      role: 'assistant',
      content: 'Late is still better than absent.',
      failed: false,
    });
  });

  it('shows the prepared opening without calling the model, then hands off the complete preview', async () => {
    const onContinue = vi.fn().mockResolvedValue(undefined);

    render(
      <QuickChatDialog
        isOpen
        persona={persona}
        onClose={vi.fn()}
        onContinue={onContinue}
      />
    );

    expect(screen.getByText(/You are late/)).toBeInTheDocument();
    expect(mockSendPreviewMessage).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Reply to The Archivist'), {
      target: { value: 'Traffic in the mortal realm.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

    await waitFor(() => {
      expect(mockSendPreviewMessage).toHaveBeenCalledWith({
        persona_id: 12,
        content: 'Traffic in the mortal realm.',
        history: [{ role: 'assistant', content: '*Closes a heavy book.* You are late.' }],
      });
    });
    expect(await screen.findByText('Late is still better than absent.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue chatting' }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    expect(onContinue.mock.calls[0][0]).toEqual([
      expect.objectContaining({ role: 'assistant', content: '*Closes a heavy book.* You are late.' }),
      expect.objectContaining({ role: 'user', content: 'Traffic in the mortal realm.' }),
      expect.objectContaining({ role: 'assistant', content: 'Late is still better than absent.' }),
    ]);
  });

  it('keeps a failed preview retryable and does not allow continuation', async () => {
    mockSendPreviewMessage.mockResolvedValueOnce({
      role: 'assistant',
      content: 'Temporary generation failure.',
      failed: true,
    });
    const onContinue = vi.fn().mockResolvedValue(undefined);

    render(
      <QuickChatDialog
        isOpen
        persona={persona}
        onClose={vi.fn()}
        onContinue={onContinue}
      />
    );

    fireEvent.change(screen.getByLabelText('Reply to The Archivist'), {
      target: { value: 'Hello?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue chatting' })).not.toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();

    mockSendPreviewMessage.mockResolvedValueOnce({
      role: 'assistant',
      content: 'There you are.',
      failed: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('There you are.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue chatting' })).toBeInTheDocument();
  });

  it('does not steal focus from the reply field as controlled input state changes', () => {
    render(
      <QuickChatDialog
        isOpen
        persona={persona}
        onClose={vi.fn()}
        onContinue={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const reply = screen.getByLabelText('Reply to The Archivist');
    reply.focus();
    fireEvent.change(reply, { target: { value: 'Still typing' } });

    expect(reply).toHaveFocus();
  });

  it('cannot be dismissed while a conversation handoff is pending', async () => {
    let finishContinue: (() => void) | undefined;
    const onContinue = vi.fn(
      () => new Promise<void>((resolve) => {
        finishContinue = resolve;
      })
    );
    const onClose = vi.fn();

    render(
      <QuickChatDialog
        isOpen
        persona={persona}
        onClose={onClose}
        onContinue={onContinue}
      />
    );

    fireEvent.change(screen.getByLabelText('Reply to The Archivist'), {
      target: { value: 'Open the door.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByText('Late is still better than absent.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue chatting' }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));

    const closeButton = screen.getByRole('button', { name: 'Close quick chat' });
    expect(closeButton).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(closeButton);
    expect(onClose).not.toHaveBeenCalled();

    finishContinue?.();
  });
});
