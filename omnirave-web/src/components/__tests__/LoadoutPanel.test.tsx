import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoadoutPanel } from '../LoadoutPanel';

describe('LoadoutPanel', () => {
  it('submits edited loadout values through the runtime save callback', async () => {
    const onSave = vi.fn(async () => undefined);

    render(
      <LoadoutPanel
        session={{
          playerId: 'user-42',
          playerName: 'alice',
          worldSocketUrl: 'ws://localhost:8092/ws',
          mode: 'account',
          activeZone: 'main_stage',
          loadout: { hair: 'buzz', top: 'black_mesh' },
        }}
        onSaveLoadout={onSave}
        isSaving={false}
      />,
    );

    fireEvent.change(screen.getByLabelText(/^Hair$/i), { target: { value: 'braids' } });
    fireEvent.change(screen.getByLabelText(/^Top$/i), { target: { value: 'silver_jacket' } });
    fireEvent.click(screen.getByRole('button', { name: /Save to OmniNudge/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        hair: 'braids',
        top: 'silver_jacket',
      }),
    );
  }, 10000);
});
