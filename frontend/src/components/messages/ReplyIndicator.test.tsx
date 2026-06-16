import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReplyIndicator } from './ReplyIndicator';

describe('ReplyIndicator', () => {
  it('renders replying context with username and preview', () => {
    render(
      <ReplyIndicator parentUsername="alice" parentPreview="Original preview" deleted={false} />
    );

    expect(screen.getByText('Replying to @alice:')).toBeInTheDocument();
    expect(screen.getByText('"Original preview"')).toBeInTheDocument();
  });

  it('renders deleted state when parent is unavailable', () => {
    render(<ReplyIndicator deleted={true} />);
    expect(screen.getByText('"Deleted"')).toBeInTheDocument();
  });

  it('invokes jump callback when clicked', async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();

    render(
      <ReplyIndicator parentUsername="alice" parentPreview="Preview" onJumpToOriginal={onJump} />
    );

    await user.click(screen.getByRole('button', { name: 'Open original message' }));
    expect(onJump).toHaveBeenCalledTimes(1);
  });
});
