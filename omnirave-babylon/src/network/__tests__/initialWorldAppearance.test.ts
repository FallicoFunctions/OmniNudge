import { expect, it, vi } from 'vitest';
import { createInitialWorldAppearance } from '../initialWorldAppearance';
import type { WorldSnapshot } from '../worldSocket';

const saved = { av: '1', cv: '1', cp: 'female', cw: '110111' };
const snapshot = (loadout = saved, mode: 'account' | 'guest' = 'account'): WorldSnapshot => ({
  players: [{ id:'me', playerName:'Me', mode, position:{x:0,y:1.65,z:0}, zone:'main_stage', loadout }],
  currentPlayerId:'me', activeZone:'main_stage', zoneMedia:[], zoneEvents:[],
});
const pending = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
};

it('restores the first saved snapshot before publishing and ignores repeated room snapshots', async () => {
  const load = pending(); const restore = vi.fn(() => load.promise); const publish = vi.fn();
  const appearance = createInitialWorldAppearance({ sessionAppearanceRestored:false, restore, publish });
  appearance.status('open'); expect(publish).not.toHaveBeenCalled();
  const original = snapshot(); const request = appearance.snapshot(original);
  original.players[0].loadout = { ...saved, cp:'male' };
  await appearance.snapshot(snapshot());
  expect(restore).toHaveBeenCalledTimes(1); expect(restore).toHaveBeenCalledWith(saved);
  expect(appearance.ready).toBe(false); expect(publish).not.toHaveBeenCalled();
  load.resolve(); await request;
  expect(appearance.ready).toBe(true); expect(publish).toHaveBeenCalledTimes(1);
});

it('retains locally changed wardrobe on reconnect instead of restoring the original token again', async () => {
  const restore = vi.fn(async () => {}); const publish = vi.fn();
  const appearance = createInitialWorldAppearance({ sessionAppearanceRestored:false, restore, publish });
  await appearance.snapshot(snapshot());
  appearance.status('closed'); expect(appearance.ready).toBe(false);
  appearance.status('connecting'); appearance.status('open');
  await appearance.snapshot(snapshot());
  expect(restore).toHaveBeenCalledTimes(1); expect(publish).toHaveBeenCalledTimes(2);
});

it('publishes after a slow restoration completes on a replacement connection', async () => {
  const load = pending(); const publish = vi.fn();
  const appearance = createInitialWorldAppearance({ sessionAppearanceRestored:false, restore:() => load.promise, publish });
  const request = appearance.snapshot(snapshot()); appearance.status('closed'); appearance.status('connecting');
  await appearance.snapshot(snapshot());
  expect(appearance.ready).toBe(true);
  load.resolve(); await request;
  expect(publish).toHaveBeenCalledTimes(2);
});

it('does not publish a slow result into a closed or disposed session', async () => {
  for (const stop of ['close', 'dispose']) {
    const load = pending(); const publish = vi.fn();
    const appearance = createInitialWorldAppearance({ sessionAppearanceRestored:false, restore:() => load.promise, publish });
    const request = appearance.snapshot(snapshot());
    if (stop === 'close') appearance.status('closed'); else appearance.dispose();
    load.resolve(); await request;
    expect(publish).not.toHaveBeenCalled(); expect(appearance.ready).toBe(false);
  }
});

it('waits for the local player and respects an already restored handoff', async () => {
  const restore = vi.fn(async () => {}); const publish = vi.fn();
  const appearance = createInitialWorldAppearance({ sessionAppearanceRestored:true, restore, publish });
  await appearance.snapshot({ ...snapshot(), players:[] }); expect(publish).not.toHaveBeenCalled();
  await appearance.snapshot(snapshot()); expect(publish).toHaveBeenCalledTimes(1); expect(restore).not.toHaveBeenCalled();
});

it('keeps a generated guest look unless its token explicitly carries a complete character', async () => {
  const restore = vi.fn(async () => {});
  const guest = createInitialWorldAppearance({ sessionAppearanceRestored:false, restore, publish:vi.fn() });
  await guest.snapshot(snapshot({ av:'1' } as typeof saved, 'guest')); expect(restore).not.toHaveBeenCalled();
  const complete = createInitialWorldAppearance({ sessionAppearanceRestored:false, restore, publish:vi.fn() });
  await complete.snapshot(snapshot(saved, 'guest')); expect(restore).toHaveBeenCalledWith(saved);
});
