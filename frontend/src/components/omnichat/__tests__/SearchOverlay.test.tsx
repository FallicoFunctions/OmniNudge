import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SearchOverlay from '../SearchOverlay';
import type { BotPersona } from '../../../types/omnichat';

vi.mock('../PersonaAvatar', () => ({
  default: () => <div data-testid="persona-avatar" />,
}));

const persona: BotPersona = {
  id: 1,
  slug: 'archivist',
  name: 'The Archivist',
  description: 'Keeper of a strange library.',
  first_message: 'You are late.',
  category: 'roleplay',
  visibility: 'public',
  is_nsfw: false,
  is_active: true,
  created_at: '2026-07-01T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
};

function SearchHarness() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open character search
      </button>
      <SearchOverlay
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        personas={[persona]}
        onSelectPersona={vi.fn()}
      />
    </>
  );
}

describe('SearchOverlay', () => {
  it('traps focus, closes with Escape, restores focus, and restores body scrolling', () => {
    document.body.style.overflow = 'clip';
    render(<SearchHarness />);
    const trigger = screen.getByRole('button', { name: 'Open character search' });

    trigger.focus();
    fireEvent.click(trigger);
    const searchInput = screen.getByPlaceholderText('Search personas...');
    expect(searchInput).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');

    const closeButton = screen.getByRole('button', { name: 'Close search' });
    closeButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(searchInput).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('clip');
    document.body.style.overflow = '';
  });
});
