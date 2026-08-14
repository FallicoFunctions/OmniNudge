import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ref } from 'react';
import type { BotPersona } from '../../../types/omnichat';
import CharacterRouletteButton, {
  getRouletteEligiblePersonas,
  pickRoulettePersona,
} from '../CharacterRouletteButton';

vi.mock('../PersonaAvatar', () => ({
  default: ({ persona, rootRef }: { persona: BotPersona; rootRef?: Ref<HTMLDivElement> }) => (
    <div ref={rootRef} data-testid={`roulette-avatar-${persona.id}`} />
  ),
}));

function persona(id: number, overrides: Partial<BotPersona> = {}): BotPersona {
  return {
    id,
    slug: `persona-${id}`,
    name: `Persona ${id}`,
    first_message: `Opening ${id}`,
    category: 'original',
    visibility: 'public',
    is_nsfw: false,
    is_active: true,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

describe('CharacterRouletteButton', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('limits roulette to active, public-safe personas with prepared openings', () => {
    const eligible = getRouletteEligiblePersonas([
      persona(1),
      persona(2, { owner_user_id: 7, visibility: 'private' }),
      persona(3, { is_nsfw: true }),
      persona(4, { is_active: false }),
      persona(5, { first_message: '   ' }),
      persona(6, { visibility: 'private' }),
      persona(7, { visibility: 'unlisted' }),
    ]);

    expect(eligible.map((item) => item.id)).toEqual([1]);
  });

  it('avoids immediately repeating the previous character when alternatives exist', () => {
    const selected = pickRoulettePersona([persona(1), persona(2), persona(3)], 1, () => 0);

    expect(selected?.id).toBe(2);
  });

  it('reveals the selected character before opening quick chat', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const onSelect = vi.fn();

    render(<CharacterRouletteButton personas={[persona(1), persona(2)]} onSelect={onSelect} />);

    const rouletteButton = screen.getByRole('button', { name: 'Surprise me' });
    rouletteButton.focus();
    fireEvent.click(rouletteButton);

    expect(screen.getByRole('button', { name: 'Shuffling...' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Shuffling...' })).toHaveFocus();
    const reveal = screen.getByTestId('character-roulette-reveal');
    expect(reveal).toHaveTextContent('Persona 1');
    expect(reveal).not.toHaveClass('pointer-events-none');
    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.queryByTestId('character-roulette-reveal')).not.toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.any(HTMLElement),
      expect.any(HTMLElement)
    );
  });

  it('skips the animated reveal when reduced motion is preferred', () => {
    const onSelect = vi.fn();

    render(<CharacterRouletteButton personas={[persona(1)]} onSelect={onSelect} reduceMotion />);

    fireEvent.click(screen.getByRole('button', { name: 'Surprise me' }));

    expect(screen.queryByTestId('character-roulette-reveal')).not.toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });
});
