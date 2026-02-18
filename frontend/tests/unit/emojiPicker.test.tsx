import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmojiPicker } from '../../src/components/messages/EmojiPicker';

describe('EmojiPicker', () => {
  it('renders 20+ emoji options when open', () => {
    render(
      <EmojiPicker
        isOpen
        isOwnMessage={false}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    const options = screen.getAllByRole('button', { name: /React with/i });
    expect(options.length).toBeGreaterThanOrEqual(20);
  });

  it('does not render when closed', () => {
    render(
      <EmojiPicker
        isOpen={false}
        isOwnMessage={false}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onSelect and onClose when emoji is clicked', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <EmojiPicker
        isOpen
        isOwnMessage={false}
        onClose={onClose}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'React with 👍' }));
    expect(onSelect).toHaveBeenCalledWith('👍');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports keyboard selection with Enter', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <EmojiPicker
        isOpen
        isOwnMessage={false}
        onClose={onClose}
        onSelect={onSelect}
      />
    );

    const first = screen.getByRole('button', { name: 'React with 👍' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const second = screen.getByRole('button', { name: 'React with ❤️' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('❤️');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <EmojiPicker
        isOpen
        isOwnMessage={false}
        onClose={onClose}
        onSelect={vi.fn()}
      />
    );

    const first = screen.getByRole('button', { name: 'React with 👍' });
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses fullscreen mobile-friendly base positioning', () => {
    render(
      <EmojiPicker
        isOpen
        isOwnMessage={false}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    const dialog = screen.getByRole('dialog', { name: 'Emoji picker' });
    expect(dialog.className).toContain('fixed inset-0');
  });
});

