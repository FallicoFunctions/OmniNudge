import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorldSession } from '../useWorldSession';
import type { RuntimeSession } from '../../lib/session';
import type { RuntimeSettings } from '../../lib/settings';

const bootstrapSessionMock = vi.fn();
const saveRuntimeSettingsMock = vi.fn();
const openWorldSocketMock = vi.fn((_args?: unknown) => ({
  close: vi.fn(),
  moveToZone: vi.fn(),
  respawn: vi.fn(),
  sendChat: vi.fn(),
}));

vi.mock('../../lib/session', async () => {
  const actual = await vi.importActual<typeof import('../../lib/session')>('../../lib/session');
  return {
    ...actual,
    bootstrapSession: (...args: Parameters<typeof actual.bootstrapSession>) => bootstrapSessionMock(...args),
    saveRuntimeSettings: (...args: Parameters<typeof actual.saveRuntimeSettings>) => saveRuntimeSettingsMock(...args),
    saveReturnPoint: vi.fn(),
    saveLoadout: vi.fn(),
  };
});

vi.mock('../../lib/worldSocket', async () => {
  const actual = await vi.importActual<typeof import('../../lib/worldSocket')>('../../lib/worldSocket');
  return {
    ...actual,
    openWorldSocket: (...args: Parameters<typeof actual.openWorldSocket>) => openWorldSocketMock(...args),
  };
});

function createAccountSession(overrides?: Partial<RuntimeSession>): RuntimeSession {
  return {
    playerId: 'user-42',
    playerName: 'alice',
    worldSocketUrl: 'ws://localhost:8092/ws',
    sessionToken: 'runtime-token-1',
    mode: 'account',
    activeZone: 'main_stage',
    lastVenue: 'main_stage',
    settings: {
      uiTheme: 'Luminous Panels',
      graphicsMode: 'auto',
      graphicsLevel: 7,
      displayNames: true,
      chatCollapsed: false,
      crouchMode: 'hold',
      cameraFollow: 'free',
    },
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

describe('useWorldSession', () => {
  beforeEach(() => {
    bootstrapSessionMock.mockReset();
    saveRuntimeSettingsMock.mockReset();
    openWorldSocketMock.mockClear();
  });

  it('serializes runtime settings saves so the latest choice persists last', async () => {
    const firstSave = deferred<void>();
    const secondSave = deferred<void>();

    bootstrapSessionMock.mockResolvedValue(createAccountSession());
    saveRuntimeSettingsMock
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);

    const { result } = renderHook(() => useWorldSession());

    await waitFor(() => expect(result.current.session?.playerId).toBe('user-42'));

    const hybridSettings: RuntimeSettings = {
      ...result.current.settings,
      uiTheme: 'Hybrid Premium',
    };
    const obsidianSettings: RuntimeSettings = {
      ...result.current.settings,
      uiTheme: 'Obsidian Glass',
    };

    act(() => {
      result.current.updateSettings(hybridSettings);
      result.current.updateSettings(obsidianSettings);
    });

    expect(result.current.settings.uiTheme).toBe('Obsidian Glass');
    await waitFor(() => expect(saveRuntimeSettingsMock).toHaveBeenCalledTimes(1));
    expect(saveRuntimeSettingsMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        settings: hybridSettings,
      }),
    );

    firstSave.resolve();
    await waitFor(() => expect(saveRuntimeSettingsMock).toHaveBeenCalledTimes(2));
    expect(saveRuntimeSettingsMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        settings: obsidianSettings,
      }),
    );

    secondSave.resolve();
    await waitFor(() => expect(result.current.settings.uiTheme).toBe('Obsidian Glass'));
  });

  it('rolls back to the last persisted settings only when the latest queued save fails', async () => {
    const firstSave = deferred<void>();
    const secondSave = deferred<void>();

    bootstrapSessionMock.mockResolvedValue(createAccountSession());
    saveRuntimeSettingsMock
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);

    const { result } = renderHook(() => useWorldSession());

    await waitFor(() => expect(result.current.session?.playerId).toBe('user-42'));

    const persistedSettings: RuntimeSettings = {
      ...result.current.settings,
      uiTheme: 'Hybrid Premium',
    };
    const failingLatestSettings: RuntimeSettings = {
      ...result.current.settings,
      uiTheme: 'Obsidian Glass',
    };

    act(() => {
      result.current.updateSettings(persistedSettings);
    });
    firstSave.resolve();
    await waitFor(() => expect(saveRuntimeSettingsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.settings.uiTheme).toBe('Hybrid Premium'));

    act(() => {
      result.current.updateSettings(failingLatestSettings);
    });

    expect(result.current.settings.uiTheme).toBe('Obsidian Glass');

    secondSave.reject(new Error('backend rejected settings'));
    await waitFor(() => expect(result.current.settings.uiTheme).toBe('Hybrid Premium'));
    expect(result.current.session?.settings.uiTheme).toBe('Hybrid Premium');
    expect(result.current.error).toBe('backend rejected settings');
  });
});
