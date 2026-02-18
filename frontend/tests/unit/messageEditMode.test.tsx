import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageEditMode } from '../../src/components/messages/MessageEditMode';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { time?: string }) => {
      if (key === 'messages.editing.timeLeft') return `Editable for ${options?.time}`;
      if (key === 'messages.editing.expired') return 'Edit window expired';
      if (key === 'messages.editing.errors.empty') return 'Message cannot be empty';
      if (key === 'messages.editing.errors.saveFailed') return 'Failed to save edits';
      if (key === 'messages.editing.saving') return 'Saving...';
      if (key === 'common.cancel') return 'Cancel';
      if (key === 'common.save') return 'Save';
      if (key === 'messages.editing.ariaInput') return 'Edit message text';
      return key;
    },
  }),
}));

describe('MessageEditMode', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('calls onSave with trimmed content', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <MessageEditMode
        initialContent="  hello world  "
        sentAt={new Date().toISOString()}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('hello world');
    });
  });

  it('shows validation error when content is empty', async () => {
    render(
      <MessageEditMode
        initialContent="text"
        sentAt={new Date().toISOString()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Edit message text'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Message cannot be empty');
  });

  it('shows save error when onSave throws', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('failed'));
    render(
      <MessageEditMode
        initialContent="hello"
        sentAt={new Date().toISOString()}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save edits');
  });

  it('disables save when edit window has expired', () => {
    const expiredSentAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    render(
      <MessageEditMode
        initialContent="hello"
        sentAt={expiredSentAt}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Edit window expired')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();
    render(
      <MessageEditMode
        initialContent="hello"
        sentAt={new Date().toISOString()}
        onSave={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
