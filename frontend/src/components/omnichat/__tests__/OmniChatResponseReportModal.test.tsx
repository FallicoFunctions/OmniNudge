import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import OmniChatResponseReportModal from '../OmniChatResponseReportModal';

describe('OmniChatResponseReportModal', () => {
  it('submits a categorized report with an optional trimmed note', () => {
    const onSubmit = vi.fn();
    render(
      <OmniChatResponseReportModal
        isOpen
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /confused who did or owned something/i }));
    fireEvent.change(screen.getByLabelText(/optional note/i), {
      target: { value: '  It decided my action.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      reason: 'role_ownership',
      note: 'It decided my action.',
    });
  });

  it('requires a reason and exposes submission errors accessibly', () => {
    render(
      <OmniChatResponseReportModal
        isOpen
        isSubmitting={false}
        error="Could not submit the report."
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /submit report/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not submit the report.');
  });

  it('does not include response content or internal configuration in its interface', () => {
    render(
      <OmniChatResponseReportModal
        isOpen
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.queryByText(/prompt|model|provider|response text/i)).not.toBeInTheDocument();
  });
});
